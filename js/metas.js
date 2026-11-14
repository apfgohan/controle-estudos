// Página "Metas" (a principal): perfil, previsão, metas da semana, meta atual, ciclo e as próximas metas do ciclo.
var Metas = (function () {
  var el = UI.el;
  var MINIMO_PROXIMAS = 10;
  var META_ACERTO = 80;

  // Tipo de cada etapa: classe de cor (mesmas das recomendações), nome e ícone.
  var TIPOS_LEITURA = {
    teoria: ['teoria', 'Teoria', 'lista'],
    bateria: ['questoes', 'Questões', 'caderno2'],
    favoritas: ['favoritas', 'Favoritadas', 'caderno2'],
    erros: ['erros', 'Bateria de erros', 'alerta'],
    pdf: ['questoes', 'Questões do PDF', 'caderno2'],
    pdfErradas: ['erros', 'Erradas do PDF', 'alerta']
  };
  var TIPOS_REVISAO = {
    simulado: ['simulado', 'Simulado', 'caderno2'],
    duvidas: ['favoritas', 'Favoritadas', 'caderno2'],
    erros2x: ['favoritas', 'Favoritadas', 'caderno2'],
    fracos: ['erros', 'Pontos fracos', 'alerta']
  };

  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

  // Etapas que faltam para cada matéria, na ordem: Modo Leitura pelo plano de teoria, Modo Revisão pela volta atual.
  function etapasDa(d, cache) {
    if (cache[d.id]) return cache[d.id];
    var m = Dados.modoDeEstudo(d.id), lista;
    if (m.modo === 'revisao') {
      var p = Dados.planoRevisao(d.id);
      lista = p.faltam.map(function (e) { return { modo: 'revisao', e: e }; });
    } else {
      // A teoria de um bloco pode levar várias tarefas (páginas por tarefa, em Configurações): cada vaga do ciclo pega a tarefa seguinte.
      lista = [];
      m.plano.pendentes.forEach(function (it) {
        var metas = it.tipo === 'teoria' && Dados.paginasPorMeta() ? Dados.metasDaTeoria(it.aulas) : [];
        if (metas.length > 1) metas.forEach(function (u, k) { lista.push({ modo: 'leitura', it: it, meta: u, k: k, de: metas.length }); });
        else lista.push({ modo: 'leitura', it: it, meta: metas[0] || null });
      });
    }
    cache[d.id] = { lista: lista, usados: 0, modo: m.modo, temBlocos: !!m.plano.blocos };
    return cache[d.id];
  }

  function descrever(d, x) {
    if (!x) return { tipo: ['teoria', 'Teoria', 'lista'], titulo: 'Cadastrar os blocos de teoria desta matéria', detalhe: '', estrelas: 0 };
    if (x.modo === 'revisao') {
      var e = x.e, tr = TIPOS_REVISAO[e.tipo] || TIPOS_REVISAO.simulado, titulo, detalhe = '';
      if (e.tipo === 'simulado') {
        titulo = e.caderno ? 'Resolver o caderno de simulado "' + e.caderno.nome + '"' : 'Resolver um novo caderno de simulado';
        detalhe = e.caderno && e.caderno.totalQuestoes ? plural(e.caderno.totalQuestoes - (e.feitas || 0), 'questão restante', 'questões restantes') : 'Cadastre o caderno na pasta de simulados';
      } else if (e.tipo === 'fracos') {
        titulo = 'Revisar os assuntos em que estou mais fraco';
        detalhe = 'Questões dos pontos fracos das Estatísticas';
      } else {
        titulo = e.tipo === 'duvidas' ? 'Resolver as questões favoritadas em que fiquei em dúvida' : 'Resolver as questões favoritadas que errei 2x ou mais';
        detalhe = e.caderno ? e.caderno.nome : 'Cadastre o caderno de favoritadas';
      }
      return { tipo: tr, titulo: titulo, detalhe: detalhe, estrelas: 0 };
    }
    var it = x.it, tl = TIPOS_LEITURA[it.tipo === 'pdf' && it.parte === 'erradas' ? 'pdfErradas' : it.tipo] || TIPOS_LEITURA.teoria, det = '', estrelas = 0;
    if (it.tipo === 'teoria') {
      var faltam = it.aulas.filter(function (a) { return !a.concluido; });
      det = x.meta ? x.meta.aulas.map(function (u) { return Dados.nomeAula(u.aula) + (u.de ? ' · págs. ' + u.de + ' a ' + u.ate : ''); }).join(' · ') + (x.de > 1 ? ' · tarefa ' + (x.k + 1) + ' de ' + x.de : '')
        : faltam.slice(0, 3).map(function (a) { return Dados.nomeAula(a); }).join(' · ') + (faltam.length > 3 ? ' · + ' + (faltam.length - 3) : '');
      if (!it.aulas.length) det = 'Cadastre as aulas deste bloco';
    } else if (it.tipo === 'bateria') {
      var b = it.bateria;
      det = !it.caderno ? 'Cadastre o caderno deste bloco' : b && b.qtd ? it.caderno.nome + ' · ' + plural(b.qtd - b.feitas, 'questão', 'questões') : it.caderno.nome + ' · informe o total de questões';
    } else if (it.tipo === 'favoritas') {
      det = it.caderno ? it.caderno.nome + (it.qtd ? ' · ' + plural(it.qtd - it.feitas, 'questão', 'questões') : '') : 'Cadastre o caderno de favoritadas';
    } else if (it.tipo === 'pdf') {
      det = it.parte === 'erradas' ? (it.qtd ? plural(it.qtd, 'questão errada', 'questões erradas') : 'Questões que você errar nas ímpares e pares') : 'Questões do próprio PDF da aula';
    } else if (it.tipo === 'erros') {
      det = (it.caderno ? it.caderno.nome : 'Cadastre o caderno de erros') + (it.qtd ? ' · ' + plural(it.qtd - it.feitas, 'questão', 'questões') : '');
    }
    if (it.tipo === 'pdf' && it.blocos.length > 1) estrelas = Math.max.apply(null, it.blocos.map(function (bl) { return Dados.relevancia(bl); }));
    else if (it.tipo === 'erros' && it.par) estrelas = Math.max.apply(null, it.par.blocos.map(function (bl) { return Dados.relevancia(bl); }));
    else if (it.bloco) estrelas = Dados.relevancia(it.bloco);
    return { tipo: tl, titulo: Dashboard.textoEtapa(it), detalhe: det, estrelas: estrelas };
  }

  // Acertos de todo o histórico, por caderno.
  function acertos() {
    var r = {};
    Dados.db.sessoes.forEach(function (s) {
      (s.cadernos || []).forEach(function (l) {
        if (!l.cadernoId) return;
        var x = r[l.cadernoId] || (r[l.cadernoId] = { n: 0, a: 0 }), a = Number(l.acertos) || 0;
        x.a += a; x.n += a + (Number(l.erros) || 0);
      });
    });
    return r;
  }

  // Acerto do que a meta recomenda: no Modo Leitura, as questões do caderno de teoria do bloco (ou dos blocos, na bateria de erros);
  // no Modo Revisão, o caderno da etapa (simulado ou favoritadas) ou os pontos fracos das Estatísticas.
  function acertoDaEtapa(d, x, ac) {
    if (!x) return { pct: null, texto: '' };
    var cadernos = [], nome = '';
    if (x.modo === 'leitura' && x.it.tipo === 'pdf') {
      var ap = Dados.acertoPdf(x.it.blocos.map(function (b) { return b.id; }));
      return { pct: ap.pct, n: ap.n, texto: 'Acerto nas questões do PDF ' + (x.it.blocos.length === 1 ? 'do ' + x.it.blocos[0].nome : 'dos ' + Dados.nomePar({ blocos: x.it.blocos })) };
    }
    if (x.modo === 'leitura') {
      var blocos = x.it.tipo === 'erros' && x.it.par ? x.it.par.blocos : x.it.bloco ? [x.it.bloco] : [];
      blocos.forEach(function (b) { var c = Dados.cadernoDoBloco(b.id); if (c) cadernos.push(c.id); });
      nome = blocos.length === 1 ? 'do ' + blocos[0].nome : blocos.length ? 'dos ' + Dados.nomePar(x.it.par) : '';
    } else if (x.e.tipo === 'fracos') {
      var f = Dados.planoRevisao(d.id).fracos || [], n = 0, erros = 0;
      f.forEach(function (t) { n += t.feitas || 0; erros += t.erros || 0; });
      return { pct: n ? (n - erros) / n * 100 : null, texto: 'Acerto nos pontos fracos (TEC)' };
    } else if (x.e.caderno) {
      cadernos.push(x.e.caderno.id);
      nome = 'do caderno "' + x.e.caderno.nome + '"';
    }
    var tot = { n: 0, a: 0 };
    cadernos.forEach(function (id) { var y = ac[id]; if (y) { tot.n += y.n; tot.a += y.a; } });
    return { pct: tot.n ? tot.a / tot.n * 100 : null, n: tot.n, texto: nome ? 'Acerto nas questões ' + nome : '' };
  }

  // Próximas metas: do lugar seguinte ao atual até o fim da volta; se forem poucas, entra a volta seguinte até somar 10.
  // Quando a mesma matéria aparece mais de uma vez, cada vaga pega a etapa seguinte dela.
  function proximas() {
    var c = Dados.db.ciclo, n = c.itens.length, lista = [];
    if (!n) return lista;
    var cache = {}, volta = c.voltas || 0, atual = c.itens[c.posicaoAtual];
    var dAtual = atual && Dados.disciplina(atual.disciplinaId);
    if (dAtual) etapasDa(dAtual, cache).usados++; // a meta atual já usa a primeira etapa da matéria dela
    for (var passo = 1; passo <= n * 3; passo++) {
      var pos = (c.posicaoAtual + passo) % n, v = volta + Math.floor((c.posicaoAtual + passo) / n);
      if (v > volta && lista.length >= MINIMO_PROXIMAS) break;
      if (v > volta + 1) break;
      var item = c.itens[pos], d = Dados.disciplina(item.disciplinaId);
      if (!d) continue;
      var et = etapasDa(d, cache), x = et.lista[et.usados] || null;
      et.usados++;
      lista.push({ d: d, pos: pos, volta: v, numero: v * n + pos + 1, x: x, sem: !x, modo: et.modo, temBlocos: et.temBlocos, minutos: item.minutosPlanejados });
    }
    return lista;
  }

  function medidor(pct, dica) {
    var comp = 125.66, feito = pct == null ? 0 : Math.max(0, Math.min(100, pct)) / 100 * comp;
    var cor = pct == null ? 'var(--borda-forte)' : pct >= META_ACERTO ? 'var(--verde)' : pct >= 75 ? 'var(--amarelo)' : 'var(--vermelho)';
    var marca = Math.PI * (1 - META_ACERTO / 100), mx = (50 + 40 * Math.cos(marca)).toFixed(1), my = (50 - 40 * Math.sin(marca)).toFixed(1);
    return el('div', { class: 'meta-acerto', title: (dica || 'Acerto') + (pct == null ? ': ainda sem questões resolvidas' : ' (meta: ' + META_ACERTO + '%)'),
      html: '<svg viewBox="0 0 100 58" aria-hidden="true"><path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--superficie-3)" stroke-width="9" stroke-linecap="round"/>' +
        (feito ? '<path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="' + cor + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + feito.toFixed(1) + ' 200"/>' : '') +
        '<circle cx="' + mx + '" cy="' + my + '" r="4" fill="var(--texto)"/></svg>' +
        '<span>' + (pct == null ? '—' : Math.round(pct) + '%') + '</span>' });
  }

  // Etapas do Modo Revisão cobrem todos os assuntos, então não têm relevância: no lugar das estrelas, um lápis escrevendo numa folha.
  var CANETA = '<svg viewBox="0 -5 48 34" aria-hidden="true">' +
    '<rect class="caneta-folha" x="13" y="-2" width="22" height="30" rx="1.5"/>' +
    '<path class="caneta-linha caneta-linha-1" pathLength="1" d="M17 6H31"/><path class="caneta-linha caneta-linha-2" pathLength="1" d="M17 12.5H31"/><path class="caneta-linha caneta-linha-3" pathLength="1" d="M17 19H26"/>' +
    '<g class="caneta-ponta"><path d="M0 0L.7 -2.6L8 -10.5L10 -8.7L2.6 -.7Z"/></g></svg>';

  function estrelas(n, x) {
    if (!n) return x && x.modo === 'revisao'
      ? el('div', { class: 'meta-caneta', title: 'Revisão: todos os assuntos', html: CANETA })
      : el('div');
    return el('div', { class: 'meta-estrelas', title: 'Relevância do bloco: ' + n + ' de 5' }, [1, 2, 3, 4, 5].map(function (i) {
      return el('span', { class: i <= n ? '' : 'vazia', text: '★' });
    }));
  }

  function cartao(m, ac) {
    var info = descrever(m.d, m.x);
    var a = acertoDaEtapa(m.d, m.x, ac);
    return el('div', { class: 'meta-cartao etapa-' + info.tipo[0], role: 'button', tabindex: '0', title: 'Ver os detalhes desta matéria',
      onclick: function () { Dashboard.detalheCiclo(m.pos); },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Dashboard.detalheCiclo(m.pos); } } }, [
      el('div', { class: 'meta-num' }, ['META', el('strong', { text: String(m.numero) })]),
      el('div', { class: 'meta-corpo', style: { borderLeftColor: m.d.cor } }, [
        el('div', { class: 'meta-materia' }, [m.d.nome, m.minutos ? el('span', { class: 'data-fraca', text: ' · ' + Dashboard.fmtHoras(m.minutos * 60) }) : null]),
        el('div', { class: 'meta-titulo', text: info.titulo }),
        info.detalhe ? el('div', { class: 'meta-detalhe', text: info.detalhe }) : null
      ]),
      el('div', { class: 'meta-tipo' }, [UI.icone(info.tipo[2]), el('span', { text: info.tipo[1] })]),
      medidor(a.pct, a.texto + (a.n ? ' · ' + UI.fmtNum(a.n) + ' questões' : '')),
      estrelas(info.estrelas, m.x)
    ]);
  }

  function painelProximas() {
    var lista = proximas();
    var c = Dados.db.ciclo;
    var secao = el('section', { class: 'painel painel-proximas' }, [
      el('div', { class: 'grafico-topo' }, [
        el('h2', { class: 'secao-titulo', text: 'Próximas metas' }),
        el('span', { class: 'data-fraca', text: 'Previsão pelo ciclo, se as metas anteriores forem cumpridas' })
      ])
    ]);
    if (!c.itens.length) { secao.appendChild(el('p', { class: 'data-fraca', text: 'Monte o ciclo de estudos para ver as próximas metas.' })); return secao; }
    if (!lista.length) { secao.appendChild(el('p', { class: 'data-fraca', text: 'Não há outras metas no ciclo.' })); return secao; }
    var ac = acertos(), voltaAtual = c.voltas || 0, caixa = el('div', { class: 'metas-lista' });
    var grupo = null;
    lista.forEach(function (m) {
      var g = m.volta === voltaAtual ? 'Nesta volta (volta ' + (voltaAtual + 1) + ')' : 'Próxima volta (volta ' + (m.volta + 1) + ')';
      if (g !== grupo) { grupo = g; caixa.appendChild(el('div', { class: 'metas-grupo', text: g })); }
      caixa.appendChild(cartao(m, ac));
    });
    secao.appendChild(caixa);
    return secao;
  }

  // Pós-Edital com data da prova: contagem regressiva e quantas metas cabem até a véspera, pelo ritmo das últimas
  // 4 semanas (de todas as fases, porque o concurso novo ainda não tem histórico).
  function painelProva() {
    var c = Dados.faseAtual().concurso, dias = c ? Dados.diasParaProva(c) : null;
    if (!c || dias == null || dias < 0) return null;
    var hoje = UI.hoje(), vespera = UI.somarDias(c.dataProva, -1);
    var ritmo = Dados.comTodosOsEspacos(function () {
      var de = UI.somarDias(hoje, -27), n = 0, primeira = null;
      Dados.db.sessoes.forEach(function (s) {
        if (!s.ciclo) return;
        if (!primeira || s.data < primeira) primeira = s.data;
        if (s.data >= de && s.data <= hoje) n++;
      });
      var janela = primeira ? Math.min(28, Math.max(7, UI.diasEntre(primeira, hoje) + 1)) : 28;
      return { porDia: n / janela, n: n, janela: janela };
    });
    var metas = Math.floor(ritmo.porDia * dias);
    var prev = Previsao.calcular();
    var linhas = [];
    if (dias === 0) linhas.push(el('p', { text: 'A prova é hoje. Boa prova!' }));
    else {
      linhas.push(el('p', null, ritmo.n
        ? ['Dá para cumprir cerca de ', el('strong', { text: UI.fmtNum(metas) + (metas === 1 ? ' meta' : ' metas') }), ' até ' + UI.fmtData(vespera) + ' (véspera), no ritmo de ' +
          String(Math.round(ritmo.porDia * 7 * 10) / 10).replace('.', ',') + ' metas por semana.']
        : ['Ainda não há metas cumpridas nas últimas semanas para estimar o ritmo. Lance as metas pela página Metas.']));
      if (!prev.vazio && prev.etapasRestantes) {
        var cabe = prev.data && prev.data < c.dataProva;
        linhas.push(el('p', { class: cabe ? 'prova-ok' : 'prova-alerta', text: 'Faltam ' + UI.fmtNum(prev.etapasRestantes) + ' etapas para concluir o edital' +
          (prev.data ? ' · previsão: ' + UI.fmtData(prev.data) + (cabe ? ', antes da prova' : ', depois da prova') : prev.semRitmo ? ' · sem ritmo para estimar a data' : '') + '.' }));
      } else if (prev.concluido) linhas.push(el('p', { class: 'prova-ok', text: 'Toda a teoria está concluída: as matérias estão no Modo Revisão.' }));
    }
    return el('section', { class: 'painel painel-prova' }, [
      el('div', { class: 'prova-contagem' }, [
        el('strong', { text: dias === 0 ? 'Hoje' : UI.fmtNum(dias) }),
        el('span', { text: dias === 0 ? 'é a prova' : dias === 1 ? 'dia para a prova' : 'dias para a prova' })
      ]),
      el('div', { class: 'prova-texto' }, [
        el('div', { class: 'rotulo-pequeno', text: 'Até a prova · ' + c.nome + ' · ' + Dados.nomeBancaEdital(c) + ' · ' + UI.fmtData(c.dataProva) })
      ].concat(linhas))
    ]);
  }

  function render(raiz) {
    var hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    raiz.appendChild(el('div', { class: 'pagina-topo' }, el('div', null, [
      el('h1', { class: 'pagina-titulo', text: 'Metas' }),
      el('div', { class: 'pagina-subtitulo', text: hoje.charAt(0).toUpperCase() + hoje.slice(1) })
    ])));
    var prova = painelProva();
    if (prova) raiz.appendChild(prova);
    if (Dados.estaVazio()) {
      var pos = Dados.posEdital();
      raiz.appendChild(el('div', { class: 'vazio' }, pos ? [
        el('p', { class: 'vazio-destaque', text: 'Pós-Edital: ' + Dados.faseAtual().nome }),
        el('p', { text: 'Este concurso começa vazio. Cadastre as matérias, os blocos e os cadernos dele; o Pré-Edital fica guardado em Configurações.' }),
        el('div', { class: 'vazio-acoes' }, [
          el('a', { class: 'btn btn-primario', href: '#/teoria', text: 'Cadastrar as matérias' }),
          el('a', { class: 'btn btn-secundario', href: '#/configuracoes', text: 'Trocar de fase' })
        ])
      ] : [
        el('p', { class: 'vazio-destaque', text: 'Bem-vindo! Comece cadastrando suas disciplinas.' }),
        el('p', { text: 'Depois monte o ciclo de estudos e lance cada meta por aqui.' }),
        el('div', { class: 'vazio-acoes' }, [
          el('a', { class: 'btn btn-primario', href: '#/teoria', text: 'Ir para o Controle de Teoria' }),
          UI.botao('Carregar dados de exemplo', function () { Dados.carregarExemplo(); App.atualizar(); }, 'btn-secundario')
        ])
      ]));
      return;
    }
    raiz.appendChild(Dashboard.linhaTopo());
    raiz.appendChild(Dashboard.indicadores());
    raiz.appendChild(el('div', { class: 'grade-topo' }, [
      Dashboard.cartaoProxima(),
      el('div', { class: 'coluna-lateral' }, [Dashboard.painelCiclo()])
    ]));
    raiz.appendChild(painelProximas());
  }

  return { render: render, proximas: proximas };
})();
