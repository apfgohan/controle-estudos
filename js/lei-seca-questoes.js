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

  var RE_URL = /tecconcursos\.com\.br\/questoes\/(\d+)\s*$/i;
  // Rodapé e cabeçalho das páginas impressas (às vezes na mesma linha que o título do caderno).
  var RE_RODAPE = /tecconcursos\.com\.br\/(?:questoes\/cadernos|s\/)|^\d+\s+of\s+\d+\b|^\d{2}\/\d{2}\/\d{4},?\s+\d{2}:\d{2}$|^Ordena[çc][ãa]o:/i;

  // Lê as questões de um PDF. Devolve { questoes, avisos }.
  function lerPdf(arquivo) {
    return linhasDoPdf(arquivo).then(function (linhas) {
      // Título do caderno (primeira linha comprida antes da primeira questão) se repete nos rodapés.
      var gab = {}, iGab = -1;
      for (var g = linhas.length - 1; g >= 0; g--) if (/^Gabarito$/i.test(linhas[g])) { iGab = g; break; }
      // As respostas podem vir lado a lado na mesma linha ("1) A 2) Certo 3) E").
      if (iGab >= 0) {
        var reG = /(\d+)\)\s*(Certo|Errado|Anulada|Anulado|[A-E])\b/gi, mg, txt = linhas.slice(iGab + 1).join(' ');
        while ((mg = reG.exec(txt))) gab[Number(mg[1])] = /^[a-e]$/i.test(mg[2]) ? mg[2].toUpperCase() : mg[2].charAt(0).toUpperCase() + mg[2].slice(1).toLowerCase();
      }
      var corpo = iGab >= 0 ? linhas.slice(0, iGab) : linhas;
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
  // Palavras úteis reduzidas ao radical (6 primeiras letras): "investidos" e "investimento" viram "invest".
  function uteis(ps) { return ps.filter(function (p) { return p.n.length > 1 && !VAZIA[p.n]; }).map(function (p) { return /^\d/.test(p.n) ? p.n : p.n.slice(0, 6); }); }
  // Pares e trincas de radicais seguidos (o par vale metade).
  function trincas(rs) {
    var r = [];
    for (var i = 0; i + 1 < rs.length; i++) {
      r.push('2 ' + rs[i] + ' ' + rs[i + 1]);
      if (i + 2 < rs.length) r.push('3 ' + rs[i] + ' ' + rs[i + 1] + ' ' + rs[i + 2]);
    }
    return r;
  }

  // Índice da lei: trincas de palavras úteis → dispositivos (com peso pela raridade).
  function indice(lei) {
    var partes = [], mapa = {}, porId = {};
    lei.artigos.forEach(function (a) {
      a.partes.forEach(function (p) {
        var texto = p.texto;
        var ps = palavras(texto), us = uteis(ps);
        var x = { id: p.id, art: a.id, texto: texto, palavras: ps, trincas: {} };
        trincas(us).forEach(function (t) { x.trincas[t] = true; });
        Object.keys(x.trincas).forEach(function (t) { (mapa[t] = mapa[t] || []).push(x); });
        partes.push(x); porId[p.id] = x;
      });
    });
    var total = partes.length || 1, idf = {};
    Object.keys(mapa).forEach(function (t) { idf[t] = Math.log(1 + total / mapa[t].length) * (t.charAt(0) === '2' ? 0.5 : 1); });
    return { partes: partes, mapa: mapa, idf: idf, porId: porId, numero: numeroDaLei(lei.nome) };
  }
  function numeroDaLei(nome) { var m = String(nome || '').match(/n[ºo°]?\s*([\d.]+)/i); return m ? m[1].replace(/\./g, '') : ''; }

  // Pontos de cada dispositivo para um texto (soma da raridade das trincas em comum).
  function pontuar(ix, texto) {
    var r = {};
    var vistos = {};
    trincas(uteis(palavras(texto))).forEach(function (t) {
      if (vistos[t] || !ix.mapa[t]) return;
      vistos[t] = true;
      ix.mapa[t].forEach(function (x) { r[x.id] = (r[x.id] || 0) + ix.idf[t]; });
    });
    return r;
  }

  // Citação explícita: "art. 20, § 1º", "art. 3º, II". Só vale se não citar outra lei (ou se citar esta).
  function citacoes(ix, texto) {
    var r = {}, re = /\bart(?:igo)?s?\.?\s*(\d+(?:\.\d+)*)\s*[º°o]?(?:\s*-\s*([A-Z]))?(?:\s*,?\s*(?:§\s*(\d+)|par[áa]grafo\s+([úu]nico))?)?(?:\s*,?\s*(?:inciso\s+)?([IVXLC]{1,6})\b)?([^.;]{0,60})/gi, m;
    while ((m = re.exec(texto))) {
      var resto = m[6] || '';
      var outra = resto.match(/(?:Lei|Decreto|C[óo]digo|CF|Constitui)[^\d]{0,20}([\d.]+)?/i);
      if (outra && (!outra[1] || outra[1].replace(/\./g, '') !== ix.numero)) continue;
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

  // Maior sequência de palavras em comum entre o dispositivo e o texto da questão (o trecho cobrado).
  function trechoComum(parte, texto) {
    var q = palavras(texto).map(function (p) { return p.n; }), d = parte.palavras;
    if (!q.length || !d.length) return '';
    var melhor = 0, fim = 0, ant = new Array(q.length + 1).fill(0);
    for (var i = 1; i <= d.length; i++) {
      var cur = new Array(q.length + 1).fill(0);
      for (var j = 1; j <= q.length; j++) {
        if (d[i - 1].n === q[j - 1]) { cur[j] = ant[j - 1] + 1; if (cur[j] > melhor) { melhor = cur[j]; fim = i; } }
      }
      ant = cur;
    }
    if (melhor < 4) return '';
    return parte.texto.slice(d[fim - melhor].ini, d[fim - 1].fim);
  }

  var LIMIAR = 18; // pontos mínimos para considerar a questão ligada a um dispositivo (calibrado num caderno real do TEC)

  // Liga uma questão: o enunciado e cada alternativa somam pontos (a alternativa correta pesa mais).
  function ligar(ix, q) {
    var unidades = [];
    if (q.tipo === 'ce' || !q.alternativas.length) unidades.push({ texto: q.enunciado, peso: 1 });
    else {
      unidades.push({ texto: q.enunciado, peso: 0.5 });
      q.alternativas.forEach(function (a) { unidades.push({ texto: a.texto, peso: a.letra === String(q.gabarito).toUpperCase() ? 1 : 0.6, letra: a.letra }); });
    }
    var total = {}, melhorUnidade = {}, daCerta = {};
    unidades.forEach(function (u) {
      var p = pontuar(ix, u.texto), c = citacoes(ix, u.texto);
      Object.keys(c).forEach(function (k) { p[k] = (p[k] || 0) + c[k]; });
      Object.keys(p).forEach(function (k) {
        var v = p[k] * u.peso;
        total[k] = (total[k] || 0) + v;
        if (u.peso === 1 && u.letra) daCerta[k] = p[k];
        if (!melhorUnidade[k] || p[k] > melhorUnidade[k].v) melhorUnidade[k] = { v: p[k], texto: u.texto };
      });
    });
    var ordem = Object.keys(total).sort(function (a, b) { return total[b] - total[a]; });
    // A alternativa correta, quando bate com um dispositivo, decide o principal (é o que a questão cobra).
    var certa = Object.keys(daCerta).sort(function (a, b) { return daCerta[b] - daCerta[a]; })[0];
    if (certa && daCerta[certa] >= LIMIAR) { ordem.splice(ordem.indexOf(certa), 1); ordem.unshift(certa); total[certa] = Math.max(total[certa], total[ordem[1]] || 0); }
    if (!ordem.length || total[ordem[0]] < LIMIAR) return [];
    var top = total[ordem[0]], arts = {}, lig = [];
    ordem.forEach(function (k) {
      if (lig.length >= 3 || total[k] < Math.max(LIMIAR, top * 0.6)) return;
      var x = ix.porId[k];
      if (arts[x.art] && lig.length) return; // um por artigo
      arts[x.art] = true;
      lig.push({ parte: k, art: x.art, pontos: Math.round(total[k] * 10) / 10, trecho: trechoComum(x, melhorUnidade[k].texto), principal: !lig.length });
    });
    return lig;
  }

  return { lerPdf: lerPdf, indice: indice, ligar: ligar, LIMIAR: LIMIAR };
})();
