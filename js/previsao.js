// Previsão de conclusão do edital: quando toda a teoria estará feita e todas as matérias só no Modo Revisão.
// Nada é gravado: o cálculo sai dos estudos lançados, do plano de cada matéria e do ciclo.
var Previsao = (function () {
  var JANELA_DIAS = 28;
  var MIN_TOPICOS = 5, MIN_QUESTOES = 100;   // abaixo disso, a matéria usa a média geral
  var FAVORITAS_PADRAO = 20;                 // questões por rodada, enquanto nenhuma foi lançada
  var HORAS_TOPICO_PADRAO = 1.25, QUESTOES_HORA_PADRAO = 24, ERRO_PADRAO = 0.25, BATERIA_PADRAO = 30;
  var LIMITE_PASSOS = 500000;

  // Tempo, tópicos e questões lançados: de uma matéria ou (sem id) de todas.
  function medidas(disciplinaId) {
    var m = { segTeoria: 0, segQuestoes: 0, questoes: 0, erros: 0, topicos: 0 };
    Dados.db.sessoes.forEach(function (s) {
      if (disciplinaId && s.disciplinaId !== disciplinaId) return;
      if (s.tipo === 'teoria') { m.segTeoria += s.segundos || 0; return; }
      m.segQuestoes += s.segundos || 0;
      (s.cadernos || []).forEach(function (l) {
        m.questoes += (Number(l.acertos) || 0) + (Number(l.erros) || 0);
        m.erros += Number(l.erros) || 0;
      });
    });
    (disciplinaId ? Dados.topicosDaDisciplina(disciplinaId) : Dados.db.topicos).forEach(function (t) { if (t.concluido) m.topicos++; });
    return m;
  }

  function mediasGerais() {
    var g = medidas();
    var partes = [];
    Dados.disciplinas().forEach(function (d) { partes = partes.concat(bateriasDaMateria(d.id)); });
    return {
      horasTopico: g.topicos && g.segTeoria ? g.segTeoria / 3600 / g.topicos : HORAS_TOPICO_PADRAO,
      questoesHora: g.questoes && g.segQuestoes ? g.questoes / (g.segQuestoes / 3600) : QUESTOES_HORA_PADRAO,
      taxaErro: g.questoes ? g.erros / g.questoes : ERRO_PADRAO,
      bateria: partes.length ? media(partes) : BATERIA_PADRAO
    };
  }

  function media(lista) { return lista.reduce(function (s, n) { return s + n; }, 0) / lista.length; }

  // Tamanhos das baterias dos cadernos de teoria com total informado.
  function bateriasDaMateria(disciplinaId) {
    var pt = Dados.pastaTeoria(disciplinaId), partes = [];
    if (!pt) return partes;
    Dados.cadernosDe(pt.id).forEach(function (c) {
      Dados.divisaoBaterias(c, Dados.numBaterias(disciplinaId)).forEach(function (q) { if (q > 0) partes.push(q); });
    });
    return partes;
  }

  // Tamanho médio de uma rodada de favoritadas, pelos totais já informados.
  function mediaRodadas(disciplinaId) {
    var totais = {};
    Dados.db.sessoes.forEach(function (s) {
      if (s.disciplinaId !== disciplinaId) return;
      (s.cadernos || []).forEach(function (l) { if (l.rodada && l.totalRodada) totais[l.cadernoId + '|' + l.rodada] = l.totalRodada; });
    });
    var lista = Object.keys(totais).map(function (k) { return totais[k]; });
    return lista.length ? media(lista) : FAVORITAS_PADRAO;
  }

  function questoesDoBloco(bloco, bateriaMedia, nb) {
    var c = Dados.cadernoDoBloco(bloco.id);
    var partes = c ? Dados.divisaoBaterias(c, nb).filter(function (q) { return q > 0; }) : [];
    return partes.length ? partes.reduce(function (s, n) { return s + n; }, 0) : bateriaMedia * nb;
  }

  // Horas que ainda faltam para a matéria passar a rodar só no Modo Revisão.
  function horasRestantes(d, gerais) {
    var m = Dados.modoDeEstudo(d.id), plano = m.plano, propria = medidas(d.id);
    var horasTopico = propria.topicos >= MIN_TOPICOS && propria.segTeoria ? propria.segTeoria / 3600 / propria.topicos : gerais.horasTopico;
    var propriaQ = propria.questoes >= MIN_QUESTOES && propria.segQuestoes;
    var questoesHora = propriaQ ? propria.questoes / (propria.segQuestoes / 3600) : gerais.questoesHora;
    var taxaErro = propriaQ ? propria.erros / propria.questoes : gerais.taxaErro;
    var partes = bateriasDaMateria(d.id);
    var bateriaMedia = partes.length ? media(partes) : gerais.bateria;
    var rodada = mediaRodadas(d.id);
    var horas = 0;

    plano.pendentes.forEach(function (it) {
      if (it.tipo === 'teoria') {
        horas += it.topicos.filter(function (t) { return !t.concluido; }).length * horasTopico;
        return;
      }
      if (m.modo === 'revisao') return; // em Revisão, só a teoria que falta conta
      var questoes;
      if (it.tipo === 'bateria') {
        questoes = it.bateria && it.bateria.qtd ? it.bateria.qtd - it.bateria.feitas : bateriaMedia;
      } else if (it.tipo === 'favoritas') {
        questoes = it.qtd ? it.qtd - it.feitas : rodada;
      } else if (it.qtd) {
        questoes = it.qtd - it.feitas;
      } else {
        questoes = it.par.blocos.reduce(function (s, b) { return s + questoesDoBloco(b, bateriaMedia, plano.numBaterias); }, 0) * taxaErro;
      }
      horas += Math.max(0, questoes) / questoesHora;
    });
    return { horas: horas, modo: m.modo };
  }

  // Ritmo real da janela: horas por semana e tempo médio de cada posição do ciclo (cerca de uma sessão).
  function ritmo() {
    var de = UI.somarDias(UI.hoje(), -(JANELA_DIAS - 1)), seg = 0, n = 0;
    Dados.db.sessoes.forEach(function (s) {
      if (s.data < de) return;
      seg += s.segundos || 0;
      n++;
    });
    return { horasSemana: seg / 3600 / (JANELA_DIAS / 7), horasPosicao: n ? seg / 3600 / n : 0 };
  }

  // Repete o ciclo a partir da posição atual, descontando o tempo de cada posição da matéria dela. Regras do ciclo:
  //  - matéria em Revisão ocupa no máximo 1 vaga; em Leitura, pode ocupar 2;
  //  - ao terminar o Modo Leitura, a matéria continua no ciclo, com 1 vaga, e entra a próxima matéria de fora (ordem alfabética);
  //  - se a matéria tinha 2 vagas, a vaga extra passa para a nova; se tinha 1, o ciclo ganha uma vaga no fim.
  // Sem ciclo montado, não há tempo em Revisão: as horas são divididas entre as matérias que faltam.
  function simular(materias, horasPosicao) {
    var resto = {}, fim = {};
    materias.forEach(function (x) { resto[x.d.id] = x.horas; });
    var c = Dados.db.ciclo, semCiclo = !c.itens.length;
    var posicoes = c.itens.map(function (it) { return it.disciplinaId; }).filter(function (id) { return resto[id] !== undefined; });
    var fila = materias.filter(function (x) { return x.horas > 0 && posicoes.indexOf(x.d.id) < 0; }).map(function (x) { return x.d.id; });
    if (semCiclo) { posicoes = fila; fila = []; }
    if (!posicoes.length && !fila.length) return { horas: 0, fim: fim };
    var i = semCiclo || !posicoes.length ? 0 : Math.max(0, c.posicaoAtual) % posicoes.length, tempo = 0;

    // Refaz a lista mantendo só a 1ª vaga da matéria; as demais passam para quem vem da fila ou somem.
    function umaVaga(id, entraNova) {
      var novo = [], viu = false, novoI = 0, entrou = false;
      posicoes.forEach(function (x, k) {
        if (x !== id) novo.push(x);
        else if (!viu) { viu = true; novo.push(x); }
        else if (entraNova && fila.length && !entrou) { novo.push(fila.shift()); entrou = true; }
        if (k === i) novoI = Math.max(0, novo.length - 1);
      });
      if (entraNova && !entrou && fila.length) novo.push(fila.shift());
      posicoes = novo;
      i = novoI;
    }
    // Matérias que já estão em Revisão começam com 1 vaga só.
    materias.forEach(function (x) { if (x.horas <= 0) umaVaga(x.d.id, false); });
    i = posicoes.length ? i % posicoes.length : 0;

    function ativa() { return posicoes.some(function (id) { return resto[id] > 0; }); }

    for (var passo = 0; passo < LIMITE_PASSOS; passo++) {
      if (!ativa()) {
        if (!fila.length) break;
        posicoes.push(fila.shift()); // ciclo só com Revisão: a próxima matéria de fora entra
        i = posicoes.length - 1;
      }
      var id = posicoes[i];
      if (resto[id] > 0) {
        var usado = Math.min(horasPosicao, resto[id]);
        tempo += usado;
        resto[id] -= usado;
        if (resto[id] <= 1e-9) {
          resto[id] = 0;
          fim[id] = tempo;
          if (semCiclo) {
            posicoes.splice(i, 1);
            i--;
            if (!posicoes.length) break;
          } else {
            umaVaga(id, true);
          }
        }
      } else {
        tempo += horasPosicao; // posição de Revisão: o tempo passa, mas o edital não avança
      }
      i = (i + 1) % posicoes.length;
    }
    return { horas: tempo, fim: fim };
  }

  function dataEm(horas, horasSemana) {
    return UI.somarDias(UI.hoje(), Math.ceil(horas / horasSemana * 7));
  }

  function calcular() {
    var gerais = mediasGerais();
    var materias = Dados.disciplinas().map(function (d) {
      var r = horasRestantes(d, gerais);
      return { d: d, horas: r.horas, modo: r.modo, data: null };
    });
    var pendentes = materias.filter(function (x) { return x.horas > 0; });
    var r = {
      materias: materias,
      total: materias.length,
      emRevisao: materias.filter(function (x) { return x.modo === 'revisao'; }).length,
      horasRestantes: pendentes.reduce(function (s, x) { return s + x.horas; }, 0),
      vazio: !materias.length,
      concluido: !!materias.length && !pendentes.length,
      medias: gerais, data: null, semRitmo: false
    };
    var ri = ritmo();
    r.horasSemana = ri.horasSemana;
    if (r.vazio || r.concluido) return r;
    if (!ri.horasSemana) { r.semRitmo = true; return r; }
    var sim = simular(materias, ri.horasPosicao);
    r.data = dataEm(sim.horas, ri.horasSemana);
    materias.forEach(function (x) { if (sim.fim[x.d.id] !== undefined) x.data = dataEm(sim.fim[x.d.id], ri.horasSemana); });
    return r;
  }

  function fmtMes(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', '/');
  }

  return { calcular: calcular, fmtMes: fmtMes, JANELA_DIAS: JANELA_DIAS };
})();
