// Resumos: um documento por matéria, guardado fora dos dados principais (pode ter vários MB por causa das imagens,
// e os dados principais vão inteiros para a nuvem a cada alteração).
//   No aparelho: IndexedDB, um registro por matéria { disciplinaId, html, atualizadoEm, titulos, tamanho, pendente }.
//   Na nuvem:    usuarios/{uid}/resumos/{disciplinaId}, gravado só a matéria alterada.
// Entre aparelhos, vale a versão com atualizadoEm mais recente, matéria por matéria.
var ResumosDados = (function () {
  var BANCO = 'controle-estudos-resumos', LOJA = 'resumos';
  var ESPERA_NUVEM = 5000, NOVA_TENTATIVA = 30000;
  var LIMITE_NUVEM = 9.5 * 1024 * 1024; // um valor no Firebase vai até 10 MB
  var abrindo = null;
  var timers = {};
  // Estado do envio de cada resumo à nuvem: 'local' (sem nuvem), 'pendente', 'nuvem' (confirmado), 'falha', 'grande'.
  var estados = {}, ouvintes = [];
  function definirEstado(id, estado, quando) {
    estados[id] = { estado: estado, quando: quando || Date.now() };
    ouvintes.forEach(function (f) { try { f(id, estados[id]); } catch (e) { console.error(e); } });
  }
  function aoMudarEstado(f) { ouvintes.push(f); }
  // Resumos que não conseguiram subir (falha de envio ou grandes demais).
  function pendencias() { return Object.keys(estados).filter(function (k) { return estados[k].estado === 'falha' || estados[k].estado === 'grande'; }).length; }
  function estadoDe(id) { return estados[id] || null; }

  function abrir() {
    if (abrindo) return abrindo;
    abrindo = new Promise(function (ok, erro) {
      if (!window.indexedDB) { erro(new Error('Este navegador não permite guardar os resumos.')); return; }
      var req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(LOJA, { keyPath: 'disciplinaId' }); };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { erro(req.error); };
    });
    abrindo.catch(function () { abrindo = null; });
    return abrindo;
  }

  function transacao(modo, fazer) {
    return abrir().then(function (db) {
      return new Promise(function (ok, erro) {
        var t = db.transaction(LOJA, modo);
        var pedido = fazer(t.objectStore(LOJA));
        t.oncomplete = function () { ok(pedido ? pedido.result : undefined); };
        t.onerror = function () { erro(t.error); };
        t.onabort = function () { erro(t.error || new Error('Gravação cancelada')); };
      });
    });
  }

  function obter(id) { return transacao('readonly', function (l) { return l.get(id); }).then(function (r) { return r || null; }); }
  function listar() { return transacao('readonly', function (l) { return l.getAll(); }).then(function (r) { return r || []; }); }
  function gravarLocal(rec) { return transacao('readwrite', function (l) { return l.put(rec); }).then(function () { return rec; }); }

  function contarTitulos(html) { return (String(html || '').match(/<h[123][\s>]/gi) || []).length; }

  // tinta = traços feitos à mão por cima do texto (ver Resumos, modo Caneta).
  function registro(id, html, atualizadoEm, pendente, tinta) {
    html = html || '';
    tinta = Array.isArray(tinta) ? tinta : [];
    return { disciplinaId: id, html: html, tinta: tinta, atualizadoEm: atualizadoEm, titulos: contarTitulos(html),
      tamanho: html.length + (tinta.length ? JSON.stringify(tinta).length : 0), pendente: !!pendente };
  }
  function lerTinta(v) {
    if (Array.isArray(v)) return v;
    try { var x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch (e) { return []; }
  }

  // Grava neste aparelho agora e agenda o envio para a nuvem.
  function salvar(id, html, tinta) {
    return gravarLocal(registro(id, html, Date.now(), true, tinta)).then(function (rec) {
      definirEstado(id, nuvemPronta() ? 'pendente' : 'local', rec.atualizadoEm);
      agendarNuvem(id); return rec;
    });
  }

  function agendarNuvem(id) {
    clearTimeout(timers[id]);
    timers[id] = setTimeout(function () { enviar(id); }, ESPERA_NUVEM);
  }

  function nuvemPronta() { return !!(window.Nuvem && Nuvem.podeGravar && Nuvem.podeGravar()); }

  function enviar(id) {
    clearTimeout(timers[id]);
    delete timers[id];
    if (!nuvemPronta()) return Promise.resolve(false);
    return obter(id).then(function (rec) {
      if (!rec || !rec.pendente) return false;
      // Na nuvem, os traços vão como texto (JSON): o banco não guarda listas de listas de forma confiável.
      var corpo = { html: rec.html, tinta: JSON.stringify(rec.tinta || []), atualizadoEm: rec.atualizadoEm, titulos: rec.titulos };
      if (corpo.html.length + corpo.tinta.length > LIMITE_NUVEM) { definirEstado(id, 'grande', rec.atualizadoEm); return false; }
      return Nuvem.salvarResumo(id, corpo).then(function () {
        return Nuvem.salvarResumoInfo(id, { atualizadoEm: rec.atualizadoEm, titulos: rec.titulos || 0, tamanho: rec.tamanho || 0 }).catch(function () { /* o índice volta a ser gravado no próximo envio */ });
      }).then(function () {
        if (!estados[id] || estados[id].quando <= rec.atualizadoEm) definirEstado(id, 'nuvem', rec.atualizadoEm);
        // Só desmarca se ninguém editou de novo enquanto enviava.
        return obter(id).then(function (atual) {
          if (atual && atual.atualizadoEm === rec.atualizadoEm) { atual.pendente = false; return gravarLocal(atual); }
        });
      }).then(function () { return true; });
    }).catch(function (e) {
      console.error('Resumo não enviado para a nuvem', e);
      definirEstado(id, 'falha', estados[id] ? estados[id].quando : 0); // mantém a hora do salvamento: o próximo envio bem-sucedido limpa o aviso
      clearTimeout(timers[id]); timers[id] = setTimeout(function () { enviar(id); }, NOVA_TENTATIVA);
      return false;
    });
  }

  function enviarPendentes() {
    return listar().then(function (lista) {
      return Promise.all(lista.filter(function (r) { return r.pendente; }).map(function (r) { return enviar(r.disciplinaId); }));
    }).catch(function (e) { console.error(e); });
  }

  function enviarAgendados() { Object.keys(timers).forEach(function (id) { enviar(id); }); }
  window.addEventListener('pagehide', enviarAgendados);
  window.addEventListener('beforeunload', enviarAgendados);
  // A internet voltou, ou de tempos em tempos: reenvia o que ficou pendente.
  window.addEventListener('online', function () { enviarPendentes(); });
  setInterval(function () { if (nuvemPronta() && Object.keys(estados).some(function (k) { return estados[k].estado === 'falha' || estados[k].estado === 'pendente'; })) enviarPendentes(); }, NOVA_TENTATIVA);

  // Lista para a aba Resumos: a cópia deste aparelho junto com o índice da nuvem (aparelho novo ainda sem os textos).
  // Resumos deste aparelho que ainda não estão no índice (enviados antes do índice existir) são incluídos nele.
  function listarComNuvem() {
    return listar().then(function (locais) {
      if (!nuvemPronta() || !Nuvem.listarResumosInfo) return locais;
      return Nuvem.listarResumosInfo().then(function (info) {
        var porId = {}; locais.forEach(function (r) { porId[r.disciplinaId] = r; });
        locais.forEach(function (r) {
          if (!r.pendente && r.html && !info[r.disciplinaId]) Nuvem.salvarResumoInfo(r.disciplinaId, { atualizadoEm: r.atualizadoEm, titulos: r.titulos || 0, tamanho: r.tamanho || 0 }).catch(function () {});
        });
        Object.keys(info).forEach(function (id) {
          var x = info[id], l = porId[id];
          if (!l || (x.atualizadoEm || 0) > (l.atualizadoEm || 0)) porId[id] = { disciplinaId: id, html: null, naNuvem: true, titulos: x.titulos || 0, tamanho: x.tamanho || 0, atualizadoEm: x.atualizadoEm || 0 };
        });
        return Object.keys(porId).map(function (k) { return porId[k]; });
      }).catch(function () { return locais; });
    });
  }

  // Compara com a nuvem ao abrir uma matéria: a versão mais recente vence.
  function sincronizar(id) {
    return obter(id).then(function (local) {
      if (!nuvemPronta()) return { rec: local, daNuvem: false };
      return Nuvem.buscarResumo(id).then(function (remoto) {
        if (remoto && (!local || (remoto.atualizadoEm || 0) > (local.atualizadoEm || 0))) {
          return gravarLocal(registro(id, remoto.html, remoto.atualizadoEm || 0, false, lerTinta(remoto.tinta))).then(function (rec) { return { rec: rec, daNuvem: true }; });
        }
        if (local && local.pendente) enviar(id);
        return { rec: local, daNuvem: false };
      }).catch(function (e) { console.error(e); return { rec: local, daNuvem: false }; });
    });
  }

  function apagar(id) {
    clearTimeout(timers[id]);
    delete timers[id];
    var nuvem = nuvemPronta() ? Nuvem.apagarResumo(id).catch(function (e) { console.error(e); }) : Promise.resolve();
    return Promise.all([transacao('readwrite', function (l) { return l.delete(id); }), nuvem]);
  }

  // ---------- Backup ----------
  function exportarTodos() {
    return listar().then(function (lista) {
      return lista.map(function (r) { return { disciplinaId: r.disciplinaId, html: r.html, tinta: r.tinta || [], atualizadoEm: r.atualizadoEm }; });
    }).catch(function () { return []; });
  }

  // Troca todos os resumos pelos do backup e envia cada um para a nuvem.
  function importarTodos(lista) {
    return transacao('readwrite', function (l) {
      l.clear();
      (lista || []).forEach(function (r) { if (r && r.disciplinaId) l.put(registro(r.disciplinaId, r.html, Date.now(), true, lerTinta(r.tinta))); });
    }).then(enviarPendentes);
  }

  return {
    obter: obter, listar: listar, listarComNuvem: listarComNuvem, aoMudarEstado: aoMudarEstado, estadoDe: estadoDe, pendencias: pendencias, salvar: salvar, sincronizar: sincronizar, apagar: apagar,
    enviarPendentes: enviarPendentes, enviarAgendados: enviarAgendados,
    exportarTodos: exportarTodos, importarTodos: importarTodos, contarTitulos: contarTitulos
  };
})();
