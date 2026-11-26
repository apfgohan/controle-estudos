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
          el('div', { class: 'lei-item-nome' }, [UI.icone('livro'), el('span', { text: l.nome || 'Lei sem nome' }),
            el('button', { type: 'button', class: 'lei-item-excluir', title: 'Excluir esta lei', 'aria-label': 'Excluir esta lei', onclick: function (e) {
              e.preventDefault(); e.stopPropagation();
              UI.confirmar('Excluir "' + (l.nome || 'Lei') + '" com as marcações, os comentários e as questões importadas? Não dá para desfazer.', function () {
                LeiSecaDados.apagar(l.id).then(function () { UI.aviso('Lei excluída'); App.atualizar(); });
              }, 'Excluir');
            } }, UI.icone('lixeira'))]),
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

  // Layout A: sumário em árvore à esquerda (busca, filtros, divisões e artigos) e a lei numa folha branca corrida,
  // com uma linha entre os artigos (como nos Resumos).
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
    raiz.appendChild(barraDestaque());
    var nav = el('aside', { class: 'lei-nav' });
    var doc = el('div', { class: 'lei-doc' + (v.marcaTexto ? ' modo-grifo' : '') });
    v.nav = nav; v.doc = doc;
    raiz.appendChild(el('div', { class: 'lei-corpo' }, [nav, el('div', { class: 'lei-folha' }, doc)]));
    desenharLei();
    raiz.appendChild(painelQuestoes());
  }

  // Artigos que passam na busca e no filtro, na ordem escolhida.
  function artigosVisiveis() {
    var rec = v.rec, f = v.filtros, e = v.estat;
    var termo = norm(f.busca.trim());
    if (/^art(?:igo)?\.?\s*\d/.test(termo)) termo = '';
    var arts = rec.artigos.filter(function (a) {
      var ea = e.porArt[a.id];
      if (f.filtro === 'cobrados' && !ea) return false;
      if (f.filtro === '4' && !(ea && ea.estrelas >= 4)) return false;
      if (termo && !a.partes.some(function (p) { return norm(p.texto).indexOf(termo) >= 0; }) && norm(a.rubrica || '').indexOf(termo) < 0) return false;
      return true;
    });
    if (f.ordem === 'cobrados') arts.sort(function (x, y) { return ((e.porArt[y.id] || {}).peso || 0) - ((e.porArt[x.id] || {}).peso || 0); });
    return arts;
  }

  function desenharLei() {
    desenharNav();
    desenharDoc();
  }

  function textoEstrelas(n) { return n ? '★★★★★'.slice(0, n) : ''; }

  // ---------- Sumário (à esquerda) ----------
  function desenharNav() {
    var nav = v.nav, f = v.filtros, rec = v.rec, e = v.estat;
    nav.innerHTML = '';
    var busca = el('input', { type: 'search', class: 'lei-nav-busca', placeholder: 'Buscar: "art 20", "estágio"…', value: f.busca });
    var timer = null;
    busca.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        f.busca = busca.value;
        var m = f.busca.trim().match(/^art(?:igo)?\.?\s*(\d+(?:-[a-z])?)\s*$/i);
        if (m) { irPara('art-' + m[1].toLowerCase()); return; }
        desenharLei(); v.nav.querySelector('.lei-nav-busca').focus();
        var campo = v.nav.querySelector('.lei-nav-busca'); campo.setSelectionRange(campo.value.length, campo.value.length);
      }, 300);
    });
    busca.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { var m = busca.value.trim().match(/^art(?:igo)?\.?\s*(\d+(?:-[a-z])?)/i); if (m) irPara('art-' + m[1].toLowerCase()); } });
    function chip(valor, texto) {
      return el('button', { type: 'button', class: 'chip-filtro' + (f.filtro === valor ? ' ativo' : ''), text: texto, onclick: function () { f.filtro = valor; desenharLei(); } });
    }
    var ordem = el('select', { class: 'lei-nav-ordem', onchange: function () { f.ordem = ordem.value; desenharLei(); } }, [
      el('option', { value: 'lei', text: 'Ordem da lei', selected: f.ordem === 'lei' }),
      el('option', { value: 'cobrados', text: 'Mais cobrados primeiro', selected: f.ordem === 'cobrados' })
    ]);
    var lista = el('div', { class: 'lei-nav-lista' });
    var arts = artigosVisiveis(), ultimaDiv = -1;
    var niveis = rec.divisoes.map(function (dv) { return dv.nivel || 0; }), menor = niveis.length ? Math.min.apply(null, niveis) : 0;
    arts.forEach(function (a) {
      if (f.ordem === 'lei' && a.divisao != null && a.divisao > ultimaDiv) {
        for (var k = ultimaDiv + 1; k <= a.divisao; k++) {
          var dv = rec.divisoes[k];
          if (dv) lista.appendChild(el('div', { class: 'lei-nav-div', style: { paddingLeft: ((dv.nivel || 0) - menor) * 10 + 'px' }, title: dv.rotulo + (dv.nome ? ' – ' + dv.nome : ''), text: dv.rotulo + (dv.nome ? ' · ' + dv.nome : '') }));
        }
        ultimaDiv = a.divisao;
      }
      var ea = e.porArt[a.id];
      var nivelArt = a.divisao != null && rec.divisoes[a.divisao] ? (rec.divisoes[a.divisao].nivel || 0) - menor + 1 : 0;
      lista.appendChild(el('button', { type: 'button', class: 'lei-nav-art', 'data-art': a.id, style: { paddingLeft: (f.ordem === 'lei' ? nivelArt * 10 : 0) + 6 + 'px' }, title: a.rubrica || a.partes[0].texto.slice(0, 120), onclick: function () { irPara(a.id); } }, [
        el('span', { text: a.rotulo }),
        ea ? el('span', { class: 'lei-nav-est', text: textoEstrelas(ea.estrelas) }) : null
      ]));
    });
    if (!arts.length) lista.appendChild(el('p', { class: 'data-fraca', text: 'Nenhum artigo com esse filtro.' }));
    nav.appendChild(busca);
    nav.appendChild(el('div', { class: 'lei-nav-filtros' }, [chip('tudo', 'Tudo'), chip('cobrados', 'Cobrados'), chip('4', '★★★★+')]));
    nav.appendChild(ordem);
    nav.appendChild(lista);
  }

  function irPara(artId) {
    var c = v.doc.querySelector('[data-art="' + artId + '"]');
    if (!c) {
      v.filtros.busca = ''; v.filtros.filtro = 'tudo';
      desenharLei();
      c = v.doc.querySelector('[data-art="' + artId + '"]');
    }
    if (!c) { UI.aviso('Artigo não encontrado'); return; }
    c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    c.classList.add('lei-piscar'); setTimeout(function () { c.classList.remove('lei-piscar'); }, 1600);
    marcarNoSumario(artId);
  }
  function marcarNoSumario(artId) {
    v.nav.querySelectorAll('.lei-nav-art.atual').forEach(function (b) { b.classList.remove('atual'); });
    var b = v.nav.querySelector('.lei-nav-art[data-art="' + artId + '"]');
    if (b) { b.classList.add('atual'); var l = v.nav.querySelector('.lei-nav-lista'), r = b.getBoundingClientRect(), rl = l.getBoundingClientRect(); if (r.top < rl.top || r.bottom > rl.bottom) l.scrollTop += r.top - rl.top - rl.height / 3; }
  }

  // ---------- Folha branca ----------
  function desenharDoc() {
    var doc = v.doc, rec = v.rec, f = v.filtros;
    doc.innerHTML = '';
    var arts = artigosVisiveis(), ultimaDiv = -1;
    if (!arts.length) { doc.appendChild(el('p', { class: 'lei-vazio', text: 'Nenhum artigo com esse filtro.' })); return; }
    arts.forEach(function (a) {
      if (f.ordem === 'lei' && a.divisao != null && a.divisao > ultimaDiv) {
        for (var k = ultimaDiv + 1; k <= a.divisao; k++) {
          var dv = rec.divisoes[k];
          if (dv) doc.appendChild(el('div', { class: 'lei-div nivel-' + (dv.nivel || 0) }, [el('span', { text: dv.rotulo }), dv.nome ? el('strong', { text: dv.nome }) : null]));
        }
        ultimaDiv = a.divisao;
      }
      doc.appendChild(artigo(a));
    });
    // O sumário acompanha o artigo que está na tela.
    if (v.observador) v.observador.disconnect();
    if (window.IntersectionObserver) {
      v.observador = new IntersectionObserver(function (itens) {
        var vis = itens.filter(function (i) { return i.isIntersecting; }).sort(function (x, y) { return x.boundingClientRect.top - y.boundingClientRect.top; })[0];
        if (vis) marcarNoSumario(vis.target.getAttribute('data-art'));
      }, { rootMargin: '-140px 0px -60% 0px' });
      doc.querySelectorAll('.lei-art').forEach(function (n) { v.observador.observe(n); });
    }
  }

  function artigo(a) {
    var rec = v.rec, ea = v.estat.porArt[a.id];
    var bloco = el('section', { class: 'lei-art', 'data-art': a.id });
    if (a.rubrica) bloco.appendChild(el('div', { class: 'lei-rubrica', text: a.rubrica }));
    a.partes.forEach(function (p) {
      if (rec.removidas[p.id] && !v.editando) return;
      var cab = p.tipo === 'caput' ? [
        el('strong', { class: 'lei-rotulo', text: a.rotulo + '. ' }),
        ea ? el('button', { type: 'button', class: 'lei-imp', contenteditable: 'false', title: 'Importância ' + ea.estrelas + ' de 5 · ver as questões', onclick: function () { verQuestoes(a); } }, [
          el('span', { class: 'lei-imp-est', text: textoEstrelas(ea.estrelas) }),
          el('span', { class: 'lei-imp-q', text: ea.n + (ea.n === 1 ? ' questão' : ' questões') })
        ]) : null
      ] : null;
      bloco.appendChild(parte(a, p, cab));
      // Caixa de comentário do dispositivo, logo abaixo dele.
      if ((rec.comentarios || {})[p.id] != null) bloco.appendChild(caixaComentario(p.id, false));
    });
    return bloco;
  }

  // ---------- Comentários (uma caixa por dispositivo; texto com formatação, marca-texto e linhas separadoras) ----------
  function caixaComentario(parteId, editar) {
    var rec = v.rec;
    rec.comentarios = rec.comentarios || {};
    var texto = el('div', { class: 'lei-coment-texto', 'data-coment': parteId, contenteditable: 'true', spellcheck: 'true' });
    texto.innerHTML = rec.comentarios[parteId] || '';
    var editando = !!editar;
    var caixa = el('div', { class: 'lei-coment' + (editando ? ' editando' : ''), 'data-coment-de': parteId });
    texto.addEventListener('beforeinput', function (e) {
      if (editando) return;
      if (/^format/.test(e.inputType) || /^history/.test(e.inputType)) return;
      e.preventDefault();
    });
    texto.addEventListener('input', function () { gravarComentario(parteId, texto); });
    var btEditar = el('button', { type: 'button', class: 'link', text: editando ? 'concluir' : 'editar', onclick: function () {
      editando = !editando;
      caixa.classList.toggle('editando', editando);
      btEditar.textContent = editando ? 'concluir' : 'editar';
      if (editando) { texto.focus(); colocarCursorNoFim(texto); }
      else { gravarComentario(parteId, texto); if (!rec.comentarios[parteId]) caixa.remove(); }
    } });
    caixa.appendChild(texto);
    caixa.appendChild(el('div', { class: 'lei-coment-acoes' }, [
      btEditar,
      el('button', { type: 'button', class: 'link link-perigo', text: 'excluir', onclick: function () {
        if (!texto.textContent.trim()) { delete rec.comentarios[parteId]; salvarRec(); caixa.remove(); return; }
        UI.confirmar('Excluir a caixa de comentário deste dispositivo?', function () { delete rec.comentarios[parteId]; salvarRec(); caixa.remove(); }, 'Excluir');
      } })
    ]));
    if (editando) setTimeout(function () { texto.focus(); colocarCursorNoFim(texto); }, 0);
    return caixa;
  }
  function colocarCursorNoFim(n) {
    var r = document.createRange(); r.selectNodeContents(n); r.collapse(false);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function gravarComentario(parteId, texto) {
    var html = texto.innerHTML.trim();
    if (!texto.textContent.trim() && !texto.querySelector('hr')) { if (v.rec.comentarios[parteId] != null) v.rec.comentarios[parteId] = ''; }
    else v.rec.comentarios[parteId] = html;
    salvarRec();
  }
  // Abre (ou cria) a caixa de comentário do dispositivo, já em edição.
  function comentar(parteId) {
    var rec = v.rec;
    rec.comentarios = rec.comentarios || {};
    var existente = v.doc.querySelector('[data-coment-de="' + parteId + '"]');
    if (existente) { var t = existente.querySelector('.lei-coment-texto'); if (!existente.classList.contains('editando')) existente.querySelector('.lei-coment-acoes .link').click(); else t.focus(); return; }
    if (rec.comentarios[parteId] == null) rec.comentarios[parteId] = '';
    var linha = v.doc.querySelector('[data-parte="' + parteId + '"]');
    if (linha) linha.parentNode.insertBefore(caixaComentario(parteId, true), linha.nextSibling);
  }

  function parte(a, p, cabeca) {
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
    var ligadas = v.estat.porParte[p.id] || [];
    return el('p', { class: 'lei-parte tipo-' + p.tipo + (rec.atencao[p.id] ? ' atencao' : '') + (rec.removidas[p.id] ? ' removida' : '') + (ligadas.length ? ' cobrada' : ''), 'data-parte': p.id }, [
      p.rubrica ? el('span', { class: 'lei-rubrica', text: p.rubrica }) : null
    ].concat(cabeca || [el('strong', { class: 'lei-rotulo', text: p.rotulo + ' ' })]).concat([
      texto,
      v.editando ? null : el('button', { type: 'button', class: 'lei-comentar', contenteditable: 'false', title: 'Comentar este dispositivo', text: '+ comentário', onclick: function () { comentar(p.id); } }),
      v.editando ? el('span', { class: 'lei-parte-acoes', contenteditable: 'false' }, [
        rec.marcas[p.id] != null ? el('button', { type: 'button', class: 'link', text: 'texto original', title: 'Voltar ao texto extraído da lei (apaga as marcações deste dispositivo)', onclick: function () { delete rec.marcas[p.id]; salvarRec(); App.atualizar(); } }) : null,
        el('button', { type: 'button', class: 'link link-perigo', text: rec.removidas[p.id] ? 'restaurar' : 'remover', onclick: function () {
          if (rec.removidas[p.id]) delete rec.removidas[p.id]; else rec.removidas[p.id] = true;
          salvarRec(); App.atualizar();
        } })
      ]) : null
    ]));
  }

  // ---------- Barra: marca-texto (igual ao do leitor de PDF), formatação e edição ----------
  var CHAVE_MARCA = 'controle-estudos.lei-marca';
  function lerPreferenciaMarca() {
    try { var x = JSON.parse(localStorage.getItem(CHAVE_MARCA) || '{}'); v.marcaTexto = !!x.ligado; v.corAtual = Leitor.CORES.some(function (c) { return c[0] === x.cor; }) ? x.cor : Leitor.CORES[0][0]; }
    catch (e) { v.marcaTexto = false; v.corAtual = Leitor.CORES[0][0]; }
  }
  function corHex(nome) { var c = Leitor.CORES.filter(function (x) { return x[0] === nome; })[0]; return c ? c[1] : Leitor.CORES[0][1]; }
  function definirMarca(ligado) {
    v.marcaTexto = ligado;
    if (v.btGrifar) v.btGrifar.classList.toggle('ativo', ligado);
    if (v.bolaCor) v.bolaCor.style.background = corHex(v.corAtual);
    if (v.doc) v.doc.classList.toggle('modo-grifo', ligado);
    try { localStorage.setItem(CHAVE_MARCA, JSON.stringify({ ligado: ligado, cor: v.corAtual })); } catch (e) { /* preferência */ }
  }
  function definirCor(cor) { v.corAtual = cor; definirMarca(true); }

  function barraDestaque() {
    if (v.marcaTexto == null) lerPreferenciaMarca();
    function cmd(nome, valor, titulo, conteudo) {
      return el('button', { type: 'button', class: 'lei-cmd', title: titulo, onmousedown: function (e) { e.preventDefault(); formatar(nome, valor); } }, conteudo);
    }
    v.btGrifar = el('button', { type: 'button', class: 'lei-cmd lei-grifar' + (v.marcaTexto ? ' ativo' : ''), title: 'Marca-texto: selecione (arraste sobre) o trecho para grifar · teclas 1 a 5 trocam a cor · Esc desliga', onclick: function () { definirMarca(!v.marcaTexto); } }, [UI.icone('grifo'), el('span', { text: 'Marca-texto' })]);
    v.bolaCor = el('button', { type: 'button', class: 'lei-bola-cor', title: 'Cor do marca-texto', style: { background: corHex(v.corAtual) }, onclick: function (e) { menuCores(e.currentTarget); } });
    var editar = UI.botao(v.editando ? 'Concluir edição' : 'Editar texto', function () { v.editando = !v.editando; App.atualizar(); }, v.editando ? 'btn-primario' : 'btn-secundario', 'lapis');
    return el('div', { class: 'lei-barra' }, [
      v.btGrifar, v.bolaCor,
      el('span', { class: 'lei-sep' }),
      cmd('bold', null, 'Negrito (Ctrl+B)', el('b', { text: 'N' })),
      cmd('underline', null, 'Sublinhado (Ctrl+U)', el('u', { text: 'S' })),
      cmd('italic', null, 'Itálico (Ctrl+I)', el('i', { text: 'I' })),
      cmd('foreColor', '#d62828', 'Texto em vermelho', el('span', { class: 'lei-a-vermelho', text: 'A' })),
      el('button', { type: 'button', class: 'lei-cmd', title: 'Caixa de atenção no dispositivo', onmousedown: function (e) { e.preventDefault(); alternarAtencao(); } }, UI.icone('alerta')),
      cmd('insertHorizontalRule', null, 'Linha separadora (dentro do comentário em edição)', el('span', { class: 'lei-linha-ic' })),
      cmd('removeFormat', null, 'Limpar os destaques do trecho selecionado', el('span', { text: 'Limpar' })),
      el('span', { class: 'lei-barra-espaco' }),
      editar
    ]);
  }

  // ---------- Flutuantes (cores, balão do grifo, caixa da remissão) ----------
  var flutuante = null, dica = null;
  function fecharFlutuantes() { if (flutuante) { flutuante.remove(); flutuante = null; } }
  function posicionar(no, cx, cy) {
    document.body.appendChild(no);
    var w = no.offsetWidth, h = no.offsetHeight;
    no.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, cx - w / 2)) + 'px';
    no.style.top = (cy + 14 + h > window.innerHeight ? Math.max(8, cy - h - 14) : cy + 14) + 'px';
  }
  function menuCores(ancora) {
    fecharFlutuantes();
    var r = ancora.getBoundingClientRect();
    flutuante = el('div', { class: 'leitor-flutuante leitor-cores' }, Leitor.CORES.map(function (c, i) {
      return el('button', { type: 'button', class: 'leitor-cor' + (v.corAtual === c[0] ? ' ativa' : ''), title: c[0] + ' (' + (i + 1) + ')', style: { background: c[1] }, onclick: function () { fecharFlutuantes(); definirCor(c[0]); } });
    }));
    posicionar(flutuante, r.left + r.width / 2, r.bottom - 8);
  }
  function corDoGrifo(span) {
    var bg = getComputedStyle(span).backgroundColor, m = bg.match(/\d+/g);
    if (!m) return null;
    var hex = '#' + m.slice(0, 3).map(function (n) { return ('0' + Number(n).toString(16)).slice(-2); }).join('').toUpperCase();
    var c = Leitor.CORES.filter(function (x) { return x[1].toUpperCase() === hex; })[0];
    return c ? c[0] : null;
  }
  // Balão do grifo: trecho, trocar a cor, anotação e excluir (como no leitor de PDF).
  function abrirBalao(span, cx, cy) {
    fecharFlutuantes();
    var texto = span.closest('.lei-texto, .lei-coment-texto');
    function gravar() { gravarEditavel(texto); }
    var nota = el('textarea', { rows: 3, value: span.getAttribute('data-nota') || '', placeholder: 'Anotação sobre o trecho (opcional)' });
    nota.addEventListener('change', function () { if (nota.value.trim()) span.setAttribute('data-nota', nota.value.trim()); else span.removeAttribute('data-nota'); span.title = nota.value.trim(); gravar(); });
    var atual = corDoGrifo(span);
    flutuante = el('div', { class: 'leitor-flutuante leitor-balao' }, [
      el('div', { class: 'leitor-balao-trecho', text: '“' + (span.textContent.length > 160 ? span.textContent.slice(0, 160) + '…' : span.textContent) + '”' }),
      el('div', { class: 'leitor-cores-linha' }, Leitor.CORES.map(function (c) {
        return el('button', { type: 'button', class: 'leitor-cor' + (atual === c[0] ? ' ativa' : ''), style: { background: c[1] }, title: 'Trocar a cor', onclick: function () { span.style.backgroundColor = c[1]; gravar(); abrirBalao(span, cx, cy); } });
      })),
      nota,
      el('div', { class: 'leitor-balao-acoes' }, [
        el('button', { type: 'button', class: 'link link-perigo', text: 'Excluir', onclick: function () {
          span.style.backgroundColor = ''; span.removeAttribute('data-nota');
          if (!span.getAttribute('style')) { while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span); span.remove(); }
          fecharFlutuantes(); gravar();
        } }),
        el('button', { type: 'button', class: 'btn btn-primario', text: 'OK', onclick: function () { nota.dispatchEvent(new Event('change')); fecharFlutuantes(); } })
      ])
    ]);
    posicionar(flutuante, cx, cy);
  }
  // Caixa flutuante da remissão: o texto do dispositivo citado, ao passar o mouse (ou tocar) na citação.
  function mostrarDica(cit) {
    esconderDica();
    var ids = (cit.getAttribute('data-alvos') || '').split(' ').filter(Boolean);
    dica = el('div', { class: 'lei-dica' }, ids.map(function (id) {
      var x = v.mapa.partes[id];
      if (!x) return null;
      return el('div', { class: 'lei-dica-item' }, [el('strong', { text: rotuloCompleto(v.mapa, id) }), el('div', { text: x.p.texto })]);
    }));
    document.body.appendChild(dica);
    var r = cit.getBoundingClientRect(), w = dica.offsetWidth, h = dica.offsetHeight;
    dica.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    dica.style.top = (r.bottom + 8 + h > window.innerHeight ? Math.max(8, r.top - h - 8) : r.bottom + 8) + 'px';
  }
  function esconderDica() { if (dica) { dica.remove(); dica = null; } }

  // Eventos da folha (uma vez): grifar ao soltar a seleção, balão ao clicar no grifo, caixa da remissão.
  document.addEventListener('mouseup', function (e) {
    if (!v || !v.doc || !v.marcaTexto || v.editando || !v.doc.contains(e.target)) return;
    setTimeout(function () {
      var s = window.getSelection();
      if (!s.rangeCount || s.isCollapsed || !dentroDeTexto()) return;
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('hiliteColor', false, corHex(v.corAtual));
      s.removeAllRanges();
    }, 0);
  });
  document.addEventListener('click', function (e) {
    if (!v || !v.doc || !v.doc.contains(e.target)) return;
    var cit = e.target.closest('.lei-cit');
    if (cit && e.pointerType !== 'mouse') { mostrarDica(cit); return; }
    if (v.editando || e.target.closest('.lei-coment.editando')) return;
    var s = window.getSelection();
    if (s && !s.isCollapsed) return;
    var g = e.target.closest('.lei-texto span[style*="background"], .lei-coment-texto span[style*="background"]');
    if (g) abrirBalao(g, e.clientX, e.clientY);
  });
  document.addEventListener('mouseover', function (e) {
    if (!v || !v.doc) return;
    var cit = e.target.closest && e.target.closest('.lei-cit');
    if (cit && v.doc.contains(cit)) mostrarDica(cit);
  });
  document.addEventListener('mouseout', function (e) {
    if (dica && e.target.closest && e.target.closest('.lei-cit') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.lei-cit'))) esconderDica();
  });
  document.addEventListener('mousedown', function (e) { if (flutuante && !flutuante.contains(e.target)) fecharFlutuantes(); });
  document.addEventListener('scroll', esconderDica, true);
  document.addEventListener('keydown', function (e) {
    if (!v || !v.doc || !document.body.contains(v.doc) || document.querySelector('.modal-fundo')) return;
    var digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '') || (v.editando && e.target.closest && e.target.closest('.lei-texto')) ||
      (e.target.closest && e.target.closest('.lei-coment.editando'));
    if (e.key === 'Escape') { fecharFlutuantes(); esconderDica(); if (v.marcaTexto) definirMarca(false); return; }
    if (digitando || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-5]$/.test(e.key)) { e.preventDefault(); fecharFlutuantes(); definirCor(Leitor.CORES[Number(e.key) - 1][0]); }
  });
  window.addEventListener('hashchange', function () { fecharFlutuantes(); esconderDica(); });

  // ---------- Decoração (não é gravada): trechos cobrados e citações com a caixa flutuante ----------
  function nosDeTexto(raiz) {
    var r = [], w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
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

  function decorar(elTexto, a, p) {
    var plano = elTexto.textContent, mapa = v.mapa;
    // Citações a outros dispositivos desta lei: ficam sublinhadas; o texto citado aparece na caixa flutuante.
    var ctx = { art: a.id, par: p.tipo === 'par' ? p.id : (p.pai && /-p(\d|u)/.test(p.pai) ? p.pai.replace(/(-p(?:u|\d+[a-z-]*)).*$/, '$1') : null), parte: p.id };
    var achados = LeiSecaLer.remissoes(plano, ctx, function (id) { return !!mapa.partes[id] || !!mapa.artigos[id]; });
    achados.forEach(function (r) {
      envolver(elTexto, r.ini, r.fim, function () { return el('span', { class: 'lei-cit', 'data-temp': '1', 'data-alvos': r.alvos.join(' ') }); });
    });
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
  }

  // Grava as marcações do dispositivo (sem a decoração).
  function guardarMarcas(elTexto, p) {
    var c = elTexto.cloneNode(true);
    c.querySelectorAll('[data-temp]').forEach(function (n) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); });
    c.normalize();
    var html = c.innerHTML;
    if (html === esc(p.texto)) delete v.rec.marcas[p.id]; else v.rec.marcas[p.id] = html;
    salvarRec();
  }

  // Texto da lei ou de um comentário onde está a seleção.
  function dentroDeTexto() {
    var s = window.getSelection();
    if (!s.rangeCount) return null;
    var n = s.anchorNode;
    var t = n && (n.nodeType === 1 ? n : n.parentNode).closest('.lei-texto, .lei-coment-texto');
    return t && v && v.doc && v.doc.contains(t) ? t : null;
  }
  // Grava o que mudou no elemento (dispositivo da lei ou comentário).
  function gravarEditavel(t) {
    if (t.classList.contains('lei-coment-texto')) { gravarComentario(t.getAttribute('data-coment'), t); return; }
    var x = v.mapa.partes[t.getAttribute('data-id')];
    if (x) guardarMarcas(t, x.p);
  }
  function formatar(nome, valor) {
    var t = dentroDeTexto();
    if (!t) { UI.aviso('Selecione um trecho da lei ou do comentário primeiro'); return; }
    if (nome === 'insertHorizontalRule') {
      if (!t.classList.contains('lei-coment-texto') || !t.closest('.lei-coment').classList.contains('editando')) { UI.aviso('A linha separadora vai dentro de um comentário em edição'); return; }
      document.execCommand('insertHTML', false, '<hr><p><br></p>');
      gravarEditavel(t);
      return;
    }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(nome, false, valor || null);
  }
  function alternarAtencao() {
    var t = dentroDeTexto();
    if (t && t.classList.contains('lei-coment-texto')) t = null;
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
