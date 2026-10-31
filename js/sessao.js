// "Lançar estudo": formulário da sessão de estudo, cronômetro e histórico.
var Sessao = (function () {
  var el = UI.el;

  // ---------- Cronômetro (continua contando mesmo se a página for fechada) ----------
  var CHAVE_CRON = 'controle-estudos.cronometro';
  var cron = null;
  try { cron = JSON.parse(localStorage.getItem(CHAVE_CRON)); } catch (e) { cron = null; }

  function gravarCron(c) {
    cron = c;
    try {
      if (c) localStorage.setItem(CHAVE_CRON, JSON.stringify(c));
      else localStorage.removeItem(CHAVE_CRON);
    } catch (e) { /* segue só em memória */ }
    desenharCron();
  }

  function segundosCron() {
    if (!cron) return 0;
    return cron.acumulado + (cron.inicio ? Math.floor((Date.now() - cron.inicio) / 1000) : 0);
  }

  function iniciarCron(contexto) { gravarCron({ inicio: Date.now(), acumulado: 0, contexto: contexto || null }); }
  function pausarCron() { cron.acumulado = segundosCron(); cron.inicio = null; gravarCron(cron); }
  function retomarCron() { cron.inicio = Date.now(); gravarCron(cron); }
  function finalizarCron() {
    if (cron.inicio) pausarCron();
    abrir(Object.assign({}, cron.contexto || {}, { segundos: segundosCron(), doCronometro: true }));
  }
  function descartarCron() {
    UI.confirmar('Descartar o tempo marcado no cronômetro (' + UI.fmtDuracao(segundosCron()) + ')?', function () { gravarCron(null); }, 'Descartar');
  }

  function botaoMini(texto, acao, classe, titulo) {
    return el('button', { type: 'button', class: 'cron-btn ' + (classe || ''), title: titulo || texto, onclick: acao, text: texto });
  }

  function desenharCron() {
    var caixa = document.getElementById('acoes-topo');
    if (!caixa) return;
    caixa.innerHTML = '';
    if (!cron) {
      caixa.appendChild(UI.botao('Cronômetro', function () { iniciarCron(null); }, 'btn-secundario btn-cron', 'relogio'));
      caixa.appendChild(UI.botao('+ Lançar estudo', function () { abrir({}); }, 'btn-primario'));
      return;
    }
    var d = cron.contexto && Dados.disciplina(cron.contexto.disciplinaId);
    caixa.appendChild(el('div', { class: 'cron-ativo' + (cron.inicio ? ' rodando' : '') }, [
      el('span', { class: 'cron-ponto' }),
      el('span', { class: 'cron-tempo', id: 'cron-tempo', text: UI.fmtDuracao(segundosCron()) }),
      d ? el('span', { class: 'cron-disc', text: d.nome }) : null,
      cron.inicio ? botaoMini('Pausar', pausarCron) : botaoMini('Retomar', retomarCron),
      botaoMini('Finalizar', finalizarCron, 'principal', 'Finalizar e lançar o estudo'),
      botaoMini('✕', descartarCron, 'descartar', 'Descartar cronômetro')
    ]));
  }

  setInterval(function () {
    if (!cron || !cron.inicio) return;
    var t = document.getElementById('cron-tempo');
    if (t) t.textContent = UI.fmtDuracao(segundosCron());
  }, 1000);

  // ---------- Formulário ----------
  // opcoes: { sessaoId, disciplinaId, tipo, topicoIds, cadernoIds, segundos, doCronometro }
  function abrir(opcoes) {
    var op = opcoes || {};
    var existente = op.sessaoId ? Dados.sessao(op.sessaoId) : null;
    var discs = Dados.disciplinas();
    if (!discs.length) {
      UI.aviso('Cadastre uma disciplina primeiro');
      location.hash = '#/teoria';
      return;
    }
    var proxima = Dados.proximaDoCiclo ? Dados.proximaDoCiclo() : null;

    var est = {
      disciplinaId: existente ? existente.disciplinaId : (op.disciplinaId || (proxima && proxima.disciplinaId) || discs[0].id),
      tipo: existente ? existente.tipo : (op.tipo || 'teoria'),
      topicoIds: existente ? existente.topicoIds.slice() : (op.topicoIds || []).slice(),
      linhas: existente
        ? existente.cadernos.map(function (c) { return { cadernoId: c.cadernoId || '', acertos: c.acertos, erros: c.erros }; })
        : (op.cadernoIds || []).map(function (id) { return { cadernoId: id, acertos: '', erros: '' }; }),
      segundos: existente ? existente.segundos : (op.segundos || 0),
      concluir: true,
      revistos: null // Revisão: { chave: { nome, marcado } }, montado ao abrir a área
    };
    if (!est.linhas.length) est.linhas.push({ cadernoId: '', acertos: '', erros: '' });

    var data = el('input', { type: 'date', value: existente ? existente.data : UI.hoje(), max: UI.hoje() });
    var disciplina = el('select', { onchange: function () {
      est.disciplinaId = disciplina.value;
      est.topicoIds = [];
      est.linhas = [{ cadernoId: '', acertos: '', erros: '' }];
      est.revistos = null;
      desenharArea();
    } }, discs.map(function (d) { return el('option', { value: d.id, text: d.nome, selected: d.id === est.disciplinaId }); }));

    var tipoBotoes = el('div', { class: 'segmentado' });
    function desenharTipo() {
      tipoBotoes.innerHTML = '';
      [['teoria', 'Teoria'], ['questoes', 'Questões'], ['revisao', 'Revisão']].forEach(function (t) {
        tipoBotoes.appendChild(el('button', { type: 'button', class: est.tipo === t[0] ? 'ativo' : '', text: t[1], onclick: function () {
          est.tipo = t[0];
          desenharTipo();
          desenharArea();
        } }));
      });
    }

    var horas = el('input', { type: 'number', min: 0, step: 1, value: Math.floor(est.segundos / 3600), oninput: atualizarTempo });
    var minutos = el('input', { type: 'number', min: 0, max: 59, step: 1, value: Math.floor((est.segundos % 3600) / 60), oninput: atualizarTempo });
    function atualizarTempo() {
      est.segundos = (Number(horas.value) || 0) * 3600 + (Number(minutos.value) || 0) * 60;
    }

    var area = el('div', { class: 'sessao-area' });
    function desenharArea() {
      area.innerHTML = '';
      var partes = est.tipo === 'teoria' ? areaTeoria(est)
        : est.tipo === 'revisao' ? areaRevisao(est, desenharArea)
        : areaQuestoes(est, desenharArea);
      [].concat(partes).forEach(function (n) { if (n) area.appendChild(n); });
    }

    var anotacao = el('textarea', { rows: 3, value: existente ? existente.anotacao : '', placeholder: 'Ex.: Fazer 30 questões do Bloco 10. / Revisar art. 156 antes de continuar.' });
    var erro = el('div', { class: 'erro-form', hidden: true });

    function mostrarErro(msg) { erro.textContent = msg; erro.hidden = false; return false; }

    function salvar() {
      erro.hidden = true;
      if (!data.value) return mostrarErro('Informe a data.');
      if (est.segundos <= 0) return mostrarErro('Informe o tempo de estudo.');
      var campos = { data: data.value, disciplinaId: est.disciplinaId, tipo: est.tipo, segundos: est.segundos, anotacao: anotacao.value };
      if (est.tipo === 'teoria') {
        if (Dados.topicosDaDisciplina(est.disciplinaId).length && !est.topicoIds.length) return mostrarErro('Marque o(s) tópico(s) estudado(s).');
        campos.topicoIds = est.topicoIds;
      } else {
        var linhas = est.linhas.filter(function (l) { return (Number(l.acertos) || 0) + (Number(l.erros) || 0) > 0; });
        var marcados = [];
        for (var ch in est.revistos || {}) if (est.revistos[ch].marcado) marcados.push({ chave: ch, nome: est.revistos[ch].nome });
        if (est.tipo === 'revisao') {
          if (!linhas.length && !marcados.length) return mostrarErro('Informe as questões feitas na revisão ou marque os assuntos que já foram revistos.');
          campos.revisados = marcados;
        } else if (!linhas.length) {
          return mostrarErro('Informe os acertos e erros de pelo menos um caderno.');
        }
        campos.cadernos = linhas;
      }

      var vezAntes = Dados.proximaDoCiclo();
      if (existente) Dados.atualizarSessao(existente.id, campos);
      else Dados.criarSessao(campos);
      var vezDepois = Dados.proximaDoCiclo();
      if (est.tipo === 'teoria' && est.concluir) {
        est.topicoIds.forEach(function (id) { Dados.definirConcluido(id, true, data.value); });
      }
      if (est.tipo === 'revisao' && est.revistos) {
        for (var k in est.revistos) Dados.marcarRevisto(est.disciplinaId, k, est.revistos[k].marcado, data.value);
      }
      if (op.doCronometro) gravarCron(null);
      App.atualizar();
      if (!existente && vezAntes && vezAntes !== vezDepois) {
        var prox = Dados.disciplina(vezDepois.disciplinaId);
        UI.aviso('Estudo lançado · ciclo avançou: agora é ' + (prox ? prox.nome : 'a próxima matéria'));
      } else {
        UI.aviso(existente ? 'Sessão atualizada' : 'Estudo lançado');
      }
    }

    var botoes = [{ texto: 'Cancelar', classe: 'btn-secundario' }];
    if (existente) {
      botoes.unshift({ texto: 'Excluir', classe: 'btn-perigo btn-esquerda', acao: function () { confirmarExclusao(existente); } });
    } else if (!op.doCronometro && !cron) {
      botoes.unshift({ texto: 'Iniciar cronômetro', classe: 'btn-contorno btn-esquerda', acao: function () {
        iniciarCron({
          disciplinaId: est.disciplinaId, tipo: est.tipo, topicoIds: est.topicoIds,
          cadernoIds: est.linhas.map(function (l) { return l.cadernoId; }).filter(Boolean)
        });
        UI.aviso('Cronômetro iniciado. Clique em "Finalizar" no topo quando terminar.');
      } });
    }
    botoes.push({ texto: existente ? 'Salvar alterações' : 'Lançar estudo', classe: 'btn-primario', acao: salvar });

    desenharTipo();
    desenharArea();
    var m = UI.modal(existente ? 'Editar sessão de estudo' : 'Lançar estudo', [
      el('div', { class: 'campos-linha' }, [UI.campo('Data', data), UI.campo('Disciplina', disciplina)]),
      el('div', { class: 'campos-linha' }, [
        UI.campo('O que você estudou?', tipoBotoes),
        el('div', { class: 'campo' }, [
          el('span', { class: 'campo-rotulo', text: 'Tempo de estudo' }),
          el('div', { class: 'tempo' }, [horas, el('span', { text: 'h' }), minutos, el('span', { text: 'min' })])
        ])
      ]),
      area,
      UI.campo('Anotação para a próxima vez', anotacao, 'Aparece na disciplina e no ciclo, para você saber o que fazer quando ela voltar.'),
      erro
    ], botoes);
    m.caixa.classList.add('modal-largo');
    // Deixa visível o tópico que veio pré-selecionado.
    var marcado = m.caixa.querySelector('.lista-topicos input:checked');
    if (marcado) {
      var lista = m.caixa.querySelector('.lista-topicos');
      lista.scrollTop = marcado.closest('.opcao-topico').offsetTop - lista.offsetTop - 40;
    }
  }

  function areaTeoria(est) {
    var blocos = Dados.blocosDe(est.disciplinaId).filter(function (b) { return Dados.topicosDe(b.id).length; });
    if (!blocos.length) {
      return el('p', { class: 'aviso-suave', text: 'Esta disciplina ainda não tem tópicos. Cadastre-os no Controle de Teoria para registrar o que foi estudado.' });
    }
    var lista = el('div', { class: 'lista-topicos' }, blocos.map(function (b) {
      return el('div', { class: 'grupo-topicos' }, [
        el('div', { class: 'grupo-titulo', text: b.nome }),
        Dados.topicosDe(b.id).map(function (t) {
          var marcado = est.topicoIds.indexOf(t.id) >= 0;
          return el('label', { class: 'opcao-topico' + (t.concluido ? ' ja-concluido' : '') }, [
            el('input', { type: 'checkbox', checked: marcado, onchange: function (e) {
              if (e.target.checked) est.topicoIds.push(t.id);
              else est.topicoIds = est.topicoIds.filter(function (x) { return x !== t.id; });
            } }),
            el('span', { text: t.nome }),
            t.concluido ? UI.selo('Concluído', 'sucesso') : null
          ]);
        })
      ]);
    }));
    var concluir = el('label', { class: 'opcao-check' }, [
      el('input', { type: 'checkbox', checked: est.concluir, onchange: function (e) { est.concluir = e.target.checked; } }),
      'Marcar os tópicos selecionados como concluídos'
    ]);
    return [UI.campo('Tópico(s) estudado(s)', lista), concluir];
  }

  // Revisão: pontos fracos da disciplina (das Estatísticas) com checkbox "revisto" + cadernos de questões.
  function areaRevisao(est, redesenhar) {
    var fracos = window.Estatisticas ? Estatisticas.pontosFracos(est.disciplinaId) : [];
    if (!est.revistos) {
      est.revistos = {};
      fracos.forEach(function (t) { est.revistos[t.chave] = { nome: t.nome, marcado: !!t.revisto }; });
    }
    var pendentes = fracos.filter(function (t) { return !est.revistos[t.chave].marcado; }).length;

    var lista;
    if (!Dados.db.importacoes.length) {
      lista = el('p', { class: 'aviso-suave', text: 'Nenhuma planilha importada ainda. Importe o histórico do TecConcursos na aba Estatísticas para ver os assuntos que precisam de revisão.' });
    } else if (!fracos.length) {
      lista = el('p', { class: 'aviso-suave aviso-ok', text: 'Nenhum assunto desta disciplina com 20% de erro ou mais nas Estatísticas. Você ainda pode lançar as questões de revisão abaixo.' });
    } else {
      lista = el('div', { class: 'lista-topicos lista-revisao' }, fracos.map(function (t) {
        var estado = est.revistos[t.chave];
        var item = el('label', { class: 'opcao-topico opcao-revisao' + (estado.marcado ? ' revisto' : '') }, [
          el('input', { type: 'checkbox', checked: estado.marcado, onchange: function (e) {
            estado.marcado = e.target.checked;
            item.classList.toggle('revisto', estado.marcado);
            contador.textContent = textoPendentes();
          } }),
          el('span', { class: 'revisao-assunto' }, [
            el('span', { class: 'revisao-nome', text: t.nome }),
            t.caminho.length ? el('span', { class: 'revisao-caminho', text: t.caminho.join(' › ') }) : null
          ]),
          Estatisticas.seloErro(t)
        ]);
        return item;
      }));
    }

    function textoPendentes() {
      var n = fracos.filter(function (t) { return !est.revistos[t.chave].marcado; }).length;
      return n ? n + (n === 1 ? ' pendente' : ' pendentes') : 'todos revistos ✓';
    }
    var contador = el('span', { class: 'data-fraca', text: fracos.length ? textoPendentes() : '' });

    return [
      el('div', { class: 'campo' }, [
        el('div', { class: 'revisao-cabecalho' }, [
          el('span', { class: 'campo-rotulo', text: 'Assuntos a revisar (das Estatísticas)' }),
          contador
        ]),
        lista,
        fracos.length ? el('span', { class: 'campo-ajuda', text: 'Marque o que você já revisou: sai do alerta da próxima matéria. Se continuar com muitos erros na próxima planilha importada, volta para a lista.' }) : null
      ]),
      el('div', { class: 'campo-rotulo rotulo-cadernos', text: 'Questões resolvidas na revisão' })
    ].concat(areaQuestoes(est, redesenhar));
  }

  function areaQuestoes(est, redesenhar) {
    var pastas = Dados.pastasDe(est.disciplinaId);
    var total = el('div', { class: 'total-questoes' });

    function atualizarTotal() {
      var a = 0, e = 0;
      est.linhas.forEach(function (l) { a += Number(l.acertos) || 0; e += Number(l.erros) || 0; });
      total.innerHTML = '';
      if (a + e) total.appendChild(el('span', null, ['Total: ', el('strong', { text: (a + e) + ' questões' }), ' · ', UI.acerto(a / (a + e) * 100, a + e)]));
    }

    var linhas = est.linhas.map(function (l, i) {
      var sel = el('select', { onchange: function () { l.cadernoId = sel.value; } }, [
        el('option', { value: '', text: 'Questões avulsas (sem caderno)' })
      ].concat(pastas.map(function (p) {
        return el('optgroup', { label: p.nome }, Dados.cadernosDe(p.id).map(function (c) {
          var s = Dados.statsCaderno(c.id);
          var info = s.total ? ' (' + s.feitas + '/' + s.total + ')' : '';
          return el('option', { value: c.id, text: c.nome + (c.assunto ? ' — ' + c.assunto : '') + info, selected: c.id === l.cadernoId });
        }));
      })));
      function numero(campo, rotulo) {
        return el('label', { class: 'campo-num' }, [
          el('span', { class: 'campo-rotulo', text: rotulo }),
          el('input', { type: 'number', min: 0, step: 1, value: l[campo], oninput: function (e) { l[campo] = e.target.value; atualizarTotal(); } })
        ]);
      }
      return el('div', { class: 'linha-caderno' }, [
        el('label', { class: 'campo' }, [el('span', { class: 'campo-rotulo', text: 'Caderno' }), sel]),
        numero('acertos', 'Acertos'),
        numero('erros', 'Erros'),
        est.linhas.length > 1 ? el('button', { type: 'button', class: 'btn-icone btn-remover', title: 'Remover', text: '✕', onclick: function () {
          est.linhas.splice(i, 1);
          redesenhar();
        } }) : null
      ]);
    });

    atualizarTotal();
    return [
      !pastas.length ? el('p', { class: 'aviso-suave', text: 'Esta disciplina ainda não tem cadernos. Você pode lançar como questões avulsas ou cadastrar cadernos no Controle de Questões.' }) : null,
      el('div', { class: 'linhas-caderno' }, linhas),
      el('div', { class: 'questoes-rodape' }, [
        el('button', { type: 'button', class: 'link', text: '+ Outro caderno', onclick: function () {
          est.linhas.push({ cadernoId: '', acertos: '', erros: '' });
          redesenhar();
        } }),
        total
      ])
    ];
  }

  function confirmarExclusao(s) {
    UI.confirmar('Excluir a sessão de ' + UI.fmtData(s.data) + '? Os tempos e questões dela deixam de contar. (Tópicos concluídos e assuntos revistos continuam marcados.)', function () {
      Dados.excluirSessao(s.id);
      App.atualizar();
      UI.aviso('Sessão excluída');
    });
  }

  // ---------- Histórico ----------
  function descrever(s) {
    if (s.tipo === 'teoria') {
      return (s.topicoIds || []).map(function (id) { var t = Dados.topico(id); return t ? t.nome : ''; }).filter(Boolean).join('; ') || '—';
    }
    var partes = (s.cadernos || []).map(function (c) {
      var cad = Dados.caderno(c.cadernoId);
      return (cad ? cad.nome : 'Avulsas') + ': ' + c.acertos + ' acertos · ' + c.erros + ' erros';
    });
    if (s.tipo === 'revisao' && s.revisados && s.revisados.length) {
      partes.push('Revistos: ' + s.revisados.map(function (r) { return r.nome; }).join(', '));
    }
    return partes.join('; ') || '—';
  }

  var TIPOS = { teoria: ['Teoria', 'info'], questoes: ['Questões', 'neutro'], revisao: ['Revisão', 'aviso'] };
  function seloTipo(tipo) { var t = TIPOS[tipo] || TIPOS.questoes; return UI.selo(t[0], t[1]); }

  function historico(d) {
    var sessoes = Dados.sessoesDe(d.id);
    var m;
    var corpo = sessoes.length
      ? el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela tabela-historico' }, [
          el('thead', null, el('tr', null, ['Data', 'Tipo', 'Tempo', 'Detalhe', ''].map(function (h) { return el('th', { text: h }); }))),
          el('tbody', null, sessoes.map(function (s) {
            return el('tr', null, [
              el('td', { text: UI.fmtData(s.data) }),
              el('td', null, seloTipo(s.tipo)),
              el('td', { text: UI.fmtDuracao(s.segundos) }),
              el('td', null, [
                el('div', { text: descrever(s) }),
                s.anotacao ? el('div', { class: 'data-fraca', text: '📝 ' + s.anotacao }) : null
              ]),
              el('td', null, el('button', { type: 'button', class: 'link', text: 'Editar', onclick: function () {
                m.fechar();
                abrir({ sessaoId: s.id });
              } }))
            ]);
          }))
        ]))
      : el('p', { class: 'data-fraca', text: 'Nenhuma sessão de estudo lançada para esta disciplina ainda.' });
    var total = Dados.tempoAcumulado(d.id);
    m = UI.modal('Histórico de estudos — ' + d.nome, [
      sessoes.length ? el('p', { class: 'modal-desc', text: sessoes.length + ' sessões · ' + UI.fmtDuracao(total) + ' de estudo no total' }) : null,
      corpo
    ], [{ texto: 'Fechar', classe: 'btn-secundario' }]);
    m.caixa.classList.add('modal-largo');
  }

  desenharCron();

  function iniciarCronometro(contexto) {
    if (cron) { UI.aviso('Já existe um cronômetro em andamento'); return; }
    iniciarCron(contexto);
    UI.aviso('Cronômetro iniciado. Clique em "Finalizar" no topo quando terminar.');
  }

  return {
    abrir: abrir, historico: historico, iniciarCronometro: iniciarCronometro,
    descrever: descrever, seloTipo: seloTipo, confirmarExclusao: confirmarExclusao
  };
})();
