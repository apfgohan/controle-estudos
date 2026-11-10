// Aba "Histórico": todas as sessões de estudo lançadas, agrupadas por dia, com filtros, edição e exclusão.
var Historico = (function () {
  var el = UI.el;
  var DIAS_POR_PAGINA = 30;

  // Filtros (sobrevivem às re-renderizações)
  var filtros = { de: '', ate: '', tipo: '', disciplina: '', fase: 'atual' };
  var diasVisiveis = DIAS_POR_PAGINA;

  function filtrar() {
    return Dados.db.sessoes.filter(function (s) {
      if (filtros.de && s.data < filtros.de) return false;
      if (filtros.ate && s.data > filtros.ate) return false;
      if (filtros.tipo && s.tipo !== filtros.tipo) return false;
      if (filtros.disciplina && s.disciplinaId !== filtros.disciplina) return false;
      return true;
    }).sort(function (a, b) {
      return a.data === b.data ? (b.criadoEm || 0) - (a.criadoEm || 0) : (a.data < b.data ? 1 : -1);
    });
  }

  function resumir(sessoes) {
    var r = { segundos: 0, acertos: 0, erros: 0 };
    sessoes.forEach(function (s) {
      r.segundos += s.segundos || 0;
      (s.cadernos || []).forEach(function (c) { r.acertos += c.acertos; r.erros += c.erros; });
    });
    r.feitas = r.acertos + r.erros;
    r.pct = r.feitas ? r.acertos / r.feitas * 100 : 0;
    return r;
  }

  function fmtHoras(seg) {
    var min = Math.round((seg || 0) / 60), h = Math.floor(min / 60), m = min % 60;
    return h ? h + 'h' + (m ? String(m).padStart(2, '0') : '') : m + 'min';
  }

  function nomeDia(iso) {
    var d = UI.diasEntre(iso, UI.hoje());
    var semana = new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
    var rotulo = d === 0 ? 'Hoje' : d === 1 ? 'Ontem' : semana.charAt(0).toUpperCase() + semana.slice(1);
    return rotulo + ', ' + UI.fmtData(iso);
  }

  // ---------- Filtros ----------
  function aplicar() { diasVisiveis = DIAS_POR_PAGINA; App.atualizar(); }

  function painelFiltros() {
    var de = el('input', { type: 'date', value: filtros.de, max: UI.hoje(), onchange: function () { filtros.de = de.value; aplicar(); } });
    var ate = el('input', { type: 'date', value: filtros.ate, max: UI.hoje(), onchange: function () { filtros.ate = ate.value; aplicar(); } });
    var disc = el('select', { onchange: function () { filtros.disciplina = disc.value; aplicar(); } }, [
      el('option', { value: '', text: 'Todas as disciplinas' })
    ].concat(Dados.disciplinas().map(function (d) {
      return el('option', { value: d.id, text: Dados.estaMesclado() ? d.nome + ' · ' + Dados.faseDe(d.id).nome : d.nome, selected: filtros.disciplina === d.id });
    })));
    // Fase: só a atual ou o acumulado de todas (com mais de uma fase cadastrada).
    var fase = Dados.idsDasFases().length > 1 ? el('div', { class: 'segmentado' }, [['atual', 'Atual: ' + Dados.faseAtual().nome], ['tudo', 'Tudo']].map(function (t) {
      return el('button', { type: 'button', class: filtros.fase === t[0] ? 'ativo' : '', text: t[1], onclick: function () { filtros.fase = t[0]; filtros.disciplina = ''; aplicar(); } });
    })) : null;

    var tipos = el('div', { class: 'segmentado' }, [['', 'Todos'], ['teoria', 'Teoria'], ['questoes', 'Questões'], ['revisao', 'Revisão'], ['anki', 'Anki']].map(function (t) {
      return el('button', { type: 'button', class: filtros.tipo === t[0] ? 'ativo' : '', text: t[1], onclick: function () { filtros.tipo = t[0]; aplicar(); } });
    }));

    function atalho(texto, dias) {
      var deAtalho = dias == null ? '' : UI.somarDias(UI.hoje(), -(dias - 1));
      var ateAtalho = dias == null ? '' : UI.hoje();
      var ativo = filtros.de === deAtalho && filtros.ate === ateAtalho;
      return el('button', { type: 'button', class: 'chip' + (ativo ? ' chip-ativo' : ''), text: texto, onclick: function () {
        filtros.de = deAtalho; filtros.ate = ateAtalho; aplicar();
      } });
    }

    var algumFiltro = filtros.de || filtros.ate || filtros.tipo || filtros.disciplina;
    return el('section', { class: 'painel painel-filtros-historico' }, [
      el('div', { class: 'filtros-historico' }, [
        el('div', { class: 'campo campo-periodo' }, [
          el('span', { class: 'campo-rotulo', text: 'Período' }),
          el('div', { class: 'periodo' }, [de, el('span', { class: 'data-fraca', text: 'até' }), ate]),
          el('div', { class: 'atalhos' }, [atalho('Hoje', 1), atalho('7 dias', 7), atalho('30 dias', 30), atalho('Tudo', null)])
        ]),
        UI.campo('Tipo de estudo', tipos),
        UI.campo('Disciplina', disc),
        fase ? UI.campo('Fase', fase) : null
      ]),
      algumFiltro ? el('div', { class: 'acoes-direita' }, el('button', { type: 'button', class: 'link', text: 'Limpar filtros', onclick: function () {
        filtros = { de: '', ate: '', tipo: '', disciplina: '', fase: filtros.fase };
        aplicar();
      } })) : null
    ]);
  }

  // ---------- Lista por dia ----------
  function linhaSessao(s) {
    var anki = s.tipo === 'anki';
    var d = anki ? null : Dados.disciplina(s.disciplinaId);
    // Na visão de todas as fases, só os estudos da fase atual podem ser editados aqui.
    var deOutraFase = Dados.estaMesclado() && !idsDaFaseAtual[s.id];
    var q = resumir([s]);
    return el('div', { class: 'registro' }, [
      el('div', { class: 'registro-tipo' }, Sessao.seloTipo(s.tipo)),
      el('div', { class: 'registro-corpo' }, [
        el('div', { class: 'registro-disc' }, [
          el('span', { class: 'bolinha', style: { background: anki ? 'var(--teal)' : d ? d.cor : '#ccc' } }),
          el('span', { text: anki ? 'Anki' : d ? d.nome : '(disciplina excluída)' }),
          Dados.estaMesclado() && d ? el('span', { class: 'selo-fase ' + Dados.faseDe(d.id).tipo, text: Dados.faseDe(d.id).nome }) : null
        ]),
        el('div', { class: 'registro-detalhe', text: Sessao.descrever(s) }),
        s.anotacao ? el('div', { class: 'registro-anotacao' }, [UI.icone('nota'), el('span', { text: s.anotacao })]) : null
      ]),
      el('div', { class: 'registro-numeros' }, [
        el('div', { class: 'registro-tempo' }, [UI.icone('relogio'), UI.fmtDuracao(s.segundos)]),
        q.feitas ? el('div', { class: 'registro-questoes' }, [UI.fmtNum(q.feitas) + ' questões · ', UI.acerto(q.pct, q.feitas)]) : null
      ]),
      deOutraFase ? el('div', { class: 'registro-acoes data-fraca', text: 'Outra fase' }) : el('div', { class: 'registro-acoes' }, [
        el('button', { type: 'button', class: 'link', text: 'Editar', onclick: function () { Sessao.abrir({ sessaoId: s.id }); } }),
        el('button', { type: 'button', class: 'link link-perigo', text: 'Excluir', onclick: function () { Sessao.confirmarExclusao(s); } })
      ])
    ]);
  }

  var idsDaFaseAtual = {};
  function render(raiz) {
    idsDaFaseAtual = {};
    Dados.db.sessoes.forEach(function (s) { idsDaFaseAtual[s.id] = true; });
    if (filtros.fase === 'tudo' && Dados.idsDasFases().length > 1) return Dados.comTodosOsEspacos(function () { renderLista(raiz); });
    renderLista(raiz);
  }
  function renderLista(raiz) {
    raiz.appendChild(el('div', { class: 'pagina-topo' }, [
      el('div', null, [
        el('h1', { class: 'pagina-titulo', text: 'Histórico' }),
        el('div', { class: 'pagina-subtitulo', text: 'Todas as sessões de estudo lançadas, da mais recente para a mais antiga' })
      ]),
      UI.botao('+ Lançar estudo', function () { Sessao.abrir({}); }, 'btn-primario')
    ]));

    if (!Dados.db.sessoes.length) {
      raiz.appendChild(el('div', { class: 'vazio' }, [
        el('p', { class: 'vazio-destaque', text: 'Nenhum estudo lançado ainda.' }),
        el('p', { text: 'Cada sessão lançada (teoria, questões ou revisão) aparece aqui, organizada por data.' })
      ]));
      return;
    }

    raiz.appendChild(painelFiltros());

    var sessoes = filtrar();
    var total = resumir(sessoes);
    var porTipo = { teoria: 0, questoes: 0, revisao: 0 };
    sessoes.forEach(function (s) { porTipo[s.tipo] = (porTipo[s.tipo] || 0) + 1; });

    raiz.appendChild(el('div', { class: 'resumo-historico' }, [
      el('div', null, [el('strong', { text: UI.fmtNum(sessoes.length) }), sessoes.length === 1 ? ' sessão' : ' sessões']),
      el('div', null, [el('strong', { text: fmtHoras(total.segundos) }), ' de estudo']),
      el('div', null, [el('strong', { text: UI.fmtNum(total.feitas) }), ' questões', total.feitas ? [' · ', UI.acerto(total.pct, total.feitas)] : null]),
      el('div', { class: 'data-fraca', text: porTipo.teoria + ' teoria · ' + porTipo.questoes + ' questões · ' + porTipo.revisao + ' revisão' + (porTipo.anki ? ' · ' + porTipo.anki + ' Anki' : '') })
    ]));

    if (!sessoes.length) {
      raiz.appendChild(el('div', { class: 'vazio' }, el('p', { text: 'Nenhuma sessão encontrada com esses filtros.' })));
      return;
    }

    // Agrupa por dia
    var dias = [], porDia = {};
    sessoes.forEach(function (s) {
      if (!porDia[s.data]) { porDia[s.data] = []; dias.push(s.data); }
      porDia[s.data].push(s);
    });

    dias.slice(0, diasVisiveis).forEach(function (dia) {
      var lista = porDia[dia];
      var r = resumir(lista);
      raiz.appendChild(el('section', { class: 'dia-historico' }, [
        el('div', { class: 'dia-topo' }, [
          el('h2', { class: 'dia-titulo', text: nomeDia(dia) }),
          el('span', { class: 'data-fraca', text: fmtHoras(r.segundos) + (r.feitas ? ' · ' + UI.fmtNum(r.feitas) + ' questões' : '') + ' · ' + lista.length + (lista.length === 1 ? ' sessão' : ' sessões') })
        ]),
        el('div', { class: 'dia-registros' }, lista.map(linhaSessao))
      ]));
    });

    if (dias.length > diasVisiveis) {
      raiz.appendChild(el('div', { class: 'carregar-mais' }, UI.botao('Mostrar dias anteriores (' + (dias.length - diasVisiveis) + ' restantes)', function () {
        diasVisiveis += DIAS_POR_PAGINA;
        App.atualizar();
      }, 'btn-secundario')));
    }
  }

  return { render: render };
})();
