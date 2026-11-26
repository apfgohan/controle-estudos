// Aba "Lei Seca": leis limpas (sem revogados e citações de alteração), em cartões por artigo, com marcações,
// remissões mostradas no lugar e os trechos cobrados nas questões do TEC, com a importância de cada artigo.
var LeiSeca = (function () {
  var el = UI.el;
  var v = null; // lei aberta: { rec, mapa, estat, filtros, editando, raiz }
  var filtrosPadrao = { busca: '', ordem: 'lei', filtro: 'tudo' };
  var timerSalvar = null;

  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) { return LeiSecaLer.semAcento(String(s || '')).toLowerCase().replace(/\s+/g, ' '); }
  function anoAtual() { return Number(UI.hoje().slice(0, 4)); }

  // ---------- Lista de leis ----------
  function render(raiz, partes) {
    if (partes && partes[0]) return renderLei(raiz, partes[0]);
    v = null;
    raiz.appendChild(el('div', { class: 'pagina-topo' }, [
      el('div', null, [
        el('h1', { class: 'pagina-titulo', text: 'Lei Seca' }),
        el('div', { class: 'pagina-subtitulo', text: 'A lei limpa (sem revogados e sem as citações de alteração), com os trechos cobrados nas questões do TEC e a importância de cada artigo.' })
      ]),
      botaoImportarLei()
    ]));
    var caixa = el('div', { class: 'leis-lista' }, el('p', { class: 'data-fraca', text: 'Carregando…' }));
    raiz.appendChild(caixa);
    LeiSecaDados.listarComNuvem().then(function (lista) {
      caixa.innerHTML = '';
      if (!lista.length) {
        caixa.appendChild(el('div', { class: 'vazio' }, [
          el('p', { class: 'vazio-destaque', text: 'Nenhuma lei importada ainda.' }),
          el('p', { text: 'No site do Planalto, abra a lei (versão compilada) e salve a página (.html) ou imprima em PDF. Depois importe aqui.' })
        ]));
        return;
      }
      lista.forEach(function (l) {
        var d = l.disciplinaId && Dados.disciplina(l.disciplinaId);
        caixa.appendChild(el('a', { class: 'lei-item', href: '#/lei-seca/' + l.id }, [
          el('div', { class: 'lei-item-nome' }, [UI.icone('livro'), el('span', { text: l.nome || 'Lei sem nome' })]),
          el('div', { class: 'lei-item-info' }, [
            d ? el('span', null, [el('span', { class: 'bolinha', style: { background: d.cor } }), ' ' + d.nome]) : null,
            el('span', { text: UI.fmtNum(l.artigos || 0) + ' artigos' }),
            el('span', { text: UI.fmtNum(l.questoes || 0) + ' questões' }),
            l.naNuvem ? el('span', { class: 'data-fraca', text: 'na nuvem' }) : null
          ])
        ]));
      });
    }).catch(function (e) { caixa.innerHTML = ''; caixa.appendChild(el('p', { class: 'erro-form', text: e.message })); });
  }

  function botaoImportarLei() {
    var arq = el('input', { type: 'file', accept: '.pdf,.html,.htm,application/pdf,text/html', hidden: true, onchange: function () {
      var f = arq.files[0]; arq.value = '';
      if (f) importarLei(f);
    } });
    return el('div', null, [UI.botao('Importar lei (PDF ou HTML)', function () { arq.click(); }, 'btn-primario', 'upload'), arq]);
  }

  function erro(texto) { UI.modal('Não foi possível importar', el('p', { text: texto }), [{ texto: 'Fechar', classe: 'btn-secundario' }]); }

  function importarLei(arquivo) {
    UI.aviso('Lendo a lei…');
    LeiSecaLer.lerArquivo(arquivo).then(function (lido) {
      var L = LeiSecaLer.montar(lido);
      if (!L.artigos.length) return erro('Não encontrei artigos neste arquivo. Use a lei compilada do Planalto (página salva em .html ou impressa em PDF com texto, não escaneada).');
      var nome = el('input', { type: 'text', value: L.nome || arquivo.name.replace(/\.\w+$/, '') });
      var disc = el('select', null, [el('option', { value: '', text: '— nenhuma —' })].concat(Dados.disciplinas().map(function (d) { return el('option', { value: d.id, text: d.nome }); })));
      var nPartes = L.artigos.reduce(function (s, a) { return s + a.partes.length; }, 0);
      var c = L.cont;
      UI.modal('Conferir a lei', [
        UI.campo('Nome', nome),
        UI.campo('Matéria (opcional)', disc),
        el('ul', { class: 'lei-conferir' }, [
          el('li', null, [el('strong', { text: UI.fmtNum(L.artigos.length) + ' artigos' }), ' · ' + UI.fmtNum(nPartes) + ' dispositivos (caput, parágrafos, incisos e alíneas)']),
          el('li', { text: UI.fmtNum(L.divisoes.length) + ' divisões (títulos, capítulos, seções)' }),
          el('li', { text: UI.fmtNum(c.riscados) + ' trechos riscados (revogados) removidos' + (lido.origem === 'pdf' && !c.riscados ? ' — nenhum risco encontrado no PDF; se a lei tiver revogações, prefira a página salva (.html)' : '') }),
          el('li', { text: UI.fmtNum(c.citacoes) + ' citações de alteração removidas ("Redação dada", "Incluído", "Vide"…)' }),
          c.descartados ? el('li', { text: UI.fmtNum(c.descartados) + ' dispositivos revogados ou vetados descartados' }) : null,
          c.repetidos ? el('li', { text: UI.fmtNum(c.repetidos) + ' redações antigas repetidas descartadas (fica a última, a vigente)' }) : null
        ]),
        el('div', { class: 'lei-previa' }, L.artigos.slice(0, 2).map(function (a) {
          return el('div', null, a.partes.slice(0, 4).map(function (p) { return el('p', null, [el('strong', { text: (p.tipo === 'caput' ? a.rotulo + '.' : p.rotulo) + ' ' }), p.texto]); }));
        }))
      ], [
        { texto: 'Cancelar', classe: 'btn-secundario' },
        { texto: 'Salvar lei', classe: 'btn-primario', acao: function () {
          var rec = { id: LeiSecaDados.novoId(), nome: nome.value.trim() || 'Lei', disciplinaId: disc.value, origem: lido.origem, nomeArquivo: arquivo.name,
            criadaEm: Date.now(), divisoes: L.divisoes, artigos: L.artigos, cont: L.cont,
            marcas: {}, atencao: {}, removidas: {}, lotes: [], ligacoes: {}, manuais: {} };
          LeiSecaDados.salvar(rec).then(function () { location.hash = '#/lei-seca/' + rec.id; UI.aviso('Lei salva'); });
        } }
      ]).caixa.classList.add('modal-largo');
    }).catch(function (e) { console.error(e); erro(e.message || 'Não foi possível ler o arquivo.'); });
  }

  // ---------- Índices e estatística ----------
  function mapear(rec) {
    var partes = {}, artigos = {};
    rec.artigos.forEach(function (a) {
      artigos[a.id] = a;
      a.partes.forEach(function (p) { partes[p.id] = { p: p, a: a }; });
    });
    return { partes: partes, artigos: artigos };
  }

  // Nome completo de um dispositivo: "Art. 20, § 1º, II, a)".
  function rotuloCompleto(mapa, id) {
    var x = mapa.partes[id];
    if (!x) return id;
    var cadeia = [], p = x.p;
    while (p && p.tipo !== 'caput') { cadeia.unshift(p.rotulo.replace(/\s*–$/, '')); p = p.pai && mapa.partes[p.pai] ? mapa.partes[p.pai].p : null; }
    return [x.a.rotulo].concat(cadeia).join(', ');
  }

  function todasQuestoes(rec) {
    var porId = {}, lista = [];
    (rec.lotes || []).forEach(function (l) { l.questoes.forEach(function (q) { if (!porId[q.id]) { porId[q.id] = q; lista.push(q); } }); });
    return lista;
  }

  function ligacoesDe(rec, mapa, q) {
    if (rec.manuais && Object.prototype.hasOwnProperty.call(rec.manuais, q.id)) {
      var alvo = rec.manuais[q.id];
      return alvo && mapa.partes[alvo] ? [{ parte: alvo, art: mapa.partes[alvo].a.id, principal: true, manual: true, trecho: '' }] : [];
    }
    return ((rec.ligacoes || {})[q.id] || []).filter(function (l) { return mapa.partes[l.parte]; });
  }

  // Questões por dispositivo e por artigo; peso: principal 1, secundária 0,5; mais de 5 anos vale metade.
  function estatistica(rec, mapa) {
    var porParte = {}, porArt = {}, semLigacao = [], questoes = todasQuestoes(rec), limite = anoAtual() - 4;
    questoes.forEach(function (q) {
      var ligs = ligacoesDe(rec, mapa, q);
      if (!ligs.length) { semLigacao.push(q); return; }
      var fator = q.ano && q.ano < limite ? 0.5 : 1;
      ligs.forEach(function (l) {
        (porParte[l.parte] = porParte[l.parte] || []).push({ q: q, l: l });
        var a = porArt[l.art] || (porArt[l.art] = { peso: 0, questoes: {} });
        if (!a.questoes[q.id]) { a.peso += (l.principal ? 1 : 0.5) * fator; a.questoes[q.id] = q; }
      });
    });
    var pesos = Object.keys(porArt).map(function (k) { return porArt[k].peso; });
    var media = pesos.length ? pesos.reduce(function (s, n) { return s + n; }, 0) / pesos.length : 0;
    Object.keys(porArt).forEach(function (k) {
      var a = porArt[k];
      a.n = Object.keys(a.questoes).length;
      a.estrelas = media > 0 ? Dados.estrelasPorRazao(a.peso / media) : 0;
    });
    return { porParte: porParte, porArt: porArt, semLigacao: semLigacao, total: questoes.length, ligadas: questoes.length - semLigacao.length };
  }

  // ---------- Lei aberta ----------
  function renderLei(raiz, id) {
    var mesma = v && v.rec && v.rec.id === id;
    if (!mesma) v = { id: id, rec: null, filtros: Object.assign({}, filtrosPadrao), editando: false };
    v.raiz = raiz;
    if (v.rec) return desenhar();
    raiz.appendChild(el('p', { class: 'data-fraca', text: 'Abrindo a lei…' }));
    LeiSecaDados.sincronizar(id).then(function (rec) {
      if (!v || v.id !== id || location.hash.indexOf(id) < 0) return;
      if (!rec) { raiz.innerHTML = ''; raiz.appendChild(el('p', { class: 'erro-form', text: 'Lei não encontrada.' })); return; }
      v.rec = rec;
      App.atualizar();
    });
  }

  function salvarRec() {
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(function () { if (v && v.rec) LeiSecaDados.salvar(v.rec); }, 600);
  }

  function desenhar() {
    var rec = v.rec, raiz = v.raiz;
    v.mapa = mapear(rec);
    v.estat = estatistica(rec, v.mapa);
    var e = v.estat;
    var d = rec.disciplinaId && Dados.disciplina(rec.disciplinaId);
    raiz.appendChild(el('div', { class: 'pagina-topo lei-topo' }, [
      el('div', null, [
        el('a', { class: 'link', href: '#/lei-seca', text: '← Leis' }),
        el('h1', { class: 'pagina-titulo', text: rec.nome }),
        el('div', { class: 'pagina-subtitulo' }, [
          d ? el('span', null, [el('span', { class: 'bolinha', style: { background: d.cor } }), ' ' + d.nome + ' · ']) : null,
          UI.fmtNum(rec.artigos.length) + ' artigos · ' + UI.fmtNum(e.total) + ' questões' + (e.total ? ' (' + UI.fmtNum(e.ligadas) + ' ligadas a artigos)' : '')
        ])
      ]),
      el('div', { class: 'lei-topo-acoes' }, [botaoImportarQuestoes(), UI.botao('Dados da lei', editarDados, 'btn-secundario')])
    ]));
    raiz.appendChild(barraFerramentas());
    var lista = el('div', { class: 'lei-cartoes' });
    raiz.appendChild(lista);
    desenharCartoes(lista);
    raiz.appendChild(painelQuestoes());
  }

  // Busca, ordem, filtro, edição e a barra de destaque (fica presa no topo ao rolar).
  function barraFerramentas() {
    var f = v.filtros;
    var busca = el('input', { type: 'search', class: 'lei-busca', placeholder: 'Buscar: "art 20", "estágio probatório"…', value: f.busca });
    var timer = null;
    busca.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        f.busca = busca.value;
        var m = f.busca.trim().match(/^art(?:igo)?\.?\s*(\d+(?:-[a-z])?)\s*$/i);
        if (m) { irPara('art-' + m[1].toLowerCase()); return; }
        var lista = v.raiz.querySelector('.lei-cartoes'); desenharCartoes(lista);
      }, 250);
    });
    busca.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var m = busca.value.trim().match(/^art(?:igo)?\.?\s*(\d+(?:-[a-z])?)/i); if (m) irPara('art-' + m[1].toLowerCase()); } });
    function chip(valor, texto) {
      return el('button', { type: 'button', class: 'chip-filtro' + (f.filtro === valor ? ' ativo' : ''), text: texto, onclick: function () { f.filtro = valor; App.atualizar(); } });
    }
    var ordem = el('select', { onchange: function () { f.ordem = ordem.value; App.atualizar(); } }, [
      el('option', { value: 'lei', text: 'Ordem da lei', selected: f.ordem === 'lei' }),
      el('option', { value: 'cobrados', text: 'Mais cobrados primeiro', selected: f.ordem === 'cobrados' })
    ]);
    var editar = UI.botao(v.editando ? 'Concluir edição' : 'Editar texto', function () { v.editando = !v.editando; App.atualizar(); }, v.editando ? 'btn-primario' : 'btn-secundario', 'lapis');

    var cores = Leitor.CORES.map(function (c, i) {
      return el('button', { type: 'button', class: 'lei-cor', style: { background: c[1] }, title: 'Marca-texto ' + c[0] + ' (' + (i + 1) + ')', onmousedown: function (e) { e.preventDefault(); marcar(c[1]); } });
    });
    function cmd(nome, valor, titulo, conteudo) {
      return el('button', { type: 'button', class: 'lei-cmd', title: titulo, onmousedown: function (e) { e.preventDefault(); formatar(nome, valor); } }, conteudo);
    }
    return el('div', { class: 'lei-barra' }, [
      el('div', { class: 'lei-barra-linha' }, [busca, ordem, chip('tudo', 'Tudo'), chip('cobrados', 'Só cobrados'), chip('4', '★★★★ ou mais'), editar]),
      el('div', { class: 'lei-barra-linha lei-destaques' }, [el('span', { class: 'data-fraca', text: 'Destacar:' })].concat(cores).concat([
        el('span', { class: 'lei-sep' }),
        cmd('bold', null, 'Negrito (Ctrl+B)', el('b', { text: 'N' })),
        cmd('underline', null, 'Sublinhado (Ctrl+U)', el('u', { text: 'S' })),
        cmd('italic', null, 'Itálico (Ctrl+I)', el('i', { text: 'I' })),
        cmd('foreColor', '#e24b4a', 'Texto em vermelho', el('span', { class: 'lei-a-vermelho', text: 'A' })),
        el('button', { type: 'button', class: 'lei-cmd', title: 'Caixa de atenção no dispositivo', onmousedown: function (e) { e.preventDefault(); alternarAtencao(); } }, UI.icone('alerta')),
        el('span', { class: 'lei-sep' }),
        cmd('removeFormat', null, 'Limpar os destaques do trecho selecionado', el('span', { text: 'Limpar' }))
      ]))
    ]);
  }

  function irPara(artId) {
    var c = v.raiz.querySelector('[data-art="' + artId + '"]');
    if (!c) {
      v.filtros.busca = ''; v.filtros.filtro = 'tudo';
      desenharCartoes(v.raiz.querySelector('.lei-cartoes'));
      c = v.raiz.querySelector('[data-art="' + artId + '"]');
    }
    if (!c) { UI.aviso('Artigo não encontrado'); return; }
    c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    c.classList.add('lei-piscar'); setTimeout(function () { c.classList.remove('lei-piscar'); }, 1600);
  }

  // ---------- Cartões ----------
  function desenharCartoes(lista) {
    lista.innerHTML = '';
    var rec = v.rec, f = v.filtros, e = v.estat;
    var arts = rec.artigos.slice();
    var termo = norm(f.busca.trim());
    if (/^art(?:igo)?\.?\s*\d/.test(termo)) termo = '';
    arts = arts.filter(function (a) {
      var ea = e.porArt[a.id];
      if (f.filtro === 'cobrados' && !ea) return false;
      if (f.filtro === '4' && !(ea && ea.estrelas >= 4)) return false;
      if (termo && !a.partes.some(function (p) { return norm(p.texto).indexOf(termo) >= 0; }) && norm(a.rubrica || '').indexOf(termo) < 0) return false;
      return true;
    });
    if (f.ordem === 'cobrados') arts.sort(function (x, y) { return ((e.porArt[y.id] || {}).peso || 0) - ((e.porArt[x.id] || {}).peso || 0); });
    if (!arts.length) { lista.appendChild(el('p', { class: 'data-fraca', text: 'Nenhum artigo com esse filtro.' })); return; }
    var ultimaDiv = -1;
    arts.forEach(function (a) {
      if (f.ordem === 'lei' && a.divisao != null && a.divisao !== ultimaDiv) {
        // Divisões entre o artigo anterior e este (título, capítulo, seção).
        for (var k = ultimaDiv + 1; k <= a.divisao; k++) {
          var dv = rec.divisoes[k];
          if (dv) lista.appendChild(el('div', { class: 'lei-divisao nivel-' + (dv.nivel || 0) }, [el('span', { text: dv.rotulo }), dv.nome ? el('strong', { text: dv.nome }) : null]));
        }
        ultimaDiv = a.divisao;
      }
      lista.appendChild(cartao(a));
    });
  }

  function estrelas(n) {
    return el('span', { class: 'lei-estrelas', title: n ? 'Importância: ' + n + ' de 5' : 'Sem questões' }, [1, 2, 3, 4, 5].map(function (i) { return el('span', { class: i <= n ? 'cheia' : '', text: '★' }); }));
  }

  function cartao(a) {
    var rec = v.rec, ea = v.estat.porArt[a.id];
    var calor = ea ? Math.min(5, ea.estrelas) : 0;
    var corpo = el('div', { class: 'lei-cartao-corpo' });
    a.partes.forEach(function (p) {
      if (rec.removidas[p.id] && !v.editando) return;
      corpo.appendChild(parte(a, p));
    });
    return el('article', { class: 'lei-cartao calor-' + calor, 'data-art': a.id }, [
      el('header', { class: 'lei-cartao-topo' }, [
        el('div', { class: 'lei-cartao-titulo' }, [el('strong', { text: a.rotulo }), a.rubrica ? el('span', { text: ' · ' + a.rubrica }) : null]),
        el('div', { class: 'lei-cartao-info' }, [
          estrelas(ea ? ea.estrelas : 0),
          ea ? el('button', { type: 'button', class: 'lei-selo-q', text: ea.n + (ea.n === 1 ? ' questão' : ' questões'), onclick: function () { verQuestoes(a); } }) : null
        ])
      ]),
      corpo
    ]);
  }

  function parte(a, p) {
    var rec = v.rec;
    var texto = el('span', { class: 'lei-texto', contenteditable: 'true', spellcheck: 'false', 'data-id': p.id });
    texto.innerHTML = rec.marcas[p.id] != null ? rec.marcas[p.id] : esc(p.texto);
    decorar(texto, a, p);
    texto.addEventListener('beforeinput', function (e) {
      if (v.editando) return;
      if (/^format/.test(e.inputType) || /^history/.test(e.inputType)) return;
      e.preventDefault();
    });
    texto.addEventListener('input', function () { guardarMarcas(texto, p); });
    texto.addEventListener('keydown', function (e) {
      if (v.editando || e.ctrlKey || e.metaKey || e.altKey) return;
      var n = Number(e.key);
      if (n >= 1 && n <= Leitor.CORES.length) { e.preventDefault(); marcar(Leitor.CORES[n - 1][1]); }
    });
    var ligadas = v.estat.porParte[p.id] || [];
    var div = el('div', { class: 'lei-parte tipo-' + p.tipo + (rec.atencao[p.id] ? ' atencao' : '') + (rec.removidas[p.id] ? ' removida' : '') + (ligadas.length ? ' cobrada' : ''), 'data-parte': p.id }, [
      p.rubrica ? el('div', { class: 'lei-rubrica', text: p.rubrica }) : null,
      el('span', { class: 'lei-rotulo', text: p.tipo === 'caput' ? '' : p.rotulo + ' ' }),
      texto,
      v.editando ? el('span', { class: 'lei-parte-acoes' }, [
        rec.marcas[p.id] != null ? el('button', { type: 'button', class: 'link', text: 'texto original', title: 'Voltar ao texto extraído da lei (apaga as marcações deste dispositivo)', onclick: function () { delete rec.marcas[p.id]; salvarRec(); App.atualizar(); } }) : null,
        el('button', { type: 'button', class: 'link link-perigo', text: rec.removidas[p.id] ? 'restaurar' : 'remover', onclick: function () {
          if (rec.removidas[p.id]) delete rec.removidas[p.id]; else rec.removidas[p.id] = true;
          salvarRec(); App.atualizar();
        } })
      ]) : null
    ]);
    return div;
  }

  // ---------- Decoração (não é gravada): trechos cobrados e remissões ----------
  function nosDeTexto(raiz) {
    var r = [], w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { return n.parentNode.closest('.lei-ref') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
    while (w.nextNode()) r.push(w.currentNode);
    return r;
  }
  // Envolve o intervalo [ini, fim) do texto (que pode atravessar várias tags) em elementos criados por "criar".
  function envolver(raiz, ini, fim, criar) {
    var pos = 0;
    nosDeTexto(raiz).forEach(function (n) {
      var a = pos, b = pos + n.data.length; pos = b;
      if (b <= ini || a >= fim) return;
      var de = Math.max(0, ini - a), ate = Math.min(n.data.length, fim - a);
      var meio = n;
      if (de > 0) meio = n.splitText(de);
      if (ate - de < meio.data.length) meio.splitText(ate - de);
      var w = criar(); meio.parentNode.insertBefore(w, meio); w.appendChild(meio);
    });
  }
  function inserirEm(raiz, posicao, no) {
    var pos = 0, feito = false;
    nosDeTexto(raiz).forEach(function (n) {
      if (feito) return;
      var b = pos + n.data.length;
      if (posicao <= b) {
        var depois = n.splitText(posicao - pos);
        depois.parentNode.insertBefore(no, depois);
        feito = true;
      }
      pos = b;
    });
    if (!feito) raiz.appendChild(no);
  }

  function decorar(elTexto, a, p) {
    var plano = elTexto.textContent, mapa = v.mapa;
    // Trechos cobrados (a parte exata em comum com as questões).
    var vistos = {};
    (v.estat.porParte[p.id] || []).forEach(function (x) {
      var t = x.l.trecho;
      if (!t || vistos[t]) return;
      vistos[t] = true;
      var i = plano.indexOf(t);
      if (i < 0) { i = norm(plano).indexOf(norm(t)); if (i < 0) return; }
      envolver(elTexto, i, i + t.length, function () { return el('span', { class: 'lei-cobrado', 'data-temp': '1', title: 'Trecho cobrado em questão' }); });
    });
    // Remissões: o texto do dispositivo citado aparece entre parênteses logo depois da citação.
    var ctx = { art: a.id, par: p.tipo === 'par' ? p.id : (p.pai && /-p(\d|u)/.test(p.pai) ? p.pai.replace(/(-p(?:u|\d+[a-z-]*)).*$/, '$1') : null), parte: p.id };
    var achados = LeiSecaLer.remissoes(plano, ctx, function (id) { return !!mapa.partes[id] || !!mapa.artigos[id]; });
    achados.reverse().forEach(function (r) {
      var textos = r.alvos.map(function (id) {
        var x = mapa.partes[id];
        if (!x) return '';
        return (x.p.tipo === 'caput' ? '' : x.p.tipo === 'ali' ? x.p.rotulo + ' ' : x.p.rotulo.replace(/\s*–$/, '') + ' – ') + x.p.texto;
      }).filter(Boolean);
      if (!textos.length) return;
      var cheio = textos.join(' ');
      var ref = el('span', { class: 'lei-ref', contenteditable: 'false', 'data-temp': '1', title: r.alvos.map(function (id) { return rotuloCompleto(mapa, id); }).join('; ') });
      function mostrar(tudo) {
        ref.innerHTML = '';
        ref.appendChild(document.createTextNode('(' + (tudo || cheio.length <= 300 ? cheio : cheio.slice(0, 280).replace(/\s+\S*$/, '') + '…')));
        if (cheio.length > 300) ref.appendChild(el('button', { type: 'button', class: 'lei-ref-mais', text: tudo ? 'menos' : 'ver tudo', onclick: function (e) { e.preventDefault(); mostrar(!tudo); } }));
        ref.appendChild(document.createTextNode(')'));
      }
      mostrar(false);
      inserirEm(elTexto, r.fim, ref);
      inserirEm(elTexto, r.fim, document.createTextNode(' '));
    });
  }

  // Grava as marcações do dispositivo (sem a decoração).
  function guardarMarcas(elTexto, p) {
    var c = elTexto.cloneNode(true);
    c.querySelectorAll('.lei-ref').forEach(function (n) { if (n.previousSibling && n.previousSibling.nodeType === 3 && n.previousSibling.data === ' ') n.previousSibling.remove(); n.remove(); });
    c.querySelectorAll('[data-temp]').forEach(function (n) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); });
    c.normalize();
    var html = c.innerHTML;
    if (html === esc(p.texto)) delete v.rec.marcas[p.id]; else v.rec.marcas[p.id] = html;
    salvarRec();
  }

  function dentroDeTexto() {
    var s = window.getSelection();
    if (!s.rangeCount) return null;
    var n = s.anchorNode;
    var t = n && (n.nodeType === 1 ? n : n.parentNode).closest('.lei-texto');
    return t && v && v.raiz.contains(t) ? t : null;
  }
  function formatar(nome, valor) {
    var t = dentroDeTexto();
    if (!t) { UI.aviso('Selecione um trecho da lei primeiro'); return; }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(nome, false, valor || null);
  }
  function marcar(cor) {
    var t = dentroDeTexto(), s = window.getSelection();
    if (!t || s.isCollapsed) { UI.aviso('Selecione um trecho da lei primeiro'); return; }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('hiliteColor', false, cor);
    s.removeAllRanges();
  }
  function alternarAtencao() {
    var t = dentroDeTexto();
    if (!t) { UI.aviso('Clique em um dispositivo da lei primeiro'); return; }
    var id = t.getAttribute('data-id');
    if (v.rec.atencao[id]) delete v.rec.atencao[id]; else v.rec.atencao[id] = true;
    t.closest('.lei-parte').classList.toggle('atencao', !!v.rec.atencao[id]);
    salvarRec();
  }

  // ---------- Questões ----------
  function botaoImportarQuestoes() {
    var arq = el('input', { type: 'file', accept: '.pdf,application/pdf', multiple: true, hidden: true, onchange: function () {
      var fs = Array.prototype.slice.call(arq.files); arq.value = '';
      if (fs.length) importarQuestoes(fs);
    } });
    return el('span', null, [UI.botao('Importar questões (PDF do TEC)', function () { arq.click(); }, 'btn-primario', 'upload'), arq]);
  }

  function importarQuestoes(arquivos) {
    var rec = v.rec;
    UI.aviso('Lendo ' + (arquivos.length === 1 ? 'o caderno' : arquivos.length + ' arquivos') + '…');
    var ix = LeiSecaQuestoes.indice(rec);
    var jaTem = {}; todasQuestoes(rec).forEach(function (q) { jaTem[q.id] = true; });
    Promise.all(arquivos.map(function (f) { return LeiSecaQuestoes.lerPdf(f).then(function (r) { r.arquivo = f; return r; }); })).then(function (lidos) {
      var novos = [], repetidas = 0, avisos = [];
      lidos.forEach(function (r) {
        r.avisos.forEach(function (a) { avisos.push(r.arquivo.name + ': ' + a); });
        var qs = r.questoes.filter(function (q) { if (jaTem[q.id]) { repetidas++; return false; } jaTem[q.id] = true; return true; });
        if (qs.length) novos.push({ id: LeiSecaDados.novoId(), nomeArquivo: r.arquivo.name, titulo: r.titulo, importadoEm: Date.now(), questoes: qs });
      });
      var ligs = {}, ligadas = 0, total = 0;
      novos.forEach(function (l) { l.questoes.forEach(function (q) { total++; ligs[q.id] = LeiSecaQuestoes.ligar(ix, q); if (ligs[q.id].length) ligadas++; }); });
      if (!total) {
        if (repetidas && !avisos.length) return UI.modal('Nada novo para importar', el('p', { text: 'Todas as ' + repetidas + ' questões destes arquivos já estavam importadas.' }), [{ texto: 'Fechar', classe: 'btn-secundario' }]);
        return erro(avisos.length ? avisos.join(' ') : 'Nenhuma questão encontrada.');
      }
      UI.modal('Conferir as questões', [
        el('ul', { class: 'lei-conferir' }, [
          el('li', null, [el('strong', { text: UI.fmtNum(total) + ' questões novas' }), ' em ' + novos.length + (novos.length === 1 ? ' arquivo' : ' arquivos')]),
          repetidas ? el('li', { text: UI.fmtNum(repetidas) + ' já estavam importadas e foram ignoradas' }) : null,
          el('li', { text: UI.fmtNum(ligadas) + ' ligadas a artigos desta lei' }),
          total - ligadas ? el('li', { text: UI.fmtNum(total - ligadas) + ' sem ligação (podem ser de outra lei; dá para ligar à mão depois)' }) : null
        ].concat(avisos.map(function (a) { return el('li', { class: 'txt-alerta', text: a }); })))
      ], [
        { texto: 'Cancelar', classe: 'btn-secundario' },
        { texto: 'Importar', classe: 'btn-primario', acao: function () {
          novos.forEach(function (l) { rec.lotes.push(l); });
          Object.keys(ligs).forEach(function (id) { rec.ligacoes[id] = ligs[id]; });
          LeiSecaDados.salvar(rec).then(function () { App.atualizar(); UI.aviso(UI.fmtNum(total) + ' questões importadas'); });
        } }
      ]);
    }).catch(function (e) { console.error(e); erro(e.message || 'Não foi possível ler o PDF.'); });
  }

  // Lista de dispositivos para ligar uma questão à mão.
  function seletorDispositivo(atual, aoEscolher) {
    var mapa = v.mapa, cheia = false;
    function opcao(p) { return el('option', { value: p.id, text: rotuloCompleto(mapa, p.id) + ' – ' + p.texto.slice(0, 60), selected: atual === p.id }); }
    // A lista com todos os dispositivos só é montada quando o seletor é aberto (leis grandes têm milhares).
    var sel = el('select', { class: 'lei-ligar', onchange: function () { aoEscolher(sel.value); } }, [
      el('option', { value: '__auto', text: 'Ligação automática' }),
      el('option', { value: '', text: '— sem ligação —', selected: atual === '' }),
      atual && mapa.partes[atual] ? opcao(mapa.partes[atual].p) : null
    ]);
    function encher() {
      if (cheia) return;
      cheia = true;
      if (atual && mapa.partes[atual]) sel.removeChild(sel.lastChild);
      var frag = document.createDocumentFragment();
      v.rec.artigos.forEach(function (a) { a.partes.forEach(function (p) { frag.appendChild(opcao(p)); }); });
      sel.appendChild(frag);
    }
    sel.addEventListener('mousedown', encher);
    sel.addEventListener('focus', encher);
    sel.addEventListener('keydown', encher);
    return sel;
  }
  function religar(q, valor) {
    if (valor === '__auto') delete v.rec.manuais[q.id]; else v.rec.manuais[q.id] = valor;
    LeiSecaDados.salvar(v.rec).then(function () { App.atualizar(); });
  }

  function blocoQuestao(q, ligs, fechar) {
    var mapa = v.mapa;
    var manual = Object.prototype.hasOwnProperty.call(v.rec.manuais, q.id) ? v.rec.manuais[q.id] : null;
    return el('div', { class: 'lei-questao' }, [
      el('div', { class: 'lei-questao-topo' }, [
        el('a', { href: 'https://www.tecconcursos.com.br/questoes/' + q.id, target: '_blank', rel: 'noopener', text: q.cabecalho || (q.banca + ' ' + (q.ano || '')) }),
        ligs && ligs.length ? el('span', { class: 'data-fraca', text: ligs.map(function (l) { return rotuloCompleto(mapa, l.parte) + (l.manual ? ' (à mão)' : ''); }).join(' · ') }) : null
      ]),
      el('p', { class: 'lei-questao-enunciado', text: q.enunciado }),
      q.tipo === 'ce' ? el('div', { class: 'lei-questao-gab', text: 'Gabarito: ' + (q.gabarito || '?') })
        : el('ol', { class: 'lei-questao-alts' }, q.alternativas.map(function (a) {
            return el('li', { class: a.letra === String(q.gabarito).toUpperCase() ? 'certa' : '' }, [el('strong', { text: a.letra.toLowerCase() + ') ' }), a.texto]);
          })),
      el('label', { class: 'lei-questao-ligar' }, ['Ligar a: ', seletorDispositivo(manual, function (valor) { if (fechar) fechar(); religar(q, valor); })])
    ]);
  }

  function verQuestoes(a) {
    var ea = v.estat.porArt[a.id];
    if (!ea) return;
    var qs = Object.keys(ea.questoes).map(function (id) { return ea.questoes[id]; }).sort(function (x, y) { return (y.ano || 0) - (x.ano || 0); });
    var m = UI.modal(a.rotulo + (a.rubrica ? ' · ' + a.rubrica : ''), [
      el('p', { class: 'modal-desc', text: qs.length + (qs.length === 1 ? ' questão' : ' questões') + ' · importância ' + ea.estrelas + ' de 5' }),
      el('div', { class: 'lei-questoes' }, qs.map(function (q) { return blocoQuestao(q, ligacoesDe(v.rec, v.mapa, q), function () { m.fechar(); }); }))
    ], [{ texto: 'Fechar', classe: 'btn-secundario' }]);
    m.caixa.classList.add('modal-largo');
  }

  // Arquivos de questões e as questões sem ligação.
  function painelQuestoes() {
    var rec = v.rec, e = v.estat;
    if (!rec.lotes.length) return el('section', { class: 'painel' }, [
      el('h2', { class: 'secao-titulo', text: 'Questões' }),
      el('p', { class: 'data-fraca', text: 'No TEC, abra um caderno com as questões desta lei e use "Imprimir" → salvar em PDF. Dá para importar vários PDFs; as questões repetidas contam uma vez.' })
    ]);
    return el('section', { class: 'painel' }, [
      el('h2', { class: 'secao-titulo', text: 'Arquivos de questões' }),
      el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela' }, [
        el('thead', null, el('tr', null, ['Arquivo', 'Questões', 'Importado em', ''].map(function (h) { return el('th', { text: h }); }))),
        el('tbody', null, rec.lotes.map(function (l) {
          return el('tr', null, [
            el('td', null, [el('div', { class: 'data-forte', text: l.titulo || l.nomeArquivo }), el('div', { class: 'data-fraca', text: l.nomeArquivo })]),
            el('td', { text: UI.fmtNum(l.questoes.length) }),
            el('td', { class: 'data-fraca', text: new Date(l.importadoEm).toLocaleDateString('pt-BR') }),
            el('td', null, el('button', { type: 'button', class: 'link link-perigo', text: 'Excluir', onclick: function () {
              UI.confirmar('Excluir o arquivo "' + l.nomeArquivo + '" e as ' + l.questoes.length + ' questões dele (as que também estão em outro arquivo continuam)?', function () {
                rec.lotes = rec.lotes.filter(function (x) { return x.id !== l.id; });
                var ficam = {}; todasQuestoes(rec).forEach(function (q) { ficam[q.id] = true; });
                Object.keys(rec.ligacoes).forEach(function (id) { if (!ficam[id]) delete rec.ligacoes[id]; });
                Object.keys(rec.manuais).forEach(function (id) { if (!ficam[id]) delete rec.manuais[id]; });
                LeiSecaDados.salvar(rec).then(function () { App.atualizar(); });
              }, 'Excluir');
            } }))
          ]);
        }))
      ])),
      e.semLigacao.length ? el('details', { class: 'lei-sem-ligacao' }, [
        el('summary', { text: e.semLigacao.length + (e.semLigacao.length === 1 ? ' questão sem ligação' : ' questões sem ligação') + ' (de outra lei ou que não cita o texto da lei)' }),
        el('div', { class: 'lei-questoes' }, e.semLigacao.map(function (q) { return blocoQuestao(q, [], null); }))
      ]) : null
    ]);
  }

  function editarDados() {
    var rec = v.rec;
    var nome = el('input', { type: 'text', value: rec.nome });
    var disc = el('select', null, [el('option', { value: '', text: '— nenhuma —' })].concat(Dados.disciplinas().map(function (d) { return el('option', { value: d.id, text: d.nome, selected: d.id === rec.disciplinaId }); })));
    UI.modal('Dados da lei', [UI.campo('Nome', nome), UI.campo('Matéria', disc),
      el('p', { class: 'data-fraca', text: 'Arquivo de origem: ' + (rec.nomeArquivo || '—') + ' (' + (rec.origem || '').toUpperCase() + ')' })], [
      { texto: 'Excluir lei', classe: 'btn-perigo btn-esquerda', acao: function () {
        UI.confirmar('Excluir "' + rec.nome + '" com as marcações e as questões importadas? Não dá para desfazer.', function () {
          LeiSecaDados.apagar(rec.id).then(function () { v = null; location.hash = '#/lei-seca'; UI.aviso('Lei excluída'); });
        }, 'Excluir');
      } },
      { texto: 'Cancelar', classe: 'btn-secundario' },
      { texto: 'Salvar', classe: 'btn-primario', acao: function () {
        rec.nome = nome.value.trim() || rec.nome; rec.disciplinaId = disc.value;
        LeiSecaDados.salvar(rec).then(function () { App.atualizar(); });
      } }
    ]);
  }

  return { render: render };
})();
