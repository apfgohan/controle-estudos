// PDFs das aulas e os grifos/anotações feitos neles.
//   PDF:    só neste aparelho (IndexedDB, loja "arquivos"), porque são grandes demais para a nuvem atual.
//   Grifos: no aparelho (loja "grifos") e na nuvem em usuarios/{uid}/grifos/{aulaId}, aula por aula
//           (mesmo esquema dos resumos: grava aqui na hora, envia em seguida; entre aparelhos vence o mais recente).
var PdfsDados = (function () {
  var BANCO = 'controle-estudos-pdfs', ARQ = 'arquivos', GRI = 'grifos';
  var ESPERA_NUVEM = 5000;
  var abrindo = null, timers = {}, presentes = {};

  function abrir() {
    if (abrindo) return abrindo;
    abrindo = new Promise(function (ok, erro) {
      if (!window.indexedDB) { erro(new Error('Este navegador não permite guardar PDFs.')); return; }
      var req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(ARQ)) db.createObjectStore(ARQ, { keyPath: 'aulaId' });
        if (!db.objectStoreNames.contains(GRI)) db.createObjectStore(GRI, { keyPath: 'aulaId' });
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { erro(req.error); };
    });
    abrindo.catch(function () { abrindo = null; });
    return abrindo;
  }
  function transacao(loja, modo, fazer) {
    return abrir().then(function (db) {
      return new Promise(function (ok, erro) {
        var t = db.transaction(loja, modo);
        var pedido = fazer(t.objectStore(loja));
        t.oncomplete = function () { ok(pedido ? pedido.result : undefined); };
        t.onerror = function () { erro(t.error); };
        t.onabort = function () { erro(t.error || new Error('Gravação cancelada')); };
      });
    });
  }

  // ---------- Arquivos ----------
  function guardarPdf(aulaId, arquivo, paginas) {
    var rec = { aulaId: aulaId, blob: arquivo, nome: arquivo.name || 'aula.pdf', tamanho: arquivo.size || 0, paginas: paginas || 0, enviadoEm: Date.now() };
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* o navegador decide */ });
    return transacao(ARQ, 'readwrite', function (l) { return l.put(rec); }).then(function () { presentes[aulaId] = true; return rec; });
  }
  function obterPdf(aulaId) { return transacao(ARQ, 'readonly', function (l) { return l.get(aulaId); }).then(function (r) { return r || null; }); }
  function removerPdf(aulaId) { delete presentes[aulaId]; return transacao(ARQ, 'readwrite', function (l) { return l.delete(aulaId); }); }
  // Lista leve (sem os arquivos) do que está neste aparelho: { aulaId: { nome, tamanho, paginas } }.
  function carregarPresentes() {
    return transacao(ARQ, 'readonly', function (l) { return l.getAllKeys(); }).then(function (ids) {
      presentes = {};
      (ids || []).forEach(function (id) { presentes[id] = true; });
      return presentes;
    }).catch(function () { return presentes; });
  }
  function temPdf(aulaId) { return !!presentes[aulaId]; }
  function espacoUsado() {
    return transacao(ARQ, 'readonly', function (l) { return l.getAll(); }).then(function (lista) {
      return (lista || []).reduce(function (r, x) { r.n++; r.bytes += x.tamanho || 0; return r; }, { n: 0, bytes: 0 });
    });
  }
  function apagarTodosPdfs() { presentes = {}; return transacao(ARQ, 'readwrite', function (l) { l.clear(); }); }

  // ---------- Grifos ----------
  function registro(aulaId, itens, ultimaPagina, atualizadoEm, pendente) {
    return { aulaId: aulaId, itens: Array.isArray(itens) ? itens : [], ultimaPagina: Number(ultimaPagina) || 0, atualizadoEm: atualizadoEm || 0, pendente: !!pendente };
  }
  function lerItens(v) {
    if (Array.isArray(v)) return v;
    try { var x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch (e) { return []; }
  }
  function obterGrifos(aulaId) { return transacao(GRI, 'readonly', function (l) { return l.get(aulaId); }).then(function (r) { return r || registro(aulaId, [], 0, 0, false); }); }
  function gravarGrifosLocal(rec) { return transacao(GRI, 'readwrite', function (l) { return l.put(rec); }).then(function () { return rec; }); }
  function salvarGrifos(aulaId, itens, ultimaPagina) {
    return gravarGrifosLocal(registro(aulaId, itens, ultimaPagina, Date.now(), true)).then(function (rec) { agendar(aulaId); return rec; });
  }

  function nuvemPronta() { return !!(window.Nuvem && Nuvem.podeGravar && Nuvem.podeGravar() && Nuvem.salvarGrifos); }
  function agendar(id) { clearTimeout(timers[id]); timers[id] = setTimeout(function () { enviar(id); }, ESPERA_NUVEM); }
  function enviar(id) {
    clearTimeout(timers[id]); delete timers[id];
    if (!nuvemPronta()) return Promise.resolve(false);
    return obterGrifos(id).then(function (rec) {
      if (!rec.pendente) return false;
      // Na nuvem, os itens vão como texto (JSON): o banco não guarda listas de listas de forma confiável.
      return Nuvem.salvarGrifos(id, { itens: JSON.stringify(rec.itens), ultimaPagina: rec.ultimaPagina, atualizadoEm: rec.atualizadoEm }).then(function () {
        return obterGrifos(id).then(function (atual) { if (atual.atualizadoEm === rec.atualizadoEm) { atual.pendente = false; return gravarGrifosLocal(atual); } });
      }).then(function () { return true; });
    }).catch(function (e) { console.error('Grifos não enviados para a nuvem', e); return false; });
  }
  function enviarPendentes() {
    return transacao(GRI, 'readonly', function (l) { return l.getAll(); }).then(function (lista) {
      return Promise.all((lista || []).filter(function (r) { return r.pendente; }).map(function (r) { return enviar(r.aulaId); }));
    }).catch(function (e) { console.error(e); });
  }
  function enviarAgendados() { Object.keys(timers).forEach(function (id) { enviar(id); }); }
  window.addEventListener('pagehide', enviarAgendados);
  window.addEventListener('beforeunload', enviarAgendados);

  // Ao abrir uma aula no leitor: a versão mais recente (aparelho ou nuvem) vence.
  function sincronizarGrifos(aulaId) {
    return obterGrifos(aulaId).then(function (local) {
      if (!nuvemPronta()) return local;
      return Nuvem.buscarGrifos(aulaId).then(function (remoto) {
        if (remoto && (remoto.atualizadoEm || 0) > (local.atualizadoEm || 0)) {
          return gravarGrifosLocal(registro(aulaId, lerItens(remoto.itens), remoto.ultimaPagina, remoto.atualizadoEm, false));
        }
        if (local.pendente) enviar(aulaId);
        return local;
      }).catch(function (e) { console.error(e); return local; });
    });
  }
  function apagarAula(aulaId) {
    clearTimeout(timers[aulaId]); delete timers[aulaId];
    var nuvem = nuvemPronta() ? Nuvem.apagarGrifos(aulaId).catch(function (e) { console.error(e); }) : Promise.resolve();
    return Promise.all([removerPdf(aulaId).catch(function () {}), transacao(GRI, 'readwrite', function (l) { return l.delete(aulaId); }), nuvem]);
  }

  // ---------- Backup (só os grifos; os PDFs não vão no arquivo) ----------
  function exportarGrifos() {
    return transacao(GRI, 'readonly', function (l) { return l.getAll(); }).then(function (lista) {
      return (lista || []).filter(function (r) { return r.itens.length || r.ultimaPagina; }).map(function (r) { return { aulaId: r.aulaId, itens: r.itens, ultimaPagina: r.ultimaPagina, atualizadoEm: r.atualizadoEm }; });
    }).catch(function () { return []; });
  }
  function importarGrifos(lista) {
    return transacao(GRI, 'readwrite', function (l) {
      l.clear();
      (lista || []).forEach(function (r) { if (r && r.aulaId) l.put(registro(r.aulaId, lerItens(r.itens), r.ultimaPagina, Date.now(), true)); });
    }).then(enviarPendentes);
  }

  // Ao abrir o programa: descobre quais aulas têm o PDF neste aparelho e redesenha a tela (botões "Ler").
  carregarPresentes().then(function (p) { if (Object.keys(p).length && window.App) App.atualizar(); });

  return {
    guardarPdf: guardarPdf, obterPdf: obterPdf, removerPdf: removerPdf, carregarPresentes: carregarPresentes, temPdf: temPdf,
    espacoUsado: espacoUsado, apagarTodosPdfs: apagarTodosPdfs,
    obterGrifos: obterGrifos, salvarGrifos: salvarGrifos, sincronizarGrifos: sincronizarGrifos, enviarPendentes: enviarPendentes,
    apagarAula: apagarAula, exportarGrifos: exportarGrifos, importarGrifos: importarGrifos
  };
})();
