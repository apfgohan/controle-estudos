// Lei Seca: cada lei fica fora dos dados principais (pode ter centenas de KB com as questões).
//   No aparelho: IndexedDB, um registro por lei.
//   Na nuvem:    usuarios/{uid}/leis/{id} = { json, atualizadoEm } e usuarios/{uid}/leisInfo/{id} = índice leve.
// Entre aparelhos vale a versão com atualizadoEm mais recente, lei por lei (como os Resumos).
// Registro: { id, nome, disciplinaId, origem, nomeArquivo, criadaEm, atualizadoEm, divisoes, artigos, cont,
//   marcas: { parteId: html }, atencao: { parteId: true }, removidas: { parteId: true },
//   lotes: [{ id, nomeArquivo, titulo, importadoEm, questoes: [...] }], ligacoes: { questaoId: [...] }, manuais: { questaoId: parteId|'' } }
var LeiSecaDados = (function () {
  var BANCO = 'controle-estudos-leis', LOJA = 'leis';
  var ESPERA_NUVEM = 4000, NOVA_TENTATIVA = 30000, LIMITE_NUVEM = 9.5 * 1024 * 1024;
  var abrindo = null, timers = {};

  function abrir() {
    if (abrindo) return abrindo;
    abrindo = new Promise(function (ok, erro) {
      if (!window.indexedDB) { erro(new Error('Este navegador não permite guardar as leis.')); return; }
      var req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(LOJA, { keyPath: 'id' }); };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { erro(req.error); };
    });
    abrindo.catch(function () { abrindo = null; });
    return abrindo;
  }
  function transacao(modo, fazer) {
    return abrir().then(function (db) {
      return new Promise(function (ok, erro) {
        var t = db.transaction(LOJA, modo), pedido = fazer(t.objectStore(LOJA));
        t.oncomplete = function () { ok(pedido ? pedido.result : undefined); };
        t.onerror = function () { erro(t.error); };
        t.onabort = function () { erro(t.error || new Error('Gravação cancelada')); };
      });
    });
  }
  function obter(id) { return transacao('readonly', function (l) { return l.get(id); }).then(function (r) { return r || null; }); }
  function listar() { return transacao('readonly', function (l) { return l.getAll(); }).then(function (r) { return r || []; }); }
  function gravarLocal(rec) { return transacao('readwrite', function (l) { return l.put(rec); }).then(function () { return rec; }); }

  function nuvemPronta() { return !!(window.Nuvem && Nuvem.podeGravar && Nuvem.podeGravar() && Nuvem.salvarLei); }

  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function contarQuestoes(rec) {
    var ids = {};
    (rec.lotes || []).forEach(function (l) { (l.questoes || []).forEach(function (q) { ids[q.id] = true; }); });
    return Object.keys(ids).length;
  }
  function info(rec) {
    return { nome: rec.nome || '', disciplinaId: rec.disciplinaId || '', artigos: (rec.artigos || []).length, questoes: contarQuestoes(rec), atualizadoEm: rec.atualizadoEm || 0 };
  }

  // Grava neste aparelho agora e agenda o envio para a nuvem.
  function salvar(rec) {
    rec.atualizadoEm = Date.now();
    rec.pendente = true;
    return gravarLocal(rec).then(function () { agendarNuvem(rec.id); return rec; });
  }
  function agendarNuvem(id) { clearTimeout(timers[id]); timers[id] = setTimeout(function () { enviar(id); }, ESPERA_NUVEM); }

  function enviar(id) {
    clearTimeout(timers[id]); delete timers[id];
    if (!nuvemPronta()) return Promise.resolve(false);
    return obter(id).then(function (rec) {
      if (!rec || !rec.pendente) return false;
      var copia = Object.assign({}, rec); delete copia.pendente;
      var corpo = { json: JSON.stringify(copia), atualizadoEm: rec.atualizadoEm };
      if (corpo.json.length > LIMITE_NUVEM) { console.warn('Lei grande demais para a nuvem', id); return false; }
      return Nuvem.salvarLei(id, corpo).then(function () { return Nuvem.salvarLeiInfo(id, info(rec)).catch(function () {}); }).then(function () {
        return obter(id).then(function (atual) { if (atual && atual.atualizadoEm === rec.atualizadoEm) { atual.pendente = false; return gravarLocal(atual); } });
      }).then(function () { return true; });
    }).catch(function (e) {
      console.error('Lei não enviada para a nuvem', e);
      clearTimeout(timers[id]); timers[id] = setTimeout(function () { enviar(id); }, NOVA_TENTATIVA);
      return false;
    });
  }
  function enviarPendentes() { return listar().then(function (l) { return Promise.all(l.filter(function (r) { return r.pendente; }).map(function (r) { return enviar(r.id); })); }).catch(function () {}); }
  function enviarAgendados() { Object.keys(timers).forEach(function (id) { enviar(id); }); }
  window.addEventListener('pagehide', enviarAgendados);
  window.addEventListener('online', enviarPendentes);
  setInterval(function () { if (nuvemPronta()) enviarPendentes(); }, NOVA_TENTATIVA * 2);

  // Lista: as leis deste aparelho junto com o índice da nuvem (as que ainda não vieram para cá aparecem também).
  function listarComNuvem() {
    return listar().then(function (locais) {
      var lista = locais.map(function (r) { return Object.assign({ id: r.id }, info(r)); });
      if (!nuvemPronta()) return lista;
      return Nuvem.listarLeisInfo().then(function (ix) {
        var porId = {}; lista.forEach(function (r) { porId[r.id] = r; });
        Object.keys(ix).forEach(function (id) {
          var x = ix[id];
          if (!porId[id] || (x.atualizadoEm || 0) > (porId[id].atualizadoEm || 0)) porId[id] = Object.assign({ id: id, naNuvem: true }, x);
        });
        return Object.keys(porId).map(function (k) { return porId[k]; });
      }).catch(function () { return lista; });
    }).then(function (l) { return l.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true }); }); });
  }

  // Ao abrir uma lei: a versão mais recente (deste aparelho ou da nuvem) vence.
  function sincronizar(id) {
    return obter(id).then(function (local) {
      if (!nuvemPronta()) return local;
      return Nuvem.buscarLei(id).then(function (remoto) {
        if (remoto && remoto.json && (!local || (remoto.atualizadoEm || 0) > (local.atualizadoEm || 0))) {
          var rec = JSON.parse(remoto.json); rec.pendente = false;
          return gravarLocal(rec);
        }
        if (local && local.pendente) enviar(id);
        return local;
      }).catch(function (e) { console.error(e); return local; });
    });
  }

  function apagar(id) {
    clearTimeout(timers[id]); delete timers[id];
    var nuvem = nuvemPronta() ? Nuvem.apagarLei(id).catch(function (e) { console.error(e); }) : Promise.resolve();
    return Promise.all([transacao('readwrite', function (l) { return l.delete(id); }), nuvem]);
  }

  return { obter: obter, listar: listar, listarComNuvem: listarComNuvem, salvar: salvar, sincronizar: sincronizar, apagar: apagar, novoId: novoId, contarQuestoes: contarQuestoes, enviarPendentes: enviarPendentes };
})();
