// Aba "Resumos": um documento por matéria, com títulos numerados em 3 níveis (1., 1.1, 1.1.1)
// e um painel de navegação à esquerda, como o do Word. O texto é guardado por ResumosDados.
var Resumos = (function () {
  var el = UI.el;
  var ESPERA_LOCAL = 1000;
  var LIMITE_AVISO = 8 * 1024 * 1024;
  var CHAVE_PAINEL = 'controle-estudos.resumo-painel-mini';
  var LADO_IMAGEM = 1200;
  var LARGURA_PAPEL = 1000; // a folha tem largura fixa; em telas menores ela é reduzida inteira

  var atual = null; // editor aberto: { id, pagina, salvarJa }

  // Antes de trocar de página, grava o que estiver pendente no editor aberto.
  // Saindo desta matéria, o editor deixa de ser reaproveitado (ao voltar, abre a versão gravada).
  window.addEventListener('hashchange', function () {
    if (!atual) return;
    atual.salvarJa();
    if (location.hash.split('/')[2] !== atual.id || location.hash.split('/')[1] !== 'resumos') atual = null;
  });
  window.addEventListener('beforeunload', function () { if (atual) atual.salvarJa(); });

  // A barra de ferramentas e o painel grudam logo abaixo do menu do topo, que é mais alto no celular.
  function medirTopo() {
    var topo = document.querySelector('.topo');
    document.documentElement.style.setProperty('--altura-topo', (topo ? topo.offsetHeight : 64) + 'px');
  }
  window.addEventListener('resize', medirTopo);
  // O topo muda de altura depois que o cronômetro e o status da nuvem aparecem: acompanha sozinho.
  document.addEventListener('DOMContentLoaded', function () {
    var topo = document.querySelector('.topo');
    if (topo && window.ResizeObserver) new ResizeObserver(medirTopo).observe(topo);
  });

  // ---------- Lista de matérias ----------
  function renderLista(raiz) {
    var lista = Dados.disciplinas();
    raiz.appendChild(el('div', { class: 'pagina-topo' }, [
      el('div', null, [
        el('h1', { class: 'pagina-titulo', text: 'Resumos' }),
        el('div', { class: 'pagina-subtitulo', text: 'Um resumo por matéria, com títulos numerados e painel de navegação' })
      ]),
      el('div', { class: 'contador' }, [el('strong', { text: lista.length }), ' disciplina' + (lista.length === 1 ? '' : 's')])
    ]));
    if (!lista.length) {
      raiz.appendChild(el('div', { class: 'vazio' }, [
        el('p', { class: 'vazio-destaque', text: 'Nenhuma disciplina cadastrada.' }),
        el('p', { text: 'As disciplinas são cadastradas no Controle de Teoria e aparecem aqui automaticamente.' })
      ]));
      return;
    }
    var caixa = el('div', { class: 'lista-disciplinas' });
    raiz.appendChild(caixa);
    function desenhar(recs) {
      var porId = {};
      recs.forEach(function (r) { porId[r.disciplinaId] = r; });
      caixa.innerHTML = '';
      lista.forEach(function (d) {
        var r = porId[d.id];
        var temTexto = r && textoPuro(r.html).trim();
        caixa.appendChild(el('div', { class: 'linha-disciplina', style: { borderLeftColor: d.cor } }, [
          el('div', { class: 'linha-nome', text: d.nome }),
          el('div', { class: 'linha-config' }),
          el('div', { class: 'linha-metricas' }, [
            UI.metrica('Títulos', temTexto ? String(r.titulos || 0) : '—'),
            UI.metrica('Tamanho', temTexto ? tamanhoTexto(r.tamanho) : '—'),
            UI.metrica('Última edição', temTexto ? UI.haQuanto(isoDe(r.atualizadoEm)) : 'Sem resumo')
          ]),
          el('a', { class: 'btn btn-abrir', href: '#/resumos/' + d.id }, [temTexto ? 'Abrir resumo' : 'Começar resumo', UI.icone('seta')])
        ]));
      });
    }
    desenhar([]);
    ResumosDados.listar().then(desenhar).catch(function (e) { UI.aviso(e.message); });
  }

  function isoDe(ms) { var d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function tamanhoTexto(bytes) {
    bytes = bytes || 0;
    return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  }
  function textoPuro(html) { var d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent || (d.querySelector('img,table,hr') ? ' x' : ''); }
  function semAcento(t) { return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  // ---------- Limpeza do que é colado (Word, internet) ----------
  var IGNORAR = { SCRIPT: 1, STYLE: 1, META: 1, LINK: 1, TITLE: 1, HEAD: 1, XML: 1, IFRAME: 1, OBJECT: 1, svg: 1, SVG: 1, BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1 };
  var MAPA = {
    P: 'p', DIV: 'p', H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3', BLOCKQUOTE: 'blockquote',
    UL: 'ul', OL: 'ol', LI: 'li', TABLE: 'table', THEAD: 'thead', TBODY: 'tbody', TFOOT: 'tbody', TR: 'tr', TD: 'td', TH: 'th',
    HR: 'hr', BR: 'br', B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', SUB: 'sub', SUP: 'sup',
    A: 'a', IMG: 'img', SPAN: 'span', FONT: 'span', MARK: 'span'
  };
  var BLOCOS_TEXTO = { p: 1, h1: 1, h2: 1, h3: 1, li: 1, td: 1, th: 1, blockquote: 1 };

  function corValida(c) {
    c = (c || '').trim().toLowerCase();
    if (!c || c === 'transparent' || c === 'inherit' || c === 'initial' || c === 'windowtext' || c === 'auto' || /^var\(/.test(c)) return '';
    return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/.test(c) ? c : '';
  }
  // Preto e quase preto não precisam ficar gravados: o texto já é escuro na página do resumo.
  function ehPreto(c) {
    var x = document.createElement('span'); x.style.color = c; document.body.appendChild(x);
    var m = getComputedStyle(x).color.match(/\d+/g); x.remove();
    return m && (+m[0] + +m[1] + +m[2]) < 90;
  }

  function estilosUteis(origem, tag) {
    var s = origem.style || {}, r = [], fora = [];
    var cor = corValida(s.color || (origem.tagName === 'FONT' ? origem.getAttribute('color') : ''));
    if (cor && !ehPreto(cor)) r.push('color:' + cor);
    var fundo = corValida(s.backgroundColor || (origem.tagName === 'MARK' ? '#fff176' : ''));
    var mso = (origem.getAttribute('style') || '').match(/mso-highlight:\s*([a-z]+)/i);
    if (!fundo && mso) fundo = corValida(mso[1]);
    if (fundo && fundo !== 'white' && fundo !== '#ffffff' && fundo !== 'rgb(255, 255, 255)') r.push('background-color:' + fundo);
    var alinhar = (s.textAlign || origem.getAttribute('align') || '').toLowerCase();
    if (BLOCOS_TEXTO[tag] && /^(left|center|right|justify)$/.test(alinhar) && alinhar !== 'left') r.push('text-align:' + alinhar);
    var peso = s.fontWeight;
    if (tag === 'span' && (peso === 'bold' || +peso >= 600)) fora.push('b');
    if (tag === 'span' && s.fontStyle === 'italic') fora.push('i');
    if (tag === 'span' && /underline/.test(s.textDecoration || s.textDecorationLine || '')) fora.push('u');
    return { estilo: r.join(';'), envolver: fora };
  }

  function limpar(origem, destino) {
    Array.prototype.forEach.call(origem.childNodes, function (n) {
      if (n.nodeType === 3) { destino.appendChild(document.createTextNode(n.nodeValue.replace(/\s+/g, ' '))); return; }
      if (n.nodeType !== 1) return;
      var nome = n.tagName.toUpperCase();
      if (IGNORAR[nome] || nome.indexOf(':') >= 0) return; // tags do Word (o:p, v:shape...) ficam de fora
      var tag = MAPA[nome];
      if (!tag) { limpar(n, destino); return; }
      if (tag === 'br' || tag === 'hr') { destino.appendChild(document.createElement(tag)); return; }
      if (tag === 'img') {
        var src = n.getAttribute('src') || '';
        if (/^data:image\//i.test(src) || /^https?:/i.test(src)) destino.appendChild(el('img', { src: src, alt: '' }));
        return;
      }
      var info = estilosUteis(n, tag);
      var novo = document.createElement(tag);
      if (info.estilo) novo.setAttribute('style', info.estilo);
      if (tag === 'a') {
        var href = n.getAttribute('href') || '';
        if (!/^https?:/i.test(href)) { limpar(n, destino); return; }
        novo.setAttribute('href', href);
        novo.setAttribute('target', '_blank');
        novo.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'td' || tag === 'th') {
        ['colspan', 'rowspan'].forEach(function (a) { var v = n.getAttribute(a); if (v && +v > 1) novo.setAttribute(a, v); });
      }
      var alvo = novo;
      info.envolver.forEach(function (t) { var w = document.createElement(t); alvo.appendChild(w); alvo = w; });
      limpar(n, alvo);
      // Span sem estilo não acrescenta nada: só o conteúdo fica.
      if (tag === 'span' && !info.estilo) {
        while (novo.firstChild) destino.appendChild(novo.firstChild);
        return;
      }
      destino.appendChild(novo);
    });
  }

  function htmlLimpo(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var caixa = document.createElement('div');
    limpar(doc.body, caixa);
    // Parágrafos vazios repetidos (comuns no Word) viram um só.
    caixa.querySelectorAll('p').forEach(function (p) { if (!p.textContent.trim() && !p.querySelector('img,br') ) p.innerHTML = '<br>'; });
    return caixa.innerHTML;
  }

  // ---------- Imagens ----------
  function reduzirImagem(src) {
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () {
        var escala = Math.min(1, LADO_IMAGEM / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * escala));
        c.height = Math.max(1, Math.round(img.height * escala));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        var jpg = c.toDataURL('image/jpeg', 0.85);
        ok(jpg.length < src.length || escala < 1 ? jpg : src);
      };
      img.onerror = function () { ok(src); };
      img.src = src;
    });
  }
  function lerArquivo(arquivo) {
    return new Promise(function (ok, erro) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { erro(r.error); };
      r.readAsDataURL(arquivo);
    });
  }

  // ---------- Ícones da barra ----------
  function svg(caminho) { return el('span', { class: 'icone', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + caminho + '</svg>' }); }
  var ICONES = {
    esquerda: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="14" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="4" y1="18" x2="14" y2="18"/>',
    centro: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="10" x2="17" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="7" y1="18" x2="17" y2="18"/>',
    direita: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="10" y1="18" x2="20" y2="18"/>',
    justificar: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><line x1="4" y1="18" x2="20" y2="18"/>',
    marcadores: '<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
    numerada: '<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><path d="M4 4.5h1.5v4"/><path d="M3.8 13.5c.4-1 2.6-1 2.6.3 0 1-2.6 1.6-2.6 2.7h2.7"/>',
    linha: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="6" y1="7" x2="18" y2="7" stroke-opacity=".35"/><line x1="6" y1="17" x2="18" y2="17" stroke-opacity=".35"/>',
    tabela: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"/><line x1="3.5" y1="14.5" x2="20.5" y2="14.5"/><line x1="9.5" y1="9.5" x2="9.5" y2="19.5"/><line x1="15" y1="9.5" x2="15" y2="19.5"/>',
    imagem: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><polyline points="20.5 16 15 11 6 19.5"/>',
    desfazer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    refazer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    painel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><line x1="9" y1="4.5" x2="9" y2="19.5"/>',
    busca: '<circle cx="11" cy="11" r="6.5"/><line x1="16" y1="16" x2="20.5" y2="20.5"/>',
    seta: '<polyline points="9 6 15 12 9 18"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    video: '<rect x="2.5" y="5" width="19" height="14" rx="4"/><polygon points="10 9 15.5 12 10 15" fill="currentColor"/>',
    desenho: '<path d="M4 20c2-1 3-3 5-3s2 2 4 2 3-3 7-6"/><path d="M15 4l5 5-8 8-5-5z" fill="none"/>',
    caneta: '<path d="M16.5 3.5l4 4L8 20H4v-4z"/><line x1="13.5" y1="6.5" x2="17.5" y2="10.5"/>'
  };

  var CORES_TEXTO = [['Automática', ''], ['Vermelho', '#c62828'], ['Laranja', '#e65100'], ['Verde', '#2e7d32'], ['Azul', '#1565c0'], ['Roxo', '#6a1b9a'], ['Cinza', '#616161']];
  var CORES_MARCA = [['Sem marca-texto', ''], ['Amarelo', '#fff176'], ['Verde', '#b9f6ca'], ['Azul', '#b3e5fc'], ['Rosa', '#f8bbd0'], ['Laranja', '#ffe0b2']];

  // ---------- Editor da matéria ----------
  function renderMateria(raiz, id) {
    var d = Dados.disciplina(id);
    if (!d) { location.hash = '#/resumos'; return; }
    // A mesma matéria redesenhada (ex.: dados chegaram da nuvem): reaproveita o editor aberto, sem perder nada.
    if (atual && atual.id === id && atual.pagina) { raiz.appendChild(atual.pagina); return; }
    if (atual) atual.salvarJa();

    var carregado = false, editadoDesdeAbrir = false, timer = null, avisouTamanho = false;
    var status = el('span', { class: 'resumo-status', text: 'Carregando…' });
    var doc = el('div', { class: 'resumo-doc', contenteditable: 'false', spellcheck: 'true', lang: 'pt-BR', 'data-vazio': 'Comece a escrever. Use Título, Subtítulo e Subtítulo 2 para organizar os assuntos; eles aparecem numerados no painel de navegação.' });
    var navLista = el('div', { class: 'resumo-nav-lista' });
    var filtro = el('input', { type: 'search', class: 'resumo-nav-filtro', placeholder: 'Filtrar títulos', oninput: desenharNav });
    var colapsados = new WeakSet();
    var tituloAtual = null;
    var mini = false;
    try { mini = localStorage.getItem(CHAVE_PAINEL) === '1'; } catch (e) { /* preferência */ }

    function html() {
      if (!doc.querySelector('.celula-sel')) return doc.innerHTML;
      var copia = doc.cloneNode(true);
      copia.querySelectorAll('.celula-sel').forEach(function (x) { x.classList.remove('celula-sel'); if (!x.className) x.removeAttribute('class'); });
      return copia.innerHTML;
    }

    function salvarJa() {
      clearTimeout(timer);
      timer = null;
      if (!carregado || !editadoDesdeAbrir || doc.dataset.salvo === '1') return Promise.resolve();
      doc.dataset.salvo = '1';
      status.textContent = 'Salvando…';
      var conteudo = html();
      return ResumosDados.salvar(id, conteudo, tinta).then(function (rec) {
        status.textContent = 'Salvo às ' + new Date(rec.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if (rec.tamanho > LIMITE_AVISO && !avisouTamanho) {
          avisouTamanho = true;
          UI.aviso('Este resumo passou de 8 MB. Reduza ou remova imagens para a nuvem não ficar lenta.');
        }
      }).catch(function (e) {
        doc.dataset.salvo = '0';
        status.textContent = 'Não foi possível salvar';
        UI.aviso('Não foi possível salvar o resumo: ' + e.message);
      });
    }

    function alterou() {
      if (!carregado) return;
      editadoDesdeAbrir = true;
      doc.dataset.salvo = '0';
      status.textContent = 'Alterações não salvas…';
      clearTimeout(timer);
      timer = setTimeout(salvarJa, ESPERA_LOCAL);
      agendarNav();
    }

    // ---------- Comandos ----------
    function focar() { if (document.activeElement !== doc) doc.focus(); }
    function cmd(nome, valor) {
      focar();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(nome, false, valor == null ? null : valor);
      alterou();
    }
    function bloco(tag) { cmd('formatBlock', '<' + tag + '>'); }
    function inserirHtml(h) { focar(); document.execCommand('insertHTML', false, h); alterou(); }

    function elementoDaSelecao() {
      var s = window.getSelection();
      if (!s || !s.rangeCount) return null;
      var n = s.anchorNode;
      var e = n && (n.nodeType === 1 ? n : n.parentElement);
      return e && doc.contains(e) ? e : null;
    }
    function guardarSelecao() {
      var s = window.getSelection();
      return s && s.rangeCount && doc.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null;
    }
    function voltarSelecao(r) {
      doc.focus();
      var s = window.getSelection();
      s.removeAllRanges();
      if (r) s.addRange(r);
      else { var fim = document.createRange(); fim.selectNodeContents(doc); fim.collapse(false); s.addRange(fim); }
    }
    function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    // ---------- Tabelas ----------
    function tabela(acao, c) {
      if (acao === 'inserir') {
        var linhas = '';
        for (var i = 0; i < 3; i++) linhas += '<tr><td><br></td><td><br></td><td><br></td></tr>';
        inserirHtml('<table><tbody>' + linhas + '</tbody></table><p><br></p>');
        return;
      }
      if (!c) return;
      var tr = c.parentElement, tab = c.closest('table'), indice = Array.prototype.indexOf.call(tr.children, c);
      function novaLinha() {
        var nova = document.createElement('tr');
        Array.prototype.forEach.call(tr.children, function (x) { var n = document.createElement('td'); n.innerHTML = '<br>'; if (x.style.width) n.style.width = x.style.width; nova.appendChild(n); });
        return nova;
      }
      function novaColuna(antes) {
        tab.querySelectorAll('tr').forEach(function (r) {
          var ref = r.children[Math.min(indice, r.children.length - 1)];
          var nova = document.createElement(ref && ref.tagName === 'TH' ? 'th' : 'td');
          nova.innerHTML = '<br>';
          if (!ref) r.appendChild(nova); else if (antes) ref.before(nova); else ref.after(nova);
        });
      }
      if (acao === 'linha-acima') tr.before(novaLinha());
      else if (acao === 'linha-abaixo') tr.after(novaLinha());
      else if (acao === 'coluna-esquerda') novaColuna(true);
      else if (acao === 'coluna-direita') novaColuna(false);
      else if (acao === 'menos-linha') {
        var linhas = celulasMarcadas(c).map(function (x) { return x.parentElement; }).filter(function (x, i, l) { return l.indexOf(x) === i; });
        if (linhas.length >= tab.rows.length) tab.remove(); else linhas.forEach(function (x) { x.remove(); });
      } else if (acao === 'menos-coluna') {
        var colunas = celulasMarcadas(c).map(function (x) { return x.cellIndex; }).filter(function (x, i, l) { return l.indexOf(x) === i; }).sort(function (a, b) { return b - a; });
        var resta = 0;
        Array.prototype.forEach.call(tab.rows, function (r) { colunas.forEach(function (j) { if (r.cells[j]) r.cells[j].remove(); }); resta = Math.max(resta, r.cells.length); });
        if (!resta) tab.remove();
      } else if (acao === 'excluir') tab.remove();
      else if (acao === 'larguras') tab.querySelectorAll('td,th').forEach(function (x) { x.style.width = ''; });
      limparSelecaoCelulas();
      if (!tab.isConnected) esconderBarraTabela(); else if (acao !== 'larguras' && !c.isConnected) esconderBarraTabela();
      alterou();
    }

    function colunaDe(c) {
      var tab = c.closest('table'), i = Array.prototype.indexOf.call(c.parentElement.children, c);
      return Array.prototype.map.call(tab.querySelectorAll('tr'), function (r) { return r.children[i]; }).filter(Boolean);
    }

    // Largura da coluna: arrastar a borda direita de qualquer célula.
    var arrasto = null;
    function naBorda(e) {
      var c = e.target.closest && e.target.closest('td,th');
      if (!c || !doc.contains(c)) return null;
      var r = c.getBoundingClientRect();
      return e.clientX > r.right - 6 && e.clientX <= r.right + 2 ? c : null;
    }
    doc.addEventListener('mousemove', function (e) {
      if (arrasto) return;
      doc.classList.toggle('redimensionando', !!naBorda(e));
    });
    doc.addEventListener('mousedown', function (e) {
      var c = naBorda(e);
      if (!c) return;
      e.preventDefault();
      arrasto = { celulas: colunaDe(c), x: e.clientX, largura: c.getBoundingClientRect().width };
      doc.classList.add('redimensionando');
    });
    document.addEventListener('mousemove', function (e) {
      if (!arrasto) return;
      var w = Math.max(40, Math.round(arrasto.largura + e.clientX - arrasto.x));
      arrasto.celulas.forEach(function (x) { x.style.width = w + 'px'; });
    });
    document.addEventListener('mouseup', function () {
      if (!arrasto) return;
      arrasto = null;
      doc.classList.remove('redimensionando');
      alterou();
    });

    var CORES_CELULA = [['Sem preenchimento', ''], ['Amarelo', '#fff4b3'], ['Verde', '#d3f0d5'], ['Azul', '#d6e8fb'], ['Rosa', '#fadbe6'], ['Laranja', '#ffe6c7'], ['Roxo', '#e6dcf5'], ['Cinza', '#e6e8ee']];

    // ---------- Links ----------
    function normalizarLink(u) {
      u = (u || '').trim();
      if (!u) return '';
      if (!/^[a-z]+:/i.test(u)) u = 'https://' + u;
      return /^https?:\/\//i.test(u) ? u : '';
    }
    function prepararLinks() {
      doc.querySelectorAll('a[href]').forEach(function (a) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); });
    }
    function editarLink(a) {
      var r = guardarSelecao(), comTexto = r && !r.collapsed && !a;
      var endereco = el('input', { type: 'url', value: a ? a.getAttribute('href') : '', placeholder: 'https://www.tecconcursos.com.br/questoes/...' });
      var texto = el('input', { type: 'text', value: a ? a.textContent : '', placeholder: 'Texto que aparece no resumo' });
      var erro = el('div', { class: 'erro-form', hidden: true });
      UI.modal(a ? 'Editar link' : 'Inserir link', [
        UI.campo('Endereço', endereco, 'Por exemplo, o link de uma questão no TecConcursos.'),
        comTexto ? null : UI.campo('Texto do link', texto, a ? null : 'Se ficar vazio, aparece o próprio endereço.'),
        erro
      ], [
        { texto: 'Cancelar', classe: 'btn-secundario' },
        { texto: a ? 'Salvar' : 'Inserir', classe: 'btn-primario', acao: function () {
          var h = normalizarLink(endereco.value);
          if (!h) { erro.textContent = 'Informe um endereço que comece com http:// ou https://.'; erro.hidden = false; return false; }
          if (a) {
            a.setAttribute('href', h);
            if (texto.value.trim()) a.textContent = texto.value.trim();
            alterou();
            return;
          }
          voltarSelecao(r);
          if (comTexto) { document.execCommand('createLink', false, h); alterou(); }
          else inserirHtml('<a href="' + esc(h) + '">' + esc(texto.value.trim() || h) + '</a>&nbsp;');
          prepararLinks();
        } }
      ]);
      setTimeout(function () { endereco.focus(); }, 50);
    }
    function tirarLink(a) {
      var r = document.createRange();
      r.selectNodeContents(a);
      voltarSelecao(r);
      document.execCommand('unlink');
      esconderBolha();
      alterou();
    }

    // ---------- Vídeos do YouTube ----------
    function idYoutube(u) {
      var m = String(u || '').match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
      return m ? m[1] : null;
    }
    function inicioYoutube(u) {
      var m = String(u || '').match(/[?&#](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(\d+)?s?/);
      if (!m) return 0;
      return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    }
    function htmlVideo(id, inicio) {
      return '<figure class="resumo-video" contenteditable="false" data-youtube="' + id + '">' +
        '<figcaption>Vídeo do YouTube · clique aqui para as opções</figcaption>' +
        '<iframe src="https://www.youtube-nocookie.com/embed/' + id + (inicio ? '?start=' + inicio : '') + '" title="Vídeo do YouTube" ' +
        'allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></figure><p><br></p>';
    }
    function inserirVideo() {
      var r = guardarSelecao();
      var endereco = el('input', { type: 'url', placeholder: 'https://www.youtube.com/watch?v=...' });
      var erro = el('div', { class: 'erro-form', hidden: true });
      UI.modal('Inserir vídeo do YouTube', [
        UI.campo('Link do vídeo', endereco, 'Funciona com links do YouTube, inclusive youtu.be e Shorts. Se o link tiver o tempo (t=), o vídeo começa nele.'),
        erro
      ], [
        { texto: 'Cancelar', classe: 'btn-secundario' },
        { texto: 'Inserir', classe: 'btn-primario', acao: function () {
          var id = idYoutube(endereco.value);
          if (!id) { erro.textContent = 'Não reconheci um link do YouTube.'; erro.hidden = false; return false; }
          voltarSelecao(r);
          inserirHtml(htmlVideo(id, inicioYoutube(endereco.value)));
        } }
      ]);
      setTimeout(function () { endereco.focus(); }, 50);
    }

    // ---------- Desenho à mão livre ----------
    var CORES_CANETA = ['#1f2330', '#c62828', '#1565c0', '#2e7d32', '#e65100', '#6a1b9a', '#f9a825'];
    function abrirDesenho(imgExistente) {
      var L = 1000, A = 560, r = guardarSelecao();
      var tela = el('canvas', { class: 'desenho-tela', width: L, height: A });
      var ctx = tela.getContext('2d');
      var cor = CORES_CANETA[0], espessura = 4, borracha = false, historico = [], riscando = false, ultimo = null;
      if (imgExistente) {
        var base = new Image();
        base.onload = function () {
          var esc2 = Math.min(1, L / base.width, A / base.height);
          ctx.drawImage(base, (L - base.width * esc2) / 2, (A - base.height * esc2) / 2, base.width * esc2, base.height * esc2);
        };
        base.src = imgExistente.src;
      }
      function ponto(e) { var b = tela.getBoundingClientRect(); return { x: (e.clientX - b.left) * L / b.width, y: (e.clientY - b.top) * A / b.height }; }
      function tracar(de, ate) {
        ctx.globalCompositeOperation = borracha ? 'destination-out' : 'source-over';
        ctx.strokeStyle = cor;
        ctx.lineWidth = borracha ? espessura * 5 : espessura;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(de.x, de.y);
        ctx.lineTo(ate.x, ate.y);
        ctx.stroke();
      }
      tela.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        historico.push(ctx.getImageData(0, 0, L, A));
        if (historico.length > 40) historico.shift();
        riscando = true;
        ultimo = ponto(e);
        tracar(ultimo, { x: ultimo.x + 0.01, y: ultimo.y });
        tela.setPointerCapture(e.pointerId);
      });
      tela.addEventListener('pointermove', function (e) { if (!riscando) return; var p = ponto(e); tracar(ultimo, p); ultimo = p; });
      ['pointerup', 'pointercancel'].forEach(function (t) { tela.addEventListener(t, function () { riscando = false; }); });

      var botoesCor = CORES_CANETA.map(function (c) {
        return el('button', { type: 'button', class: 'desenho-cor' + (c === cor ? ' ativo' : ''), style: { background: c }, title: 'Cor', onclick: function () {
          cor = c; borracha = false; marcar();
        } });
      });
      var botoesEsp = [[2, 'Fina'], [4, 'Média'], [9, 'Grossa']].map(function (x) {
        return el('button', { type: 'button', class: 'desenho-opcao' + (x[0] === espessura ? ' ativo' : ''), text: x[1], onclick: function () { espessura = x[0]; marcar(); } });
      });
      var botaoBorracha = el('button', { type: 'button', class: 'desenho-opcao', text: 'Borracha', onclick: function () { borracha = !borracha; marcar(); } });
      function marcar() {
        botoesCor.forEach(function (b, i) { b.classList.toggle('ativo', !borracha && CORES_CANETA[i] === cor); });
        botoesEsp.forEach(function (b, i) { b.classList.toggle('ativo', [2, 4, 9][i] === espessura); });
        botaoBorracha.classList.toggle('ativo', borracha);
      }
      // Recorta as bordas vazias, para a imagem ocupar só o tamanho do desenho.
      function exportar() {
        var px = ctx.getImageData(0, 0, L, A).data, x0 = L, y0 = A, x1 = -1, y1 = -1;
        for (var y = 0; y < A; y++) for (var x = 0; x < L; x++) if (px[(y * L + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 < 0) return null;
        var m = 12; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(L - 1, x1 + m); y1 = Math.min(A - 1, y1 + m);
        var c = document.createElement('canvas');
        c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
        c.getContext('2d').drawImage(tela, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
        return c.toDataURL('image/png');
      }
      var m = UI.modal(imgExistente ? 'Editar desenho' : 'Desenho à mão livre', [
        el('div', { class: 'desenho-ferramentas' }, [
          el('div', { class: 'desenho-grupo' }, botoesCor),
          el('div', { class: 'desenho-grupo' }, botoesEsp.concat([botaoBorracha])),
          el('div', { class: 'desenho-grupo' }, [
            el('button', { type: 'button', class: 'desenho-opcao', text: 'Desfazer', onclick: function () { var u = historico.pop(); if (u) ctx.putImageData(u, 0, 0); } }),
            el('button', { type: 'button', class: 'desenho-opcao', text: 'Limpar', onclick: function () { historico.push(ctx.getImageData(0, 0, L, A)); ctx.clearRect(0, 0, L, A); } })
          ])
        ]),
        tela,
        el('p', { class: 'campo-ajuda', text: 'Desenhe com o mouse, a caneta ou o dedo. O desenho entra no resumo como imagem e pode ser editado depois.' })
      ], [
        { texto: 'Cancelar', classe: 'btn-secundario' },
        { texto: imgExistente ? 'Salvar desenho' : 'Inserir desenho', classe: 'btn-primario', acao: function () {
          var src = exportar();
          if (imgExistente) {
            if (src) imgExistente.src = src; else imgExistente.remove();
            esconderBolha();
            alterou();
            return;
          }
          if (!src) { UI.aviso('O desenho está vazio'); return false; }
          voltarSelecao(r);
          inserirHtml('<img class="resumo-desenho" src="' + src + '" alt="Desenho">');
        } }
      ]);
      m.caixa.classList.add('modal-largo', 'modal-desenho');
    }

    // ---------- Barra de opções flutuante (tabela, link, vídeo, imagem) ----------
    var folha = el('div', { class: 'resumo-folha' });
    var bolha = el('div', { class: 'resumo-bolha', hidden: true });
    function itemBolha(texto, titulo, acao, classe) {
      return el('button', { type: 'button', class: 'rbb ' + (classe || ''), text: texto, title: titulo || texto,
        onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.stopPropagation(); acao(); } });
    }
    function separador() { return el('span', { class: 'rbb-sep' }); }
    function mostrarBolha(alvo, itens) {
      bolha.innerHTML = '';
      itens.forEach(function (i) { if (i) bolha.appendChild(i); });
      bolha.hidden = false;
      var f = folha.getBoundingClientRect(), r = alvo.getBoundingClientRect();
      var topo = r.top - f.top - bolha.offsetHeight - 8;
      if (r.top - bolha.offsetHeight - 8 < (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--altura-topo'), 10) || 64) + 60) topo = r.bottom - f.top + 8;
      bolha.style.top = topo + 'px';
      bolha.style.left = Math.max(0, Math.min(r.left - f.left, f.width - bolha.offsetWidth)) + 'px';
    }
    function esconderBolha() { bolha.hidden = true; }

    function bolhaLink(a) {
      mostrarBolha(a, [
        el('a', { class: 'rbb-endereco', href: a.href, target: '_blank', rel: 'noopener noreferrer', text: a.getAttribute('href'), title: 'Abrir o link' }),
        itemBolha('Abrir', 'Abrir em nova aba', function () { window.open(a.href, '_blank', 'noopener'); }),
        itemBolha('Editar', null, function () { editarLink(a); }),
        itemBolha('Remover link', null, function () { tirarLink(a); }, 'perigo')
      ]);
    }
    function bolhaVideo(f) {
      mostrarBolha(f, [
        el('span', { class: 'rbb-rotulo', text: 'Vídeo' }),
        itemBolha('Abrir no YouTube', null, function () { window.open('https://www.youtube.com/watch?v=' + f.dataset.youtube, '_blank', 'noopener'); }),
        itemBolha('Remover vídeo', null, function () { var p = f.nextElementSibling; f.remove(); if (p && p.tagName === 'P' && !p.textContent.trim() && !doc.lastElementChild.isSameNode(p)) p.remove(); esconderBolha(); alterou(); }, 'perigo')
      ]);
    }
    function bolhaImagem(img) {
      var desenho = img.classList.contains('resumo-desenho');
      mostrarBolha(img, [
        el('span', { class: 'rbb-rotulo', text: desenho ? 'Desenho' : 'Imagem' }),
        desenho ? itemBolha('Editar desenho', null, function () { abrirDesenho(img); }) : null,
        itemBolha('Pequena', 'Largura de 30%', function () { img.style.width = '30%'; alterou(); }),
        itemBolha('Média', 'Largura de 60%', function () { img.style.width = '60%'; alterou(); }),
        itemBolha('Inteira', 'Largura total', function () { img.style.width = ''; alterou(); }),
        itemBolha('Remover', null, function () { img.remove(); esconderBolha(); alterou(); }, 'perigo')
      ]);
    }

    function atualizarBolha(alvoClicado) {
      if (!pagina.isConnected) return;
      var e = alvoClicado && doc.contains(alvoClicado) ? alvoClicado : elementoDaSelecao();
      if (!e) {
        if (!bolha.contains(document.activeElement)) esconderBolha();
        if (!barra.contains(document.activeElement)) esconderBarraTabela();
        return;
      }
      var c = e.closest('td,th');
      if (c) mostrarBarraTabela(c); else esconderBarraTabela();
      var video = e.closest('.resumo-video');
      if (video) { bolhaVideo(video); return; }
      if (e.tagName === 'IMG') { bolhaImagem(e); return; }
      var a = e.closest('a');
      if (a) { bolhaLink(a); return; }
      esconderBolha();
    }

    // ---------- Várias células: arrastar o mouse ou Shift+clique ----------
    var selCel = { inicio: null, arrastando: false };
    function limparSelecaoCelulas() {
      doc.querySelectorAll('.celula-sel').forEach(function (x) { x.classList.remove('celula-sel'); if (!x.className) x.removeAttribute('class'); });
    }
    function marcarRetangulo(a, b) {
      limparSelecaoCelulas();
      var tab = a.closest('table');
      if (a === b || tab !== b.closest('table')) return;
      var l0 = Math.min(a.parentElement.rowIndex, b.parentElement.rowIndex), l1 = Math.max(a.parentElement.rowIndex, b.parentElement.rowIndex);
      var c0 = Math.min(a.cellIndex, b.cellIndex), c1 = Math.max(a.cellIndex, b.cellIndex);
      Array.prototype.forEach.call(tab.rows, function (r, i) {
        if (i < l0 || i > l1) return;
        Array.prototype.forEach.call(r.cells, function (x, j) { if (j >= c0 && j <= c1) x.classList.add('celula-sel'); });
      });
    }
    function celulasMarcadas(c) {
      var m = Array.prototype.slice.call(c.closest('table').querySelectorAll('.celula-sel'));
      return m.length ? m : [c];
    }
    doc.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || arrasto) return;
      var c = e.target.closest && e.target.closest('td,th');
      if (!c || !doc.contains(c) || naBorda(e)) { limparSelecaoCelulas(); selCel.inicio = null; return; }
      if (e.shiftKey && selCel.inicio && selCel.inicio.closest('table') === c.closest('table')) {
        e.preventDefault();
        marcarRetangulo(selCel.inicio, c);
        mostrarBarraTabela(c);
        return;
      }
      limparSelecaoCelulas();
      selCel.inicio = c;
      selCel.arrastando = true;
    });
    doc.addEventListener('mouseover', function (e) {
      if (!selCel.arrastando || !selCel.inicio) return;
      var c = e.target.closest && e.target.closest('td,th');
      if (!c || c.closest('table') !== selCel.inicio.closest('table')) return;
      marcarRetangulo(selCel.inicio, c);
      if (doc.querySelector('.celula-sel')) {
        // Com várias células marcadas, o texto não fica selecionado junto.
        var s = window.getSelection(), r = document.createRange();
        r.selectNodeContents(c); r.collapse(false);
        s.removeAllRanges(); s.addRange(r);
      }
    });
    document.addEventListener('mouseup', function () { selCel.arrastando = false; });
    doc.addEventListener('input', limparSelecaoCelulas);
    document.addEventListener('selectionchange', function () {
      if (!pagina.isConnected || document.activeElement !== doc) return;
      clearTimeout(atualizarBolha.timer);
      atualizarBolha.timer = setTimeout(function () { atualizarBolha(); }, 120);
    });
    doc.addEventListener('click', function (e) {
      if (e.target.tagName === 'IMG' || e.target.closest('.resumo-video')) {
        var r = document.createRange();
        r.selectNode(e.target.closest('.resumo-video') || e.target);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      }
      // Ao arrastar por várias células, o clique cai na linha ou na tabela: mantém as células marcadas.
      if (doc.querySelector('.celula-sel') && !e.target.closest('td,th') && e.target.closest('table')) return;
      atualizarBolha(e.target);
    });
    document.addEventListener('mousedown', function (e) {
      if (!pagina.isConnected || bolha.hidden) return;
      if (!bolha.contains(e.target) && !doc.contains(e.target)) esconderBolha();
    });

    function inserirImagens(arquivos) {
      var lista = Array.prototype.filter.call(arquivos || [], function (f) { return /^image\//.test(f.type); });
      if (!lista.length) return;
      status.textContent = 'Preparando imagem…';
      Promise.all(lista.map(function (f) { return lerArquivo(f).then(reduzirImagem); })).then(function (srcs) {
        inserirHtml(srcs.map(function (s) { return '<img src="' + s + '" alt="">'; }).join(''));
      }).catch(function (e) { UI.aviso('Não foi possível inserir a imagem: ' + e.message); });
    }
    var escolherImagem = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: function () { inserirImagens(escolherImagem.files); escolherImagem.value = ''; } });

    // Imagens grandes que vieram coladas no meio do texto também são reduzidas.
    function reduzirColadas() {
      doc.querySelectorAll('img[src^="data:"]').forEach(function (img) {
        if (img.dataset.reduzida || img.src.length < 300000) return;
        img.dataset.reduzida = '1';
        reduzirImagem(img.src).then(function (s) { img.src = s; alterou(); });
      });
    }

    doc.addEventListener('paste', function (e) {
      var cd = e.clipboardData;
      if (!cd) return;
      var h = cd.getData('text/html');
      var arquivos = cd.files && cd.files.length ? cd.files : null;
      if (!h && arquivos) { e.preventDefault(); inserirImagens(arquivos); return; }
      if (h) { e.preventDefault(); inserirHtml(htmlLimpo(h)); setTimeout(reduzirColadas, 0); return; }
      var t = cd.getData('text/plain');
      if (t) { e.preventDefault(); focar(); document.execCommand('insertText', false, t); alterou(); }
    });
    doc.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); inserirImagens(e.dataTransfer.files); }
    });
    doc.addEventListener('input', alterou);
    doc.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.altKey && /^[0-3]$/.test(e.key)) {
        e.preventDefault();
        bloco(e.key === '0' ? 'p' : 'h' + e.key);
      }
    });
    // Links abrem numa nova aba com Ctrl+clique (clique simples continua editando).
    doc.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
    });

    // ---------- Barra de ferramentas ----------
    function botao(conteudo, titulo, acao, classe) {
      return el('button', { type: 'button', class: 'rb ' + (classe || ''), title: titulo, 'aria-label': titulo,
        onmousedown: function (e) { e.preventDefault(); }, onclick: acao }, conteudo);
    }
    function grupo(itens) { return el('div', { class: 'rb-grupo' }, itens); }

    function paleta(cores, titulo, aplicar, rotulo) {
      var aberto = false;
      var menu = el('div', { class: 'rb-paleta', hidden: true }, cores.map(function (c) {
        return el('button', { type: 'button', class: 'rb-cor' + (c[1] ? '' : ' sem'), title: c[0], 'aria-label': c[0], style: { background: c[1] || 'transparent' },
          onmousedown: function (e) { e.preventDefault(); }, onclick: function () { aplicar(c[1]); fechar(); } });
      }));
      function fechar() { aberto = false; menu.hidden = true; }
      var b = botao(rotulo, titulo, function (e) { e.stopPropagation(); aberto = !aberto; menu.hidden = !aberto; }, 'rb-com-menu');
      document.addEventListener('click', function (e) { if (aberto && !menu.contains(e.target) && e.target !== b) fechar(); });
      return el('div', { class: 'rb-menu' }, [b, menu]);
    }
    // ---------- Caneta: escrever e desenhar por cima do resumo, como no OneNote ----------
    // A folha tem largura fixa (no celular ela é reduzida inteira), e cada traço fica preso ao bloco
    // (parágrafo, título, tabela...) onde começou: se o texto acima muda, o traço acompanha o bloco.
    // Traço: { id, a: id do bloco, x, y: posição do bloco quando foi feito, c: cor, w: espessura, o: opacidade, p: [[x, y], ...] }
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var tinta = [];
    var tintaSvg = document.createElementNS(SVG_NS, 'svg');
    tintaSvg.setAttribute('class', 'resumo-tinta');
    var papel = el('div', { class: 'resumo-papel' }, [doc]);
    papel.appendChild(tintaSvg);
    var casco = el('div', { class: 'resumo-casco' }, [papel]);
    var escala = 1;

    function ajustarEscala() {
      if (!casco.isConnected) return;
      var disponivel = casco.clientWidth;
      escala = Math.min(1, disponivel / LARGURA_PAPEL);
      papel.style.transform = escala < 1 ? 'scale(' + escala + ')' : '';
      casco.style.height = escala < 1 ? Math.ceil(papel.offsetHeight * escala) + 'px' : '';
    }
    if (window.ResizeObserver) {
      var observador = new ResizeObserver(function () { ajustarEscala(); agendarTinta(); });
      observador.observe(casco);
      observador.observe(doc);
    }

    function blocoDe(id) { return id ? doc.querySelector('[data-tinta="' + id + '"]') : null; }
    function blocoEm(y) {
      var escolhido = null;
      Array.prototype.forEach.call(doc.children, function (b) { if (b.offsetTop <= y + 2) escolhido = b; });
      return escolhido || doc.firstElementChild;
    }
    // Formas: f = 'linha' | 'ret' | 'elipse', com p = [ponto inicial, ponto final]. Sem f, é traço à mão livre.
    function desenhoDoTraco(t) {
      if (!t.f) return caminho(t.p);
      var a = t.p[0], b = t.p[1] || t.p[0];
      if (t.f === 'linha') return 'M' + a[0] + ' ' + a[1] + ' L' + b[0] + ' ' + b[1];
      var x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
      if (t.f === 'ret') return 'M' + x0 + ' ' + y0 + ' H' + x1 + ' V' + y1 + ' H' + x0 + ' Z';
      var rx = r1((x1 - x0) / 2), ry = r1((y1 - y0) / 2), cx = r1(x0 + rx), cy = r1(y0 + ry);
      return 'M' + r1(cx - rx) + ' ' + cy + ' a' + rx + ' ' + ry + ' 0 1 0 ' + r1(2 * rx) + ' 0 a' + rx + ' ' + ry + ' 0 1 0 ' + r1(-2 * rx) + ' 0 Z';
    }
    // Com Shift (ou quadrado/círculo perfeitos), lados iguais; na linha, prende em 0°, 45° ou 90°.
    function ajustarForma(f, a, x, y, perfeito) {
      if (!perfeito) return [x, y];
      var dx = x - a[0], dy = y - a[1];
      if (f === 'linha') {
        var ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), d = Math.sqrt(dx * dx + dy * dy);
        return [r1(a[0] + Math.cos(ang) * d), r1(a[1] + Math.sin(ang) * d)];
      }
      var lado = Math.max(Math.abs(dx), Math.abs(dy));
      return [r1(a[0] + (dx < 0 ? -lado : lado)), r1(a[1] + (dy < 0 ? -lado : lado))];
    }
    function caminho(p) {
      if (!p.length) return '';
      var d = 'M' + p[0][0] + ' ' + p[0][1];
      if (p.length === 1) return d + ' l0.01 0';
      for (var i = 1; i < p.length - 1; i++) {
        var mx = ((p[i][0] + p[i + 1][0]) / 2).toFixed(1), my = ((p[i][1] + p[i + 1][1]) / 2).toFixed(1);
        d += ' Q' + p[i][0] + ' ' + p[i][1] + ' ' + mx + ' ' + my;
      }
      var u = p[p.length - 1];
      return d + ' L' + u[0] + ' ' + u[1];
    }
    function elementoTraco(t) {
      var b = blocoDe(t.a), bx = b ? b.offsetLeft : t.x, by = b ? b.offsetTop : t.y;
      var g = document.createElementNS(SVG_NS, 'path');
      g.setAttribute('d', desenhoDoTraco(t));
      g.setAttribute('transform', 'translate(' + bx + ' ' + by + ')');
      g.setAttribute('stroke', t.c);
      g.setAttribute('stroke-width', t.w);
      g.setAttribute('stroke-opacity', t.o || 1);
      g.setAttribute('data-id', t.id);
      return g;
    }
    function desenharTinta() {
      tintaSvg.setAttribute('width', papel.offsetWidth);
      tintaSvg.setAttribute('height', papel.offsetHeight);
      while (tintaSvg.firstChild) tintaSvg.removeChild(tintaSvg.firstChild);
      tinta.forEach(function (t) { tintaSvg.appendChild(elementoTraco(t)); });
    }
    var timerTinta = null;
    function agendarTinta() { clearTimeout(timerTinta); timerTinta = setTimeout(function () { desenharTinta(); ajustarEscala(); }, 60); }
    doc.addEventListener('input', agendarTinta);
    doc.addEventListener('load', agendarTinta, true); // imagens que terminam de carregar mudam a altura

    var caneta = { ligada: false, cor: '#1f2330', espessura: 3, marca: false, borracha: false, forma: '', perfeito: true };
    var desfazerTinta = [];
    function guardarTinta() { desfazerTinta.push(JSON.stringify(tinta)); if (desfazerTinta.length > 60) desfazerTinta.shift(); }
    function local(e) {
      var r = papel.getBoundingClientRect();
      return { x: (e.clientX - r.left) / escala, y: (e.clientY - r.top) / escala };
    }
    function r1(v) { return Math.round(v * 10) / 10; }

    var riscando = null, apagou = false;
    function apagarEm(e) {
      var achados = document.elementsFromPoint(e.clientX, e.clientY).filter(function (n) { return n.tagName === 'path' && n.parentNode === tintaSvg; });
      if (!achados.length) {
        // A borracha tem uma área maior que um ponto: procura também ao redor.
        [[-6, 0], [6, 0], [0, -6], [0, 6]].forEach(function (d) {
          document.elementsFromPoint(e.clientX + d[0], e.clientY + d[1]).forEach(function (n) { if (n.tagName === 'path' && n.parentNode === tintaSvg && achados.indexOf(n) < 0) achados.push(n); });
        });
      }
      if (!achados.length) return;
      if (!apagou) { guardarTinta(); apagou = true; }
      var ids = achados.map(function (n) { return n.getAttribute('data-id'); });
      tinta = tinta.filter(function (t) { return ids.indexOf(t.id) < 0; });
      achados.forEach(function (n) { n.remove(); });
    }
    tintaSvg.addEventListener('pointerdown', function (e) {
      if (!caneta.ligada) return;
      e.preventDefault();
      tintaSvg.setPointerCapture(e.pointerId);
      if (caneta.borracha) { apagou = false; riscando = { apagando: true }; apagarEm(e); return; }
      var p = local(e), b = blocoEm(p.y);
      if (!b) { inserirHtml('<p><br></p>'); b = doc.firstElementChild; }
      if (!b.getAttribute('data-tinta')) b.setAttribute('data-tinta', Dados.novoId());
      guardarTinta();
      var t = { id: Dados.novoId(), a: b.getAttribute('data-tinta'), x: b.offsetLeft, y: b.offsetTop,
        c: caneta.marca ? '#ffd600' : caneta.cor, w: caneta.marca ? 16 : caneta.espessura, o: caneta.marca ? 0.4 : 1,
        p: [[r1(p.x - b.offsetLeft), r1(p.y - b.offsetTop)]] };
      if (caneta.forma) { t.f = caneta.forma; t.p.push(t.p[0].slice()); }
      tinta.push(t);
      riscando = { traco: t, el: elementoTraco(t) };
      tintaSvg.appendChild(riscando.el);
    });
    tintaSvg.addEventListener('pointermove', function (e) {
      if (!riscando) return;
      if (riscando.apagando) { apagarEm(e); return; }
      var t = riscando.traco, p = local(e), b = blocoDe(t.a);
      var x = r1(p.x - (b ? b.offsetLeft : t.x)), y = r1(p.y - (b ? b.offsetTop : t.y)), u = t.p[t.p.length - 1];
      if (t.f) {
        // Quadrado e círculo saem perfeitos; o Shift libera retângulo e elipse. Na linha, o Shift prende o ângulo.
        var perfeito = t.f === 'linha' ? e.shiftKey : !e.shiftKey;
        t.p[1] = ajustarForma(t.f, t.p[0], x, y, perfeito);
        riscando.el.setAttribute('d', desenhoDoTraco(t));
        return;
      }
      if (Math.abs(x - u[0]) + Math.abs(y - u[1]) < 1.5) return;
      t.p.push([x, y]);
      riscando.el.setAttribute('d', caminho(t.p));
    });
    function fimTraco() {
      if (!riscando) return;
      // Forma sem tamanho (só um clique) não fica no resumo.
      var tr = riscando.traco;
      if (tr && tr.f && Math.abs(tr.p[1][0] - tr.p[0][0]) + Math.abs(tr.p[1][1] - tr.p[0][1]) < 3) {
        tinta = tinta.filter(function (x) { return x !== tr; });
        riscando.el.remove();
        desfazerTinta.pop();
        riscando = null;
        return;
      }
      var mudou = !riscando.apagando || apagou;
      riscando = null;
      if (mudou) alterou();
    }
    tintaSvg.addEventListener('pointerup', fimTraco);
    tintaSvg.addEventListener('pointercancel', fimTraco);

    function ligarCaneta(ligar) {
      caneta.ligada = ligar;
      pagina.classList.toggle('modo-caneta', ligar);
      barraCaneta.hidden = !ligar;
      botaoCaneta.classList.toggle('ativo', ligar);
      if (ligar) { esconderBolha(); esconderBarraTabela(); doc.blur(); }
      marcarCaneta();
    }
    var CORES_TINTA = ['#1f2330', '#c62828', '#1565c0', '#2e7d32', '#e65100', '#6a1b9a'];
    var botoesCorTinta = CORES_TINTA.map(function (c) {
      return el('button', { type: 'button', class: 'desenho-cor', style: { background: c }, title: 'Cor da caneta', onmousedown: function (e) { e.preventDefault(); },
        onclick: function () { caneta.cor = c; caneta.marca = false; caneta.borracha = false; marcarCaneta(); } });
    });
    var botoesEspTinta = [[2, 'Fina'], [3, 'Média'], [6, 'Grossa']].map(function (x) {
      return botao(x[1], 'Espessura ' + x[1].toLowerCase(), function () { caneta.espessura = x[0]; caneta.marca = false; caneta.borracha = false; marcarCaneta(); }, 'rb-texto');
    });
    var botaoMarcaTinta = botao(el('span', { class: 'rb-marca' }, ['Marca-texto']), 'Marca-texto à mão', function () { caneta.marca = !caneta.marca; caneta.borracha = false; marcarCaneta(); });
    var botaoBorrachaTinta = botao('Borracha', 'Apagar traços (passe por cima)', function () { caneta.borracha = !caneta.borracha; marcarCaneta(); }, 'rb-texto');
    var FORMAS = [['', 'Mão livre', 'Desenhar à mão livre'], ['linha', 'Linha', 'Linha reta (segure Shift para 0°, 45° ou 90°)'],
      ['ret', 'Quadrado', 'Quadrado (segure Shift para retângulo)'], ['elipse', 'Círculo', 'Círculo (segure Shift para elipse)']];
    var botoesForma = FORMAS.map(function (f) {
      return botao(f[1], f[2], function () { caneta.forma = f[0]; caneta.borracha = false; marcarCaneta(); }, 'rb-texto');
    });
    function marcarCaneta() {
      botoesCorTinta.forEach(function (b, i) { b.classList.toggle('ativo', !caneta.marca && !caneta.borracha && CORES_TINTA[i] === caneta.cor); });
      botoesEspTinta.forEach(function (b, i) { b.classList.toggle('ativo', !caneta.marca && !caneta.borracha && [2, 3, 6][i] === caneta.espessura); });
      botaoMarcaTinta.classList.toggle('ativo', caneta.marca && !caneta.borracha);
      botaoBorrachaTinta.classList.toggle('ativo', caneta.borracha);
      botoesForma.forEach(function (b, i) { b.classList.toggle('ativo', !caneta.borracha && FORMAS[i][0] === caneta.forma); });
      pagina.classList.toggle('caneta-borracha', caneta.borracha);
    }
    var barraCaneta = el('div', { class: 'rb-grupo rb-tabela rb-caneta', hidden: true }, [
      el('span', { class: 'rb-rotulo', text: 'Caneta' }),
      el('span', { class: 'rb-cores-caneta' }, botoesCorTinta),
      el('span', { class: 'rbb-sep' })
    ].concat(botoesForma, [el('span', { class: 'rbb-sep' })], botoesEspTinta, [
      el('span', { class: 'rbb-sep' }), botaoMarcaTinta, botaoBorrachaTinta, el('span', { class: 'rbb-sep' }),
      botao('Desfazer', 'Desfazer o último traço', function () { var u = desfazerTinta.pop(); if (u == null) return; tinta = JSON.parse(u); desenharTinta(); alterou(); }, 'rb-texto'),
      botao('Apagar tudo', 'Apagar todos os traços deste resumo', function () {
        if (!tinta.length) return;
        UI.confirmar('Apagar todos os traços feitos à mão neste resumo? O texto não é alterado.', function () { guardarTinta(); tinta = []; desenharTinta(); alterou(); }, 'Apagar');
      }, 'rb-texto rb-perigo'),
      botao('Concluir', 'Voltar a digitar', function () { ligarCaneta(false); }, 'rb-texto rb-concluir'),
      el('span', { class: 'rb-dica', text: 'Escreva ou desenhe com o mouse, a caneta ou o dedo. Cada traço fica preso ao parágrafo onde começou. Para rolar a página ou digitar, clique em Concluir.' })
    ]));
    var botaoCaneta = botao(svg(ICONES.caneta), 'Caneta: escrever por cima do resumo', function () { ligarCaneta(!caneta.ligada); });

    var barra = el('div', { class: 'resumo-barra' }, [
      grupo([
        botao('Texto', 'Texto normal (Ctrl+Alt+0)', function () { bloco('p'); }, 'rb-texto'),
        botao('Título', 'Título: 1. (Ctrl+Alt+1)', function () { bloco('h1'); }, 'rb-texto rb-h1'),
        botao('Subtítulo', 'Subtítulo: 1.1 (Ctrl+Alt+2)', function () { bloco('h2'); }, 'rb-texto rb-h2'),
        botao('Subtítulo 2', 'Subtítulo do subtítulo: 1.1.1 (Ctrl+Alt+3)', function () { bloco('h3'); }, 'rb-texto rb-h3')
      ]),
      grupo([
        botao(el('b', { text: 'N' }), 'Negrito (Ctrl+B)', function () { cmd('bold'); }),
        botao(el('i', { text: 'I' }), 'Itálico (Ctrl+I)', function () { cmd('italic'); }),
        botao(el('u', { text: 'S' }), 'Sublinhado (Ctrl+U)', function () { cmd('underline'); }),
        paleta(CORES_TEXTO, 'Cor do texto', function (c) { cmd('foreColor', c || '#1f2330'); }, el('span', { class: 'rb-a' }, ['A', el('i', { class: 'rb-a-cor' })])),
        paleta(CORES_MARCA, 'Marca-texto', function (c) { cmd('hiliteColor', c || 'transparent'); }, el('span', { class: 'rb-marca' }, ['ab']))
      ]),
      grupo([
        botao(svg(ICONES.marcadores), 'Lista com marcadores', function () { cmd('insertUnorderedList'); }),
        botao(svg(ICONES.numerada), 'Lista numerada', function () { cmd('insertOrderedList'); })
      ]),
      grupo([
        botao(svg(ICONES.esquerda), 'Alinhar à esquerda', function () { cmd('justifyLeft'); }),
        botao(svg(ICONES.centro), 'Centralizar', function () { cmd('justifyCenter'); }),
        botao(svg(ICONES.direita), 'Alinhar à direita', function () { cmd('justifyRight'); }),
        botao(svg(ICONES.justificar), 'Justificar', function () { cmd('justifyFull'); })
      ]),
      grupo([
        botao(svg(ICONES.linha), 'Linha horizontal', function () { inserirHtml('<hr><p><br></p>'); }),
        botao(svg(ICONES.tabela), 'Inserir tabela (clique numa tabela para editá-la)', function () { tabela('inserir'); }),
        botao(svg(ICONES.imagem), 'Imagem', function () { escolherImagem.click(); }),
        botaoCaneta
      ]),
      grupo([
        botao(svg(ICONES.link), 'Inserir link (selecione o texto antes)', function () { editarLink(null); }),
        botao(svg(ICONES.video), 'Vídeo do YouTube', inserirVideo)
      ]),
      grupo([
        botao(svg(ICONES.desfazer), 'Desfazer (Ctrl+Z)', function () { cmd('undo'); }),
        botao(svg(ICONES.refazer), 'Refazer (Ctrl+Y)', function () { cmd('redo'); })
      ]),
      escolherImagem
    ]);

    var barraTabela = el('div', { class: 'rb-grupo rb-tabela', hidden: true });
    var celulaBarra = null;
    function opcaoTabela(texto, titulo, acao, classe) { return botao(texto, titulo, function () { if (celulaBarra) acao(celulaBarra); }, 'rb-texto ' + (classe || '')); }
    barraTabela.append(
      el('span', { class: 'rb-rotulo', text: 'Tabela' }),
      opcaoTabela('+ Linha acima', 'Inserir linha acima', function (c) { tabela('linha-acima', c); }),
      opcaoTabela('+ Linha abaixo', 'Inserir linha abaixo', function (c) { tabela('linha-abaixo', c); }),
      opcaoTabela('+ Coluna à esquerda', 'Inserir coluna à esquerda', function (c) { tabela('coluna-esquerda', c); }),
      opcaoTabela('+ Coluna à direita', 'Inserir coluna à direita', function (c) { tabela('coluna-direita', c); }),
      el('span', { class: 'rbb-sep' }),
      opcaoTabela('− Linha', 'Excluir as linhas marcadas', function (c) { tabela('menos-linha', c); }),
      opcaoTabela('− Coluna', 'Excluir as colunas marcadas', function (c) { tabela('menos-coluna', c); }),
      el('span', { class: 'rbb-sep' }),
      paleta(CORES_CELULA, 'Preenchimento das células marcadas', function (cor) {
        if (!celulaBarra) return;
        celulasMarcadas(celulaBarra).forEach(function (x) { x.style.backgroundColor = cor; });
        alterou();
      }, el('span', { class: 'rb-preench' }, [el('i'), 'Preenchimento'])),
      opcaoTabela('Larguras iguais', 'Voltar as colunas à largura automática', function (c) { tabela('larguras', c); }),
      opcaoTabela('Excluir tabela', 'Excluir a tabela inteira', function (c) { UI.confirmar('Excluir esta tabela inteira?', function () { tabela('excluir', c); }, 'Excluir'); }, 'rb-perigo'),
      el('span', { class: 'rb-dica', text: 'Para marcar várias células, arraste o mouse ou use Shift+clique. Para mudar a largura, arraste a borda da coluna.' })
    );
    barra.appendChild(barraTabela);
    barra.appendChild(barraCaneta);
    function mostrarBarraTabela(c) { celulaBarra = c; barraTabela.hidden = false; }
    function esconderBarraTabela() { celulaBarra = null; barraTabela.hidden = true; limparSelecaoCelulas(); }

    // ---------- Painel de navegação ----------
    var timerNav = null;
    function agendarNav() { clearTimeout(timerNav); timerNav = setTimeout(desenharNav, 300); }

    function titulos() {
      var n1 = 0, n2 = 0, n3 = 0;
      return Array.prototype.map.call(doc.querySelectorAll('h1, h2, h3'), function (h) {
        var nivel = +h.tagName[1], numero;
        if (nivel === 1) { n1++; n2 = 0; n3 = 0; numero = n1 + '.'; }
        else if (nivel === 2) { n2++; n3 = 0; numero = n1 + '.' + n2; }
        else { n3++; numero = n1 + '.' + n2 + '.' + n3; }
        return { el: h, nivel: nivel, numero: numero, texto: h.textContent.trim() || '(sem texto)' };
      });
    }

    function desenharNav() {
      var lista = titulos(), q = semAcento(filtro.value.trim());
      navLista.innerHTML = '';
      if (!lista.length) {
        navLista.appendChild(el('p', { class: 'resumo-nav-vazio', text: 'Os títulos e subtítulos do resumo aparecem aqui.' }));
        return;
      }
      // Pais de cada título, para mostrar o contexto no filtro e para recolher.
      var pais = [], visiveis;
      lista.forEach(function (t, i) {
        pais[i] = [];
        for (var j = i - 1; j >= 0 && pais[i].length < t.nivel - 1; j--) {
          if (lista[j].nivel < t.nivel && (!pais[i].length || lista[j].nivel < lista[pais[i][0]].nivel)) pais[i].unshift(j);
        }
      });
      if (q) {
        visiveis = {};
        lista.forEach(function (t, i) {
          if (semAcento(t.numero + ' ' + t.texto).indexOf(q) >= 0) { visiveis[i] = 'achou'; pais[i].forEach(function (p) { if (!visiveis[p]) visiveis[p] = 'pai'; }); }
        });
        if (!Object.keys(visiveis).length) { navLista.appendChild(el('p', { class: 'resumo-nav-vazio', text: 'Nenhum título encontrado.' })); return; }
      }
      lista.forEach(function (t, i) {
        if (q && !visiveis[i]) return;
        if (!q && pais[i].some(function (p) { return colapsados.has(lista[p].el); })) return;
        var temFilhos = lista[i + 1] && lista[i + 1].nivel > t.nivel;
        var fechado = colapsados.has(t.el);
        navLista.appendChild(el('div', { class: 'resumo-nav-item nivel-' + t.nivel + (t.el === tituloAtual ? ' atual' : '') + (q && visiveis[i] === 'pai' ? ' contexto' : '') }, [
          temFilhos && !q ? el('button', { type: 'button', class: 'resumo-nav-seta' + (fechado ? '' : ' aberta'), title: fechado ? 'Mostrar subtítulos' : 'Esconder subtítulos',
            onclick: function () { if (fechado) colapsados.delete(t.el); else colapsados.add(t.el); desenharNav(); } }, svg(ICONES.seta))
            : el('span', { class: 'resumo-nav-espaco' }),
          el('button', { type: 'button', class: 'resumo-nav-link', title: t.numero + ' ' + t.texto, onclick: function () { irPara(t.el); } }, [
            el('span', { class: 'resumo-nav-num', text: t.numero }), el('span', { text: t.texto })
          ])
        ]));
      });
    }

    function irPara(h) {
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      pagina.classList.remove('nav-aberta');
      var r = document.createRange();
      r.selectNodeContents(h);
      r.collapse(false);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }

    function marcarAtual() {
      if (!pagina.isConnected) return;
      var lista = doc.querySelectorAll('h1, h2, h3'), achado = null;
      for (var i = 0; i < lista.length; i++) { if (lista[i].getBoundingClientRect().top < 160) achado = lista[i]; else break; }
      if (achado !== tituloAtual) { tituloAtual = achado; desenharNav(); }
    }
    window.addEventListener('scroll', function () { if (atual && atual.pagina === pagina) marcarAtual(); }, { passive: true });

    var botaoMini = el('button', { type: 'button', class: 'btn-icone resumo-nav-alternar', onclick: function () {
      mini = !mini;
      pagina.classList.toggle('nav-mini', mini);
      botaoMini.title = mini ? 'Mostrar o painel de navegação' : 'Minimizar o painel de navegação';
      try { localStorage.setItem(CHAVE_PAINEL, mini ? '1' : '0'); } catch (e) { /* preferência */ }
    } }, svg(ICONES.painel));
    botaoMini.title = mini ? 'Mostrar o painel de navegação' : 'Minimizar o painel de navegação';

    var painel = el('aside', { class: 'resumo-nav' }, [
      el('div', { class: 'resumo-nav-topo' }, [
        el('strong', { class: 'resumo-nav-titulo', text: 'Navegação' }),
        el('button', { type: 'button', class: 'link resumo-nav-todos', text: 'Abrir/fechar todos', onclick: function () {
          var lista = titulos(), algum = lista.some(function (t) { return colapsados.has(t.el); });
          lista.forEach(function (t) { if (algum) colapsados.delete(t.el); else colapsados.add(t.el); });
          desenharNav();
        } }),
        botaoMini,
        el('button', { type: 'button', class: 'btn-icone resumo-nav-fechar', title: 'Fechar', text: '✕', onclick: function () { pagina.classList.remove('nav-aberta'); } })
      ]),
      el('label', { class: 'resumo-nav-busca' }, [svg(ICONES.busca), filtro]),
      navLista
    ]);

    var pagina = el('div', { class: 'resumo-pagina' + (mini ? ' nav-mini' : '') }, [
      el('div', { class: 'pagina-topo resumo-cabeca' }, [
        el('div', null, [
          el('a', { class: 'link resumo-voltar', href: '#/resumos' }, [UI.icone('voltar'), 'Todos os resumos']),
          el('h1', { class: 'disciplina-titulo', text: d.nome }),
          el('div', { class: 'pagina-subtitulo' }, ['Resumo · ', status])
        ]),
        el('div', { class: 'pagina-acoes' }, [
          UI.botao('Navegação', function () { pagina.classList.add('nav-aberta'); }, 'btn-contorno resumo-abrir-nav'),
          UI.botao('Trocar matéria', function () { Teoria.trocarDisciplina('resumos', function () { return ''; }); }, 'btn-contorno', 'trocar')
        ])
      ]),
      el('div', { class: 'resumo-corpo' }, [
        painel,
        (folha.append(barra, bolha, casco), folha)
      ])
    ]);
    raiz.appendChild(pagina);
    atual = { id: id, pagina: pagina, salvarJa: salvarJa };
    requestAnimationFrame(ajustarEscala);

    function aplicar(rec) {
      doc.innerHTML = rec && rec.html ? rec.html : '<p><br></p>';
      if (!doc.innerHTML.trim()) doc.innerHTML = '<p><br></p>';
      doc.dataset.salvo = '1';
      tinta = rec && Array.isArray(rec.tinta) ? rec.tinta : [];
      desfazerTinta = [];
      desenharNav();
      desenharTinta();
      ajustarEscala();
      marcarAtual();
    }

    ResumosDados.obter(id).then(function (rec) {
      aplicar(rec);
      carregado = true;
      doc.setAttribute('contenteditable', 'true');
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* navegador antigo */ }
      status.textContent = rec ? 'Salvo às ' + new Date(rec.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Novo resumo';
      return ResumosDados.sincronizar(id);
    }).then(function (r) {
      if (!r || !r.daNuvem || atual.pagina !== pagina) return;
      if (editadoDesdeAbrir) { UI.aviso('Há uma versão mais nova deste resumo na nuvem. Ela será usada se você reabrir a matéria sem editar.'); return; }
      aplicar(r.rec);
      status.textContent = 'Atualizado da nuvem';
    }).catch(function (e) {
      status.textContent = 'Não foi possível abrir';
      UI.aviso(e.message);
    });
  }

  function render(raiz, params) {
    medirTopo();
    if (params[0]) renderMateria(raiz, params[0]);
    else {
      if (atual) { atual.salvarJa(); atual = null; }
      renderLista(raiz);
    }
  }

  return { render: render, htmlLimpo: htmlLimpo };
})();
