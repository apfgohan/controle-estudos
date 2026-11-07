// Aba "Backup": exportar, importar e apagar os dados.
var Backup = (function () {
  var el = UI.el;

  // O arquivo leva também os resumos (guardados à parte), no campo "resumos".
  function exportar() {
    ResumosDados.exportarTodos().then(function (resumos) {
      var dados = JSON.parse(Dados.exportar());
      dados.resumos = resumos;
      baixar(JSON.stringify(dados, null, 2));
    });
  }

  function baixar(texto) {
    var blob = new Blob([texto], { type: 'application/json' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'controle-estudos-backup-' + UI.hoje() + '.json' });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function importar(arquivo) {
    if (!arquivo) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      UI.confirmar('Importar "' + arquivo.name + '"? Os dados atuais serão substituídos pelos do arquivo.', function () {
        try {
          var dados = JSON.parse(leitor.result);
          var resumos = dados && Array.isArray(dados.resumos) ? dados.resumos : null;
          if (dados) delete dados.resumos; // os resumos não entram nos dados principais
          Dados.importar(JSON.stringify(dados));
          // Backup antigo, sem o campo "resumos", mantém os resumos atuais.
          (resumos ? ResumosDados.importarTodos(resumos) : Promise.resolve()).then(function () {
            UI.aviso(resumos ? 'Backup importado, com ' + resumos.length + (resumos.length === 1 ? ' resumo' : ' resumos') : 'Backup importado');
            App.atualizar();
          }).catch(function (e) { alert('Os dados foram importados, mas os resumos não: ' + e.message); });
        } catch (e) {
          alert('Não foi possível importar: ' + e.message);
        }
      }, 'Importar');
    };
    leitor.readAsText(arquivo);
  }

  function render(raiz) {
    var db = Dados.db;
    var entrada = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: function () { importar(entrada.files[0]); entrada.value = ''; } });

    raiz.appendChild(el('div', { class: 'pagina-topo' }, el('div', null, [
      el('h1', { class: 'pagina-titulo', text: 'Backup' }),
      el('div', { class: 'pagina-subtitulo', text: 'Onde seus dados ficam salvos e cópias de segurança.' })
    ])));

    raiz.appendChild(painelNuvem());
    raiz.appendChild(painelPasta());

    raiz.appendChild(el('h2', { class: 'secao-titulo titulo-manual', text: 'Backup manual' }));
    raiz.appendChild(el('section', { class: 'painel grade-backup' }, [
      el('div', { class: 'opcao-backup' }, [
        el('h2', { class: 'secao-titulo', text: 'Exportar' }),
        el('p', { text: 'Baixa um arquivo .json com tudo: ' + db.disciplinas.length + ' disciplinas, ' + db.topicos.length + ' tópicos, ' + db.sessoes.length + ' sessões.' }),
        UI.botao('Exportar backup', exportar, 'btn-primario')
      ]),
      el('div', { class: 'opcao-backup' }, [
        el('h2', { class: 'secao-titulo', text: 'Importar' }),
        el('p', { text: 'Restaura um backup exportado antes. Substitui os dados atuais.' }),
        UI.botao('Escolher arquivo…', function () { entrada.click(); }, 'btn-contorno'),
        entrada
      ]),
      el('div', { class: 'opcao-backup' }, [
        el('h2', { class: 'secao-titulo', text: 'Apagar tudo' }),
        el('p', { text: 'Remove todos os dados (no navegador e no arquivo da pasta). As cópias diárias da pasta "backups" são mantidas.' }),
        UI.botao('Apagar todos os dados', function () {
          UI.confirmar('Apagar TODOS os dados? O arquivo da pasta de dados também será esvaziado (as cópias diárias em "backups" continuam lá).', function () { Dados.limpar(); App.atualizar(); UI.aviso('Dados apagados'); }, 'Apagar tudo');
        }, 'btn-perigo')
      ])
    ]));
  }

  function painelNuvem() {
    var n = Nuvem.info();
    var linhas = [], acoes = [], classe = 'ok';
    if (!n.ativa) {
      classe = 'atencao';
      linhas.push(el('p', { class: 'pasta-estado', text: 'Nuvem desligada neste aparelho' }));
      linhas.push(el('p', { text: window.FIREBASE_CONFIG && !Nuvem.pelaWeb
        ? 'O programa foi aberto direto do arquivo (index.html). Para usar a nuvem, abra pelo endereço do site.'
        : window.FIREBASE_CONFIG
        ? 'Não foi possível carregar o Firebase (sem internet?). Os dados ficam neste aparelho e vão para a nuvem quando você abrir o programa com internet.'
        : 'O Firebase ainda não foi configurado (arquivo js/firebase-config.js). Enquanto isso, os dados ficam só neste aparelho e na pasta de dados.' }));
    } else if (n.estado === 'entrar') {
      classe = 'atencao';
      linhas.push(el('p', { class: 'pasta-estado', text: 'Você não entrou na sua conta' }));
      acoes.push(UI.botao('Entrar com Google', Nuvem.entrar, 'btn-primario'));
    } else if (n.estado === 'negado') {
      classe = 'erro';
      var regras = el('textarea', { class: 'regras-nuvem', rows: 12, readonly: true, value: Nuvem.regrasSugeridas(n.uid) });
      linhas.push(el('p', { class: 'pasta-estado', text: '⚠ A nuvem recusou o acesso da conta ' + n.email }));
      linhas.push(el('p', { text: 'Se esta é a sua conta, libere-a nas regras do banco: no console do Firebase, abra Realtime Database → Regras, apague o que estiver lá, cole o texto abaixo e clique em Publicar. Depois recarregue esta página.' }));
      linhas.push(regras);
      acoes.push(UI.botao('Copiar regras', function () {
        regras.select();
        (navigator.clipboard ? navigator.clipboard.writeText(regras.value) : Promise.reject()).then(function () { UI.aviso('Regras copiadas'); }, function () { document.execCommand('copy'); UI.aviso('Regras copiadas'); });
      }, 'btn-primario'));
      acoes.push(UI.botao('Sair desta conta', Nuvem.sair, 'btn-contorno'));
    } else {
      if (n.estado === 'offline') classe = 'atencao';
      if (n.estado === 'erro') classe = 'erro';
      var textos = { sincronizado: '✓ Sincronizado com a nuvem', offline: 'Sem internet: as alterações vão para a nuvem quando a conexão voltar', conectando: 'Conectando…', erro: '⚠ ' + n.erro };
      linhas.push(el('p', { class: 'pasta-estado', text: textos[n.estado] || n.estado }));
      linhas.push(el('p', { text: 'Conta: ' + n.email + (n.ultimoSalvo ? ' · última sincronização: ' + new Date(n.ultimoSalvo).toLocaleString('pt-BR') : '') }));
      acoes.push(UI.botao('Sincronizar agora', function () { Nuvem.gravarAgora().then(function () { UI.aviso('Dados enviados para a nuvem'); }); }, 'btn-secundario'));
      acoes.push(UI.botao('Sair da conta', Nuvem.sair, 'btn-contorno'));
    }
    return el('section', { class: 'painel painel-pasta ' + classe }, [
      el('h2', { class: 'secao-titulo', text: 'Nuvem' }),
      el('div', { class: 'pasta-info' }, linhas),
      acoes.length ? el('div', { class: 'pasta-acoes' }, acoes) : null,
      el('p', { class: 'campo-ajuda', text: 'Com a nuvem, os dados ficam iguais em todos os aparelhos em que você entrar com a mesma conta. Vale sempre a alteração mais recente; evite editar em dois aparelhos ao mesmo tempo.' })
    ]);
  }

  function painelPasta() {
    var info = Armazenamento.info();
    var linhas = [], acoes = [];
    var classe = 'ok';

    if (!info.suportado) {
      classe = 'erro';
      linhas.push(el('p', { class: 'pasta-estado', text: '⚠ Este navegador não permite salvar em pasta.' }));
      linhas.push(el('p', { text: 'Abra o programa no Google Chrome ou no Microsoft Edge para salvar automaticamente em arquivo. Enquanto isso, os dados ficam só neste navegador: exporte backups manuais com frequência.' }));
    } else if (info.estado === 'conectado') {
      linhas.push(el('p', { class: 'pasta-estado', text: '✓ Salvando automaticamente na pasta "' + info.nomePasta + '"' }));
      linhas.push(el('p', { text: 'Arquivo: ' + info.nomePasta + '\\' + info.arquivo + (info.ultimoSalvo ? ' · último salvamento: ' + new Date(info.ultimoSalvo).toLocaleString('pt-BR') : '') }));
      var qtd = el('p', { text: 'Cópias diárias: verificando…' });
      linhas.push(qtd);
      Armazenamento.quantidadeBackups().then(function (n) {
        qtd.textContent = 'Cópias diárias em "' + info.nomePasta + '\\backups": ' + (n || 0) + ' (guarda as últimas 30, uma por dia, com o estado do início do dia).';
      });
      acoes.push(UI.botao('Salvar agora', function () { Armazenamento.gravarAgora().then(function () { UI.aviso('Dados salvos na pasta'); App.atualizar(); }); }, 'btn-secundario'));
      acoes.push(UI.botao('Trocar pasta…', Armazenamento.escolherPasta, 'btn-contorno'));
    } else if (info.estado === 'precisa-permissao') {
      classe = 'atencao';
      linhas.push(el('p', { class: 'pasta-estado', text: 'Pasta escolhida: "' + info.nomePasta + '" — aguardando sua permissão' }));
      linhas.push(el('p', { text: 'Por segurança, o navegador pede permissão de novo depois de ser fechado. Clique em "Conectar" e confirme.' }));
      acoes.push(UI.botao('Conectar', Armazenamento.reconectar, 'btn-primario'));
      acoes.push(UI.botao('Escolher outra pasta…', Armazenamento.escolherPasta, 'btn-contorno'));
    } else if (info.estado === 'erro') {
      classe = 'erro';
      linhas.push(el('p', { class: 'pasta-estado', text: '⚠ Erro ao usar a pasta de dados' }));
      linhas.push(el('p', { text: info.erro }));
      acoes.push(UI.botao('Tentar de novo', Armazenamento.reconectar, 'btn-primario'));
      acoes.push(UI.botao('Escolher outra pasta…', Armazenamento.escolherPasta, 'btn-contorno'));
    } else {
      classe = 'atencao';
      linhas.push(el('p', { class: 'pasta-estado', text: 'Nenhuma pasta de dados escolhida' }));
      linhas.push(el('p', { text: 'Escolha (ou crie) a pasta Documentos\\Estudos\\dados. O programa grava ali o arquivo ' + info.arquivo + ' a cada alteração e uma cópia por dia em "backups". Como a pasta fica no OneDrive, ela também vai para a nuvem.' }));
      acoes.push(UI.botao('Escolher pasta de dados', Armazenamento.escolherPasta, 'btn-primario'));
    }

    return el('section', { class: 'painel painel-pasta ' + classe }, [
      el('h2', { class: 'secao-titulo', text: Nuvem.ativa() ? 'Pasta de dados (cópia extra neste computador)' : 'Pasta de dados' }),
      el('div', { class: 'pasta-info' }, linhas),
      acoes.length ? el('div', { class: 'pasta-acoes' }, acoes) : null,
      info.suportado ? el('p', { class: 'campo-ajuda', text: 'Ao conectar, o programa compara o arquivo com os dados deste navegador e usa a versão mais recente. Abrindo em outro computador ou navegador, basta escolher a mesma pasta para recuperar tudo.' }) : null
    ]);
  }

  // Atualiza esta tela quando o estado da pasta mudar (conectou, salvou, perdeu permissão).
  function atualizarSeAberta() { if (/^#\/backup/.test(location.hash)) App.atualizar(); }
  Armazenamento.aoMudar(atualizarSeAberta);
  Nuvem.aoMudar(atualizarSeAberta);

  return { render: render };
})();
