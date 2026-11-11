// Aba Configurações: perfil e fase de estudo (Pré-Edital ou um concurso do Pós-Edital).
// Cada fase é um espaço separado; clicar no cartão de uma fase passa a estudar nela.
var Configuracoes = (function () {
  var el = UI.el;

  // Números de uma fase: matérias, horas, questões e acerto.
  function resumo(id) {
    var e = Dados.espacoDe(id), seg = 0, feitas = 0, acertos = 0;
    e.sessoes.forEach(function (s) {
      seg += s.segundos || 0;
      (s.cadernos || []).forEach(function (l) { var a = Number(l.acertos) || 0; acertos += a; feitas += a + (Number(l.erros) || 0); });
    });
    return { disciplinas: e.disciplinas.length, segundos: seg, feitas: feitas, acertos: acertos, pct: feitas ? acertos / feitas * 100 : 0 };
  }

  function textoDias(n) {
    if (n == null) return 'sem data da prova';
    if (n < 0) return 'prova já realizada';
    if (n === 0) return 'prova hoje';
    return n + (n === 1 ? ' dia restante' : ' dias restantes');
  }
  function nomeEsfera(id) { var x = Dados.ESFERAS.filter(function (e) { return e[0] === id; })[0]; return x ? x[1] : ''; }

  // Passa a estudar na fase escolhida (com confirmação).
  function usarFase(id) {
    var atual = Dados.faseAtual(), nova = Dados.infoFase(id);
    if (atual.id === nova.id) return;
    if (window.Sessao && Sessao.cronometroAtivo()) {
      UI.modal('Cronômetro em andamento', el('p', { text: 'Lance ou descarte o estudo do cronômetro antes de trocar de fase: ele pertence a ' + atual.nome + '.' }), [{ texto: 'Entendi', classe: 'btn-primario' }]);
      return;
    }
    UI.modal('Trocar de fase', [
      el('p', { text: 'Você vai passar a estudar para ' + (nova.tipo === 'pre' ? 'o Pré-Edital' : nova.nome + ' (Pós-Edital)') + '.' }),
      el('p', { class: 'data-fraca', text: 'As matérias, cadernos, estudos e o ciclo de ' + atual.nome + ' ficam guardados e voltam quando você voltar a essa fase. A patente continua a mesma.' })
    ], [
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: 'Trocar', classe: 'btn-primario', acao: function () {
        Dados.trocarFase(id);
        UI.aviso('Agora você está em ' + Dados.faseAtual().nome);
        if (location.hash === '#/metas') App.atualizar(); else location.hash = '#/metas';
      } }
    ]);
  }

  function segmentado(opcoes, valor, aoMudar) {
    var seg = el('div', { class: 'segmentado' });
    function desenhar() {
      seg.innerHTML = '';
      opcoes.forEach(function (x) {
        seg.appendChild(el('button', { type: 'button', class: valor === x[0] ? 'ativo' : '', text: x[1], onclick: function () { valor = x[0]; desenhar(); aoMudar(valor); } }));
      });
    }
    desenhar();
    return seg;
  }

  // Cadastro ou edição de um concurso do Pós-Edital.
  function editarConcurso(c) {
    var v = { esfera: c ? c.esfera : 'estadual', banca: c ? c.banca : 'fcc' };
    var nome = el('input', { type: 'text', value: c ? c.nome : '', placeholder: 'Ex.: SEFAZ-SP 2027' });
    var outra = el('input', { type: 'text', value: c ? c.bancaOutra || '' : '', placeholder: 'Nome da banca' });
    var campoOutra = UI.campo('Nome da banca', outra, 'Sem a banca no TEC, a incidência usada é a de todas as bancas.');
    var data = el('input', { type: 'date', value: c && c.dataProva || '' });
    function mostrarOutra() { campoOutra.style.display = v.banca === 'outra' ? '' : 'none'; }
    var corpo = [
      UI.campo('Concurso', nome),
      UI.campo('Esfera', segmentado(Dados.ESFERAS, v.esfera, function (x) { v.esfera = x; })),
      UI.campo('Banca', segmentado(Dados.BANCAS_EDITAL, v.banca, function (x) { v.banca = x; mostrarOutra(); }),
        'Na Teoria, só a incidência desta banca é usada.'),
      campoOutra,
      UI.campo('Data da prova', data, 'Para a contagem regressiva e a estimativa de metas até a véspera.')
    ];
    mostrarOutra();
    UI.modal(c ? 'Editar concurso' : 'Novo concurso (Pós-Edital)', corpo, [
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: 'Salvar', classe: 'btn-primario', acao: function () {
        if (!nome.value.trim()) { nome.focus(); UI.aviso('Informe o nome do concurso'); return false; }
        var campos = { nome: nome.value.trim(), esfera: v.esfera, banca: v.banca, bancaOutra: outra.value.trim(), dataProva: data.value || null };
        if (c) { Dados.atualizarConcurso(c.id, campos); App.atualizar(); UI.aviso('Concurso atualizado'); return; }
        var novo = Dados.criarConcurso(campos);
        App.atualizar();
        setTimeout(function () { usarFase(novo.id); }, 0);
      } }
    ], { icone: 'alvo', subtitulo: c ? null : 'O concurso começa vazio: cadastre as matérias, blocos e cadernos dele' });
  }

  function excluirConcurso(c) {
    UI.confirmar('Excluir ' + c.nome + '? Todas as matérias, cadernos, estudos e resumos deste concurso serão apagados. O XP ganho nele sai da patente.', function () {
      setTimeout(function () {
        UI.confirmar('Tem certeza? Isso não pode ser desfeito (a não ser por um backup).', function () {
          Dados.excluirConcurso(c.id); App.atualizar(); UI.aviso('Concurso excluído');
        }, 'Excluir de vez');
      }, 0);
    });
  }

  function cartaoFase(id) {
    var f = Dados.infoFase(id), atual = Dados.faseAtual().id === id, r = resumo(id), c = f.concurso;
    var acessos = Dados.db.fases.acessos || {};
    var dias = c ? Dados.diasParaProva(c) : null;
    return el('div', { class: 'cartao-fase' + (atual ? ' ativo' : ''), role: 'button', tabindex: '0',
      title: atual ? 'Fase em uso' : 'Estudar nesta fase',
      onclick: function () { usarFase(id); },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); usarFase(id); } } }, [
      el('div', { class: 'fase-cabeca' }, [
        el('div', { class: 'fase-titulo' }, [
          el('strong', { text: f.nome }),
          el('span', { class: 'selo-fase ' + f.tipo, text: f.tipo === 'pre' ? 'Pré-Edital' : 'Pós-Edital' })
        ]),
        c ? UI.botaoEngrenagem(function (e) { if (e) e.stopPropagation(); editarConcurso(c); }, 'Editar concurso') : null,
        UI.acerto(Math.round(r.pct), r.feitas, true)
      ]),
      el('div', { class: 'fase-info' }, c
        ? [el('span', { class: 'fase-banca', text: Dados.nomeBancaEdital(c) }), el('span', { text: [nomeEsfera(c.esfera), textoDias(dias), c.dataProva ? 'até ' + UI.fmtData(c.dataProva) : ''].filter(Boolean).join(' • ') })]
        : [el('span', { text: 'Estudo de base, antes do edital' })]),
      el('div', { class: 'fase-numeros', text: r.disciplinas + (r.disciplinas === 1 ? ' disciplina' : ' disciplinas') + ' • ' + UI.fmtNum(r.feitas) + ' questões • ' + Dashboard.fmtHoras(r.segundos) }),
      el('div', { class: 'fase-rodape' }, [
        atual ? el('span', { class: 'fase-em-uso' }, [UI.icone('check'), el('span', { text: 'Em uso agora' })])
          : el('span', { class: 'data-fraca', text: acessos[id] ? 'Último acesso: ' + UI.fmtData(acessos[id]) : 'Ainda não usada' }),
        c && !atual ? el('button', { type: 'button', class: 'link link-perigo', text: 'Excluir', onclick: function (e) { e.stopPropagation(); excluirConcurso(c); } }) : null
      ])
    ]);
  }

  function painelFases() {
    var ids = Dados.idsDasFases();
    var cartoes = ['pre'].concat(Dados.concursos().map(function (c) { return c.id; })).map(cartaoFase);
    cartoes.push(el('button', { type: 'button', class: 'cartao-fase novo', onclick: function () { editarConcurso(null); } }, [
      el('strong', { text: '+ Novo concurso' }),
      el('span', { class: 'data-fraca', text: 'Pós-Edital: concurso, esfera, banca e data da prova' })
    ]));
    var total = ids.map(resumo).reduce(function (a, r) { return { feitas: a.feitas + r.feitas, acertos: a.acertos + r.acertos, segundos: a.segundos + r.segundos }; }, { feitas: 0, acertos: 0, segundos: 0 });
    return el('section', { class: 'painel' }, [
      el('div', { class: 'grafico-topo' }, [
        el('h3', { class: 'secao-titulo', text: 'Fase de estudo' }),
        el('span', { class: 'data-fraca', text: 'Cada fase tem as suas matérias, cadernos e estudos. Clique numa fase para estudar nela.' })
      ]),
      el('div', { class: 'grade-fases' }, cartoes),
      ids.length > 1 ? el('p', { class: 'fase-total data-fraca', text: 'Tudo (todas as fases): ' + UI.fmtNum(total.feitas) + ' questões • ' + Dashboard.fmtHoras(total.segundos) +
        (total.feitas ? ' • ' + UI.fmtPct(Math.round(total.acertos / total.feitas * 100)) + ' de acerto' : '') + '. Veja o acumulado no Dashboard e no Histórico, em "Fase: Tudo".' }) : null
    ]);
  }

  function painelPerfil() {
    var p = Dados.db.perfil || {};
    return el('section', { class: 'painel' }, [
      el('div', { class: 'grafico-topo' }, [el('h3', { class: 'secao-titulo', text: 'Perfil' })]),
      el('div', { class: 'config-perfil' }, [
        Dashboard.fotoPerfil(p),
        el('div', { class: 'config-perfil-texto' }, [
          el('strong', { text: p.nome || 'Meu perfil' }),
          el('span', { class: 'data-fraca', text: p.cargo || 'Auditor Fiscal - Área Fiscal' })
        ]),
        UI.botao('Editar perfil', Dashboard.editarPerfil, 'btn-secundario', 'engrenagem')
      ])
    ]);
  }

  // Média real de páginas por sessão de teoria (só as sessões em que páginas foram informadas).
  function mediaRealPaginas() {
    var pags = 0, n = 0;
    Dados.db.sessoes.forEach(function (s) {
      if (s.tipo !== 'teoria' || !s.paginas) return;
      var p = 0; for (var id in s.paginas) p += Number(s.paginas[id]) || 0;
      if (p > 0) { pags += p; n++; }
    });
    return n ? { media: pags / n, n: n } : null;
  }

  function painelLeitura() {
    var atual = Dados.paginasPorMeta(), real = mediaRealPaginas();
    var entrada = el('input', { type: 'number', min: 0, step: 1, value: atual || '', placeholder: 'Ex.: 20' });
    function salvar(v) {
      Dados.definirPaginasPorMeta(v);
      App.atualizar();
      UI.aviso(Number(v) > 0 ? 'Páginas por meta: ' + Math.round(Number(v)) : 'Sem estimativa por páginas');
    }
    return el('section', { class: 'painel' }, [
      el('div', { class: 'grafico-topo' }, [
        el('h3', { class: 'secao-titulo', text: 'Leitura dos PDFs' }),
        el('span', { class: 'data-fraca', text: 'Com as páginas de cada PDF (na Teoria), a meta de teoria pede o pedaço seguinte e a previsão conta as metas que faltam.' })
      ]),
      el('div', { class: 'config-leitura' }, [
        UI.campo('Páginas lidas, em média, numa meta de teoria', entrada, 'Ex.: PDF de 60 páginas com 20 por meta = 3 metas. Deixe vazio para não usar páginas.'),
        el('div', { class: 'pasta-acoes' }, [
          UI.botao('Salvar', function () { salvar(entrada.value); }, 'btn-primario'),
          real ? UI.botao('Usar a média real (' + Math.round(real.media) + ')', function () { salvar(Math.round(real.media)); }, 'btn-secundario') : null
        ])
      ]),
      el('p', { class: 'data-fraca', text: real ? 'Média real: ' + String(Math.round(real.media * 10) / 10).replace('.', ',') + ' páginas por sessão de teoria, em ' + real.n + (real.n === 1 ? ' sessão' : ' sessões') + ' com páginas informadas (fase atual).'
        : 'Ainda não há sessões de teoria com páginas informadas.' })
    ]);
  }

  function render(raiz) {
    raiz.appendChild(el('div', { class: 'pagina-topo' }, el('div', null, [
      el('h1', { class: 'pagina-titulo', text: 'Configurações' }),
      el('div', { class: 'pagina-subtitulo', text: 'Seu perfil e a fase de estudo: Pré-Edital ou o concurso do Pós-Edital.' })
    ])));
    raiz.appendChild(painelPerfil());
    raiz.appendChild(painelFases());
    raiz.appendChild(painelLeitura());
  }

  // Selo da fase atual no topo de todas as abas.
  function seloTopo() {
    var f = Dados.faseAtual(), c = f.concurso;
    var dias = c ? Dados.diasParaProva(c) : null;
    var longo = f.tipo === 'pre' ? 'Pré-Edital' : ['Pós-Edital', c.nome, Dados.nomeBancaEdital(c), dias == null ? '' : dias === 0 ? 'Prova hoje' : dias > 0 ? 'faltam ' + dias + (dias === 1 ? ' dia' : ' dias') : ''].filter(Boolean).join(' · ');
    var curto = f.tipo === 'pre' ? 'Pré' : 'Pós' + (dias != null && dias >= 0 ? ' · ' + dias + ' d' : '');
    return el('a', { href: '#/configuracoes', class: 'selo-fase-topo ' + f.tipo, title: longo + ' (clique para trocar de fase)' }, [
      el('span', { class: 'selo-fase-ponto' }),
      el('span', { class: 'selo-fase-longo', text: longo }),
      el('span', { class: 'selo-fase-curto', text: curto })
    ]);
  }

  return { render: render, seloTopo: seloTopo, usarFase: usarFase };
})();
