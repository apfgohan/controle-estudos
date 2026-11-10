// Leitura das planilhas exportadas pelo TecConcursos (.xlsx), sem bibliotecas externas: o desempenho (histórico)
// e o índice de um caderno (incidência: Hierarquia | Índice | Quantidade | Porcentagem).
// Um .xlsx é um .zip com arquivos XML; o navegador descompacta com DecompressionStream.
//
// Formato esperado (aba "Desempenho"):
//   Hierarquia | Índice | Questões Resolvidas | Acertos (%) | Quantidade de acertos | Erros (%) | Quantidade de erros | Peso
//   - linha em NEGRITO sem código  -> disciplina (com o total dela)
//   - linhas com código (01, 02.01, 02.01.03...) -> assuntos e subassuntos da disciplina acima
//   - "Sem Classificação" sem código -> questões sem assunto definido
var Planilha = (function () {

  // ---------- ZIP ----------
  function abrirZip(buffer) {
    var dv = new DataView(buffer);
    var fimCentral = -1;
    for (var i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fimCentral = i; break; }
    }
    if (fimCentral < 0) throw new Error('O arquivo não é uma planilha .xlsx válida.');
    var total = dv.getUint16(fimCentral + 10, true);
    var pos = dv.getUint32(fimCentral + 16, true);
    var arquivos = {};
    var dec = new TextDecoder();
    for (var k = 0; k < total; k++) {
      if (dv.getUint32(pos, true) !== 0x02014b50) break;
      var lenNome = dv.getUint16(pos + 28, true);
      var lenExtra = dv.getUint16(pos + 30, true);
      var lenComent = dv.getUint16(pos + 32, true);
      var nome = dec.decode(new Uint8Array(buffer, pos + 46, lenNome));
      arquivos[nome] = {
        metodo: dv.getUint16(pos + 10, true),
        tamanho: dv.getUint32(pos + 20, true),
        local: dv.getUint32(pos + 42, true)
      };
      pos += 46 + lenNome + lenExtra + lenComent;
    }

    function texto(nome) {
      var a = arquivos[nome];
      if (!a) return Promise.resolve(null);
      var inicio = a.local + 30 + dv.getUint16(a.local + 26, true) + dv.getUint16(a.local + 28, true);
      var dados = new Uint8Array(buffer, inicio, a.tamanho);
      if (a.metodo === 0) return Promise.resolve(dec.decode(dados));
      if (a.metodo !== 8) return Promise.reject(new Error('Compressão não suportada no arquivo ' + nome));
      if (typeof DecompressionStream === 'undefined') {
        return Promise.reject(new Error('Este navegador é antigo demais para ler planilhas. Use o Chrome, Edge ou Firefox atualizados.'));
      }
      var fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(fluxo).text();
    }

    return { nomes: Object.keys(arquivos), texto: texto };
  }

  function xml(texto) { return new DOMParser().parseFromString(texto, 'application/xml'); }
  function tags(no, nome) { return Array.prototype.slice.call(no.getElementsByTagNameNS('*', nome)); }
  function filhos(no, nome) {
    return Array.prototype.filter.call(no.childNodes, function (n) { return n.nodeType === 1 && n.localName === nome; });
  }

  // ---------- Estilos: quais índices de estilo (s="N") são negrito ----------
  function estilosNegrito(docEstilos) {
    var negrito = {};
    if (!docEstilos) return negrito;
    var fontes = tags(docEstilos, 'fonts')[0];
    var fonteNegrito = fontes ? filhos(fontes, 'font').map(function (f) {
      var b = filhos(f, 'b')[0];
      if (!b) return false;
      var v = b.getAttribute('val');
      return v !== '0' && v !== 'false';
    }) : [];
    var xfs = tags(docEstilos, 'cellXfs')[0];
    if (xfs) filhos(xfs, 'xf').forEach(function (xf, i) {
      if (fonteNegrito[Number(xf.getAttribute('fontId') || 0)]) negrito[i] = true;
    });
    return negrito;
  }

  // ---------- Células ----------
  function colunaDe(ref) { return (ref || '').replace(/[0-9]/g, ''); }

  function lerLinhas(docPlanilha, compartilhadas, negrito) {
    return tags(docPlanilha, 'row').map(function (row) {
      var celulas = {};
      filhos(row, 'c').forEach(function (c) {
        var tipo = c.getAttribute('t');
        var valor;
        if (tipo === 'inlineStr') {
          valor = tags(c, 't').map(function (t) { return t.textContent; }).join('');
        } else {
          var v = filhos(c, 'v')[0];
          valor = v ? v.textContent : '';
          if (tipo === 's') valor = compartilhadas[Number(valor)] || '';
        }
        celulas[colunaDe(c.getAttribute('r'))] = { valor: String(valor).trim(), negrito: !!negrito[Number(c.getAttribute('s') || 0)] };
      });
      return celulas;
    });
  }

  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // Descobre as colunas pelo cabeçalho; se não achar, usa a posição padrão do TecConcursos.
  function mapearColunas(linhas) {
    var padrao = { codigo: 'A', nome: 'B', feitas: 'C', acertos: 'E', erros: 'G', pctAcerto: 'D', pctErro: 'F' };
    for (var i = 0; i < Math.min(linhas.length, 10); i++) {
      var mapa = {};
      for (var col in linhas[i]) {
        var t = normalizar(linhas[i][col].valor);
        if (t === 'hierarquia') mapa.codigo = col;
        else if (t === 'indice') mapa.nome = col;
        else if (t.indexOf('questoes resolvidas') === 0) mapa.feitas = col;
        else if (t.indexOf('quantidade de acertos') === 0) mapa.acertos = col;
        else if (t.indexOf('quantidade de erros') === 0) mapa.erros = col;
        else if (t.indexOf('acertos (%)') === 0) mapa.pctAcerto = col;
        else if (t.indexOf('erros (%)') === 0) mapa.pctErro = col;
        else if (t === 'quantidade') mapa.qtd = col;
        else if (t === 'porcentagem') mapa.pct = col;
      }
      if (mapa.nome && mapa.feitas) return { tipo: 'historico', linhaCabecalho: i, colunas: Object.assign({}, padrao, mapa) };
      if (mapa.nome && mapa.qtd) return { tipo: 'incidencia', linhaCabecalho: i, colunas: Object.assign({ codigo: 'A' }, mapa) };
    }
    return { tipo: 'historico', linhaCabecalho: -1, colunas: padrao };
  }

  function numero(celulas, col) {
    var c = celulas[col];
    var n = c ? Number(String(c.valor).replace(',', '.')) : NaN;
    return isNaN(n) ? null : n;
  }

  // ---------- Montagem: disciplinas e seus assuntos ----------
  function montar(linhas) {
    var m = mapearColunas(linhas);
    if (m.tipo === 'incidencia') return { tipo: 'incidencia', disciplinas: montarIncidencia(linhas, m) };
    var col = m.colunas;
    var corpo = linhas.slice(m.linhaCabecalho + 1);
    var algumNegrito = corpo.some(function (l) { return l[col.nome] && l[col.nome].negrito; });

    var disciplinas = [];
    var atual = null;
    var nomesPorCodigo = {};

    corpo.forEach(function (l) {
      var nomeCel = l[col.nome];
      if (!nomeCel || !nomeCel.valor) return;
      var codigo = l[col.codigo] ? l[col.codigo].valor : '';
      var feitas = numero(l, col.feitas) || 0;
      var acertos = numero(l, col.acertos);
      var erros = numero(l, col.erros);
      // Se faltar a quantidade, calcula pelo percentual.
      if (acertos == null && numero(l, col.pctAcerto) != null) acertos = Math.round(feitas * numero(l, col.pctAcerto) / 100);
      if (erros == null) erros = acertos != null ? feitas - acertos : 0;
      if (acertos == null) acertos = feitas - erros;

      var ehDisciplina = algumNegrito
        ? nomeCel.negrito && !codigo
        : !codigo && normalizar(nomeCel.valor) !== 'sem classificacao';

      if (ehDisciplina) {
        atual = { nomePlanilha: nomeCel.valor, feitas: feitas, acertos: acertos, erros: erros, topicos: [] };
        disciplinas.push(atual);
        nomesPorCodigo = {};
        return;
      }
      if (!atual) return; // linha solta antes da primeira disciplina

      var partes = codigo ? codigo.split('.') : [];
      var caminho = [];
      for (var i = 1; i < partes.length; i++) {
        var pai = nomesPorCodigo[partes.slice(0, i).join('.')];
        if (pai) caminho.push(pai);
      }
      if (codigo) nomesPorCodigo[codigo] = nomeCel.valor;
      atual.topicos.push({
        codigo: codigo, nome: nomeCel.valor, caminho: caminho,
        feitas: feitas, acertos: acertos, erros: erros
      });
    });

    return { tipo: 'historico', disciplinas: disciplinas };
  }

  // Incidência: a linha sem código é a disciplina (com o total); as demais são os assuntos, com a quantidade de questões.
  // chave = caminho normalizado (mesmo critério das Estatísticas); pai = chave do assunto acima.
  function montarIncidencia(linhas, m) {
    var col = m.colunas, disciplinas = [], atual = null, nomesPorCodigo = {};
    linhas.slice(m.linhaCabecalho + 1).forEach(function (l) {
      var nomeCel = l[col.nome];
      if (!nomeCel || !nomeCel.valor) return;
      var codigo = l[col.codigo] ? l[col.codigo].valor : '';
      var qtd = numero(l, col.qtd) || 0;
      if (!codigo && normalizar(nomeCel.valor) !== 'sem classificacao') {
        atual = { nomePlanilha: nomeCel.valor, total: qtd, topicos: [] };
        disciplinas.push(atual);
        nomesPorCodigo = {};
        return;
      }
      if (!atual) return;
      var partes = codigo ? codigo.split('.') : [], caminho = [];
      for (var i = 1; i < partes.length; i++) {
        var pai = nomesPorCodigo[partes.slice(0, i).join('.')];
        if (pai) caminho.push(pai);
      }
      if (codigo) nomesPorCodigo[codigo] = nomeCel.valor;
      atual.topicos.push({
        codigo: codigo, nome: nomeCel.valor, caminho: caminho, qtd: qtd,
        chave: normalizar(caminho.concat(nomeCel.valor).join(' > ')), pai: caminho.length ? normalizar(caminho.join(' > ')) : ''
      });
    });
    return disciplinas;
  }

  // ---------- Entrada principal ----------
  // Recebe um File (.xlsx) e devolve { tipo: 'historico' | 'incidencia', disciplinas: [...] }.
  function ler(arquivo) {
    return arquivo.arrayBuffer().then(function (buffer) {
      var zip = abrirZip(buffer);
      var abaPrincipal = zip.nomes.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort()[0];
      if (!abaPrincipal) throw new Error('Não encontrei nenhuma aba na planilha.');
      return Promise.all([zip.texto(abaPrincipal), zip.texto('xl/styles.xml'), zip.texto('xl/sharedStrings.xml')]);
    }).then(function (textos) {
      var compartilhadas = textos[2]
        ? tags(xml(textos[2]), 'si').map(function (si) { return tags(si, 't').map(function (t) { return t.textContent; }).join(''); })
        : [];
      var linhas = lerLinhas(xml(textos[0]), compartilhadas, estilosNegrito(textos[1] && xml(textos[1])));
      var r = montar(linhas);
      if (!r.disciplinas.length) throw new Error('Não encontrei disciplinas na planilha. Confira se é um arquivo exportado do TecConcursos.');
      return r;
    });
  }

  return { ler: ler, normalizar: normalizar };
})();
