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
        UI.metrica('Aulas', p.feitos + ' / ' + p.total),
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
    var detalheAnot = anot && anot.aulaIds && anot.aulaIds.length
      ? 'Aula: ' + anot.aulaIds.map(function (id) { var x = Dados.aula(id); return x ? Dados.nomeAula(x.aula) : ''; }).filter(Boolean).join('; ')
      : anot && anot.topicoIds && anot.topicoIds.length
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
        UI.cartao('lista', 'Aulas', p.feitos + ' / ' + p.total),
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
      painelIncidencia(d),
      el('div', { class: 'novo-bloco' }, [
        UI.botao('+ Bloco', function () { editarBloco(d, null); }, 'btn-tracejado'),
        el('span', { text: 'Cada bloco reúne assuntos do TEC e as aulas que os cobrem.' }),
        Dados.blocosDe(d.id).length ? el('span', { class: 'novo-bloco-acoes' }, [
          el('button', { type: 'button', class: 'link', text: 'Recolher todos', onclick: function () { recolherTodos(Dados.blocosDe(d.id), true); App.atualizar(); } }),
          el('button', { type: 'button', class: 'link', text: 'Abrir todos', onclick: function () { recolherTodos(Dados.blocosDe(d.id), false); App.atualizar(); } })
        ]) : null
      ])
    ].concat(Dados.blocosDe(d.id).map(function (b) { return cartaoBloco(d, b); }))));
  }

  // ---------- Incidência (TEC): importada por matéria e banca, aqui na Teoria ----------
  function erroImportacao(texto) {
    UI.modal('Não foi possível importar', el('p', { text: texto }), [{ texto: 'Fechar', classe: 'btn-secundario' }]);
  }

  function importarIncidencia(d, banca, arquivo) {
    if (!arquivo || !Dados.NOME_BANCA[banca]) return;
    var nomeBanca = Dados.NOME_BANCA[banca];
    Planilha.ler(arquivo).then(function (r) {
      if (r.tipo !== 'incidencia') return erroImportacao('Esta planilha é de histórico de desempenho, não de incidência. O histórico se importa na aba Estatísticas; aqui vai o índice de um caderno do TEC (colunas Hierarquia, Índice, Quantidade e Porcentagem).');
      var lista = r.disciplinas;
      // Uma matéria por planilha; se vierem várias, usa a que corresponde a esta.
      var alvo = lista.length === 1 ? lista[0] : lista.filter(function (x) { return Estatisticas._corresponder(x.nomePlanilha).escolha === d.id; })[0];
      if (!alvo) return erroImportacao('A planilha tem ' + lista.length + ' matérias (' + lista.map(function (x) { return x.nomePlanilha; }).join(', ') + ') e nenhuma corresponde a ' + d.nome + '.');
      function salvar() {
        Dados.salvarIncidencia({ disciplinaId: d.id, banca: banca, nomeArquivo: arquivo.name, total: alvo.total, assuntos: alvo.topicos });
        Dados.definirApelido(Planilha.normalizar(alvo.nomePlanilha), d.id);
        App.atualizar();
        UI.aviso('Incidência importada (' + nomeBanca + '): ' + UI.fmtNum(alvo.total) + ' questões em ' + alvo.topicos.length + ' assuntos');
      }
      var avisos = [], c = Estatisticas._corresponder(alvo.nomePlanilha), ja = Dados.incidencia(d.id, banca);
      if (c.escolha !== d.id) avisos.push('A planilha é da matéria "' + alvo.nomePlanilha + '", que não parece ser ' + d.nome + '.');
      if (ja) avisos.push('Ela substitui a incidência de ' + nomeBanca + ' importada em ' + new Date(ja.importadoEm).toLocaleDateString('pt-BR') + '.');
      if (avisos.length) UI.confirmar(avisos.join(' ') + ' Importar para ' + d.nome + '?', salvar, 'Importar');
      else salvar();
    }).catch(function (e) {
      console.error(e);
      erroImportacao(e.message || 'Não foi possível ler a planilha.');
    });
  }

  // Quadro das quatro bancas da matéria: o que já foi importado e os botões para importar, substituir ou excluir.
  function painelIncidencia(d) {
    var bancaAlvo = null;
    var arquivo = el('input', { type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', hidden: true,
      onchange: function () { importarIncidencia(d, bancaAlvo, arquivo.files[0]); arquivo.value = ''; } });
    function escolher(banca) { bancaAlvo = banca; arquivo.value = ''; arquivo.click(); }
    // No Pós-Edital só interessa a banca do edital (ou todas, se a banca não estiver entre as do TEC).
    var pos = Dados.posEdital(), ref = Dados.bancaReferencia();
    var bancas = pos ? Dados.BANCAS.filter(function (x) { return x[0] === ref; }) : Dados.BANCAS;
    var cartoes = bancas.map(function (x) {
      var inc = Dados.incidencia(d.id, x[0]);
      var referencia = x[0] === ref;
      return el('div', { class: 'inc-banca' + (inc ? ' ok' : '') + (referencia ? ' inc-referencia' : '') }, [
        el('div', { class: 'inc-banca-nome' }, [inc ? UI.icone('check') : null, el('span', { text: x[0] === 'todas' ? 'Todas as bancas' : x[1] })]),
        el('div', { class: 'inc-banca-info', text: inc ? UI.fmtNum(inc.total) + ' questões · ' + inc.assuntos.length + ' assuntos · ' + new Date(inc.importadoEm).toLocaleDateString('pt-BR')
          : referencia ? 'Base das estrelas dos blocos' : 'Não importada' }),
        el('div', { class: 'inc-banca-acoes' }, [
          el('button', { type: 'button', class: 'link', text: inc ? 'Substituir' : 'Importar', onclick: function () { escolher(x[0]); } }),
          inc ? el('button', { type: 'button', class: 'link link-perigo', text: 'Excluir', onclick: function () {
            UI.confirmar('Excluir a incidência de ' + x[1] + ' de ' + d.nome + '? Os assuntos já escolhidos nos blocos continuam, mas sem os números desta banca.', function () {
              Dados.excluirIncidencia(inc.id); App.atualizar();
            });
          } }) : null
        ])
      ]);
    });
    var c = Dados.faseAtual().concurso;
    return el('div', { class: 'painel-incidencia' }, [
      el('div', { class: 'grafico-topo' }, [
        el('h3', { class: 'secao-titulo', text: 'Incidência dos assuntos (TEC)' }),
        el('span', { class: 'data-fraca', text: pos
          ? 'Pós-Edital (' + c.nome + '): vale só a planilha ' + (ref === 'todas' ? 'de todas as bancas, porque a banca ' + Dados.nomeBancaEdital(c) + ' não está no TEC' : 'da banca do edital, ' + Dados.NOME_BANCA[ref])
          : 'Planilha do índice de um caderno da matéria no TEC, uma por banca' })
      ]),
      el('div', { class: 'inc-bancas' + (pos ? ' inc-uma' : '') }, cartoes),
      arquivo
    ]);
  }

  function fmtPct1(v) { return UI.fmtPct(Math.round((v || 0) * 10) / 10); }
  // Nome da referência das estrelas: "todas as bancas" ou, no Pós-Edital, a banca do edital.
  function nomeRef() { var r = Dados.posEdital() ? Dados.bancaReferencia() : 'todas'; return r === 'todas' ? 'todas as bancas' : Dados.NOME_BANCA[r]; }

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
      return el('span', { class: 'estrelas auto', title: 'Automática: ' + fmtPct1(inc.pct.todas) + ' das questões da matéria (' + nomeRef() + ') · ' +
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

  // Blocos recolhidos (só uma preferência visual deste navegador), como as pastas da aba Questões.
  var CHAVE_RECOLHIDOS = 'controle-estudos.blocos-recolhidos';
  var recolhidos = {};
  try { recolhidos = JSON.parse(localStorage.getItem(CHAVE_RECOLHIDOS)) || {}; } catch (e) { recolhidos = {}; }
  function gravarRecolhidos() { try { localStorage.setItem(CHAVE_RECOLHIDOS, JSON.stringify(recolhidos)); } catch (e) { /* sem problema */ } }
  function alternarBloco(id) { if (recolhidos[id]) delete recolhidos[id]; else recolhidos[id] = true; gravarRecolhidos(); }
  function recolherTodos(blocos, fechar) { blocos.forEach(function (b) { if (fechar) recolhidos[b.id] = true; else delete recolhidos[b.id]; }); gravarRecolhidos(); }

  // Aula do bloco: tipo, nome, curso e link (é o que se estuda e marca como concluído).
  function editarAula(b, m) {
    var tipo = m ? m.tipo : 'pdf';
    var seg = el('div', { class: 'segmentado' });
    function desenhar() {
      seg.innerHTML = '';
      Dados.TIPOS_MATERIAL.forEach(function (x) {
        seg.appendChild(el('button', { type: 'button', class: tipo === x[0] ? 'ativo' : '', text: x[1], onclick: function () { tipo = x[0]; desenhar(); } }));
      });
      if (campoPaginas) campoPaginas.style.display = tipo === 'pdf' ? '' : 'none';
    }
    // Só PDF tem páginas: com elas, as metas de teoria são calculadas pelas páginas lidas por meta.
    var paginas = el('input', { type: 'number', min: 1, step: 1, value: m && m.paginas ? m.paginas : '', placeholder: 'Ex.: 60' });
    var campoPaginas = UI.campo('Páginas', paginas, 'Opcional. Com as páginas, a meta pede o que falta ler e a previsão usa as páginas lidas por meta (Configurações).');
    desenhar();
    var nome = el('input', { type: 'text', value: m ? m.nome : '', placeholder: 'Ex.: 00 - Atos Administrativos' });
    var idLista = 'cursos-' + b.id;
    var curso = el('input', { type: 'text', value: m ? m.curso : '', placeholder: 'Ex.: Estratégia', list: idLista });
    var lista = el('datalist', { id: idLista }, Dados.cursosUsados().map(function (c) { return el('option', { value: c }); }));
    var link = el('input', { type: 'text', inputmode: 'url', value: m ? m.link : '', placeholder: 'https://...' });
    var botoes = [{ texto: 'Cancelar', classe: 'btn-secundario' }];
    if (m) botoes.unshift({ texto: 'Excluir', classe: 'btn-perigo btn-esquerda', acao: function () {
      UI.confirmar('Excluir a aula "' + m.nome + '"?', function () { Dados.excluirMaterial(b.id, m.id); App.atualizar(); });
    } });
    botoes.push({ texto: 'Salvar', classe: 'btn-primario', acao: function () {
      if (!nome.value.trim()) { nome.focus(); return false; }
      var campos = { tipo: tipo, nome: nome.value, curso: curso.value, link: link.value, paginas: paginas.value };
      if (m) Dados.atualizarMaterial(b.id, m.id, campos); else Dados.criarMaterial(b.id, campos);
      App.atualizar();
    } });
    UI.modal(m ? 'Editar aula' : 'Nova aula — ' + b.nome, [
      UI.campo('Tipo', seg),
      UI.campo('Nome', nome, 'Sem o tipo, que já aparece antes do nome. Ex.: 00 - Atos Administrativos, ou 01 - Bancos de Dados.'),
      campoPaginas,
      UI.campo('Curso', curso), lista,
      UI.campo('Link', link, 'Opcional: abre a aula com um clique.')
    ], botoes);
  }

  // O que falta para o bloco ficar completo (assuntos do TEC e aulas), com a situação de antes da troca.
  function avisoBloco(b, temAssuntos, temAulas) {
    var partes = [];
    if (!temAssuntos) partes.push('escolha os assuntos do TEC');
    if (!temAulas) partes.push('cadastre as aulas');
    if (!partes.length) return null;
    var h = b.herancaTeoria, antes = '';
    if (!temAulas && h) {
      antes = h.concluida ? ' A teoria deste bloco já estava concluída' + (h.data ? ' (até ' + UI.fmtData(h.data) + ')' : '') + ': as aulas que você cadastrar entram concluídas.'
        : h.feitos ? ' Antes da troca, ' + h.feitos + ' de ' + h.qtd + ' tópicos estavam concluídos.' : '';
    }
    return el('div', { class: 'aviso-suave bloco-heranca' }, [el('strong', { text: 'Para completar este bloco: ' + partes.join(' e ') + '.' }), antes]);
  }

  // Assunto do bloco em chip: código, nome e % (todas as bancas); na dica, os subassuntos e as bancas. Clique edita.
  function chipAssunto(d, t) {
    var arv = t.tec && Dados.arvoreIncidencia(d.id), n = arv && arv.nos[t.tec.chave];
    var dica = [t.nome], pct = {}, mais = [], menos = [];
    if (n) {
      Object.keys(n.bancas).forEach(function (k) { pct[k] = n.bancas[k].pct; });
      Dados.BANCAS.forEach(function (x) {
        if (x[0] === 'todas' || pct[x[0]] == null) return;
        var p = pesoBanca(pct[x[0]], pct.todas);
        if (p === 'mais') mais.push(x[1]); else if (p === 'menos') menos.push(x[1]);
        dica.push(x[1] + ': ' + fmtPct1(pct[x[0]]) + (p === 'mais' ? ' ▲' : p === 'menos' ? ' ▼' : ''));
      });
      var desc = Dados.descendentes(n);
      if (desc.length) dica.push('Inclui: ' + desc.map(function (x) { return x.codigo + ' ' + x.nome; }).join('; '));
    } else if (!t.tec) dica.push('Tópico manual (sem incidência do TEC)');
    return el('button', { type: 'button', class: 'chip-assunto' + (n ? '' : ' manual'), title: dica.join('\n') + '\n(clique para editar)', onclick: function () { editarTopico(d, t); } }, [
      n ? el('span', { class: 'tec-codigo', text: n.codigo }) : null,
      el('span', { class: 'chip-assunto-nome', text: t.nome }),
      pct.todas != null ? el('em', { text: fmtPct1(pct.todas) }) : null,
      mais.length ? el('span', { class: 'tec-mais', text: '▲' }) : null
    ]);
  }

  function linhaAula(d, b, a) {
    var ultimo = Dados.ultimoEstudoAula(a.id);
    var lei = Dados.leituraAula(a);
    var sub = a.concluido ? 'Concluída' + (a.dataConclusao ? ' em ' + UI.fmtData(a.dataConclusao) : '') + (a.herdado ? ' (antes da troca)' : '')
      : (lei.total ? (lei.lidas ? lei.lidas + ' de ' + lei.total + ' páginas lidas · ' : lei.total + ' páginas · ') : '') + (ultimo ? 'pendente · último estudo em ' + UI.fmtData(ultimo) : 'pendente');
    sub = sub.charAt(0).toUpperCase() + sub.slice(1);
    return el('div', { class: 'aula' + (a.concluido ? ' concluida' : '') }, [
      el('button', { type: 'button', class: 'btn-check' + (a.concluido ? ' marcado' : ''), title: a.concluido ? 'Desmarcar como concluída' : 'Marcar como concluída',
        onclick: function () { Dados.definirAulaConcluida(a.id, !a.concluido); App.atualizar(); } }, UI.icone('check')),
      el('div', { class: 'aula-corpo' }, [
        el('div', { class: 'aula-nome aula-' + a.tipo }, [
          UI.icone(ICONE_MATERIAL[a.tipo] || 'pdf'),
          el('span', { class: 'aula-tipo', text: nomeTipoMaterial(a.tipo) }),
          a.link ? el('a', { href: a.link, target: '_blank', rel: 'noopener noreferrer', title: 'Abrir a aula', text: a.nome }) : el('span', { title: 'Sem link — cadastre na engrenagem', text: a.nome }),
          a.curso ? el('span', { class: 'aula-curso', text: '· ' + a.curso }) : null
        ]),
        el('div', { class: 'aula-sub', text: sub }),
        lei.total && !a.concluido && lei.lidas ? el('div', { class: 'aula-paginas' }, UI.barra(lei.lidas / lei.total * 100)) : null
      ]),
      el('div', { class: 'aula-acoes' }, [
        window.Sessao ? UI.botao('Lançar estudo', function () { Sessao.abrir({ disciplinaId: d.id, tipo: 'teoria', aulaIds: [a.id] }); }, 'btn-lancar', 'play') : null,
        UI.botaoEngrenagem(function () { editarAula(b, a); }, 'Editar aula')
      ])
    ]);
  }

  function cartaoBloco(d, b) {
    var pb = Dados.progressoBloco(b.id);
    var topicos = Dados.topicosDe(b.id), aulas = Dados.aulasDe(b.id);
    var inc = Dados.incidenciaBloco(b);
    var fechado = !!recolhidos[b.id];
    var topo = el('div', { class: 'bloco-topo bloco-topo-clicavel', title: fechado ? 'Abrir o bloco' : 'Recolher o bloco', onclick: function (e) {
      if (e.target.closest('button, a, input')) return;
      alternarBloco(b.id);
      App.atualizar();
    } }, [
      el('div', { class: 'bloco-titulo' }, [
        el('span', { class: 'bloco-seta' + (fechado ? '' : ' aberta') }, UI.icone('abrir')),
        el('div', { class: 'bloco-nome', text: b.nome })
      ]),
      el('div', { class: 'bloco-direita' }, [
        inc && inc.pct.todas != null ? el('span', { class: 'bloco-incidencia', title: 'Questões da matéria (' + nomeRef() + ') que caem nos assuntos deste bloco', text: fmtPct1(inc.pct.todas) + ' das questões' }) : null,
        estrelasBloco(b),
        el('span', { class: 'pilula' + (pb.total && pb.pct >= 100 ? ' completo' : ''), text: pb.total ? pb.feitos + '/' + pb.total + (pb.total === 1 ? ' aula' : ' aulas') + ' • ' + UI.fmtPct(pb.pct) : 'sem aulas' }),
        UI.botaoEngrenagem(function () { editarBloco(d, b); }, 'Editar bloco')
      ])
    ]);
    if (fechado) return el('div', { class: 'bloco recolhido' }, [topo, UI.barra(pb.pct, d.cor)]);
    return el('div', { class: 'bloco' }, [
      topo,
      inc ? el('div', { class: 'bloco-bancas' }, chipsBancas(inc.pct)) : null,
      UI.barra(pb.pct, d.cor),
      el('div', { class: 'bloco-secao' }, [el('span', { class: 'materiais-rotulo', text: 'Assuntos do bloco' })].concat(
        topicos.map(function (t) { return chipAssunto(d, t); }),
        [el('button', { type: 'button', class: 'chip-assunto acao', text: topicos.length ? 'Alterar assuntos' : '+ Escolher assuntos do TEC', onclick: function () { escolherAssuntos(d, b); } }),
          el('button', { type: 'button', class: 'link', text: '+ Tópico manual', onclick: function () { novosTopicos(b); } })]
      )),
      avisoBloco(b, !!topicos.length, !!aulas.length),
      el('div', { class: 'materiais-rotulo bloco-rotulo-aulas', text: 'Aulas' }),
      aulas.length ? el('div', { class: 'aulas' }, aulas.map(function (a) { return linhaAula(d, b, a); }))
        : el('div', { class: 'tabela-vazia aulas-vazio', text: 'Nenhuma aula neste bloco.' }),
      el('button', { type: 'button', class: 'btn-adicionar-linha', onclick: function () { editarAula(b, null); }, text: '+ Aula' })
    ]);
  }
  // Modal: árvore da incidência da matéria. Marcar um assunto inclui todos os subassuntos dele.
  function escolherAssuntos(d, b) {
    var arv = Dados.arvoreIncidencia(d.id);
    if (!arv) {
      UI.modal('Assuntos do TEC — ' + b.nome, [
        el('p', { class: 'modal-desc', text: 'Ainda não há incidência importada para ' + d.nome + '.' }),
        el('p', { text: 'Importe a planilha de incidência do TEC no quadro "Incidência dos assuntos (TEC)", logo acima dos blocos desta matéria (comece pela banca "Todas").' })
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

    // Blocos que cobrem um assunto: o próprio (se está em outro bloco) ou os subassuntos dele.
    // total = todos os subassuntos estão cobertos (por outros blocos ou já marcados neste).
    function cobertura(n) {
      if (outros[n.chave]) return { blocos: [outros[n.chave]], total: true };
      if (sel.indexOf(n.chave) >= 0 || incluidoPorPai(n)) return { blocos: [], total: true };
      if (!n.filhos.length) return { blocos: [], total: false };
      var bl = {}, total = true;
      n.filhos.forEach(function (f) { var c = cobertura(f); c.blocos.forEach(function (x) { bl[x] = true; }); if (!c.total) total = false; });
      return { blocos: Object.keys(bl).sort(function (a, b) { return a.localeCompare(b, 'pt-BR', { numeric: true }); }), total: total };
    }
    function marcaCobertura(n, marcado) {
      if (outros[n.chave]) return { texto: 'no ' + outros[n.chave], classe: 'at-outro' };
      if (marcado || !n.filhos.length) return null;
      var c = cobertura(n);
      if (!c.blocos.length) return null;
      return { texto: (c.total ? 'no ' : 'em parte no ') + c.blocos.join(' e no '), classe: c.total ? 'at-outro' : 'at-parcial' };
    }
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
      var cob = marcaCobertura(n, marcado);
      var linhaEl = el('div', { class: 'at-linha' + (incl ? ' at-incluido' : '') + (cob ? ' ' + cob.classe : ''), style: { paddingLeft: (8 + nivel * 18) + 'px' } }, [
        n.filhos.length ? el('button', { type: 'button', class: 'at-abrir' + (aberto ? ' aberto' : ''), title: aberto ? 'Fechar' : 'Abrir', onclick: function () { abertos[n.chave] = !aberto; desenhar(); } }, UI.icone('abrir'))
          : el('span', { class: 'at-abrir vazio' }),
        el('label', { class: 'at-nome' }, [
          el('input', { type: 'checkbox', checked: marcado, disabled: incl, onchange: function (e) { alternar(n, e.target.checked); } }),
          el('span', { class: 'at-codigo', text: n.codigo }),
          el('span', { text: n.nome }),
          cob ? el('span', { class: 'at-marca', title: cob.classe === 'at-parcial' ? 'Parte dos subassuntos já está em outros blocos' : 'Coberto por outros blocos', text: cob.texto }) : null,
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
        el('div', { class: 'at-nums' }, bancas.map(function (x) { return el('span', { class: 'at-num', text: x[0] === 'todas' ? (Dados.posEdital() && Dados.bancaReferencia() !== 'todas' ? Dados.NOME_BANCA[Dados.bancaReferencia()] : 'Todas') : x[1] }); }))]));
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
        sel.length ? ' · ' + (s.pct.todas != null ? fmtPct1(s.pct.todas) + ' das questões (' + nomeRef() + ')' : '') : '']));
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
