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
      var btnAnki = UI.botao('Anki', function () { abrirAnki({}); }, 'btn-secundario btn-cron', 'cartas');
      btnAnki.title = 'Registrar o tempo gasto no Anki';
      btnAnki.setAttribute('aria-label', 'Anki');
      caixa.appendChild(btnAnki);
      caixa.appendChild(UI.botao('+ Estudo extra', function () { abrir({}); }, 'btn-primario', null));
      return;
    }
    var anki = !!(cron.contexto && cron.contexto.tipo === 'anki');
    var d = cron.contexto && Dados.disciplina(cron.contexto.disciplinaId);
    caixa.appendChild(el('div', { class: 'cron-ativo' + (cron.inicio ? ' rodando' : '') }, [
      el('span', { class: 'cron-ponto' }),
      el('span', { class: 'cron-tempo', id: 'cron-tempo', text: UI.fmtDuracao(segundosCron()) }),
      d || anki ? el('span', { class: 'cron-disc', text: anki ? 'Anki' : d.nome }) : null,
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
  // opcoes: { sessaoId, disciplinaId, tipo, aulaIds, topicoIds, cadernoIds, segundos, doCronometro, daMeta }
  // daMeta: lançamento da meta do ciclo (matéria, tipo e cadernos ou tópicos ficam travados; só este avança o ciclo).
  function abrir(opcoes) {
    var op = opcoes || {};
    var existente = op.sessaoId ? Dados.sessao(op.sessaoId) : null;
    if ((existente && existente.tipo === 'anki') || (!existente && op.tipo === 'anki')) return abrirAnki(op);
    var discs = Dados.disciplinas();
    if (!discs.length) {
      UI.aviso('Cadastre uma disciplina primeiro');
      location.hash = '#/teoria';
      return;
    }
    var proxima = Dados.proximaDoCiclo ? Dados.proximaDoCiclo() : null;

    var travado = !!op.daMeta && !existente;
    var est = {
      travado: travado,
      aulasMeta: travado && op.aulaIds ? op.aulaIds.slice() : null,
      aulaIds: existente ? (existente.aulaIds || []).slice() : (op.aulaIds || []).slice(),
      disciplinaId: existente ? existente.disciplinaId : (op.disciplinaId || (proxima && proxima.disciplinaId) || discs[0].id),
      tipo: existente ? existente.tipo : (op.tipo || 'teoria'),
      sessaoId: existente ? existente.id : null,
      topicoIds: existente ? existente.topicoIds.slice() : (op.topicoIds || []).slice(),
      linhas: existente
        ? existente.cadernos.filter(function (c) { return !c.assunto; }).map(function (c) { return { cadernoId: c.cadernoId || '', acertos: c.acertos, erros: c.erros, finalizado: !!c.finalizado, rodada: c.rodada || null, totalRodada: c.totalRodada || '', legado: !c.rodada }; })
        : (op.cadernoIds || []).map(function (id) { return { cadernoId: id, acertos: '', erros: '' }; }),
      segundos: existente ? existente.segundos : (op.segundos || 0),
      concluir: true,
      // Revisão: questões avulsas por ponto fraco { chave: { nome, acertos, erros } }
      assuntos: {}
    };
    if (existente) existente.cadernos.forEach(function (c) {
      if (c.assunto) est.assuntos[c.assunto.chave] = { nome: c.assunto.nome, acertos: c.acertos, erros: c.erros };
    });
    if (!est.linhas.length) est.linhas.push({ cadernoId: '', acertos: '', erros: '' });

    var data = el('input', { type: 'date', value: existente ? existente.data : UI.hoje(), max: UI.hoje() });
    var disciplina = el('select', { onchange: function () {
      est.disciplinaId = disciplina.value;
      est.topicoIds = [];
      est.aulaIds = [];
      est.linhas = [{ cadernoId: '', acertos: '', erros: '' }];
      est.assuntos = {};
      desenharArea();
    } }, discs.map(function (d) { return el('option', { value: d.id, text: d.nome, selected: d.id === est.disciplinaId }); }));
    if (travado) disciplina.disabled = true;

    var tipoBotoes = el('div', { class: 'segmentado' });
    function desenharTipo() {
      tipoBotoes.innerHTML = '';
      [['teoria', 'Teoria'], ['questoes', 'Questões'], ['revisao', 'Revisão']].forEach(function (t) {
        if (travado && t[0] !== est.tipo) return; // na meta, o tipo é o da meta
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
      var campos = { data: data.value, disciplinaId: est.disciplinaId, tipo: est.tipo, segundos: est.segundos, anotacao: anotacao.value, daMeta: travado };
      if (est.tipo === 'teoria') {
        if (Dados.progressoTeoria(est.disciplinaId).total && !est.aulaIds.length) return mostrarErro('Marque a(s) aula(s) estudada(s).');
        campos.aulaIds = est.aulaIds;
        campos.topicoIds = est.topicoIds; // sessões antigas guardam os tópicos estudados
      } else {
        // Caderno de favoritadas pode ser finalizado mesmo sem questões (quando ele está vazio).
        var linhas = est.linhas.filter(function (l) { return (Number(l.acertos) || 0) + (Number(l.erros) || 0) > 0 || (l.finalizado && l.cadernoId); });
        var porAssunto = [];
        if (est.tipo === 'revisao') {
          for (var ch in est.assuntos) {
            var a = est.assuntos[ch];
            if ((Number(a.acertos) || 0) + (Number(a.erros) || 0) > 0) porAssunto.push({ cadernoId: null, acertos: a.acertos, erros: a.erros, assunto: { chave: ch, nome: a.nome } });
          }
          if (!linhas.length && !porAssunto.length) return mostrarErro('Informe os acertos e erros de pelo menos um assunto.');
          // Assunto com questões lançadas conta como revisto (sai das recomendações até uma planilha nova).
          campos.revisados = porAssunto.map(function (l) { return l.assunto; })
            .concat(existente ? (existente.revisados || []).filter(function (r) { return !est.assuntos[r.chave]; }) : []);
        } else if (!linhas.length) {
          return mostrarErro('Informe os acertos e erros de pelo menos um caderno.');
        }
        // Rodada das favoritadas: o total do caderno é obrigatório e precisa comportar o que já foi feito.
        for (var iL = 0; iL < linhas.length; iL++) {
          var lr = linhas[iL];
          if (!lr.rodada) continue;
          var nomeCad = Dados.caderno(lr.cadernoId).nome, totalR = Number(lr.totalRodada) || 0;
          if (totalR <= 0) return mostrarErro('Informe quantas questões há no caderno "' + nomeCad + '".');
          var somaR = Dados.rodadaFavorita(lr.cadernoId, lr.rodada, est.sessaoId).feitas + (Number(lr.acertos) || 0) + (Number(lr.erros) || 0);
          if (somaR > totalR) return mostrarErro('O caderno "' + nomeCad + '" ficaria com ' + somaR + ' questões feitas, mais do que o total de ' + totalR + '.');
        }
        campos.cadernos = porAssunto.concat(linhas);
      }

      var patenteAntes = Patentes.calcular();
      var vezAntes = Dados.proximaDoCiclo();
      if (existente) Dados.atualizarSessao(existente.id, campos);
      else Dados.criarSessao(campos);
      var vezDepois = Dados.proximaDoCiclo();
      if (est.tipo === 'teoria' && est.concluir) {
        est.aulaIds.forEach(function (id) { var x = Dados.aula(id); if (x && !x.aula.concluido) Dados.definirAulaConcluida(id, true, data.value); });
      }
      if (est.tipo === 'revisao') {
        (campos.revisados || []).forEach(function (r) { Dados.marcarRevisto(est.disciplinaId, r.chave, true, data.value); });
      }
      if (op.doCronometro) gravarCron(null);
      App.atualizar();
      var ganho = Patentes.aposLancar(patenteAntes);
      var xpTexto = ganho > 0 ? ' · +' + UI.fmtNum(ganho) + ' XP' : Patentes.calcular().travado ? ' · XP no limite da patente' : '';
      if (!existente && vezAntes && vezAntes !== vezDepois) {
        var prox = Dados.disciplina(vezDepois.disciplinaId);
        UI.aviso('Estudo lançado' + xpTexto + ' · ciclo avançou: agora é ' + (prox ? prox.nome : 'a próxima matéria'));
      } else {
        UI.aviso((existente ? 'Sessão atualizada' : 'Estudo lançado') + xpTexto);
      }
    }

    var botoes = [{ texto: 'Cancelar', classe: 'btn-secundario' }];
    if (existente) {
      botoes.unshift({ texto: 'Excluir', classe: 'btn-perigo btn-esquerda', acao: function () { confirmarExclusao(existente); } });
    } else if (!op.doCronometro && !cron) {
      botoes.unshift({ texto: 'Iniciar cronômetro', classe: 'btn-contorno btn-esquerda', acao: function () {
        iniciarCron({
          disciplinaId: est.disciplinaId, tipo: est.tipo, aulaIds: est.aulaIds, daMeta: travado,
          cadernoIds: est.linhas.map(function (l) { return l.cadernoId; }).filter(Boolean)
        });
        UI.aviso('Cronômetro iniciado. Clique em "Finalizar" no topo quando terminar.');
      } });
    }
    botoes.push({ texto: existente ? 'Salvar alterações' : 'Lançar estudo', classe: 'btn-primario', acao: salvar });

    desenharTipo();
    desenharArea();
    var m = UI.modal(existente ? 'Editar sessão de estudo' : travado ? 'Lançar meta' : 'Estudo extra', [
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

  // ---------- Anki: só o tempo gasto, sem matéria (opcoes: { sessaoId, segundos, doCronometro }) ----------
  function abrirAnki(opcoes) {
    var op = opcoes || {};
    var existente = op.sessaoId ? Dados.sessao(op.sessaoId) : null;
    var segundos = existente ? existente.segundos : (op.segundos || 0);
    var data = el('input', { type: 'date', value: existente ? existente.data : UI.hoje(), max: UI.hoje() });
    var horas = el('input', { type: 'number', min: 0, step: 1, value: Math.floor(segundos / 3600), oninput: atualizarTempo });
    var minutos = el('input', { type: 'number', min: 0, max: 59, step: 1, value: Math.floor((segundos % 3600) / 60), oninput: atualizarTempo });
    function atualizarTempo() { segundos = (Number(horas.value) || 0) * 3600 + (Number(minutos.value) || 0) * 60; }
    var erro = el('div', { class: 'erro-form', hidden: true });
    function mostrarErro(msg) { erro.textContent = msg; erro.hidden = false; return false; }

    function registrar() {
      erro.hidden = true;
      if (!data.value) return mostrarErro('Informe a data.');
      if (segundos <= 0) return mostrarErro('Informe o tempo gasto no Anki.');
      var campos = { data: data.value, tipo: 'anki', segundos: segundos };
      if (existente) Dados.atualizarSessao(existente.id, campos);
      else Dados.criarSessao(campos);
      if (op.doCronometro) gravarCron(null);
      App.atualizar();
      UI.aviso(existente ? 'Tempo de Anki atualizado' : 'Tempo de Anki registrado');
    }

    var botoes = [{ texto: 'Cancelar', classe: 'btn-secundario' }];
    if (existente) {
      botoes.unshift({ texto: 'Excluir', classe: 'btn-perigo btn-esquerda', acao: function () { confirmarExclusao(existente); } });
    } else if (!op.doCronometro && !cron) {
      botoes.unshift({ texto: 'Iniciar cronômetro', classe: 'btn-contorno btn-esquerda', acao: function () {
        iniciarCron({ tipo: 'anki' });
        UI.aviso('Cronômetro do Anki iniciado. Clique em "Finalizar" no topo quando terminar.');
      } });
    }
    botoes.push({ texto: existente ? 'Salvar alterações' : 'Registrar tempo', classe: 'btn-primario', acao: registrar });

    UI.modal(existente ? 'Editar tempo de Anki' : 'Anki', [
      el('p', { class: 'modal-desc', text: 'Soma nas horas e na meta semanal, mas não dá XP nem conta como dia estudado.' }),
      el('div', { class: 'campos-linha' }, [
        UI.campo('Data', data),
        el('div', { class: 'campo' }, [
          el('span', { class: 'campo-rotulo', text: 'Tempo gasto' }),
          el('div', { class: 'tempo' }, [horas, el('span', { text: 'h' }), minutos, el('span', { text: 'min' })])
        ])
      ]),
      erro
    ], botoes);
  }

  // Teoria: escolhe as aulas estudadas (o que se conclui são as aulas, não os assuntos).
  function areaTeoria(est) {
    var blocos = Dados.blocosDe(est.disciplinaId).filter(function (b) { return Dados.aulasDe(b.id).length; });
    // Meta de teoria: só o bloco da meta aparece.
    if (est.aulasMeta && est.aulasMeta.length) {
      blocos = blocos.filter(function (b) { return Dados.aulasDe(b.id).some(function (a) { return est.aulasMeta.indexOf(a.id) >= 0; }); });
    }
    if (!blocos.length) {
      return el('p', { class: 'aviso-suave', text: 'Esta disciplina ainda não tem aulas. Cadastre-as nos blocos do Controle de Teoria para registrar o que foi estudado.' });
    }
    var lista = el('div', { class: 'lista-topicos' }, blocos.map(function (b) {
      return el('div', { class: 'grupo-topicos' }, [
        el('div', { class: 'grupo-titulo', text: b.nome }),
        Dados.aulasDe(b.id).map(function (a) {
          var marcado = est.aulaIds.indexOf(a.id) >= 0;
          return el('label', { class: 'opcao-topico' + (a.concluido ? ' ja-concluido' : '') }, [
            el('input', { type: 'checkbox', checked: marcado, onchange: function (e) {
              if (e.target.checked) est.aulaIds.push(a.id);
              else est.aulaIds = est.aulaIds.filter(function (x) { return x !== a.id; });
            } }),
            el('span', { text: Dados.nomeAula(a) + (a.curso ? ' · ' + a.curso : '') }),
            a.concluido ? UI.selo('Concluída', 'sucesso') : null
          ]);
        })
      ]);
    }));
    var concluir = el('label', { class: 'opcao-check' }, [
      el('input', { type: 'checkbox', checked: est.concluir, onchange: function (e) { est.concluir = e.target.checked; } }),
      'Marcar as aulas selecionadas como concluídas'
    ]);
    return [UI.campo('Aula(s) estudada(s)', lista), concluir];
  }

  // Revisão: pontos fracos da disciplina (das Estatísticas), com acertos e erros lançados por assunto
  // (sem caderno). Os já revistos ficam no fim da lista. Abaixo, outras questões opcionais com caderno.
  function areaRevisao(est, redesenhar) {
    var fracos = window.Estatisticas ? Estatisticas.pontosFracos(est.disciplinaId) : [];
    // Assuntos já lançados nesta sessão aparecem mesmo que tenham saído das Estatísticas.
    Object.keys(est.assuntos).forEach(function (ch) {
      if (!fracos.some(function (t) { return t.chave === ch; })) fracos.push({ chave: ch, nome: est.assuntos[ch].nome, caminho: [], revisto: true });
    });
    fracos.sort(function (a, b) { return (!!a.revisto && !est.assuntos[a.chave]) - (!!b.revisto && !est.assuntos[b.chave]); });
    var total = el('span', { class: 'data-fraca' });
    function atualizarTotal() {
      var q = 0, n = 0;
      for (var ch in est.assuntos) { var s = (Number(est.assuntos[ch].acertos) || 0) + (Number(est.assuntos[ch].erros) || 0); q += s; if (s) n++; }
      total.textContent = q ? q + (q === 1 ? ' questão' : ' questões') + ' em ' + n + (n === 1 ? ' assunto' : ' assuntos') : '';
    }

    var lista;
    if (!Dados.db.importacoes.length) {
      lista = el('p', { class: 'aviso-suave', text: 'Nenhuma planilha importada ainda. Importe o histórico do TecConcursos na aba Estatísticas para ver os assuntos que precisam de revisão.' });
    } else if (!fracos.length) {
      lista = el('p', { class: 'aviso-suave aviso-ok', text: 'Nenhum assunto desta disciplina com 20% de erro ou mais nas Estatísticas.' });
    } else {
      lista = el('div', { class: 'lista-assuntos' }, fracos.map(function (t) {
        var v = est.assuntos[t.chave] || { nome: t.nome, acertos: '', erros: '' };
        function numero(campo, rotulo) {
          return el('label', { class: 'assunto-num' }, [
            el('span', { text: rotulo }),
            el('input', { type: 'number', min: 0, step: 1, value: v[campo], oninput: function (e) {
              v[campo] = e.target.value;
              est.assuntos[t.chave] = v;
              atualizarTotal();
            } })
          ]);
        }
        return el('div', { class: 'assunto-linha' + (t.revisto && !est.assuntos[t.chave] ? ' revisto' : '') }, [
          el('div', { class: 'revisao-assunto' }, [
            el('span', { class: 'revisao-nome', text: t.nome }),
            t.caminho && t.caminho.length ? el('span', { class: 'revisao-caminho', text: t.caminho.join(' › ') }) : null,
            t.revisto && !est.assuntos[t.chave] ? el('span', { class: 'revisao-caminho', text: 'já revisto' }) : null
          ]),
          t.pctErro != null ? Estatisticas.seloErro(t) : null,
          numero('acertos', 'Acertos'),
          numero('erros', 'Erros')
        ]);
      }));
    }
    atualizarTotal();

    return [
      el('div', { class: 'campo' }, [
        el('div', { class: 'revisao-cabecalho' }, [el('span', { class: 'campo-rotulo', text: 'Questões por assunto (pontos fracos das Estatísticas)' }), total]),
        lista,
        fracos.length ? el('span', { class: 'campo-ajuda', text: 'Lance quantas questões resolveu de cada assunto. Assunto com questões lançadas fica como revisto e sai das recomendações; se continuar fraco na próxima planilha, volta.' }) : null
      ]),
      est.travado ? null : el('div', { class: 'campo-rotulo rotulo-cadernos', text: 'Outras questões desta revisão (opcional)' })
    ].concat(est.travado ? [] : areaQuestoes(est, redesenhar));
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

    function ehFavorito(id) { var c = id && Dados.caderno(id); var p = c && Dados.pasta(c.pastaId); return !!(p && p.tipo === 'favoritas'); }

    var linhas = est.linhas.map(function (l, i) {
      var sel = el('select', { onchange: function () {
        var antes = ehFavorito(l.cadernoId);
        l.cadernoId = sel.value;
        l.legado = false; l.rodada = null; l.totalRodada = '';
        if (antes || ehFavorito(l.cadernoId)) { l.finalizado = false; redesenhar(); }
      } }, [
        el('option', { value: '', text: 'Questões avulsas (sem caderno)' })
      ].concat(pastas.map(function (p) {
        return el('optgroup', { label: p.nome }, Dados.cadernosDe(p.id).map(function (c) {
          var s = Dados.statsCaderno(c.id);
          var info = s.total ? ' (' + s.feitas + '/' + s.total + ')' : '';
          return el('option', { value: c.id, text: c.nome + (c.assunto ? ' — ' + c.assunto : '') + info, selected: c.id === l.cadernoId });
        }));
      })));
      if (est.travado && l.cadernoId) sel.disabled = true; // na meta, o caderno é o da meta
      function numero(campo, rotulo) {
        return el('label', { class: 'campo-num' }, [
          el('span', { class: 'campo-rotulo', text: rotulo }),
          el('input', { type: 'number', min: 0, step: 1, value: l[campo], oninput: function (e) { l[campo] = e.target.value; atualizarTotal(); } })
        ]);
      }
      var linha = el('div', { class: 'linha-caderno' }, [
        el('label', { class: 'campo' }, [el('span', { class: 'campo-rotulo', text: 'Caderno' }), sel]),
        numero('acertos', 'Acertos'),
        numero('erros', 'Erros'),
        est.linhas.length > 1 && !est.travado ? el('button', { type: 'button', class: 'btn-icone btn-remover', title: 'Remover', text: '✕', onclick: function () {
          est.linhas.splice(i, 1);
          redesenhar();
        } }) : null
      ]);
      // Cadernos de favoritadas mudam sempre: em vez do total, você informa se terminou o caderno.
      if (!ehFavorito(l.cadernoId)) return linha;
      // Modo Leitura: cada rodada tem o seu total, informado aqui e mantido até a rodada terminar.
      if (!l.rodada && !l.legado) {
        var aberta = Dados.rodadaAberta(l.cadernoId);
        if (aberta) { l.rodada = aberta.blocoId; if (!l.totalRodada && aberta.total) l.totalRodada = aberta.total; }
      }
      if (l.rodada) {
        var rod = Dados.rodadaFavorita(l.cadernoId, l.rodada, est.sessaoId);
        var bl = Dados.bloco(l.rodada);
        return el('div', { class: 'linha-caderno-grupo' }, [linha,
          el('label', { class: 'campo campo-total-rodada' }, [
            el('span', { class: 'campo-rotulo', text: 'Quantas questões há neste caderno agora?' }),
            el('input', { type: 'number', min: 1, step: 1, value: l.totalRodada, oninput: function (e) { l.totalRodada = e.target.value; } }),
            el('span', { class: 'campo-ajuda', text: 'Rodada antes da teoria ' + (bl ? 'do ' + bl.nome : 'do bloco') + (rod.feitas ? ' · ' + rod.feitas + ' já feitas' : ' · rodada nova, começa do zero') })
          ])
        ]);
      }
      return el('div', { class: 'linha-caderno-grupo' }, [linha,
        el('label', { class: 'opcao-check opcao-finalizado' }, [
          el('input', { type: 'checkbox', checked: !!l.finalizado, onchange: function (e) { l.finalizado = e.target.checked; } }),
          'Finalizei este caderno (resolvi todas as questões dele)'
        ])
      ]);
    });

    atualizarTotal();
    return [
      !pastas.length ? el('p', { class: 'aviso-suave', text: 'Esta disciplina ainda não tem cadernos. Você pode lançar como questões avulsas ou cadastrar cadernos no Controle de Questões.' }) : null,
      el('div', { class: 'linhas-caderno' }, linhas),
      el('div', { class: 'questoes-rodape' }, [
        est.travado ? el('span') : el('button', { type: 'button', class: 'link', text: '+ Outro caderno', onclick: function () {
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
    if (s.tipo === 'anki') return 'Revisão no Anki';
    if (s.tipo === 'teoria') {
      var aulas = (s.aulaIds || []).map(function (id) { var x = Dados.aula(id); return x ? Dados.nomeAula(x.aula) : ''; });
      return aulas.concat((s.topicoIds || []).map(function (id) { var t = Dados.topico(id); return t ? t.nome : ''; })).filter(Boolean).join('; ') || '—';
    }
    var partes = (s.cadernos || []).map(function (c) {
      var cad = Dados.caderno(c.cadernoId);
      var nome = c.assunto ? c.assunto.nome : cad ? cad.nome : 'Avulsas';
      return nome + ': ' + c.acertos + ' acertos · ' + c.erros + ' erros' + (c.finalizado ? ' (caderno finalizado)' : '') + (c.rodada && c.totalRodada ? ' (caderno com ' + c.totalRodada + ' questões)' : '');
    });
    // Revistos só marcados (sessões antigas, sem questões por assunto).
    var soMarcados = (s.revisados || []).filter(function (r) { return !(s.cadernos || []).some(function (c) { return c.assunto && c.assunto.chave === r.chave; }); });
    if (s.tipo === 'revisao' && soMarcados.length) {
      partes.push('Revistos: ' + soMarcados.map(function (r) { return r.nome; }).join(', '));
    }
    return partes.join('; ') || '—';
  }

  var TIPOS = { teoria: ['Teoria', 'info'], questoes: ['Questões', 'neutro'], revisao: ['Revisão', 'aviso'], anki: ['Anki', 'anki'] };
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
    abrir: abrir, historico: historico, iniciarCronometro: iniciarCronometro, cronometroAtivo: function () { return !!cron; },
    descrever: descrever, seloTipo: seloTipo, confirmarExclusao: confirmarExclusao
  };
})();
