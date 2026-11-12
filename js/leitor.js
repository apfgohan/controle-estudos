// Leitor de PDF das aulas (#/leitor/<aulaId>[/<pagina>]): PDF.js, grifos coloridos e anotações.
// O PDF fica só neste aparelho (PdfsDados); grifos, notas e a última página vão para a nuvem.
// A página "lida" é a que ficou na tela por 5 s ou mais; isso preenche "Páginas lidas" ao lançar a tarefa.
var Leitor = (function () {
  var el = UI.el;
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var CORES = [['amarelo', '#ffd54a'], ['verde', '#7be08f'], ['azul', '#7cc4ff'], ['rosa', '#ff8fc8']];
  var CHAVE_LEITURA = 'controle-estudos.leitura-dia', CHAVE_NOITE = 'controle-estudos.leitor-noturno';
  var SEGUNDOS_LIDA = 5;
  var carregando = null;
  var v = null; // leitor aberto: { aulaId, doc, raiz, paginas: [...], itens, zoom, ... }

  function carregarPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (carregando) return carregando;
    carregando = new Promise(function (ok, erro) {
      var s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = function () { carregando = null; erro(new Error('Não foi possível carregar o leitor de PDF (sem internet?).')); };
      document.head.appendChild(s);
    });
    return carregando;
  }

  // Quantas páginas tem o arquivo (usado ao enviar o PDF na aula).
  function contarPaginas(arquivo) {
    return carregarPdfJs().then(function (lib) {
      return arquivo.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; });
    }).then(function (doc) { var n = doc.numPages; doc.destroy(); return n; });
  }

  // ---------- Leitura do dia (para "Páginas lidas") ----------
  function lerLeituras() { try { return JSON.parse(localStorage.getItem(CHAVE_LEITURA) || '{}') || {}; } catch (e) { return {}; } }
  function gravarLeituras(x) { try { localStorage.setItem(CHAVE_LEITURA, JSON.stringify(x)); } catch (e) { /* só a sugestão */ } }
  function marcarLida(aulaId, pagina) {
    var x = lerLeituras(), hoje = UI.hoje(), r = x[aulaId];
    if (!r || r.dia !== hoje) r = { dia: hoje, de: pagina, ate: pagina };
    r.de = Math.min(r.de, pagina); r.ate = Math.max(r.ate, pagina);
    x[aulaId] = r;
    gravarLeituras(x);
  }
  function leituraDoDia(aulaId) { var r = lerLeituras()[aulaId]; return r && r.dia === UI.hoje() ? r : null; }
  function limparLeitura(aulaId) { var x = lerLeituras(); delete x[aulaId]; gravarLeituras(x); }

  // ---------- Abertura ----------
  function render(raiz, partes) {
    var aulaId = partes[0], x = aulaId && Dados.aula(aulaId);
    if (!x) { raiz.appendChild(el('div', { class: 'vazio' }, [el('p', { class: 'vazio-destaque', text: 'Aula não encontrada.' }), el('a', { class: 'btn btn-secundario', href: '#/teoria', text: 'Ir para a Teoria' })])); return; }
    var pagina = Number(partes[1]) || 0;
    // A tela é redesenhada a cada atualização do programa: o leitor aberto é reaproveitado (não recarrega o PDF).
    if (v && v.aulaId === aulaId) {
      raiz.appendChild(v.raiz);
      if (pagina && pagina !== v.paginaPedida) { v.paginaPedida = pagina; irPara(pagina); }
      atualizarInfo();
      return;
    }
    fechar();
    var caixa = el('div', { class: 'leitor' });
    raiz.appendChild(caixa);
    if (!PdfsDados.temPdf(aulaId)) { semPdf(caixa, x); return; }
    caixa.appendChild(el('div', { class: 'leitor-carregando', text: 'Abrindo o PDF…' }));
    Promise.all([carregarPdfJs(), PdfsDados.obterPdf(aulaId), PdfsDados.sincronizarGrifos(aulaId)]).then(function (r) {
      if (!r[1]) { caixa.innerHTML = ''; semPdf(caixa, x); return; }
      return r[1].blob.arrayBuffer().then(function (buf) { return r[0].getDocument({ data: buf }).promise; }).then(function (doc) {
        if (!document.body.contains(caixa)) { doc.destroy(); return; }
        montar(caixa, x, doc, r[2], pagina);
      });
    }).catch(function (e) {
      console.error(e);
      caixa.innerHTML = '';
      caixa.appendChild(el('div', { class: 'vazio' }, [el('p', { class: 'vazio-destaque', text: 'Não foi possível abrir o PDF.' }), el('p', { text: e.message || '' })]));
    });
  }

  // A aula tem (ou não) PDF cadastrado, mas o arquivo não está neste aparelho.
  function semPdf(caixa, x) {
    var a = x.aula;
    var entrada = el('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true, onchange: function () {
      var f = entrada.files[0]; if (!f) return;
      enviarPdf(a, f).then(function () { v = null; App.atualizar(); });
    } });
    caixa.appendChild(el('div', { class: 'vazio' }, [
      el('p', { class: 'vazio-destaque', text: Dados.nomeAula(a) }),
      el('p', { text: a.arquivo ? 'O PDF desta aula (' + a.arquivo.nome + ') foi enviado em outro aparelho e não está neste. Envie o arquivo aqui para ler.' : 'Esta aula ainda não tem PDF. Envie o arquivo para ler, grifar e anotar aqui.' }),
      el('div', { class: 'vazio-acoes' }, [UI.botao('Enviar PDF…', function () { entrada.click(); }, 'btn-primario'), voltarBotao(x)]),
      entrada
    ]));
  }

  // Guarda o PDF neste aparelho e a ficha dele na aula. As páginas da aula (só as de teoria) não são trocadas.
  function enviarPdf(a, arquivo) {
    if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== 'application/pdf') { UI.aviso('Escolha um arquivo PDF'); return Promise.reject(new Error('não é PDF')); }
    return contarPaginas(arquivo).then(function (n) {
      return PdfsDados.guardarPdf(a.id, arquivo, n).then(function () {
        Dados.definirArquivoAula(a.id, { nome: arquivo.name, tamanho: arquivo.size, paginas: n });
        UI.aviso('PDF guardado neste aparelho (' + n + ' páginas)');
        return n;
      });
    }).catch(function (e) { if (e && e.message !== 'não é PDF') { console.error(e); UI.aviso('Não foi possível ler esse PDF'); } throw e; });
  }

  function voltarBotao(x) {
    return el('a', { class: 'btn btn-secundario', href: '#/teoria/' + x.bloco.disciplinaId, text: 'Voltar para a matéria' });
  }

  function fechar() {
    if (!v) return;
    salvarAgora();
    clearInterval(v.relogio);
    if (v.observador) v.observador.disconnect();
    try { v.doc.destroy(); } catch (e) { /* já fechado */ }
    v = null;
  }

  // ---------- Montagem ----------
  function montar(caixa, x, doc, rec, pagina) {
    caixa.innerHTML = '';
    var noite = false;
    try { noite = localStorage.getItem(CHAVE_NOITE) === '1'; } catch (e) { /* preferência */ }
    var lei = Dados.leituraAula(x.aula);
    v = {
      aulaId: x.aula.id, x: x, doc: doc, raiz: caixa, total: doc.numPages, itens: rec.itens.slice(), ultima: rec.ultimaPagina || 0,
      zoom: 1, base: 1, paginas: [], atual: 1, desdeAtual: Date.now(), notaModo: false, filtroCor: '', textos: {}, busca: { termo: '', pos: 0 },
      paginaPedida: pagina, noite: noite
    };
    var inicial = pagina || v.ultima || (lei.total && !x.aula.concluido ? lei.inicio : 1);
    inicial = Math.max(1, Math.min(v.total, inicial));

    v.area = el('div', { class: 'leitor-area' + (noite ? ' noite' : '') });
    v.painel = el('aside', { class: 'leitor-painel' });
    v.barra = barra();
    caixa.appendChild(v.barra);
    caixa.appendChild(el('div', { class: 'leitor-corpo' }, [v.area, v.painel]));
    v.area.addEventListener('scroll', aoRolar);
    v.area.addEventListener('mouseup', aoSoltar);
    v.area.addEventListener('click', aoClicar);

    doc.getPage(1).then(function (p1) {
      var vp = p1.getViewport({ scale: 1 });
      v.larguraPdf = vp.width; v.alturaPdf = vp.height;
      v.base = Math.min(2.2, Math.max(0.5, (v.area.clientWidth - 48) / vp.width));
      for (var i = 1; i <= v.total; i++) {
        var pg = el('div', { class: 'pdf-pagina', 'data-pagina': i });
        v.paginas.push({ n: i, el: pg, desenhada: false, escala: 0 });
        v.area.appendChild(pg);
      }
      v.observador = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) desenhar(Number(e.target.getAttribute('data-pagina'))); });
      }, { root: v.area, rootMargin: '600px 0px' });
      v.paginas.forEach(function (p) { v.observador.observe(p.el); });
      dimensionar();
      irPara(inicial, true);
      desenharPainel();
      atualizarInfo();
    });
    // A página que fica na tela por 5 s conta como lida; a posição é guardada a cada mudança.
    v.relogio = setInterval(function () {
      if (!v || !document.body.contains(v.raiz)) return;
      if (Date.now() - v.desdeAtual >= SEGUNDOS_LIDA * 1000) marcarLida(v.aulaId, v.atual);
    }, 1000);
  }

  function escala() { return v.base * v.zoom; }

  // Tamanho de todas as páginas pela 1ª (ajustado quando cada uma é desenhada) e redesenho do que está à vista.
  function dimensionar() {
    var s = escala();
    v.paginas.forEach(function (p) {
      var w = (p.largura || v.larguraPdf) * s, h = (p.altura || v.alturaPdf) * s;
      p.el.style.width = Math.round(w) + 'px'; p.el.style.height = Math.round(h) + 'px';
      if (p.desenhada && p.escala !== s) { p.desenhada = false; p.el.innerHTML = ''; }
    });
    var visiveis = v.paginas.filter(function (p) { var r = p.el.getBoundingClientRect(), a = v.area.getBoundingClientRect(); return r.bottom > a.top - 600 && r.top < a.bottom + 600; });
    visiveis.forEach(function (p) { desenhar(p.n); });
  }

  function desenhar(n) {
    var p = v && v.paginas[n - 1];
    if (!p || p.desenhada || p.desenhando) return;
    var s = escala(), doc = v.doc;
    p.desenhando = true;
    // Se o zoom mudou enquanto a página era desenhada, o desenho é descartado e refeito na escala nova.
    function velho() { if (!v || v.doc !== doc) return true; if (escala() !== s) { p.desenhando = false; p.desenhada = false; desenhar(n); return true; } return false; }
    doc.getPage(n).then(function (page) {
      if (velho()) return;
      var vp1 = page.getViewport({ scale: 1 });
      p.largura = vp1.width; p.altura = vp1.height;
      var vp = page.getViewport({ scale: s }), dpr = window.devicePixelRatio || 1;
      p.el.style.width = Math.round(vp.width) + 'px'; p.el.style.height = Math.round(vp.height) + 'px';
      var canvas = el('canvas', { class: 'pdf-canvas' });
      canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = Math.round(vp.width) + 'px'; canvas.style.height = Math.round(vp.height) + 'px';
      var grifos = el('div', { class: 'pdf-grifos' });
      var texto = el('div', { class: 'textLayer' });
      texto.style.setProperty('--scale-factor', s);
      var notas = el('div', { class: 'pdf-notas' });
      p.el.innerHTML = '';
      p.el.appendChild(canvas); p.el.appendChild(grifos); p.el.appendChild(texto); p.el.appendChild(notas);
      p.grifos = grifos; p.notas = notas; p.texto = texto;
      var ctx = canvas.getContext('2d');
      return page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise.then(function () {
        return page.getTextContent();
      }).then(function (tc) {
        if (velho()) return null;
        v.textos[n] = tc.items.map(function (i) { return i.str; }).join(' ');
        return window.pdfjsLib.renderTextLayer({ textContentSource: tc, container: texto, viewport: vp, textDivs: [] }).promise;
      }).then(function () {
        if (velho()) return;
        p.desenhada = true; p.escala = s; p.desenhando = false;
        desenharItens(n);
        marcarBusca(n);
      });
    }).catch(function (e) { p.desenhando = false; console.error('Página não desenhada', n, e); });
  }

  // ---------- Navegação ----------
  function topoDa(n) { var p = v.paginas[n - 1]; return p ? p.el.offsetTop - 12 : 0; }
  function irPara(n, semAnimar) {
    if (!v || !v.paginas.length) return;
    n = Math.max(1, Math.min(v.total, n));
    v.area.scrollTo({ top: topoDa(n), behavior: semAnimar ? 'auto' : 'smooth' });
    definirAtual(n);
  }
  function definirAtual(n) {
    if (v.atual === n) return;
    v.atual = n; v.desdeAtual = Date.now();
    agendarSalvar();
    atualizarInfo();
  }
  function aoRolar() {
    var meio = v.area.scrollTop + v.area.clientHeight / 3, n = 1;
    for (var i = 0; i < v.paginas.length; i++) { if (v.paginas[i].el.offsetTop <= meio) n = i + 1; else break; }
    definirAtual(n);
    fecharFlutuantes();
  }

  var timerSalvar = null;
  function agendarSalvar() { clearTimeout(timerSalvar); timerSalvar = setTimeout(salvarAgora, 1500); }
  function salvarAgora() { clearTimeout(timerSalvar); if (v) PdfsDados.salvarGrifos(v.aulaId, v.itens, v.atual).catch(function (e) { console.error(e); }); }

  // ---------- Barra ----------
  function barra() {
    var x = v.x, a = x.aula;
    v.campoPagina = el('input', { type: 'number', min: 1, class: 'leitor-pagina', 'aria-label': 'Página', onchange: function () { irPara(Number(v.campoPagina.value) || 1); } });
    v.infoTotal = el('span', { class: 'leitor-total' });
    v.infoLeitura = el('span', { class: 'leitor-leitura' });
    v.infoZoom = el('span', { class: 'leitor-zoom-valor' });
    v.campoBusca = el('input', { type: 'search', class: 'leitor-busca', placeholder: 'Buscar no PDF', onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); buscar(v.campoBusca.value, e.shiftKey); } } });
    v.infoBusca = el('span', { class: 'leitor-busca-info' });
    function bt(icone, titulo, acao, classe) { var b = el('button', { type: 'button', class: 'leitor-bt ' + (classe || ''), title: titulo, 'aria-label': titulo, onclick: acao }); b.appendChild(typeof icone === 'string' && icone.length > 2 ? UI.icone(icone) : document.createTextNode(icone)); return b; }
    v.btNota = bt('nota', 'Nota solta: clique na página onde quer a nota', function () { v.notaModo = !v.notaModo; v.btNota.classList.toggle('ativo', v.notaModo); v.area.classList.toggle('modo-nota', v.notaModo); });
    v.btNoite = bt('livro', 'Modo noturno', function () { v.noite = !v.noite; v.area.classList.toggle('noite', v.noite); v.btNoite.classList.toggle('ativo', v.noite); try { localStorage.setItem(CHAVE_NOITE, v.noite ? '1' : '0'); } catch (e) { /* preferência */ } }, v.noite ? 'ativo' : '');
    v.btPainel = bt('lista', 'Grifos e anotações', function () { v.raiz.classList.toggle('sem-painel'); }, 'ativo');
    return el('div', { class: 'leitor-barra' }, [
      el('a', { class: 'leitor-bt', href: '#/teoria/' + x.bloco.disciplinaId, title: 'Voltar para a matéria', 'aria-label': 'Voltar para a matéria' }, UI.icone('voltar')),
      el('div', { class: 'leitor-titulo' }, [el('strong', { text: Dados.nomeAula(a) }), v.infoLeitura]),
      el('div', { class: 'leitor-grupo' }, [bt('‹', 'Página anterior', function () { irPara(v.atual - 1); }), v.campoPagina, v.infoTotal, bt('›', 'Próxima página', function () { irPara(v.atual + 1); })]),
      el('div', { class: 'leitor-grupo' }, [bt('−', 'Diminuir', function () { mudarZoom(v.zoom / 1.15); }), v.infoZoom, bt('+', 'Aumentar', function () { mudarZoom(v.zoom * 1.15); }), bt('↔', 'Ajustar à largura', function () { mudarZoom(1); })]),
      el('div', { class: 'leitor-grupo leitor-grupo-busca' }, [v.campoBusca, v.infoBusca]),
      el('div', { class: 'leitor-grupo' }, [v.btNota, v.btNoite, v.btPainel])
    ]);
  }
  function atualizarInfo() {
    if (!v || !v.campoPagina) return;
    if (document.activeElement !== v.campoPagina) v.campoPagina.value = v.atual;
    v.campoPagina.max = v.total;
    v.infoTotal.textContent = '/ ' + v.total;
    v.infoZoom.textContent = Math.round(escala() * 100) + '%';
    var a = (Dados.aula(v.aulaId) || v.x).aula || v.x.aula, l = Dados.leituraAula(a), hoje = leituraDoDia(v.aulaId);
    v.infoLeitura.textContent = (l.total ? 'Teoria: ' + l.total + ' págs.' + (a.concluido ? ' · concluída' : ' · lidas ' + l.lidas) : '') +
      (hoje ? (l.total ? ' · ' : '') + 'hoje: da ' + hoje.de + 'ª à ' + hoje.ate + 'ª' : '');
  }
  function mudarZoom(z) {
    var n = v.atual;
    v.zoom = Math.max(0.4, Math.min(4, z));
    dimensionar();
    irPara(n, true);
    atualizarInfo();
  }

  // ---------- Busca ----------
  function normalizar(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function textoDa(n) {
    if (v.textos[n] != null) return Promise.resolve(v.textos[n]);
    return v.doc.getPage(n).then(function (pg) { return pg.getTextContent(); }).then(function (tc) { return (v.textos[n] = tc.items.map(function (i) { return i.str; }).join(' ')); });
  }
  function buscar(termo, voltar) {
    termo = normalizar(termo).trim();
    if (!termo) { v.busca = { termo: '', pos: 0 }; v.infoBusca.textContent = ''; limparBusca(); return; }
    var inicio = v.busca.termo === termo ? v.atual + (voltar ? -1 : 1) : v.atual;
    v.busca.termo = termo;
    v.infoBusca.textContent = 'buscando…';
    var tentativas = 0;
    (function passo(n) {
      if (tentativas++ >= v.total) { v.infoBusca.textContent = 'não encontrado'; return; }
      if (n > v.total) n = 1; if (n < 1) n = v.total;
      textoDa(n).then(function (t) {
        if (normalizar(t).indexOf(termo) >= 0) { v.infoBusca.textContent = 'p. ' + n; limparBusca(); irPara(n); marcarBusca(n); }
        else passo(n + (voltar ? -1 : 1));
      });
    })(inicio);
  }
  function limparBusca() { if (v) v.area.querySelectorAll('.pdf-achado').forEach(function (s) { s.classList.remove('pdf-achado'); }); }
  function marcarBusca(n) {
    var p = v.paginas[n - 1]; if (!v.busca.termo || !p || !p.texto) return;
    p.texto.querySelectorAll('span').forEach(function (s) { if (normalizar(s.textContent).indexOf(v.busca.termo) >= 0) s.classList.add('pdf-achado'); });
  }

  // ---------- Grifos e notas ----------
  function corHex(c) { var x = CORES.filter(function (k) { return k[0] === c; })[0]; return x ? x[1] : CORES[0][1]; }
  function desenharItens(n) {
    var p = v.paginas[n - 1]; if (!p || !p.grifos) return;
    p.grifos.innerHTML = ''; p.notas.innerHTML = '';
    v.itens.filter(function (it) { return it.pagina === n; }).forEach(function (it) {
      if (it.tipo === 'grifo') {
        it.rects.forEach(function (r) {
          p.grifos.appendChild(el('div', { class: 'pdf-grifo', 'data-id': it.id, style: { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%', background: corHex(it.cor) } }));
        });
        if (it.nota) { var r0 = it.rects[it.rects.length - 1]; p.notas.appendChild(marcador(it, r0.x + r0.w, r0.y)); }
      } else if (it.tipo === 'nota') {
        p.notas.appendChild(marcador(it, it.x, it.y));
      }
    });
  }
  function marcador(it, x, y) {
    return el('button', { type: 'button', class: 'pdf-marcador' + (it.tipo === 'nota' ? ' solta' : ''), title: it.nota || it.texto || 'Nota', style: { left: x * 100 + '%', top: y * 100 + '%' },
      onclick: function (e) { e.stopPropagation(); abrirBalao(it, e.clientX, e.clientY); } }, UI.icone('nota'));
  }
  function redesenharItens(n) { if (n) desenharItens(n); else v.paginas.forEach(function (p) { if (p.desenhada) desenharItens(p.n); }); desenharPainel(); }

  function paginaDoPonto(cx, cy) {
    for (var i = 0; i < v.paginas.length; i++) {
      var r = v.paginas[i].el.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return { p: v.paginas[i], r: r };
    }
    return null;
  }

  // Soltou o mouse com texto selecionado: barrinha com as cores.
  function aoSoltar(e) {
    if (v.notaModo) return;
    setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount || !v.area.contains(sel.anchorNode)) return;
      var range = sel.getRangeAt(0), porPagina = {};
      Array.prototype.forEach.call(range.getClientRects(), function (r) {
        if (r.width < 1 || r.height < 1) return;
        var alvo = paginaDoPonto(r.left + r.width / 2, r.top + r.height / 2); if (!alvo) return;
        var pr = alvo.r;
        (porPagina[alvo.p.n] = porPagina[alvo.p.n] || []).push({ x: (r.left - pr.left) / pr.width, y: (r.top - pr.top) / pr.height, w: r.width / pr.width, h: r.height / pr.height });
      });
      if (!Object.keys(porPagina).length) return;
      var texto = sel.toString().replace(/\s+/g, ' ').trim();
      mostrarCores(e.clientX, e.clientY, function (cor, anotar) {
        var criados = Object.keys(porPagina).map(function (n) {
          var it = { id: Dados.novoId(), tipo: 'grifo', pagina: Number(n), rects: juntarLinhas(porPagina[n]), cor: cor, texto: texto, nota: '', criadoEm: Date.now() };
          v.itens.push(it);
          return it;
        });
        sel.removeAllRanges();
        criados.forEach(function (it) { desenharItens(it.pagina); });
        desenharPainel();
        salvarAgora();
        if (anotar) abrirBalao(criados[0], e.clientX, e.clientY);
      });
    }, 0);
  }
  // Une os retângulos da mesma linha (o PDF.js quebra a linha em vários pedaços).
  function juntarLinhas(rs) {
    rs.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var r = [];
    rs.forEach(function (x) {
      var u = r[r.length - 1];
      if (u && Math.abs(u.y - x.y) < u.h * 0.5 && x.x <= u.x + u.w + 0.02) {
        var dir = Math.max(u.x + u.w, x.x + x.w), base = Math.max(u.y + u.h, x.y + x.h);
        u.x = Math.min(u.x, x.x); u.y = Math.min(u.y, x.y); u.w = dir - u.x; u.h = base - u.y;
      } else r.push({ x: x.x, y: x.y, w: x.w, h: x.h });
    });
    return r.map(function (x) { return { x: +x.x.toFixed(4), y: +x.y.toFixed(4), w: +x.w.toFixed(4), h: +x.h.toFixed(4) }; });
  }

  function aoClicar(e) {
    if (e.target.closest('.pdf-marcador')) return;
    var alvo = paginaDoPonto(e.clientX, e.clientY); if (!alvo) return;
    var px = (e.clientX - alvo.r.left) / alvo.r.width, py = (e.clientY - alvo.r.top) / alvo.r.height;
    if (v.notaModo) {
      var it = { id: Dados.novoId(), tipo: 'nota', pagina: alvo.p.n, x: +px.toFixed(4), y: +py.toFixed(4), nota: '', texto: '', criadoEm: Date.now() };
      v.itens.push(it);
      v.notaModo = false; v.btNota.classList.remove('ativo'); v.area.classList.remove('modo-nota');
      desenharItens(it.pagina); desenharPainel(); salvarAgora();
      abrirBalao(it, e.clientX, e.clientY);
      return;
    }
    var sel = window.getSelection(); if (sel && !sel.isCollapsed) return;
    // Clique em cima de um grifo (a camada de texto fica por cima dele).
    var achado = v.itens.filter(function (it) {
      return it.tipo === 'grifo' && it.pagina === alvo.p.n && it.rects.some(function (r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; });
    })[0];
    if (achado) abrirBalao(achado, e.clientX, e.clientY);
  }

  // ---------- Flutuantes (cores ao grifar e balão do grifo/nota) ----------
  var flutuante = null;
  function fecharFlutuantes() { if (flutuante) { flutuante.remove(); flutuante = null; } }
  function posicionar(no, cx, cy) {
    document.body.appendChild(no);
    var w = no.offsetWidth, h = no.offsetHeight;
    no.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, cx - w / 2)) + 'px';
    no.style.top = (cy + 14 + h > window.innerHeight ? Math.max(8, cy - h - 14) : cy + 14) + 'px';
  }
  function mostrarCores(cx, cy, escolher) {
    fecharFlutuantes();
    flutuante = el('div', { class: 'leitor-flutuante leitor-cores' }, CORES.map(function (c, i) {
      return el('button', { type: 'button', class: 'leitor-cor', title: 'Grifar (' + (i + 1) + ')', style: { background: c[1] }, onmousedown: function (e) { e.preventDefault(); }, onclick: function () { fecharFlutuantes(); escolher(c[0], false); } });
    }).concat([el('button', { type: 'button', class: 'leitor-anotar', text: 'Anotar', onmousedown: function (e) { e.preventDefault(); }, onclick: function () { fecharFlutuantes(); escolher(CORES[0][0], true); } })]));
    flutuante.escolher = escolher;
    posicionar(flutuante, cx, cy);
  }
  function abrirBalao(it, cx, cy) {
    fecharFlutuantes();
    var nota = el('textarea', { rows: 3, value: it.nota || '', placeholder: it.tipo === 'nota' ? 'Escreva a anotação' : 'Anotação sobre o trecho (opcional)' });
    function gravar() { it.nota = nota.value.trim(); redesenharItens(it.pagina); salvarAgora(); }
    nota.addEventListener('change', gravar);
    var cores = it.tipo === 'grifo' ? el('div', { class: 'leitor-cores-linha' }, CORES.map(function (c) {
      return el('button', { type: 'button', class: 'leitor-cor' + (it.cor === c[0] ? ' ativa' : ''), style: { background: c[1] }, title: 'Trocar a cor', onclick: function () { it.cor = c[0]; gravar(); abrirBalao(it, cx, cy); } });
    })) : null;
    flutuante = el('div', { class: 'leitor-flutuante leitor-balao' }, [
      it.texto ? el('div', { class: 'leitor-balao-trecho', text: '“' + (it.texto.length > 160 ? it.texto.slice(0, 160) + '…' : it.texto) + '”' }) : null,
      cores, nota,
      el('div', { class: 'leitor-balao-acoes' }, [
        el('button', { type: 'button', class: 'link link-perigo', text: 'Excluir', onclick: function () {
          v.itens = v.itens.filter(function (x) { return x !== it; }); fecharFlutuantes(); redesenharItens(it.pagina); salvarAgora();
        } }),
        el('button', { type: 'button', class: 'btn btn-primario', text: 'OK', onclick: function () { gravar(); fecharFlutuantes(); } })
      ])
    ]);
    posicionar(flutuante, cx, cy);
    nota.focus();
  }
  document.addEventListener('mousedown', function (e) { if (flutuante && !flutuante.contains(e.target)) fecharFlutuantes(); });

  // ---------- Painel lateral ----------
  function desenharPainel() {
    if (!v || !v.painel) return;
    var lista = v.itens.filter(function (it) { return !v.filtroCor || it.cor === v.filtroCor; }).sort(function (a, b) {
      return a.pagina - b.pagina || ((a.rects ? a.rects[0].y : a.y) - (b.rects ? b.rects[0].y : b.y));
    });
    v.painel.innerHTML = '';
    v.painel.appendChild(el('div', { class: 'leitor-painel-topo' }, [
      el('strong', { text: 'Grifos e anotações (' + v.itens.length + ')' }),
      el('div', { class: 'leitor-filtro' }, [el('button', { type: 'button', class: 'leitor-filtro-todas' + (v.filtroCor ? '' : ' ativa'), text: 'Todos', onclick: function () { v.filtroCor = ''; desenharPainel(); } })].concat(CORES.map(function (c) {
        return el('button', { type: 'button', class: 'leitor-cor mini' + (v.filtroCor === c[0] ? ' ativa' : ''), style: { background: c[1] }, title: 'Só ' + c[0], onclick: function () { v.filtroCor = v.filtroCor === c[0] ? '' : c[0]; desenharPainel(); } });
      })))
    ]));
    if (!lista.length) { v.painel.appendChild(el('p', { class: 'data-fraca', text: v.itens.length ? 'Nenhum grifo desta cor.' : 'Selecione um trecho do PDF para grifar. Use o botão de nota para anotar em qualquer ponto da página.' })); return; }
    lista.forEach(function (it) {
      v.painel.appendChild(el('button', { type: 'button', class: 'leitor-item', style: { borderLeftColor: it.tipo === 'grifo' ? corHex(it.cor) : 'var(--texto-3)' }, onclick: function () { irPara(it.pagina); } }, [
        el('span', { class: 'leitor-item-pag', text: 'p. ' + it.pagina + (it.tipo === 'nota' ? ' · nota' : '') }),
        it.texto ? el('span', { class: 'leitor-item-texto', text: it.texto.length > 140 ? it.texto.slice(0, 140) + '…' : it.texto }) : null,
        it.nota ? el('span', { class: 'leitor-item-nota', text: it.nota }) : null
      ]));
    });
  }

  // ---------- Teclado ----------
  document.addEventListener('keydown', function (e) {
    if (!v || !document.body.contains(v.raiz) || document.querySelector('.modal-fundo')) return;
    var digitando = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''));
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); v.campoBusca.focus(); v.campoBusca.select(); return; }
    if (e.key === 'Escape') { fecharFlutuantes(); if (v.notaModo) v.btNota.click(); return; }
    if (digitando) return;
    if (flutuante && flutuante.escolher && /^[1-4]$/.test(e.key)) { e.preventDefault(); var f = flutuante.escolher; fecharFlutuantes(); f(CORES[Number(e.key) - 1][0], false); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); irPara(v.atual + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); irPara(v.atual - 1); }
  });
  window.addEventListener('hashchange', function () { if (v && !/^#\/leitor\//.test(location.hash)) fechar(); });
  window.addEventListener('resize', function () {
    if (!v || !v.larguraPdf || !document.body.contains(v.raiz)) return;
    clearTimeout(v.timerTam);
    v.timerTam = setTimeout(function () { var n = v.atual; v.base = Math.min(2.2, Math.max(0.5, (v.area.clientWidth - 48) / v.larguraPdf)); dimensionar(); irPara(n, true); atualizarInfo(); }, 250);
  });

  return { render: render, enviarPdf: enviarPdf, contarPaginas: contarPaginas, leituraDoDia: leituraDoDia, limparLeitura: limparLeitura };
})();
