// Armazenamento permanente: grava os dados num arquivo dentro de uma pasta escolhida pelo usuário
// (ex.: Documentos\Estudos\dados, que fica no OneDrive). Usa a File System Access API (Chrome/Edge).
//
//   pasta/
//     controle-estudos.json            <- dados atuais, regravado a cada alteração
//     backups/controle-estudos-AAAA-MM-DD.json  <- 1 cópia por dia (estado do início do dia), últimas 30
//
// O localStorage continua como cópia rápida; ao conectar, vale a versão mais recente (arquivo ou navegador).
var Armazenamento = (function () {
  var ARQUIVO = 'controle-estudos.json';
  var PASTA_BACKUPS = 'backups';
  var MANTER_BACKUPS = 30;
  var ESPERA_MS = 600;

  var suportado = typeof window.showDirectoryPicker === 'function';
  var pasta = null;
  // 'iniciando' | 'sem-suporte' | 'nao-configurado' | 'precisa-permissao' | 'conectado' | 'erro'
  var estado = suportado ? 'iniciando' : 'sem-suporte';
  var ultimoSalvo = null;
  var mensagemErro = '';
  var pendente = false;
  var timer = null;
  var fila = Promise.resolve();
  var ouvintes = [];

  function notificar() { ouvintes.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function aoMudar(f) { ouvintes.push(f); }

  // ---------- IndexedDB: lembra a pasta escolhida entre uma abertura e outra ----------
  function idb(modo, operacao) {
    return new Promise(function (ok, falha) {
      var req = indexedDB.open('controle-estudos', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('chaves'); };
      req.onerror = function () { falha(req.error); };
      req.onsuccess = function () {
        var tx = req.result.transaction('chaves', modo);
        var r = operacao(tx.objectStore('chaves'));
        tx.oncomplete = function () { ok(r && r.result); };
        tx.onerror = function () { falha(tx.error); };
      };
    });
  }
  function lerPastaSalva() { return idb('readonly', function (st) { return st.get('pasta'); }); }
  function guardarPasta(h) { return idb('readwrite', function (st) { return st.put(h, 'pasta'); }); }

  // ---------- Arquivos ----------
  function lerArquivo() {
    return pasta.getFileHandle(ARQUIVO).then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); })
      .catch(function (e) { if (e.name === 'NotFoundError') return null; throw e; });
  }

  function escrever(dir, nome, texto) {
    return dir.getFileHandle(nome, { create: true }).then(function (fh) { return fh.createWritable(); })
      .then(function (w) { return w.write(texto).then(function () { return w.close(); }); });
  }

  // Cópia do dia: criada só se ainda não existe (guarda o estado do início do dia) e apaga as mais antigas.
  function backupDiario(texto) {
    var nome = 'controle-estudos-' + UI.hoje() + '.json';
    return pasta.getDirectoryHandle(PASTA_BACKUPS, { create: true }).then(function (dir) {
      return dir.getFileHandle(nome).then(function () { return dir; }, function (e) {
        if (e.name !== 'NotFoundError') throw e;
        return escrever(dir, nome, texto).then(function () { return dir; });
      });
    }).then(function (dir) {
      return listarBackups(dir).then(function (nomes) {
        return Promise.all(nomes.slice(0, Math.max(0, nomes.length - MANTER_BACKUPS)).map(function (n) { return dir.removeEntry(n); }));
      });
    });
  }

  function listarBackups(dir) {
    var nomes = [];
    var it = dir.values();
    function proximo() {
      return it.next().then(function (r) {
        if (r.done) return nomes.sort();
        if (r.value.kind === 'file' && /^controle-estudos-\d{4}-\d{2}-\d{2}\.json$/.test(r.value.name)) nomes.push(r.value.name);
        return proximo();
      });
    }
    return proximo();
  }

  function quantidadeBackups() {
    if (!pasta || estado !== 'conectado') return Promise.resolve(null);
    return pasta.getDirectoryHandle(PASTA_BACKUPS).then(listarBackups).then(function (n) { return n.length; }, function () { return 0; });
  }

  // ---------- Fluxo ----------
  function falhar(e, novoEstado) {
    console.error(e);
    estado = novoEstado || 'erro';
    mensagemErro = e && e.message ? e.message : String(e);
    notificar();
  }

  // Ao conectar: se o arquivo for mais recente (ou o navegador estiver vazio), carrega dele;
  // senão, grava os dados do navegador no arquivo. Arquivo ilegível nunca é sobrescrito.
  function sincronizar() {
    return lerArquivo().then(function (texto) {
      if (texto) {
        var doArquivo;
        try { doArquivo = JSON.parse(texto); } catch (e) {
          throw new Error('O arquivo ' + ARQUIVO + ' está ilegível. Ele não foi alterado; restaure uma cópia da pasta "backups".');
        }
        if (!doArquivo || !Array.isArray(doArquivo.disciplinas)) throw new Error('O arquivo ' + ARQUIVO + ' não parece ser deste programa.');
        if (Dados.semDados() || (doArquivo.atualizadoEm || 0) >= (Dados.db.atualizadoEm || 0)) {
          Dados.substituir(doArquivo, 'arquivo');
          estado = 'conectado';
          ultimoSalvo = doArquivo.atualizadoEm || Date.now();
          notificar();
          if (window.App) App.atualizar();
          return backupDiario(Dados.exportar());
        }
      }
      estado = 'conectado';
      return gravarAgora();
    }).catch(function (e) { falhar(e); });
  }

  function usarPasta(h) {
    pasta = h;
    return guardarPasta(h).catch(function (e) { console.warn('Não foi possível lembrar a pasta', e); }).then(sincronizar);
  }

  function escolherPasta() {
    if (!suportado) return Promise.resolve();
    return window.showDirectoryPicker({ id: 'controle-estudos-dados', mode: 'readwrite', startIn: 'documents' })
      .then(usarPasta)
      .catch(function (e) { if (e.name !== 'AbortError') falhar(e); });
  }

  function reconectar() {
    if (!pasta) return escolherPasta();
    return pasta.requestPermission({ mode: 'readwrite' }).then(function (p) {
      if (p === 'granted') return sincronizar();
      estado = 'precisa-permissao';
      notificar();
    }).catch(function (e) { falhar(e, 'precisa-permissao'); });
  }

  function gravarAgora() {
    clearTimeout(timer);
    if (estado !== 'conectado' || !pasta) return Promise.resolve();
    fila = fila.then(function () {
      var texto = Dados.exportar();
      return escrever(pasta, ARQUIVO, texto).then(function () { return backupDiario(texto); }).then(function () {
        pendente = false;
        ultimoSalvo = Date.now();
        notificar();
      });
    }).catch(function (e) {
      // Permissão revogada (ex.: navegador reiniciado) ou pasta removida.
      falhar(e, e && e.name === 'NotAllowedError' ? 'precisa-permissao' : 'erro');
    });
    return fila;
  }

  function agendar() {
    if (estado !== 'conectado') return;
    pendente = true;
    notificar();
    clearTimeout(timer);
    timer = setTimeout(gravarAgora, ESPERA_MS);
  }

  function iniciar() {
    if (!suportado) { notificar(); return; }
    lerPastaSalva().then(function (h) {
      if (!h) { estado = 'nao-configurado'; notificar(); return; }
      pasta = h;
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') return sincronizar();
        estado = 'precisa-permissao';
        notificar();
      });
    }).catch(function (e) { console.error(e); estado = 'nao-configurado'; notificar(); });
  }

  // Avisa antes de fechar se ainda há alteração sendo gravada.
  window.addEventListener('beforeunload', function (e) {
    if (pendente && estado === 'conectado') { gravarAgora(); e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- Indicador no topo ----------
  // Com a nuvem ligada, o topo mostra a nuvem e a pasta vira cópia extra (sem avisos insistentes).
  function nuvemManda() { return window.Nuvem && Nuvem.ativa(); }

  function desenharIndicador() {
    var caixa = document.getElementById('status-dados');
    if (!caixa || nuvemManda()) return;
    var el = UI.el;
    caixa.innerHTML = '';
    var n;
    if (estado === 'conectado') {
      n = el('a', { href: '#/backup', class: 'status-dados ok' + (pendente ? ' salvando' : ''),
        title: 'Dados gravados em "' + pasta.name + '\\' + ARQUIVO + '"' + (ultimoSalvo ? ' · último salvamento às ' + new Date(ultimoSalvo).toLocaleTimeString('pt-BR') : '') },
        [el('span', { class: 'status-ponto' }), pendente ? 'Salvando…' : 'Salvo na pasta']);
    } else if (estado === 'precisa-permissao') {
      n = el('button', { type: 'button', class: 'status-dados atencao', title: 'O navegador pede sua permissão para gravar na pasta de dados', onclick: reconectar },
        [el('span', { class: 'status-ponto' }), 'Conectar pasta de dados']);
    } else if (estado === 'nao-configurado') {
      n = el('button', { type: 'button', class: 'status-dados atencao', title: 'Escolha onde salvar seus dados (ex.: Documentos\\Estudos\\dados)', onclick: escolherPasta },
        [el('span', { class: 'status-ponto' }), 'Escolher pasta de dados']);
    } else if (estado === 'erro') {
      n = el('a', { href: '#/backup', class: 'status-dados erro', title: mensagemErro }, [el('span', { class: 'status-ponto' }), 'Erro ao salvar']);
    } else if (estado === 'sem-suporte') {
      n = el('a', { href: '#/backup', class: 'status-dados erro', title: 'Este navegador não permite gravar em pasta. Use o Chrome ou o Edge.' },
        [el('span', { class: 'status-ponto' }), 'Só no navegador']);
    }
    if (n) caixa.appendChild(n);
  }
  aoMudar(desenharIndicador);

  // Faixa de aviso acima do conteúdo enquanto os dados não estiverem indo para a pasta.
  function desenharAviso() {
    var caixa = document.getElementById('aviso-dados');
    if (!caixa || nuvemManda()) return;
    var el = UI.el;
    caixa.innerHTML = '';
    var texto, botao;
    if (estado === 'nao-configurado') {
      texto = 'Seus dados estão só neste navegador. Escolha uma pasta (sugestão: Documentos\\Estudos\\dados) para salvá-los automaticamente em arquivo.';
      botao = UI.botao('Escolher pasta de dados', escolherPasta, 'btn-primario');
    } else if (estado === 'precisa-permissao') {
      texto = 'Clique em "Conectar" e permita o acesso para continuar salvando seus dados na pasta "' + (pasta ? pasta.name : '') + '".';
      botao = UI.botao('Conectar', reconectar, 'btn-primario');
    } else if (estado === 'erro') {
      texto = 'Não foi possível gravar na pasta de dados: ' + mensagemErro;
      botao = UI.botao('Tentar de novo', reconectar, 'btn-secundario');
    } else {
      return;
    }
    caixa.appendChild(el('div', { class: 'aviso-dados' + (estado === 'erro' ? ' erro' : '') }, [UI.icone('alerta'), el('span', { text: texto }), botao]));
  }
  aoMudar(desenharAviso);

  return {
    iniciar: iniciar, agendar: agendar, gravarAgora: gravarAgora,
    escolherPasta: escolherPasta, reconectar: reconectar, usarPasta: usarPasta, aoMudar: aoMudar,
    quantidadeBackups: quantidadeBackups,
    conectado: function () { return estado === 'conectado'; },
    info: function () {
      return { estado: estado, suportado: suportado, nomePasta: pasta ? pasta.name : null, ultimoSalvo: ultimoSalvo, pendente: pendente, erro: mensagemErro, arquivo: ARQUIVO };
    }
  };
})();
