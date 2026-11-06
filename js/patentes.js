// Patentes e XP. Nada disso é gravado: o resultado é recalculado repassando o histórico dia a dia.
// Assim, editar ou excluir sessões corrige tudo, e todos os aparelhos chegam ao mesmo resultado.
var Patentes = (function () {
  var el = UI.el;

  var LISTA = [
    // Calibrado com o histórico real (cerca de 118 XP por hora): o Imperator equivale a cerca de 2.000 horas.
    ['Tiro', 0], ['Miles', 1000], ['Immunis', 3000], ['Tesserarius', 6000], ['Optio', 9500],
    // Algumas promoções exigem também acerto acima de X% nas últimas N questões.
    ['Signifer', 15000], ['Aquilifer', 22000], ['Centurio', 32000, { acerto: 80, questoes: 500 }], ['Primus Pilus', 44000], ['Tribunus', 57000],
    ['Quaestor', 73000, { acerto: 82, questoes: 500 }], ['Aedilis', 94000], ['Praetor', 118000], ['Legatus', 146000], ['Consul', 180000],
    ['Imperator', 236000, { acerto: 85, questoes: 1000 }]
  ].map(function (p, i) { return { indice: i, nome: p[0], xp: p[1], requisito: p[2] || null }; });

  // O rebaixamento só vale a partir daqui: falhas antigas não punem, mas o XP antigo conta.
  // Fica no código (e não nos dados) para gravar a ativação nunca fazer um aparelho desatualizado parecer mais novo que a nuvem.
  var ATIVACAO = '2026-11-06';

  var XP = { QUESTAO: 1, ACERTO: 1, TOPICO: 20, ETAPA: 50, META: 200, SEQUENCIA_MAX: 100 };
  var FALTAS_SEGUIDAS = 3, FALTAS_NO_MES = 5;
  var CHAVE_VISTA = 'controle-estudos.patente-vista';

  // Acerto nas últimas N questões lançadas. Se a janela corta uma linha ao meio, conta a parte proporcional.
  function acertoNasUltimas(historico, n) {
    var questoes = 0, acertos = 0;
    for (var i = historico.length - 1; i >= 0 && questoes < n; i--) {
      var parte = Math.min(1, (n - questoes) / historico[i].n);
      questoes += historico[i].n * parte;
      acertos += historico[i].a * parte;
    }
    return { questoes: Math.round(questoes), pct: questoes ? acertos / questoes * 100 : 0 };
  }

  function requisitoAtendido(req, historico) {
    if (!req) return true;
    var st = acertoNasUltimas(historico, req.questoes);
    return st.questoes >= req.questoes && st.pct > req.acerto;
  }

  function meioDaFaixa(i) { return Math.round((LISTA[i].xp + LISTA[i + 1].xp) / 2); }

  function inicioSemana(iso) {
    var d = new Date(iso + 'T00:00:00');
    return UI.somarDias(iso, -((d.getDay() + 6) % 7));
  }

  // Agrupa por dia tudo o que rende XP: tempo, questões, tópicos concluídos e etapas concluídas.
  function ganhosPorDia() {
    var db = Dados.db, dias = {}, acum = {};
    function dia(d) { return dias[d] || (dias[d] = { sessoes: 0, segundos: 0, questoes: 0, acertos: 0, topicos: 0, etapas: 0, linhas: [] }); }
    db.sessoes.slice().sort(function (a, b) {
      return a.data === b.data ? (a.criadoEm || 0) - (b.criadoEm || 0) : (a.data < b.data ? -1 : 1);
    }).forEach(function (s) {
      var g = dia(s.data);
      g.sessoes++;
      g.segundos += s.segundos || 0;
      (s.cadernos || []).forEach(function (l) {
        var a = Number(l.acertos) || 0, n = a + (Number(l.erros) || 0);
        g.questoes += n;
        g.acertos += a;
        if (n) g.linhas.push({ n: n, a: a });
        if (!l.cadernoId) return;
        // Cada rodada das favoritadas tem contagem própria.
        var chaveAcum = l.rodada ? l.cadernoId + '|' + l.rodada : l.cadernoId;
        var antes = acum[chaveAcum] || 0, depois = antes + n;
        acum[chaveAcum] = depois;
        g.etapas += etapasConcluidas(s.disciplinaId, l, antes, depois);
      });
    });
    var primeira = Object.keys(dias).sort()[0];
    db.topicos.forEach(function (t) {
      if (t.concluido) dia(t.dataConclusao || primeira || UI.hoje()).topicos++;
    });
    return dias;
  }

  // Quantas etapas (baterias, simulado, erros, favoritadas) esta linha de sessão concluiu.
  function etapasConcluidas(disciplinaId, linha, antes, depois) {
    var c = Dados.caderno(linha.cadernoId);
    var p = c && Dados.pasta(c.pastaId);
    if (!p) return 0;
    if (p.tipo === 'favoritas') {
      if (linha.rodada) return linha.totalRodada > 0 && antes < linha.totalRodada && depois >= linha.totalRodada ? 1 : 0;
      return linha.finalizado ? 1 : 0;
    }
    if (p.tipo === 'simulado' || p.tipo === 'erros') {
      return c.totalQuestoes > 0 && antes < c.totalQuestoes && depois >= c.totalQuestoes ? 1 : 0;
    }
    if (p.tipo !== 'teoria' || !c.blocoId) return 0;
    var ate = 0, n = 0;
    Dados.divisaoBaterias(c, Dados.numBaterias(disciplinaId)).forEach(function (qtd) {
      ate += qtd;
      if (qtd > 0 && antes < ate && depois >= ate) n++;
    });
    return n;
  }

  function pausaEm(d) {
    return (Dados.db.pausas || []).filter(function (p) { return p.inicio <= d && d <= p.fim; })[0] || null;
  }

  function calcular() {
    var hoje = UI.hoje();
    var dias = ganhosPorDia();
    var datas = Object.keys(dias).sort();
    var r = {
      xp: 0, eventos: [], sequencia: 0, melhorSequencia: 0, estudouHoje: !!(dias[hoje] && dias[hoje].sessoes),
      fontes: { tempo: 0, questoes: 0, acertos: 0, topicos: 0, etapas: 0, metas: 0, sequencia: 0, perdido: 0 },
      faltasMes: 0, faltasSeguidas: 0, pausa: pausaEm(hoje)
    };
    var metas = Dados.db.metas || {};
    var metaSeg = (Number(metas.horas) || 0) * 3600, metaQ = Number(metas.questoes) || 0;
    var semanas = {}, faltasMes = [], mesAtual = null, seguidas = 0;
    var inicioFaltas = datas.length && datas[0] > ATIVACAO ? datas[0] : ATIVACAO;
    var indice = 0, historico = [];

    function evento(data, tipo, de, para, motivo) { r.eventos.push({ data: data, tipo: tipo, de: de, para: para, motivo: motivo }); }

    // A patente sobe enquanto houver XP e o requisito de acerto (se houver) estiver cumprido; o XP continua somando mesmo travado.
    function promover(data) {
      while (LISTA[indice + 1] && r.xp >= LISTA[indice + 1].xp && requisitoAtendido(LISTA[indice + 1].requisito, historico)) {
        evento(data, 'promocao', indice, indice + 1, '');
        indice++;
      }
    }

    function rebaixar(data, motivo) {
      if (!indice) return; // Tiro é o piso
      var novo = meioDaFaixa(indice - 1);
      r.fontes.perdido += r.xp - novo;
      r.xp = novo;
      evento(data, 'rebaixamento', indice, indice - 1, motivo);
      indice--;
    }

    for (var d = datas[0] || hoje; d <= hoje; d = UI.somarDias(d, 1)) {
      var g = dias[d], estudou = !!(g && g.sessoes), pausado = !!pausaEm(d);
      if (d.slice(0, 7) !== mesAtual) { mesAtual = d.slice(0, 7); faltasMes = []; }

      if (g) {
        var f = r.fontes;
        var tempo = Math.round(g.segundos / 60), questoes = g.questoes * XP.QUESTAO, acertos = g.acertos * XP.ACERTO;
        var topicos = g.topicos * XP.TOPICO, etapas = g.etapas * XP.ETAPA, bonusMeta = 0, bonusSeq = 0;
        var chave = inicioSemana(d), sem = semanas[chave] || (semanas[chave] = { segundos: 0, questoes: 0 });
        if (metaSeg && sem.segundos < metaSeg && sem.segundos + g.segundos >= metaSeg) bonusMeta += XP.META;
        if (metaQ && sem.questoes < metaQ && sem.questoes + g.questoes >= metaQ) bonusMeta += XP.META;
        sem.segundos += g.segundos;
        sem.questoes += g.questoes;
        if (estudou) {
          r.sequencia++;
          if (r.sequencia > r.melhorSequencia) r.melhorSequencia = r.sequencia;
          bonusSeq = Math.min(XP.SEQUENCIA_MAX, r.sequencia);
        }
        f.tempo += tempo; f.questoes += questoes; f.acertos += acertos; f.topicos += topicos;
        f.etapas += etapas; f.metas += bonusMeta; f.sequencia += bonusSeq;
        r.xp += tempo + questoes + acertos + topicos + etapas + bonusMeta + bonusSeq;
        historico = historico.concat(g.linhas);
        promover(d);
      }

      if (estudou || pausado) { seguidas = 0; continue; } // na pausa, a sequência fica congelada
      if (d === hoje) continue; // hoje ainda pode estudar
      r.sequencia = 0;
      if (d < inicioFaltas) continue;

      seguidas++;
      faltasMes.push(d);
      if (seguidas === FALTAS_SEGUIDAS) {
        rebaixar(d, FALTAS_SEGUIDAS + ' dias seguidos sem estudar');
        // Os dias que causaram este rebaixamento não contam de novo para a regra do mês.
        var inicioDaSeguida = UI.somarDias(d, 1 - FALTAS_SEGUIDAS);
        faltasMes = faltasMes.filter(function (x) { return x < inicioDaSeguida; });
        seguidas = 0;
      } else if (faltasMes.length >= FALTAS_NO_MES) {
        rebaixar(d, FALTAS_NO_MES + ' dias sem estudar no mês');
        faltasMes = [];
        seguidas = 0;
      }
    }

    r.faltasMes = faltasMes.length;
    r.faltasSeguidas = seguidas;
    r.indice = indice;
    r.patente = LISTA[indice];
    r.proxima = LISTA[indice + 1] || null;
    r.faltam = r.proxima ? Math.max(0, r.proxima.xp - r.xp) : 0;
    r.pct = r.proxima ? Math.min(100, (r.xp - r.patente.xp) / (r.proxima.xp - r.patente.xp) * 100) : 100;
    // Situação do requisito de acerto da próxima patente, quando ela tiver um.
    var req = r.proxima && r.proxima.requisito;
    r.requisito = req ? Object.assign({ exigido: req.acerto, janela: req.questoes, ok: requisitoAtendido(req, historico) }, acertoNasUltimas(historico, req.questoes)) : null;
    // Falta só mais um dia para cair (considerando que hoje termine sem estudo).
    r.risco = !r.estudouHoje && !r.pausa && r.indice > 0 &&
      (r.faltasSeguidas === FALTAS_SEGUIDAS - 1 || r.faltasMes === FALTAS_NO_MES - 1);
    return r;
  }

  // ---------- Emblemas romanos ----------
  // Cada patente deve parecer mais valiosa que a anterior: os materiais evoluem de madeira para bronze, aço, ouro e púrpura,
  // e a moldura acompanha ([cor da borda, fundo, espessura]).
  var A = '#f2c14e', A2 = '#b9851f', A3 = '#7f5a12', R = '#b3302f', R2 = '#7d1f1f', S = '#c7cedb', S2 = '#8b94a8';
  var B = '#c98f4a', B2 = '#8a5a2b', W = '#a8733f', W2 = '#6f4a26', M = '#ece7da', M2 = '#b9b4a6';

  // Imperator: dois ramos cruzados na base, com folhas pontiagudas e nervura central (o lado direito espelha o esquerdo).
  function coroaDeLouros() {
    var O = '#f4c84f', O2 = '#d39f2c', O3 = '#8f6a1a';
    function n(v) { return v.toFixed(2); }
    function folha(p) {
      var bx = p[0], by = p[1], dx = p[2] - bx, dy = p[3] - by, px = -dy * 0.27, py = dx * 0.27;
      return '<path d="M' + n(bx) + ' ' + n(by) + 'C' + n(bx + dx * 0.3 + px) + ' ' + n(by + dy * 0.3 + py) + ' ' + n(bx + dx * 0.72 + px * 0.85) + ' ' + n(by + dy * 0.72 + py * 0.85) + ' ' + n(p[2]) + ' ' + n(p[3]) + 'L' + n(bx) + ' ' + n(by) + 'Z" fill="' + O + '"/>' +
        '<path d="M' + n(bx) + ' ' + n(by) + 'C' + n(bx + dx * 0.3 - px) + ' ' + n(by + dy * 0.3 - py) + ' ' + n(bx + dx * 0.72 - px * 0.85) + ' ' + n(by + dy * 0.72 - py * 0.85) + ' ' + n(p[2]) + ' ' + n(p[3]) + 'Z" fill="' + O2 + '"/>' +
        '<path d="M' + n(bx) + ' ' + n(by) + 'L' + n(bx + dx * 0.88) + ' ' + n(by + dy * 0.88) + '" stroke="' + O3 + '" stroke-width=".35"/>';
    }
    var ramo = '<path d="M38 58.3C35.5 55.5 33 54 29.5 52.5C21 49 14 42 11.7 33C10.2 26 13 19 21.5 13.7" stroke="' + O2 + '" stroke-width="1.2" fill="none"/>' +
      '<path d="M38 58.3C36.5 56.5 35 55.3 33 54.2" stroke="' + O + '" stroke-width="1.8" fill="none"/>' +
      [[27.4, 52.3, 15.4, 53.2], [20, 49.6, 9, 46.8], [14.5, 45.3, 5.6, 38.5], [11.1, 38.7, 5.2, 30], [10.3, 31.4, 6.2, 22.2], [10.9, 24.6, 10.9, 15.4], [13.5, 18.8, 16, 11], [17.7, 13.7, 22.1, 8.9], [21.4, 13.7, 27.7, 11],
        [27.4, 50, 21.3, 41.8], [19.9, 47, 17.5, 36.7], [13.9, 41, 15.8, 30.6], [11.2, 33, 17, 24.3], [12.2, 24, 19.7, 19], [16.5, 17.7, 24, 16]].map(folha).join('');
    return '<g>' + ramo + '</g><g transform="matrix(-1 0 0 1 64 0)">' + ramo + '</g>';
  }

  var EMBLEMAS = [
    // Tiro: gládio de madeira
    '<path d="M32 4l6 9v28H26V13z" fill="' + W + '"/><path d="M32 4l6 9v28h-6z" fill="' + W2 + '"/><path d="M29 16v20M35 18v16" stroke="' + W2 + '" stroke-width="1.2"/><rect x="18" y="41" width="28" height="5" rx="2" fill="' + W2 + '"/><rect x="28.5" y="46" width="7" height="10" fill="' + W2 + '"/><circle cx="32" cy="58" r="4" fill="' + W + '"/>',
    // Miles: escudo
    '<rect x="13" y="5" width="38" height="54" rx="6" fill="' + W + '"/><rect x="32" y="5" width="19" height="54" rx="6" fill="' + W2 + '"/><rect x="13" y="5" width="38" height="54" rx="6" fill="none" stroke="' + B2 + '" stroke-width="2.5"/><path d="M32 8v48M16 32h32" stroke="' + B2 + '" stroke-width="1.5"/><circle cx="32" cy="32" r="8" fill="' + S2 + '"/><circle cx="32" cy="32" r="4" fill="' + S + '"/>',
    // Immunis: ferramentas
    '<rect x="29.5" y="6" width="5" height="52" rx="2" transform="rotate(38 32 32)" fill="' + W + '"/><rect x="29.5" y="6" width="5" height="52" rx="2" transform="rotate(-38 32 32)" fill="' + W2 + '"/><g transform="rotate(-38 32 32)"><rect x="20" y="2" width="24" height="11" rx="2" fill="' + S + '"/><rect x="20" y="9" width="24" height="4" fill="' + S2 + '"/></g><g transform="rotate(38 32 32)"><path d="M18 11c4-7 24-7 28 0l-4 2c-5-3-15-3-20 0z" fill="' + S + '"/></g><circle cx="32" cy="32" r="4" fill="' + B + '"/>',
    // Tesserarius: torre de vigia
    '<path d="M12 21h7v-8h6v8h5v-8h4v8h5v-8h6v8h7v10H12z" fill="' + M + '"/><path d="M32 13h2v8h5v-8h6v8h7v10H32z" fill="' + M2 + '"/><path d="M17 31h30l3 30H14z" fill="' + M2 + '"/><path d="M32 31h15l3 30H32z" fill="' + S2 + '"/><path d="M17 39h30M16 47h32M15 55h34M25 31v8M39 31v8M21 39v8M32 39v8M43 39v8M26 47v8M38 47v8" stroke="#7f7a6c" stroke-width="1"/><path d="M25 61V51c0-8 14-8 14 0v10z" fill="' + B2 + '"/><path d="M32 45v16M25 53h14" stroke="#5a3a1a" stroke-width="1.2"/><rect x="29" y="23" width="6" height="7" rx="3" fill="#3a2a18"/>',
    // Optio: bastão de comando
    '<rect x="29" y="12" width="6" height="48" rx="2" fill="' + W + '"/><rect x="32" y="12" width="3" height="48" fill="' + W2 + '"/><rect x="26" y="52" width="12" height="4" rx="1" fill="' + B2 + '"/><rect x="26" y="20" width="12" height="4" rx="1" fill="' + B + '"/><path d="M22 28h20l-3 12-7 5-7-5z" fill="' + R + '"/><path d="M25 31h14M26 36h12" stroke="' + B + '" stroke-width="1.5"/><circle cx="32" cy="9" r="7" fill="' + B + '"/><circle cx="30" cy="7" r="2.3" fill="' + M + '"/>',
    // Signifer: estandarte
    '<rect x="30" y="4" width="4" height="56" fill="' + W2 + '"/><path d="M26 4l6 7 6-7-2 9h-8z" fill="' + B + '"/><rect x="18" y="14" width="28" height="3.5" rx="1.5" fill="' + B2 + '"/><path d="M20 17v8M44 17v8" stroke="' + R + '" stroke-width="2.5"/><circle cx="32" cy="24" r="6.5" fill="' + B + '"/><circle cx="32" cy="24" r="3" fill="' + R + '"/><circle cx="32" cy="38" r="6.5" fill="' + B + '"/><circle cx="32" cy="38" r="3" fill="' + R + '"/><path d="M24 48c2 5 14 5 16 0l-3 8h-10z" fill="' + S + '"/>',
    // Aquilifer: águia da legião
    '<path d="M32 12c-3 0-6 3-5 6l2 4c-9-1-17-8-23-13 1 13 7 25 21 26l3 3 2-3c14-1 20-13 21-26-6 5-14 12-23 13l2-4c1-3-2-6-5-6z" fill="' + B + '"/><path d="M12 15c3 6 8 10 14 12M52 15c-3 6-8 10-14 12M15 24c3 4 7 7 12 8M49 24c-3 4-7 7-12 8" stroke="' + B2 + '" stroke-width="1.6" fill="none"/><path d="M27 13l-5 2 5 2z" fill="' + B2 + '"/><circle cx="30" cy="16" r="1.3" fill="#2e2614"/><rect x="30" y="38" width="4" height="22" fill="' + W2 + '"/><path d="M20 42c0 4 24 4 24 0v3c0 4-24 4-24 0z" fill="' + R + '"/><rect x="22" y="56" width="20" height="4" rx="1" fill="' + B2 + '"/>',
    // Centurio: elmo com crista transversal
    '<path d="M6 16C14 4 50 4 58 16l-3 5C45 12 19 12 9 21z" fill="' + R + '"/><path d="M12 13l3 6M20 10l2 6M28 8l1 6M36 8l-1 6M44 10l-2 6M52 13l-3 6" stroke="' + R2 + '" stroke-width="1.5"/><path d="M14 40c-2-14 6-23 18-23s20 9 18 23l-3 4-5-2-1 12-9 3-9-3-1-12-5 2z" fill="' + S + '"/><path d="M32 17c12 0 20 9 18 23l-3 4-5-2-1 12-9 3z" fill="' + S2 + '"/><rect x="18" y="29" width="28" height="3.5" fill="' + B + '"/><path d="M21 36h8l-1 13-5-2zM43 36h-8l1 13 5-2z" fill="' + B2 + '"/>',
    // Primus Pilus: elmo com medalha
    '<path d="M6 13C14 2 50 2 58 13l-3 5C45 9 19 9 9 18z" fill="' + R + '"/><path d="M12 10l3 6M20 7l2 6M28 5l1 6M36 5l-1 6M44 7l-2 6M52 10l-3 6" stroke="' + R2 + '" stroke-width="1.5"/><path d="M15 33c-2-12 6-19 17-19s19 7 17 19l-3 3-5-2-1 8-8 2-8-2-1-8-5 2z" fill="' + S + '"/><path d="M32 14c11 0 19 7 17 19l-3 3-5-2-1 8-8 2z" fill="' + S2 + '"/><rect x="19" y="24" width="26" height="3" fill="' + A2 + '"/><circle cx="32" cy="53" r="9" fill="' + S + '"/><circle cx="32" cy="53" r="6" fill="' + A + '"/><path d="M32 49l1.3 2.7 3 .4-2.2 2 .6 3-2.7-1.5-2.7 1.5.6-3-2.2-2 3-.4z" fill="' + R2 + '"/>',
    // Tribunus: couraça
    '<path d="M16 6c5 4 11 6 16 6s11-2 16-6l7 12-7 6v18H16V24L9 18z" fill="' + S + '"/><path d="M32 12c5 0 11-2 16-6l7 12-7 6v18H32z" fill="' + S2 + '"/><path d="M32 16v26M20 25c4 4 20 4 24 0M21 33c4 2 18 2 22 0" stroke="#5f6678" stroke-width="1.6" fill="none"/><circle cx="32" cy="20" r="3.5" fill="' + A + '"/><rect x="14" y="42" width="36" height="4" fill="' + A + '"/><path d="M15 46h6l-1 12h-5zM23 46h6v13h-6zM35 46h6v13h-6zM43 46h6v12h-5z" fill="' + R + '"/>',
    // Quaestor: moeda de ouro com águia
    '<circle cx="32" cy="32" r="28" fill="' + A2 + '"/><circle cx="32" cy="32" r="25" fill="' + A + '"/><circle cx="32" cy="32" r="21" fill="none" stroke="' + A2 + '" stroke-width="1.5" stroke-dasharray="2.5 2.5"/><path d="M32 17c-2 0-4 2-3.5 4l1.5 3c-6-.5-11-5-15-8.500.5 8.500 5 16.500 14 17l3 2.500 3-2.500c9-.5 13.500-8.500 14-17-4 3.500-9 8-15 8.500l1.500-3c.5-2-1.500-4-3.500-4z" fill="' + A3 + '"/><rect x="30.5" y="35" width="3" height="10" fill="' + A3 + '"/><path d="M24 46h16" stroke="' + A3 + '" stroke-width="2.5" stroke-linecap="round"/>',
    // Aedilis: templo
    '<path d="M32 6L58 22H6z" fill="' + A + '"/><path d="M32 11l16 9H16z" fill="' + A2 + '"/><circle cx="32" cy="17" r="2.5" fill="' + R + '"/><rect x="7" y="22" width="50" height="4" fill="' + A2 + '"/><g fill="' + M + '"><rect x="11" y="28" width="6" height="21"/><rect x="23" y="28" width="6" height="21"/><rect x="35" y="28" width="6" height="21"/><rect x="47" y="28" width="6" height="21"/></g><g fill="' + M2 + '"><rect x="14.5" y="28" width="2.5" height="21"/><rect x="26.5" y="28" width="2.5" height="21"/><rect x="38.5" y="28" width="2.5" height="21"/><rect x="50.5" y="28" width="2.5" height="21"/></g><rect x="6" y="49" width="52" height="4" fill="' + A2 + '"/><rect x="3" y="53" width="58" height="5" fill="' + A + '"/>',
    // Praetor: a Justiça vendada, com balança e espada
    '<path d="M2 10h22" stroke="' + A + '" stroke-width="2" stroke-linecap="round"/><path d="M4 10L1 23M4 10l6 13M22 10l-4 13M22 10l5 13" stroke="' + A2 + '" stroke-width="1"/><path d="M0 23h11c0 6-11 6-11 0zM17 23h11c0 6-11 6-11 0z" fill="' + A + '"/><path d="M27 21L13 15" stroke="' + A + '" stroke-width="3.5" stroke-linecap="round"/><circle cx="13" cy="11" r="2" fill="' + A + '"/><path d="M26 11c0-7 12-7 12 0l1 8h-14z" fill="' + A3 + '"/><circle cx="32" cy="4.5" r="3" fill="' + A3 + '"/><circle cx="32" cy="11.5" r="5.5" fill="' + A + '"/><rect x="26" y="9.3" width="12" height="3.4" rx="1" fill="' + M + '"/><path d="M38 11l6-1-1 4zM38 12l5 4-3 2z" fill="' + M + '"/><rect x="30" y="16" width="4" height="4" fill="' + A2 + '"/><path d="M25 21c3-3 11-3 14 0l4 16 6 22H15l6-22z" fill="' + A + '"/><path d="M32 22l2 37H15l6-22 4-16c2-2 4-2.5 7-2z" fill="#f4c84f"/><path d="M28 28l-3 31M36 28l3 31M32 34v25" stroke="' + A2 + '" stroke-width="1.1"/><rect x="24" y="30" width="16" height="3" fill="' + R + '"/><path d="M38 21l10 11" stroke="' + A2 + '" stroke-width="3.5" stroke-linecap="round"/><rect x="43" y="33" width="10" height="2.2" rx="1" fill="' + A2 + '"/><rect x="47" y="28" width="2.2" height="5" fill="' + A3 + '"/><path d="M46.500 35.200h3.200l-.2 21-1.400 3-1.400-3z" fill="' + S + '"/><rect x="11" y="59" width="42" height="4" rx="1" fill="' + M + '"/>',
    // Legatus: bandeira de comando
    '<rect x="30" y="3" width="4" height="58" fill="' + A2 + '"/><circle cx="32" cy="5" r="3.5" fill="' + A + '"/><rect x="10" y="10" width="44" height="4" rx="2" fill="' + A + '"/><rect x="12" y="14" width="40" height="30" fill="' + R + '"/><rect x="15" y="17" width="34" height="24" fill="none" stroke="' + A + '" stroke-width="1.5"/><path d="M32 21c-1.5 0-3 1.5-2.5 3l1 2c-5-.5-9-4-12-6.5.5 6.5 3.5 12.5 10.5 13l3 2 3-2c7-.5 10-6.5 10.5-13-3 2.5-7 6-12 6.5l1-2c.5-1.5-1-3-2.5-3z" fill="' + A + '"/><path d="M12 44v9M18 44v9M24 44v9M40 44v9M46 44v9M52 44v9" stroke="' + A + '" stroke-width="2"/>',
    // Consul: placa SPQR entre louros
    '<path d="M7 44c1-14 3-27 9-38" stroke="' + A2 + '" stroke-width="3.5" fill="none" stroke-dasharray="4 2"/><path d="M57 44c-1-14-3-27-9-38" stroke="' + A2 + '" stroke-width="3.5" fill="none" stroke-dasharray="4 2"/><path d="M13 13h38v28c0 9-13 14-19 18-6-4-19-9-19-18z" fill="' + R + '"/><path d="M13 13h38v28c0 9-13 14-19 18-6-4-19-9-19-18z" fill="none" stroke="' + A + '" stroke-width="2.5"/><text x="32" y="29" font-family="Georgia,serif" font-size="13" font-weight="700" text-anchor="middle" fill="' + A + '">SP</text><text x="32" y="43" font-family="Georgia,serif" font-size="13" font-weight="700" text-anchor="middle" fill="' + A + '">QR</text>',
    // Imperator: coroa de louros
    coroaDeLouros()
  ];

  var MOLDURAS = [
    ['#3c425c', '#252a3d', 1], ['#3c425c', '#252a3d', 1], ['#3c425c', '#252a3d', 1], ['#3c425c', '#252a3d', 1],
    ['#8a5a2b', '#2a2620', 1], ['#8a5a2b', '#2a2620', 1], ['#c98f4a', '#2f2a22', 1.5],
    ['#8b94a8', '#262b3f', 1.5], ['#8b94a8', '#262b3f', 1.5], ['#c7cedb', '#2a3047', 2],
    ['#b9851f', '#2a2417', 1.5], ['#b9851f', '#2a2417', 1.5], ['#f2c14e', '#2e2614', 2], ['#f2c14e', '#2e2614', 2],
    ['#f2c14e', '#2a1f45', 2.5], ['#f2c14e', '#2c1f4a', 3.5]
  ];

  function insignia(i, classe) {
    var q = MOLDURAS[i];
    return el('span', { class: 'insignia' + (classe ? ' ' + classe : ''), title: LISTA[i].nome,
      style: { borderColor: q[0], background: q[1], borderWidth: q[2] + 'px' },
      html: '<svg viewBox="0 0 64 64" aria-hidden="true">' + EMBLEMAS[i] + '</svg>' });
  }

  // ---------- Textos da próxima patente ----------
  function textoProxima(r) {
    if (!r.proxima) return 'Topo alcançado';
    return r.faltam ? 'Faltam ' + UI.fmtNum(r.faltam) + ' XP para ' + r.proxima.nome : 'XP completo para ' + r.proxima.nome;
  }

  function textoExigencia(req) { return 'Acerto acima de ' + req.acerto + '% nas últimas ' + UI.fmtNum(req.questoes) + ' questões'; }

  // Ex.: "Acerto acima de 80% nas últimas 500 questões: agora 78,3%".
  function textoRequisito(r) {
    var q = r.requisito;
    if (!q) return '';
    var txt = textoExigencia({ acerto: q.exigido, questoes: q.janela });
    if (q.questoes < q.janela) return txt + ': você tem ' + UI.fmtNum(q.questoes) + ' de ' + UI.fmtNum(q.janela);
    return txt + ': agora ' + UI.fmtPct(Math.round(q.pct * 10) / 10) + (q.ok ? ' ✓' : '');
  }

  // ---------- Janelas de aviso ----------
  function janela(titulo, indice, texto, extra) {
    return UI.modal(titulo, el('div', { class: 'aviso-patente' }, [
      insignia(indice, 'grande'),
      el('div', { class: 'aviso-patente-nome', text: LISTA[indice].nome }),
      el('p', { text: texto }),
      extra || null
    ]), [{ texto: 'Continuar', classe: 'btn-primario' }]);
  }

  function promocao(r) {
    var txt = r.proxima
      ? 'Você chegou a ' + UI.fmtNum(r.xp) + ' XP. ' + textoProxima(r) + '.' + (r.requisito ? ' ' + textoRequisito(r) + '.' : '')
      : 'Você chegou ao topo. Não há patente acima desta.';
    janela('Promoção!', r.indice, txt);
  }

  function marcarVista(i) {
    try { localStorage.setItem(CHAVE_VISTA, String(i)); } catch (e) { /* só deixaria o aviso aparecer de novo */ }
  }

  // Compara com a patente que este aparelho mostrou por último e avisa uma vez.
  function conferirAvisos() {
    if (Dados.estaVazio() || document.querySelector('.modal-fundo, .tela-login')) return;
    if (window.Nuvem && Nuvem.ativa()) {
      var estado = Nuvem.info().estado;
      if (estado !== 'sincronizado' && estado !== 'offline') return; // espera os dados da nuvem
    }
    var r = calcular(), vista = null;
    try { vista = localStorage.getItem(CHAVE_VISTA); } catch (e) { return; }
    if (vista === null) {
      marcarVista(r.indice);
      janela('Sua patente', r.indice, 'Seu histórico de estudos rendeu ' + UI.fmtNum(r.xp) + ' XP. Daqui em diante, cada estudo lançado aproxima você do Imperator.' +
        'Atenção: 3 dias seguidos ou 5 dias no mês sem estudar rebaixam uma patente.');
      return;
    }
    vista = Number(vista);
    if (r.indice === vista) return;
    marcarVista(r.indice);
    if (r.indice > vista) { promocao(r); return; }
    var ultimo = r.eventos[r.eventos.length - 1];
    var motivo = ultimo && ultimo.tipo === 'rebaixamento' && ultimo.para === r.indice
      ? 'Motivo: ' + ultimo.motivo + '.' : 'Seu XP diminuiu porque o histórico de estudos foi alterado.';
    janela('Rebaixamento', r.indice, motivo + ' Você está com ' + UI.fmtNum(r.xp) + ' XP. ' + textoProxima(r) + '.' + (r.requisito ? ' ' + textoRequisito(r) + '.' : ''));
  }

  // ---------- Depois de lançar um estudo ----------
  function aposLancar(antes) {
    var r = calcular();
    if (r.indice > antes.indice) { marcarVista(r.indice); promocao(r); }
    return r.xp - antes.xp;
  }

  // ---------- Janela "Minha patente" ----------
  function abrir() {
    var r = calcular();
    var f = r.fontes;
    var fontes = [
      ['Tempo de estudo', f.tempo], ['Questões resolvidas', f.questoes], ['Acertos', f.acertos],
      ['Tópicos concluídos', f.topicos], ['Baterias e etapas concluídas', f.etapas],
      ['Metas semanais', f.metas], ['Sequência de estudos', f.sequencia]
    ];
    var corpo = [
      el('div', { class: 'patente-atual' }, [
        insignia(r.indice, 'grande'),
        el('div', { class: 'patente-atual-texto' }, [
          el('div', { class: 'aviso-patente-nome', text: r.patente.nome }),
          el('div', { class: 'data-fraca', text: UI.fmtNum(r.xp) + ' XP · ' + textoProxima(r) }),
          UI.barra(r.pct),
          r.requisito ? el('div', { class: 'patente-requisito' + (r.requisito.ok ? ' ok' : ''), text: textoRequisito(r) }) : null
        ])
      ]),
      el('div', { class: 'patente-faltas' + (r.risco ? ' risco' : '') }, [
        el('strong', { text: 'Faltas: ' + r.faltasSeguidas + ' de ' + FALTAS_SEGUIDAS + ' seguidas · ' + r.faltasMes + ' de ' + FALTAS_NO_MES + ' neste mês' }),
        el('span', { text: r.risco ? 'Se hoje terminar sem estudo, você será rebaixado.' : 'Ao chegar em ' + FALTAS_SEGUIDAS + ' seguidas ou ' + FALTAS_NO_MES + ' no mês, você perde uma patente. Lançar um estudo com data passada apaga a falta daquele dia.' })
      ]),
      painelPausas(),
      el('h3', { class: 'patente-titulo', text: 'De onde veio seu XP' }),
      el('div', { class: 'patente-fontes' }, fontes.map(function (x) {
        return el('div', null, [el('span', { text: x[0] }), el('strong', { text: UI.fmtNum(x[1]) })]);
      }).concat(f.perdido ? [el('div', { class: 'perda' }, [el('span', { text: 'Perdido em rebaixamentos' }), el('strong', { text: '−' + UI.fmtNum(f.perdido) })])] : [])),
      el('h3', { class: 'patente-titulo', text: 'Patentes' }),
      el('ol', { class: 'patente-lista' }, LISTA.map(function (p) {
        return el('li', { class: p.indice === r.indice ? 'atual' : p.indice < r.indice ? 'alcancada' : '' }, [
          insignia(p.indice),
          el('span', { class: 'patente-lista-nome' }, [
            el('span', { text: p.nome }),
            p.requisito ? el('span', { class: 'patente-requisito', text: p.requisito.acerto + '%+ nas últimas ' + UI.fmtNum(p.requisito.questoes) }) : null
          ]),
          el('span', { class: 'data-fraca', text: UI.fmtNum(p.xp) + ' XP' })
        ]);
      })),
      r.eventos.length ? el('h3', { class: 'patente-titulo', text: 'Histórico' }) : null,
      r.eventos.length ? el('ul', { class: 'patente-eventos' }, r.eventos.slice(-20).reverse().map(function (e) {
        var sobe = e.tipo === 'promocao';
        return el('li', { class: sobe ? '' : 'perda' }, [
          el('span', { class: 'data-fraca', text: UI.fmtData(e.data) }),
          el('span', { text: (sobe ? 'Promovido a ' : 'Rebaixado a ') + LISTA[e.para].nome + (e.motivo ? ' (' + e.motivo + ')' : '') })
        ]);
      })) : null
    ];
    var m = UI.modal('Minha patente', corpo, [{ texto: 'Fechar', classe: 'btn-secundario' }]);
    m.caixa.classList.add('modal-largo');
    janelaAberta = m;
  }
  var janelaAberta = null;

  function reabrir() {
    if (janelaAberta) janelaAberta.fechar();
    App.atualizar();
    abrir();
  }

  // Pausa programada: de hoje em diante, para doença, viagem ou prova.
  function painelPausas() {
    var hoje = UI.hoje();
    var vigentes = (Dados.db.pausas || []).filter(function (p) { return p.fim >= hoje; })
      .sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; });
    var inicio = el('input', { type: 'date', value: hoje, min: hoje });
    var fim = el('input', { type: 'date', value: hoje, min: hoje });
    var motivo = el('input', { type: 'text', placeholder: 'Ex.: viagem, doença, prova' });
    return el('div', { class: 'patente-pausas' }, [
      el('h3', { class: 'patente-titulo', text: 'Pausa programada' }),
      el('p', { class: 'campo-ajuda', text: 'Para doença, viagem ou prova. Nos dias da pausa não há falta e a sequência fica congelada. Não vale para dias que já passaram.' }),
      vigentes.length ? el('ul', { class: 'patente-eventos' }, vigentes.map(function (p) {
        return el('li', null, [
          el('span', { text: UI.fmtData(p.inicio) + ' a ' + UI.fmtData(p.fim) + (p.motivo ? ' · ' + p.motivo : '') }),
          el('button', { type: 'button', class: 'link link-perigo', text: p.inicio <= hoje ? 'Encerrar' : 'Cancelar', onclick: function () {
            Dados.encerrarPausa(p.id);
            reabrir();
          } })
        ]);
      })) : null,
      el('div', { class: 'patente-pausa-form' }, [
        UI.campo('Início', inicio), UI.campo('Fim', fim), UI.campo('Motivo (opcional)', motivo),
        UI.botao('Programar pausa', function () {
          if (!inicio.value || !fim.value || inicio.value < hoje || fim.value < inicio.value) { UI.aviso('Confira as datas da pausa'); return; }
          Dados.criarPausa({ inicio: inicio.value, fim: fim.value, motivo: motivo.value.trim() });
          reabrir();
          UI.aviso('Pausa programada');
        }, 'btn-secundario')
      ])
    ]);
  }

  return {
    LISTA: LISTA, ATIVACAO: ATIVACAO,
    calcular: calcular, insignia: insignia, abrir: abrir, textoProxima: textoProxima, textoRequisito: textoRequisito, conferirAvisos: conferirAvisos, aposLancar: aposLancar
  };
})();
