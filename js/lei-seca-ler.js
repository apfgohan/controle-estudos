// Lei Seca: lê o arquivo da lei (PDF ou HTML do Planalto), tira o texto revogado/riscado e as citações de alteração,
// e monta a estrutura (divisões, artigos, parágrafos, incisos, alíneas) e as remissões internas.
var LeiSecaLer = (function () {

  // ---------- Texto ----------
  function limparEspacos(s) { return String(s || '').replace(/[   \t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); }
  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // Citações de alteração e notas entre parênteses (só as que começam com estas palavras).
  var CITACAO = /\(\s*(?:reda[çc][ãa]o\s+dad|inclu[íi]d|revogad|vide\b|vig[êe]ncia|promulga|regulamento|produ[çc][ãa]o\s+de\s+efeito|vetad|declara[çc][ãa]o\s+de\s+inconstitucionalidade|renumerad|acrescid|alterad|suprimid|express[ãa]o\s|com\s+reda[çc][ãa]o|transformad|convers[ãa]o\s+da|mantid|restabelecid|arquivad|ver\s+(?:adi|lei)|v\.\s*adi|adi\s|adin)(?:[^()]|\([^()]*\))*\)/gi;

  function tirarCitacoes(texto, cont) {
    var antes = texto;
    var t = texto.replace(CITACAO, function () { cont.citacoes++; return ''; });
    if (t !== antes) t = limparEspacos(t.replace(/\s+([.;:,])/g, '$1'));
    return t;
  }

  // ---------- Leitura do arquivo ----------
  function lerArquivo(arquivo) {
    var nome = arquivo.name || '';
    if (/\.html?$/i.test(nome) || /html/.test(arquivo.type)) return lerHtml(arquivo);
    if (/\.pdf$/i.test(nome) || arquivo.type === 'application/pdf') return lerPdf(arquivo);
    return Promise.reject(new Error('Envie a lei em PDF ou em HTML (página do Planalto salva).'));
  }

  // HTML do Planalto: costuma vir em windows-1252; o texto revogado está em <strike>/<s>/<del>.
  function lerHtml(arquivo) {
    return arquivo.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf), texto;
      var cabeca = new TextDecoder('latin1').decode(bytes.slice(0, 3000));
      var cs = (cabeca.match(/charset\s*=\s*["']?([\w-]+)/i) || [])[1];
      try { texto = new TextDecoder(cs && /utf-?8/i.test(cs) ? 'utf-8' : 'utf-8', { fatal: true }).decode(bytes); }
      catch (e) { texto = new TextDecoder('windows-1252').decode(bytes); }
      var doc = new DOMParser().parseFromString(texto, 'text/html');
      var cont = { riscados: 0, citacoes: 0 };
      doc.querySelectorAll('strike, s, del').forEach(function (n) { if (limparEspacos(n.textContent)) cont.riscados++; n.remove(); });
      doc.querySelectorAll('script, style').forEach(function (n) { n.remove(); });
      // Um parágrafo por linha; tabelas viram uma linha por célula.
      var linhas = [];
      doc.querySelectorAll('p, h1, h2, h3, h4, td, li, blockquote').forEach(function (n) {
        if (n.querySelector('p, td, li')) return; // só os blocos mais internos
        var centro = (n.getAttribute('align') || '').toLowerCase() === 'center' || /text-align:\s*center/i.test(n.getAttribute('style') || '');
        var t = limparEspacos(n.textContent);
        if (t) linhas.push({ texto: t, centro: centro });
      });
      return { origem: 'html', linhas: linhas, cont: cont, titulo: limparEspacos(doc.title) };
    });
  }

  // PDF: o texto vem do PDF.js; o riscado é detectado pelas linhas finas desenhadas na altura do meio do texto.
  function lerPdf(arquivo) {
    var cont = { riscados: 0, citacoes: 0 };
    return Leitor.carregarPdfJs().then(function (lib) {
      return arquivo.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; }).then(function (doc) {
        var paginas = [];
        for (var i = 1; i <= doc.numPages; i++) paginas.push(i);
        var linhas = [];
        return paginas.reduce(function (p, n) {
          return p.then(function () {
            return doc.getPage(n).then(function (pg) {
              return Promise.all([pg.getTextContent(), pg.getOperatorList()]).then(function (r) {
                linhasDaPagina(r[0], r[1], lib, cont, pg.view).forEach(function (l) { linhas.push(l); });
              });
            });
          });
        }, Promise.resolve()).then(function () {
          doc.destroy();
          return { origem: 'pdf', linhas: tirarRepetidas(linhas), cont: cont, titulo: '' };
        });
      });
    });
  }

  // Traços horizontais da página (linhas e retângulos finos), em coordenadas da página.
  function tracosDaPagina(ops, lib) {
    var OPS = lib.OPS, tracos = [], ctm = [1, 0, 0, 1, 0, 0], pilha = [];
    function mult(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; }
    function ponto(x, y) { return [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]; }
    function caixa(x0, y0, x1, y1) {
      var a = ponto(x0, y0), b = ponto(x1, y1), c = ponto(x0, y1), d = ponto(x1, y0);
      var xs = [a[0], b[0], c[0], d[0]], ys = [a[1], b[1], c[1], d[1]];
      var r = { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
      if (r.y1 - r.y0 <= 2.2 && r.x1 - r.x0 >= 3) tracos.push(r);
    }
    for (var i = 0; i < ops.fnArray.length; i++) {
      var fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === OPS.save) pilha.push(ctm.slice());
      else if (fn === OPS.restore) ctm = pilha.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mult(ctm, a);
      else if (fn === OPS.constructPath) {
        var sub = a[0], cs = a[1], k = 0, x = 0, y = 0;
        for (var j = 0; j < sub.length; j++) {
          var op = sub[j];
          if (op === OPS.rectangle) { var rx = cs[k], ry = cs[k + 1], rw = cs[k + 2], rh = cs[k + 3]; k += 4; caixa(rx, ry, rx + rw, ry + rh); }
          else if (op === OPS.moveTo) { x = cs[k]; y = cs[k + 1]; k += 2; }
          else if (op === OPS.lineTo) { var nx = cs[k], ny = cs[k + 1]; k += 2; if (Math.abs(ny - y) < 0.6) caixa(Math.min(x, nx), y - 0.3, Math.max(x, nx), y + 0.3); x = nx; y = ny; }
          else if (op === OPS.curveTo) k += 6;
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) k += 4;
        }
      }
    }
    return tracos;
  }

  // Junta os pedaços de texto em linhas (pela altura) e descarta os pedaços riscados.
  function linhasDaPagina(tc, ops, lib, cont, vista) {
    var tracos = tracosDaPagina(ops, lib);
    var itens = tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
      var h = Math.abs(it.transform[3]) || it.height || 8;
      return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: h };
    });
    var riscadoAntes = cont.riscados;
    // Um pedaço de texto pode ter parte riscada e parte não: tira só os caracteres que ficam sob o risco
    // (posição estimada pela largura média dos caracteres do pedaço).
    var partidos = [];
    itens.forEach(function (it) {
      var meio0 = it.y + it.h * 0.15, meio1 = it.y + it.h * 0.65;
      var corte = tracos.filter(function (t) { return t.y0 <= meio1 && t.y1 >= meio0 && t.x0 < it.x + it.w - 1 && t.x1 > it.x + 1; });
      if (!corte.length) { partidos.push(it); return; }
      var n = it.s.length, cw = it.w / Math.max(1, n), atual = null, tirados = 0;
      for (var i = 0; i < n; i++) {
        var cx = it.x + (i + 0.5) * cw;
        var sob = corte.some(function (t) { return cx >= t.x0 - 0.5 && cx <= t.x1 + 0.5; });
        if (sob) { tirados++; atual = null; continue; }
        if (!atual) { atual = { s: '', x: it.x + i * cw, y: it.y, w: 0, h: it.h, sobra: true }; partidos.push(atual); }
        atual.s += it.s[i]; atual.w += cw;
      }
      if (tirados > 2) cont.riscados++;
    });
    // Sobras de 1 ou 2 letras nas pontas de um risco (a largura dos caracteres é estimada) são descartadas.
    partidos = partidos.filter(function (it) { return !it.sobra || it.s.replace(/\s/g, '').length > 2; });
    itens = partidos.filter(function (it) { return it.s.trim(); });
    if (cont.riscados > riscadoAntes) cont.paginasComRisco = (cont.paginasComRisco || 0) + 1;
    itens.sort(function (a, b) { return Math.abs(b.y - a.y) > Math.min(a.h, b.h) * 0.5 ? b.y - a.y : a.x - b.x; });
    var linhas = [], atual = null, largura = vista ? vista[2] - vista[0] : 595;
    itens.forEach(function (it) {
      if (atual && Math.abs(atual.y - it.y) <= Math.min(atual.h, it.h) * 0.5) {
        atual.texto += (it.x - atual.fim > it.h * 0.15 ? ' ' : '') + it.s;
        atual.fim = it.x + it.w;
      } else {
        atual = { texto: it.s, y: it.y, h: it.h, x: it.x, fim: it.x + it.w };
        linhas.push(atual);
      }
    });
    return linhas.map(function (l) {
      var meio = (l.x + l.fim) / 2;
      return { texto: limparEspacos(l.texto), x: l.x, y: l.y, centro: Math.abs(meio - largura / 2) < largura * 0.08 && l.x > largura * 0.2, pdf: true };
    }).filter(function (l) { return l.texto; });
  }

  // Cabeçalhos e rodapés repetidos em muitas páginas (e números de página).
  function tirarRepetidas(linhas) {
    var conta = {};
    linhas.forEach(function (l) { var k = l.texto.replace(/\d+/g, '#'); conta[k] = (conta[k] || 0) + 1; });
    return linhas.filter(function (l) {
      if (/^\d+\s*(\/\s*\d+)?$/.test(l.texto) || /^p[áa]gina\s+\d+/i.test(l.texto)) return false;
      var k = l.texto.replace(/\d+/g, '#');
      return !(conta[k] >= 4 && l.texto.length < 120 && !/^(Art|§|[IVXLC]+\s*[-–])/.test(l.texto));
    });
  }

  // ---------- Estrutura ----------
  var RE_ART = /^Art(?:igo)?\.?\s*(\d+(?:\.\d+)*)\s*([º°o]|\.)?\s*(-\s*[A-Z]{1,2}\b)?\s*[.\-–—:]?\s*(.*)$/;
  var RE_PAR = /^(?:§\s*(\d+)\s*[º°o]?\s*(-\s*[A-Z]{1,2}\b)?|(Par[áa]grafo\s+[úu]nico))\s*[.\-–—:]?\s*(.*)$/i;
  var RE_INC = /^([IVXLCDM]{1,7})(\s*-\s*[A-Z]{1,2})?\s*[-–—.]\s*(.*)$/;
  var RE_ALI = /^([a-z]{1,2})\)\s*(.*)$/;
  var RE_DIV = /^(PARTE|LIVRO|T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\b\s*(.*)$/i;
  var NIVEL_DIV = { parte: 0, livro: 1, titulo: 2, capitulo: 3, secao: 4, subsecao: 5 };

  function romanoParaNum(r) {
    var v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }, n = 0;
    for (var i = 0; i < r.length; i++) { var a = v[r[i]], b = v[r[i + 1]] || 0; n += a < b ? -a : a; }
    return n;
  }
  function chaveNum(n, sufixo) { return String(n).replace(/\./g, '') + (sufixo ? '-' + sufixo.replace(/[\s-]/g, '').toLowerCase() : ''); }

  function ehVazio(texto) {
    var t = texto.replace(/[\s.;:,]/g, '').toLowerCase();
    return !t || /^\(?(revogad[oa]s?|vetad[oa]s?|suprimid[oa]s?)\)?$/.test(t);
  }

  // linhas → { nome, divisoes, artigos: [{ id, num, rotulo, rubrica, divisao, partes: [{ id, tipo, rotulo, texto, pai }] }] }
  function montar(lido) {
    var cont = { riscados: lido.cont.riscados, citacoes: 0, descartados: 0, repetidos: 0 };
    var nome = '', divisoes = [], artigos = [], art = null, ultimaParte = null, ultimoPar = null, ultimoInc = null;
    var rubrica = null, divPendente = null, comecou = false, terminou = false, porId = {};

    function novaParte(tipo, rotulo, texto, id, pai) {
      if (!art) return null;
      if (tipo !== 'caput' && porId[id]) { var n = 2; while (porId[id + '_' + n]) n++; id = id + '_' + n; }
      var p = { id: id, tipo: tipo, rotulo: rotulo, texto: texto, pai: pai || null };
      if (rubrica && tipo !== 'caput') { p.rubrica = rubrica; rubrica = null; }
      porId[id] = p;
      art.partes.push(p);
      ultimaParte = p;
      return p;
    }

    lido.linhas.forEach(function (l, i) {
      if (terminou) return;
      var t = l.texto;
      if (!nome && /^(LEI|DECRETO|CONSTITUI[ÇC][ÃA]O|EMENDA|MEDIDA PROVIS|C[ÓO]DIGO)/i.test(t) && t.length < 200) nome = t;
      if (comecou && /^(Bras[íi]lia|Rio de Janeiro),?\s+\d/.test(t)) { terminou = true; return; }
      var m;
      // Divisão: centralizada, em maiúsculas ou no formato "Seção II", "Capítulo Único" (linha curta).
      if ((m = t.match(RE_DIV)) && t.length < 160 && (l.centro || /^[A-ZÀ-Ý\s\d]+$/.test(t.split(/\s+/)[0]) ||
          (t.length < 90 && /^\S+\s+([IVXLCDM]+|[ÚU]nic[oa]|\d+)(?:\s*[-–—.]|\s*$)/i.test(t)))) {
        if (!comecou) { divPendente = null; }
        var tipo = semAcento(m[1]).toLowerCase();
        divPendente = { id: 'div' + divisoes.length, tipo: tipo, nivel: NIVEL_DIV[tipo], rotulo: limparEspacos(t.split(/\s[-–—]\s/)[0]), nome: (t.split(/\s[-–—]\s/)[1] || '').trim() };
        divisoes.push(divPendente);
        rubrica = null;
        return;
      }
      if ((m = t.match(RE_ART))) {
        comecou = true;
        var num = m[1], suf = m[3] ? m[3].replace(/[\s-]/g, '') : '';
        var id = 'art-' + chaveNum(num, suf);
        // Mesmo artigo de novo: o Planalto deixa redações antigas sem riscar e põe a atual por último.
        var velho = artigos.filter(function (a) { return a.id === id; })[0];
        if (velho) {
          artigos.splice(artigos.indexOf(velho), 1);
          velho.partes.forEach(function (p) { delete porId[p.id]; });
          cont.repetidos = (cont.repetidos || 0) + 1;
        }
        art = { id: id, num: num + (suf ? '-' + suf : ''), rotulo: 'Art. ' + num + (m[2] && /[º°o]/.test(m[2]) ? 'º' : '') + (suf ? '-' + suf : ''), rubrica: rubrica, divisao: divisoes.length ? divisoes.length - 1 : null, partes: [] };
        rubrica = null; divPendente = null; ultimoPar = null; ultimoInc = null;
        artigos.push(art);
        novaParte('caput', art.rotulo, m[4] || '', id, null);
        return;
      }
      if (!comecou) return;
      if ((m = t.match(RE_PAR))) {
        var pid = m[3] ? art.id + '-pu' : art.id + '-p' + chaveNum(m[1], m[2] ? m[2].replace(/[\s-]/g, '') : '');
        ultimoPar = novaParte('par', m[3] ? 'Parágrafo único' : '§ ' + m[1] + (Number(m[1]) < 10 ? 'º' : '') + (m[2] ? '-' + m[2].replace(/[\s-]/g, '') : ''), m[4] || '', pid, art.id);
        ultimoInc = null;
        return;
      }
      if ((m = t.match(RE_INC)) && art) {
        var base = ultimoPar ? ultimoPar.id : art.id;
        var iid = base + '-i' + romanoParaNum(m[1]) + (m[2] ? m[2].replace(/[\s-]/g, '').toLowerCase() : '');
        ultimoInc = novaParte('inc', m[1] + (m[2] ? '-' + m[2].replace(/[\s-]/g, '') : '') + ' –', m[3] || '', iid, base);
        return;
      }
      if ((m = t.match(RE_ALI)) && art && ultimoInc) {
        novaParte('ali', m[1] + ')', m[2] || '', ultimoInc.id + '-a' + m[1], ultimoInc.id);
        return;
      }
      // Nome da divisão (linha seguinte ao "CAPÍTULO II").
      if (divPendente && !divPendente.nome && t.length < 160 && (l.centro || t === t.toUpperCase())) { divPendente.nome = t; return; }
      // Rubrica (epígrafe) antes de um artigo ou parágrafo: linha curta sem pontuação final.
      var prox = lido.linhas[i + 1];
      if (t.length < 90 && /^[A-ZÀ-Ý]/.test(t) && !/\d|[.;:,)]$/.test(t) && prox && (RE_ART.test(prox.texto) || RE_PAR.test(prox.texto))) { rubrica = t; return; }
      // Continuação do dispositivo anterior (quebra de linha do PDF ou parágrafo sem marcador).
      if (ultimaParte) ultimaParte.texto = limparEspacos(ultimaParte.texto + ' ' + t);
    });

    // Limpeza: citações de alteração e dispositivos que ficaram vazios.
    artigos.forEach(function (a) {
      a.partes.forEach(function (p) { p.texto = tirarCitacoes(p.texto, cont); });
      var antes = a.partes.length;
      a.partes = a.partes.filter(function (p) { return !ehVazio(p.texto) || (p.tipo === 'caput' && a.partes.some(function (q) { return q.pai && !ehVazio(q.texto); })); });
      cont.descartados += antes - a.partes.length;
    });
    var total = artigos.length;
    artigos = artigos.filter(function (a) { return a.partes.length && !(a.partes.length === 1 && ehVazio(a.partes[0].texto)); });
    cont.descartados += total - artigos.length;
    // Divisões que ficaram sem artigos não aparecem.
    var usadas = {};
    artigos.forEach(function (a) { if (a.divisao != null) usadas[a.divisao] = true; });
    if (lido.titulo && !nome) nome = lido.titulo;
    return { nome: nome, divisoes: divisoes, artigos: artigos, cont: cont, origem: lido.origem };
  }

  // ---------- Remissões internas ----------
  // Encontra no texto as referências a dispositivos desta mesma lei e devolve [{ ini, fim, alvos: [ids] }].
  var EXTERNA = /^\s*,?\s*(?:d[ao]s?|n[ao]s?)\s+(?:Lei|Decreto|C[óo]digo|Constitui|CF|Medida|Emenda|Resolu|Regimento|Estatuto|Ato\s+das)/i;
  function numArt(s) { return String(s).replace(/[º°o.\s]/g, '').replace(/-/, '-').toLowerCase(); }
  function idArt(n) { var m = String(n).match(/^(\d+(?:\.\d+)*)\s*[º°o]?\s*(?:-\s*([A-Z]{1,2}))?/i); return m ? 'art-' + chaveNum(m[1], m[2] || '') : null; }

  function remissoes(texto, ctx, existe) {
    var achados = [];
    function add(ini, fim, alvos) {
      alvos = alvos.filter(existe);
      if (alvos.length && !achados.some(function (a) { return ini < a.fim && fim > a.ini; })) achados.push({ ini: ini, fim: fim, alvos: alvos });
    }
    var NUM = '(\\d+(?:\\.\\d+)*\\s*[º°o]?(?:\\s*-\\s*[A-Z]{1,2}\\b)?)';
    var ROM = '([IVXLCDM]{1,7}(?:-[A-Z])?)';
    var re;
    // alíneas "a" e "b" do inciso I (do caput / deste artigo / do § 1º / do art. N)
    re = new RegExp('\\bal[íi]neas?\\s+[“"\']?([a-z])[”"\']?(?:\\s*(?:,|e|a)\\s*[“"\']?([a-z])[”"\']?)*\\s+do\\s+inciso\\s+' + ROM + '(?:\\s+(?:do\\s+caput|deste\\s+artigo|do\\s+§\\s*' + NUM + '|do\\s+art\\.?\\s*' + NUM + '))?', 'gi');
    var ma0;
    while ((ma0 = re.exec(texto))) {
      var tA = ma0[0], restoA = texto.slice(ma0.index + tA.length, ma0.index + tA.length + 40);
      if (EXTERNA.test(restoA)) continue;
      // "a", "b" e "c" / "a" a "d": letras nas posições pares, conectivos nas ímpares.
      var pedacos = (' ' + tA.split(/\s+do\s+inciso/i)[0].replace(/^al[íi]neas?\s+/i, '') + ' ').split(/(\s*,\s*|\s+e\s+|\s+a\s+)/);
      var letras = pedacos.filter(function (x, k) { return k % 2 === 0; }).map(function (x) { return x.replace(/[“”"'\s]/g, ''); }).filter(function (x) { return /^[a-z]$/.test(x); });
      if (pedacos.some(function (x, k) { return k % 2 === 1 && /^\s+a\s+$/.test(x); }) && letras.length === 2) { var l0 = letras[0].charCodeAt(0), l1 = letras[1].charCodeAt(0); letras = []; for (var c = l0; c <= l1 && c - l0 < 15; c++) letras.push(String.fromCharCode(c)); }
      var incA = romanoParaNum(ma0[3].split('-')[0]);
      var baseA = ctx.art, mpA = tA.match(/do\s+§\s*(\d+)/i), maA = tA.match(/do\s+art\.?\s*(\d+(?:\.\d+)*\s*[º°o]?(?:\s*-\s*[A-Z]{1,2})?)/i);
      if (maA) baseA = idArt(maA[1]); else if (mpA) baseA = ctx.art + '-p' + mpA[1];
      add(ma0.index, ma0.index + tA.length, letras.map(function (l) { return baseA + '-i' + incA + '-a' + l; }));
    }
    // incisos I a V do caput / do § 1º / deste artigo / do art. N
    re = new RegExp('\\bincisos?\\s+' + ROM + '(?:\\s*(?:,|e|a|ao)\\s*' + ROM + ')*(?:\\s+(?:do\\s+caput|deste\\s+artigo|do\\s+§\\s*' + NUM + '|do\\s+par[áa]grafo\\s+[úu]nico|do\\s+art\\.?\\s*' + NUM + '))?', 'gi');
    var m;
    while ((m = re.exec(texto))) {
      var trecho = m[0], resto = texto.slice(m.index + trecho.length, m.index + trecho.length + 40);
      if (EXTERNA.test(resto)) continue;
      var romanos = (trecho.replace(/^incisos?\s+/i, '').split(/\s+(?:do|deste)\s/i)[0].match(/[IVXLCDM]{1,7}(?:-[A-Z])?/g) || []);
      var faixa = /\s(a|ao)\s/i.test(trecho.split(/\s+(?:do|deste)\s/i)[0]);
      var nums = romanos.map(function (r) { return romanoParaNum(r.split('-')[0]) + (r.indexOf('-') > 0 ? r.split('-')[1].toLowerCase() : ''); });
      if (faixa && nums.length === 2 && /^\d+$/.test(nums[0]) && /^\d+$/.test(nums[1])) { var a0 = Number(nums[0]), a1 = Number(nums[1]); nums = []; for (var q = a0; q <= a1 && q - a0 < 40; q++) nums.push(String(q)); }
      var base = ctx.art;
      var mp = trecho.match(/do\s+§\s*(\d+)/i), mu = /par[áa]grafo\s+[úu]nico/i.test(trecho), ma = trecho.match(/do\s+art\.?\s*(\d+(?:\.\d+)*\s*[º°o]?(?:\s*-\s*[A-Z]{1,2})?)/i);
      if (ma) base = idArt(ma[1]);
      else if (mp) base = ctx.art + '-p' + mp[1];
      else if (mu) base = ctx.art + '-pu';
      else if (!/caput|deste\s+artigo/i.test(trecho) && ctx.par) base = existe(ctx.par + '-i' + nums[0]) ? ctx.par : ctx.art;
      add(m.index, m.index + trecho.length, nums.map(function (n) { return base + '-i' + n; }));
    }
    // § 2º deste artigo / do art. N ; parágrafo único (do art. N)
    re = new RegExp('(?:§§?\\s*' + NUM + '(?:\\s*(?:,|e|a)\\s*' + NUM + ')?|par[áa]grafo\\s+[úu]nico)(?:\\s+(?:deste\\s+artigo|do\\s+art\\.?\\s*' + NUM + '))?', 'gi');
    while ((m = re.exec(texto))) {
      var tr = m[0], depois = texto.slice(m.index + tr.length, m.index + tr.length + 40);
      if (EXTERNA.test(depois)) continue;
      var ba = ctx.art, mart = tr.match(/do\s+art\.?\s*(\d+(?:\.\d+)*\s*[º°o]?(?:\s*-\s*[A-Z]{1,2})?)/i);
      if (mart) ba = idArt(mart[1]);
      var alvos = /par[áa]grafo\s+[úu]nico/i.test(tr) ? [ba + '-pu'] : (tr.replace(/do\s+art.*$/i, '').match(/\d+/g) || []).map(function (n) { return ba + '-p' + n; });
      if (ctx.parte && alvos.indexOf(ctx.parte) >= 0) continue; // o próprio dispositivo
      add(m.index, m.index + tr.length, alvos);
    }
    // art. 5º, arts. 5º e 8º, arts. 5º a 8º
    re = new RegExp('\\barts?\\.?\\s*' + NUM + '(?:\\s*(?:,|e|a)\\s*' + NUM + ')*', 'gi');
    while ((m = re.exec(texto))) {
      var tx = m[0], dep = texto.slice(m.index + tx.length, m.index + tx.length + 40);
      if (EXTERNA.test(dep)) continue;
      var ns = tx.replace(/^arts?\.?\s*/i, '').split(/\s*(?:,|\se\s|\sa\s)\s*/).map(idArt).filter(Boolean);
      if (/\sa\s/.test(tx) && ns.length === 2) {
        var n0 = parseInt(ns[0].slice(4), 10), n1 = parseInt(ns[1].slice(4), 10);
        if (n1 > n0 && n1 - n0 < 15) { ns = []; for (var z = n0; z <= n1; z++) ns.push('art-' + z); }
      }
      ns = ns.filter(function (x) { return x !== ctx.art; });
      add(m.index, m.index + tx.length, ns);
    }
    return achados.sort(function (a, b) { return a.ini - b.ini; });
  }

  return { lerArquivo: lerArquivo, montar: montar, remissoes: remissoes, limparEspacos: limparEspacos, semAcento: semAcento, tirarCitacoes: tirarCitacoes };
})();
