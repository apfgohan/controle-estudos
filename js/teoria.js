// Aba "Controle de Teoria": disciplinas, blocos e tópicos.
var Teoria = (function () {
  var el = UI.el;

  // ---------- Lista de disciplinas ----------
  function renderLista(raiz) {
    var lista = Dados.disciplinas();

    raiz.appendChild(el('div', { class: 'pagina-topo' }, [
      el('div', null, [
        el('h1', { class: 'pagina-titulo', text: 'Controle de Teoria' }),
        el('div', { class: 'pagina-subtitulo', text: lista.length ? 'Selecione a disciplina para continuar' : 'Comece cadastrando suas disciplinas' })
      ]),
      el('div', { class: 'pagina-acoes' }, [
        el('div', { class: 'contador' }, [el('strong', { text: lista.length }), ' disciplina' + (lista.length === 1 ? '' : 's')]),
        UI.botao('+ Disciplina', function () { editarDisciplina(null); }, 'btn-primario')
      ])
    ]));

    if (!lista.length) {
      raiz.appendChild(el('div', { class: 'vazio' }, [
        el('p', { text: 'Nenhuma disciplina cadastrada ainda.' }),
        el('div', { class: 'vazio-acoes' }, [
          UI.botao('+ Cadastrar disciplina', function () { editarDisciplina(null); }, 'btn-primario'),
          UI.botao('Carregar dados de exemplo', function () { Dados.carregarExemplo(); App.atualizar(); }, 'btn-secundario')
        ])
      ]));
      return;
    }

    raiz.appendChild(el('div', { class: 'lista-disciplinas' }, lista.map(linhaDisciplina)));
  }

  function linhaDisciplina(d) {
    var p = Dados.progressoTeoria(d.id);
    var completa = p.total > 0 && p.feitos === p.total;
    return el('div', { class: 'linha-disciplina', style: { borderLeftColor: d.cor } }, [
      el('div', { class: 'linha-nome' + (completa ? ' completo' : ''), text: d.nome }),
      el('div', { class: 'linha-config' }, [
        UI.botaoEngrenagem(function () { editarDisciplina(d); }, 'Editar disciplina'),
        el('span', { class: 'chip-cor' }, [el('span', { class: 'bolinha', style: { background: d.cor } }), 'Cor'])
      ]),
      el('div', { class: 'linha-metricas' }, [
        UI.metrica('Progresso', UI.fmtPct(p.pct), completa ? 'completo' : ''),
        UI.metrica('Tópicos', p.feitos + ' / ' + p.total),
        UI.metrica('Último estudo', UI.haQuanto(Dados.ultimoEstudo(d.id, 'teoria')))
      ]),
      el('a', { class: 'btn btn-abrir', href: '#/teoria/' + d.id }, ['Abrir disciplina', UI.icone('seta')])
    ]);
  }

  function editarDisciplina(d) {
    var nome = el('input', { type: 'text', value: d ? d.nome : '', placeholder: 'Ex.: Direito Tributário', required: true });
    var cor = el('input', { type: 'color', value: d ? d.cor : corSugerida() });
    var peso = el('input', { type: 'number', min: 0, step: 1, value: d ? d.peso : 1 });

    var botoes = [{ texto: 'Cancelar', classe: 'btn-secundario' }];
    if (d) botoes.unshift({ texto: 'Excluir', classe: 'btn-perigo btn-esquerda', acao: function () {
      UI.confirmar('Excluir "' + d.nome + '"? Todos os blocos, tópicos, cadernos, sessões e o resumo dessa disciplina serão apagados.', function () {
        Dados.excluirDisciplina(d.id);
        location.hash = location.hash.split('/').slice(0, 2).join('/'); // volta para a lista da aba atual
        App.atualizar();
      });
    } });
    botoes.push({ texto: 'Salvar', classe: 'btn-primario', acao: function () {
      var n = nome.value.trim();
      if (!n) { nome.focus(); return false; }
      if (d) Dados.atualizarDisciplina(d.id, { nome: n, cor: cor.value, peso: peso.value });
      else Dados.criarDisciplina({ nome: n, cor: cor.value, peso: peso.value });
      App.atualizar();
    } });

    UI.modal(d ? 'Editar disciplina' : 'Nova disciplina', [
      UI.campo('Nome', nome),
      el('div', { class: 'campos-linha' }, [
        UI.campo('Cor', cor),
        UI.campo('Peso', peso, 'Importância no edital')
      ])
    ], botoes);
  }

  var paleta = ['#4f7cff', '#e5534b', '#4fc9d6', '#d64fa8', '#6cc24a', '#e07b4f', '#2bb5a0', '#8a63d2', '#e0b030', '#5b6b82'];
  function corSugerida() { return paleta[Dados.disciplinas().length % paleta.length]; }

  // ---------- Tela da disciplina ----------
  // Escolha do modo de estudo: seguir o Modo Leitura até o fim (passa sozinho para o Modo Revisão)
  // ou entrar logo no Modo Revisão. Com o Modo Leitura concluído, a matéria já está em Revisão.
  function painelModo(d) {
    var m = Dados.modoDeEstudo(d.id);
    var pendentes = m.plano.pendentes.length;
    if (m.leituraConcluida) {
      return el('div', { class: 'painel-modo' }, [
        el('div', { class: 'painel-modo-texto' }, [
          el('span', { class: 'rotulo-pequeno', text: 'Modo de estudo' }),
          el('span', { class: 'selo-modo revisao', text: 'Modo Revisão' }),
          el('span', { class: 'data-fraca', text: 'O Modo Leitura foi concluído (teoria e todas as baterias).' })
        ])
      ]);
    }
    function opcao(valor, titulo, sub) {
      var ativo = (valor === 'revisao') === m.escolhido;
      return el('button', { type: 'button', class: 'opcao-modo' + (ativo ? ' ativo' : ''), 'aria-pressed': String(ativo), onclick: function () {
        if (ativo) return;
        Dados.atualizarDisciplina(d.id, { modo: valor });
        App.atualizar();
        UI.aviso(valor === 'revisao' ? d.nome + ' agora está no Modo Revisão' : d.nome + ' voltou para o Modo Leitura');
      } }, [el('strong', { text: titulo }), el('span', { text: sub })]);
    }
    return el('div', { class: 'painel-modo' }, [
      el('div', { class: 'painel-modo-texto' }, [
        el('span', { class: 'rotulo-pequeno', text: 'Modo de estudo' }),
        el('span', { class: 'selo-modo ' + m.modo, text: m.modo === 'revisao' ? 'Modo Revisão' : 'Modo Leitura' })
      ]),
      el('div', { class: 'opcoes-modo' }, [
        opcao('auto', 'Seguir o Modo Leitura até o fim', 'Teoria e baterias; passa sozinho para o Modo Revisão ao terminar' + (pendentes ? ' (faltam ' + pendentes + (pendentes === 1 ? ' etapa)' : ' etapas)') : '')),
        opcao('revisao', 'Ir direto para o Modo Revisão', 'Simulados, favoritadas e pontos fracos, mesmo sem concluir o Modo Leitura')
      ])
    ]);
  }

  function renderDisciplina(raiz, id) {
    var d = Dados.disciplina(id);
    if (!d) { location.hash = '#/teoria'; return; }
    var p = Dados.progressoTeoria(d.id);
    var anot = Dados.ultimaAnotacao(d.id, 'teoria');
    var detalheAnot = anot && anot.topicoIds && anot.topicoIds.length
      ? 'Tópico: ' + anot.topicoIds.map(function (t) { var x = Dados.topico(t); return x ? x.nome : ''; }).filter(Boolean).join('; ')
      : '';

    raiz.appendChild(el('section', { class: 'painel' }, [
      el('div', { class: 'pagina-topo' }, [
        el('div', null, [
          el('h1', { class: 'disciplina-titulo', text: d.nome }),
          el('div', { class: 'pagina-subtitulo', text: 'Controle de Teoria' })
        ]),
        el('div', { class: 'pagina-acoes' }, [
          UI.botao('Histórico de estudos', function () { historico(d); }, 'btn-contorno', 'historico'),
          UI.botao('Trocar disciplina', function () { trocarDisciplina('teoria'); }, 'btn-contorno', 'trocar')
        ])
      ]),
      el('div', { class: 'cartoes' }, [
        UI.cartao('progresso', 'Progresso', UI.fmtPct(p.pct)),
        UI.cartao('lista', 'Tópicos', p.feitos + ' / ' + p.total),
        UI.cartao('info', 'Último estudo', UI.haQuanto(Dados.ultimoEstudo(d.id, 'teoria'))),
        UI.cartao('relogio', 'Tempo acumulado', UI.fmtDuracao(Dados.tempoAcumulado(d.id, 'teoria')))
      ]),
      painelModo(d),
      UI.blocoAnotacao(anot, detalheAnot)
    ]));

    raiz.appendChild(el('section', { class: 'painel' }, [
      el('h2', { class: 'secao-titulo', text: 'Controle de Teoria' }),
      el('div', { class: 'progresso-geral' }, [
        el('div', { class: 'progresso-geral-esq' }, [
          el('div', { class: 'rotulo-pequeno', text: 'Progresso' }),
          el('div', { class: 'pct-grande' + (p.pct >= 100 ? ' completo' : ''), text: UI.fmtPct(p.pct) }),
          UI.barra(p.pct, d.cor)
        ]),
        el('div', { class: 'mini-cartao' }, [el('div', { class: 'rotulo-pequeno', text: 'Estudado' }), el('div', { class: 'mini-valor', text: p.feitos + ' / ' + p.total })]),
        el('div', { class: 'mini-cartao clicavel', title: 'Alterar peso', onclick: function () { editarDisciplina(d); } }, [
          el('div', { class: 'rotulo-pequeno', text: 'Peso' }), el('div', { class: 'mini-valor', text: d.peso })
        ])
      ]),
      el('div', { class: 'novo-bloco' }, [
        UI.botao('+ Bloco', function () { editarBloco(d, null); }, 'btn-tracejado'),
        el('span', { text: 'Crie blocos para organizar seus tópicos (ex.: as aulas do curso).' })
      ])
    ].concat(Dados.blocosDe(d.id).map(function (b) { return cartaoBloco(d, b); }))));
  }

  // ---------- Incidência (TEC) ----------
  function fmtPct1(v) { return UI.fmtPct(Math.round((v || 0) * 10) / 10); }

  // Peso de uma banca em relação a "Todas": 'mais' (30% acima ou mais), 'menos' (30% abaixo ou mais) ou ''.
  function pesoBanca(pctBanca, pctTodas) {
    if (pctTodas == null || !pctTodas) return pctBanca ? 'mais' : '';
    var r = (pctBanca || 0) / pctTodas;
    return r >= 1.3 ? 'mais' : r <= 0.7 ? 'menos' : '';
  }

  // Chips das bancas (menos "Todas") com a % e se ela dá mais ou menos peso que a média geral.
  function chipsBancas(pct, titulo) {
    return Dados.BANCAS.filter(function (x) { return x[0] !== 'todas' && pct[x[0]] != null; }).map(function (x) {
      var p = pesoBanca(pct[x[0]], pct.todas);
      return el('span', { class: 'chip-banca' + (p ? ' ' + p : ''), title: (titulo || '') + x[1] + ': ' + fmtPct1(pct[x[0]]) + ' das questões da matéria' +
        (p === 'mais' ? ' · dá mais peso que a média das bancas' : p === 'menos' ? ' · dá menos peso que a média das bancas' : '') },
        x[1] + ' ' + fmtPct1(pct[x[0]]) + (p === 'mais' ? ' ▲' : p === 'menos' ? ' ▼' : ''));
    });
  }

  // Relevância do bloco: automática pela incidência do TEC (assuntos do bloco x bloco médio da matéria); sem ela, 1 a 5 marcada à mão.
  function estrelasBloco(b) {
    var n = Dados.relevancia(b), inc = Dados.incidenciaBloco(b);
    if (inc && inc.auto) {
      return el('span', { class: 'estrelas auto', title: 'Automática: ' + fmtPct1(inc.pct.todas) + ' das questões da matéria (todas as bancas) · ' +
        (Math.round(inc.razao * 100) / 100).toString().replace('.', ',') + ' vezes a média dos blocos', 'aria-label': 'Relevância ' + n + ' de 5' },
        [1, 2, 3, 4, 5].map(function (i) { return el('span', { class: 'estrela' + (i <= n ? ' cheia' : ''), text: '★' }); }));
    }
    return el('span', { class: 'estrelas', title: 'Relevância deste bloco: ' + n + ' de 5 (escolha os assuntos do TEC para calcular automaticamente)', role: 'group', 'aria-label': 'Relevância' }, [1, 2, 3, 4, 5].map(function (i) {
      return el('button', { type: 'button', class: 'estrela' + (i <= n ? ' cheia' : ''), text: '★', title: i + (i === 1 ? ' estrela' : ' estrelas'),
        onclick: function () { Dados.definirRelevancia(b.id, i); App.atualizar(); } });
    }));
  }

  var ICONE_MATERIAL = { pdf: 'pdf', video: 'video', resumo: 'lista', lei: 'lei' };
  function nomeTipoMaterial(tipo) { var x = Dados.TIPOS_MATERIAL.filter(function (y) { return y[0] === tipo; })[0]; return x ? x[1] : 'PDF'; }

  function faixaMateriais(b) {
    var lista = (b.materiais || []).map(function (m) {
      var texto = [el('strong', { text: nomeTipoMaterial(m.tipo) }), ' ' + m.nome + (m.curso ? ' · ' + m.curso : '')];
      return el('span', { class: 'material material-' + m.tipo }, [
        UI.icone(ICONE_MATERIAL[m.tipo] || 'pdf'),
        m.link ? el('a', { href: m.link, target: '_blank', rel: 'noopener noreferrer', title: 'Abrir o material' }, texto) : el('span', { title: 'Sem link — cadastre na engrenagem' }, texto),
        UI.botaoEngrenagem(function () { editarMaterial(b, m); }, 'Editar material')
      ]);
    });
    return el('div', { class: 'materiais' }, [el('span', { class: 'materiais-rotulo', text: 'Materiais' })].concat(lista, [
      el('button', { type: 'button', class: 'link', text: '+ Material', onclick: function () { editarMaterial(b, null); } })
    ]));
  }

  function editarMaterial(b, m) {
    var tipo = m ? m.tipo : 'pdf';
    var seg = el('div', { class: 'segmentado' });
    function desenhar() {
      seg.innerHTML = '';
      Dados.TIPOS_MATERIAL.forEach(function (x) {
        seg.appendChild(el('button', { type: 'button', class: tipo === x[0] ? 'ativo' : '', text: x[1], onclick: function () { tipo = x[0]; desenhar(); } }));
      });
    }
    desenhar();
    var nome = el('input', { type: 'text', value: m ? m.nome : '', placeholder: 'Ex.: 00 - Atos Administrativos' });
    var idLista = 'cursos-' + b.id;
    var curso = el('input', { type: 'text', value: m ? m.curso : '', placeholder: 'Ex.: Estratégia', list: idLista });
    var lista = el('datalist', { id: idLista }, Dados.cursosUsados().map(function (c) { return el('option', { value: c }); }));
    var link = el('input', { type: 'text', inputmode: 'url', value: m ? m.link : '', placeholder: 'https://...' });
    var botoes = [{ texto: 'Cancelar', classe: 'btn-secundario' }];
    if (m) botoes.unshift({ texto: 'Excluir', classe: 'btn-perigo btn-esquerda', acao: function () {
      UI.confirmar('Excluir o material "' + m.nome + '"?', function () { Dados.excluirMaterial(b.id, m.id); App.atualizar(); });
    } });
    botoes.push({ texto: 'Salvar', classe: 'btn-primario', acao: function () {
      if (!nome.value.trim()) { nome.focus(); return false; }
      var campos = { tipo: tipo, nome: nome.value, curso: curso.value, link: link.value };
      if (m) Dados.atualizarMaterial(b.id, m.id, campos); else Dados.criarMaterial(b.id, campos);
      App.atualizar();
    } });
    UI.modal(m ? 'Editar material' : 'Novo material — ' + b.nome, [
      UI.campo('Tipo', seg),
      UI.campo('Nome', nome, 'Sem o tipo, que já aparece antes do nome. Ex.: 00 - Atos Administrativos, ou 01 - Bancos de Dados.'),
      UI.campo('Curso', curso), lista,
      UI.campo('Link', link, 'Opcional: abre o material com um clique.')
    ], botoes);
  }

  // Situação dos tópicos antigos (arquivados na troca para os assuntos do TEC), enquanto o bloco está vazio.
  function avisoHeranca(b) {
    var h = b.herancaTeoria;
    if (!h) return null;
    var antes = 'Antes da troca: ' + h.qtd + (h.qtd === 1 ? ' tópico' : ' tópicos') +
      (h.concluida ? ', todos concluídos' + (h.data ? ' (até ' + UI.fmtData(h.data) + ')' : '') + '. Os assuntos que você escolher já entram concluídos.'
        : h.feitos ? ', ' + h.feitos + ' concluídos.' : ', nenhum concluído.');
    return el('div', { class: 'aviso-suave bloco-heranca' }, [el('strong', { text: 'Escolha os assuntos do TEC deste bloco. ' }), antes]);
  }

  function cartaoBloco(d, b) {
    var pb = Dados.progressoBloco(b.id);
    var topicos = Dados.topicosDe(b.id);
    var inc = Dados.incidenciaBloco(b);
    var temArvore = !!Dados.arvoreIncidencia(d.id);
    return el('div', { class: 'bloco' }, [
      el('div', { class: 'bloco-topo' }, [
        el('div', { class: 'bloco-nome', text: b.nome }),
        el('div', { class: 'bloco-direita' }, [
          inc && inc.pct.todas != null ? el('span', { class: 'bloco-incidencia', title: 'Questões da matéria (todas as bancas) que caem nos assuntos deste bloco', text: fmtPct1(inc.pct.todas) + ' das questões' }) : null,
          estrelasBloco(b),
          el('span', { class: 'pilula' + (pb.pct >= 100 ? ' completo' : ''), text: '(' + pb.feitos + '/' + pb.total + ' • ' + UI.fmtPct(pb.pct) + ')' }),
          UI.botaoEngrenagem(function () { editarBloco(d, b); }, 'Editar bloco')
        ])
      ]),
      inc ? el('div', { class: 'bloco-bancas' }, chipsBancas(inc.pct)) : null,
      UI.barra(pb.pct, d.cor),
      faixaMateriais(b),
      !topicos.length ? avisoHeranca(b) : null,
      el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela' }, [
        el('thead', null, el('tr', null, ['Tópico', 'Status', 'Último estudo', 'Ação'].map(function (h) { return el('th', { text: h }); }))),
        el('tbody', null, topicos.length ? topicos.map(function (t) { return linhaTopico(d, t); })
          : el('tr', null, el('td', { colspan: 4, class: 'tabela-vazia', text: 'Nenhum tópico neste bloco.' })))
      ])),
      el('div', { class: 'bloco-rodape' }, [
        UI.botao('Escolher assuntos do TEC', function () { escolherAssuntos(d, b); }, temArvore ? 'btn-secundario' : 'btn-secundario btn-apagado', 'lista'),
        el('button', { type: 'button', class: 'link', onclick: function () { novosTopicos(b); }, text: '+ Tópico manual' })
      ])
    ]);
  }

  // Modal: árvore da incidência da matéria. Marcar um assunto inclui todos os subassuntos dele.
  function escolherAssuntos(d, b) {
    var arv = Dados.arvoreIncidencia(d.id);
    if (!arv) {
      UI.modal('Assuntos do TEC — ' + b.nome, [
        el('p', { class: 'modal-desc', text: 'Ainda não há incidência importada para ' + d.nome + '.' }),
        el('p', null, ['Importe a planilha de incidência do TEC na aba ', el('a', { href: '#/estatisticas', text: 'Estatísticas' }), ' (tipo "Incidência", banca "Todas").'])
      ], [{ texto: 'Fechar', classe: 'btn-secundario' }]);
      return;
    }
    var bancas = Dados.BANCAS.filter(function (x) { return arv.totais[x[0]] != null; });
    var sel = Dados.topicosDe(b.id).filter(function (t) { return t.tec && arv.nos[t.tec.chave]; }).map(function (t) { return t.tec.chave; });
    var outros = {};
    Dados.blocosDe(d.id).forEach(function (o) {
      if (o.id === b.id) return;
      Dados.topicosDe(o.id).forEach(function (t) { if (t.tec) outros[t.tec.chave] = o.nome; });
    });
    var abertos = {};
    sel.forEach(function (c) { var n = arv.nos[c]; while (n && n.pai && arv.nos[n.pai]) { abertos[n.pai] = true; n = arv.nos[n.pai]; } });
    var busca = el('input', { type: 'search', placeholder: 'Ex.: responsabilidade, ICMS, 07.04…', oninput: desenhar });
    var lista = el('div', { class: 'arvore-tec' });
    var total = el('div', { class: 'arvore-total' });

    function incluidoPorPai(n) {
      for (var p = n.pai && arv.nos[n.pai]; p; p = p.pai && arv.nos[p.pai]) if (sel.indexOf(p.chave) >= 0) return true;
      return false;
    }
    function bate(n, termo) {
      if (!termo) return true;
      if (Planilha.normalizar(n.codigo + ' ' + n.nome).indexOf(termo) >= 0) return true;
      return n.filhos.some(function (f) { return bate(f, termo); });
    }
    function alternar(n, marcar) {
      sel = sel.filter(function (c) { return c !== n.chave; });
      if (marcar) {
        var desc = Dados.descendentes(n).map(function (x) { return x.chave; });
        sel = sel.filter(function (c) { return desc.indexOf(c) < 0; }).concat([n.chave]);
      }
      desenhar();
    }
    function linha(n, nivel, termo) {
      if (!bate(n, termo)) return [];
      var incl = incluidoPorPai(n), marcado = incl || sel.indexOf(n.chave) >= 0;
      var aberto = termo ? true : !!abertos[n.chave];
      var linhaEl = el('div', { class: 'at-linha' + (incl ? ' at-incluido' : '') + (outros[n.chave] ? ' at-outro' : ''), style: { paddingLeft: (8 + nivel * 18) + 'px' } }, [
        n.filhos.length ? el('button', { type: 'button', class: 'at-abrir' + (aberto ? ' aberto' : ''), title: aberto ? 'Fechar' : 'Abrir', onclick: function () { abertos[n.chave] = !aberto; desenhar(); } }, UI.icone('abrir'))
          : el('span', { class: 'at-abrir vazio' }),
        el('label', { class: 'at-nome' }, [
          el('input', { type: 'checkbox', checked: marcado, disabled: incl, onchange: function (e) { alternar(n, e.target.checked); } }),
          el('span', { class: 'at-codigo', text: n.codigo }),
          el('span', { text: n.nome }),
          outros[n.chave] ? el('span', { class: 'at-marca', text: 'no ' + outros[n.chave] }) : null,
          incl ? el('span', { class: 'at-marca', text: 'incluído' }) : null
        ]),
        el('div', { class: 'at-nums' }, bancas.map(function (x) {
          var v = n.bancas[x[0]], p = x[0] === 'todas' ? '' : pesoBanca(v && v.pct, n.bancas.todas && n.bancas.todas.pct);
          return el('span', { class: 'at-num' + (p ? ' ' + p : ''), text: v ? fmtPct1(v.pct) : '—' });
        }))
      ]);
      var r = [linhaEl];
      if (aberto) n.filhos.forEach(function (f) { r = r.concat(linha(f, nivel + 1, termo)); });
      return r;
    }
    function desenhar() {
      var termo = Planilha.normalizar(busca.value);
      lista.innerHTML = '';
      lista.appendChild(el('div', { class: 'at-linha at-cabecalho' }, [el('span'), el('span', { text: 'Assunto' }),
        el('div', { class: 'at-nums' }, bancas.map(function (x) { return el('span', { class: 'at-num', text: x[0] === 'todas' ? 'Todas' : x[1] }); }))]));
      arv.raizes.forEach(function (n) { linha(n, 0, termo).forEach(function (x) { lista.appendChild(x); }); });
      // Totalizador: % do bloco e as estrelas que ele teria.
      var s = Dados.somarIncidencia(arv, sel);
      var rel = Dados.relevanciasDaDisciplina(d.id), outrosPct = Object.keys(rel).filter(function (id) { return id !== b.id; }).map(function (id) { return rel[id].pct.todas || 0; });
      var estrelas = null;
      if (arv.totais.todas != null && sel.length) {
        var media = outrosPct.concat([s.pct.todas]).reduce(function (a, v) { return a + v; }, 0) / (outrosPct.length + 1);
        estrelas = media > 0 ? Dados.estrelasPorRazao(s.pct.todas / media) : null;
      }
      total.innerHTML = '';
      total.appendChild(el('span', null, [el('strong', { text: sel.length + (sel.length === 1 ? ' assunto' : ' assuntos') }),
        sel.length ? ' · ' + (s.pct.todas != null ? fmtPct1(s.pct.todas) + ' das questões (todas as bancas)' : '') : '']));
      if (estrelas) total.appendChild(el('span', { class: 'estrelas auto', title: 'Estrelas previstas para o bloco' }, [1, 2, 3, 4, 5].map(function (i) { return el('span', { class: 'estrela' + (i <= estrelas ? ' cheia' : ''), text: '★' }); })));
      if (sel.length) total.appendChild(el('span', { class: 'bloco-bancas' }, chipsBancas(s.pct)));
    }
    desenhar();
    var m = UI.modal('Assuntos do TEC — ' + b.nome, [
      el('p', { class: 'modal-desc', text: 'Marque os assuntos estudados neste bloco. Marcar um assunto inclui todos os subassuntos dele. As % são da matéria em cada banca; ▲/▼ indicam banca que dá mais ou menos peso que a média.' }),
      UI.campo('Buscar assunto', busca), lista, total
    ], [
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: 'Salvar assuntos', classe: 'btn-primario', acao: function () {
        Dados.definirAssuntosTec(b.id, sel);
        App.atualizar();
        UI.aviso('Assuntos do ' + b.nome + ' atualizados');
      } }
    ]);
    m.caixa.classList.add('modal-largo', 'modal-arvore');
  }

  // Assunto do TEC de um tópico: código, % (todas as bancas), subassuntos incluídos e bancas que dão mais peso.
  function infoTec(d, t) {
    var arv = t.tec && Dados.arvoreIncidencia(d.id), n = arv && arv.nos[t.tec.chave];
    if (!n) return t.tec ? [el('span', { class: 'tec-codigo', text: t.tec.codigo || 'TEC' })] : [];
    var desc = Dados.descendentes(n);
    var pct = {}; Object.keys(n.bancas).forEach(function (k) { pct[k] = n.bancas[k].pct; });
    var mais = Dados.BANCAS.filter(function (x) { return x[0] !== 'todas' && pct[x[0]] != null && pesoBanca(pct[x[0]], pct.todas) === 'mais'; }).map(function (x) { return x[1]; });
    return [
      el('span', { class: 'tec-codigo', text: n.codigo }),
      pct.todas != null ? el('span', { class: 'tec-pct', title: 'Questões da matéria (todas as bancas)', text: fmtPct1(pct.todas) }) : null,
      desc.length ? el('span', { class: 'tec-sub', title: desc.map(function (x) { return x.codigo + ' ' + x.nome; }).join('\n'), text: 'inclui ' + desc.length + (desc.length === 1 ? ' subtópico' : ' subtópicos') }) : null,
      mais.length ? el('span', { class: 'tec-mais', title: 'Bancas que dão mais peso a este assunto', text: '▲ ' + mais.join(', ') }) : null
    ];
  }

  function linhaTopico(d, t) {
    var ultimo = Dados.ultimoEstudoTopico(t.id);
    return el('tr', { class: t.concluido ? 'concluido' : '' }, [
      el('td', { class: 'col-topico' }, el('div', { class: 'topico-nome' }, [
        el('span', { class: 'topico-texto' }, [el('span', { text: t.nome }), el('span', { class: 'topico-tec' }, infoTec(d, t))]),
        UI.botaoEngrenagem(function () { editarTopico(d, t); }, 'Editar tópico')
      ])),
      el('td', null, t.concluido ? UI.selo('Concluído', 'sucesso') : UI.selo('Pendente', 'neutro')),
      el('td', null, ultimo ? [
        el('div', { class: 'data-forte', text: UI.fmtData(ultimo) }),
        t.dataConclusao ? el('div', { class: 'data-fraca', text: 'Concluído em ' + UI.fmtData(t.dataConclusao) }) : null
      ] : el('span', { class: 'data-fraca', text: '—' })),
      el('td', null, el('div', { class: 'acoes-linha' }, [
        el('button', {
          type: 'button', class: 'btn-check' + (t.concluido ? ' marcado' : ''),
          title: t.concluido ? 'Desmarcar como concluído' : 'Marcar como concluído',
          onclick: function () { Dados.definirConcluido(t.id, !t.concluido); App.atualizar(); }
        }, UI.icone('check')),
        window.Sessao ? UI.botao('Lançar estudo', function () { Sessao.abrir({ disciplinaId: d.id, tipo: 'teoria', topicoIds: [t.id] }); }, 'btn-lancar', 'play') : null
      ]))
    ]);
  }

  function editarBloco(d, b) {
    var nome = el('input', { type: 'text', value: b ? b.nome : 'Bloco ' + String(Dados.blocosDe(d.id).length + 1).padStart(2, '0'), required: true });
    var posicao = b ? UI.seletorPosicao(Dados.blocosDe(d.id).length, b.ordem) : null;
    var topicos = b ? null : el('textarea', { rows: 6, placeholder: 'Opcional: cole aqui os tópicos deste bloco, um por linha.' });
    var botoes = [{ texto: 'Cancelar', classe: 'btn-secundario' }];
    if (b) botoes.unshift({ texto: 'Excluir', classe: 'btn-perigo btn-esquerda', acao: function () {
      UI.confirmar('Excluir "' + b.nome + '" e todos os seus tópicos?', function () { Dados.excluirBloco(b.id); App.atualizar(); });
    } });
    botoes.push({ texto: 'Salvar', classe: 'btn-primario', acao: function () {
      var n = nome.value.trim();
      if (!n) { nome.focus(); return false; }
      if (b) Dados.atualizarBloco(b.id, n, Number(posicao.value));
      else {
        var novo = Dados.criarBloco(d.id, n);
        var linhas = separarLinhas(topicos.value);
        if (linhas.length) Dados.criarTopicos(novo.id, linhas);
      }
      App.atualizar();
    } });
    UI.modal(b ? 'Editar bloco' : 'Novo bloco', [
      UI.campo('Nome do bloco', nome),
      posicao ? UI.campo('Posição', posicao) : null,
      topicos ? UI.campo('Tópicos', topicos) : null
    ], botoes);
  }

  function novosTopicos(b) {
    var texto = el('textarea', { rows: 8, placeholder: 'Um tópico por linha. Ex.:\nIntrodução ao Direito Tributário.\nTributos (arts. 03º ao 08º - CTN).' });
    UI.modal('Adicionar tópicos manuais — ' + b.nome, [
      UI.campo('Tópicos', texto, 'Para assuntos que não estão na incidência do TEC: cada linha vira um tópico, sem estrelas automáticas.')
    ], [
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: 'Adicionar', classe: 'btn-primario', acao: function () {
        var linhas = separarLinhas(texto.value);
        if (!linhas.length) { texto.focus(); return false; }
        Dados.criarTopicos(b.id, linhas);
        App.atualizar();
        UI.aviso(linhas.length + (linhas.length === 1 ? ' tópico adicionado' : ' tópicos adicionados'));
      } }
    ]);
  }

  function editarTopico(d, t) {
    var nome = el('textarea', { rows: 2, value: t.nome });
    // Vínculo com o assunto do TEC (a lista é a árvore da incidência, com recuo por nível).
    var arv = Dados.arvoreIncidencia(d.id), opcoesTec = [];
    function juntar(n, nivel) { opcoesTec.push({ n: n, nivel: nivel }); n.filhos.forEach(function (f) { juntar(f, nivel + 1); }); }
    if (arv) arv.raizes.forEach(function (n) { juntar(n, 0); });
    var tec = arv ? el('select', { onchange: function () { var n = arv.nos[tec.value]; if (n) nome.value = n.nome; } }, [
      el('option', { value: '', text: '— Tópico manual (sem assunto do TEC) —', selected: !t.tec })
    ].concat(opcoesTec.map(function (o) {
      return el('option', { value: o.n.chave, text: '  '.repeat(o.nivel) + o.n.codigo + ' ' + o.n.nome, selected: !!(t.tec && t.tec.chave === o.n.chave) });
    }))) : null;
    var bloco = el('select', null, Dados.blocosDe(d.id).map(function (b) {
      return el('option', { value: b.id, text: b.nome, selected: b.id === t.blocoId });
    }));
    var posicao = UI.seletorPosicao(Dados.topicosDe(t.blocoId).length, t.ordem);
    bloco.addEventListener('change', function () { posicao.disabled = bloco.value !== t.blocoId; });
    UI.modal('Editar tópico', [
      UI.campo('Nome', nome),
      tec ? UI.campo('Assunto do TEC', tec, 'Os links dos materiais ficam no bloco (Materiais).') : null,
      el('div', { class: 'campos-linha' }, [UI.campo('Bloco', bloco), UI.campo('Posição no bloco', posicao)])
    ], [
      { texto: 'Excluir', classe: 'btn-perigo btn-esquerda', acao: function () {
        UI.confirmar('Excluir o tópico "' + t.nome + '"?', function () { Dados.excluirTopico(t.id); App.atualizar(); });
      } },
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: 'Salvar', classe: 'btn-primario', acao: function () {
        var n = nome.value.trim();
        if (!n) { nome.focus(); return false; }
        var mudouBloco = bloco.value !== t.blocoId;
        var campos = { nome: n, blocoId: bloco.value };
        if (tec) { var no = arv.nos[tec.value]; campos.tec = no ? { chave: no.chave, codigo: no.codigo } : null; }
        Dados.atualizarTopico(t.id, campos, mudouBloco ? null : Number(posicao.value));
        App.atualizar();
      } }
    ]);
  }

  // Também usado pela aba Questões: `rota` é a aba de destino, `resumo(d)` o texto à direita.
  function trocarDisciplina(rota, resumo) {
    rota = rota || 'teoria';
    resumo = resumo || function (d) { return UI.fmtPct(Dados.progressoTeoria(d.id).pct); };
    var lista = el('div', { class: 'lista-escolha' });
    var m = UI.modal('Trocar disciplina', lista, [{ texto: 'Fechar', classe: 'btn-secundario' }]);
    Dados.disciplinas().forEach(function (d) {
      lista.appendChild(el('button', { type: 'button', class: 'item-escolha', style: { borderLeftColor: d.cor }, onclick: function () {
        m.fechar();
        location.hash = '#/' + rota + '/' + d.id;
      } }, [el('span', { text: d.nome }), el('span', { class: 'data-fraca', text: resumo(d) })]));
    });
  }

  function historico(d) { Sessao.historico(d); }

  function separarLinhas(texto) {
    return texto.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  }

  function render(raiz, params) {
    if (params[0]) renderDisciplina(raiz, params[0]);
    else renderLista(raiz);
  }

  return { render: render, editarDisciplina: editarDisciplina, trocarDisciplina: trocarDisciplina, historico: historico };
})();
