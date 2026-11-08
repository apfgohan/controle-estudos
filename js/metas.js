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
    erros: ['erros', 'Bateria de erros', 'alerta']
  };
  var TIPOS_REVISAO = {
    simulado: ['questoes', 'Simulado', 'caderno2'],
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
      lista = m.plano.pendentes.map(function (it) { return { modo: 'leitura', it: it }; });
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
    var it = x.it, tl = TIPOS_LEITURA[it.tipo] || TIPOS_LEITURA.teoria, det = '', estrelas = 0;
    if (it.tipo === 'teoria') {
      var faltam = it.topicos.filter(function (t) { return !t.concluido; });
      det = faltam.slice(0, 3).map(function (t) { return t.nome; }).join(' · ') + (faltam.length > 3 ? ' · + ' + (faltam.length - 3) : '');
      if (!it.topicos.length) det = 'Bloco ainda sem tópicos';
    } else if (it.tipo === 'bateria') {
      var b = it.bateria;
      det = !it.caderno ? 'Cadastre o caderno deste bloco' : b && b.qtd ? it.caderno.nome + ' · ' + plural(b.qtd - b.feitas, 'questão', 'questões') : it.caderno.nome + ' · informe o total de questões';
    } else if (it.tipo === 'favoritas') {
      det = it.caderno ? it.caderno.nome + (it.qtd ? ' · ' + plural(it.qtd - it.feitas, 'questão', 'questões') : '') : 'Cadastre o caderno de favoritadas';
    } else if (it.tipo === 'erros') {
      det = (it.caderno ? it.caderno.nome : 'Cadastre o caderno de erros') + (it.qtd ? ' · ' + plural(it.qtd - it.feitas, 'questão', 'questões') : '');
    }
    if (it.tipo === 'erros' && it.par) estrelas = Math.max.apply(null, it.par.blocos.map(function (bl) { return Dados.relevancia(bl); }));
    else if (it.bloco) estrelas = Dados.relevancia(it.bloco);
    return { tipo: tl, titulo: Dashboard.textoEtapa(it), detalhe: det, estrelas: estrelas };
  }

  // Acerto de cada matéria nas últimas 4 semanas.
  function acertos() {
    var de = UI.somarDias(UI.hoje(), -27), r = {};
    Dados.db.sessoes.forEach(function (s) {
      if (s.data < de) return;
      var x = r[s.disciplinaId] || (r[s.disciplinaId] = { n: 0, a: 0 });
      (s.cadernos || []).forEach(function (l) { var a = Number(l.acertos) || 0; x.a += a; x.n += a + (Number(l.erros) || 0); });
    });
    return r;
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

  function medidor(pct) {
    var comp = 125.66, feito = pct == null ? 0 : Math.max(0, Math.min(100, pct)) / 100 * comp;
    var cor = pct == null ? 'var(--borda-forte)' : pct >= META_ACERTO ? 'var(--verde)' : pct >= 75 ? 'var(--amarelo)' : 'var(--vermelho)';
    var marca = Math.PI * (1 - META_ACERTO / 100), mx = (50 + 40 * Math.cos(marca)).toFixed(1), my = (50 - 40 * Math.sin(marca)).toFixed(1);
    return el('div', { class: 'meta-acerto', title: pct == null ? 'Sem questões nas últimas 4 semanas' : 'Acerto da matéria nas últimas 4 semanas (meta: ' + META_ACERTO + '%)',
      html: '<svg viewBox="0 0 100 58" aria-hidden="true"><path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--superficie-3)" stroke-width="9" stroke-linecap="round"/>' +
        (feito ? '<path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="' + cor + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + feito.toFixed(1) + ' 200"/>' : '') +
        '<circle cx="' + mx + '" cy="' + my + '" r="4" fill="var(--texto)"/></svg>' +
        '<span>' + (pct == null ? '—' : Math.round(pct) + '%') + '</span>' });
  }

  function estrelas(n) {
    if (!n) return el('div', { class: 'meta-estrelas meta-sem', text: 'Revisão: todos os assuntos' });
    return el('div', { class: 'meta-estrelas', title: 'Relevância do bloco: ' + n + ' de 5' }, [1, 2, 3, 4, 5].map(function (i) {
      return el('span', { class: i <= n ? '' : 'vazia', text: '★' });
    }));
  }

  function cartao(m, ac) {
    var info = descrever(m.d, m.x);
    var a = ac[m.d.id];
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
      medidor(a && a.n ? a.a / a.n * 100 : null),
      estrelas(info.estrelas)
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

  function render(raiz) {
    var hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    raiz.appendChild(el('div', { class: 'pagina-topo' }, el('div', null, [
      el('h1', { class: 'pagina-titulo', text: 'Metas' }),
      el('div', { class: 'pagina-subtitulo', text: hoje.charAt(0).toUpperCase() + hoje.slice(1) })
    ])));
    if (Dados.estaVazio()) {
      raiz.appendChild(el('div', { class: 'vazio' }, [
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
