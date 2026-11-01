// Aba "Controle de Questões": pastas e cadernos de questões de cada disciplina.
// As disciplinas são as mesmas cadastradas no Controle de Teoria.
var Questoes = (function () {
  var el = UI.el;

  // Pastas recolhidas (só uma preferência visual deste navegador).
  var CHAVE_FECHADAS = 'controle-estudos.pastas-fechadas';
  var fechadas = {};
  try { fechadas = JSON.parse(localStorage.getItem(CHAVE_FECHADAS)) || {}; } catch (e) { fechadas = {}; }
  function alternarPasta(id) {
    if (fechadas[id]) delete fechadas[id]; else fechadas[id] = true;
    try { localStorage.setItem(CHAVE_FECHADAS, JSON.stringify(fechadas)); } catch (e) { /* sem problema */ }
  }

  // ---------- Lista de disciplinas ----------
  function renderLista(raiz) {
    var lista = Dados.disciplinas();

    raiz.appendChild(el('div', { class: 'pagina-topo' }, [
      el('div', null, [
        el('h1', { class: 'pagina-titulo', text: 'Controle de Questões' }),
        el('div', { class: 'pagina-subtitulo', text: 'Selecione a disciplina para continuar' })
      ]),
      el('div', { class: 'contador' }, [el('strong', { text: lista.length }), ' disciplina' + (lista.length === 1 ? '' : 's')])
    ]));

    if (!lista.length) {
      raiz.appendChild(el('div', { class: 'vazio' }, [
        el('p', { class: 'vazio-destaque', text: 'Nenhuma disciplina cadastrada.' }),
        el('p', { text: 'As disciplinas são cadastradas no Controle de Teoria e aparecem aqui automaticamente.' }),
        el('div', { class: 'vazio-acoes' }, el('a', { class: 'btn btn-primario', href: '#/teoria', text: 'Ir para o Controle de Teoria' }))
      ]));
      return;
    }

    raiz.appendChild(el('div', { class: 'lista-disciplinas' }, lista.map(linhaDisciplina)));
  }

  function linhaDisciplina(d) {
    var q = Dados.statsQuestoes(d.id);
    return el('div', { class: 'linha-disciplina', style: { borderLeftColor: d.cor } }, [
      el('div', { class: 'linha-nome', text: d.nome }),
      el('div', { class: 'linha-config' }, [
        UI.botaoEngrenagem(function () { Teoria.editarDisciplina(d); }, 'Editar disciplina'),
        el('span', { class: 'chip-cor' }, [el('span', { class: 'bolinha', style: { background: d.cor } }), 'Cor'])
      ]),
      el('div', { class: 'linha-metricas' }, [
        UI.metrica('Questões', UI.fmtNum(q.feitas)),
        el('div', { class: 'metrica' }, [el('div', { class: 'metrica-rotulo', text: 'Acerto' }), el('div', { class: 'metrica-valor' }, UI.acerto(q.pct, q.feitas))]),
        UI.metrica('Último treino', UI.haQuanto(Dados.ultimoEstudo(d.id, 'questoes'))),
        UI.metrica('Cadernos', String(Dados.cadernosDaDisciplina(d.id).length))
      ]),
      el('a', { class: 'btn btn-abrir', href: '#/questoes/' + d.id }, ['Abrir disciplina', UI.icone('seta')])
    ]);
  }

  // ---------- Tela da disciplina ----------
  function renderDisciplina(raiz, id) {
    var d = Dados.disciplina(id);
    if (!d) { location.hash = '#/questoes'; return; }
    var q = Dados.statsQuestoes(d.id);
    var anot = Dados.ultimaAnotacao(d.id, 'questoes');
    // As pastas fixas vêm sempre primeiro: as do Modo Leitura (Teoria, Erros) e as do Modo Revisão (Simulado, Favoritadas).
    var PESO = { teoria: 4, erros: 3, simulado: 2, favoritas: 1 };
    var pastas = Dados.pastasDe(d.id).sort(function (a, b) { return (PESO[b.tipo] || 0) - (PESO[a.tipo] || 0); });

    raiz.appendChild(el('section', { class: 'painel' }, [
      el('div', { class: 'pagina-topo' }, [
        el('div', null, [
          el('h1', { class: 'disciplina-titulo', text: d.nome }),
          el('div', { class: 'pagina-subtitulo', text: 'Controle de Questões' })
        ]),
        el('div', { class: 'pagina-acoes' }, [
          UI.botao('Histórico de estudos', function () { Teoria.historico(d); }, 'btn-contorno', 'historico'),
          UI.botao('Trocar disciplina', function () {
            Teoria.trocarDisciplina('questoes', function (x) {
              var s = Dados.statsQuestoes(x.id);
              return s.feitas ? UI.fmtNum(s.feitas) + ' questões · ' + UI.fmtPct(s.pct) : 'Sem questões';
            });
          }, 'btn-contorno', 'trocar')
        ])
      ]),
      el('div', { class: 'cartoes' }, [
        UI.cartao('lista', 'Questões feitas', UI.fmtNum(q.feitas)),
        UI.cartao('alvo', 'Acerto', q.feitas ? UI.fmtPct(q.pct) : '—'),
        UI.cartao('relogio', 'Tempo acumulado', UI.fmtDuracao(Dados.tempoAcumulado(d.id, 'questoes'))),
        UI.cartao('info', 'Último treino', UI.haQuanto(Dados.ultimoEstudo(d.id, 'questoes'))),
        UI.cartao('caderno', 'Cadernos ativos', String(Dados.cadernosDaDisciplina(d.id).filter(function (c) { return !Dados.statsCaderno(c.id).completo; }).length))
      ]),
      UI.blocoAnotacao(anot, detalheAnotacao(anot))
    ]));

    raiz.appendChild(el('div', { class: 'organizacao-topo' }, [
      el('span', { class: 'data-fraca', text: 'Organização pessoal' }),
      UI.botao('+ Pasta', function () { editarPasta(d, null); }, 'btn-contorno')
    ]));

    if (!pastas.length) {
      raiz.appendChild(el('div', { class: 'vazio' }, [
        el('p', { class: 'vazio-destaque', text: 'Nenhuma pasta de cadernos ainda.' }),
        el('p', { text: 'Crie pastas para agrupar seus cadernos, por exemplo "Bancas CEBRASPE, FCC e FGV" ou "Revisão ERRADAS".' }),
        el('div', { class: 'vazio-acoes' }, UI.botao('+ Criar pasta', function () { editarPasta(d, null); }, 'btn-primario'))
      ]));
      return;
    }

    pastas.forEach(function (p) { raiz.appendChild(cartaoPasta(d, p)); });
  }

  function detalheAnotacao(sessao) {
    if (!sessao || !sessao.cadernos || !sessao.cadernos.length) return '';
    var nomes = sessao.cadernos.map(function (c) {
      var cad = Dados.caderno(c.cadernoId);
      if (!cad) return '';
      var p = Dados.pasta(cad.pastaId);
      return (p ? p.nome + ' · ' : '') + cad.nome + (cad.assunto ? ' — ' + cad.assunto : '');
    }).filter(Boolean);
    return nomes.length ? 'Caderno: ' + nomes.join('; ') : '';
  }

  function cartaoPasta(d, p) {
    var teoria = p.tipo === 'teoria', erros = p.tipo === 'erros';
    var simulado = p.tipo === 'simulado', favoritas = p.tipo === 'favoritas';
    var aberta = !fechadas[p.id];
    var cadernos = Dados.cadernosDe(p.id);
    var sp = Dados.statsPasta(p.id);
    var resumo = cadernos.length + (cadernos.length === 1 ? ' caderno' : ' cadernos') +
      (teoria ? ' de ' + Dados.blocosDe(d.id).length + ' blocos' : '') +
      (erros ? ' de ' + Dados.paresDeBlocos(d.id).length + (Dados.paresDeBlocos(d.id).length === 1 ? ' par de blocos' : ' pares de blocos') : '') +
      (sp.feitas ? ' · ' + UI.fmtNum(sp.feitas) + ' questões · ' + UI.fmtPct(sp.pct) : '');

    var topo = el('div', { class: 'pasta-topo', onclick: function (e) {
      if (e.target.closest('.btn-icone')) return;
      alternarPasta(p.id);
      App.atualizar();
    } }, [
      el('div', { class: 'pasta-titulo' }, [
        el('span', { class: 'pasta-nome', text: p.nome }),
        teoria || erros ? UI.selo('Modo Leitura', 'info')
          : simulado || favoritas ? UI.selo('Modo Revisão', 'sucesso')
          : UI.botaoEngrenagem(function () { editarPasta(d, p); }, 'Editar pasta')
      ]),
      el('div', { class: 'pasta-direita' }, [
        el('span', { class: 'data-fraca', text: resumo }),
        el('span', { class: 'pasta-seta' + (aberta ? ' aberta' : '') }, UI.icone('abrir'))
      ])
    ]);

    var classe = 'pasta' + (teoria || erros ? ' pasta-teoria' : simulado || favoritas ? ' pasta-revisao' : '');
    if (!aberta) return el('section', { class: classe }, topo);

    return el('section', { class: classe }, [
      topo,
      teoria ? avisosPastaTeoria(d, p, cadernos) : null,
      erros ? avisosPastaErros(d, cadernos) : null,
      simulado || favoritas ? avisosPastaRevisao(d, p, cadernos) : null,
      el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela tabela-cadernos' }, [
        el('thead', null, el('tr', null, [
          el('th', { text: 'Caderno' }),
          el('th', { text: teoria ? 'Baterias' : erros ? 'Blocos' : simulado ? 'Situação' : favoritas ? 'Grupo' : 'Prioridade' }),
          el('th', { text: 'Questões feitas' }),
          el('th', { text: 'Acerto' }),
          el('th', { text: 'Último treino' }),
          el('th', { text: 'Ação' })
        ])),
        el('tbody', null, cadernos.length ? cadernos.map(function (c) { return linhaCaderno(d, c, p.tipo); })
          : el('tr', null, el('td', { colspan: 6, class: 'tabela-vazia', text: teoria ? 'Cadastre um caderno para cada bloco de teoria.'
            : erros ? 'Cadastre aqui o caderno de erros de cada par de blocos quando chegar a hora (o Dashboard avisa).'
            : simulado ? 'Cadastre cadernos com questões de todos os assuntos da matéria (em geral, de 50 a 100 questões).'
            : favoritas ? 'Cadastre o caderno de questões em que ficou em dúvida e o de questões que errou 2x ou mais.' : 'Nenhum caderno nesta pasta.' })))
      ])),
      el('button', { type: 'button', class: 'btn-adicionar-linha', onclick: function () { editarCaderno(d, p, null); }, text: '+ Caderno' })
    ]);
  }

  // Explica a pasta de teoria e aponta o que falta para a sequência do Modo Teoria funcionar.
  function avisosPastaTeoria(d, p, cadernos) {
    var blocos = Dados.blocosDe(d.id);
    var nb = Dados.numBaterias(d.id);
    var semCaderno = blocos.filter(function (b) { return !Dados.cadernoDoBloco(b.id); });
    var semBloco = cadernos.filter(function (c) { return !c.blocoId || !Dados.bloco(c.blocoId); });
    var semTotal = cadernos.filter(function (c) { return c.blocoId && !c.totalQuestoes; });
    var avisos = [];
    if (!blocos.length) avisos.push('Cadastre os blocos de teoria desta matéria no Controle de Teoria.');
    if (semCaderno.length && blocos.length) avisos.push('Blocos sem caderno: ' + semCaderno.map(function (b) { return b.nome; }).join(', ') + '.');
    if (semBloco.length) avisos.push('Cadernos sem bloco de teoria: ' + semBloco.map(function (c) { return c.nome; }).join(', ') + ' (escolha o bloco na engrenagem).');
    if (semTotal.length) avisos.push('Informe o total de questões de: ' + semTotal.map(function (c) { return c.nome; }).join(', ') + ' (sem ele não dá para dividir as baterias).');
    return el('div', { class: 'pasta-teoria-info' }, [
      el('p', { class: 'data-fraca', text: 'Um caderno por bloco de teoria (' + cadernos.length + ' de ' + blocos.length + '). ' +
        'Cada caderno é dividido em ' + nb + ' baterias' + (nb === 4 ? ' (10 blocos ou mais).' : ' (menos de 10 blocos; com 10 ou mais passam a ser 4).') +
        ' Uma bateria fica concluída quando as questões lançadas no caderno alcançam a quantidade dela.' }),
      avisos.length ? el('ul', { class: 'pasta-teoria-avisos' }, avisos.map(function (a) { return el('li', null, [UI.icone('alerta'), el('span', { text: a })]); })) : null
    ]);
  }

  // Avisa só dos pares que já precisam do caderno de erros (as últimas baterias dos dois blocos foram feitas).
  function avisosPastaErros(d, cadernos) {
    var plano = Dados.planoTeoria(d.id);
    var pares = Dados.paresDeBlocos(d.id);
    function ultimaFeita(bloco) {
      var p = plano.progresso.filter(function (x) { return x.bloco === bloco; })[0];
      return !!(p && p.baterias && p.baterias[plano.numBaterias - 1].concluida);
    }
    var liberados = plano.itens.filter(function (it) {
      return it.tipo === 'erros' && !it.caderno && it.par.blocos.every(ultimaFeita);
    });
    var semPar = cadernos.filter(function (c) { return !c.par || c.par > pares.length; });
    var avisos = liberados.map(function (it) { return 'Já é hora da bateria de erros dos blocos ' + Dados.nomePar(it.par) + ': cadastre o caderno de erros.'; });
    if (semPar.length) avisos.push('Cadernos sem par de blocos: ' + semPar.map(function (c) { return c.nome; }).join(', ') + ' (escolha na engrenagem).');
    return el('div', { class: 'pasta-teoria-info' }, [
      el('p', { class: 'data-fraca', text: 'Um caderno de erros por par de blocos (' + cadernos.length + ' de ' + pares.length + '): blocos 1 e 2, 3 e 4, e assim por diante. ' +
        'A bateria de erros é recomendada depois da última bateria dos dois blocos e fica concluída quando todas as questões do caderno forem lançadas.' }),
      avisos.length ? el('ul', { class: 'pasta-teoria-avisos' }, avisos.map(function (a) { return el('li', null, [UI.icone('alerta'), el('span', { text: a })]); })) : null
    ]);
  }

  function avisosPastaRevisao(d, p, cadernos) {
    var avisos = [], texto;
    if (p.tipo === 'simulado') {
      texto = 'No Modo Revisão, cada volta começa resolvendo um caderno inteiro desta pasta, na ordem da lista. Ele fica concluído quando as questões lançadas alcançam o total.';
      var semTotal = cadernos.filter(function (c) { return !c.totalQuestoes; });
      if (semTotal.length) avisos.push('Informe o total de questões de: ' + semTotal.map(function (c) { return c.nome; }).join(', ') + '.');
    } else {
      texto = 'Depois do simulado, vêm as favoritadas: primeiro o caderno de dúvidas, depois o de erradas 2x ou mais. Como esses cadernos mudam sempre, não há total: ao lançar a sessão, marque "Finalizei este caderno" quando terminar.';
      var faltam = Dados.ORDEM_FAVORITAS.filter(function (g) { return !Dados.cadernoFavorito(d.id, g); });
      if (faltam.length) avisos.push('Falta cadastrar: ' + faltam.map(function (g) { return Dados.GRUPOS_FAVORITAS[g].toLowerCase(); }).join(' e ') + '.');
      var semGrupo = cadernos.filter(function (c) { return !c.grupo; });
      if (semGrupo.length) avisos.push('Cadernos sem grupo: ' + semGrupo.map(function (c) { return c.nome; }).join(', ') + ' (escolha na engrenagem).');
    }
    return el('div', { class: 'pasta-teoria-info' }, [
      el('p', { class: 'data-fraca', text: texto }),
      avisos.length ? el('ul', { class: 'pasta-teoria-avisos' }, avisos.map(function (a) { return el('li', null, [UI.icone('alerta'), el('span', { text: a })]); })) : null
    ]);
  }

  function statusSimulado(d, c) {
    var plano = Dados.planoRevisao(d.id);
    var pos = plano.simulados.indexOf(c);
    if (pos < plano.simuladosConcluidos) return el('span', { class: 'bateria concluida', text: 'Concluído' });
    if (c === plano.simulado) return el('span', { class: 'bateria parcial', text: 'Atual' });
    return el('span', { class: 'bateria', text: 'Na fila' });
  }

  function statusFavorito(d, c) {
    var ultimo = null;
    Dados.sessoesDe(d.id).forEach(function (s) {
      if ((s.cadernos || []).some(function (l) { return l.cadernoId === c.id && l.finalizado; }) && (!ultimo || s.data > ultimo)) ultimo = s.data;
    });
    return el('div', null, [
      el('div', { class: 'caderno-bloco', text: c.grupo === 'duvidas' ? 'Dúvidas' : c.grupo === 'erros2x' ? 'Errei 2x ou mais' : 'Sem grupo' }),
      ultimo ? el('span', { class: 'data-fraca', text: 'Finalizado em ' + UI.fmtData(ultimo) }) : null
    ]);
  }

  function statusErros(d, c) {
    var pares = Dados.paresDeBlocos(d.id);
    var par = c.par && pares[c.par - 1];
    if (!par) return el('span', { class: 'data-fraca', text: 'Sem par de blocos' });
    var s = Dados.statsCaderno(c.id);
    return el('div', null, [
      el('div', { class: 'caderno-bloco', text: Dados.nomePar(par) }),
      !s.total ? el('span', { class: 'data-fraca', text: 'Informe o total' })
        : el('span', { class: 'bateria' + (s.completo ? ' concluida' : s.feitas ? ' parcial' : '') }, s.completo ? 'Concluída' : Math.min(s.feitas, s.total) + '/' + s.total)
    ]);
  }

  function chipsBaterias(d, c) {
    if (!c.blocoId) return el('span', { class: 'data-fraca', text: 'Sem bloco' });
    if (!c.totalQuestoes) return el('span', { class: 'data-fraca', text: 'Informe o total' });
    return el('div', { class: 'baterias' }, Dados.bateriasCaderno(c, Dados.numBaterias(d.id)).map(function (b) {
      var estado = b.concluida ? ' concluida' : b.feitas ? ' parcial' : '';
      return el('span', { class: 'bateria' + estado, title: b.numero + 'ª bateria: ' + b.feitas + ' de ' + b.qtd + ' questões' }, [
        el('strong', { text: b.numero + 'ª' }), ' ' + b.feitas + '/' + b.qtd
      ]);
    }));
  }

  function linhaCaderno(d, c, tipoPasta) {
    var teoria = tipoPasta === 'teoria';
    var s = Dados.statsCaderno(c.id);
    var nome = c.link
      ? el('a', { class: 'caderno-nome', href: c.link, target: '_blank', rel: 'noopener noreferrer', title: 'Abrir no TecConcursos' }, [c.nome, UI.icone('externo', 'icone-pequeno')])
      : el('span', { class: 'caderno-nome sem-link', text: c.nome });

    var feitas;
    if (s.total) {
      feitas = [
        el('div', { class: 'feitas' + (s.completo ? ' completo' : ''), text: UI.fmtNum(s.feitas) + '/' + UI.fmtNum(s.total) }),
        s.completo ? UI.selo('Caderno completo', 'completo') : el('div', { class: 'faltam', text: 'Faltam ' + UI.fmtNum(s.faltam) })
      ];
    } else {
      feitas = [el('div', { class: 'feitas', text: UI.fmtNum(s.feitas) }), el('div', { class: 'faltam', text: tipoPasta === 'favoritas' ? 'Caderno flexível' : 'Total não informado' })];
    }

    return el('tr', null, [
      el('td', { class: 'col-caderno' }, [
        el('div', { class: 'caderno-linha' }, [
          nome,
          UI.botaoEngrenagem(function () { editarCaderno(d, Dados.pasta(c.pastaId), c); }, 'Editar caderno'),
          Dados.pastasDe(d.id).length > 1 ? UI.botao('Mover', function () { moverCaderno(d, c); }, 'btn-mover', 'trocar') : null
        ]),
        c.assunto ? el('div', { class: 'caderno-assunto', text: c.assunto }) : null,
        teoria && c.blocoId && Dados.bloco(c.blocoId) ? el('div', { class: 'caderno-bloco', text: 'Teoria: ' + Dados.bloco(c.blocoId).nome }) : null
      ]),
      el('td', null, teoria ? chipsBaterias(d, c) : tipoPasta === 'erros' ? statusErros(d, c)
        : tipoPasta === 'simulado' ? statusSimulado(d, c) : tipoPasta === 'favoritas' ? statusFavorito(d, c) : UI.seloPrioridade(c.prioridade)),
      el('td', null, feitas),
      el('td', null, s.feitas ? [
        UI.acerto(s.pct, s.feitas, true),
        el('div', { class: 'data-fraca', text: s.acertos + ' acertos · ' + s.erros + ' erros' })
      ] : el('span', { class: 'data-fraca', text: '—' })),
      el('td', null, s.ultimo ? [
        el('div', { class: 'data-forte', text: UI.haQuanto(s.ultimo) }),
        el('div', { class: 'data-fraca', text: UI.fmtData(s.ultimo) })
      ] : el('span', { class: 'data-fraca', text: '—' })),
      el('td', null, el('div', { class: 'acoes-linha' },
        window.Sessao ? UI.botao('Lançar estudo', function () { Sessao.abrir({ disciplinaId: d.id, tipo: 'questoes', cadernoIds: [c.id] }); }, 'btn-lancar', 'play') : null
      ))
    ]);
  }

  // ---------- Formulários ----------
  function editarPasta(d, p) {
    var nome = el('input', { type: 'text', value: p ? p.nome : '', placeholder: 'Ex.: Bancas CEBRASPE, FCC e FGV' });
    var posicao = p ? UI.seletorPosicao(Dados.pastasDe(d.id).length, p.ordem) : null;
    var botoes = [{ texto: 'Cancelar', classe: 'btn-secundario' }];
    if (p) botoes.unshift({ texto: 'Excluir', classe: 'btn-perigo btn-esquerda', acao: function () {
      var n = Dados.cadernosDe(p.id).length;
      UI.confirmar('Excluir a pasta "' + p.nome + '"' + (n ? ' e seus ' + n + ' cadernos' : '') + '? As questões já lançadas continuam contando no total da disciplina.', function () {
        Dados.excluirPasta(p.id);
        App.atualizar();
      });
    } });
    botoes.push({ texto: 'Salvar', classe: 'btn-primario', acao: function () {
      var n = nome.value.trim();
      if (!n) { nome.focus(); return false; }
      try {
        if (p) Dados.atualizarPasta(p.id, n, Number(posicao.value));
        else Dados.criarPasta(d.id, n);
      } catch (e) { UI.aviso(e.message); nome.focus(); return false; }
      App.atualizar();
    } });
    UI.modal(p ? 'Editar pasta' : 'Nova pasta', [UI.campo('Nome da pasta', nome), posicao ? UI.campo('Posição', posicao) : null], botoes);
  }

  function editarCaderno(d, p, c) {
    var teoria = p.tipo === 'teoria', erros = p.tipo === 'erros';
    var simulado = p.tipo === 'simulado', favoritas = p.tipo === 'favoritas';
    var livre = teoria ? (c && c.blocoId && Dados.bloco(c.blocoId) ? Dados.bloco(c.blocoId) : Dados.blocoSemCaderno(d.id, c ? c.id : null)) : null;
    var pares = erros ? Dados.paresDeBlocos(d.id) : [];
    var parLivre = erros ? (c && c.par && pares[c.par - 1] ? pares[c.par - 1] : Dados.parSemCaderno(d.id, c ? c.id : null)) : null;
    var grupo = favoritas ? (c && c.grupo ? c.grupo : Dados.grupoLivre(d.id, c ? c.id : null)) : null;
    var n = Dados.cadernosDe(p.id).length + 1;
    var nomeSugerido = livre ? livre.nome : parLivre ? 'Erros — ' + Dados.nomePar(parLivre)
      : simulado ? 'Simulado ' + String(n).padStart(2, '0')
      : favoritas ? (grupo === 'erros2x' ? 'Favoritadas — Errei 2x ou mais' : 'Favoritadas — Dúvidas')
      : 'Bloco ' + String(n).padStart(2, '0');
    var nome = el('input', { type: 'text', value: c ? c.nome : nomeSugerido });
    var assunto = el('input', { type: 'text', value: c ? c.assunto : '', placeholder: 'Ex.: Introdução e Tributos' });
    var link = el('input', { type: 'text', inputmode: 'url', value: c ? c.link : '', placeholder: 'https://www.tecconcursos.com.br/...' });
    var total = el('input', { type: 'number', min: 0, step: 1, value: c ? c.totalQuestoes || '' : '', placeholder: 'Ex.: 115' });
    var prioridade = el('select', null, [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']].map(function (o) {
      return el('option', { value: o[0], text: o[1], selected: (c ? c.prioridade : 'media') === o[0] });
    }));
    var posicao = c ? UI.seletorPosicao(Dados.cadernosDe(c.pastaId).length, c.ordem) : null;
    var extraTeoria = teoria ? camposTeoriaCaderno(d, p, c, livre, total) : null;
    var usadosPar = erros ? Dados.cadernosDe(p.id).filter(function (x) { return (!c || x.id !== c.id) && x.par; }).map(function (x) { return x.par; }) : [];
    var seletorPar = erros ? el('select', null, [el('option', { value: '', text: '— escolha os blocos —' })].concat(pares.map(function (pr) {
      var ocupado = usadosPar.indexOf(pr.par) >= 0;
      return el('option', { value: pr.par, text: Dados.nomePar(pr) + (ocupado ? ' (já tem caderno)' : ''), disabled: ocupado, selected: parLivre && parLivre.par === pr.par });
    }))) : null;
    var usadosGrupo = favoritas ? Dados.cadernosDe(p.id).filter(function (x) { return (!c || x.id !== c.id) && x.grupo; }).map(function (x) { return x.grupo; }) : [];
    var seletorGrupo = favoritas ? el('select', null, [el('option', { value: '', text: '— escolha o grupo —' })].concat(Dados.ORDEM_FAVORITAS.map(function (g) {
      var ocupado = usadosGrupo.indexOf(g) >= 0;
      return el('option', { value: g, text: Dados.GRUPOS_FAVORITAS[g] + (ocupado ? ' (já tem caderno)' : ''), disabled: ocupado, selected: grupo === g });
    }))) : null;

    var botoes = [{ texto: 'Cancelar', classe: 'btn-secundario' }];
    if (c) botoes.unshift({ texto: 'Excluir', classe: 'btn-perigo btn-esquerda', acao: function () {
      UI.confirmar('Excluir o caderno "' + c.nome + '"? As questões já lançadas continuam contando no total da disciplina.', function () {
        Dados.excluirCaderno(c.id);
        App.atualizar();
      });
    } });
    botoes.push({ texto: 'Salvar', classe: 'btn-primario', acao: function () {
      var n = nome.value.trim();
      if (!n) { nome.focus(); return false; }
      var campos = { nome: n, assunto: assunto.value.trim(), link: link.value, prioridade: prioridade.value, totalQuestoes: total.value };
      if (extraTeoria) {
        campos.blocoId = extraTeoria.bloco.value || null;
        campos.baterias = extraTeoria.baterias();
      }
      if (seletorPar) campos.par = seletorPar.value || null;
      if (seletorGrupo) { campos.grupo = seletorGrupo.value || null; campos.totalQuestoes = 0; }
      if (c) Dados.atualizarCaderno(c.id, campos, Number(posicao.value));
      else Dados.criarCaderno(p.id, campos);
      App.atualizar();
    } });

    UI.modal(c ? 'Editar caderno' : 'Novo caderno — ' + p.nome, [
      UI.campo('Nome do caderno', nome),
      UI.campo('Assunto', assunto),
      UI.campo('Link do caderno no TecConcursos', link, 'Cole o endereço do caderno para abri-lo com um clique.'),
      el('div', { class: 'campos-linha' }, [
        favoritas ? null : UI.campo('Total de questões', total, erros ? 'Quantas questões erradas o caderno de erros tem'
          : simulado ? 'Em geral, de 50 a 100 questões' : 'Quantas questões o caderno tem'),
        teoria || erros || simulado || favoritas ? null : UI.campo('Prioridade', prioridade),
        posicao ? UI.campo('Posição', posicao) : null
      ]),
      extraTeoria ? extraTeoria.nos : null,
      seletorPar ? el('div', { class: 'campos-teoria' }, UI.campo('Blocos', seletorPar, 'A bateria de erros destes blocos fica concluída quando todas as questões do caderno forem lançadas.')) : null,
      seletorGrupo ? el('div', { class: 'campos-teoria' }, UI.campo('Grupo', seletorGrupo, 'Este caderno muda sempre, por isso não tem total: ao lançar a sessão, marque "Finalizei este caderno" quando terminar.')) : null
    ], botoes);
  }

  // Campos só dos cadernos de teoria: o bloco correspondente e a divisão em baterias.
  // Enquanto o usuário não mexer na divisão, ela acompanha o total (partes iguais).
  function camposTeoriaCaderno(d, p, c, livre, total) {
    var nb = Dados.numBaterias(d.id);
    var usados = Dados.cadernosDe(p.id).filter(function (x) { return (!c || x.id !== c.id) && x.blocoId; }).map(function (x) { return x.blocoId; });
    var bloco = el('select', null, [el('option', { value: '', text: '— escolha o bloco —' })].concat(
      Dados.blocosDe(d.id).map(function (b) {
        var ocupado = usados.indexOf(b.id) >= 0;
        return el('option', { value: b.id, text: b.nome + (ocupado ? ' (já tem caderno)' : ''), disabled: ocupado, selected: livre && livre.id === b.id });
      })));
    var personalizada = !!(c && c.baterias && c.baterias.length === nb);
    var inicial = c ? Dados.divisaoBaterias(c, nb) : Dados.divisaoIgual(Number(total.value) || 0, nb);
    var soma = el('span', { class: 'campo-ajuda' });
    var entradas = inicial.map(function (v, i) {
      return el('input', { type: 'number', min: 0, step: 1, value: v, 'aria-label': (i + 1) + 'ª bateria', oninput: function () { personalizada = true; atualizarSoma(); } });
    });
    function atualizarSoma() {
      var s = entradas.reduce(function (m, e) { return m + (Number(e.value) || 0); }, 0);
      var t = Number(total.value) || 0;
      soma.textContent = 'Soma das baterias: ' + s + (t ? ' de ' + t + ' questões' + (s > t ? ' (passa do total do caderno)' : '') : '');
    }
    function dividirIgual() {
      Dados.divisaoIgual(Number(total.value) || 0, nb).forEach(function (v, i) { entradas[i].value = v; });
      personalizada = false;
      atualizarSoma();
    }
    total.addEventListener('input', function () { if (!personalizada) dividirIgual(); else atualizarSoma(); });
    atualizarSoma();

    return {
      bloco: bloco,
      baterias: function () {
        var valores = entradas.map(function (e) { return Math.max(0, Math.round(Number(e.value) || 0)); });
        var igual = Dados.divisaoIgual(Number(total.value) || 0, nb);
        return valores.join() === igual.join() ? null : valores; // null = acompanha o total
      },
      nos: el('div', { class: 'campos-teoria' }, [
        UI.campo('Bloco de teoria', bloco, 'As baterias deste caderno são recomendadas depois da teoria deste bloco.'),
        el('div', { class: 'campo' }, [
          el('span', { class: 'campo-rotulo', text: 'Questões por bateria (' + nb + ' baterias)' }),
          el('div', { class: 'baterias-entrada' }, entradas.map(function (e, i) {
            return el('label', { class: 'bateria-entrada' }, [el('span', { text: (i + 1) + 'ª' }), e]);
          }).concat([el('button', { type: 'button', class: 'link', text: 'Dividir igualmente', onclick: dividirIgual })])),
          soma
        ])
      ])
    };
  }

  function moverCaderno(d, c) {
    var lista = el('div', { class: 'lista-escolha' });
    var m = UI.modal('Mover "' + c.nome + '" para…', lista, [{ texto: 'Cancelar', classe: 'btn-secundario' }]);
    Dados.pastasDe(d.id).forEach(function (p) {
      var atual = p.id === c.pastaId;
      lista.appendChild(el('button', {
        type: 'button', class: 'item-escolha', disabled: atual, style: { borderLeftColor: d.cor },
        onclick: function () { Dados.moverCaderno(c.id, p.id); m.fechar(); App.atualizar(); UI.aviso('Caderno movido para "' + p.nome + '"'); }
      }, [el('span', { text: p.nome }), el('span', { class: 'data-fraca', text: atual ? 'pasta atual' : Dados.cadernosDe(p.id).length + ' cadernos' })]));
    });
  }

  function render(raiz, params) {
    if (params[0]) renderDisciplina(raiz, params[0]);
    else renderLista(raiz);
  }

  return { render: render };
})();
