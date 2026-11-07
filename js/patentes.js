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

  var XP = { QUESTAO: 1, TOPICO: 20, ETAPA: 50, META: 200, SEQUENCIA_MAX: 100 };
  // Bônus por desempenho: o acerto de cada bateria (caderno lançado num estudo) multiplica o XP das questões.
  // Baterias com menos de BONUS_MINIMO questões valem sempre 1×.
  var BONUS = [[90, 2], [85, 1.75], [80, 1.5]], BONUS_MINIMO = 10;

  function multiplicador(n, acertos) {
    if (n < BONUS_MINIMO) return 1;
    var pct = acertos / n * 100;
    for (var i = 0; i < BONUS.length; i++) if (pct >= BONUS[i][0]) return BONUS[i][1];
    return 1;
  }
  function xpDaBateria(n, acertos) { return Math.round(n * XP.QUESTAO * multiplicador(n, acertos)); }
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
  // Guarda também o ganho de cada estudo lançado, para mostrar o XP do dia por atividade.
  function ganhosPorDia() {
    var db = Dados.db, dias = {}, acum = {};
    function dia(d) { return dias[d] || (dias[d] = { sessoes: 0, segundos: 0, minutos: 0, questoes: 0, acertos: 0, bonus: 0, topicos: 0, etapas: 0, linhas: [], registros: [], topicosAvulsos: 0 }); }
    db.sessoes.slice().sort(function (a, b) {
      return a.data === b.data ? (a.criadoEm || 0) - (b.criadoEm || 0) : (a.data < b.data ? -1 : 1);
    }).forEach(function (s) {
      var g = dia(s.data);
      var reg = { sessao: s, minutos: Math.round((s.segundos || 0) / 60), questoes: 0, acertos: 0, bonus: 0, baterias: [], etapas: 0, topicos: 0 };
      g.sessoes++;
      g.segundos += s.segundos || 0;
      g.minutos += reg.minutos;
      (s.cadernos || []).forEach(function (l) {
        var a = Number(l.acertos) || 0, n = a + (Number(l.erros) || 0);
        g.questoes += n;
        g.acertos += a;
        reg.questoes += n;
        reg.acertos += a;
        if (n) {
          g.linhas.push({ n: n, a: a });
          var xpBat = xpDaBateria(n, a), extra = xpBat - n * XP.QUESTAO;
          g.bonus += extra;
          reg.bonus += extra;
          reg.baterias.push({ n: n, a: a, mult: multiplicador(n, a), xp: xpBat });
        }
        if (!l.cadernoId) return;
        // Cada rodada das favoritadas tem contagem própria.
        var chaveAcum = l.rodada ? l.cadernoId + '|' + l.rodada : l.cadernoId;
        var antes = acum[chaveAcum] || 0, depois = antes + n;
        acum[chaveAcum] = depois;
        var e = etapasConcluidas(s.disciplinaId, l, antes, depois);
        g.etapas += e;
        reg.etapas += e;
      });
      g.registros.push(reg);
    });
    var primeira = Object.keys(dias).sort()[0];
    db.topicos.forEach(function (t) {
      if (!t.concluido) return;
      var g = dia(t.dataConclusao || primeira || UI.hoje());
      g.topicos++;
      // O tópico vai para o estudo de teoria do mesmo dia que o marcou; sem ele, aparece à parte.
      var dono = g.registros.filter(function (x) { return (x.sessao.topicoIds || []).indexOf(t.id) >= 0; })[0];
      if (dono) dono.topicos++; else g.topicosAvulsos++;
    });
    return dias;
  }

  function xpDoRegistro(x) {
    return x.minutos + x.questoes * XP.QUESTAO + x.bonus + x.etapas * XP.ETAPA + x.topicos * XP.TOPICO;
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
    // Terminar o restante do caderno, além das 3 baterias, também conta como etapa (mantém o XP de quem fez a antiga 4ª bateria).
    var total = c.totalQuestoes || 0;
    if (ate < total && antes < total && depois >= total) n++;
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
      fontes: { tempo: 0, questoes: 0, bonus: 0, topicos: 0, etapas: 0, metas: 0, sequencia: 0, perdido: 0, limite: 0 },
      faltasMes: 0, faltasSeguidas: 0, pausa: pausaEm(hoje),
      dias: {} // XP de cada dia: { registros, topicosAvulsos, meta, sequencia, limite, rebaixamento }
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
      var dd = r.dias[data] || (r.dias[data] = { registros: [], topicosAvulsos: 0, meta: 0, sequencia: 0, limite: 0, rebaixamento: 0 });
      dd.rebaixamento += r.xp - novo;
      r.xp = novo;
      evento(data, 'rebaixamento', indice, indice - 1, motivo);
      indice--;
    }

    for (var d = datas[0] || hoje; d <= hoje; d = UI.somarDias(d, 1)) {
      var g = dias[d], estudou = !!(g && g.sessoes), pausado = !!pausaEm(d), xpAntes = r.xp;
      if (d.slice(0, 7) !== mesAtual) { mesAtual = d.slice(0, 7); faltasMes = []; }

      if (g) {
        var f = r.fontes;
        var tempo = g.minutos, questoes = g.questoes * XP.QUESTAO, bonus = g.bonus;
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
        f.tempo += tempo; f.questoes += questoes; f.bonus += bonus; f.topicos += topicos;
        f.etapas += etapas; f.metas += bonusMeta; f.sequencia += bonusSeq;
        r.xp += tempo + questoes + bonus + topicos + etapas + bonusMeta + bonusSeq;
        historico = historico.concat(g.linhas);
        promover(d);
        // Sem o acerto exigido, a patente fica travada e o XP não passa do início da próxima: o excedente é perdido.
        var teto = LISTA[indice + 1] ? LISTA[indice + 1].xp : Infinity, corte = 0;
        if (r.xp > teto) { corte = r.xp - Math.max(teto, xpAntes); r.xp = Math.max(teto, xpAntes); f.limite += corte; }
        r.dias[d] = { registros: g.registros, topicosAvulsos: g.topicosAvulsos, meta: bonusMeta, sequencia: bonusSeq, limite: corte, rebaixamento: 0 };
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
    r.travado = !!(r.requisito && !r.requisito.ok && r.xp >= r.proxima.xp);
    var hojeXp = r.dias[hoje];
    r.xpHoje = hojeXp ? totalDoDia(hojeXp) : 0;
    r.risco = !r.estudouHoje && !r.pausa && r.indice > 0 &&
      (r.faltasSeguidas === FALTAS_SEGUIDAS - 1 || r.faltasMes === FALTAS_NO_MES - 1);
    return r;
  }

  // ---------- Emblemas romanos ----------
  // Cada patente deve parecer mais valiosa que a anterior: os materiais evoluem de madeira para bronze, aço, ouro e púrpura,
  // e a moldura acompanha ([cor da borda, fundo, espessura]). Estilo: contorno preto grosso, poucas cores e sombras chapadas.
  var K = '#14100e', V = '#b01e3c', V2 = '#6f1226', O = '#e8b13a', O1 = '#f7d774', O2 = '#9c6a17';
  var A = '#b9bfc9', A1 = '#e3e6ec', A2 = '#5b6069', B = '#cd8f45', B1 = '#ecbd7c', B2 = '#85551f';
  var W = '#a8733f', W1 = '#c99a63', W2 = '#6b4522', M = '#ece7da', M2 = '#a9a497';

  function traco(w) { return ' stroke="' + K + '" stroke-width="' + (w || 1.7) + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function fino(w) { return ' fill="none"' + traco(w || 1.2); }

  // Imperator: dois ramos cruzados na base, com folhas pontiagudas (o lado direito espelha o esquerdo).
  function coroaDeLouros() {
    function n(v) { return v.toFixed(1); }
    function folha(p) {
      var bx = p[0], by = p[1], dx = p[2] - bx, dy = p[3] - by, px = -dy * 0.3, py = dx * 0.3;
      var cima = 'M' + n(bx) + ' ' + n(by) + 'C' + n(bx + dx * .3 + px) + ' ' + n(by + dy * .3 + py) + ' ' + n(bx + dx * .72 + px * .85) + ' ' + n(by + dy * .72 + py * .85) + ' ' + n(p[2]) + ' ' + n(p[3]);
      var baixo = 'C' + n(bx + dx * .72 - px * .85) + ' ' + n(by + dy * .72 - py * .85) + ' ' + n(bx + dx * .3 - px) + ' ' + n(by + dy * .3 - py) + ' ' + n(bx) + ' ' + n(by) + 'Z';
      return '<path d="' + cima + baixo + '" fill="' + O + '"' + traco(1.1) + '/>' +
        '<path d="M' + n(bx) + ' ' + n(by) + 'C' + n(bx + dx * .3 - px) + ' ' + n(by + dy * .3 - py) + ' ' + n(bx + dx * .72 - px * .85) + ' ' + n(by + dy * .72 - py * .85) + ' ' + n(p[2]) + ' ' + n(p[3]) + 'Z" fill="' + O2 + '"/>';
    }
    var ramo = '<path d="M38 58C35 55 33 54 29 52C21 49 14 42 12 33C10 26 13 19 21 14" stroke="' + K + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      [[27, 52, 15, 54], [20, 49, 8, 47], [14, 44, 4, 37], [11, 37, 4, 28], [11, 29, 7, 19], [13, 22, 15, 11], [17, 17, 24, 8],
       [26, 50, 22, 40], [18, 45, 19, 34], [13, 36, 20, 28], [14, 27, 23, 22]].map(folha).join('');
    return '<g>' + ramo + '</g><g transform="matrix(-1 0 0 1 64 0)">' + ramo + '</g>';
  }

  // Elmo de perfil com crista (Centurio e, menor, Primus Pilus).
  var ELMO = '<path d="M41 14C36 2 15 0 8 14C4 23 5 36 9 47C11 38 13 31 18 26C25 18 33 15 41 14Z" fill="' + V + '"' + traco(1.8) + '/>' +
    '<path d="M8 15C4 23 5 36 9 47C11 38 13 31 18 26C14 26 10 22 8 15Z" fill="' + V2 + '"/>' +
    '<path d="M14 9l3 7M21 5l3 8M29 3l1 8M36 6l-2 7" stroke="' + K + '" stroke-width="1.3" stroke-linecap="round"/>' +
    '<path d="M19 34L18 46L31 52L33 36Z" fill="' + A2 + '"' + traco(1.7) + '/>' +
    '<path d="M33 34L53 35L50 42H43L42 57L33 50Z" fill="' + A + '"' + traco(1.7) + '/>' +
    '<path d="M33 40L38 42L37 54L33 50Z" fill="' + A2 + '"/>' +
    '<path d="M18 36C16 23 27 13 39 14C48 15 53 22 54 30L59 36L44 35C35 33 26 34 18 36Z" fill="' + O + '"' + traco(1.8) + '/>' +
    '<path d="M18 36C17 28 21 22 26 18C24 24 25 28 29 34C25 34 21 35 18 36Z" fill="' + O2 + '"/>' +
    '<path d="M33 19C39 17 45 20 48 25C43 23 38 22 33 19Z" fill="' + O1 + '"/>' +
    '<circle cx="30" cy="37" r="4.5" fill="' + A1 + '"' + traco(1.6) + '/><circle cx="30" cy="37" r="1.5" fill="' + K + '"/>';

  // Águia de asas abertas, usada no Quaestor e no Legatus.
  function aguia(cor) {
    return '<path d="M32 21c-1.500 0-3 1.500-2.500 3l1 2c-5-.5-9-4-12-6.500.5 6.500 3.500 12.500 10.500 13l3 2 3-2c7-.5 10-6.500 10.500-13-3 2.500-7 6-12 6.500l1-2c.5-1.500-1-3-2.500-3z" fill="' + cor + '"' + traco(1.1) + '/>';
  }

  var EMBLEMAS = [
    // Tiro: gládio de madeira
    '<path d="M32 3l7 10v27H25V13z" fill="' + W + '"' + traco(2) + '/><path d="M32 4l6 9.500V39h-6z" fill="' + W2 + '"/><path d="M32 3l7 10v27H25V13z" fill="none"' + traco(2) + '/>' +
    '<path d="M28.500 15v19" stroke="' + W1 + '" stroke-width="1.6" stroke-linecap="round"/>' +
    '<rect x="29" y="44" width="6" height="12" fill="' + W2 + '"' + traco(1.7) + '/><rect x="17" y="40" width="30" height="6" rx="2" fill="' + W + '"' + traco(1.8) + '/><circle cx="32" cy="58" r="4" fill="' + W + '"' + traco(1.7) + '/>',
    // Miles: escudo de madeira
    '<rect x="13" y="5" width="38" height="54" rx="7" fill="' + W + '"' + traco(2) + '/><path d="M38 6h6a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6h-6z" fill="' + W2 + '"/>' +
    '<rect x="17" y="9" width="30" height="46" rx="4" fill="none" stroke="' + A2 + '" stroke-width="2"/><path d="M32 10v44M18 32h28" stroke="' + K + '" stroke-width="1.4"/>' +
    '<circle cx="32" cy="32" r="8.5" fill="' + A + '"' + traco(1.8) + '/><path d="M32 23.500a8.500 8.500 0 0 1 0 17z" fill="' + A2 + '"/><circle cx="29.500" cy="29.500" r="2" fill="' + A1 + '"/>',
    // Immunis: martelo e picareta cruzados
    '<g transform="rotate(-38 32 32)"><rect x="29" y="8" width="6" height="52" rx="2" fill="' + W + '"' + traco(1.7) + '/><path d="M15 15C21 3 43 3 49 15L44 17C39 11 25 11 20 17Z" fill="' + A + '"' + traco(1.8) + '/></g>' +
    '<g transform="rotate(38 32 32)"><rect x="29" y="8" width="6" height="52" rx="2" fill="' + W2 + '"' + traco(1.7) + '/><rect x="19" y="2" width="26" height="13" rx="2" fill="' + A + '"' + traco(1.8) + '/><rect x="20" y="10" width="24" height="4" fill="' + A2 + '"/><rect x="19" y="2" width="26" height="13" rx="2" fill="none"' + traco(1.8) + '/></g>' +
    '<circle cx="32" cy="33" r="4" fill="' + B + '"' + traco(1.5) + '/>',
    // Tesserarius: torre de vigia
    '<path d="M17 30h30l3 31H14z" fill="' + M2 + '"' + traco(1.8) + '/><path d="M36 31h11l2.800 29H36z" fill="#77736a"/>' +
    '<path d="M17 39h30M16 48h32" stroke="' + K + '" stroke-width="1.2"/>' +
    '<path d="M11 20h7v-8h7v8h4v-8h6v8h4v-8h7v8h7v11H11z" fill="' + M + '"' + traco(1.9) + '/><path d="M39 21v-8h7v8h7v9H39z" fill="' + M2 + '"/><path d="M11 20h7v-8h7v8h4v-8h6v8h4v-8h7v8h7v11H11z" fill="none"' + traco(1.9) + '/>' +
    '<path d="M25 61V51c0-8 14-8 14 0v10z" fill="' + W2 + '"' + traco(1.6) + '/><rect x="29" y="33" width="6" height="8" rx="3" fill="' + K + '"/>',
    // Optio: bastão de comando
    '<rect x="29" y="12" width="6" height="49" rx="2" fill="' + W + '"' + traco(1.7) + '/><rect x="32" y="13" width="2.200" height="47" fill="' + W2 + '"/>' +
    '<path d="M21 26h22l-3 13-8 6-8-6z" fill="' + V2 + '"' + traco(1.8) + '/><path d="M32 27h10l-2.500 11.500L32 44z" fill="#4e0d1b"/>' +
    '<rect x="25" y="20" width="14" height="5" rx="1.500" fill="' + B + '"' + traco(1.5) + '/><rect x="25" y="51" width="14" height="5" rx="1.500" fill="' + B + '"' + traco(1.5) + '/>' +
    '<circle cx="32" cy="10" r="7.5" fill="' + B + '"' + traco(1.8) + '/><path d="M32 3a7 7 0 0 1 0 14z" fill="' + B2 + '"/><circle cx="29.500" cy="7.500" r="2" fill="' + B1 + '"/>',
    // Signifer: estandarte
    '<rect x="30" y="8" width="4" height="53" fill="' + W2 + '"' + traco(1.5) + '/><path d="M32 2l5 9h-10z" fill="' + B + '"' + traco(1.6) + '/>' +
    '<rect x="16" y="13" width="32" height="4.500" rx="2" fill="' + B2 + '"' + traco(1.5) + '/>' +
    '<circle cx="32" cy="26" r="7.5" fill="' + B + '"' + traco(1.7) + '/><circle cx="32" cy="26" r="3" fill="' + V + '"' + traco(1.1) + '/>' +
    '<circle cx="32" cy="41" r="7.5" fill="' + B + '"' + traco(1.7) + '/><circle cx="32" cy="41" r="3" fill="' + V + '"' + traco(1.1) + '/>' +
    '<path d="M22 51c3 5 17 5 20 0l-3 8H25z" fill="' + B1 + '"' + traco(1.5) + '/>',
    // Aquilifer: águia da legião
    '<rect x="29.500" y="36" width="5" height="25" fill="' + W + '"' + traco(1.6) + '/>' +
    '<path d="M32 13c-3 0-6 3-5 6l2 3C20 21 11 14 4 8c1 14 8 27 22 28l6 5 6-5c14-1 21-14 22-28-7 6-16 13-25 14l2-3c1-3-2-6-5-6z" fill="' + B + '"' + traco(1.8) + '/>' +
    '<path d="M60 8c-1 14-8 27-22 28l-6 5v-19l3 0c9-1 18-8 25-14z" fill="' + B2 + '"/><path d="M60 8c-1 14-8 27-22 28l-6 5" fill="none"' + traco(1.8) + '/>' +
    '<path d="M11 18c4 5 9 9 15 11M16 28c3 2 7 4 11 4M53 18c-4 5-9 9-15 11M48 28c-3 2-7 4-11 4"' + fino(1.3) + '/>' +
    '<path d="M27 14l-6 2.500 6 2z" fill="' + B1 + '"' + traco(1.2) + '/><circle cx="30" cy="17" r="1.3" fill="' + K + '"/>' +
    '<path d="M21 44c0 4 22 4 22 0v4c0 4-22 4-22 0z" fill="' + V + '"' + traco(1.5) + '/>',
    // Centurio: elmo de perfil com crista
    ELMO,
    // Primus Pilus: elmo com medalha de ouro
    '<g transform="translate(6 -1) scale(.8)">' + ELMO + '</g>' +
    '<path d="M26 46l-3-9h6l3 6 3-6h6l-3 9z" fill="' + V + '"' + traco(1.4) + '/>' +
    '<circle cx="32" cy="52" r="10" fill="' + O + '"' + traco(1.8) + '/><path d="M32 42a10 10 0 0 1 0 20z" fill="' + O2 + '"/>' +
    '<path d="M32 46l1.900 3.900 4.300.6-3.100 3 .7 4.300-3.800-2-3.800 2 .7-4.300-3.100-3 4.300-.6z" fill="' + O1 + '"' + traco(1.1) + '/>',
    // Tribunus: couraça dourada
    '<path d="M15 45h7v14h-7zM24 45h7v16h-7zM33 45h7v16h-7zM42 45h7v14h-7z" fill="' + V + '"' + traco(1.6) + '/>' +
    '<path d="M16 5c5 4 11 6 16 6s11-2 16-6l8 12-8 7v18H16V24l-8-7z" fill="' + O + '"' + traco(2) + '/>' +
    '<path d="M32 11c5 0 11-2 16-6l7.500 11.500-7.500 7v18H32z" fill="' + O2 + '"/>' +
    '<path d="M16 5c5 4 11 6 16 6s11-2 16-6l8 12-8 7v18H16V24l-8-7z" fill="none"' + traco(2) + '/>' +
    '<path d="M32 15v27M20 25c4 4 8 4 12 0c4 4 8 4 12 0M22 34c3 1.500 7 1.500 10 0c3 1.500 7 1.500 10 0"' + fino(1.4) + '/>' +
    '<rect x="14" y="41" width="36" height="5" rx="1.500" fill="' + O1 + '"' + traco(1.6) + '/>',
    // Quaestor: moeda de ouro com águia
    '<circle cx="32" cy="32" r="28" fill="' + O + '"' + traco(2.2) + '/><path d="M32 4a28 28 0 0 1 0 56a24 24 0 0 0 0-56z" fill="' + O2 + '"/>' +
    '<circle cx="32" cy="32" r="22" fill="none" stroke="' + K + '" stroke-width="1.2" stroke-dasharray="2.5 2.5"/>' +
    '<g transform="translate(-7.700 -9.300) scale(1.240)">' + aguia(O1) + '</g><rect x="30" y="35" width="4" height="11" fill="' + O1 + '"' + traco(1.2) + '/><path d="M24 47h16" stroke="' + K + '" stroke-width="2.4" stroke-linecap="round"/>',
    // Aedilis: templo
    '<path d="M32 5L60 22H4z" fill="' + O + '"' + traco(2) + '/><path d="M32 6l26.500 15.500H32z" fill="' + O2 + '"/><path d="M32 5L60 22H4z" fill="none"' + traco(2) + '/><circle cx="32" cy="15" r="3" fill="' + V + '"' + traco(1.3) + '/>' +
    '<rect x="6" y="22" width="52" height="5" fill="' + O1 + '"' + traco(1.7) + '/>' +
    '<g fill="' + M + '"' + traco(1.5) + '><rect x="10" y="27" width="7" height="22"/><rect x="22" y="27" width="7" height="22"/><rect x="35" y="27" width="7" height="22"/><rect x="47" y="27" width="7" height="22"/></g>' +
    '<g fill="' + M2 + '"><rect x="14" y="28" width="2.200" height="20"/><rect x="26" y="28" width="2.200" height="20"/><rect x="39" y="28" width="2.200" height="20"/><rect x="51" y="28" width="2.200" height="20"/></g>' +
    '<rect x="5" y="49" width="54" height="5" fill="' + O2 + '"' + traco(1.7) + '/><rect x="2" y="54" width="60" height="6" rx="1" fill="' + O + '"' + traco(1.8) + '/>',
    // Praetor: a Justiça vendada, com balança e espada
    '<path d="M2 11h22" stroke="' + K + '" stroke-width="2.2" stroke-linecap="round"/><path d="M4 11L1 23M4 11l6 12M22 11l-4 12M22 11l5 12" stroke="' + K + '" stroke-width="1"/>' +
    '<path d="M0 23h11c0 6-11 6-11 0zM17 23h11c0 6-11 6-11 0z" fill="' + O + '"' + traco(1.3) + '/>' +
    '<path d="M27 22L14 15" stroke="' + K + '" stroke-width="5" stroke-linecap="round"/><path d="M27 22L14 15" stroke="' + O1 + '" stroke-width="2.600" stroke-linecap="round"/>' +
    '<path d="M38 22L48 33" stroke="' + K + '" stroke-width="5" stroke-linecap="round"/><path d="M38 22L48 33" stroke="' + O2 + '" stroke-width="2.600" stroke-linecap="round"/>' +
    '<path d="M46.500 36h4v19l-2 4-2-4z" fill="' + A1 + '"' + traco(1.3) + '/><rect x="42" y="33" width="13" height="3" rx="1" fill="' + O + '"' + traco(1.2) + '/>' +
    '<path d="M25 21c3-3 11-3 14 0l4 16 5 22H16l5-22z" fill="' + O + '"' + traco(1.8) + '/><path d="M32 19.500c3 0 5 .5 7 1.500l4 16 5 22H32z" fill="' + O2 + '"/><path d="M25 21c3-3 11-3 14 0l4 16 5 22H16l5-22z" fill="none"' + traco(1.8) + '/>' +
    '<rect x="23" y="30" width="18" height="3.500" fill="' + V + '"' + traco(1.2) + '/><path d="M28 36l-3 22M36 36l3 22"' + fino(1.1) + '/>' +
    '<path d="M25 13c-1-12 15-12 14 0l1 7H24z" fill="' + W2 + '"' + traco(1.5) + '/><circle cx="32" cy="12" r="5.500" fill="' + O1 + '"' + traco(1.3) + '/>' +
    '<rect x="25.500" y="9.500" width="13" height="4" rx="1" fill="' + M + '"' + traco(1.2) + '/><path d="M38.500 10l6-1-1 4zM38.500 13l5 4-3 2z" fill="' + M + '"' + traco(1) + '/>' +
    '<rect x="11" y="59" width="42" height="4.500" rx="1" fill="' + M + '"' + traco(1.5) + '/>',
    // Legatus: bandeira de comando
    '<rect x="30" y="4" width="4" height="57" fill="' + O2 + '"' + traco(1.5) + '/>' +
    '<path d="M12 44v9M18 44v9M24 44v9M40 44v9M46 44v9M52 44v9" stroke="' + K + '" stroke-width="3.400" stroke-linecap="round"/><path d="M12 44v9M18 44v9M24 44v9M40 44v9M46 44v9M52 44v9" stroke="' + O + '" stroke-width="1.700" stroke-linecap="round"/>' +
    '<rect x="11" y="14" width="42" height="31" fill="' + V + '"' + traco(1.9) + '/><rect x="42" y="15" width="10" height="29" fill="' + V2 + '"/>' +
    '<rect x="15" y="18" width="34" height="23" fill="none" stroke="' + O + '" stroke-width="1.600"/>' + aguia(O) +
    '<rect x="8" y="9" width="48" height="5" rx="2" fill="' + O + '"' + traco(1.7) + '/><circle cx="32" cy="5" r="4" fill="' + O1 + '"' + traco(1.6) + '/>',
    // Consul: placa SPQR entre louros
    '<path d="M7 45c1-14 3-27 9-39" stroke="' + K + '" stroke-width="6" fill="none" stroke-dasharray="4.500 1.500"/><path d="M7 45c1-14 3-27 9-39" stroke="' + O + '" stroke-width="3.600" fill="none" stroke-dasharray="4.500 1.500"/>' +
    '<path d="M57 45c-1-14-3-27-9-39" stroke="' + K + '" stroke-width="6" fill="none" stroke-dasharray="4.500 1.500"/><path d="M57 45c-1-14-3-27-9-39" stroke="' + O + '" stroke-width="3.600" fill="none" stroke-dasharray="4.500 1.500"/>' +
    '<path d="M13 12h38v29c0 9-13 15-19 19-6-4-19-10-19-19z" fill="' + V + '"' + traco(2.2) + '/><path d="M40 13h10v28c0 7-9 12-10 13z" fill="' + V2 + '"/>' +
    '<path d="M16.500 15.500h31v25c0 7-10 12-15.500 15.500-5.500-3.500-15.500-8.500-15.500-15.500z" fill="none" stroke="' + O + '" stroke-width="1.800"/>' +
    '<text x="32" y="30" font-family="Georgia,serif" font-size="13" font-weight="700" text-anchor="middle" fill="' + O1 + '">SP</text><text x="32" y="44" font-family="Georgia,serif" font-size="13" font-weight="700" text-anchor="middle" fill="' + O1 + '">QR</text>',
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

  // ---------- Animação da promoção ----------
  // Um soldadinho em pixel art destrói o emblema atual; o novo cai do céu e ele se ajoelha com a espada no chão.
  // A sequência é toda em CSS (ver .cena-* em estilo.css): fechar a janela no meio não deixa nada pendente.
  var PIXEL = { r: '#c8352f', d: '#8e2320', s: '#d5dbe6', S: '#98a1b5', k: '#20243a', g: '#f2c14e', G: '#b9851f', t: '#b3302f', T: '#7d1f1f', y: '#c8352f', b: '#8a5a2b', B: '#5f3d1e', p: '#d9a877', w: '#e8ecf4', W: '#a7b0c2' };
  function pixels(linhas, x0, y0) {
    var o = '';
    linhas.forEach(function (f, y) {
      f.split('').forEach(function (c, x) {
        if (c !== '.') o += '<rect x="' + (x + x0) + '" y="' + (y + y0) + '" width="1.02" height="1.02" fill="' + PIXEL[c] + '"/>';
      });
    });
    return o;
  }
  function retangulos(lista) {
    return lista.map(function (q) { return '<rect x="' + (q[0] - 2) + '" y="' + q[1] + '" width="' + (q[2] + .02) + '" height="' + (q[3] + .02) + '" fill="' + PIXEL[q[4]] + '"/>'; }).join('');
  }
  var SOLDADO_EM_PE = '<svg class="cena-em-pe" viewBox="0 0 24 20" shape-rendering="crispEdges" aria-hidden="true">' +
    '<g class="cena-perna-b">' + pixels(['..BB..', '..BB..', '..BB..', '..BBB.'], 6, 16) + '</g>' +
    '<g class="cena-corpo">' + pixels(['...rrrrrr.......', '..rrdrrdrr......', '..rr.ssssss.....', '..r.sssssssS....', '....sssssssSS...', '....ggggggggg...', '....ssskkkkkS...', '....sssSkkkSS...', '.....sSSSSS.....', '.gGGg..tttt.....', 'gyyyyG.ssss.....', 'gyggyG.sSsS.....', 'gyggyG.ssss.....', 'gyyyyG.gggg.....', '.gGGg..TtTt.....', '......tTtT......'], 0, 0) + '</g>' +
    '<g class="cena-perna-a">' + pixels(['...pp.', '...pp.', '...bb.', '...bbb'], 6, 16) + '</g>' +
    '<g class="cena-braco">' + pixels(['..........GG..........', '..........GG..........', '......pp..GGwwwwwwww..', '......pppbGGwwwwwwwww.', '......pp..GGWWWWWWWW..', '..........GG..........'], 2, 9) + '</g></svg>';
  var SOLDADO_AJOELHADO = '<svg class="cena-ajoelhado" viewBox="0 0 24 20" shape-rendering="crispEdges" aria-hidden="true">' + retangulos([
    [20, 3, 2, 2, 'G'], [20, 5, 2, 2, 'b'], [20, 8, 1, 12, 'w'], [21, 8, 1, 12, 'W'], [18, 7, 6, 1, 'G'],
    [2, 18, 2, 2, 'B'], [4, 19, 6, 1, 'B'], [9, 18, 3, 2, 'B'], [10, 17, 2, 1, 'B'],
    [4, 11, 3, 1, 'G'], [3, 12, 5, 5, 'y'], [3, 12, 1, 5, 'g'], [7, 12, 1, 5, 'G'], [5, 14, 1, 1, 'g'], [4, 17, 3, 1, 'G'],
    [8, 11, 7, 4, 's'], [9, 12, 5, 1, 'S'], [8, 15, 7, 1, 'g'], [8, 16, 4, 1, 'T'],
    [11, 16, 6, 2, 'b'], [15, 18, 2, 1, 'b'], [15, 19, 4, 1, 'B'],
    [6, 3, 5, 1, 'r'], [5, 4, 8, 1, 'r'], [7, 4, 1, 1, 'd'], [10, 4, 1, 1, 'd'], [5, 5, 2, 2, 'r'], [5, 7, 1, 1, 'r'],
    [8, 5, 6, 1, 's'], [14, 5, 1, 1, 'S'], [7, 6, 7, 2, 's'], [14, 6, 2, 2, 'S'], [7, 8, 10, 1, 'g'], [7, 9, 4, 1, 's'], [11, 9, 5, 1, 'k'], [16, 9, 1, 1, 'S'], [8, 10, 3, 1, 's'], [11, 10, 3, 1, 'k'], [14, 10, 2, 1, 'S'],
    [18, 5, 3, 2, 'p'], [17, 7, 2, 2, 'p'], [16, 9, 2, 1, 'p'], [15, 10, 2, 1, 'p'], [14, 11, 2, 1, 'p']
  ]) + '</svg>';

  var CORTES = [
    ['0 0,45% 0,35% 40%,0 50%', '-46px', '-30px', '-70deg'],
    ['45% 0,100% 0,100% 35%,60% 45%,35% 40%', '50px', '-40px', '80deg'],
    ['0 50%,35% 40%,50% 65%,30% 100%,0 100%', '-60px', '50px', '-110deg'],
    ['35% 40%,60% 45%,50% 65%', '6px', '-60px', '140deg'],
    ['60% 45%,100% 35%,100% 100%,70% 100%,50% 65%', '66px', '40px', '100deg'],
    ['50% 65%,70% 100%,30% 100%', '4px', '60px', '-40deg']
  ];
  var RACHAS = ['M32 2L27 18L36 28', 'M36 28L24 40L28 62', 'M36 28L52 40L46 62M52 40L62 36'];

  function cenaPromocao(de, para) {
    function emblema(i, classe, extra, dentro) {
      var q = MOLDURAS[i];
      return '<div class="cena-emblema ' + classe + '" style="border-color:' + q[0] + ';background:' + q[1] + ';border-width:' + q[2] + 'px;' + (extra || '') + '">' +
        '<svg viewBox="0 0 64 64" aria-hidden="true">' + EMBLEMAS[i] + '</svg>' + (dentro || '') + '</div>';
    }
    var rachas = RACHAS.map(function (d, i) {
      return '<svg class="cena-racha" viewBox="0 0 64 64" aria-hidden="true" style="animation-delay:' + (1.48 + i * .5) + 's"><path d="' + d + '" fill="none" stroke="#0f111b" stroke-width="2"/></svg>';
    }).join('');
    var pecas = CORTES.map(function (c) {
      return emblema(de, 'cena-peca', 'clip-path:polygon(' + c[0] + ');--dx:' + c[1] + ';--dy:' + c[2] + ';--giro:' + c[3]);
    }).join('');
    return el('div', { class: 'cena', html: '<div class="cena-chao"></div>' + emblema(de, 'cena-velho', '', rachas) + pecas + emblema(para, 'cena-novo') +
      '<span class="cena-poeira" style="left:150px;--dx:-14px"></span><span class="cena-poeira" style="left:242px;--dx:14px"></span>' +
      '<div class="cena-soldado">' + SOLDADO_EM_PE + SOLDADO_AJOELHADO + '</div>' });
  }

  // ---------- Som da promoção ----------
  // Gerado no navegador (sem arquivos) e sincronizado com a cena. A preferência vale por aparelho.
  var CHAVE_SOM = 'controle-estudos.som-patente';
  function somLigado() {
    try { return localStorage.getItem(CHAVE_SOM) !== 'nao'; } catch (e) { return true; }
  }
  function gravarSom(ligado) {
    try { localStorage.setItem(CHAVE_SOM, ligado ? 'sim' : 'nao'); } catch (e) { /* vale só agora */ }
  }

  function agendarSons(ctx) {
    var saida = ctx.createGain();
    saida.gain.value = 0.5;
    saida.connect(ctx.destination);
    var inicio = ctx.currentTime;

    var ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), dados = ruido.getChannelData(0);
    for (var i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;

    function envelope(t, pico, duracao) {
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(pico, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
      g.connect(saida);
      return g;
    }
    function tom(t, tipo, freq, pico, duracao, freqFinal) {
      var o = ctx.createOscillator();
      o.type = tipo;
      o.frequency.setValueAtTime(freq, t);
      if (freqFinal) o.frequency.exponentialRampToValueAtTime(freqFinal, t + duracao);
      o.connect(envelope(t, pico, duracao));
      o.start(t);
      o.stop(t + duracao + 0.02);
    }
    function chiado(t, filtro, freq, pico, duracao) {
      var f = ctx.createBufferSource();
      f.buffer = ruido;
      var q = ctx.createBiquadFilter();
      q.type = filtro;
      q.frequency.value = freq;
      f.connect(q);
      q.connect(envelope(t, pico, duracao));
      f.start(t, Math.random() * 0.5, duracao + 0.02);
    }

    // Golpe do gládio: metal contra o emblema.
    function golpe(t) {
      tom(t, 'square', 830, 0.16, 0.16);
      tom(t, 'triangle', 1370, 0.2, 0.22);
      tom(t, 'triangle', 2240, 0.1, 0.12);
      chiado(t, 'highpass', 3000, 0.35, 0.06);
    }
    // O emblema se parte: estrondo e estilhaços espalhados.
    function quebra(t) {
      tom(t, 'sine', 130, 0.6, 0.3, 45);
      chiado(t, 'bandpass', 2400, 0.8, 0.5);
      [0.03, 0.09, 0.14, 0.21, 0.29, 0.38, 0.5].forEach(function (d, n) {
        tom(t + d, 'triangle', 1700 + (n * 1270) % 2600, 0.14 - n * 0.012, 0.09);
      });
    }
    // O novo emblema vem caindo do céu: um assobio de ar que sobe até o impacto.
    function queda(t, duracao) {
      var f = ctx.createBufferSource();
      f.buffer = ruido;
      var q = ctx.createBiquadFilter();
      q.type = 'bandpass';
      q.Q.value = 2.5;
      q.frequency.setValueAtTime(400, t);
      q.frequency.exponentialRampToValueAtTime(2200, t + duracao);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1.2, t + duracao);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duracao + 0.02);
      f.connect(q); q.connect(g); g.connect(saida);
      f.start(t, 0, duracao + 0.04);
    }
    // Pouso pesado no chão.
    function impacto(t) {
      tom(t, 'sine', 120, 0.9, 0.4, 38);
      chiado(t, 'lowpass', 500, 0.7, 0.22);
    }
    // Fanfarra curta, parecida com metais.
    function nota(t, freq, duracao) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.linearRampToValueAtTime(2400, t + 0.05);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.setValueAtTime(0.2, t + duracao * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
      f.connect(g); g.connect(saida);
      [1, 1.004].forEach(function (d) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq * d;
        o.connect(f);
        o.start(t);
        o.stop(t + duracao + 0.02);
      });
    }
    function fanfarra(t) {
      nota(t, 392, 0.13);
      nota(t + 0.14, 523.25, 0.13);
      nota(t + 0.28, 659.25, 0.13);
      nota(t + 0.42, 783.99, 0.7);
      nota(t + 0.42, 523.25, 0.7);
    }

    golpe(inicio + 1.475);
    golpe(inicio + 1.975);
    golpe(inicio + 2.475);
    quebra(inicio + 2.48);
    queda(inicio + 2.75, 0.35);
    impacto(inicio + 3.1);
    fanfarra(inicio + 3.4);
  }

  // Devolve a função que interrompe o som. Sem clique recente do usuário, o navegador pode bloquear o áudio:
  // nesse caso a cena segue em silêncio, e o som não toca atrasado depois.
  function tocarPromocao() {
    var Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return function () {};
    var ctx;
    try { ctx = new Contexto(); } catch (e) { return function () {}; }
    var parado = false;
    function parar() {
      if (parado) return;
      parado = true;
      ctx.close().catch(function () {});
    }
    if (ctx.state === 'running') { agendarSons(ctx); return parar; }
    var pedido = performance.now();
    ctx.resume().then(function () {
      if (parado) return;
      if (performance.now() - pedido < 300) agendarSons(ctx); else parar();
    }).catch(parar);
    setTimeout(function () { if (ctx.state !== 'running') parar(); }, 300);
    return parar;
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

  function promocao(r, de) {
    var txt = r.proxima
      ? 'Você chegou a ' + UI.fmtNum(r.xp) + ' XP. ' + textoProxima(r) + '.' + (r.requisito ? ' ' + textoRequisito(r) + '.' : '')
      : 'Você chegou ao topo. Não há patente acima desta.';
    var cena = cenaPromocao(de, r.indice);
    var texto = el('div', { class: 'cena-texto' }, [
      el('div', { class: 'aviso-patente-nome', text: LISTA[r.indice].nome }),
      el('p', { text: txt })
    ]);
    var pular, botaoSom, pararSom = function () {};
    function irAoFim() {
      cena.classList.add('cena-fim');
      texto.classList.add('cena-fim');
      pararSom();
      if (pular) pular.style.display = 'none';
    }
    function rotuloSom() { return somLigado() ? 'Desligar som' : 'Ligar som'; }
    cena.addEventListener('click', irAoFim);
    var m = UI.modal('Promoção!', el('div', { class: 'aviso-patente' }, [cena, texto]), [
      { texto: rotuloSom(), classe: 'btn-secundario btn-esquerda', acao: function () {
        gravarSom(!somLigado());
        botaoSom.textContent = rotuloSom();
        if (somLigado()) { if (!cena.classList.contains('cena-fim')) UI.aviso('O som volta na próxima promoção'); } else pararSom();
        return false;
      } },
      { texto: 'Pular', classe: 'btn-secundario', acao: function () { irAoFim(); return false; } },
      { texto: 'Continuar', classe: 'btn-primario' }
    ]);
    var secundarios = m.caixa.querySelectorAll('.btn-secundario');
    botaoSom = secundarios[0];
    pular = secundarios[1];
    texto.addEventListener('animationend', function () { if (pular) pular.style.display = 'none'; });
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { irAoFim(); return; }
    if (somLigado()) {
      pararSom = tocarPromocao();
      // Fechar a janela no meio também encerra o som.
      var vigia = setInterval(function () {
        if (!cena.isConnected) { pararSom(); clearInterval(vigia); }
      }, 200);
      setTimeout(function () { clearInterval(vigia); pararSom(); }, 6000);
    }
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
    if (r.indice > vista) { promocao(r, vista); return; }
    var ultimo = r.eventos[r.eventos.length - 1];
    var motivo = ultimo && ultimo.tipo === 'rebaixamento' && ultimo.para === r.indice
      ? 'Motivo: ' + ultimo.motivo + '.' : 'Seu XP diminuiu porque o histórico de estudos foi alterado.';
    janela('Rebaixamento', r.indice, motivo + ' Você está com ' + UI.fmtNum(r.xp) + ' XP. ' + textoProxima(r) + '.' + (r.requisito ? ' ' + textoRequisito(r) + '.' : ''));
  }

  // ---------- Depois de lançar um estudo ----------
  function aposLancar(antes) {
    var r = calcular();
    if (r.indice > antes.indice) { marcarVista(r.indice); promocao(r, antes.indice); }
    return r.xp - antes.xp;
  }

  // ---------- XP do dia ----------
  function brutoDoDia(dia) {
    return dia.registros.reduce(function (s, x) { return s + xpDoRegistro(x); }, 0) + dia.topicosAvulsos * XP.TOPICO + dia.meta + dia.sequencia;
  }
  function totalDoDia(dia) { return brutoDoDia(dia) - dia.limite - dia.rebaixamento; }

  var NOMES_TIPO = { teoria: 'Teoria', questoes: 'Questões', revisao: 'Revisão' };

  function detalheRegistro(x) {
    var partes = [];
    if (x.minutos) partes.push((x.minutos >= 60 ? Math.floor(x.minutos / 60) + 'h' + (x.minutos % 60 ? String(x.minutos % 60).padStart(2, '0') : '') : x.minutos + 'min') + ' de estudo (+' + x.minutos + ')');
    x.baterias.forEach(function (b) {
      var q = b.n + (b.n === 1 ? ' questão' : ' questões');
      partes.push(b.mult > 1 ? q + ' a ' + Math.round(b.a / b.n * 100) + '% (×' + String(b.mult).replace('.', ',') + '): +' + b.xp : q + ' (+' + b.xp + ')');
    });
    if (x.topicos) partes.push(x.topicos + (x.topicos === 1 ? ' tópico concluído' : ' tópicos concluídos') + ' (+' + x.topicos * XP.TOPICO + ')');
    if (x.etapas) partes.push(x.etapas + (x.etapas === 1 ? ' etapa concluída' : ' etapas concluídas') + ' (+' + x.etapas * XP.ETAPA + ')');
    return partes.join(' · ');
  }

  function linhaXp(nome, detalhe, valor, cor, classe) {
    return el('li', { class: 'xp-linha' + (classe ? ' ' + classe : '') }, [
      el('span', { class: 'bolinha', style: { background: cor || 'var(--borda-forte)' } }),
      el('span', { class: 'xp-texto' }, [el('span', { class: 'xp-nome', text: nome }), detalhe ? el('span', { class: 'xp-detalhe', text: detalhe }) : null]),
      el('strong', { class: 'xp-valor', text: (valor < 0 ? '−' : '+') + UI.fmtNum(Math.abs(valor)) })
    ]);
  }

  // Seção "XP do dia", com setas para os dias anteriores que tiveram XP.
  function painelXpDoDia(r) {
    var hoje = UI.hoje();
    var datas = Object.keys(r.dias).filter(function (d) { return d <= hoje; }).sort();
    if (datas.indexOf(hoje) < 0) datas.push(hoje);
    var pos = datas.length - 1;
    var caixa = el('div', { class: 'xp-dia' });
    function desenhar() {
      var d = datas[pos], dia = r.dias[d];
      var nomeDia = d === hoje ? 'Hoje' : d === UI.somarDias(hoje, -1) ? 'Ontem' : new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
      var linhas = [];
      if (dia) {
        dia.registros.forEach(function (x) {
          var disc = Dados.disciplina(x.sessao.disciplinaId);
          linhas.push(linhaXp((disc ? disc.nome : 'Disciplina excluída') + ' · ' + (NOMES_TIPO[x.sessao.tipo] || 'Estudo'), detalheRegistro(x), xpDoRegistro(x), disc && disc.cor));
        });
        if (dia.topicosAvulsos) linhas.push(linhaXp('Tópicos marcados como concluídos', dia.topicosAvulsos + ' × ' + XP.TOPICO, dia.topicosAvulsos * XP.TOPICO));
        if (dia.sequencia) linhas.push(linhaXp('Sequência de estudos', 'bônus pelos dias seguidos', dia.sequencia, null, 'bonus'));
        if (dia.meta) linhas.push(linhaXp('Meta semanal batida', dia.meta / XP.META === 2 ? 'horas e questões' : 'horas ou questões', dia.meta, null, 'bonus'));
        if (dia.limite) linhas.push(linhaXp('Acima do limite da patente', 'sem o acerto exigido, o XP não passa do início da próxima patente', -dia.limite, null, 'perda'));
        if (dia.rebaixamento) linhas.push(linhaXp('Rebaixamento', 'XP volta ao meio da faixa da patente anterior', -dia.rebaixamento, null, 'perda'));
      }
      caixa.innerHTML = '';
      caixa.appendChild(el('div', { class: 'xp-dia-topo' }, [
        el('button', { type: 'button', class: 'btn-icone', text: '‹', title: 'Dia anterior', disabled: pos === 0, onclick: function () { pos--; desenhar(); } }),
        el('div', { class: 'xp-dia-data' }, [
          el('strong', { text: nomeDia.charAt(0).toUpperCase() + nomeDia.slice(1) + ', ' + UI.fmtData(d) }),
          el('span', { class: 'xp-dia-total', text: (dia ? (totalDoDia(dia) < 0 ? '−' : '+') + UI.fmtNum(Math.abs(totalDoDia(dia))) : '+0') + ' XP no dia' })
        ]),
        el('button', { type: 'button', class: 'btn-icone', text: '›', title: 'Próximo dia', disabled: pos === datas.length - 1, onclick: function () { pos++; desenhar(); } })
      ]));
      caixa.appendChild(linhas.length ? el('ul', { class: 'xp-lista' }, linhas) : el('p', { class: 'data-fraca', text: 'Nenhum XP neste dia ainda.' }));
    }
    desenhar();
    return caixa;
  }

  // ---------- Janela "Minha patente" ----------
  function abrir() {
    var r = calcular();
    var f = r.fontes;
    var fontes = [
      ['Tempo de estudo', f.tempo], ['Questões resolvidas', f.questoes], ['Bônus por desempenho', f.bonus],
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
      el('h3', { class: 'patente-titulo', text: 'XP do dia' }),
      painelXpDoDia(r),
      painelPausas(),
      el('h3', { class: 'patente-titulo', text: 'De onde veio seu XP' }),
      el('div', { class: 'patente-fontes' }, fontes.map(function (x) {
        return el('div', null, [el('span', { text: x[0] }), el('strong', { text: UI.fmtNum(x[1]) })]);
      }).concat(f.perdido ? [el('div', { class: 'perda' }, [el('span', { text: 'Perdido em rebaixamentos' }), el('strong', { text: '−' + UI.fmtNum(f.perdido) })])] : [])
        .concat(f.limite ? [el('div', { class: 'perda' }, [el('span', { text: 'Acima do limite da patente' }), el('strong', { text: '−' + UI.fmtNum(f.limite) })])] : [])),
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
