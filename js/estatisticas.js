// Aba "Estatísticas": importa o histórico do TecConcursos e mostra os pontos fracos.
// Os dados importados ficam separados: não entram nas sessões nem nos cadernos (no Dashboard, só no Mapa de dificuldades).
var Estatisticas = (function () {
  var el = UI.el;
  var MINIMO = 10;          // só são classificados assuntos com MAIS de 10 questões
  var MUITO_IMPORTANTE = 30; // % de erro a partir do qual o assunto é "muito importante" (vermelho)
  var IMPORTANTE = 20;       // de 20% até 30%: "importante" (amarelo → laranja)

  // Estado da tela (sobrevive às re-renderizações)
  var periodo = { inicio: '', fim: '' };
  var previa = null;            // planilha lida, aguardando confirmação
  var filtros = { importacao: '', disciplina: '', soImportantes: false };
  var abertos = {};             // nós expandidos da árvore

  // ---------- Classificação por % de erro ----------
  function classificar(t) {
    if (t.feitas <= MINIMO) return 'pequena';
    if (t.pctErro >= MUITO_IMPORTANTE) return 'muito';
    if (t.pctErro >= IMPORTANTE) return 'importante';
    return 'normal';
  }

  // De amarelo (20%) a laranja escuro (30%).
  function corImportante(pct) {
    var f = Math.max(0, Math.min(1, (pct - IMPORTANTE) / (MUITO_IMPORTANTE - IMPORTANTE)));
    var h = 48 - f * 26;     // 48 (amarelo) → 22 (laranja)
    var l = 64 - f * 14;     // mais escuro perto dos 30%
    return 'hsl(' + h + ', 92%, ' + l + '%)';
  }

  function seloErro(t) {
    var c = classificar(t);
    var texto = UI.fmtPct(Math.round(t.pctErro * 10) / 10);
    if (c === 'pequena') return el('span', { class: 'selo-erro pequena', title: 'Amostra pequena (até ' + MINIMO + ' questões): não classificado', text: texto + '*' });
    if (c === 'muito') return el('span', { class: 'selo-erro muito', title: 'Muito importante: 30% de erro ou mais', text: texto });
    if (c === 'importante') return el('span', { class: 'selo-erro importante', title: 'Importante: entre 20% e 30% de erro', style: { background: corImportante(t.pctErro) }, text: texto });
    return el('span', { class: 'selo-erro normal', text: texto });
  }

  // ---------- Correspondência de disciplinas ----------
  var IGNORAR_PALAVRAS = ['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'para', 'com'];

  function palavras(nome) {
    return Planilha.normalizar(nome).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(function (t) {
      return t.length > 1 && IGNORAR_PALAVRAS.indexOf(t) < 0;
    });
  }
  function parecidas(a, b) { // "portugues" ~ "portuguesa"
    return a === b || (a.length >= 5 && b.length >= 5 && (a.indexOf(b) === 0 || b.indexOf(a) === 0));
  }
  // Fração das palavras do nome mais curto que aparecem no outro (0 a 1).
  function pontuacao(nomePlanilha, nomeCadastro) {
    var p = palavras(nomePlanilha), d = palavras(nomeCadastro);
    if (!p.length || !d.length) return 0;
    var curto = p.length <= d.length ? p : d, longo = curto === p ? d : p;
    var comuns = curto.filter(function (t) { return longo.some(function (x) { return parecidas(x, t); }); }).length;
    return comuns / curto.length;
  }

  // Devolve { escolha, status }: status = 'lembrada' | 'automatica' | 'sem'
  function corresponder(nomePlanilha) {
    var chave = Planilha.normalizar(nomePlanilha);
    var lembrada = Dados.db.apelidos[chave];
    if (lembrada === 'ignorar' || (lembrada && Dados.disciplina(lembrada))) return { escolha: lembrada, status: 'lembrada' };

    var melhor = null, nota = 0, empate = false;
    Dados.disciplinas().forEach(function (d) {
      var n = pontuacao(nomePlanilha, d.nome);
      if (n > nota) { melhor = d; nota = n; empate = false; }
      else if (n === nota && n > 0) empate = true;
    });
    if (melhor && nota >= 0.75 && !empate) return { escolha: melhor.id, status: 'automatica' };
    return { escolha: '', status: 'sem' };
  }

  function nomeSemParenteses(nome) { return nome.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || nome; }

  // ---------- Importação ----------
  function validarPeriodo() {
    if (!periodo.inicio || !periodo.fim) return 'Informe a data inicial e a data final do histórico.';
    if (periodo.inicio > periodo.fim) return 'A data inicial não pode ser depois da data final.';
    if (periodo.fim > UI.hoje()) return 'A data final não pode ser no futuro.';
    var ultimo = Dados.fimUltimaImportacao();
    if (ultimo && periodo.inicio <= ultimo) {
      return 'Já existe histórico importado até ' + UI.fmtData(ultimo) + '. Um novo arquivo precisa começar a partir de ' +
        UI.fmtData(UI.somarDias(ultimo, 1)) + ', para não contar as mesmas questões duas vezes.';
    }
    return null;
  }

  function lerArquivo(arquivo, mostrarErro) {
    var erro = validarPeriodo();
    if (erro) return mostrarErro(erro);
    if (!arquivo) return mostrarErro('Escolha o arquivo .xlsx exportado do TecConcursos.');
    Planilha.ler(arquivo).then(function (r) {
      if (r.tipo === 'incidencia') {
        return mostrarErro('Esta planilha é de incidência dos assuntos (colunas Quantidade e Porcentagem). Importe-a na aba Teoria, na página da matéria, em "Incidência dos assuntos (TEC)".');
      }
      previa = {
        nomeArquivo: arquivo.name, inicio: periodo.inicio, fim: periodo.fim,
        disciplinas: r.disciplinas.map(function (d) {
          var c = corresponder(d.nomePlanilha);
          return Object.assign({}, d, { escolha: c.escolha, status: c.status });
        })
      };
      App.atualizar();
    }).catch(function (e) {
      console.error(e);
      mostrarErro(e.message || 'Não foi possível ler a planilha.');
    });
  }

  function confirmarImportacao(mostrarErro) {
    var pendentes = previa.disciplinas.filter(function (d) { return !d.escolha; });
    if (pendentes.length) {
      return mostrarErro('Escolha o que fazer com: ' + pendentes.map(function (d) { return d.nomePlanilha; }).join(', ') + '.');
    }
    var mantidas = [];
    previa.disciplinas.forEach(function (d) {
      var chave = Planilha.normalizar(d.nomePlanilha);
      if (d.escolha === 'ignorar') { Dados.definirApelido(chave, 'ignorar'); return; }
      var id = d.escolha;
      if (id === 'nova') id = Dados.criarDisciplina({ nome: nomeSemParenteses(d.nomePlanilha) }).id;
      Dados.definirApelido(chave, id);
      mantidas.push({ disciplinaId: id, nomePlanilha: d.nomePlanilha, feitas: d.feitas, acertos: d.acertos, erros: d.erros, topicos: d.topicos });
    });
    Dados.adicionarImportacao({ inicio: previa.inicio, fim: previa.fim, nomeArquivo: previa.nomeArquivo, disciplinas: mantidas });
    var total = mantidas.reduce(function (s, d) { return s + d.feitas; }, 0);
    previa = null;
    periodo = { inicio: '', fim: '' };
    App.atualizar();
    UI.aviso('Histórico importado: ' + UI.fmtNum(total) + ' questões de ' + mantidas.length + ' disciplinas');
  }

  // ---------- Agregação ----------
  // Soma as importações (do filtro) por disciplina e por assunto, e monta a árvore de assuntos.
  function agregar(f) {
    f = f || filtros;
    var porDisc = {};
    Dados.importacoes().forEach(function (imp) {
      if (f.importacao && imp.id !== f.importacao) return;
      imp.disciplinas.forEach(function (x) {
        if (!Dados.disciplina(x.disciplinaId)) return;
        if (f.disciplina && x.disciplinaId !== f.disciplina) return;
        var d = porDisc[x.disciplinaId] || (porDisc[x.disciplinaId] = { disciplinaId: x.disciplinaId, feitas: 0, acertos: 0, erros: 0, mapa: {} });
        d.feitas += x.feitas; d.acertos += x.acertos; d.erros += x.erros;
        x.topicos.forEach(function (t) {
          var chave = Planilha.normalizar(t.caminho.concat(t.nome).join(' > '));
          var a = d.mapa[chave] || (d.mapa[chave] = { chave: chave, codigo: t.codigo, nome: t.nome, caminho: t.caminho, feitas: 0, acertos: 0, erros: 0 });
          a.codigo = t.codigo;
          a.feitas += t.feitas; a.acertos += t.acertos; a.erros += t.erros;
        });
      });
    });
    return Object.keys(porDisc).map(function (id) {
      var d = porDisc[id];
      d.disciplina = Dados.disciplina(id);
      d.pctErro = d.feitas ? d.erros / d.feitas * 100 : 0;
      d.topicos = Object.keys(d.mapa).map(function (k) { return d.mapa[k]; });
      var porCodigo = {};
      d.topicos.forEach(function (t) {
        t.pctErro = t.feitas ? t.erros / t.feitas * 100 : 0;
        t.disciplina = d.disciplina;
        t.filhos = [];
        if (t.codigo) porCodigo[t.codigo] = t;
      });
      // Pai = código sem o último trecho (02.01.03 → 02.01). Sem pai → raiz da disciplina.
      d.raizes = [];
      d.topicos.forEach(function (t) {
        var pai = t.codigo && t.codigo.indexOf('.') > 0 ? porCodigo[t.codigo.slice(0, t.codigo.lastIndexOf('.'))] : null;
        (pai ? pai.filhos : d.raizes).push(t);
      });
      d.topicos.forEach(function (t) { t.folha = !t.filhos.length; });
      d.contagem = contarClasses(d.topicos);
      return d;
    }).sort(function (a, b) { return a.disciplina.nome.localeCompare(b.disciplina.nome, 'pt-BR'); });
  }

  function contarClasses(topicos) {
    var c = { muito: 0, importante: 0, normal: 0, pequena: 0 };
    topicos.forEach(function (t) { c[classificar(t)]++; });
    return c;
  }

  // Ordem dentro de cada nível: classificados por % de erro (maior primeiro); amostras pequenas no fim.
  function ordenar(lista) {
    return lista.slice().sort(function (a, b) {
      var pa = a.feitas > MINIMO, pb = b.feitas > MINIMO;
      if (pa !== pb) return pa ? -1 : 1;
      if (pa) return b.pctErro - a.pctErro || b.erros - a.erros;
      return b.feitas - a.feitas;
    });
  }

  function relevante(t) {
    var c = classificar(t);
    return c === 'muito' || c === 'importante' || t.filhos.some(relevante);
  }

  // ---------- Telas ----------
  function painelImportar() {
    var erro = el('div', { class: 'erro-form', hidden: true });
    function mostrarErro(msg) { erro.textContent = msg; erro.hidden = false; return false; }

    if (previa) return painelPrevia(erro, mostrarErro);

    var ultimo = Dados.fimUltimaImportacao();
    var inicio = el('input', { type: 'date', value: periodo.inicio, min: ultimo ? UI.somarDias(ultimo, 1) : null, max: UI.hoje(), oninput: function () { periodo.inicio = inicio.value; } });
    var fim = el('input', { type: 'date', value: periodo.fim, max: UI.hoje(), oninput: function () { periodo.fim = fim.value; } });
    var arquivo = el('input', { type: 'file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    return el('section', { class: 'painel painel-importar' }, [
      el('div', { class: 'grafico-topo' }, [
        el('h2', { class: 'secao-titulo', text: 'Importar histórico do TecConcursos' }),
        el('span', { class: 'data-fraca', text: ultimo ? 'Último período importado termina em ' + UI.fmtData(ultimo) : 'Nenhuma importação ainda' })
      ]),
      el('div', { class: 'passos-importar' }, [
        el('div', { class: 'passo' }, [
          el('div', { class: 'passo-num', text: '1' }),
          el('div', { class: 'passo-corpo' }, [
            el('div', { class: 'passo-titulo', text: 'Período do histórico' }),
            el('div', { class: 'campos-linha' }, [UI.campo('De', inicio), UI.campo('Até', fim)]),
            el('div', { class: 'campo-ajuda', text: ultimo
              ? 'O novo período precisa começar a partir de ' + UI.fmtData(UI.somarDias(ultimo, 1)) + ' (não pode repetir datas já importadas).'
              : 'A planilha não traz datas: informe a quais dias ela se refere.' })
          ])
        ]),
        el('div', { class: 'passo' }, [
          el('div', { class: 'passo-num', text: '2' }),
          el('div', { class: 'passo-corpo' }, [
            el('div', { class: 'passo-titulo', text: 'Planilha (.xlsx)' }),
            arquivo,
            el('div', { class: 'campo-ajuda', text: 'No TecConcursos: Desempenho → exportar para Excel.' })
          ])
        ])
      ]),
      erro,
      el('div', { class: 'acoes-direita' }, UI.botao('Ler planilha', function () { erro.hidden = true; lerArquivo(arquivo.files[0], mostrarErro); }, 'btn-primario'))
    ]);
  }

  function painelPrevia(erro, mostrarErro) {
    var discs = Dados.disciplinas();
    var semCorresp = previa.disciplinas.filter(function (d) { return d.status === 'sem'; });
    var total = previa.disciplinas.reduce(function (s, d) { return s + d.feitas; }, 0);

    var linhas = previa.disciplinas.map(function (d) {
      var sel = el('select', { class: !d.escolha ? 'pendente' : '', onchange: function () { d.escolha = sel.value; sel.classList.toggle('pendente', !sel.value); } }, [
        el('option', { value: '', text: '— escolha —', selected: !d.escolha }),
        el('optgroup', { label: 'Disciplinas cadastradas' }, discs.map(function (x) {
          return el('option', { value: x.id, text: x.nome, selected: d.escolha === x.id });
        })),
        el('option', { value: 'nova', text: '➕ Criar nova disciplina "' + nomeSemParenteses(d.nomePlanilha) + '"', selected: d.escolha === 'nova' }),
        el('option', { value: 'ignorar', text: '🚫 Ignorar os dados desta matéria', selected: d.escolha === 'ignorar' })
      ]);
      var status = d.status === 'sem' ? UI.selo('Sem correspondência', 'aviso')
        : d.status === 'lembrada' ? UI.selo('Lembrada', 'neutro') : UI.selo('Identificada', 'sucesso');
      return el('tr', { class: d.status === 'sem' ? 'linha-alerta' : '' }, [
        el('td', null, [el('div', { class: 'data-forte', text: d.nomePlanilha }), el('div', { class: 'data-fraca', text: d.topicos.length + ' assuntos' })]),
        el('td', { text: UI.fmtNum(d.feitas) }),
        el('td', null, UI.acerto(d.feitas ? d.acertos / d.feitas * 100 : 0, d.feitas)),
        el('td', { class: 'col-corresp' }, sel),
        el('td', null, status)
      ]);
    });

    return el('section', { class: 'painel painel-importar' }, [
      el('div', { class: 'grafico-topo' }, [
        el('h2', { class: 'secao-titulo', text: 'Conferir importação' }),
        el('span', { class: 'data-fraca', text: previa.nomeArquivo + ' · ' + UI.fmtData(previa.inicio) + ' a ' + UI.fmtData(previa.fim) + ' · ' + UI.fmtNum(total) + ' questões' })
      ]),
      semCorresp.length ? el('div', { class: 'aviso-suave aviso-icone' }, [
        UI.icone('alerta'),
        el('span', null, [
          el('strong', { text: semCorresp.length === 1 ? '1 matéria da planilha não tem correspondência: ' : semCorresp.length + ' matérias da planilha não têm correspondência: ' }),
          semCorresp.map(function (d) { return d.nomePlanilha; }).join(', ') + '. Escolha uma disciplina cadastrada, crie uma nova ou ignore os dados dela.'
        ])
      ]) : null,
      el('p', { class: 'data-fraca', text: 'Confira a qual disciplina cadastrada corresponde cada matéria da planilha. As escolhas ficam lembradas para as próximas importações.' }),
      el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela' }, [
        el('thead', null, el('tr', null, ['Matéria na planilha', 'Questões', 'Acerto', 'Corresponde a', ''].map(function (h) { return el('th', { text: h }); }))),
        el('tbody', null, linhas)
      ])),
      erro,
      el('div', { class: 'acoes-direita' }, [
        UI.botao('Cancelar', function () { previa = null; App.atualizar(); }, 'btn-secundario'),
        UI.botao('Confirmar importação', function () { erro.hidden = true; confirmarImportacao(mostrarErro); }, 'btn-primario')
      ])
    ]);
  }

  function filtrosTela() {
    var imps = Dados.importacoes();
    var selImp = el('select', { onchange: function () { filtros.importacao = selImp.value; App.atualizar(); } }, [
      el('option', { value: '', text: 'Todo o histórico importado' })
    ].concat(imps.map(function (i) {
      return el('option', { value: i.id, text: UI.fmtData(i.inicio) + ' a ' + UI.fmtData(i.fim), selected: filtros.importacao === i.id });
    })));
    var selDisc = el('select', { onchange: function () { filtros.disciplina = selDisc.value; App.atualizar(); } }, [
      el('option', { value: '', text: 'Todas as disciplinas' })
    ].concat(Dados.disciplinas().map(function (d) {
      return el('option', { value: d.id, text: d.nome, selected: filtros.disciplina === d.id });
    })));
    return el('div', { class: 'filtros' }, [UI.campo('Período', selImp), UI.campo('Disciplina', selDisc)]);
  }

  function caixasResumo(dados) {
    var t = dados.reduce(function (s, d) { s.feitas += d.feitas; s.acertos += d.acertos; s.erros += d.erros; return s; }, { feitas: 0, acertos: 0, erros: 0 });
    var c = { muito: 0, importante: 0, normal: 0, pequena: 0 };
    dados.forEach(function (d) { for (var k in c) c[k] += d.contagem[k]; });
    function caixa(titulo, valor, linhas) {
      return el('div', { class: 'caixa-kpi' }, [
        el('div', { class: 'caixa-titulo', text: titulo }),
        el('div', { class: 'caixa-valor', text: valor }),
        el('div', { class: 'caixa-linhas' }, linhas)
      ]);
    }
    function linha(valor, texto, classe) {
      return el('div', null, [classe ? el('span', { class: 'marca-classe ' + classe }) : null, el('strong', { text: valor }), ' ' + texto]);
    }
    return el('div', { class: 'grade-kpi grade-kpi-3' }, [
      caixa('Questões no histórico', UI.fmtNum(t.feitas), [linha(String(dados.length), 'disciplinas')]),
      caixa('Desempenho', t.feitas ? UI.fmtPct(Math.round(t.acertos / t.feitas * 1000) / 10) : '—', [linha(UI.fmtNum(t.acertos), 'Acertos'), linha(UI.fmtNum(t.erros), 'Erros')]),
      caixa('Assuntos a reforçar', String(c.muito + c.importante), [
        linha(String(c.muito), 'muito importantes (≥ 30% de erro)', 'muito'),
        linha(String(c.importante), 'importantes (20% a 30%)', 'importante'),
        linha(String(c.pequena), 'fora da análise (até ' + MINIMO + ' questões)')
      ])
    ]);
  }

  // ---------- Árvore de pontos fracos ----------
  function chaveNo(d, t) { return d.disciplinaId + '|' + (t ? t.chave : ''); }

  function linhaNo(opcoes) {
    // opcoes: { chave, nivel, nome, codigo, dados (feitas/acertos/erros/pctErro), filhos, extra, ehDisciplina, cor }
    var temFilhos = opcoes.filhos > 0;
    var aberto = !!abertos[opcoes.chave];
    var nomeCel = el('td', { class: 'arvore-nome', style: { paddingLeft: (10 + opcoes.nivel * 22) + 'px' } }, [
      temFilhos
        ? el('button', { type: 'button', class: 'arvore-seta' + (aberto ? ' aberta' : ''), title: aberto ? 'Recolher' : 'Expandir', 'aria-expanded': String(aberto), onclick: function () {
            if (aberto) delete abertos[opcoes.chave]; else abertos[opcoes.chave] = true;
            App.atualizar();
          } }, '▸')
        : el('span', { class: 'arvore-seta vazia' }),
      opcoes.cor ? el('span', { class: 'bolinha', style: { background: opcoes.cor } }) : null,
      opcoes.codigo ? el('span', { class: 'codigo', text: opcoes.codigo }) : null,
      el('span', { class: 'arvore-texto', text: opcoes.nome }),
      temFilhos ? el('span', { class: 'arvore-qtd', text: opcoes.filhos + (opcoes.filhos === 1 ? ' tópico' : ' tópicos') }) : null,
      opcoes.extra || null
    ]);
    var t = opcoes.dados;
    return el('tr', {
      class: 'arvore-linha nivel-' + Math.min(opcoes.nivel, 3) + (opcoes.ehDisciplina ? ' linha-disciplina-arvore' : '') +
        (t.feitas <= MINIMO && !opcoes.ehDisciplina ? ' amostra-pequena' : '') + (opcoes.revisto ? ' revisto' : ''),
      title: opcoes.revisto ? 'Revisto em ' + UI.fmtData(opcoes.revisto.data) + ' (volta a ser cobrado se continuar fraco na próxima planilha)' : null
    }, [
      nomeCel,
      el('td', { class: 'num', text: UI.fmtNum(t.feitas) }),
      el('td', { class: 'num txt-acerto', text: UI.fmtNum(t.acertos) }),
      el('td', { class: 'num txt-erro', text: UI.fmtNum(t.erros) }),
      el('td', { class: 'num' }, opcoes.ehDisciplina ? el('span', { class: 'selo-erro normal', text: UI.fmtPct(Math.round(t.pctErro * 10) / 10) }) : seloErro(t))
    ]);
  }

  function adicionarFilhos(tbody, d, lista, nivel) {
    ordenar(lista).forEach(function (t) {
      if (filtros.soImportantes && !relevante(t)) return;
      var filhosVisiveis = filtros.soImportantes ? t.filhos.filter(relevante) : t.filhos;
      var chave = chaveNo(d, t);
      tbody.appendChild(linhaNo({
        chave: chave, nivel: nivel, nome: t.nome, codigo: t.codigo, dados: t, filhos: filhosVisiveis.length,
        revisto: ehFraco(t) ? Dados.revisto(d.disciplinaId, t.chave) : null
      }));
      if (abertos[chave]) adicionarFilhos(tbody, d, t.filhos, nivel + 1);
    });
  }

  function painelArvore(dados) {
    var visiveis = filtros.soImportantes ? dados.filter(function (d) { return d.raizes.some(relevante); }) : dados;
    var tbody = el('tbody');
    visiveis.forEach(function (d) {
      var chave = chaveNo(d, null);
      var raizes = filtros.soImportantes ? d.raizes.filter(relevante) : d.raizes;
      var extra = el('span', { class: 'arvore-contagem' }, [
        d.contagem.muito ? el('span', { class: 'cont muito', title: 'Muito importantes (≥ 30% de erro)', text: String(d.contagem.muito) }) : null,
        d.contagem.importante ? el('span', { class: 'cont importante', title: 'Importantes (20% a 30% de erro)', text: String(d.contagem.importante) }) : null
      ]);
      tbody.appendChild(linhaNo({ chave: chave, nivel: 0, nome: d.disciplina.nome, dados: d, filhos: raizes.length, extra: extra, ehDisciplina: true, cor: d.disciplina.cor }));
      if (abertos[chave]) adicionarFilhos(tbody, d, d.raizes, 1);
    });

    function abrirTudo(abrir) {
      abertos = {};
      if (abrir) dados.forEach(function (d) {
        abertos[chaveNo(d, null)] = true;
        d.topicos.forEach(function (t) { if (t.filhos.length) abertos[chaveNo(d, t)] = true; });
      });
      App.atualizar();
    }

    var soImp = el('input', { type: 'checkbox', checked: filtros.soImportantes, onchange: function () {
      filtros.soImportantes = soImp.checked;
      if (soImp.checked) dados.forEach(function (d) { abertos[chaveNo(d, null)] = true; });
      App.atualizar();
    } });

    return el('section', { class: 'painel' }, [
      el('div', { class: 'grafico-topo' }, [
        el('div', null, [
          el('h2', { class: 'secao-titulo', text: 'Pontos fracos por matéria' }),
          el('div', { class: 'legenda-erro' }, [
            el('span', null, [el('span', { class: 'marca-classe muito' }), 'Muito importante: 30% de erro ou mais']),
            el('span', null, [el('span', { class: 'marca-classe gradiente' }), 'Importante: 20% a 30% (mais escuro = mais perto de 30%)']),
            el('span', { class: 'data-fraca', text: '* até ' + MINIMO + ' questões: amostra pequena, não classificada' })
          ])
        ]),
        el('div', { class: 'arvore-acoes' }, [
          el('label', { class: 'opcao-check' }, [soImp, 'Só assuntos importantes']),
          el('button', { type: 'button', class: 'link', text: 'Expandir tudo', onclick: function () { abrirTudo(true); } }),
          el('button', { type: 'button', class: 'link', text: 'Recolher tudo', onclick: function () { abrirTudo(false); } })
        ])
      ]),
      visiveis.length ? el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela tabela-arvore' }, [
        el('thead', null, el('tr', null, [
          el('th', { text: 'Tópico' }), el('th', { class: 'num', text: 'Questões' }), el('th', { class: 'num', text: 'Acertos' }),
          el('th', { class: 'num', text: 'Erros' }), el('th', { class: 'num', text: '% de erro' })
        ])),
        tbody
      ])) : el('p', { class: 'data-fraca', text: 'Nenhum assunto com 20% de erro ou mais (entre os que têm mais de ' + MINIMO + ' questões).' })
    ]);
  }

  function painelImportacoes() {
    var imps = Dados.importacoes();
    if (!imps.length) return null;
    return el('section', { class: 'painel' }, [
      el('h2', { class: 'secao-titulo', text: 'Importações feitas' }),
      el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela' }, [
        el('thead', null, el('tr', null, ['Período', 'Arquivo', 'Questões', 'Importado em', ''].map(function (h) { return el('th', { text: h }); }))),
        el('tbody', null, imps.map(function (i) {
          var q = i.disciplinas.reduce(function (s, d) { return s + d.feitas; }, 0);
          return el('tr', null, [
            el('td', { class: 'data-forte', text: UI.fmtData(i.inicio) + ' a ' + UI.fmtData(i.fim) }),
            el('td', { class: 'data-fraca', text: i.nomeArquivo }),
            el('td', { text: UI.fmtNum(q) }),
            el('td', { class: 'data-fraca', text: new Date(i.importadoEm).toLocaleDateString('pt-BR') }),
            el('td', null, el('button', { type: 'button', class: 'link link-perigo', text: 'Excluir', onclick: function () {
              UI.confirmar('Excluir a importação de ' + UI.fmtData(i.inicio) + ' a ' + UI.fmtData(i.fim) + '? Os dados dela saem das estatísticas e o período fica livre para importar de novo.', function () {
                if (filtros.importacao === i.id) filtros.importacao = '';
                Dados.excluirImportacao(i.id);
                App.atualizar();
              });
            } }))
          ]);
        }))
      ]))
    ]);
  }

  function render(raiz) {
    raiz.appendChild(el('div', { class: 'pagina-topo' }, el('div', null, [
      el('h1', { class: 'pagina-titulo', text: 'Estatísticas' }),
      el('div', { class: 'pagina-subtitulo', text: 'Pontos fracos a partir do histórico do TecConcursos. Estes dados não entram nas horas, no XP nem no Controle de Questões; no Dashboard, aparecem só no Mapa de dificuldades (fonte TEC).' })
    ])));

    if (!Dados.disciplinas().length) {
      raiz.appendChild(el('div', { class: 'vazio' }, [
        el('p', { class: 'vazio-destaque', text: 'Cadastre suas disciplinas primeiro.' }),
        el('p', { text: 'A importação relaciona cada matéria da planilha a uma disciplina cadastrada.' }),
        el('div', { class: 'vazio-acoes' }, el('a', { class: 'btn btn-primario', href: '#/teoria', text: 'Ir para o Controle de Teoria' }))
      ]));
      return;
    }

    raiz.appendChild(painelImportar());

    if (filtros.importacao && !Dados.importacoes().some(function (i) { return i.id === filtros.importacao; })) filtros.importacao = '';
    if (!Dados.importacoes().length) {
      raiz.appendChild(el('div', { class: 'vazio' }, [
        el('p', { class: 'vazio-destaque', text: 'Nenhum histórico importado ainda.' }),
        el('p', { text: 'Importe a planilha de desempenho do TecConcursos para ver os assuntos com maior percentual de erro.' })
      ]));
      return;
    }

    var dados = agregar();
    raiz.appendChild(filtrosTela());
    raiz.appendChild(caixasResumo(dados));
    raiz.appendChild(painelArvore(dados));
    raiz.appendChild(painelImportacoes());
  }

  function ehFraco(t) { var c = classificar(t); return c === 'muito' || c === 'importante'; }
  function temDescendenteFraco(t) { return t.filhos.some(function (f) { return ehFraco(f) || temDescendenteFraco(f); }); }

  // Assuntos que precisam de revisão numa disciplina (todo o histórico importado), do maior % de erro
  // para o menor. Mostra só o nível mais específico: se um subtópico é fraco, o tópico-pai não entra.
  // Cada item: { disciplinaId, chave, nome, caminho, feitas, erros, pctErro, classe, revisto }
  function pontosFracos(disciplinaId) {
    var lista = [];
    agregar({ importacao: '', disciplina: disciplinaId || '' }).forEach(function (d) {
      d.topicos.forEach(function (t) {
        if (!ehFraco(t) || temDescendenteFraco(t)) return;
        lista.push({
          disciplinaId: d.disciplinaId, chave: t.chave, nome: t.nome, codigo: t.codigo, caminho: t.caminho,
          feitas: t.feitas, acertos: t.acertos, erros: t.erros, pctErro: t.pctErro,
          classe: classificar(t), revisto: Dados.revisto(d.disciplinaId, t.chave)
        });
      });
    });
    return lista.sort(function (a, b) { return b.pctErro - a.pctErro || b.erros - a.erros; });
  }

  return { render: render, pontosFracos: pontosFracos, seloErro: seloErro, agregar: agregar, _corresponder: corresponder };
})();
