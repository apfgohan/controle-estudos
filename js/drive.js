// Google Drive: PDFs das aulas e cópias diárias (backup) numa pasta "Controle de Estudos" do Drive do usuário.
// Permissão "drive.file": o programa só enxerga os arquivos que ele mesmo criou.
// O acesso dura 1 h e é renovado num clique do usuário (o Google só abre a janela de permissão em resposta a um clique).
// Tudo que precisa do Drive passa por uma fila guardada neste aparelho: sem internet ou sem permissão, espera e tenta de novo.
var Drive = (function () {
  var ESCOPO = 'https://www.googleapis.com/auth/drive.file';
  var API = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  var PASTA = 'Controle de Estudos', PASTA_PDFS = 'PDFs', PASTA_BACKUPS = 'Backups', COPIAS_MANTIDAS = 30;
  var CHAVE_FILA = 'controle-estudos.fila-drive', CHAVE_LIGADO = 'controle-estudos.drive-ligado';
  var token = null, validoAte = 0, cliente = null, carregandoGis = null, pedindo = null;
  var ouvintes = [], progresso = {}, processando = false, ultimoErro = '';

  function configurado() { return !!window.DRIVE_CLIENT_ID || !!api.simulado; }
  function ligado() { try { return localStorage.getItem(CHAVE_LIGADO) === '1'; } catch (e) { return false; } }
  function marcarLigado(v) { try { if (v) localStorage.setItem(CHAVE_LIGADO, '1'); else localStorage.removeItem(CHAVE_LIGADO); } catch (e) { /* preferência */ } }
  function temToken() { return !!token && Date.now() < validoAte - 60000; }
  function notificar() { ouvintes.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function aoMudar(f) { ouvintes.push(f); }

  // ---------- Permissão (Google Identity Services) ----------
  function carregarGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (carregandoGis) return carregandoGis;
    carregandoGis = new Promise(function (ok, erro) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { carregandoGis = null; erro(new Error('Não foi possível falar com o Google (sem internet?).')); };
      document.head.appendChild(s);
    });
    return carregandoGis;
  }
  // Pede (ou renova) o acesso. Precisa ser chamado num clique do usuário na primeira vez e quando o acesso vence.
  function pedirAcesso(primeiraVez) {
    if (api.simulado) { token = 'simulado'; validoAte = Date.now() + 3600000; marcarLigado(true); notificar(); return Promise.resolve(); }
    if (!window.DRIVE_CLIENT_ID) return Promise.reject(new Error('O Google Drive ainda não foi configurado (falta o Client ID).'));
    if (pedindo) return pedindo;
    pedindo = carregarGis().then(function () {
      return new Promise(function (ok, erro) {
        var email = null;
        try { email = window.firebase && firebase.auth && firebase.auth().currentUser ? firebase.auth().currentUser.email : null; } catch (e) { email = null; }
        cliente = google.accounts.oauth2.initTokenClient({
          client_id: window.DRIVE_CLIENT_ID, scope: ESCOPO, hint: email || undefined,
          callback: function (r) {
            if (r && r.access_token) { token = r.access_token; validoAte = Date.now() + (Number(r.expires_in) || 3600) * 1000; marcarLigado(true); ultimoErro = ''; notificar(); ok(); }
            else erro(new Error(r && r.error ? 'Permissão do Google Drive não concedida (' + r.error + ').' : 'Permissão do Google Drive não concedida.'));
          },
          error_callback: function (e) { erro(new Error(e && e.type === 'popup_closed' ? 'A janela do Google foi fechada.' : 'Não foi possível abrir a permissão do Google (janela bloqueada?).')); }
        });
        cliente.requestAccessToken({ prompt: primeiraVez ? 'consent' : '' });
      });
    }).then(function () { pedindo = null; }, function (e) { pedindo = null; throw e; });
    return pedindo;
  }
  function desconectar() {
    if (token && !api.simulado && window.google && google.accounts && google.accounts.oauth2) { try { google.accounts.oauth2.revoke(token, function () {}); } catch (e) { /* já revogado */ } }
    token = null; validoAte = 0; marcarLigado(false); notificar();
  }
  // Com o Drive ligado e o acesso vencido, o próximo clique em qualquer lugar renova (o Google exige um clique).
  document.addEventListener('click', function () {
    if (ligado() && configurado() && !temToken() && !pedindo && (fila().length || precisaCopia())) {
      pedirAcesso(false).then(processar).catch(function (e) { ultimoErro = e.message; notificar(); });
    }
  }, true);

  // ---------- Chamadas à API (trocáveis por um Drive simulado nos testes) ----------
  function cabecalhos(extra) { return Object.assign({ Authorization: 'Bearer ' + token }, extra || {}); }
  function respostaJson(r) {
    if (r.status === 401) { token = null; validoAte = 0; notificar(); throw new Error('O acesso ao Google Drive venceu: clique em qualquer lugar para renovar.'); }
    if (!r.ok) return r.text().then(function (t) { throw new Error('Google Drive: erro ' + r.status + (t ? ' · ' + t.slice(0, 160) : '')); });
    return r.status === 204 ? null : r.json();
  }
  var api = {
    simulado: false,
    buscarPasta: function (nome, paiId) {
      var q = "mimeType='application/vnd.google-apps.folder' and trashed=false and name='" + nome.replace(/'/g, "\\'") + "'" + (paiId ? " and '" + paiId + "' in parents" : '');
      return fetch(API + '?fields=files(id,name)&q=' + encodeURIComponent(q), { headers: cabecalhos() }).then(respostaJson).then(function (j) { return j.files && j.files[0] ? j.files[0].id : null; });
    },
    criarPasta: function (nome, paiId) {
      return fetch(API + '?fields=id', { method: 'POST', headers: cabecalhos({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: paiId ? [paiId] : undefined }) }).then(respostaJson).then(function (j) { return j.id; });
    },
    // Envio resumível: começa a sessão e manda o arquivo com XHR (para ter o progresso).
    enviar: function (blob, nome, paiId, tipo, aoProgresso) {
      return fetch(UPLOAD + '?uploadType=resumable&fields=id,size', { method: 'POST',
        headers: cabecalhos({ 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': tipo, 'X-Upload-Content-Length': String(blob.size) }),
        body: JSON.stringify({ name: nome, parents: [paiId] }) }).then(function (r) {
        if (!r.ok) return respostaJson(r);
        var local = r.headers.get('Location');
        return new Promise(function (ok, erro) {
          var x = new XMLHttpRequest();
          x.open('PUT', local);
          x.setRequestHeader('Content-Type', tipo);
          x.upload.onprogress = function (e) { if (e.lengthComputable && aoProgresso) aoProgresso(e.loaded / e.total); };
          x.onload = function () { if (x.status >= 200 && x.status < 300) { try { ok(JSON.parse(x.responseText).id); } catch (e) { erro(e); } } else erro(new Error('Google Drive: envio recusado (' + x.status + ')')); };
          x.onerror = function () { erro(new Error('Sem conexão com o Google Drive.')); };
          x.send(blob);
        });
      });
    },
    baixar: function (id, aoProgresso) {
      return new Promise(function (ok, erro) {
        var x = new XMLHttpRequest();
        x.open('GET', API + '/' + encodeURIComponent(id) + '?alt=media');
        x.responseType = 'blob';
        x.setRequestHeader('Authorization', 'Bearer ' + token);
        x.onprogress = function (e) { if (e.lengthComputable && aoProgresso) aoProgresso(e.loaded / e.total); };
        x.onload = function () {
          if (x.status === 401) { token = null; validoAte = 0; notificar(); erro(new Error('O acesso ao Google Drive venceu: clique de novo para renovar.')); return; }
          if (x.status >= 200 && x.status < 300) ok(x.response); else erro(new Error(x.status === 404 ? 'O arquivo não está mais no Google Drive.' : 'Google Drive: erro ' + x.status));
        };
        x.onerror = function () { erro(new Error('Sem conexão com o Google Drive.')); };
        x.send();
      });
    },
    lixeira: function (id) {
      return fetch(API + '/' + encodeURIComponent(id), { method: 'PATCH', headers: cabecalhos({ 'Content-Type': 'application/json' }), body: JSON.stringify({ trashed: true }) })
        .then(function (r) { if (r.status === 404) return null; return respostaJson(r); });
    },
    listar: function (paiId) {
      var q = "'" + paiId + "' in parents and trashed=false";
      return fetch(API + '?pageSize=200&orderBy=createdTime desc&fields=files(id,name,size,createdTime)&q=' + encodeURIComponent(q), { headers: cabecalhos() })
        .then(respostaJson).then(function (j) { return j.files || []; });
    }
  };

  // ---------- Pastas ----------
  // Os ids das pastas ficam nos dados (Dados.db.drive), então todos os aparelhos usam as mesmas.
  function pastas() {
    var d = Dados.db.drive || (Dados.db.drive = {});
    if (d.pasta && d.pdfs && d.backups) return Promise.resolve(d);
    function achar(nome, pai) { return api.buscarPasta(nome, pai).then(function (id) { return id || api.criarPasta(nome, pai); }); }
    return achar(PASTA, null).then(function (raiz) {
      return Promise.all([achar(PASTA_PDFS, raiz), achar(PASTA_BACKUPS, raiz)]).then(function (r) {
        Dados.db.drive = Object.assign({}, Dados.db.drive, { pasta: raiz, pdfs: r[0], backups: r[1] });
        Dados.salvar();
        return Dados.db.drive;
      });
    });
  }

  // ---------- Fila (envios de PDF e arquivos para a lixeira) ----------
  function fila() { try { return JSON.parse(localStorage.getItem(CHAVE_FILA) || '[]') || []; } catch (e) { return []; } }
  function gravarFila(f) { try { localStorage.setItem(CHAVE_FILA, JSON.stringify(f)); } catch (e) { /* tenta de novo depois */ } notificar(); }
  function enfileirar(item) {
    var f = fila().filter(function (x) { return !(x.op === item.op && (x.aulaId ? x.aulaId === item.aulaId : x.driveId === item.driveId)); });
    f.push(item); gravarFila(f);
    setTimeout(processar, 0);
  }
  function enviarPdf(aulaId) { enfileirar({ op: 'enviar', aulaId: aulaId }); }
  function apagar(driveId) { if (driveId) enfileirar({ op: 'apagar', driveId: driveId }); }

  function removerDaFila(item) { var k = JSON.stringify(item); gravarFila(fila().filter(function (x) { return JSON.stringify(x) !== k; })); }
  function processar() {
    if (processando || !configurado() || !ligado() || !temToken()) return Promise.resolve();
    var f = fila();
    if (!f.length) return copiaDiaria();
    processando = true;
    var item = f[0];
    return executar(item).then(function () {
      removerDaFila(item); ultimoErro = ''; return true;
    }, function (e) {
      ultimoErro = (e && e.message) || String(e);
      // Item que não tem mais o que fazer (aula excluída, PDF apagado deste aparelho) sai da fila.
      if (e && e.descartar) { removerDaFila(item); return true; }
      console.warn('Drive: tenta de novo em 1 minuto', e);
      setTimeout(processar, 60000);
      return false;
    }).then(function (continuar) { processando = false; notificar(); if (continuar) return processar(); });
  }  function descartar(msg) { var e = new Error(msg); e.descartar = true; return e; }
  function executar(item) {
    if (item.op === 'apagar') return api.lixeira(item.driveId);
    var x = Dados.aula(item.aulaId);
    if (!x || !x.aula.arquivo) return Promise.reject(descartar('Aula sem PDF'));
    if (x.aula.arquivo.driveId) return Promise.resolve(); // já está no Drive
    return Promise.all([pastas(), PdfsDados.obterPdf(item.aulaId)]).then(function (r) {
      var rec = r[1];
      if (!rec) throw descartar('O PDF não está neste aparelho');
      progresso[item.aulaId] = 0; notificar();
      return api.enviar(rec.blob, rec.nome || 'aula.pdf', r[0].pdfs, 'application/pdf', function (p) { progresso[item.aulaId] = p; notificar(); }).then(function (id) {
        delete progresso[item.aulaId];
        var agora = Dados.aula(item.aulaId);
        if (agora && agora.aula.arquivo && !agora.aula.arquivo.driveId) Dados.definirArquivoAula(item.aulaId, Object.assign({}, agora.aula.arquivo, { driveId: id }));
        else api.lixeira(id).catch(function () {}); // a aula mudou enquanto enviava: não deixa arquivo solto
      }, function (e) { delete progresso[item.aulaId]; throw e; });
    });
  }
  // PDFs deste aparelho que ainda não estão no Drive (os enviados antes do Drive existir).
  function enviarPdfsDoAparelho() {
    return PdfsDados.carregarPresentes().then(function (p) {
      var n = 0;
      Object.keys(p).forEach(function (id) { var x = Dados.aula(id); if (x && x.aula.arquivo && !x.aula.arquivo.driveId) { enviarPdf(id); n++; } });
      return n;
    });
  }

  // Baixa o PDF da aula (outro aparelho enviou) e guarda no cache deste aparelho.
  function baixarPdf(aulaId, aoProgresso) {
    var x = Dados.aula(aulaId), a = x && x.aula;
    if (!a || !a.arquivo || !a.arquivo.driveId) return Promise.reject(new Error('Esta aula não tem PDF no Google Drive.'));
    var pronto = temToken() ? Promise.resolve() : pedirAcesso(false);
    return pronto.then(function () { return api.baixar(a.arquivo.driveId, aoProgresso); }).then(function (blob) {
      var arq = new File([blob], a.arquivo.nome || 'aula.pdf', { type: 'application/pdf' });
      return PdfsDados.guardarPdf(aulaId, arq, a.arquivo.paginas || 0);
    });
  }

  // ---------- Cópia diária (backup completo) ----------
  function precisaCopia() { var d = Dados.db.drive || {}; return !Dados.estaVazio() && d.ultimaCopia !== UI.hoje(); }
  function copiaDiaria(forcar) {
    if (!configurado() || !ligado() || !temToken() || !window.Backup || !Backup.gerarTexto) return Promise.resolve(false);
    if (!forcar && !precisaCopia()) return Promise.resolve(false);
    return pastas().then(function (p) {
      return Backup.gerarTexto().then(function (texto) {
        var blob = new Blob([texto], { type: 'application/json' });
        return api.enviar(blob, 'controle-estudos-' + UI.hoje() + '.json', p.backups, 'application/json');
      }).then(function () {
        Dados.db.drive = Object.assign({}, Dados.db.drive, { ultimaCopia: UI.hoje(), ultimaCopiaEm: Date.now() });
        Dados.salvar();
        notificar();
        // Ficam as 30 mais recentes; as demais vão para a lixeira do Drive.
        return api.listar(p.backups).then(function (lista) {
          return Promise.all(lista.slice(COPIAS_MANTIDAS).map(function (f) { return api.lixeira(f.id); }));
        });
      }).then(function () { return true; });
    }).catch(function (e) { ultimoErro = e.message; notificar(); return false; });
  }
  function listarCopias() {
    var pronto = temToken() ? Promise.resolve() : pedirAcesso(false);
    return pronto.then(pastas).then(function (p) { return api.listar(p.backups); });
  }
  function baixarTexto(id) { return api.baixar(id).then(function (b) { return b.text(); }); }

  // Retoma a fila de tempos em tempos e quando a internet volta.
  setInterval(function () { processar(); }, 60000);
  window.addEventListener('online', function () { processar(); });

  function situacao() {
    return { configurado: configurado(), ligado: ligado(), comAcesso: temToken(), fila: fila(), progresso: progresso, erro: ultimoErro,
      ultimaCopia: (Dados.db.drive || {}).ultimaCopia || null, ultimaCopiaEm: (Dados.db.drive || {}).ultimaCopiaEm || null, simulado: api.simulado };
  }

  return {
    configurado: configurado, ligado: ligado, temToken: temToken, pedirAcesso: pedirAcesso, desconectar: desconectar, aoMudar: aoMudar,
    enviarPdf: enviarPdf, apagar: apagar, processar: processar, enviarPdfsDoAparelho: enviarPdfsDoAparelho, baixarPdf: baixarPdf,
    copiaDiaria: copiaDiaria, listarCopias: listarCopias, baixarTexto: baixarTexto, situacao: situacao,
    _api: api // para os testes trocarem as chamadas por um Drive simulado
  };
})();
