// "Lançar estudo": formulário da sessão de estudo, cronômetro e histórico.
var Sessao = (function () {
  var el = UI.el;

  // ---------- Cronômetro (continua contando mesmo se a página for fechada) ----------
  var CHAVE_CRON = 'controle-estudos.cronometro';
  var cron = null;
  try { cron = JSON.parse(localStorage.getItem(CHAVE_CRON)); } catch (e) { cron = null; }

  function gravarCron(c, daNuvem) {
    cron = c;
    try {
      if (c) localStorage.setItem(CHAVE_CRON, JSON.stringify(c));
      else localStorage.removeItem(CHAVE_CRON);
    } catch (e) { /* segue só em memória */ }
    // Também na nuvem: o cronômetro aparece (e pode ser finalizado) em outro aparelho.
    if (!daNuvem && window.Nuvem && Nuvem.salvarCron) Nuvem.salvarCron(c);
    desenharCron();
  }
  // Mudança vinda de outro aparelho. Ao entrar, um cronômetro só deste aparelho (de antes) sobe para a nuvem em vez de sumir.
  if (window.Nuvem && Nuvem.ouvirCron) Nuvem.ouvirCron(function (remoto, primeiro) {
    if (JSON.stringify(remoto) === JSON.stringify(cron)) return;
    if (primeiro && !remoto && cron) { Nuvem.salvarCron(cron); return; }
    if (primeiro && remoto && cron && (cron.inicio || 0) + (cron.acumulado || 0) * 1000 > (remoto.inicio || 0) + (remoto.acumulado || 0) * 1000) { Nuvem.salvarCron(cron); return; }
    gravarCron(remoto, true);
  });

  function segundosCron() {
    if (!cron) return 0;
    return cron.acumulado + (cron.inicio ? Math.floor((Date.now() - cron.inicio) / 1000) : 0);
  }

  // ---------- Aviso de tempo (alarme suave; não para o cronômetro) ----------
  // cron.aviso: minutos (0 = sem aviso); cron.avisado: já tocou. Meta do ciclo: tempo planejado da vaga (sem ele, 1 h).
  // Cronômetro do topo: o tempo escolhido ao iniciar (o último fica lembrado).
  var CHAVE_AVISO = 'controle-estudos.cron-aviso';
  var AVISO_PADRAO = 60;
  var OPCOES_AVISO = [0, 30, 45, 60, 90, 120];

  function ultimoAviso() {
    var v = null;
    try { v = localStorage.getItem(CHAVE_AVISO); } catch (e) { /* sem armazenamento */ }
    return v === null || isNaN(Number(v)) ? AVISO_PADRAO : Number(v);
  }
  function lembrarAviso(min) { try { localStorage.setItem(CHAVE_AVISO, String(min)); } catch (e) { /* ok */ } }
  function avisoDaMeta() {
    var c = Dados.db.ciclo, it = c.itens[c.posicaoAtual];
    return (it && it.minutosPlanejados) || AVISO_PADRAO;
  }
  function fmtAviso(min) {
    if (!min) return 'Sem aviso';
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + 'h' + (m ? String(m).padStart(2, '0') : '') : m + ' min';
  }

  // Som "duas notas" (ding-dong ascendente), gerado no navegador: baixo e curto.
  var audio = null;
  function contextoAudio() {
    var A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    if (!audio) audio = new A();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }
  // O navegador só libera som depois de um clique: o primeiro clique na página já deixa o áudio pronto.
  document.addEventListener('pointerdown', function liberar() { contextoAudio(); document.removeEventListener('pointerdown', liberar); });
  function tocarAviso() {
    var ctx = contextoAudio();
    if (!ctx) return;
    var t = ctx.currentTime + 0.05;
    [[659, 0, 1.0], [988, 0.35, 1.4]].forEach(function (n) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = n[0];
      g.gain.setValueAtTime(0, t + n[1]);
      g.gain.linearRampToValueAtTime(0.16, t + n[1] + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + n[2]);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t + n[1]);
      o.stop(t + n[1] + n[2] + 0.05);
    });
  }

  function conferirAviso() {
    if (!cron || !cron.inicio || !cron.aviso || cron.avisado) return;
    if (segundosCron() < cron.aviso * 60) return;
    cron.avisado = true;
    gravarCron(cron);
    tocarAviso();
  }

  // Janela para escolher o tempo do aviso: ao iniciar pelo topo ou, com o cronômetro rodando, pelo sino.
  function escolherAviso(atual, titulo, textoBotao, aoEscolher) {
    var escolhido = atual;
    var outro = el('input', { type: 'number', min: 1, max: 600, step: 5, placeholder: 'min', class: 'aviso-outro',
      value: OPCOES_AVISO.indexOf(atual) < 0 ? atual : '', oninput: function () { escolhido = Math.max(1, Math.round(Number(outro.value) || 0)); marcar(); } });
    var chips = OPCOES_AVISO.map(function (min) {
      return el('button', { type: 'button', class: 'aviso-chip', text: fmtAviso(min), onclick: function () { escolhido = min; outro.value = ''; marcar(); } });
    });
    function marcar() { chips.forEach(function (b, i) { b.classList.toggle('ativo', OPCOES_AVISO[i] === escolhido); }); }
    marcar();
    UI.modal(titulo, [
      el('p', { class: 'modal-desc', text: 'Um som suave avisa quando o tempo chegar. O cronômetro continua contando.' }),
      el('div', { class: 'aviso-chips' }, chips.concat([el('label', { class: 'aviso-outro-rotulo' }, ['Outro: ', outro, ' min'])]))
    ], [
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: textoBotao, classe: 'btn-primario', acao: function () { lembrarAviso(escolhido); aoEscolher(escolhido); } }
    ]);
  }

  function mudarAviso() {
    escolherAviso(cron.aviso || 0, 'Aviso do cronômetro', 'Salvar', function (min) {
      cron.aviso = min;
      cron.avisado = !!min && segundosCron() >= min * 60; // tempo já passado: não toca de novo
      gravarCron(cron);
    });
  }

  function iniciarCron(contexto, aviso) {
    if (aviso == null) aviso = contexto && contexto.daMeta ? avisoDaMeta() : contexto && contexto.tipo === 'anki' ? 0 : ultimoAviso();
    gravarCron({ inicio: Date.now(), acumulado: 0, contexto: contexto || null, aviso: aviso, avisado: false });
  }
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
    atualizarTitulo();
    if (!cron) {
      caixa.appendChild(UI.botao('Cronômetro', function () {
        escolherAviso(ultimoAviso(), 'Iniciar cronômetro', 'Iniciar', function (min) { iniciarCron(null, min); });
      }, 'btn-secundario btn-cron', 'relogio'));
      var btnAnki = UI.botao('Anki', function () { abrirAnki({}); }, 'btn-secundario btn-cron', 'cartas');
      btnAnki.title = 'Registrar o tempo gasto no Anki';
      btnAnki.setAttribute('aria-label', 'Anki');
      caixa.appendChild(btnAnki);
      caixa.appendChild(UI.botao('+ Estudo extra', function () { abrir({}); }, 'btn-primario', null));
      return;
    }
    var anki = !!(cron.contexto && cron.contexto.tipo === 'anki');
    var d = cron.contexto && Dados.disciplina(cron.contexto.disciplinaId);
    var alcancou = !!(cron.aviso && cron.avisado);
    caixa.appendChild(el('div', { class: 'cron-ativo' + (cron.inicio ? ' rodando' : '') + (alcancou ? ' meta-ok' : '') }, [
      el('span', { class: 'cron-ponto' }),
      el('span', { class: 'cron-tempo', id: 'cron-tempo', text: UI.fmtDuracao(segundosCron()) }),
      alcancou ? el('span', { class: 'cron-meta-ok', text: 'meta ✓', title: 'Tempo de ' + fmtAviso(cron.aviso) + ' alcançado' }) : null,
      d || anki ? el('span', { class: 'cron-disc', text: anki ? 'Anki' : d.nome }) : null,
      el('button', { type: 'button', class: 'cron-btn cron-sino' + (cron.aviso ? '' : ' mudo'),
        title: cron.aviso ? 'Aviso em ' + fmtAviso(cron.aviso) + (alcancou ? ' (já tocou)' : '') + ': clique para mudar' : 'Sem aviso: clique para escolher um tempo',
        onclick: mudarAviso }, [UI.icone(cron.aviso ? 'sino' : 'sino-mudo'), cron.aviso ? el('span', { text: fmtAviso(cron.aviso) }) : null]),
      cron.inicio ? botaoMini('Pausar', pausarCron) : botaoMini('Retomar', retomarCron),
      botaoMini('Finalizar', finalizarCron, 'cron-finalizar', 'Finalizar e lançar o estudo'),
      botaoMini('✕', descartarCron, 'descartar', 'Descartar cronômetro')
    ]));
  }

  // Título da aba: "0:42:15 · Contabilidade" (pausado: "⏸ ..."); sem cronômetro, o título normal.
  var TITULO_BASE = document.title;
  function atualizarTitulo() {
    if (!cron) { document.title = TITULO_BASE; return; }
    var anki = !!(cron.contexto && cron.contexto.tipo === 'anki');
    var d = cron.contexto && Dados.disciplina(cron.contexto.disciplinaId);
    document.title = (cron.inicio ? '' : '⏸ ') + UI.fmtDuracao(segundosCron()) + ' · ' + (anki ? 'Anki' : d ? d.nome : 'Cronômetro');
  }

  setInterval(function () {
    if (!cron || !cron.inicio) return;
    var t = document.getElementById('cron-tempo');
    if (t) t.textContent = UI.fmtDuracao(segundosCron());
    atualizarTitulo();
    conferirAviso();
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
        ? existente.cadernos.filter(function (c) { return !c.assunto; }).map(function (c) { return { cadernoId: c.cadernoId || '', acertos: c.acertos, erros: c.erros, finalizado: !!c.finalizado, rodada: c.rodada || null, totalRodada: c.totalRodada || '', legado: !c.rodada, pdf: c.pdf || null }; })
        : op.pdf ? [{ cadernoId: '', acertos: '', erros: '', pdf: { chave: op.pdf.chave, parte: op.pdf.parte }, pdfTitulo: op.pdf.titulo, pdfQtd: op.pdf.qtd }]
        : (op.cadernoIds || []).map(function (id) { return { cadernoId: id, acertos: '', erros: '' }; }),
      segundos: existente ? existente.segundos : (op.segundos || 0),
      concluir: true,
      resumo: existente ? !!existente.resumo : !!op.resumo,
      // Páginas lidas de cada aula PDF nesta sessão.
      paginas: existente ? Object.assign({}, existente.paginas || {}) : {}, paginasAuto: {},
      // Revisão: questões avulsas por ponto fraco { chave: { nome, acertos, erros } }
      assuntos: {}
    };
    if (existente) existente.cadernos.forEach(function (c) {
      if (c.assunto) est.assuntos[c.assunto.chave] = { nome: c.assunto.nome, acertos: c.acertos, erros: c.erros, finalizado: !!c.finalizado };
    });
    if (!est.linhas.length) est.linhas.push({ cadernoId: '', acertos: '', erros: '' });

    var data = el('input', { type: 'date', value: existente ? existente.data : UI.hoje(), max: UI.hoje() });
    var disciplina = el('select', { onchange: function () {
      est.disciplinaId = disciplina.value;
      est.topicoIds = [];
      est.aulaIds = [];
      est.paginas = {};
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
        if (!est.resumo && Dados.progressoTeoria(est.disciplinaId).total && !est.aulaIds.length) return mostrarErro('Marque a(s) aula(s) estudada(s).');
        campos.resumo = est.resumo;
        campos.aulaIds = est.aulaIds;
        campos.paginas = est.paginas;
        for (var ip = 0; ip < est.aulaIds.length; ip++) {
          var xa = Dados.aula(est.aulaIds[ip]), np = Number(est.paginas[est.aulaIds[ip]]) || 0;
          if (!xa || !np) continue;
          var la = Dados.leituraAula(Object.assign({}, xa.aula, { concluido: false }), est.sessaoId);
          if (la.total && la.lidas + np > la.total) return mostrarErro(Dados.nomeAula(xa.aula) + ' tem ' + la.total + ' páginas e ' + la.lidas + ' já foram lidas: informe no máximo ' + (la.total - la.lidas) + '.');
        }
        campos.topicoIds = est.topicoIds; // sessões antigas guardam os tópicos estudados
      } else {
        // Caderno de favoritadas pode ser finalizado mesmo sem questões (quando ele está vazio).
        var linhas = est.linhas.filter(function (l) { return (Number(l.acertos) || 0) + (Number(l.erros) || 0) > 0 || (l.finalizado && l.cadernoId) || l.pdf; });
        var porAssunto = [];
        if (est.tipo === 'revisao') {
          for (var ch in est.assuntos) {
            var a = est.assuntos[ch];
            if ((Number(a.acertos) || 0) + (Number(a.erros) || 0) > 0 || a.finalizado) porAssunto.push({ cadernoId: null, acertos: a.acertos, erros: a.erros, assunto: { chave: ch, nome: a.nome }, finalizado: !!a.finalizado });
          }
          if (!linhas.length && !porAssunto.length) return mostrarErro('Informe os acertos e erros de pelo menos um assunto.');
          // Assunto com o caderno terminado conta como revisto: sai das recomendações até chegar o histórico do mês.
          campos.revisados = porAssunto.filter(function (l) { return l.finalizado; }).map(function (l) { return l.assunto; })
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
        // Aulas com páginas só ficam concluídas quando as páginas lidas chegam ao total.
        est.aulaIds.forEach(function (id) { var x = Dados.aula(id); if (x && !x.aula.concluido && !Dados.totalPaginas(x.aula)) Dados.definirAulaConcluida(id, true, data.value); });
      }
      if (est.tipo === 'teoria') {
        Dados.concluirLidas(est.aulaIds, data.value);
        // A leitura do dia já foi lançada: a próxima começa de novo pelo leitor.
        if (window.Leitor) est.aulaIds.forEach(function (id) { if (est.paginas[id]) Leitor.limparLeitura(id); });
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
    // Leitura do resumo (Modo Revisão): não há aulas para marcar.
    if (est.resumo) return el('div', { class: 'aviso-suave' }, ['Leitura do resumo da matéria. ', el('a', { href: '#/resumos/' + est.disciplinaId, text: 'Abrir o resumo', onclick: function (e) { var f = e.target.closest('.modal-fundo'); if (f) f.remove(); } }), ' (fecha este formulário). Ao lançar, a etapa fica concluída.']);
    var blocos = Dados.blocosDe(est.disciplinaId).filter(function (b) { return Dados.aulasDe(b.id).length; });
    // Meta de teoria: só o bloco da meta aparece.
    if (est.aulasMeta && est.aulasMeta.length) {
      blocos = blocos.filter(function (b) { return Dados.aulasDe(b.id).some(function (a) { return est.aulasMeta.indexOf(a.id) >= 0; }); });
    }
    if (!blocos.length) {
      return el('p', { class: 'aviso-suave', text: 'Esta disciplina ainda não tem aulas. Cadastre-as nos blocos do Controle de Teoria para registrar o que foi estudado.' });
    }
    // Páginas sugeridas para um PDF: as páginas de uma meta (Configurações) ou, sem elas, tudo o que falta.
    function leitura(a) { return Dados.leituraAula(Object.assign({}, a, { concluido: false }), est.sessaoId); }
    // Leitura feita hoje no leitor de PDF: as páginas vistas além do que já estava lido (só as de teoria contam).
    // Com o marcador de continuidade: lido do começo que faltava até a página antes do marcador
    // (marcador na p. 20 depois de já lidas 1–9 = da 10ª à 19ª).
    function peloLeitor(a) {
      var l = leitura(a), m = window.Leitor && Leitor.marcador && Leitor.marcador(a.id);
      if (m && l.total) {
        var fim = Math.min(m.pagina - 1, l.total);
        if (fim >= l.inicio) return { de: l.inicio, ate: fim, n: fim - l.inicio + 1, marcador: m.pagina };
      }
      var r = window.Leitor && Leitor.leituraDoDia(a.id);
      if (!r || !l.total || r.ate < l.inicio) return null;
      var ate = Math.min(r.ate, l.total);
      return { de: l.inicio, ate: ate, n: ate - l.inicio + 1 };
    }
    function sugestao(a) { var p = peloLeitor(a); if (p) return p.n; var l = leitura(a), ppm = Dados.paginasPorMeta(); return ppm ? Math.min(ppm, l.faltam) : l.faltam; }
    est.aulaIds.forEach(function (id) {
      var x = Dados.aula(id);
      if (x && Dados.totalPaginas(x.aula) && est.paginas[id] == null && !est.sessaoId) { est.paginas[id] = sugestao(x.aula) || ''; est.paginasAuto[id] = true; }
    });
    var lista = el('div', { class: 'lista-topicos' }, blocos.map(function (b) {
      return el('div', { class: 'grupo-topicos' }, [
        el('div', { class: 'grupo-titulo', text: b.nome }),
        Dados.aulasDe(b.id).map(function (a) {
          var marcado = est.aulaIds.indexOf(a.id) >= 0, total = Dados.totalPaginas(a);
          var caixaPag = el('div', { class: 'aula-paginas-lidas' });
          function desenharPag() {
            caixaPag.innerHTML = '';
            caixaPag.style.display = total && est.aulaIds.indexOf(a.id) >= 0 ? '' : 'none';
            if (!total) return;
            var l = leitura(a);
            caixaPag.appendChild(el('span', { text: 'Páginas lidas' }));
            caixaPag.appendChild(el('input', { type: 'number', min: 0, max: l.faltam, step: 1, value: est.paginas[a.id] || '', 'aria-label': 'Páginas lidas de ' + Dados.nomeAula(a),
              oninput: function (e) { est.paginas[a.id] = e.target.value; delete est.paginasAuto[a.id]; } }));
            caixaPag.appendChild(el('span', { class: 'data-fraca', text: l.lidas ? 'já lidas ' + l.lidas + ' de ' + total + ' (falta da ' + l.inicio + 'ª à ' + total + 'ª)' : 'de ' + total + ' páginas' }));
            var pl = peloLeitor(a);
            if (pl) caixaPag.appendChild(el('span', { class: 'aula-pelo-leitor', text: (pl.marcador ? 'pelo marcador (p. ' + pl.marcador + '): ' : 'pelo leitor: ') + 'da ' + pl.de + 'ª à ' + pl.ate + 'ª' }));
            if (PdfsDados.temPdf(a.id)) caixaPag.appendChild(el('a', { class: 'link', href: '#/leitor/' + a.id + '/' + l.inicio, text: 'Ler', title: 'Abre o PDF (fecha este formulário)', onclick: function () { var f = caixaPag.closest('.modal-fundo'); if (f) f.remove(); } }));
          }
          desenharPag();
          // A leitura pode ter sido feita no leitor de outro aparelho: busca na nuvem e atualiza a sugestão (se você não digitou).
          if (total && window.Leitor && Leitor.trazerLeitura) Leitor.trazerLeitura(a.id).then(function () {
            if (est.aulaIds.indexOf(a.id) >= 0 && est.paginasAuto[a.id] && !est.sessaoId) est.paginas[a.id] = sugestao(a) || '';
            desenharPag();
          });
          return el('div', { class: 'opcao-aula' }, [
            el('label', { class: 'opcao-topico' + (a.concluido ? ' ja-concluido' : '') }, [
              el('input', { type: 'checkbox', checked: marcado, onchange: function (e) {
                if (e.target.checked) { est.aulaIds.push(a.id); if (total && !est.paginas[a.id]) { est.paginas[a.id] = sugestao(a) || ''; est.paginasAuto[a.id] = true; } }
                else { est.aulaIds = est.aulaIds.filter(function (x) { return x !== a.id; }); delete est.paginas[a.id]; }
                desenharPag();
              } }),
              el('span', { text: Dados.nomeAula(a) + (a.curso ? ' · ' + a.curso : '') + (total ? ' · ' + total + ' págs.' : '') }),
              a.concluido ? UI.selo('Concluída', 'sucesso') : null
            ]),
            caixaPag
          ]);
        })
      ]);
    }));
    var concluir = el('label', { class: 'opcao-check' }, [
      el('input', { type: 'checkbox', checked: est.concluir, onchange: function (e) { est.concluir = e.target.checked; } }),
      'Marcar as aulas selecionadas como concluídas (os PDFs com páginas ficam concluídos ao chegar à última página)'
    ]);
    return [UI.campo('Aula(s) estudada(s)', lista), concluir];
  }

  // Revisão: pontos fracos da disciplina (das Estatísticas), com acertos e erros lançados por assunto
  // (sem caderno). Os já revistos ficam no fim da lista. Abaixo, outras questões opcionais com caderno.
  function areaRevisao(est, redesenhar) {
    var todos = window.Estatisticas ? Estatisticas.pontosFracos(est.disciplinaId) : [];
    // Os 3 assuntos da meta (etapa de pontos fracos do Modo Revisão) vêm primeiro, com "Terminei o caderno".
    var plano = Dados.modoDeEstudo(est.disciplinaId).modo === 'revisao' ? Dados.planoRevisao(est.disciplinaId) : null;
    var trio = plano && plano.etapa === 'fracos' ? plano.trio.filter(function (a) { return !a.concluido || est.assuntos[a.chave]; }) : [];
    var naMeta = {};
    trio.forEach(function (a) { naMeta[a.chave] = true; });
    // Fora da meta: os outros pontos fracos (opcionais). Na meta travada, só os da meta.
    var fracos = trio.map(function (a) { return Object.assign({}, a, { meta: true }); })
      .concat(est.travado && trio.length ? [] : todos.filter(function (t) { return !naMeta[t.chave]; }));
    // Assuntos já lançados nesta sessão aparecem mesmo que tenham saído das Estatísticas.
    Object.keys(est.assuntos).forEach(function (ch) {
      if (!fracos.some(function (t) { return t.chave === ch; })) fracos.push({ chave: ch, nome: est.assuntos[ch].nome, caminho: [], revisto: true });
    });
    fracos.sort(function (a, b) { return (!!b.meta - !!a.meta) || ((!!a.revisto && !est.assuntos[a.chave]) - (!!b.revisto && !est.assuntos[b.chave])); });
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
      lista = el('div', { class: 'lista-assuntos' }, fracos.map(function (t, i) {
        var v = est.assuntos[t.chave] || { nome: t.nome, acertos: '', erros: '', finalizado: false };
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
        var titulo = t.meta && (i === 0) ? el('div', { class: 'assuntos-grupo', text: 'Assuntos da meta · um caderno de 10 a 15 questões de cada' })
          : !t.meta && i > 0 && fracos[i - 1].meta ? el('div', { class: 'assuntos-grupo', text: 'Outros pontos fracos (opcional)' }) : null;
        var terminei = t.meta ? el('label', { class: 'opcao-check assunto-terminei', title: 'O assunto sai da meta e só volta a ser avaliado com o histórico do mês' }, [
          el('input', { type: 'checkbox', checked: !!v.finalizado, onchange: function (e) { v.finalizado = e.target.checked; est.assuntos[t.chave] = v; } }),
          'Terminei o caderno'
        ]) : null;
        return el('div', null, [titulo, el('div', { class: 'assunto-linha' + (t.meta ? ' assunto-meta' : '') + (t.revisto && !est.assuntos[t.chave] ? ' revisto' : '') }, [
          el('div', { class: 'revisao-assunto' }, [
            el('span', { class: 'revisao-nome', text: t.nome }),
            t.caminho && t.caminho.length ? el('span', { class: 'revisao-caminho', text: t.caminho.join(' › ') }) : null,
            t.revisto && !est.assuntos[t.chave] ? el('span', { class: 'revisao-caminho', text: 'já revisto' }) : null
          ]),
          t.pctErro != null && t.feitas != null ? Estatisticas.seloErro(t) : null,
          numero('acertos', 'Acertos'),
          numero('erros', 'Erros'),
          terminei
        ])]);
      }));
    }
    atualizarTotal();

    return [
      el('div', { class: 'campo' }, [
        el('div', { class: 'revisao-cabecalho' }, [el('span', { class: 'campo-rotulo', text: 'Questões por assunto (pontos fracos das Estatísticas)' }), total]),
        lista,
        fracos.length ? el('span', { class: 'campo-ajuda', text: 'Lance quantas questões resolveu de cada assunto. Marque "Terminei o caderno" quando concluir o assunto: ele sai da meta e só volta a ser avaliado com o histórico do mês; se continuar fraco, pode voltar a ser recomendado.' }) : null
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
      // Questões do próprio PDF (Modo Leitura sem TEC): a etapa vem da meta e é concluída ao lançar.
      if (l.pdf) {
        var num = function (campo, rotulo) { return el('label', { class: 'campo-num' }, [el('span', { class: 'campo-rotulo', text: rotulo }),
          el('input', { type: 'number', min: 0, step: 1, value: l[campo], oninput: function (e) { l[campo] = e.target.value; atualizarTotal(); } })]); };
        return el('div', { class: 'linha-caderno-grupo' }, [
          el('div', { class: 'linha-caderno' }, [
            el('div', { class: 'campo' }, [el('span', { class: 'campo-rotulo', text: 'Questões do PDF' }), el('strong', { class: 'linha-pdf-titulo', text: l.pdfTitulo || ('Questões ' + Dados.nomeParte(l.pdf.parte)) })]),
            num('acertos', 'Acertos'), num('erros', 'Erros')
          ]),
          el('span', { class: 'campo-ajuda', text: (l.pdfQtd ? l.pdfQtd + (l.pdfQtd === 1 ? ' questão errada para refazer. ' : ' questões erradas para refazer. ') : '') + 'Ao lançar, esta etapa fica concluída; os erros entram na etapa das erradas.' })
        ]);
      }
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
    if (s.tipo === 'teoria' && s.resumo) return 'Leitura do resumo';
    if (s.tipo === 'teoria') {
      var aulas = (s.aulaIds || []).map(function (id) {
        var x = Dados.aula(id), p = s.paginas && Number(s.paginas[id]);
        return x ? Dados.nomeAula(x.aula) + (p ? ' (' + p + (p === 1 ? ' pág.)' : ' págs.)') : '') : '';
      });
      return aulas.concat((s.topicoIds || []).map(function (id) { var t = Dados.topico(id); return t ? t.nome : ''; })).filter(Boolean).join('; ') || '—';
    }
    var partes = (s.cadernos || []).map(function (c) {
      var cad = Dados.caderno(c.cadernoId);
      var nome = c.assunto ? c.assunto.nome : c.pdf ? Dados.tituloPdf(c.pdf.chave) + ' (PDF)' : cad ? cad.nome : 'Avulsas';
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
