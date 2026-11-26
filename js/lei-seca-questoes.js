// Lei Seca: lê o caderno de questões impresso do TEC (PDF) e liga cada questão aos dispositivos da lei.
//   Questão: { id (do TEC), num, banca, ano, orgao, assunto, enunciado, alternativas: [{ letra, texto }], tipo ('ce'|'me'), gabarito }
//   Ligação: { parte (id do dispositivo), art, pontos, trecho (texto exato do dispositivo que foi cobrado), principal }
var LeiSecaQuestoes = (function () {
  var semAcento = LeiSecaLer.semAcento, limpar = LeiSecaLer.limparEspacos;

  // ---------- Leitura do PDF ----------
  function linhasDoPdf(arquivo) {
    return Leitor.carregarPdfJs().then(function (lib) {
      return arquivo.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; });
    }).then(function (doc) {
      var linhas = [], n = 1;
      function pagina() {
        if (n > doc.numPages) { doc.destroy(); return linhas; }
        return doc.getPage(n++).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var itens = tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) { return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || 8 }; });
          itens.sort(function (a, b) { return Math.abs(b.y - a.y) > Math.min(a.h, b.h) * 0.5 ? b.y - a.y : a.x - b.x; });
          var atual = null;
          itens.forEach(function (it) {
            if (atual && Math.abs(atual.y - it.y) <= Math.min(atual.h, it.h) * 0.5) { atual.t += (it.x - atual.fim > it.h * 0.15 ? ' ' : '') + it.s; atual.fim = it.x + it.w; }
            else { atual = { t: it.s, y: it.y, h: it.h, fim: it.x + it.w }; linhas.push(atual); }
          });
          return pagina();
        });
      }
      return pagina();
    }).then(function (ls) { return ls.map(function (l) { return limpar(l.t); }).filter(Boolean); });
  }

  // ---------- Leitura do HTML (página de impressão do caderno salva pelo navegador) ----------
  // O texto vira linhas como no PDF: uma linha por bloco (div, p, li…) e por quebra (<br>).
  var BLOCOS = 'address,article,aside,blockquote,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,tr,td,th,ul,label';
  function linhasDoHtml(arquivo) {
    return arquivo.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf), texto;
      try { texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { texto = new TextDecoder('windows-1252').decode(bytes); }
      var doc = new DOMParser().parseFromString(texto, 'text/html');
      doc.querySelectorAll('script, style, noscript, template, svg, [hidden], [aria-hidden="true"], [style*="display: none"], [style*="display:none"]').forEach(function (n) { n.remove(); });
      doc.querySelectorAll('br').forEach(function (n) { n.replaceWith(doc.createTextNode('\n')); });
      doc.querySelectorAll(BLOCOS).forEach(function (n) { n.insertBefore(doc.createTextNode('\n'), n.firstChild); n.appendChild(doc.createTextNode('\n')); });
      return (doc.body ? doc.body.textContent : '').split('\n').map(limpar).filter(Boolean);
    });
  }

  // PDF ou HTML do caderno do TEC.
  function lerArquivo(arquivo) {
    var html = /\.html?$/i.test(arquivo.name || '') || /html/.test(arquivo.type || '');
    return html ? lerLinhas(linhasDoHtml(arquivo), 'html') : lerPdf(arquivo);
  }

  var RE_URL = /tecconcursos\.com\.br\/questoes\/(\d+)\s*$/i;
  // Rodapé e cabeçalho das páginas impressas (às vezes na mesma linha que o título do caderno).
  var RE_RODAPE = /tecconcursos\.com\.br\/(?:questoes\/cadernos|s\/)|^\d+\s*(?:of|de|\/)\s*\d+\b|^\d{2}\/\d{2}\/\d{4},?\s+\d{2}:\d{2}$|^Ordena[çc][ãa]o:/i;

  // Lê as questões de um PDF. Devolve { questoes, avisos }.
  function lerPdf(arquivo) { return lerLinhas(linhasDoPdf(arquivo), 'pdf'); }

  function lerLinhas(promessaLinhas, origem) {
    return promessaLinhas.then(function (linhas) {
      // PDF sem texto: foi impresso como desenho/imagem (ex.: impressora "Microsoft Print to PDF").
      if (origem === 'pdf' && !linhas.length) {
        return { questoes: [], titulo: '', avisos: ['Este PDF não tem texto: as letras foram gravadas como desenho (isso acontece com a impressora "Microsoft Print to PDF"). No TEC, imprima de novo escolhendo o destino "Salvar como PDF", ou salve a página de impressão como HTML (Ctrl+S).'] };
      }
      // Título do caderno (primeira linha comprida antes da primeira questão) se repete nos rodapés.
      var gab = {}, iGab = -1;
      for (var g = linhas.length - 1; g >= 0; g--) if (/^Gabarito$/i.test(linhas[g])) { iGab = g; break; }
      // As respostas podem vir lado a lado na mesma linha ("1) A 2) Certo 3) E").
      if (iGab >= 0) {
        var reG = /(\d+)\)\s*(Certo|Errado|Anulada|Anulado|[A-E])\b/gi, mg, txt = linhas.slice(iGab + 1).join(' ');
        while ((mg = reG.exec(txt))) gab[Number(mg[1])] = /^[a-e]$/i.test(mg[2]) ? mg[2].toUpperCase() : mg[2].charAt(0).toUpperCase() + mg[2].slice(1).toLowerCase();
      }
      var corpo = iGab >= 0 ? linhas.slice(0, iGab) : linhas;
      // Cabeçalho de página: "26/11/2026, 19:32  Caderno …" (na mesma linha ou na seguinte). O título do caderno
      // que aparece ali é tirado de todas as páginas, para não invadir as questões.
      var RE_DATA = /^\d{2}\/\d{2}\/\d{4},?\s+\d{2}:\d{2}\s*/;
      var cabecalhos = {};
      corpo.forEach(function (l, i) {
        if (!RE_DATA.test(l)) return;
        var resto = l.replace(RE_DATA, '').trim();
        if (resto) cabecalhos[resto] = true;
        else if (corpo[i + 1] && !RE_URL.test(corpo[i + 1]) && corpo[i + 1].length < 90) cabecalhos[corpo[i + 1]] = true;
      });
      corpo = corpo.filter(function (l) { return !RE_DATA.test(l) && !cabecalhos[l]; });
      var primeira = corpo.findIndex(function (l) { return RE_URL.test(l); });
      var titulo = corpo.slice(0, primeira < 0 ? 0 : primeira).filter(function (l) { return !/^\d+\)\s*$/.test(l) && !RE_RODAPE.test(l); })[0] || '';
      var questoes = [], q = null;
      corpo.forEach(function (l) {
        var m = l.match(RE_URL);
        if (m) { q = { id: m[1], linhas: [] }; questoes.push(q); return; }
        if (!q) return;
        if (/^\d+\)\s*$/.test(l) || RE_RODAPE.test(l) || l === titulo) return;
        // Número da questão na margem, grudado no começo da linha ("12) Julgue o item…").
        if (!q.linhas.length || q.linhas.length === 2) l = l.replace(/^\d+\)\s+/, '');
        q.linhas.push(l);
      });
      var avisos = [];
      // Numeração do gabarito: normalmente 1..N para as N questões do arquivo. Se o gabarito tiver mais números
      // (arquivo que é o fim de uma impressão maior), as questões deste arquivo são as últimas.
      var chaves = Object.keys(gab).map(Number).sort(function (a, b) { return a - b; });
      var base = chaves.length ? chaves[0] : 1;
      if (chaves.length > questoes.length) { base = chaves[chaves.length - questoes.length]; avisos.push('O gabarito tem ' + chaves.length + ' respostas e o arquivo ' + questoes.length + ' questões: usei as últimas ' + questoes.length + ' respostas.'); }
      questoes = questoes.map(function (x, i) { return montarQuestao(x, base + i, gab[base + i]); });
      if (!questoes.length) avisos.push('Nenhuma questão encontrada. O arquivo precisa ser o caderno impresso do TEC (com os links das questões).');
      if (questoes.length && iGab < 0) avisos.push('O gabarito não foi encontrado no fim do arquivo: as questões entram sem a resposta certa.');
      return { questoes: questoes, avisos: avisos, titulo: titulo };
    });
  }

  function montarQuestao(x, num, gabarito) {
    var ls = x.linhas.slice();
    var cab = ls.shift() || '', assunto = ls.shift() || '';
    var ano = (cab.match(/(\d{4})\s*$/) || [])[1] || '';
    var banca = cab.split(' - ')[0].trim();
    var partes = cab.split('/');
    var q = { id: x.id, num: num, banca: banca, ano: ano ? Number(ano) : null, orgao: (partes[1] || '').trim(), cabecalho: cab, assunto: assunto, enunciado: '', alternativas: [], tipo: 'me', gabarito: gabarito || '' };
    // Certo/Errado: as duas últimas linhas.
    if (ls.length >= 2 && /^Certo$/i.test(ls[ls.length - 2]) && /^Errado$/i.test(ls[ls.length - 1])) {
      q.tipo = 'ce';
      q.enunciado = ls.slice(0, -2).join(' ');
      return q;
    }
    var atual = null, enun = [];
    ls.forEach(function (l) {
      var m = l.match(/^([a-e])\)\s*(.*)$/);
      if (m) { atual = { letra: m[1].toUpperCase(), texto: m[2] }; q.alternativas.push(atual); }
      else if (atual) atual.texto += ' ' + l;
      else enun.push(l);
    });
    q.enunciado = enun.join(' ');
    q.alternativas.forEach(function (a) { a.texto = limpar(a.texto); });
    return q;
  }

  // ---------- Ligação com a lei ----------
  var VAZIAS = ('a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para com sem sob ao aos à às e ou que se ' +
    'é ser são foi como mais menos não nao seu sua seus suas lhe lhes este esta estes estas esse essa isso aquele aquela qual quais quando ' +
    'onde ainda já ja também tambem bem apenas desde entre sobre até ate após apos cada outro outra outros outras mesmo mesma ' +
    'deve devem devera deverao pode podem podera poderao sera serao sendo ter tera terao ha houver caso forma termos').split(' ');
  var VAZIA = {}; VAZIAS.forEach(function (p) { VAZIA[semAcento(p)] = true; });

  // Palavras normalizadas com a posição no texto original.
  function palavras(texto) {
    var r = [], re = /[A-Za-zÀ-ÿ0-9º°ª]+/g, m;
    while ((m = re.exec(texto))) r.push({ n: semAcento(m[0]).toLowerCase().replace(/[º°ª]/g, ''), ini: m.index, fim: m.index + m[0].length });
    return r;
  }

  // Índice da lei: trincas de palavras úteis → dispositivos (com peso pela raridade).
  function indice(lei) {
    var partes = [], porId = {}, porRadical = {};
    lei.artigos.forEach(function (a) {
      a.partes.forEach(function (p) {
        var rd = radicais(p.texto);
        var x = { id: p.id, art: a.id, texto: p.texto, textoNorm: rd.texto, radicais: rd.lista };
        var vistos = {};
        rd.lista.forEach(function (w) { if (!vistos[w.r]) { vistos[w.r] = true; (porRadical[w.r] = porRadical[w.r] || []).push(x); } });
        partes.push(x); porId[p.id] = x;
      });
    });
    // Radicais presentes em muitos dispositivos (mais de 15%) não servem para achar candidatos.
    var limite = Math.max(8, partes.length * 0.15);
    Object.keys(porRadical).forEach(function (r) { if (porRadical[r].length > limite) delete porRadical[r]; });
    return { partes: partes, porId: porId, porRadical: porRadical, numero: numeroDaLei(lei.nome), cf: ehConstituicao(lei.nome) };
  }
  function numeroDaLei(nome) { var m = String(nome || '').match(/n[ºo°]?\s*([\d.]+)/i); return m ? m[1].replace(/\./g, '') : ''; }

  // ---------- Nova ligação (rigorosa) ----------
  // Nomes pelos quais a lei é citada nas questões (além do número).
  var APELIDOS = {
    '5172': ['ctn', 'codigo tributario'], '10406': ['codigo civil'], '2848': ['codigo penal'], '3689': ['codigo de processo penal', 'cpp'],
    '13105': ['codigo de processo civil', 'cpc'], '8078': ['codigo de defesa do consumidor', 'cdc'], '9784': ['lei do processo administrativo'],
    '8112': ['estatuto dos servidores', 'regime juridico unico'], '14133': ['nova lei de licitacoes'], '8429': ['improbidade']
  };
  function ehConstituicao(nome) { return /constitui/i.test(nome || ''); }
  // O texto cita esta lei (true), outra lei (false) ou nenhuma (null)?
  function citaLei(ix, texto) {
    var t = semAcento(texto || '').toLowerCase();
    var nums = [], re = /\b(?:lei|decreto|lc|lei complementar|decreto-lei|medida provisoria|mp)\s*(?:n[ºo°.]*\s*)?([\d.]{3,})/g, m;
    while ((m = re.exec(t))) nums.push(m[1].replace(/\./g, ''));
    if (nums.indexOf(ix.numero) >= 0) return true;
    if ((APELIDOS[ix.numero] || []).some(function (a) { return new RegExp('\\b' + a + '\\b').test(t); })) return true;
    if (ix.cf && /\b(cf|constituicao)\b/.test(t)) return true;
    if (nums.length) return false;
    if (/\b(ctn|cf\b|constituicao|codigo|cpc|cpp|cdc|clt)\b/.test(t)) return false;
    return null;
  }

  // Números por extenso entre parênteses depois do algarismo ("30 (trinta) dias") saem; extenso sozinho vira algarismo.
  var EXTENSO = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
    quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, noventa: 90, cem: 100, cento: 100, cento_e_oitenta: 180 };
  var VAZIA2 = {}; ('tem tera terao havera haver existe existem item seguinte julgue caso hipotese art arts artigo inciso paragrafo alinea lei ' +
    'cpc ctn cf correto correta incorreto incorreta afirmar afirmativa assertiva conforme segundo luz acordo').split(' ').forEach(function (p) { VAZIA2[p] = true; });
  // Sequência de radicais das palavras importantes (sem palavras vazias), com a posição de cada uma no texto.
  function radicais(texto) {
    var t = String(texto || ''), pula = [], mm, rePar = /\d+\s*(\([^)]{2,40}\))/g;
    while ((mm = rePar.exec(t))) { var i0 = mm.index + mm[0].length - mm[1].length; pula.push([i0, i0 + mm[1].length]); }
    var r = [];
    palavras(t).forEach(function (p) {
      if (pula.some(function (z) { return p.ini >= z[0] && p.fim <= z[1]; })) return; // "(trinta)" depois de "30"
      var n = p.n;
      if (EXTENSO[n] != null) n = String(EXTENSO[n]);
      if (n.length < 2 || VAZIA[n] || VAZIA2[n]) return;
      r.push({ r: /^\d/.test(n) ? n : n.slice(0, 6), ini: p.ini, fim: p.fim });
    });
    return { lista: r, texto: t };
  }
  // Maior subsequência comum (palavras na mesma ordem, podendo pular algumas) e o trecho do dispositivo que ela cobre.
  function subsequencia(a, b) {
    var n = a.length, m = b.length;
    if (!n || !m) return { tam: 0 };
    var dp = [];
    for (var i = 0; i <= n; i++) { dp.push(new Uint16Array(m + 1)); }
    for (i = 1; i <= n; i++) for (var j = 1; j <= m; j++) dp[i][j] = a[i - 1].r === b[j - 1].r ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    // Recupera as posições no dispositivo (b) para marcar o trecho cobrado.
    var pos = []; i = n; j = m;
    while (i > 0 && j > 0) {
      if (a[i - 1].r === b[j - 1].r) { pos.unshift(j - 1); i--; j--; }
      else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
    }
    return { tam: dp[n][m], pos: pos };
  }

  // Intervalo de artigos no assunto do TEC: "(arts. 128 a 138 do CTN)", "(art. 126 do CTN)", "(arts. 127 e 127-A do CTN)".
  function intervaloDoAssunto(assunto) {
    var m = String(assunto || '').match(/\barts?\.?\s*(\d+)\s*[º°o]?(-[A-Z])?(?:\s*(a|e|ao)\s*(\d+)\s*[º°o]?(-[A-Z])?)?([^)]*)/i);
    if (!m) return null;
    var de = Number(m[1]), ate = m[4] ? Number(m[4]) : de;
    if (m[3] && /^e$/i.test(m[3])) ate = Math.max(de, Number(m[4]));
    return { de: Math.min(de, ate), ate: Math.max(de, ate), resto: m[6] || '' };
  }
  function numeroDoArt(artId) { var m = String(artId).match(/^art-(\d+)/); return m ? Number(m[1]) : null; }

  // O que a questão afirma: o item (Certo/Errado, sem a introdução) ou as alternativas que vêm da lei.
  var INTRO = /julgue|assinale|marque|indique|considerando|acerca d|a respeito d|com rela[çc][ãa]o|no que (?:se refere|concerne|tange)|[àa] luz d|nos termos d|de acordo com|segundo o|conforme o/i;
  function textosAfirmados(q) {
    var enun = q.enunciado || '';
    // Tira as frases de introdução ("Julgue o item a seguir, à luz do CTN.").
    var frases = enun.split(/(?<=[.:?])\s+(?=[A-ZÀ-Ý"“(])/);
    var corpo = frases.filter(function (f, i) { return !(INTRO.test(f) && (i < frases.length - 1 || frases.length > 1) && f.length < 260); }).join(' ') || enun;
    if (q.tipo === 'ce' || !q.alternativas.length) return [corpo];
    var gab = String(q.gabarito || '').toUpperCase();
    var negativa = /incorret|errad|exceto|falsa|n[ãa]o\s+(?:é|est[áa]|se\s+aplica|constitui|corresponde|configura)|salvo/i.test(enun);
    var certa = q.alternativas.filter(function (a) { return a.letra === gab; })[0];
    var outras = q.alternativas.filter(function (a) { return a.letra !== gab; });
    if (!certa) return [corpo].concat(q.alternativas.map(function (a) { return a.texto; }));
    // "Assinale a incorreta": a lei está nas outras alternativas (e a correta é a pegadinha).
    if (negativa) return outras.map(function (a) { return a.texto; }).concat([corpo + ' ' + certa.texto]);
    return [certa.texto, corpo + ' ' + certa.texto];
  }

  var MIN_COM_INTERVALO = 5, MIN_SEM_INTERVALO = 7, COBERTURA = 0.5;

  // Liga uma questão aos dispositivos da lei. Devolve [{ parte, art, principal, confianca ('certa'|'alta'|'provavel'),
  // como ('citacao'|'texto'), pontos (palavras em comum), trecho, candidatos: [{ parte, pontos }] }] (vazio = sem ligação).
  function ligar(ix, q) {
    var todo = (q.enunciado || '') + ' ' + q.alternativas.map(function (a) { return a.texto; }).join(' ');
    var lei = citaLei(ix, q.assunto);
    var iv = intervaloDoAssunto(q.assunto);
    if (iv && citaLei(ix, iv.resto) === false) iv = null;
    // 1) Citação explícita do artigo (desta lei).
    var cit = Object.keys(citacoes(ix, todo));
    if (cit.length) {
      return cit.slice(0, 2).map(function (id, k) { var x = ix.porId[id]; return { parte: id, art: x.art, principal: !k, confianca: 'certa', como: 'citacao', pontos: 0, trecho: '', candidatos: [] }; });
    }
    // Assunto de outra lei (sem citação desta): não é desta lei.
    if (lei === false && !iv) return [];
    // 2) e 3) Texto que a questão afirma × dispositivos (no intervalo do assunto, se houver).
    var afirmados = textosAfirmados(q).map(radicais).filter(function (x) { return x.lista.length >= 3; });
    if (!afirmados.length) return [];
    var dentro = function (x) { var n = numeroDoArt(x.art); return iv && n != null && n >= iv.de && n <= iv.ate; };
    // Candidatos: dispositivos com 3+ radicais em comum (pelo índice), ou todos os do intervalo.
    var conta = {};
    afirmados.forEach(function (af) {
      var vistos = {};
      af.lista.forEach(function (w) {
        if (vistos[w.r]) return; vistos[w.r] = true;
        (ix.porRadical[w.r] || []).forEach(function (x) { conta[x.id] = (conta[x.id] || 0) + 1; });
      });
    });
    var cands = Object.keys(conta).filter(function (id) { return conta[id] >= 3 || (iv && dentro(ix.porId[id])); }).map(function (id) { return ix.porId[id]; });
    var notas = cands.map(function (x) {
      var melhor = null;
      afirmados.forEach(function (af) {
        var s = subsequencia(af.lista, x.radicais);
        // Cobertura sobre o menor dos dois textos: alternativa longa com comentário, ou dispositivo curto.
        var cob = s.tam / Math.max(1, Math.min(af.lista.length, x.radicais.length));
        if (!melhor || s.tam > melhor.tam || (s.tam === melhor.tam && cob > melhor.cob)) melhor = { tam: s.tam, cob: cob, pos: s.pos };
      });
      return { x: x, tam: melhor.tam, cob: melhor.cob, pos: melhor.pos, dentro: dentro(x) };
    });
    // Só disputam os dispositivos que passam nos mínimos (palavras em comum e cobertura); vence o de maior
    // nota (palavras × cobertura). Com intervalo no assunto, o melhor de dentro vence se estiver perto.
    var validas = notas.filter(function (n) { return n.tam >= (n.dentro ? MIN_COM_INTERVALO : MIN_SEM_INTERVALO) && n.cob >= COBERTURA; })
      .sort(function (a, b) { return b.tam * (0.5 + b.cob) - a.tam * (0.5 + a.cob) || (b.dentro - a.dentro); });
    var top = validas[0];
    if (iv && top && !top.dentro) {
      var noIv = validas.filter(function (n) { return n.dentro; })[0];
      if (noIv && noIv.tam >= top.tam - 1) top = noIv;
    }
    notas.sort(function (a, b) { return b.tam - a.tam; });
    if (!top) {
      // Sem texto literal suficiente, mas o assunto diz onde está: o dispositivo do intervalo que mais compartilha
      // palavras raras com a questão (em qualquer ordem). Fica "a conferir".
      if (!iv) return [];
      var raras = {};
      afirmados.forEach(function (af) { af.lista.forEach(function (w) { if (ix.porRadical[w.r]) raras[w.r] = true; }); });
      var melhor = null;
      ix.partes.forEach(function (x) {
        if (!dentro(x)) return;
        var vistos = {}, pts = 0;
        x.radicais.forEach(function (w) { if (raras[w.r] && !vistos[w.r]) { vistos[w.r] = true; pts += 1 / ix.porRadical[w.r].length; } });
        var n = Object.keys(vistos).length;
        if (n >= 2 && (!melhor || pts > melhor.pts)) melhor = { x: x, pts: pts, n: n };
      });
      if (!melhor) return [];
      return [{ parte: melhor.x.id, art: melhor.x.art, principal: true, confianca: 'provavel', como: 'assunto', pontos: melhor.n, dentroDoAssunto: true, trecho: '', candidatos: [] }];
    }
    var confianca = (top.dentro && top.tam >= 7) || top.tam >= 10 ? 'alta' : 'provavel';
    // Trecho cobrado: do primeiro ao último radical em comum, se não for muito espalhado.
    var trecho = '';
    if (top.pos && top.pos.length) {
      var rs = top.x.radicais, ini = rs[top.pos[0]].ini, fim = rs[top.pos[top.pos.length - 1]].fim;
      trecho = top.x.textoNorm.slice(ini, fim);
      if (trecho.split(/\s+/).length > top.tam * 3 + 6) trecho = '';
    }
    return [{ parte: top.x.id, art: top.x.art, principal: true, confianca: confianca, como: 'texto', pontos: top.tam, dentroDoAssunto: !!top.dentro, trecho: trecho,
      candidatos: notas.filter(function (n) { return n !== top; }).slice(0, 3).map(function (n) { return { parte: n.x.id, pontos: n.tam }; }) }];
  }

  // Citação explícita: "art. 20, § 1º", "art. 3º, II". Só vale se não citar outra lei (ou se citar esta).
  function citacoes(ix, texto) {
    var r = {}, re = /\bart(?:igo)?s?\.?\s*(\d+(?:\.\d+)*)\s*[º°o]?(?:\s*-\s*([A-Z]))?(?:\s*,?\s*(?:§\s*(\d+)|par[áa]grafo\s+([úu]nico))?)?(?:\s*,?\s*(?:inciso\s+)?([IVXLC]{1,6})\b)?([^.;]{0,60})/gi, m;
    while ((m = re.exec(texto))) {
      // O que vem logo depois ("do CTN", "da Lei 8.112", "da CF") diz de qual lei é o artigo.
      var resto = (m[6] || '').slice(0, 45);
      if (citaLei(ix, resto) === false) continue;
      var art = 'art-' + m[1].replace(/\./g, '') + (m[2] ? '-' + m[2].toLowerCase() : '');
      var alvo = art;
      if (m[3]) alvo += '-p' + m[3]; else if (m[4]) alvo += '-pu';
      if (m[5]) alvo += '-i' + romano(m[5]);
      if (!ix.porId[alvo]) alvo = ix.porId[art] ? art : null;
      if (alvo) r[alvo] = (r[alvo] || 0) + 25;
    }
    return r;
  }
  function romano(r) { var v = { I: 1, V: 5, X: 10, L: 50, C: 100 }, n = 0; for (var i = 0; i < r.length; i++) { var a = v[r[i]], b = v[r[i + 1]] || 0; n += a < b ? -a : a; } return n; }

  return { lerArquivo: lerArquivo, lerPdf: lerPdf, indice: indice, ligar: ligar, intervaloDoAssunto: intervaloDoAssunto };
})();
