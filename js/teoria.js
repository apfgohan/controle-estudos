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
    var revisoes = Dados.revisoesPendentes(d.id).length;
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
        UI.metrica('Último estudo', UI.haQuanto(Dados.ultimoEstudo(d.id, 'teoria'))),
        UI.metrica('A revisar', revisoes ? String(revisoes) : '—', revisoes ? 'alerta' : '')
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
    var revisoes = Dados.revisoesPendentes(d.id).length;
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
        UI.cartao('relogio', 'Tempo acumulado', UI.fmtDuracao(Dados.tempoAcumulado(d.id, 'teoria'))),
        UI.cartao('calendario', 'Revisões pendentes', revisoes ? String(revisoes) : '—')
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

  function cartaoBloco(d, b) {
    var pb = Dados.progressoBloco(b.id);
    var topicos = Dados.topicosDe(b.id);
    return el('div', { class: 'bloco' }, [
      el('div', { class: 'bloco-topo' }, [
        el('div', { class: 'bloco-nome', text: b.nome }),
        el('div', { class: 'bloco-direita' }, [
          el('span', { class: 'pilula' + (pb.pct >= 100 ? ' completo' : ''), text: '(' + pb.feitos + '/' + pb.total + ' • ' + UI.fmtPct(pb.pct) + ')' }),
          UI.botaoEngrenagem(function () { editarBloco(d, b); }, 'Editar bloco')
        ])
      ]),
      UI.barra(pb.pct, d.cor),
      el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela' }, [
        el('thead', null, el('tr', null, ['Tópico', 'Status', 'Último estudo', 'Revisão', 'Ação'].map(function (h) { return el('th', { text: h }); }))),
        el('tbody', null, topicos.length ? topicos.map(function (t) { return linhaTopico(d, t); })
          : el('tr', null, el('td', { colspan: 5, class: 'tabela-vazia', text: 'Nenhum tópico neste bloco.' })))
      ])),
      el('button', { type: 'button', class: 'btn-adicionar-linha', onclick: function () { novosTopicos(b); }, text: '+ Tópico' })
    ]);
  }

  function linhaTopico(d, t) {
    var ultimo = Dados.ultimoEstudoTopico(t.id);
    return el('tr', { class: t.concluido ? 'concluido' : '' }, [
      el('td', { class: 'col-topico' }, el('div', { class: 'topico-nome' }, [
        t.link
          ? el('a', { class: 'topico-link', href: t.link, target: '_blank', rel: 'noopener noreferrer', title: 'Abrir material do tópico' }, UI.icone('link'))
          : el('span', { class: 'topico-link sem', title: 'Sem link — cadastre na engrenagem' }, UI.icone('link')),
        el('span', { text: t.nome }),
        UI.botaoEngrenagem(function () { editarTopico(d, t); }, 'Editar tópico')
      ])),
      el('td', null, t.concluido ? UI.selo('Concluído', 'sucesso') : UI.selo('Pendente', 'neutro')),
      el('td', null, ultimo ? [
        el('div', { class: 'data-forte', text: UI.fmtData(ultimo) }),
        t.dataConclusao ? el('div', { class: 'data-fraca', text: 'Concluído em ' + UI.fmtData(t.dataConclusao) }) : null
      ] : el('span', { class: 'data-fraca', text: '—' })),
      el('td', null, celulaRevisao(t)),
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

  function celulaRevisao(t) {
    if (!t.revisaoAgendada) {
      return [
        el('div', { class: 'data-fraca', text: t.ultimaRevisao ? 'Revisado em ' + UI.fmtData(t.ultimaRevisao) : 'Sem revisão' }),
        UI.botao('Agendar', function () { agendar(t); }, 'btn-agendar', 'calendario')
      ];
    }
    var dias = UI.diasEntre(UI.hoje(), t.revisaoAgendada);
    var estado = dias < 0 ? 'Atrasada' : dias === 0 ? 'Hoje' : 'Em ' + dias + (dias === 1 ? ' dia' : ' dias');
    return [
      el('div', { class: 'revisao-data' }, [
        el('span', { class: 'data-forte', text: UI.fmtData(t.revisaoAgendada) }),
        UI.selo(estado, dias < 0 ? 'perigo' : dias === 0 ? 'aviso' : 'info')
      ]),
      el('div', { class: 'acoes-revisao' }, [
        el('button', { type: 'button', class: 'link', text: 'Revisei', onclick: function () { Dados.concluirRevisao(t.id); App.atualizar(); UI.aviso('Revisão registrada'); } }),
        el('button', { type: 'button', class: 'link', text: 'Alterar', onclick: function () { agendar(t); } })
      ])
    ];
  }

  function agendar(t) {
    var data = el('input', { type: 'date', value: t.revisaoAgendada || UI.somarDias(UI.hoje(), 7) });
    var atalhos = el('div', { class: 'atalhos' }, [1, 7, 15, 30].map(function (n) {
      return el('button', { type: 'button', class: 'chip', text: '+' + n + (n === 1 ? ' dia' : ' dias'), onclick: function () { data.value = UI.somarDias(UI.hoje(), n); } });
    }));
    var botoes = [{ texto: 'Cancelar', classe: 'btn-secundario' }];
    if (t.revisaoAgendada) botoes.unshift({ texto: 'Remover agendamento', classe: 'btn-perigo btn-esquerda', acao: function () { Dados.agendarRevisao(t.id, null); App.atualizar(); } });
    botoes.push({ texto: 'Agendar', classe: 'btn-primario', acao: function () {
      if (!data.value) return false;
      Dados.agendarRevisao(t.id, data.value);
      App.atualizar();
    } });
    UI.modal('Agendar revisão', [el('p', { class: 'modal-desc', text: t.nome }), UI.campo('Data da revisão', data), atalhos], botoes);
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
    UI.modal('Adicionar tópicos — ' + b.nome, [
      UI.campo('Tópicos', texto, 'Cole a lista do edital: cada linha vira um tópico.')
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
    var link = el('input', { type: 'text', inputmode: 'url', value: t.link || '', placeholder: 'https://... (aula, PDF, resumo)' });
    var bloco = el('select', null, Dados.blocosDe(d.id).map(function (b) {
      return el('option', { value: b.id, text: b.nome, selected: b.id === t.blocoId });
    }));
    var posicao = UI.seletorPosicao(Dados.topicosDe(t.blocoId).length, t.ordem);
    bloco.addEventListener('change', function () { posicao.disabled = bloco.value !== t.blocoId; });
    UI.modal('Editar tópico', [
      UI.campo('Nome', nome),
      UI.campo('Link do material', link, 'Opcional: aula, PDF ou resumo deste tópico. Abre com um clique.'),
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
        Dados.atualizarTopico(t.id, { nome: n, link: link.value, blocoId: bloco.value }, mudouBloco ? null : Number(posicao.value));
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
