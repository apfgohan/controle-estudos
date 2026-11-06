// Dashboard: próxima matéria do ciclo, indicadores, ciclo de estudos, gráficos e revisões.
var Dashboard = (function () {
  var el = UI.el;
  var SEMANAS = 8;

  // ---------- Datas e somatórios ----------
  function inicioSemana(iso) { // semanas começam na segunda-feira
    var d = new Date(iso + 'T00:00:00');
    return UI.somarDias(iso, -((d.getDay() + 6) % 7));
  }

  function fmtHoras(seg) {
    var min = Math.round((seg || 0) / 60);
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + 'min';
    return h + 'h' + (m ? String(m).padStart(2, '0') : '');
  }

  function fmtMinutos(min) { return min ? fmtHoras(min * 60) : ''; }

  function resumoPeriodo(de, ate) {
    var r = { segundos: 0, teoria: 0, questoes: 0, acertos: 0, erros: 0 };
    Dados.db.sessoes.forEach(function (s) {
      if (s.data < de || s.data > ate) return;
      r.segundos += s.segundos || 0;
      if (s.tipo === 'teoria') r.teoria += s.segundos || 0;
      else r.questoes += s.segundos || 0;
      (s.cadernos || []).forEach(function (c) { r.acertos += c.acertos; r.erros += c.erros; });
    });
    r.feitas = r.acertos + r.erros;
    r.pct = r.feitas ? r.acertos / r.feitas * 100 : 0;
    return r;
  }

  // ---------- Períodos dos gráficos (dia, semana, mês) ----------
  var DIAS = 7, MESES = 6;
  var PERIODOS = {
    dia: { nome: 'Dia', titulo: 'por dia', sub: 'Últimos ' + DIAS + ' dias' },
    semana: { nome: 'Semana', titulo: 'por semana', sub: 'Últimas ' + SEMANAS + ' semanas' },
    mes: { nome: 'Mês', titulo: 'por mês', sub: 'Últimos ' + MESES + ' meses' }
  };
  var CHAVE_PERIODO = 'controle-estudos.periodo-graficos';

  function periodoSalvo(grafico) {
    try { var p = JSON.parse(localStorage.getItem(CHAVE_PERIODO) || '{}')[grafico]; return PERIODOS[p] ? p : 'semana'; }
    catch (e) { return 'semana'; }
  }
  function salvarPeriodo(grafico, tipo) {
    try {
      var tudo = JSON.parse(localStorage.getItem(CHAVE_PERIODO) || '{}');
      tudo[grafico] = tipo;
      localStorage.setItem(CHAVE_PERIODO, JSON.stringify(tudo));
    } catch (e) { /* preferência só de conveniência */ }
  }

  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function semPonto(t) { t = t.replace('.', ''); return t.charAt(0).toUpperCase() + t.slice(1); }

  // Lista de intervalos do mais antigo ao atual: [{ de, ate, rotulo, nome, ...resumoPeriodo }]
  function periodos(tipo) {
    var lista = [], hoje = UI.hoje(), i, r;
    if (tipo === 'dia') {
      for (i = DIAS - 1; i >= 0; i--) {
        var dia = UI.somarDias(hoje, -i);
        var d = new Date(dia + 'T00:00:00');
        r = resumoPeriodo(dia, dia);
        r.rotulo = semPonto(d.toLocaleDateString('pt-BR', { weekday: 'short' }));
        r.nome = (i === 0 ? 'Hoje' : semPonto(d.toLocaleDateString('pt-BR', { weekday: 'long' }))) + ', ' + UI.fmtData(dia).slice(0, 5);
        lista.push(r);
      }
    } else if (tipo === 'mes') {
      var agora = new Date(hoje + 'T00:00:00');
      for (i = MESES - 1; i >= 0; i--) {
        var ini = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
        var fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 0);
        r = resumoPeriodo(iso(ini), iso(fim));
        r.rotulo = semPonto(ini.toLocaleDateString('pt-BR', { month: 'short' }));
        r.nome = semPonto(ini.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
        lista.push(r);
      }
    } else {
      var seg = inicioSemana(hoje);
      for (i = SEMANAS - 1; i >= 0; i--) {
        var de = UI.somarDias(seg, -7 * i);
        r = resumoPeriodo(de, UI.somarDias(de, 6));
        r.rotulo = UI.fmtData(de).slice(0, 5);
        r.nome = 'Semana de ' + r.rotulo;
        lista.push(r);
      }
    }
    return lista;
  }

  // ---------- Dica flutuante (tooltip) ----------
  var dica = null;
  function mostrarDica(alvo, linhas) {
    if (!dica) { dica = el('div', { class: 'dica', role: 'tooltip' }); document.body.appendChild(dica); }
    dica.innerHTML = '';
    linhas.forEach(function (l, i) { dica.appendChild(el('div', { class: i === 0 ? 'dica-titulo' : '', text: l })); });
    dica.style.display = 'block';
    var r = alvo.getBoundingClientRect();
    var larg = dica.offsetWidth;
    var x = Math.min(Math.max(8, r.left + r.width / 2 - larg / 2), window.innerWidth - larg - 8);
    var y = r.top - dica.offsetHeight - 8;
    if (y < 8) y = r.bottom + 8;
    dica.style.left = x + 'px';
    dica.style.top = y + 'px';
  }
  function esconderDica() { if (dica) dica.style.display = 'none'; }
  window.addEventListener('scroll', esconderDica, true);

  function comDica(n, linhas) {
    n.setAttribute('tabindex', '0');
    n.setAttribute('aria-label', linhas.join('. '));
    n.addEventListener('mouseenter', function () { mostrarDica(n, linhas); });
    n.addEventListener('focus', function () { mostrarDica(n, linhas); });
    n.addEventListener('mouseleave', esconderDica);
    n.addEventListener('blur', esconderDica);
    return n;
  }

  // ---------- Gráficos ----------
  // Colunas verticais (uma série). itens: [{ rotulo, valor, textoValor, dica: [linhas], pct? }]
  // Com comLinha, desenha por cima a linha de % de acerto (eixo 0–100% à direita).
  function graficoColunas(itens, vazio, comLinha) {
    var max = Math.max.apply(null, itens.map(function (i) { return i.valor; }).concat([0]));
    if (!max) return el('div', { class: 'grafico-vazio', text: vazio });
    var ultimo = itens.length - 1;
    var colunas = el('div', { class: 'colunas' }, itens.map(function (it, i) {
      var altura = it.valor ? Math.max(2, it.valor / max * 100) : 0;
      return comDica(el('div', { class: 'coluna' + (i === ultimo ? ' atual' : '') }, [
        el('div', { class: 'coluna-area' }, [
          // rótulo só na semana atual e na maior (rótulos seletivos)
          (i === ultimo || it.valor === max) && it.valor ? el('div', { class: 'coluna-valor', text: it.textoValor, style: { bottom: altura + '%' } }) : null,
          el('div', { class: 'coluna-barra', style: { height: altura + '%' } })
        ]),
        el('div', { class: 'coluna-rotulo', text: it.rotulo })
      ]), it.dica);
    }));
    if (!comLinha) return colunas;
    colunas.appendChild(camadaLinha(itens));
    return el('div', { class: 'combo' }, [
      colunas,
      el('div', { class: 'eixo-dir' }, el('div', { class: 'eixo-area' }, [100, 75, 50, 25, 0].map(function (v) {
        return el('span', { text: v + '%', style: { top: (100 - v) + '%' } });
      })))
    ]);
  }

  // Linha suave ligando os períodos que têm questões (períodos sem questões interrompem a linha).
  function camadaLinha(itens) {
    var n = itens.length, d = '', ant = null;
    var pontos = itens.map(function (it, i) {
      return it.pct == null ? null : { x: (i + 0.5) / n * 100, y: 100 - it.pct };
    });
    pontos.forEach(function (p) {
      if (!p) { ant = null; return; }
      if (!ant) d += 'M' + p.x + ' ' + p.y;
      else {
        var meio = (p.x - ant.x) / 2;
        d += 'C' + (ant.x + meio) + ' ' + ant.y + ' ' + (p.x - meio) + ' ' + p.y + ' ' + p.x + ' ' + p.y;
      }
      ant = p;
    });
    var camada = el('div', { class: 'linha-camada', 'aria-hidden': 'true' }, [
      el('div', { class: 'linha-grade', style: { top: '0' } }),
      el('div', { class: 'linha-grade', style: { top: '50%' } })
    ]);
    var svg = el('div', { class: 'linha-svg' });
    svg.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="' + d + '" vector-effect="non-scaling-stroke"/></svg>';
    camada.appendChild(svg);
    pontos.forEach(function (p) {
      if (p) camada.appendChild(el('span', { class: 'linha-ponto', style: { left: p.x + '%', top: p.y + '%' } }));
    });
    return camada;
  }

  // Cartão com alternador Dia | Semana | Mês; só o conteúdo do cartão é redesenhado ao trocar.
  // montar(tipo) devolve { conteudo, legenda: [nós] }
  function cartaoPeriodo(grafico, titulo, montar) {
    var tipo = periodoSalvo(grafico);
    var cartao = el('section', { class: 'painel cartao-grafico' });
    function desenhar() {
      var p = PERIODOS[tipo], m = montar(tipo);
      cartao.innerHTML = '';
      cartao.appendChild(el('div', { class: 'grafico-topo' }, [
        el('div', null, [
          el('h2', { class: 'secao-titulo', text: titulo + ' ' + p.titulo }),
          el('span', { class: 'data-fraca', text: p.sub })
        ]),
        el('div', { class: 'alternar', role: 'group', 'aria-label': 'Agrupar por' }, Object.keys(PERIODOS).map(function (k) {
          return el('button', {
            type: 'button', class: k === tipo ? 'ativo' : '', text: PERIODOS[k].nome, 'aria-pressed': String(k === tipo),
            onclick: function () { if (k === tipo) return; tipo = k; salvarPeriodo(grafico, k); esconderDica(); desenhar(); }
          });
        }))
      ]));
      if (m.legenda) cartao.appendChild(el('div', { class: 'legenda' }, m.legenda));
      cartao.appendChild(m.conteudo);
    }
    desenhar();
    return cartao;
  }

  function itemLegenda(classe, texto, valor) {
    return el('span', { class: 'legenda-item' }, [el('span', { class: 'legenda-marca ' + classe }), texto, valor ? el('strong', { text: valor }) : null]);
  }

  // Barras horizontais por disciplina. itens: [{ nome, cor, pct, texto, dica }]
  function graficoBarras(itens, vazio) {
    if (!itens.length) return el('div', { class: 'grafico-vazio', text: vazio });
    return el('div', { class: 'barras-h' }, itens.map(function (it) {
      return comDica(el('div', { class: 'barra-h' }, [
        el('div', { class: 'barra-h-nome' }, [el('span', { class: 'bolinha', style: { background: it.cor } }), el('span', { text: it.nome })]),
        el('div', { class: 'barra-h-trilho' }, el('div', { class: 'barra-h-valor', style: { width: Math.max(it.pct ? 1 : 0, it.pct) + '%' } })),
        el('div', { class: 'barra-h-texto', text: it.texto })
      ]), it.dica);
    }));
  }

  function cartaoGrafico(titulo, subtitulo, conteudo) {
    return el('section', { class: 'painel cartao-grafico' }, [
      el('div', { class: 'grafico-topo' }, [
        el('h2', { class: 'secao-titulo', text: titulo }),
        subtitulo ? el('span', { class: 'data-fraca', text: subtitulo }) : null
      ]),
      conteudo
    ]);
  }

  // ---------- Próxima matéria ----------
  function cartaoProxima() {
    var c = Dados.db.ciclo;
    var item = Dados.proximaDoCiclo();
    if (!item) {
      return el('section', { class: 'painel proxima vazia' }, [
        el('div', { class: 'rotulo-secao', text: 'Próxima matéria' }),
        el('p', { class: 'vazio-destaque', text: 'Monte seu ciclo de estudos' }),
        el('p', { class: 'data-fraca', text: 'Defina a sequência de matérias (pode repetir) e o programa mostra aqui qual é a próxima. Cada estudo lançado da matéria da vez avança o ciclo.' }),
        Dados.disciplinas().length
          ? UI.botao('Montar ciclo', editarCiclo, 'btn-primario')
          : el('a', { class: 'btn btn-primario', href: '#/teoria', text: 'Cadastrar disciplinas primeiro' })
      ]);
    }
    var d = Dados.disciplina(item.disciplinaId);
    var p = Dados.progressoTeoria(d.id);
    var q = Dados.statsQuestoes(d.id);
    var anot = Dados.ultimaAnotacao(d.id);
    var revisoes = Dados.revisoesPendentes(d.id).filter(function (t) { return t.revisaoAgendada <= UI.hoje(); }).length;
    var modo = Dados.modoDeEstudo(d.id);

    return el('section', { class: 'painel proxima', style: { borderTopColor: d.cor } }, [
      el('div', { class: 'proxima-topo' }, [
        el('div', { class: 'rotulo-secao', text: 'Próxima matéria' }),
        el('span', { class: 'data-fraca', text: (c.posicaoAtual + 1) + 'º de ' + c.itens.length + ' no ciclo · volta ' + ((c.voltas || 0) + 1) })
      ]),
      el('div', { class: 'proxima-nome' }, [
        el('span', { class: 'proxima-cor', style: { background: d.cor } }),
        el('h2', { class: 'materia-clicavel', text: d.nome, tabindex: '0', role: 'button', title: 'Ver o processo desta matéria',
          onclick: function () { verProcesso(d); },
          onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); verProcesso(d); } } }),
        seloModo(modo),
        item.minutosPlanejados ? el('span', { class: 'pilula', text: 'Meta: ' + fmtMinutos(item.minutosPlanejados) }) : null
      ]),
      el('div', { class: 'proxima-metricas' }, [
        UI.metrica('Teoria', UI.fmtPct(p.pct) + ' (' + p.feitos + '/' + p.total + ')'),
        el('div', { class: 'metrica' }, [el('div', { class: 'metrica-rotulo', text: 'Acerto' }), el('div', { class: 'metrica-valor' }, q.feitas ? [UI.acerto(q.pct, q.feitas), ' · ' + UI.fmtNum(q.feitas)] : '—')]),
        UI.metrica('Último estudo', UI.haQuanto(Dados.ultimoEstudo(d.id))),
        UI.metrica('Revisões para hoje', revisoes ? String(revisoes) : '—', revisoes ? 'alerta' : '')
      ]),
      recomendacao(d, modo),
      anot ? UI.blocoAnotacao(anot, { teoria: 'Teoria', questoes: 'Questões', revisao: 'Revisão' }[anot.tipo]) : el('div', { class: 'sem-anotacao', text: 'Nenhuma anotação deixada na última sessão desta matéria.' }),
      el('div', { class: 'proxima-acoes' }, [
        UI.botao('Lançar estudo', function () { Sessao.abrir({ disciplinaId: d.id }); }, 'btn-primario', 'play'),
        UI.botao('Iniciar cronômetro', function () { Sessao.iniciarCronometro({ disciplinaId: d.id, tipo: 'teoria' }); }, 'btn-contorno', 'relogio'),
        UI.botao('Pular', function () { Dados.avancarCiclo(1); App.atualizar(); }, 'btn-secundario'),
        el('span', { class: 'proxima-links' }, [
          el('button', { type: 'button', class: 'link', text: 'Ver teoria', onclick: function () { verTeoria(d); } }), ' · ',
          el('button', { type: 'button', class: 'link', text: 'Ver cadernos', onclick: function () { verCadernos(d); } }), ' · ',
          el('button', { type: 'button', class: 'link', text: 'Ver processo', onclick: function () { verProcesso(d); } })
        ])
      ])
    ]);
  }

  // Modo Leitura (teoria + baterias dos Cadernos de Teoria + baterias de erros) enquanto não terminar;
  // depois, Modo Revisão com os pontos fracos das Estatísticas.
  // O Modo Revisão vale quando o Modo Leitura termina ou quando foi escolhido antes, na aba Teoria.
  function recomendacao(d, modo) {
    if (modo.modo === 'revisao') return recomendacaoRevisao(d);
    return modo.plano.blocos ? recomendacaoLeitura(d, modo.plano) : null;
  }

  function seloModo(modo) {
    return modo.modo === 'revisao'
      ? el('span', { class: 'selo-modo revisao', title: modo.escolhido ? 'Modo Revisão escolhido na aba Teoria (o Modo Leitura não foi concluído)' : 'Teoria e todas as baterias concluídas' }, 'Modo Revisão')
      : el('span', { class: 'selo-modo leitura', title: 'Teoria e baterias de questões em andamento' }, 'Modo Leitura');
  }

  function textoEtapa(it) {
    if (it.tipo === 'teoria') return 'Estudar Teoria do ' + it.bloco.nome;
    if (it.tipo === 'favoritas') {
      var alvo = it.grupo === 'duvidas' ? 'em que fiquei em dúvida' : 'que errei 2x ou mais';
      var resta = it.qtd ? it.qtd - it.feitas : 0;
      return it.feitas && resta > 0
        ? 'Terminar ' + (resta === 1 ? 'a questão restante' : 'as ' + resta + ' questões restantes') + ' das favoritadas ' + alvo
        : 'Resolver as questões favoritadas ' + alvo;
    }
    if (it.tipo === 'erros') return 'Realizar a bateria de erros ' + (it.par.blocos.length === 1 ? 'do ' : 'dos ') + Dados.nomePar(it.par);
    return 'Realizar a ' + it.numero + 'ª bateria de questões do ' + it.bloco.nome;
  }

  function linkCaderno(c) {
    return c.link
      ? el('a', { class: 'rec-caderno', href: c.link, target: '_blank', rel: 'noopener noreferrer' }, [c.nome, UI.icone('externo', 'icone-pequeno')])
      : el('span', { class: 'rec-caderno', text: c.nome });
  }

  function textoFaltam(feitas, qtd, alvo) {
    var faltam = qtd - feitas;
    return 'Faltam ' + faltam + (faltam === 1 ? ' questão' : ' questões') + ' ' + alvo + (feitas ? ' (' + feitas + ' de ' + qtd + ' feitas)' : '');
  }

  function recomendacaoLeitura(d, plano) {
    var atual = plano.pendentes[0];
    var depois = plano.pendentes[1];
    var feitas = plano.itens.length - plano.pendentes.length;
    var detalhe, acao;

    if (atual.tipo === 'favoritas') {
      var cf = atual.caderno;
      if (!cf) {
        detalhe = el('p', { class: 'data-fraca' }, ['Ainda não há o caderno de ' + Dados.GRUPOS_FAVORITAS[atual.grupo].toLowerCase() + '. ',
          el('a', { href: '#/questoes/' + d.id, text: 'Cadastre-o na pasta "' + Dados.NOME_PASTA_FAVORITAS + '"' }), '.']);
      } else {
        detalhe = el('div', { class: 'rec-bateria' }, [
          el('div', { class: 'rec-bateria-linha' }, [linkCaderno(cf),
            el('span', { class: 'rec-faltam', text: atual.qtd ? textoFaltam(atual.feitas, atual.qtd, 'deste caderno') : 'Ao lançar, informe quantas questões o caderno tem agora' })]),
          atual.feitas && atual.qtd ? UI.barra(atual.feitas / atual.qtd * 100) : null,
          el('p', { class: 'data-fraca', text: 'Antes de iniciar a teoria do ' + atual.bloco.nome + '.' })
        ]);
        acao = [
          !atual.feitas ? UI.botao('Caderno sem questões', function () {
            Dados.marcarRodadaVazia(cf.id, atual.bloco.id, true);
            App.atualizar();
            UI.aviso('Rodada pulada. Para desfazer, vá ao caderno na aba Questões.');
          }, 'btn-secundario') : null,
          UI.botao('Lançar questões', function () { Sessao.abrir({ disciplinaId: d.id, tipo: 'questoes', cadernoIds: [cf.id] }); }, 'btn-primario', 'play')
        ];
      }
    } else if (atual.tipo === 'erros') {
      var ce = atual.caderno;
      if (!ce) {
        detalhe = el('p', { class: 'data-fraca' }, ['Monte no TecConcursos um caderno com as questões que você errou nas baterias ' +
          (atual.par.blocos.length === 1 ? 'deste bloco' : 'destes blocos') + ' e ',
          el('a', { href: '#/questoes/' + d.id, text: 'cadastre-o na pasta "' + Dados.NOME_PASTA_ERROS + '"' }), '.']);
      } else if (!atual.qtd) {
        detalhe = el('p', { class: 'data-fraca' }, ['Informe o total de questões do caderno "' + ce.nome + '" ',
          el('a', { href: '#/questoes/' + d.id, text: 'em Questões' }), '.']);
      } else {
        detalhe = el('div', { class: 'rec-bateria' }, [
          el('div', { class: 'rec-bateria-linha' }, [linkCaderno(ce), el('span', { class: 'rec-faltam', text: textoFaltam(atual.feitas, atual.qtd, 'de erros') })]),
          atual.feitas ? UI.barra(atual.feitas / atual.qtd * 100) : null
        ]);
        acao = UI.botao('Lançar questões', function () {
          Sessao.abrir({ disciplinaId: d.id, tipo: 'questoes', cadernoIds: [ce.id] });
        }, 'btn-primario', 'play');
      }
    } else if (atual.tipo === 'teoria') {
      var faltam = atual.topicos.filter(function (t) { return !t.concluido; });
      detalhe = atual.topicos.length
        ? el('ul', { class: 'rec-topicos' }, faltam.slice(0, 4).map(function (t) { return el('li', { text: t.nome }); })
            .concat(faltam.length > 4 ? [el('li', { class: 'data-fraca', text: '+ ' + (faltam.length - 4) + ' tópicos' })] : []))
        : el('p', { class: 'data-fraca', text: 'Este bloco ainda não tem tópicos. Cadastre-os no Controle de Teoria.' });
      acao = UI.botao('Lançar teoria', function () {
        Sessao.abrir({ disciplinaId: d.id, tipo: 'teoria', topicoIds: faltam.map(function (t) { return t.id; }) });
      }, 'btn-primario', 'play');
    } else if (!atual.caderno) {
      detalhe = el('p', { class: 'data-fraca' }, ['Este bloco ainda não tem caderno. ',
        el('a', { href: '#/questoes/' + d.id, text: 'Cadastre-o na pasta "' + Dados.NOME_PASTA_TEORIA + '"' }), '.']);
    } else if (!atual.bateria || !atual.bateria.qtd) {
      detalhe = el('p', { class: 'data-fraca' }, ['Informe o total de questões do caderno "' + atual.caderno.nome + '" ',
        el('a', { href: '#/questoes/' + d.id, text: 'em Questões' }), ' para dividir as baterias.']);
    } else {
      var b = atual.bateria, c = atual.caderno;
      detalhe = el('div', { class: 'rec-bateria' }, [
        el('div', { class: 'rec-bateria-linha' }, [linkCaderno(c), el('span', { class: 'rec-faltam', text: textoFaltam(b.feitas, b.qtd, 'desta bateria') })]),
        b.feitas ? UI.barra(b.feitas / b.qtd * 100) : null
      ]);
      acao = UI.botao('Lançar questões', function () {
        Sessao.abrir({ disciplinaId: d.id, tipo: 'questoes', cadernoIds: [c.id] });
      }, 'btn-primario', 'play');
    }

    return el('div', { class: 'recomendacao rec-' + TIPO_COR[atual.tipo] }, [
      el('div', { class: 'rec-topo' }, [
        UI.icone(atual.tipo === 'teoria' ? 'lista' : 'caderno2'),
        el('span', { class: 'rec-rotulo', text: 'Recomendação' })
      ]),
      el('div', { class: 'rec-principal' }, [
        el('strong', { class: 'rec-titulo', text: textoEtapa(atual) }),
        detalhe
      ]),
      acao ? el('div', { class: 'rec-rodape' }, acao) : null,
      el('div', { class: 'rec-depois' }, [
        el('span', { class: 'rec-depois-rotulo', text: 'Em seguida' }),
        el('span', { text: depois ? textoEtapa(depois) : 'Fim do Modo Leitura: a matéria passa para o Modo Revisão.' })
      ]),
      el('div', { class: 'rec-progresso data-fraca', text: feitas + ' de ' + plano.itens.length + ' etapas concluídas · ' + plano.numBaterias + ' baterias por bloco' })
    ]);
  }

  // ---------- Recomendação do Modo Revisão ----------
  // Ciclo: caderno de simulado → favoritadas (dúvidas, depois erradas 2x+) → pontos fracos → próximo simulado.
  // plano.simulado já é o caderno da vez (ou o próximo, quando a etapa atual é favoritadas ou fracos).
  function textoEtapaRevisao(etapa, plano) {
    if (etapa === 'simulado') {
      var c = plano.simulado;
      return c ?'Resolver o caderno de simulado "' + c.nome + '"' : 'Resolver um novo caderno de simulado';
    }
    if (etapa === 'duvidas') return 'Resolver as questões favoritadas em que fiquei em dúvida';
    if (etapa === 'erros2x') return 'Resolver as questões favoritadas que errei 2x ou mais';
    return 'Revisar os assuntos em que estou mais fraco';
  }

  function linkQuestoes(d, texto) { return el('a', { href: '#/questoes/' + d.id, text: texto }); }

  function recomendacaoRevisao(d) {
    var plano = Dados.planoRevisao(d.id);
    var etapa = plano.etapa, detalhe, acao;

    if (etapa === 'simulado') {
      var c = plano.simulado;
      if (!c) {
        detalhe = el('p', { class: 'data-fraca' }, [plano.simulados.length ? 'Todos os cadernos de simulado já foram resolvidos. ' : 'Ainda não há cadernos de simulado. ',
          linkQuestoes(d, 'Cadastre um novo na pasta "' + Dados.NOME_PASTA_SIMULADO + '"'), ' (de preferência com questões de todos os assuntos).']);
      } else if (!c.totalQuestoes) {
        detalhe = el('p', { class: 'data-fraca' }, ['Informe o total de questões do caderno "' + c.nome + '" ', linkQuestoes(d, 'em Questões'), '.']);
      } else {
        detalhe = el('div', { class: 'rec-bateria' }, [
          el('div', { class: 'rec-bateria-linha' }, [linkCaderno(c), el('span', { class: 'rec-faltam', text: textoFaltam(plano.simuladoFeitas, c.totalQuestoes, 'deste caderno') })]),
          plano.simuladoFeitas ? UI.barra(plano.simuladoFeitas / c.totalQuestoes * 100) : null,
          plano.somaSimulado || c.totalQuestoes < plano.minimoSimulado
            ? el('p', { class: 'data-fraca', text: 'Nesta volta: ' + plano.somaSimulado + ' de no mínimo ' + plano.minimoSimulado + ' questões de simulado concluídas' +
                (plano.somaSimulado + c.totalQuestoes < plano.minimoSimulado ? '. Depois deste caderno ainda virá outro simulado.' : '.') })
            : null
        ]);
        acao = UI.botao('Lançar questões', function () { Sessao.abrir({ disciplinaId: d.id, tipo: 'questoes', cadernoIds: [c.id] }); }, 'btn-primario', 'play');
      }
    } else if (etapa === 'duvidas' || etapa === 'erros2x') {
      var f = plano.favoritas[etapa];
      if (!f) {
        detalhe = el('p', { class: 'data-fraca' }, ['Ainda não há o caderno de ' + Dados.GRUPOS_FAVORITAS[etapa].toLowerCase() + '. ',
          linkQuestoes(d, 'Cadastre-o na pasta "' + Dados.NOME_PASTA_FAVORITAS + '"'), '.']);
      } else {
        detalhe = el('div', { class: 'rec-bateria' }, [
          el('div', { class: 'rec-bateria-linha' }, [linkCaderno(f), el('span', { class: 'rec-faltam', text: 'Resolva todas as questões do caderno' })]),
          el('p', { class: 'data-fraca', text: 'Ao lançar a sessão, marque "Finalizei este caderno" quando terminar. Até lá, ele continua sendo recomendado.' })
        ]);
        acao = UI.botao('Lançar questões', function () { Sessao.abrir({ disciplinaId: d.id, tipo: 'questoes', cadernoIds: [f.id] }); }, 'btn-primario', 'play');
      }
    } else {
      var pendentes = plano.fracos.filter(function (t) { return !t.revisto; });
      var nAssuntos = Object.keys(plano.fracosAssuntos).length;
      var progresso = Math.max(plano.fracosQuestoes / plano.metaQuestoes, plano.metaAssuntos ? nAssuntos / plano.metaAssuntos : 0);
      detalhe = el('div', { class: 'rec-bateria' }, [
        pendentes.length ? el('ul', { class: 'alerta-lista' }, pendentes.slice(0, 4).map(function (t) {
          return el('li', null, [Estatisticas.seloErro(t), el('span', { class: 'alerta-assunto', text: t.nome }), el('span', { class: 'data-fraca alerta-num', text: t.erros + ' erros em ' + t.feitas })]);
        }).concat(pendentes.length > 4 ? [el('li', { class: 'data-fraca', text: '+ ' + (pendentes.length - 4) + ' outros' })] : []))
          : el('p', { class: 'data-fraca', text: 'Todos os pontos fracos já foram revistos; lance questões de qualquer um deles.' }),
        el('span', { class: 'rec-faltam', text: 'Termina com ' + plano.metaQuestoes + ' questões (' + plano.fracosQuestoes + ' feitas) ou ' +
          plano.metaAssuntos + (plano.metaAssuntos === 1 ? ' assunto' : ' assuntos diferentes') + ' (' + nAssuntos + ' revisto' + (nAssuntos === 1 ? '' : 's') + ')' }),
        progresso ? UI.barra(Math.min(1, progresso) * 100) : null
      ]);
      acao = UI.botao('Lançar revisão', function () { Sessao.abrir({ disciplinaId: d.id, tipo: 'revisao' }); }, 'btn-primario', 'play');
    }

    var SEGUINTE = { simulado: 'duvidas', duvidas: 'erros2x', erros2x: 'fracos', fracos: 'simulado' };
    var depois = SEGUINTE[etapa];
    if (depois === 'fracos' && !plano.fracos.length) depois = 'simulado'; // sem pontos fracos, a etapa é pulada
    // Simulados da volta somando menos de 50 questões: o próximo também é simulado.
    var textoDepois;
    if (etapa === 'simulado' && plano.simulado && plano.somaSimulado + (plano.simulado.totalQuestoes || 0) < plano.minimoSimulado) {
      var prox = plano.simulados[plano.simuladosConcluidos + 1];
      textoDepois = prox ? 'Resolver o caderno de simulado "' + prox.nome + '"' : 'Resolver mais um caderno de simulado (cadastre um novo)';
    } else {
      textoDepois = textoEtapaRevisao(depois, plano);
    }
    return el('div', { class: 'recomendacao rec-revisao rec-' + (etapa === 'simulado' ? 'questoes' : etapa === 'fracos' ? 'erros' : 'favoritas') }, [
      el('div', { class: 'rec-topo' }, [UI.icone(etapa === 'fracos' ? 'alerta' : 'caderno2'), el('span', { class: 'rec-rotulo', text: 'Recomendação' })]),
      el('div', { class: 'rec-principal' }, [el('strong', { class: 'rec-titulo', text: textoEtapaRevisao(etapa, plano) }), detalhe]),
      acao ? el('div', { class: 'rec-rodape' }, acao) : null,
      el('div', { class: 'rec-depois' }, [
        el('span', { class: 'rec-depois-rotulo', text: 'Em seguida' }),
        el('span', { text: textoDepois })
      ]),
      el('div', { class: 'rec-progresso data-fraca', text: 'Volta ' + plano.rodada + ' do Modo Revisão · ' + plano.simuladosConcluidos +
        (plano.simuladosConcluidos === 1 ? ' simulado concluído' : ' simulados concluídos') })
    ]);
  }

  // ---------- Processo até o fim da teoria (bloquinhos) ----------
  var TIPO_COR = { teoria: 'teoria', bateria: 'questoes', favoritas: 'favoritas', erros: 'erros' };

  function bloquinhoEtapa(it, atual) {
    var nome, sub;
    if (it.tipo === 'teoria') {
      var prontos = it.topicos.filter(function (t) { return t.concluido; }).length;
      nome = 'Teoria';
      sub = prontos && !it.concluido ? prontos + '/' + it.topicos.length + ' tópicos' : it.bloco.nome;
    } else if (it.tipo === 'favoritas') {
      nome = it.grupo === 'duvidas' ? 'Dúvidas' : 'Errei 2x+';
      sub = it.rodada && it.rodada.vazia ? 'Sem questões' : it.feitas && it.qtd ? it.feitas + '/' + it.qtd : 'Favoritadas';
    } else if (it.tipo === 'erros') {
      nome = 'Erros';
      sub = (it.feitas && !it.concluido ? it.feitas + '/' + it.qtd + ' · ' : '') + Dados.nomePar(it.par);
    } else {
      var b = it.bateria;
      nome = it.numero + 'ª bateria';
      sub = (b && b.feitas && !it.concluido ? b.feitas + '/' + b.qtd + ' · ' : '') + it.bloco.nome;
    }
    return el('div', { class: 'etapa etapa-' + TIPO_COR[it.tipo] + (it.concluido ? ' feita' : '') + (it === atual ? ' atual' : ''), title: textoEtapa(it) }, [
      el('div', { class: 'etapa-nome' }, [it.concluido ? UI.icone('check') : null, el('span', { text: nome })]),
      el('div', { class: 'etapa-sub', text: sub }),
      it === atual ? el('div', { class: 'etapa-agora', text: 'Agora' }) : null
    ]);
  }

  function gradeProcesso(d) {
    var plano = Dados.planoTeoria(d.id);
    if (!plano.blocos) return el('p', { class: 'data-fraca', text: 'Cadastre os blocos de teoria desta matéria para ver o processo.' });
    var atual = plano.pendentes[0], feitas = plano.itens.length - plano.pendentes.length, grupos = [];
    plano.itens.forEach(function (it) {
      // As favoritadas encerram o bloco anterior; cada bloco começa com a teoria (só muda a apresentação, não a ordem).
      var passoGrupo = it.tipo === 'favoritas' ? it.passo - 1 : it.passo;
      var g = grupos[grupos.length - 1];
      if (!g || g.passo !== passoGrupo) grupos.push(g = { passo: passoGrupo, itens: [] });
      g.itens.push(it);
    });
    var blocos = Dados.blocosDe(d.id);
    return el('div', { class: 'processo' }, [
      el('div', { class: 'processo-resumo' }, [
        el('strong', { text: feitas + ' de ' + plano.itens.length + ' etapas concluídas' }),
        el('span', { class: 'data-fraca', text: plano.pendentes.length ? 'Faltam ' + plano.pendentes.length : 'Modo Leitura concluído' })
      ]),
      UI.barra(plano.itens.length ? feitas / plano.itens.length * 100 : 0),
      el('div', { class: 'processo-legenda' }, [['teoria', 'Teoria'], ['questoes', 'Questões'], ['favoritas', 'Favoritadas'], ['erros', 'Erros']].map(function (x) {
        return el('span', { class: 'etapa-' + x[0] }, [el('i'), x[1]]);
      })),
      grupos.map(function (g) {
        var prontos = g.itens.filter(function (it) { return it.concluido; }).length;
        return el('div', { class: 'processo-grupo' }, [
          el('div', { class: 'processo-grupo-topo' }, [
            el('span', { text: g.passo <= blocos.length ? blocos[g.passo - 1].nome : 'Depois da última teoria' }),
            el('span', { class: 'data-fraca', text: prontos + '/' + g.itens.length })
          ]),
          el('div', { class: 'processo-etapas' }, g.itens.map(function (it) { return bloquinhoEtapa(it, atual); }))
        ]);
      })
    ]);
  }

  // Processo do Modo Revisão: o que foi feito em cada volta e o que falta na volta atual.
  function bloquinhoRevisao(e, estado) {
    var nome, sub, cor = 'favoritas';
    if (e.tipo === 'simulado') {
      cor = 'questoes';
      nome = 'Simulado';
      var c = e.caderno;
      sub = !c ? 'Cadastrar novo' : (e.feitas && c.totalQuestoes ? e.feitas + '/' + c.totalQuestoes + ' · ' : '') + c.nome;
    } else if (e.tipo === 'fracos') {
      cor = 'erros';
      nome = 'Pontos fracos';
      sub = estado === 'feita' ? (e.questoes + ' questões · ' + e.assuntos + (e.assuntos === 1 ? ' assunto' : ' assuntos'))
        : e.progresso || 'Assuntos fracos';
    } else {
      nome = e.tipo === 'duvidas' ? 'Dúvidas' : 'Errei 2x+';
      sub = e.caderno ? 'Favoritadas' : 'Cadastrar caderno';
    }
    return el('div', { class: 'etapa etapa-' + cor + (estado ? ' ' + estado : '') }, [
      el('div', { class: 'etapa-nome' }, [estado === 'feita' ? UI.icone('check') : null, el('span', { text: nome })]),
      el('div', { class: 'etapa-sub', text: sub }),
      estado === 'atual' ? el('div', { class: 'etapa-agora', text: 'Agora' }) : null
    ]);
  }

  function gradeRevisao(d) {
    var p = Dados.planoRevisao(d.id);
    var dessaVolta = p.historico.filter(function (e) { return e.rodada === p.rodada; });
    var total = dessaVolta.length + p.faltam.length;
    p.faltam.forEach(function (e) {
      if (e.tipo === 'fracos' && p.etapa === 'fracos') e.progresso = p.fracosQuestoes + '/' + p.metaQuestoes + ' questões · ' + Object.keys(p.fracosAssuntos).length + '/' + p.metaAssuntos + ' assuntos';
    });
    var voltas = [];
    for (var v = 1; v <= p.rodada; v++) voltas.push(v);
    function grupo(titulo, contagem, blocos) {
      return el('div', { class: 'processo-grupo' }, [
        el('div', { class: 'processo-grupo-topo' }, [el('span', { text: titulo }), el('span', { class: 'data-fraca', text: contagem })]),
        el('div', { class: 'processo-etapas' }, blocos)
      ]);
    }
    return el('div', { class: 'processo' }, [
      el('div', { class: 'processo-resumo' }, [
        el('strong', { text: 'Volta ' + p.rodada + ': ' + dessaVolta.length + ' de ' + total + ' etapas concluídas' }),
        el('span', { class: 'data-fraca', text: p.simuladosConcluidos + ' de ' + p.simulados.length + (p.simulados.length === 1 ? ' simulado' : ' simulados') })
      ]),
      UI.barra(total ? dessaVolta.length / total * 100 : 0),
      el('div', { class: 'processo-legenda' }, [['questoes', 'Simulado'], ['favoritas', 'Favoritadas'], ['erros', 'Pontos fracos']].map(function (x) {
        return el('span', { class: 'etapa-' + x[0] }, [el('i'), x[1]]);
      })),
      voltas.reverse().map(function (n) {
        var feitas = p.historico.filter(function (e) { return e.rodada === n; });
        var blocos = feitas.map(function (e) { return bloquinhoRevisao(e, 'feita'); });
        if (n !== p.rodada) return grupo('Volta ' + n, 'Concluída', blocos);
        return grupo('Volta ' + n + ' (atual)', feitas.length + '/' + total, blocos.concat(p.faltam.map(function (e, i) { return bloquinhoRevisao(e, i ? '' : 'atual'); })));
      })
    ]);
  }

  // O processo mostrado segue o modo da matéria: Leitura (até o fim da teoria) ou Revisão.
  function processoDa(d) {
    return Dados.modoDeEstudo(d.id).modo === 'revisao'
      ? { titulo: 'Processo do Modo Revisão', conteudo: gradeRevisao(d) }
      : { titulo: 'Processo até o fim da teoria', conteudo: gradeProcesso(d) };
  }

  function verProcesso(d) {
    var pr = processoDa(d);
    UI.modal(d.nome, pr.conteudo, [{ texto: 'Fechar', classe: 'btn-secundario' }], { subtitulo: pr.titulo }).caixa.classList.add('modal-largo');
  }

  // ---------- Ciclo ----------
  function painelCiclo() {
    var c = Dados.db.ciclo;
    var cab = el('div', { class: 'grafico-topo' }, [
      el('h2', { class: 'secao-titulo', text: 'Ciclo de estudos' }),
      UI.botao(c.itens.length ? 'Editar ciclo' : 'Montar ciclo', editarCiclo, 'btn-contorno')
    ]);
    if (!c.itens.length) {
      return el('section', { class: 'painel painel-ciclo' }, [cab, el('p', { class: 'data-fraca', text: 'Nenhum ciclo montado ainda.' })]);
    }
    var totalMin = c.itens.reduce(function (s, i) { return s + (i.minutosPlanejados || 0); }, 0);
    var pct = c.posicaoAtual / c.itens.length * 100;
    return el('section', { class: 'painel painel-ciclo' }, [
      cab,
      el('div', { class: 'ciclo-resumo' }, [
        el('span', { text: 'Volta ' + ((c.voltas || 0) + 1) + ' · ' + c.posicaoAtual + ' de ' + c.itens.length + ' concluídas' }),
        totalMin ? el('span', { class: 'data-fraca', text: 'Ciclo completo: ' + fmtMinutos(totalMin) }) : null
      ]),
      UI.barra(pct),
      el('ol', { class: 'ciclo-lista' }, c.itens.map(function (item, i) {
        var d = Dados.disciplina(item.disciplinaId);
        var estado = i < c.posicaoAtual ? 'feito' : i === c.posicaoAtual ? 'atual' : '';
        return el('li', { class: 'ciclo-item clicavel ' + estado, tabindex: '0', role: 'button',
          title: estado === 'feito' ? 'Ver o que foi estudado' : 'Ver a recomendação desta matéria',
          onclick: function (e) { if (!e.target.closest('.ciclo-ir')) detalheCiclo(i); },
          onkeydown: function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); detalheCiclo(i); } }
        }, [
          el('span', { class: 'ciclo-num' }, estado === 'feito' ? UI.icone('check') : String(i + 1)),
          el('span', { class: 'bolinha', style: { background: d ? d.cor : '#ccc' } }),
          el('span', { class: 'ciclo-nome', text: d ? d.nome : '(disciplina excluída)' }),
          item.minutosPlanejados ? el('span', { class: 'data-fraca', text: fmtMinutos(item.minutosPlanejados) }) : null,
          estado === 'atual' ? UI.selo('Agora', 'info')
            : el('button', { type: 'button', class: 'link ciclo-ir', text: 'Ir para cá', title: 'Tornar esta a matéria da vez', onclick: function () {
                Dados.irParaPosicaoCiclo(i);
                App.atualizar();
              } })
        ]);
      }))
    ]);
  }

  // Clique numa matéria do ciclo: as já feitas mostram o que foi estudado nesta volta;
  // a atual e as próximas mostram a recomendação de agora para aquela matéria.
  function detalheCiclo(i) {
    var c = Dados.db.ciclo, item = c.itens[i];
    var d = item && Dados.disciplina(item.disciplinaId);
    if (!d) return;
    var feito = i < c.posicaoAtual;
    var posicao = (i + 1) + 'º no ciclo · volta ' + ((c.voltas || 0) + 1);
    var corpo;

    if (feito) {
      var r = Dados.sessoesDaPosicaoCiclo(i);
      corpo = r.sessoes.length ? [
        r.aproximado ? el('p', { class: 'aviso-suave', text: 'Este estudo foi lançado antes do programa registrar a posição no ciclo; mostrando a última sessão desta matéria.' }) : null,
        el('div', { class: 'ciclo-sessoes' }, r.sessoes.map(function (s) {
          return el('div', { class: 'ciclo-sessao' }, [
            el('div', { class: 'ciclo-sessao-topo' }, [
              Sessao.seloTipo(s.tipo),
              el('span', { class: 'data-forte', text: UI.fmtData(s.data) }),
              el('span', { class: 'registro-tempo' }, [UI.icone('relogio'), UI.fmtDuracao(s.segundos)])
            ]),
            el('div', { class: 'registro-detalhe', text: Sessao.descrever(s) }),
            s.anotacao ? el('div', { class: 'registro-anotacao' }, [UI.icone('nota'), el('span', { text: s.anotacao })]) : null
          ]);
        }))
      ] : [el('p', { class: 'data-fraca', text: 'Nenhum estudo foi lançado nesta posição do ciclo nesta volta (ela pode ter sido pulada).' })];
    } else {
      var modo = Dados.modoDeEstudo(d.id);
      var anot = Dados.ultimaAnotacao(d.id);
      corpo = [
        el('div', { class: 'ciclo-detalhe-modo' }, [seloModo(modo),
          i > c.posicaoAtual ? el('span', { class: 'data-fraca', text: 'Recomendação de agora; pode mudar com os estudos lançados até chegar a vez desta matéria.' }) : null]),
        recomendacao(d, modo) || el('p', { class: 'data-fraca', text: 'Sem recomendação: cadastre os blocos de teoria desta matéria.' }),
        anot ? UI.blocoAnotacao(anot, { teoria: 'Teoria', questoes: 'Questões', revisao: 'Revisão' }[anot.tipo]) : null
      ];
    }
    var pr = processoDa(d);
    corpo.push(el('h3', { class: 'processo-titulo', text: pr.titulo }), pr.conteudo);
    var m = UI.modal(d.nome, corpo, [{ texto: 'Fechar', classe: 'btn-secundario' }],
      { subtitulo: (feito ? 'O que foi estudado · ' : 'Recomendação · ') + posicao });
    m.caixa.classList.add('modal-largo');
    // Os botões da recomendação abrem o formulário de lançamento: fecha esta janela antes.
    m.caixa.querySelectorAll('.recomendacao .btn, .recomendacao a:not([target])').forEach(function (b) { b.addEventListener('click', m.fechar); });
  }

  function editarCiclo() {
    var discs = Dados.disciplinas();
    var itens = Dados.db.ciclo.itens.map(function (i) { return { id: i.id, disciplinaId: i.disciplinaId, minutosPlanejados: i.minutosPlanejados }; });
    var lista = el('div', { class: 'editor-ciclo' });
    var erro = el('div', { class: 'erro-form', hidden: true });

    function desenhar() {
      lista.innerHTML = '';
      if (!itens.length) lista.appendChild(el('p', { class: 'data-fraca', text: 'Adicione as matérias na ordem em que quer estudá-las. A mesma matéria pode aparecer mais de uma vez.' }));
      itens.forEach(function (item, i) {
        var sel = el('select', { onchange: function () { item.disciplinaId = sel.value; } }, discs.map(function (d) {
          return el('option', { value: d.id, text: d.nome, selected: d.id === item.disciplinaId });
        }));
        var h = el('input', { type: 'number', min: 0, step: 1, value: item.minutosPlanejados ? Math.floor(item.minutosPlanejados / 60) : '', placeholder: '0', oninput: tempo });
        var m = el('input', { type: 'number', min: 0, max: 59, step: 5, value: item.minutosPlanejados ? item.minutosPlanejados % 60 : '', placeholder: '0', oninput: tempo });
        function tempo() { item.minutosPlanejados = (Number(h.value) || 0) * 60 + (Number(m.value) || 0); }
        function mover(dir) {
          var j = i + dir;
          if (j < 0 || j >= itens.length) return;
          itens.splice(j, 0, itens.splice(i, 1)[0]);
          desenhar();
        }
        lista.appendChild(el('div', { class: 'editor-linha' }, [
          el('span', { class: 'ciclo-num', text: String(i + 1) }),
          sel,
          el('div', { class: 'tempo', title: 'Tempo planejado (opcional)' }, [h, el('span', { text: 'h' }), m, el('span', { text: 'min' })]),
          el('div', { class: 'editor-botoes' }, [
            el('button', { type: 'button', class: 'btn-icone', title: 'Subir', text: '↑', disabled: i === 0, onclick: function () { mover(-1); } }),
            el('button', { type: 'button', class: 'btn-icone', title: 'Descer', text: '↓', disabled: i === itens.length - 1, onclick: function () { mover(1); } }),
            el('button', { type: 'button', class: 'btn-icone', title: 'Remover', text: '✕', onclick: function () { itens.splice(i, 1); desenhar(); } })
          ])
        ]));
      });
    }

    desenhar();
    var m = UI.modal('Ciclo de estudos', [
      el('p', { class: 'modal-desc', text: 'Monte a sequência como preferir. O tempo de cada etapa é opcional (só uma meta) e pode ser mudado quando quiser.' }),
      lista,
      el('div', { class: 'editor-acoes' }, [
        el('button', { type: 'button', class: 'link', text: '+ Adicionar matéria', onclick: function () {
          var ultimo = itens[itens.length - 1];
          itens.push({ disciplinaId: ultimo ? ultimo.disciplinaId : discs[0].id, minutosPlanejados: 0 });
          desenhar();
          var s = lista.querySelectorAll('select');
          s[s.length - 1].focus();
        } }),
        el('button', { type: 'button', class: 'link', text: '+ Adicionar todas as disciplinas', onclick: function () {
          discs.forEach(function (d) { itens.push({ disciplinaId: d.id, minutosPlanejados: 0 }); });
          desenhar();
        } })
      ]),
      erro
    ], [
      Dados.db.ciclo.itens.length ? { texto: 'Recomeçar do 1º', classe: 'btn-secundario btn-esquerda', acao: function () {
        Dados.recomecarCiclo();
        App.atualizar();
        UI.aviso('Ciclo reiniciado na 1ª matéria');
      } } : null,
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: 'Salvar ciclo', classe: 'btn-primario', acao: function () {
        if (!itens.length) { erro.textContent = 'Adicione pelo menos uma matéria.'; erro.hidden = false; return false; }
        Dados.definirCiclo(itens);
        App.atualizar();
        UI.aviso('Ciclo salvo');
      } }
    ].filter(Boolean));
    m.caixa.classList.add('modal-largo');
  }

  // ---------- Indicadores ----------
  // Caixa de indicador: título, número grande e linhas de detalhe [valor em negrito, texto].
  function caixa(titulo, valor, linhas, rodape) {
    return el('div', { class: 'caixa-kpi' }, [
      el('div', { class: 'caixa-titulo', text: titulo }),
      el('div', { class: 'caixa-valor', text: valor }),
      el('div', { class: 'caixa-linhas' }, linhas.map(function (l) {
        return el('div', null, [el('strong', { text: l[0] }), ' ' + l[1]]);
      })),
      rodape ? el('div', { class: 'caixa-rodape' }, rodape) : null
    ]);
  }

  function indicadores() {
    var hoje = UI.hoje();
    var iniSemana = inicioSemana(hoje);
    var semana = resumoPeriodo(iniSemana, hoje);
    var dia = resumoPeriodo(hoje, hoje);
    var total = resumoPeriodo('0000-01-01', '9999-12-31');

    // Média por dia: desde o primeiro estudo lançado até hoje.
    var primeiro = Dados.db.sessoes.reduce(function (m, s) { return !m || s.data < m ? s.data : m; }, null);
    var dias = primeiro ? UI.diasEntre(primeiro, hoje) + 1 : 0;
    var mediaDia = dias ? total.segundos / dias : 0;

    var feitos = Dados.db.topicos.filter(function (t) { return t.concluido; }).length;
    var totalTopicos = Dados.db.topicos.length;
    var semanaTopicos = Dados.db.topicos.filter(function (t) { return t.concluido && t.dataConclusao && t.dataConclusao >= iniSemana; }).length;
    function pct1(v) { return UI.fmtPct(Math.round(v * 10) / 10); }
    function semanaRodape(texto) { return [el('span', { class: 'caixa-semana', text: 'Nesta semana' }), ' ', texto]; }

    // Mesmas colunas da grade de baixo: as 3 caixas ocupam a largura da "Próxima matéria" e as metas a do Perfil.
    return el('div', { class: 'grade-kpi' }, [
      el('div', { class: 'kpi-tres' }, [
        caixa('Tempo de estudo', UI.fmtDuracao(total.segundos), [
          [UI.fmtDuracao(mediaDia), 'média por dia'],
          [fmtHoras(dia.segundos), 'estudadas hoje']
        ], semanaRodape(fmtHoras(semana.segundos) + ' · teoria ' + fmtHoras(semana.teoria) + ' · questões ' + fmtHoras(semana.questoes))),
        caixa('Desempenho', total.feitas ? pct1(total.pct) : '—', [
          [UI.fmtNum(total.acertos), 'Acertos'],
          [UI.fmtNum(total.erros), 'Erros']
        ], semanaRodape(semana.feitas ? pct1(semana.pct) + ' (' + UI.fmtNum(semana.acertos) + ' acertos · ' + UI.fmtNum(semana.erros) + ' erros)' : 'sem questões')),
        caixa('Progresso', totalTopicos ? pct1(feitos / totalTopicos * 100) : '—', [
          [UI.fmtNum(feitos), 'Tópicos concluídos'],
          [UI.fmtNum(totalTopicos - feitos), 'Tópicos pendentes']
        ], semanaRodape(semanaTopicos + (semanaTopicos === 1 ? ' tópico concluído' : ' tópicos concluídos')))
      ]),
      caixaMetas(semana)
    ]);
  }

  // ---------- Previsão de conclusão do edital ----------
  function fmtDecimal(v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function textoEtapas(n) { return UI.fmtNum(n) + (n === 1 ? ' etapa' : ' etapas'); }

  function caixaPrevisao() {
    var r = Previsao.calcular();
    if (r.vazio) return null;
    var valor, linhas;
    if (r.concluido) {
      valor = 'Concluído';
      linhas = [['Todas as matérias', 'já estão no Modo Revisão']];
    } else if (r.semRitmo) {
      valor = 'Sem previsão';
      linhas = [[textoEtapas(r.etapasRestantes), 'restantes'], ['Sem estudos', 'nas últimas 4 semanas para calcular o ritmo']];
    } else {
      valor = Previsao.fmtMes(r.data);
      linhas = [
        [textoEtapas(r.etapasRestantes), 'restantes'],
        [fmtDecimal(r.mediaEtapasSemana), 'concluídas por semana (últimas 4 semanas)'],
        [r.emRevisao + ' de ' + r.total, 'matérias em Revisão']
      ];
    }
    function abrir() { detalhePrevisao(r); }
    return el('div', { class: 'caixa-kpi caixa-topo caixa-previsao', role: 'button', tabindex: '0', title: 'Ver o detalhe por matéria', onclick: abrir,
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } } }, [
      el('div', { class: 'caixa-titulo', text: 'Conclusão do edital' }),
      el('div', { class: 'previsao-valor', text: valor }),
      el('div', { class: 'caixa-linhas' }, linhas.map(function (l) {
        return el('div', null, [el('strong', { text: l[0] }), ' ' + l[1]]);
      }))
    ]);
  }

  // ---------- Comparação com a semana anterior ----------
  // A semana atual ainda não terminou: compara os mesmos dias (de segunda até o dia de hoje).
  var NOMES_DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

  function textoPeriodoComparado(diasDaSemana) {
    if (diasDaSemana === 7) return 'Semana inteira, de segunda a domingo';
    if (diasDaSemana === 1) return 'Só a segunda-feira de cada semana';
    return 'De ' + NOMES_DIAS[0] + ' a ' + NOMES_DIAS[diasDaSemana - 1] + ' em cada semana';
  }

  function classeDiferenca(v) { return 'dif' + (v > 0 ? ' dif-mais' : v < 0 ? ' dif-menos' : ''); }

  function linhaComparada(rotulo, atual, diferenca, texto) {
    return el('div', { class: 'comparar-item' }, [
      el('span', { class: 'comparar-rotulo', text: rotulo }),
      el('strong', { text: atual }),
      el('span', { class: classeDiferenca(diferenca), text: texto })
    ]);
  }

  function caixaComparacao() {
    var hoje = UI.hoje(), seg = inicioSemana(hoje);
    var dias = UI.diasEntre(seg, hoje) + 1;
    var agora = resumoPeriodo(seg, hoje);
    var antes = resumoPeriodo(UI.somarDias(seg, -7), UI.somarDias(hoje, -7));
    var temAcerto = agora.feitas > 0 && antes.feitas > 0;
    function pct1(v) { return UI.fmtPct(Math.round(v * 10) / 10); }
    function sinal(v) { return v > 0 ? '+' : v < 0 ? '−' : ''; }
    var difAcerto = temAcerto ? Math.round((agora.pct - antes.pct) * 10) / 10 : 0;
    var difSeg = agora.segundos - antes.segundos, difQ = agora.feitas - antes.feitas;
    function barra(rotulo, pct, classe) {
      return el('div', { class: 'comparar-barra ' + classe }, [
        el('span', { text: rotulo }),
        el('div', { class: 'comparar-trilho' }, el('div', { style: { width: Math.min(100, pct) + '%' } })),
        el('span', { class: 'comparar-pct', text: pct1(pct) })
      ]);
    }
    return el('div', { class: 'caixa-kpi caixa-topo' }, [
      el('div', { class: 'caixa-titulo', text: 'Você vs. semana passada' }),
      el('div', { class: 'comparar-periodo', text: textoPeriodoComparado(dias) }),
      el('div', { class: 'comparar-acerto' }, [
        el('span', { class: 'previsao-valor', text: agora.feitas ? pct1(agora.pct) : '—' }),
        temAcerto ? el('span', { class: classeDiferenca(difAcerto) + ' dif-selo', text: sinal(difAcerto) + UI.fmtPct(Math.abs(difAcerto)).replace('%', '') + ' p.p.' }) : null,
        el('span', { class: 'comparar-rotulo', text: 'de acerto' })
      ]),
      temAcerto ? el('div', { class: 'comparar-barras' }, [barra('Antes', antes.pct, 'antes'), barra('Agora', agora.pct, 'agora')]) : null,
      el('div', { class: 'comparar-linhas' }, [
        linhaComparada('Horas', fmtHoras(agora.segundos), difSeg, difSeg ? sinal(difSeg) + fmtHoras(Math.abs(difSeg)) : 'igual'),
        linhaComparada('Questões', UI.fmtNum(agora.feitas), difQ, difQ ? sinal(difQ) + UI.fmtNum(Math.abs(difQ)) : 'igual')
      ])
    ]);
  }

  // ---------- Mapa de constância ----------
  var SEMANAS_MAPA = 12;

  function nivelDoDia(segundos) {
    var h = segundos / 3600;
    return h < 1 ? 1 : h < 3 ? 2 : h < 5 ? 3 : 4;
  }

  function caixaConstancia() {
    var hoje = UI.hoje(), inicio = UI.somarDias(inicioSemana(hoje), -7 * (SEMANAS_MAPA - 1));
    var porDia = {};
    Dados.db.sessoes.forEach(function (s) {
      if (s.data < inicio || s.data > hoje) return;
      porDia[s.data] = (porDia[s.data] || 0) + (s.segundos || 0);
    });
    function emPausa(d) { return (Dados.db.pausas || []).some(function (p) { return p.inicio <= d && d <= p.fim; }); }
    var estudados = 0, decorridos = 0, celulas = [];
    for (var n = 0; n < SEMANAS_MAPA * 7; n++) {
      var d = UI.somarDias(inicio, n);
      if (d > hoje) { celulas.push(el('span', { class: 'mapa-dia futuro' })); continue; }
      decorridos++;
      var estudou = porDia[d] !== undefined, pausa = emPausa(d);
      if (estudou) estudados++;
      var classe = estudou ? 'nivel-' + nivelDoDia(porDia[d]) : pausa ? 'pausa' : '';
      var data = new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
      celulas.push(comDica(el('span', { class: 'mapa-dia ' + classe + (d === hoje ? ' hoje' : '') }), [
        data, estudou ? fmtHoras(porDia[d]) + ' de estudo' : pausa ? 'Pausa programada' : 'Sem estudo'
      ]));
    }
    return el('div', { class: 'caixa-kpi caixa-topo' }, [
      el('div', { class: 'caixa-titulo', text: 'Constância' }),
      el('div', { class: 'comparar-periodo', text: 'Últimas ' + SEMANAS_MAPA + ' semanas' }),
      el('div', { class: 'mapa' }, [
        el('div', { class: 'mapa-rotulos' }, ['seg', '', 'qua', '', 'sex', '', 'dom'].map(function (t) { return el('span', { text: t }); })),
        el('div', { class: 'mapa-dias' }, celulas)
      ]),
      el('div', { class: 'mapa-rodape' }, [
        el('span', null, [el('strong', { text: estudados + ' de ' + decorridos }), ' dias estudados']),
        el('span', { class: 'mapa-legenda' }, ['menos', el('i', { class: 'mapa-dia' }), el('i', { class: 'mapa-dia nivel-1' }), el('i', { class: 'mapa-dia nivel-2' }), el('i', { class: 'mapa-dia nivel-3' }), el('i', { class: 'mapa-dia nivel-4' }), 'mais'])
      ])
    ]);
  }

  function linhaTopo() {
    return el('div', { class: 'grade-topo-tres' }, [caixaPrevisao(), caixaComparacao(), caixaConstancia()]);
  }

  function detalhePrevisao(r) {
    function peso(x) { return x.horas > 0 ? (x.data ? new Date(x.data).getTime() : Infinity) : -1; }
    var linhas = r.materias.slice().sort(function (a, b) { return peso(b) - peso(a); }).map(function (x) {
      var situacao = x.horas > 0 ? (x.modo === 'revisao' ? 'Teoria pendente' : 'Modo Leitura') : 'Concluída';
      return el('tr', null, [
        el('td', null, [el('span', { class: 'bolinha', style: { background: x.d.cor } }), ' ' + x.d.nome]),
        el('td', { text: situacao }),
        el('td', { class: 'previsao-num', text: x.totalEtapas ? UI.fmtNum(x.totalEtapas) : '—' }),
        el('td', { class: 'previsao-num', text: x.data ? Previsao.fmtMes(x.data) : '—' })
      ]);
    });
    var m = r.medias;
    var tipos = [['teoria', 'teoria', 'Teoria'], ['bateria', 'questoes', 'Baterias de questões'], ['favoritas', 'favoritas', 'Favoritadas'], ['erros', 'erros', 'Baterias de erros']];
    UI.modal('Conclusão do edital', [
      !r.concluido && r.data ? el('p', { class: 'modal-desc', text: 'Mantendo o ritmo das últimas 4 semanas (' + UI.fmtNum(Math.round(r.horasSemana)) + ' h/semana), a previsão é ' + Previsao.fmtMes(r.data) + '. A data muda conforme o seu ritmo real.' }) : null,
      el('div', { class: 'processo-resumo' }, [
        el('strong', { text: textoEtapas(r.etapasRestantes) + ' restantes' }),
        el('span', { class: 'data-fraca', text: fmtDecimal(r.mediaEtapasSemana) + ' concluídas por semana nas últimas 4 semanas' })
      ]),
      el('div', { class: 'previsao-tipos' }, tipos.map(function (t) {
        return el('div', { class: 'previsao-tipo etapa-' + t[1] }, [
          el('div', { class: 'previsao-tipo-nome', text: t[2] }),
          el('div', { class: 'previsao-tipo-num', text: UI.fmtNum(r.etapas[t[0]]) }),
          el('div', { class: 'previsao-tipo-media', text: fmtDecimal(r.etapasPorSemana[t[0]]) + ' por semana' })
        ]);
      })),
      el('div', { class: 'tabela-rolagem previsao-tabela' }, el('table', { class: 'tabela tabela-previsao' }, [
        el('thead', null, el('tr', null, [
          el('th', { text: 'Matéria' }), el('th', { text: 'Situação' }), el('th', { class: 'previsao-num', text: 'Etapas' }), el('th', { class: 'previsao-num', text: 'Previsão' })
        ])),
        el('tbody', null, linhas)
      ])),
      el('h3', { class: 'processo-titulo', text: 'Como é calculado' }),
      el('ul', { class: 'previsao-premissas' }, [
        'O ciclo é repetido no futuro a partir da posição atual. Posições de matérias em Revisão gastam tempo, mas não adiantam o edital.',
        'Quando uma matéria termina o Modo Leitura, continua no ciclo com 1 vaga, em Revisão, e entra a próxima matéria de fora, em ordem alfabética. Se ela tinha 2 vagas, a extra passa para a nova.',
        'Cada matéria usa as próprias médias; com menos de 5 tópicos concluídos ou 100 questões, usa as gerais: ' + UI.fmtNum(Math.round(m.horasTopico * 60)) + ' min por tópico e ' + UI.fmtNum(Math.round(m.questoesHora)) + ' questões por hora.',
        'Cadernos ainda não cadastrados são estimados pela média dos outros; favoritadas sem total, pela média das rodadas já lançadas.',
        'Matéria em Modo Revisão soma só os tópicos que faltam, não as baterias pendentes.',
        'Para chegar à data, as etapas restantes são convertidas em horas, porque cada etapa tem um tamanho diferente.'
      ].map(function (t) { return el('li', { text: t }); }))
    ], [{ texto: 'Fechar', classe: 'btn-secundario' }], { subtitulo: 'Previsão para concluir a teoria de todas as matérias' }).caixa.classList.add('modal-largo');
  }

  // ---------- Metas da semana ----------
  function caixaMetas(semana) {
    var m = Dados.db.metas || {};
    var metaSeg = (Number(m.horas) || 0) * 3600, metaQ = Number(m.questoes) || 0;
    var digitos = String(metaQ).length;
    return el('div', { class: 'caixa-kpi caixa-metas' }, [
      el('div', { class: 'metas-topo' }, [
        el('div', { class: 'caixa-titulo', text: 'Metas da semana' }),
        UI.botaoEngrenagem(editarMetas, 'Definir metas')
      ]),
      linhaMeta('Horas', UI.fmtDuracao(semana.segundos) + (metaSeg ? '/' + UI.fmtDuracao(metaSeg) : ''), semana.segundos, metaSeg),
      linhaMeta('Questões', String(semana.feitas).padStart(digitos, '0') + (metaQ ? '/' + metaQ : ''), semana.feitas, metaQ),
      el('div', { class: 'caixa-rodape', text: 'De segunda a domingo · recomeça toda segunda-feira' })
    ]);
  }

  function linhaMeta(rotulo, texto, feito, meta) {
    var pct = meta ? Math.min(100, feito / meta * 100) : 0;
    return el('div', { class: 'meta' }, [
      el('div', { class: 'meta-topo' }, [el('span', { class: 'meta-rotulo', text: rotulo }), el('span', { class: 'meta-numeros', text: texto })]),
      el('div', { class: 'meta-trilho' + (meta && feito >= meta ? ' completa' : '') }, [
        el('div', { class: 'meta-valor', style: { width: pct + '%' } }),
        el('span', { class: 'meta-pct', text: meta ? Math.floor(feito / meta * 100) + '%' : 'sem meta' })
      ])
    ]);
  }

  function editarMetas() {
    var m = Dados.db.metas || {};
    var horas = el('input', { type: 'number', min: 0, step: 1, value: m.horas || 0 });
    var questoes = el('input', { type: 'number', min: 0, step: 1, value: m.questoes || 0 });
    UI.modal('Metas da semana', [
      el('div', { class: 'campos-linha' }, [UI.campo('Horas de estudo', horas), UI.campo('Questões', questoes)]),
      el('p', { class: 'campo-ajuda', text: 'Contam as sessões lançadas de segunda a domingo. Use 0 para não ter meta.' })
    ], [
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: 'Salvar', classe: 'btn-primario', acao: function () {
        Dados.db.metas = { horas: Math.max(0, Number(horas.value) || 0), questoes: Math.max(0, Math.round(Number(questoes.value) || 0)) };
        Dados.salvar();
        App.atualizar();
        UI.aviso('Metas atualizadas');
      } }
    ]);
  }

  // ---------- Janelas "Ver teoria" e "Ver cadernos" ----------
  function itemLink(nomeIcone, titulo, sub, link, extra) {
    var conteudo = [
      el('div', { class: 'item-link-icone' }, UI.icone(nomeIcone)),
      el('div', { class: 'item-link-texto' }, [
        el('div', { class: 'item-link-titulo', text: titulo }),
        sub ? el('div', { class: 'item-link-sub', text: sub }) : null
      ]),
      extra || null,
      link
        ? el('span', { class: 'chip-link ativo' }, [UI.icone('externo'), 'Abrir link'])
        : el('span', { class: 'chip-link' }, [UI.icone('alerta'), 'Sem link'])
    ];
    return link
      ? el('a', { class: 'item-link', href: link, target: '_blank', rel: 'noopener noreferrer' }, conteudo)
      : el('div', { class: 'item-link sem' }, conteudo);
  }

  function grupoLinks(titulo, contagem, itens) {
    return el('div', { class: 'grupo-links' }, [
      el('div', { class: 'grupo-links-topo' }, [el('span', { text: titulo }), el('span', { text: contagem })]),
      itens
    ]);
  }

  function verTeoria(d) {
    var blocos = Dados.blocosDe(d.id).filter(function (b) { return Dados.topicosDe(b.id).length; });
    var corpo = blocos.length ? blocos.map(function (b) {
      var ts = Dados.topicosDe(b.id);
      return grupoLinks(b.nome, ts.length + (ts.length === 1 ? ' tópico' : ' tópicos'), ts.map(function (t) {
        return itemLink('lista', t.nome, null, t.link, t.concluido ? el('span', { class: 'mini-check', title: 'Concluído' }, UI.icone('check')) : null);
      }));
    }) : el('p', { class: 'data-fraca', text: 'Nenhum tópico cadastrado nesta disciplina.' });
    UI.modal('Tópicos de teoria · ' + d.nome, el('div', { class: 'lista-links' }, corpo), [], {
      icone: 'lista', subtitulo: 'Selecione um tópico com link cadastrado para abri-lo.'
    }).caixa.classList.add('modal-links');
  }

  function verCadernos(d) {
    var pastas = Dados.pastasDe(d.id).filter(function (p) { return Dados.cadernosDe(p.id).length; });
    var corpo = pastas.length ? pastas.map(function (p) {
      var cs = Dados.cadernosDe(p.id);
      return grupoLinks(p.nome, cs.length + (cs.length === 1 ? ' caderno' : ' cadernos'), cs.map(function (c) {
        var s = Dados.statsCaderno(c.id);
        var info = s.total ? el('span', { class: 'item-link-info', text: s.feitas + '/' + s.total }) : null;
        return itemLink('caderno2', c.nome, c.assunto, c.link, info);
      }));
    }) : el('p', { class: 'data-fraca', text: 'Nenhum caderno cadastrado nesta disciplina.' });
    UI.modal('Cadernos de questões · ' + d.nome, el('div', { class: 'lista-links' }, corpo), [], {
      icone: 'caderno2', subtitulo: 'Selecione um caderno para abrir o link cadastrado.'
    }).caixa.classList.add('modal-links');
  }

  // ---------- Gráficos do painel ----------
  function graficos() {
    function pct1(v) { return UI.fmtPct(Math.round(v * 10) / 10); }
    function vazio(tipo) { return 'Sem dados neste período (' + PERIODOS[tipo].sub.toLowerCase() + ').'; }

    var horas = cartaoPeriodo('horas', 'Horas de estudo', function (tipo) {
      var lista = periodos(tipo), total = 0;
      var itens = lista.map(function (s) {
        total += s.segundos;
        return {
          rotulo: s.rotulo, valor: s.segundos, textoValor: fmtHoras(s.segundos),
          dica: [s.nome, 'Total: ' + fmtHoras(s.segundos), 'Teoria: ' + fmtHoras(s.teoria), 'Questões: ' + fmtHoras(s.questoes)]
        };
      });
      return {
        legenda: [itemLegenda('barra', 'Horas', fmtHoras(total))],
        conteudo: graficoColunas(itens, vazio(tipo))
      };
    });

    var questoes = cartaoPeriodo('questoes', 'Questões', function (tipo) {
      var lista = periodos(tipo), feitas = 0, acertos = 0;
      var itens = lista.map(function (s) {
        feitas += s.feitas; acertos += s.acertos;
        return {
          rotulo: s.rotulo, valor: s.feitas, textoValor: UI.fmtNum(s.feitas), pct: s.feitas ? s.pct : null,
          dica: [s.nome, UI.fmtNum(s.feitas) + ' questões', s.feitas ? 'Acerto: ' + pct1(s.pct) + ' (' + UI.fmtNum(s.acertos) + ' · ' + UI.fmtNum(s.erros) + ' erros)' : 'Sem questões']
        };
      });
      return {
        legenda: [
          itemLegenda('barra', 'Questões', UI.fmtNum(feitas)),
          itemLegenda('linha', 'Média de acertos', feitas ? pct1(acertos / feitas * 100) : '—')
        ],
        conteudo: graficoColunas(itens, vazio(tipo), true)
      };
    });

    var discs = Dados.disciplinas();
    var teoria = discs.filter(function (d) { return Dados.progressoTeoria(d.id).total; }).map(function (d) {
      var p = Dados.progressoTeoria(d.id);
      return { nome: d.nome, cor: d.cor, pct: p.pct, texto: UI.fmtPct(Math.round(p.pct)), dica: [d.nome, p.feitos + ' de ' + p.total + ' tópicos', UI.fmtPct(p.pct)] };
    });
    var acerto = discs.filter(function (d) { return Dados.statsQuestoes(d.id).feitas; }).map(function (d) {
      var q = Dados.statsQuestoes(d.id);
      return { nome: d.nome, cor: d.cor, pct: q.pct, texto: UI.fmtPct(Math.round(q.pct * 10) / 10), dica: [d.nome, UI.fmtNum(q.feitas) + ' questões', q.acertos + ' acertos · ' + q.erros + ' erros', UI.fmtPct(q.pct)] };
    });
    return el('div', { class: 'grade-graficos' }, [
      horas,
      questoes,
      cartaoGrafico('Progresso da teoria', 'Tópicos concluídos por disciplina', graficoBarras(teoria, 'Cadastre tópicos no Controle de Teoria.')),
      cartaoGrafico('Taxa de acerto', 'Todas as questões lançadas', graficoBarras(acerto, 'Nenhuma questão lançada ainda.'))
    ]);
  }

  // ---------- Perfil ----------
  // Frase motivacional do dia: troca à meia-noite e é a mesma o dia inteiro.
  var FRASES = [
    'Constância vence talento quando o talento não é constante.',
    'Cada questão resolvida é um passo a menos até a posse.',
    'Não pare quando estiver cansado. Pare quando tiver terminado.',
    'O edital é grande, mas você é maior que ele.',
    'Disciplina é fazer o que precisa ser feito, mesmo sem vontade.',
    'Hoje o estudo, amanhã o Diário Oficial.',
    'Errar no treino é o que faz acertar na prova.',
    'Pequenos avanços todos os dias viram grandes resultados.',
    'A vaga já existe. Falta só o seu nome nela.',
    'Quem estuda com método não depende de sorte.',
    'Um bloco de cada vez. Um dia de cada vez.',
    'O cansaço passa; a aprovação fica.',
    'Seu concorrente também está cansado. Continue.',
    'Revise o que errou: é ali que estão os seus pontos.',
    'Foco no processo, o resultado é consequência.',
    'Não existe estudo perdido, só estudo acumulado.',
    'Você não precisa ser perfeito, precisa ser persistente.',
    'A rotina de hoje constrói a nomeação de amanhã.',
    'Quem desiste não aparece na lista de aprovados.',
    'Faça hoje o que o você do futuro vai agradecer.',
    'Mais uma sessão. Só mais uma. É assim que se chega lá.',
    'Lembre por que começou.',
    'Treino difícil, prova fácil.',
    'O sacrifício é temporário; a estabilidade é para sempre.',
    'Progresso, não perfeição.',
    'Vencer o edital é vencer a si mesmo todos os dias.',
    'Sua maior concorrência é a sua versão de ontem.',
    'Estudar quando ninguém está vendo é o que aparece no resultado.',
    'Grandes conquistas exigem rotinas comuns bem feitas.',
    'Acredite no plano e cumpra o ciclo.',
    'Ultrapasse seus limites: sempre existe um nível acima.'
  ];

  function fraseDoDia() {
    var dia = Math.floor(new Date(UI.hoje() + 'T12:00:00').getTime() / 86400000);
    return FRASES[dia % FRASES.length];
  }

  // Dias seguidos com pelo menos uma sessão lançada. A sequência atual continua valendo até o fim de hoje
  // mesmo que ainda não tenha estudado hoje (conta a partir de ontem).
  function qtdDias(n) { return n + (n === 1 ? ' dia' : ' dias'); }

  // Patente atual: abre a janela com todas as patentes, o XP e as pausas.
  function faixaPatente(r) {
    return el('button', { type: 'button', class: 'perfil-patente' + (r.risco ? ' risco' : ''), title: 'Ver minha patente', onclick: Patentes.abrir }, [
      Patentes.insignia(r.indice),
      el('span', { class: 'perfil-patente-corpo' }, [
        el('span', { class: 'perfil-patente-topo' }, [
          el('strong', { text: r.patente.nome }),
          el('span', { class: 'data-fraca', text: UI.fmtNum(r.xp) + ' XP' })
        ]),
        UI.barra(r.pct),
        el('span', { class: 'data-fraca', text: Patentes.textoProxima(r) }),
        r.requisito ? el('span', { class: 'patente-requisito' + (r.requisito.ok ? ' ok' : ''), text: Patentes.textoRequisito(r) }) : null,
        r.risco ? el('span', { class: 'perfil-patente-risco', text: 'Estude hoje para não ser rebaixado' }) : null
      ])
    ]);
  }

  function cartaoPerfil() {
    var p = Dados.db.perfil || {};
    var r = Patentes.calcular();
    return el('section', { class: 'painel perfil-tec' }, [
      el('div', { class: 'perfil-topo' }, [
        fotoPerfil(p),
        el('div', { class: 'perfil-texto' }, [
          el('div', { class: 'perfil-nome', text: p.nome || 'Meu perfil' }),
          el('div', { class: 'perfil-frase', text: '“' + fraseDoDia() + '”' })
        ]),
        UI.botaoEngrenagem(editarPerfil, 'Editar perfil')
      ]),
      faixaPatente(r),
      el('div', { class: 'perfil-sequencia' }, [
        el('div', null, [
          el('span', { class: 'perfil-seq-rotulo', text: 'Sequência atual' }),
          el('span', { class: 'perfil-seq-valor', text: qtdDias(r.sequencia) + (r.sequencia === 1 ? ' seguido' : ' seguidos') }),
          r.pausa ? el('span', { class: 'perfil-seq-dica', text: 'em pausa até ' + UI.fmtData(r.pausa.fim) })
            : r.sequencia && !r.estudouHoje ? el('span', { class: 'perfil-seq-dica', text: 'estude hoje para manter' }) : null
        ]),
        el('div', null, [
          el('span', { class: 'perfil-seq-rotulo', text: 'Melhor sequência' }),
          el('span', { class: 'perfil-seq-valor', text: qtdDias(r.melhorSequencia) })
        ])
      ])
    ]);
  }

  function fotoPerfil(p) {
    var inicial = el('div', { class: 'perfil-foto perfil-inicial', text: (p.nome || '?').trim().charAt(0).toUpperCase() });
    if (!p.foto) return inicial;
    var img = el('img', { class: 'perfil-foto', src: p.foto, alt: '' });
    img.onerror = function () { img.replaceWith(inicial); };
    return img;
  }

  // Reduz a foto enviada para 256×256 (corte central) e guarda junto com os dados.
  function lerFoto(arquivo, pronto) {
    var leitor = new FileReader();
    leitor.onload = function () {
      var img = new Image();
      img.onload = function () {
        var lado = Math.min(img.width, img.height), tam = 256;
        var c = document.createElement('canvas');
        c.width = c.height = tam;
        c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, tam, tam);
        pronto(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = function () { UI.aviso('Não foi possível ler essa imagem'); };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  }

  function editarPerfil() {
    var p = Dados.db.perfil || {};
    var foto = p.foto || '';
    var previa = el('div', { class: 'perfil-previa' });
    function desenharPrevia() { previa.innerHTML = ''; previa.appendChild(fotoPerfil({ nome: nome.value, foto: foto })); }
    var nome = el('input', { type: 'text', value: p.nome || '', placeholder: 'Seu nome' });
    var arquivo = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: function () {
      if (arquivo.files[0]) lerFoto(arquivo.files[0], function (url) { foto = url; desenharPrevia(); });
    } });
    desenharPrevia();

    UI.modal('Perfil', [
      el('div', { class: 'perfil-editar-foto' }, [
        previa,
        el('div', { class: 'pasta-acoes' }, [
          UI.botao('Trocar foto…', function () { arquivo.click(); }, 'btn-secundario'),
          UI.botao('Remover', function () { foto = ''; desenharPrevia(); }, 'btn-secundario'),
          arquivo
        ])
      ]),
      UI.campo('Nome', nome, 'A frase abaixo do nome é escolhida automaticamente e muda todo dia.')
    ], [
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: 'Salvar', classe: 'btn-primario', acao: function () {
        Dados.atualizarPerfil({ nome: nome.value.trim(), foto: foto });
        App.atualizar();
        UI.aviso('Perfil atualizado');
      } }
    ]);
  }

  function render(raiz) {
    var hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    raiz.appendChild(el('div', { class: 'pagina-topo' }, el('div', null, [
      el('h1', { class: 'pagina-titulo', text: 'Dashboard' }),
      el('div', { class: 'pagina-subtitulo', text: hoje.charAt(0).toUpperCase() + hoje.slice(1) })
    ])));

    if (Dados.estaVazio()) {
      raiz.appendChild(el('div', { class: 'vazio' }, [
        el('p', { class: 'vazio-destaque', text: 'Bem-vindo! Comece cadastrando suas disciplinas.' }),
        el('p', { text: 'Depois monte o ciclo de estudos aqui e lance cada sessão de estudo.' }),
        el('div', { class: 'vazio-acoes' }, [
          el('a', { class: 'btn btn-primario', href: '#/teoria', text: 'Ir para o Controle de Teoria' }),
          UI.botao('Carregar dados de exemplo', function () { Dados.carregarExemplo(); App.atualizar(); }, 'btn-secundario')
        ])
      ]));
      return;
    }

    raiz.appendChild(linhaTopo());
    raiz.appendChild(indicadores());
    raiz.appendChild(el('div', { class: 'grade-topo' }, [
      cartaoProxima(),
      el('div', { class: 'coluna-lateral' }, [cartaoPerfil(), painelCiclo()])
    ]));
    raiz.appendChild(graficos());
  }

  return { render: render };
})();
