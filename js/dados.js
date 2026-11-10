// Camada de dados: tudo que o programa guarda passa por aqui.
// Os dados ficam no localStorage do navegador; use a aba Backup para exportar/importar.
var Dados = (function () {
  var CHAVE = 'controle-estudos';
  var VERSAO = 1;

  function vazio() {
    return {
      versao: VERSAO,
      disciplinas: [],   // { id, nome, cor, peso, ordem }
      // materiais = as aulas do bloco (o que se estuda e marca como concluído): { id, tipo, nome, curso, link, concluido, dataConclusao, herdado }
      blocos: [],        // { id, disciplinaId, nome, ordem, relevancia, materiais: [...], herancaTeoria }
      // tec: { chave, codigo } quando o tópico é um assunto da incidência do TEC; arquivado: tópico antigo (fora da tela,
      // mas no Histórico e no XP); herdado: concluído por herança do bloco (não rende XP).
      topicos: [],       // { id, blocoId, nome, tec, ordem, concluido, dataConclusao, revisaoAgendada, ultimaRevisao, arquivado, herdado }
      pastas: [],        // { id, disciplinaId, nome, ordem }
      cadernos: [],      // { id, pastaId, nome, assunto, link, prioridade, totalQuestoes, ordem }
      sessoes: [],       // { id, data, disciplinaId, segundos, tipo, topicoIds, aulaIds, cadernos:[{cadernoId,acertos,erros}], anotacao, criadoEm }
      ciclo: { itens: [], posicaoAtual: 0, voltas: 0 },
      // Histórico importado do TecConcursos: usado SÓ na aba Estatísticas (não entra em sessões nem cadernos).
      importacoes: [],   // { id, inicio, fim, nomeArquivo, importadoEm, disciplinas: [{ disciplinaId, nomePlanilha, feitas, acertos, erros, topicos: [{ codigo, nome, caminho, feitas, acertos, erros }] }] }
      apelidos: {},      // nome da disciplina na planilha (normalizado) -> disciplinaId ou 'ignorar'
      // Incidência dos assuntos nas provas (planilha do TEC), uma por disciplina e banca.
      incidencias: [],   // { id, disciplinaId, banca, nomeArquivo, importadoEm, total, assuntos: [{ chave, codigo, nome, caminho, qtd }] }
      migracoes: { tec1: true, tec2: true },
      // Pontos fracos (das Estatísticas) marcados como revistos numa sessão de Revisão.
      // 'disciplinaId|chaveDoAssunto' -> { data, ate } ; 'ate' = fim da última planilha quando foi marcado.
      revistos: {},
      // Perfil mostrado no Dashboard: só nome e foto (caminho do arquivo ou imagem enviada, em data URL).
      perfil: { nome: 'APF Gohan - Rumo ao fisco!', foto: 'img/perfil.webp' },
      // Metas da semana (segunda a domingo) no Dashboard. 0 = sem meta.
      metas: { horas: 30, questoes: 500 },
      // Pausas programadas das patentes: { id, inicio, fim, motivo }. Nesses dias não há falta.
      pausas: []
    };
  }

  function criarPausa(campos) {
    db.pausas.push({ id: novoId(), inicio: campos.inicio, fim: campos.fim, motivo: campos.motivo || '' });
    salvar();
  }

  // Pausa ainda não iniciada é apagada; a já iniciada termina ontem (os dias passados continuam protegidos).
  function encerrarPausa(id) {
    var p = buscar(db.pausas, id);
    if (!p) return;
    var ontem = UI.somarDias(UI.hoje(), -1);
    if (p.inicio > ontem) remover('pausas', function (x) { return x.id === id; });
    else p.fim = ontem;
    salvar();
  }

  function atualizarPerfil(campos) {
    db.perfil = { nome: campos.nome, foto: campos.foto, cargo: campos.cargo || '' };
    salvar();
  }

  var migrouAgora = false;
  function normalizar(d) {
    var migrar = !(d.migracoes && d.migracoes.tec1);
    var migrar2 = !(d.migracoes && d.migracoes.tec2);
    var base = vazio();
    for (var k in base) if (d[k] == null) d[k] = base[k];
    d.versao = VERSAO;
    garantirPastasTeoria(d);
    (d.blocos || []).forEach(function (b) { if (!Array.isArray(b.materiais)) b.materiais = []; });
    (d.incidencias || []).forEach(function (i) { if (!Array.isArray(i.assuntos)) i.assuntos = []; });
    if (migrar) { migrarParaTec(d); d.migracoes = Object.assign({}, d.migracoes, { tec1: true }); migrouAgora = true; }
    if (migrar2) { migrarParaAulas(d); d.migracoes = Object.assign({}, d.migracoes, { tec2: true }); migrouAgora = true; }
    cacheRel = null;
    return d;
  }

  // Migração única (2026-11-10): os tópicos digitados à mão são arquivados (somem da tela, mas continuam no Histórico
  // e no XP) e os links deles são descartados. Cada bloco guarda como estava a teoria, para os assuntos do TEC herdarem.
  function migrarParaTec(d) {
    (d.blocos || []).forEach(function (b) {
      var ts = (d.topicos || []).filter(function (t) { return t.blocoId === b.id && !t.arquivado; });
      if (!ts.length) return;
      var ids = ts.map(function (t) { return t.id; });
      var feitos = ts.filter(function (t) { return t.concluido; });
      var estudado = (d.sessoes || []).some(function (s) { return (s.topicoIds || []).some(function (id) { return ids.indexOf(id) >= 0; }); });
      b.herancaTeoria = {
        concluida: feitos.length === ts.length, iniciada: !!feitos.length || estudado, qtd: ts.length, feitos: feitos.length,
        data: feitos.reduce(function (m, t) { return t.dataConclusao && (!m || t.dataConclusao > m) ? t.dataConclusao : m; }, null)
      };
    });
    (d.topicos || []).forEach(function (t) { t.arquivado = true; delete t.link; });
  }

  // Migração única (2026-11-10b → c): o que se conclui passa a ser a aula, não o assunto. O bloco guarda se a teoria
  // estava concluída pela regra antiga; as aulas já cadastradas num bloco concluído entram concluídas (sem XP de novo).
  function migrarParaAulas(d) {
    (d.blocos || []).forEach(function (b) {
      var ts = (d.topicos || []).filter(function (t) { return t.blocoId === b.id && !t.arquivado; });
      var h = b.herancaTeoria || null;
      var concluida = ts.length ? ts.every(function (t) { return t.concluido; }) : !!(h && h.concluida);
      var feitos = ts.filter(function (t) { return t.concluido; });
      var ids = ts.map(function (t) { return t.id; });
      var estudado = (d.sessoes || []).some(function (s) { return (s.topicoIds || []).some(function (id) { return ids.indexOf(id) >= 0; }); });
      if (!ts.length && !h) return;
      var data = feitos.reduce(function (m, t) { return t.dataConclusao && (!m || t.dataConclusao > m) ? t.dataConclusao : m; }, h ? h.data : null);
      b.herancaTeoria = {
        concluida: concluida, iniciada: !!(h && h.iniciada) || !!feitos.length || estudado, data: data,
        qtd: h ? h.qtd : ts.length, feitos: h ? h.feitos : feitos.length
      };
      if (concluida) (b.materiais || []).forEach(function (a) {
        if (a.concluido) return;
        a.concluido = true; a.dataConclusao = data || null; a.herdado = true;
      });
    });
  }

  // ---------- Pastas fixas "Cadernos de Teoria" e "Cadernos de Erros" ----------
  // Toda disciplina tem exatamente uma de cada (pasta.tipo = 'teoria' / 'erros'):
  // teoria = um caderno por bloco; erros = um caderno por par de blocos (1-2, 3-4, …).
  // Se já existir uma pasta com o nome, ela é aproveitada. Os nomes são reservados.
  // Modo Revisão: simulado = cadernos com todos os assuntos; favoritas = um caderno de dúvidas e um de erradas 2x+.
  var NOME_PASTA_TEORIA = 'Cadernos de Teoria';
  var NOME_PASTA_ERROS = 'Cadernos de Erros';
  var NOME_PASTA_SIMULADO = 'Cadernos de Simulado';
  var NOME_PASTA_FAVORITAS = 'Cadernos de Favoritadas';
  var PASTAS_FIXAS = [['teoria', NOME_PASTA_TEORIA], ['erros', NOME_PASTA_ERROS], ['simulado', NOME_PASTA_SIMULADO], ['favoritas', NOME_PASTA_FAVORITAS]];

  function chaveNome(t) { return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase(); }
  function nomeReservado(nome) {
    return PASTAS_FIXAS.filter(function (f) { return chaveNome(f[1]) === chaveNome(nome); }).map(function (f) { return f[1]; })[0] || null;
  }
  function pastaFixa(p) { return !!p && PASTAS_FIXAS.some(function (f) { return f[0] === p.tipo; }); }

  function garantirPastasTeoria(dados) {
    dados.disciplinas.forEach(function (disc) {
      PASTAS_FIXAS.forEach(function (f) {
        var dela = dados.pastas.filter(function (p) { return p.disciplinaId === disc.id; });
        if (dela.some(function (p) { return p.tipo === f[0]; })) return;
        var existente = dela.filter(function (p) { return !p.tipo && chaveNome(p.nome) === chaveNome(f[1]); })[0];
        if (existente) { existente.tipo = f[0]; existente.nome = f[1]; return; }
        // Teoria vai para o começo; as demais fixas logo depois da última pasta fixa.
        var fixas = dela.filter(function (p) { return p.tipo; });
        var menor = dela.reduce(function (m, p) { return Math.min(m, p.ordem || 0); }, 1);
        var ultimaFixa = fixas.reduce(function (m, p) { return Math.max(m, p.ordem || 0); }, -Infinity);
        var ordem = f[0] !== 'teoria' && fixas.length ? ultimaFixa + 0.5 : menor - 1;
        dados.pastas.push({ id: novoId(), disciplinaId: disc.id, nome: f[1], tipo: f[0], ordem: ordem });
      });
    });
  }

  function carregar() {
    try {
      var texto = localStorage.getItem(CHAVE);
      if (texto) return normalizar(JSON.parse(texto));
    } catch (e) {
      console.error('Falha ao carregar dados', e);
    }
    return vazio();
  }

  var db = carregar();

  // Salva no navegador (cópia rápida) e avisa a pasta de dados e a nuvem para gravarem também.
  function salvar() {
    cacheRel = null;
    db.atualizadoEm = Date.now();
    gravarNoNavegador();
    if (window.Armazenamento) Armazenamento.agendar();
    if (window.Nuvem) Nuvem.agendar();
  }

  function gravarNoNavegador() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(db));
    } catch (e) {
      console.error(e);
      if (!window.Armazenamento || !Armazenamento.conectado()) {
        alert('Não foi possível salvar os dados neste navegador. Exporte um backup para não perder nada.');
      }
    }
  }

  // Troca todos os dados por uma versão mais recente vinda da pasta ('arquivo') ou da nuvem ('nuvem')
  // e repassa ao outro destino, sem regravar a origem.
  function substituir(dados, origem) {
    migrouAgora = false;
    db = normalizar(dados);
    gravarNoNavegador();
    if (origem !== 'arquivo' && window.Armazenamento) Armazenamento.agendar();
    // Dados vindos da nuvem que acabaram de ser migrados voltam para a nuvem já migrados.
    if ((origem !== 'nuvem' || migrouAgora) && window.Nuvem) Nuvem.agendar();
  }

  function novoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function porOrdem(a, b) { return (a.ordem || 0) - (b.ordem || 0); }

  function proximaOrdem(lista) {
    return lista.reduce(function (m, x) { return Math.max(m, x.ordem || 0); }, 0) + 1;
  }

  function buscar(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }

  function remover(nomeLista, filtro) {
    db[nomeLista] = db[nomeLista].filter(function (x) { return !filtro(x); });
  }

  // Coloca `item` na posição `pos` (1..n) dentro de `irmaos` e renumera a ordem.
  function reposicionar(irmaos, item, pos) {
    var lista = irmaos.slice().sort(porOrdem).filter(function (x) { return x !== item; });
    pos = Math.max(1, Math.min(pos, lista.length + 1));
    lista.splice(pos - 1, 0, item);
    lista.forEach(function (x, i) { x.ordem = i + 1; });
  }

  // ---------- Disciplinas ----------
  // Sempre em ordem alfabética (ignora acentos e maiúsculas).
  function disciplinas() {
    return db.disciplinas.slice().sort(function (a, b) {
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    });
  }
  function disciplina(id) { return buscar(db.disciplinas, id); }

  function criarDisciplina(campos) {
    var d = {
      id: novoId(),
      nome: campos.nome,
      cor: campos.cor || '#4f7cff',
      peso: Number(campos.peso) || 1,
      ordem: proximaOrdem(db.disciplinas)
    };
    db.disciplinas.push(d);
    garantirPastasTeoria(db);
    salvar();
    return d;
  }

  function atualizarDisciplina(id, campos) {
    var d = disciplina(id);
    if (!d) return;
    if (campos.nome != null) d.nome = campos.nome;
    if (campos.cor != null) d.cor = campos.cor;
    if (campos.peso != null) d.peso = Number(campos.peso) || 0;
    // modo: 'revisao' = entrar no Modo Revisão antes de terminar o Modo Leitura; 'auto' = seguir até o fim.
    if (campos.modo != null) { if (campos.modo === 'revisao') d.modo = 'revisao'; else delete d.modo; }
    salvar();
  }

  // Modo de estudo da disciplina: Revisão quando o Modo Leitura termina (automático) ou quando o usuário escolhe antes.
  function modoDeEstudo(disciplinaId) {
    var d = disciplina(disciplinaId);
    var plano = planoTeoria(disciplinaId);
    var escolhido = !!(d && d.modo === 'revisao');
    return {
      modo: plano.concluido || escolhido ? 'revisao' : 'leitura',
      escolhido: escolhido && !plano.concluido,
      leituraConcluida: plano.concluido,
      plano: plano
    };
  }

  function excluirDisciplina(id) {
    var blocoIds = db.blocos.filter(function (b) { return b.disciplinaId === id; }).map(function (b) { return b.id; });
    var pastaIds = db.pastas.filter(function (p) { return p.disciplinaId === id; }).map(function (p) { return p.id; });
    remover('topicos', function (t) { return blocoIds.indexOf(t.blocoId) >= 0; });
    remover('incidencias', function (i) { return i.disciplinaId === id; });
    remover('cadernos', function (c) { return pastaIds.indexOf(c.pastaId) >= 0; });
    remover('blocos', function (b) { return b.disciplinaId === id; });
    remover('pastas', function (p) { return p.disciplinaId === id; });
    remover('sessoes', function (s) { return s.disciplinaId === id; });
    db.importacoes.forEach(function (imp) {
      imp.disciplinas = imp.disciplinas.filter(function (x) { return x.disciplinaId !== id; });
    });
    for (var ap in db.apelidos) if (db.apelidos[ap] === id) delete db.apelidos[ap];
    for (var rv in db.revistos) if (rv.indexOf(id + '|') === 0) delete db.revistos[rv];
    db.ciclo.itens = db.ciclo.itens.filter(function (i) { return i.disciplinaId !== id; });
    if (db.ciclo.posicaoAtual >= db.ciclo.itens.length) db.ciclo.posicaoAtual = 0;
    remover('disciplinas', function (d) { return d.id === id; });
    if (window.ResumosDados) ResumosDados.apagar(id).catch(function (e) { console.error(e); });
    salvar();
  }

  // ---------- Blocos ----------
  function blocosDe(disciplinaId) {
    return db.blocos.filter(function (b) { return b.disciplinaId === disciplinaId; }).sort(porOrdem);
  }
  function bloco(id) { return buscar(db.blocos, id); }

  function criarBloco(disciplinaId, nome) {
    var b = { id: novoId(), disciplinaId: disciplinaId, nome: nome, ordem: proximaOrdem(blocosDe(disciplinaId)) };
    db.blocos.push(b);
    salvar();
    return b;
  }

  function atualizarBloco(id, nome, posicao) {
    var b = bloco(id);
    if (!b) return;
    if (nome) b.nome = nome;
    if (posicao) reposicionar(blocosDe(b.disciplinaId), b, posicao);
    salvar();
  }

  // Relevância do bloco de teoria (1 a 5 estrelas). Com assuntos do TEC e a incidência de "Todas as bancas", é automática;
  // senão vale a marcada à mão (sem valor gravado, 3).
  function relevancia(b) {
    var inc = b ? incidenciaBloco(b) : null;
    if (inc && inc.auto) return inc.estrelas;
    var n = b && Number(b.relevancia); return n >= 1 && n <= 5 ? n : 3;
  }
  function definirRelevancia(id, n) {
    var b = bloco(id);
    if (!b) return;
    b.relevancia = Math.max(1, Math.min(5, Math.round(Number(n) || 3)));
    salvar();
  }

  function excluirBloco(id) {
    var ids = topicosDe(id).map(function (t) { return t.id; });
    remover('topicos', function (t) { return t.blocoId === id; });
    db.sessoes.forEach(function (s) {
      if (s.topicoIds) s.topicoIds = s.topicoIds.filter(function (t) { return ids.indexOf(t) < 0; });
    });
    remover('blocos', function (b) { return b.id === id; });
    db.cadernos.forEach(function (c) { if (c.blocoId === id) c.blocoId = null; });
    salvar();
  }

  // ---------- Tópicos ----------
  // Só os tópicos ativos (os arquivados ficam fora da tela, do progresso e do plano).
  function topicosDe(blocoId) {
    return db.topicos.filter(function (t) { return t.blocoId === blocoId && !t.arquivado; }).sort(porOrdem);
  }
  function topico(id) { return buscar(db.topicos, id); }

  // Tópicos que contam para o histórico (XP, ritmo, último estudo): ativos e arquivados, menos os concluídos por herança.
  function topicosHistoricos(disciplinaId) {
    var ids = disciplinaId ? blocosDe(disciplinaId).map(function (b) { return b.id; }) : null;
    return db.topicos.filter(function (t) { return !t.herdado && (!ids || ids.indexOf(t.blocoId) >= 0); });
  }

  function topicosDaDisciplina(disciplinaId) {
    var r = [];
    blocosDe(disciplinaId).forEach(function (b) { r = r.concat(topicosDe(b.id)); });
    return r;
  }

  function criarTopicos(blocoId, nomes) {
    var ordem = proximaOrdem(topicosDe(blocoId));
    nomes.forEach(function (nome) {
      db.topicos.push({
        id: novoId(), blocoId: blocoId, nome: nome, ordem: ordem++,
        concluido: false, dataConclusao: null, revisaoAgendada: null, ultimaRevisao: null
      });
    });
    salvar();
  }

  function atualizarTopico(id, campos, posicao) {
    var t = topico(id);
    if (!t) return;
    if (campos.nome) t.nome = campos.nome;
    if (campos.tec !== undefined) { if (campos.tec) t.tec = { chave: campos.tec.chave, codigo: campos.tec.codigo || '' }; else delete t.tec; }
    if (campos.blocoId && campos.blocoId !== t.blocoId) {
      t.blocoId = campos.blocoId;
      t.ordem = proximaOrdem(topicosDe(campos.blocoId).filter(function (x) { return x !== t; }));
    }
    if (posicao) reposicionar(topicosDe(t.blocoId), t, posicao);
    salvar();
  }

  function definirConcluido(id, concluido, data) {
    var t = topico(id);
    if (!t) return;
    if (t.herdado) { delete t.herdado; t.dataConclusao = null; } // marcado por você: passa a valer como estudo seu
    t.concluido = !!concluido;
    t.dataConclusao = concluido ? (t.dataConclusao || data || UI.hoje()) : null;
    salvar();
  }

  function agendarRevisao(id, data) {
    var t = topico(id);
    if (!t) return;
    t.revisaoAgendada = data || null;
    salvar();
  }

  function concluirRevisao(id) {
    var t = topico(id);
    if (!t) return;
    t.ultimaRevisao = UI.hoje();
    t.revisaoAgendada = null;
    salvar();
  }

  function excluirTopico(id) {
    remover('topicos', function (t) { return t.id === id; });
    db.sessoes.forEach(function (s) {
      if (s.topicoIds) s.topicoIds = s.topicoIds.filter(function (t) { return t !== id; });
    });
    salvar();
  }

  // ---------- Pastas de cadernos ----------
  function pastasDe(disciplinaId) {
    return db.pastas.filter(function (p) { return p.disciplinaId === disciplinaId; }).sort(porOrdem);
  }
  function pasta(id) { return buscar(db.pastas, id); }
  function pastaDoTipo(disciplinaId, tipo) {
    return db.pastas.filter(function (p) { return p.disciplinaId === disciplinaId && p.tipo === tipo; })[0] || null;
  }
  function pastaTeoria(disciplinaId) { return pastaDoTipo(disciplinaId, 'teoria'); }
  function pastaErros(disciplinaId) { return pastaDoTipo(disciplinaId, 'erros'); }
  function pastaSimulado(disciplinaId) { return pastaDoTipo(disciplinaId, 'simulado'); }
  function pastaFavoritas(disciplinaId) { return pastaDoTipo(disciplinaId, 'favoritas'); }

  // Os nomes das pastas fixas são reservados (lança erro se repetido).
  function criarPasta(disciplinaId, nome) {
    var reservado = nomeReservado(nome);
    if (reservado) throw new Error('Já existe a pasta "' + reservado + '" nesta disciplina. Escolha outro nome.');
    var p = { id: novoId(), disciplinaId: disciplinaId, nome: nome, ordem: proximaOrdem(pastasDe(disciplinaId)) };
    db.pastas.push(p);
    salvar();
    return p;
  }

  function atualizarPasta(id, nome, posicao) {
    var p = pasta(id);
    if (!p) return;
    if (nome && !pastaFixa(p)) {
      var reservado = nomeReservado(nome);
      if (reservado) throw new Error('O nome "' + reservado + '" é reservado. Escolha outro nome.');
      p.nome = nome;
    }
    if (posicao) reposicionar(pastasDe(p.disciplinaId), p, posicao);
    salvar();
  }

  // As sessões já lançadas continuam valendo nos totais da disciplina. As pastas fixas não podem ser excluídas.
  function excluirPasta(id) {
    var alvo = pasta(id);
    if (!alvo || pastaFixa(alvo)) return;
    remover('cadernos', function (c) { return c.pastaId === id; });
    remover('pastas', function (p) { return p.id === id; });
    salvar();
  }

  // ---------- Cadernos ----------
  function cadernosDe(pastaId) {
    return db.cadernos.filter(function (c) { return c.pastaId === pastaId; }).sort(porOrdem);
  }
  function caderno(id) { return buscar(db.cadernos, id); }

  function cadernosDaDisciplina(disciplinaId) {
    var r = [];
    pastasDe(disciplinaId).forEach(function (p) { r = r.concat(cadernosDe(p.id)); });
    return r;
  }

  function normalizarLink(link) {
    link = (link || '').trim();
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    return link;
  }

  // Cadernos da pasta de teoria guardam também: blocoId (bloco de teoria correspondente)
  // e baterias (divisão das questões por bateria; vazio = divisão igual).
  function criarCaderno(pastaId, campos) {
    var c = {
      id: novoId(), pastaId: pastaId, nome: campos.nome, assunto: campos.assunto || '',
      link: normalizarLink(campos.link), prioridade: campos.prioridade || 'media',
      totalQuestoes: Number(campos.totalQuestoes) || 0, ordem: proximaOrdem(cadernosDe(pastaId))
    };
    camposTeoria(c, campos);
    db.cadernos.push(c);
    salvar();
    return c;
  }

  function atualizarCaderno(id, campos, posicao) {
    var c = caderno(id);
    if (!c) return;
    ['nome', 'assunto', 'prioridade'].forEach(function (k) { if (campos[k] != null) c[k] = campos[k]; });
    if (campos.link != null) c.link = normalizarLink(campos.link);
    if (campos.totalQuestoes != null) c.totalQuestoes = Number(campos.totalQuestoes) || 0;
    camposTeoria(c, campos);
    if (posicao) reposicionar(cadernosDe(c.pastaId), c, posicao);
    salvar();
  }

  // Cadernos da pasta de erros guardam "par": 1 = blocos 1 e 2, 2 = blocos 3 e 4, …
  function camposTeoria(c, campos) {
    var p = pasta(c.pastaId);
    if (!p || p.tipo !== 'teoria') { delete c.blocoId; delete c.baterias; }
    if (!p || p.tipo !== 'erros') delete c.par;
    if (!p || p.tipo !== 'favoritas') delete c.grupo;
    if (!p) return;
    if (p.tipo === 'favoritas' && campos.grupo !== undefined) c.grupo = GRUPOS_FAVORITAS[campos.grupo] ? campos.grupo : null;
    if (p.tipo === 'teoria') {
      if (campos.blocoId !== undefined) c.blocoId = campos.blocoId || null;
      if (campos.baterias !== undefined) c.baterias = campos.baterias && campos.baterias.length ? campos.baterias.map(function (n) { return Math.max(0, Math.round(Number(n) || 0)); }) : null;
    }
    if (p.tipo === 'erros' && campos.par !== undefined) c.par = campos.par === 'final' ? 'final' : Number(campos.par) || null;
  }

  // Pares de blocos para as baterias de erros: [{ par, blocos: [b1, b2?] }]. Com número ímpar, o último fica sozinho.
  function paresDeBlocos(disciplinaId) {
    var bs = blocosDe(disciplinaId), r = [];
    for (var i = 0; i < bs.length; i += 2) r.push({ par: i / 2 + 1, blocos: bs.slice(i, i + 2) });
    return r;
  }
  // "Bloco 01" + "Bloco 02" vira "Blocos 01 e 02"; vários blocos viram "Blocos 05 a 10"; outros nomes ficam "A e B" / "A a B".
  function nomePar(par) {
    var bs = par.blocos;
    if (bs.length === 1) return bs[0].nome;
    var ultimo = bs[bs.length - 1], liga = bs.length === 2 ? ' e ' : ' a ';
    var a = /^bloco\s+(.+)$/i.exec(bs[0].nome), b = /^bloco\s+(.+)$/i.exec(ultimo.nome);
    return a && b ? 'Blocos ' + a[1] + liga + b[1] : bs[0].nome + liga + ultimo.nome;
  }
  function cadernoDoPar(disciplinaId, numero) {
    var pe = pastaErros(disciplinaId);
    return pe ? cadernosDe(pe.id).filter(function (c) { return c.par === numero; })[0] || null : null;
  }

  // Baterias de erros do Modo Leitura. O Modo Leitura termina na 2ª bateria do último bloco; por isso só têm
  // bateria de erros própria os pares cuja última bateria do 2º bloco ainda cabe na sequência. Os demais pares
  // (que ainda não tenham caderno de erros concluído) se juntam numa única bateria final, ex.: "Blocos 05 a 10".
  function gruposDeErros(disciplinaId) {
    var bs = blocosDe(disciplinaId), N = bs.length;
    var atrasoUltima = ATRASO_BATERIA[numBaterias(disciplinaId) - 1];
    var normais = [], finais = [];
    paresDeBlocos(disciplinaId).forEach(function (par) {
      var j = bs.indexOf(par.blocos[par.blocos.length - 1]) + 1;
      if (j + atrasoUltima <= N) { normais.push(par); return; }
      var antigo = cadernoDoPar(disciplinaId, par.par);
      if (!(antigo && statsCaderno(antigo.id).completo)) finais.push(par);
    });
    var final = finais.length ? { par: 'final', final: true, pares: finais, blocos: finais.reduce(function (a, p) { return a.concat(p.blocos); }, []) } : null;
    return { normais: normais, final: final };
  }

  // O par (ou a bateria final) a que um caderno de erros pertence.
  function parDoCaderno(disciplinaId, c) {
    if (!c || !c.par) return null;
    if (c.par === 'final') return gruposDeErros(disciplinaId).final;
    return paresDeBlocos(disciplinaId)[c.par - 1] || null;
  }

  // Primeira bateria de erros ainda sem caderno (pares da sequência e, por último, a final).
  function parSemCaderno(disciplinaId, excetoCadernoId) {
    var pe = pastaErros(disciplinaId);
    var usados = pe ? cadernosDe(pe.id).filter(function (c) { return c.id !== excetoCadernoId && c.par; }).map(function (c) { return c.par; }) : [];
    var g = gruposDeErros(disciplinaId);
    return g.normais.concat(g.final ? [g.final] : []).filter(function (p) { return usados.indexOf(p.par) < 0; })[0] || null;
  }

  // Bloco de teoria ainda sem caderno na pasta de teoria (o primeiro, pela ordem).
  function blocoSemCaderno(disciplinaId, excetoCadernoId) {
    var pt = pastaTeoria(disciplinaId);
    var usados = pt ? cadernosDe(pt.id).filter(function (c) { return c.id !== excetoCadernoId && c.blocoId; }).map(function (c) { return c.blocoId; }) : [];
    return blocosDe(disciplinaId).filter(function (b) { return usados.indexOf(b.id) < 0; })[0] || null;
  }

  function moverCaderno(id, pastaId) {
    var c = caderno(id);
    if (!c || c.pastaId === pastaId) return;
    c.pastaId = pastaId;
    c.ordem = proximaOrdem(cadernosDe(pastaId).filter(function (x) { return x !== c; }));
    var p = pasta(pastaId);
    if (p && p.tipo === 'teoria') {
      var livre = blocoSemCaderno(p.disciplinaId, c.id);
      c.blocoId = livre ? livre.id : null;
    } else { delete c.blocoId; delete c.baterias; }
    if (p && p.tipo === 'erros') {
      var parLivre = parSemCaderno(p.disciplinaId, c.id);
      c.par = parLivre ? parLivre.par : null;
    } else delete c.par;
    if (p && p.tipo === 'favoritas') c.grupo = grupoLivre(p.disciplinaId, c.id);
    else delete c.grupo;
    salvar();
  }

  // ---------- Modo Teoria: baterias e sequência de estudo ----------
  // Todas as matérias têm 3 baterias por caderno.
  function numBaterias() { return 3; }

  // Divisão padrão: com menos de 10 blocos, o caderno em 3 partes iguais. Com 10 ou mais, cada bateria continua com
  // 1/4 do caderno (como quando eram 4 baterias): as quantidades não são redistribuídas e o restante fica fora da sequência.
  function divisaoPadrao(disciplinaId, total) {
    return divisaoIgual(total, blocosDe(disciplinaId).length >= 10 ? 4 : 3).slice(0, 3);
  }

  // Quantidade de questões de cada bateria: a divisão salva no caderno ou, sem ela, a padrão.
  function divisaoBaterias(c, n) {
    if (c.baterias && c.baterias.length >= n) return c.baterias.slice(0, n);
    var p = pasta(c.pastaId);
    return divisaoPadrao(p ? p.disciplinaId : null, c.totalQuestoes || 0);
  }
  function divisaoIgual(total, n) {
    var base = Math.floor(total / n), resto = total % n, r = [];
    for (var i = 0; i < n; i++) r.push(base + (i < resto ? 1 : 0));
    return r;
  }

  function cadernoDoBloco(blocoId) {
    var b = bloco(blocoId);
    var pt = b && pastaTeoria(b.disciplinaId);
    return pt ? cadernosDe(pt.id).filter(function (c) { return c.blocoId === blocoId; })[0] || null : null;
  }

  // Progresso das baterias de um caderno de teoria, pela contagem de questões lançadas nele:
  // a bateria k fica pronta quando o total feito alcança a soma das baterias 1..k.
  function bateriasCaderno(c, n) {
    var partes = divisaoBaterias(c, n);
    var feitas = statsCaderno(c.id).feitas, acumulado = 0;
    return partes.map(function (qtd, i) {
      var inicio = acumulado;
      acumulado += qtd;
      return {
        numero: i + 1, qtd: qtd, ate: acumulado,
        feitas: Math.max(0, Math.min(qtd, feitas - inicio)),
        concluida: qtd > 0 && feitas >= acumulado
      };
    });
  }

  // Sequência do Modo Leitura: no passo n vêm a teoria do bloco n e as baterias
  // 1ª do bloco n, 2ª do n-1 e 3ª do n-3. Depois da última teoria, a sequência termina
  // na 2ª bateria do último bloco (as baterias seguintes não são recomendadas),
  // seguida da bateria final de erros.
  var ATRASO_BATERIA = [0, 1, 3];

  function planoTeoria(disciplinaId) {
    var blocos = blocosDe(disciplinaId);
    var nb = numBaterias(disciplinaId);
    var atrasos = ATRASO_BATERIA.slice(0, nb);
    var N = blocos.length;
    var itens = [];
    var progresso = blocos.map(function (b) {
      var ts = topicosDe(b.id), aulas = aulasDe(b.id);
      var cad = cadernoDoBloco(b.id);
      return {
        bloco: b, topicos: ts, aulas: aulas,
        // A teoria do bloco é concluída pelas aulas; sem aulas cadastradas, segue como estava antes da troca.
        teoriaConcluida: aulas.length ? aulas.every(function (a) { return a.concluido; }) : !!(b.herancaTeoria && b.herancaTeoria.concluida),
        caderno: cad, baterias: cad ? bateriasCaderno(cad, nb) : null
      };
    });
    for (var passo = 1; passo <= N + atrasos[atrasos.length - 1]; passo++) {
      if (passo <= N) {
        var pb = progresso[passo - 1];
        // Antes de iniciar um novo bloco (do 2º em diante), uma rodada das favoritadas de dúvida. Se a teoria do bloco já
        // começou, a rodada não é mais recomendada (mas continua aparecendo se foi concluída). As erradas 2x+ ficam para o
        // Modo Revisão: no Modo Leitura só aparecem as rodadas concluídas antes dessa regra, para não apagar o que foi feito.
        if (passo > 1) ORDEM_FAVORITAS.forEach(function (g) {
          var cf = cadernoFavorito(disciplinaId, g);
          var rod = cf ? rodadaFavorita(cf.id, pb.bloco.id) : null;
          if ((g !== GRUPO_FAVORITAS_LEITURA || teoriaIniciada(pb.topicos) || aulasIniciadas(pb.aulas) || (pb.bloco.herancaTeoria && pb.bloco.herancaTeoria.iniciada)) && !(rod && rod.concluida)) return;
          itens.push({
            tipo: 'favoritas', passo: passo, indice: passo, bloco: pb.bloco, grupo: g, caderno: cf, rodada: rod,
            feitas: rod ? rod.feitas : 0, qtd: rod ? rod.total : null, concluido: !!(rod && rod.concluida)
          });
        });
        itens.push({ tipo: 'teoria', passo: passo, indice: passo, bloco: pb.bloco, topicos: pb.topicos, aulas: pb.aulas, concluido: pb.teoriaConcluida });
      }
      atrasos.forEach(function (atraso, k) {
        var i = passo - atraso;
        if (i < 1 || i > N) return;
        var p = progresso[i - 1];
        var bat = p.baterias ? p.baterias[k] : null;
        itens.push({
          tipo: 'bateria', passo: passo, indice: i, bloco: p.bloco, numero: k + 1,
          caderno: p.caderno, bateria: bat, concluido: !!(bat && bat.concluida)
        });
      });
    }
    // Termina na 2ª bateria do último bloco.
    var fim = -1;
    itens.forEach(function (it, i) { if (it.tipo === 'bateria' && it.indice === N && it.numero === 2) fim = i; });
    if (fim >= 0) itens = itens.slice(0, fim + 1);

    function itemErros(par, passo) {
      var cad = cadernoDoPar(disciplinaId, par.par);
      var st = cad ? statsCaderno(cad.id) : null;
      return {
        tipo: 'erros', passo: passo, par: par, caderno: cad,
        feitas: st ? Math.min(st.feitas, st.total) : 0, qtd: cad ? cad.totalQuestoes || 0 : 0,
        concluido: !!(st && st.completo)
      };
    }
    // Bateria de erros de cada par: logo depois da última bateria do segundo bloco do par
    // (que é sempre a última dos dois a acontecer). Fica pronta quando o caderno de erros é todo resolvido.
    var grupos = gruposDeErros(disciplinaId);
    grupos.normais.map(function (par) {
      var ultimo = blocos.indexOf(par.blocos[par.blocos.length - 1]) + 1;
      var pos = -1;
      itens.forEach(function (it, i) { if (it.tipo === 'bateria' && it.indice === ultimo && it.numero === nb) pos = i; });
      return { pos: pos, item: itemErros(par, pos >= 0 ? itens[pos].passo : 0) };
    }).sort(function (a, b) { return b.pos - a.pos; }).forEach(function (x) {
      if (x.pos >= 0) itens.splice(x.pos + 1, 0, x.item);
    });
    // Erros que sobraram: uma única bateria no fim.
    if (grupos.final && itens.length) itens.push(itemErros(grupos.final, itens[itens.length - 1].passo));

    var pendentes = itens.filter(function (it) { return !it.concluido; });
    return {
      blocos: N, numBaterias: nb, totalPassos: itens.length ? itens[itens.length - 1].passo : 0, gruposErros: grupos,
      itens: itens, pendentes: pendentes, progresso: progresso,
      concluido: N > 0 && !pendentes.length
    };
  }

  function aulasIniciadas(aulas) {
    if (aulas.some(function (a) { return a.concluido; })) return true;
    var ids = aulas.map(function (a) { return a.id; });
    return !!ids.length && db.sessoes.some(function (s) { return (s.aulaIds || []).some(function (id) { return ids.indexOf(id) >= 0; }); });
  }

  function teoriaIniciada(topicos) {
    if (topicos.some(function (t) { return t.concluido; })) return true;
    var ids = topicos.map(function (t) { return t.id; });
    return db.sessoes.some(function (s) { return (s.topicoIds || []).some(function (id) { return ids.indexOf(id) >= 0; }); });
  }

  // ---------- Rodadas das favoritadas no Modo Leitura ----------
  // Os cadernos de favoritadas mudam sempre, então cada novo bloco tem a sua rodada (identificada pelo bloco), com contagem
  // própria e o total informado ao lançar. As linhas de sessão guardam rodada e totalRodada; o histórico nunca é apagado.
  function rodadaFavorita(cadernoId, blocoId, excetoSessaoId) {
    var r = { blocoId: blocoId, acertos: 0, erros: 0, feitas: 0, total: null, ultimo: null };
    var c = caderno(cadernoId);
    r.vazia = !!(c && (c.rodadasVazias || []).indexOf(blocoId) >= 0);
    db.sessoes.filter(function (s) { return s.id !== excetoSessaoId; }).sort(function (a, b) {
      return a.data === b.data ? (a.criadoEm || 0) - (b.criadoEm || 0) : (a.data < b.data ? -1 : 1);
    }).forEach(function (s) {
      (s.cadernos || []).forEach(function (l) {
        if (l.cadernoId !== cadernoId || l.rodada !== blocoId) return;
        r.acertos += Number(l.acertos) || 0;
        r.erros += Number(l.erros) || 0;
        if (l.totalRodada) r.total = l.totalRodada;
        r.ultimo = s.data;
      });
    });
    r.feitas = r.acertos + r.erros;
    r.concluida = r.vazia || (r.total > 0 && r.feitas >= r.total);
    return r;
  }

  function itensFavoritos(cadernoId) {
    var c = caderno(cadernoId), p = c && pasta(c.pastaId);
    if (!p || p.tipo !== 'favoritas' || c.grupo !== GRUPO_FAVORITAS_LEITURA) return null;
    var m = modoDeEstudo(p.disciplinaId);
    if (m.modo !== 'leitura') return null;
    return { plano: m.plano, itens: m.plano.itens.filter(function (it) { return it.tipo === 'favoritas' && it.grupo === c.grupo; }) };
  }

  // Rodada em que um novo lançamento deste caderno entra (null fora do Modo Leitura ou sem rodada pendente).
  function rodadaAberta(cadernoId) {
    var f = itensFavoritos(cadernoId);
    if (!f) return null;
    var it = f.itens.filter(function (i) { return !i.concluido; })[0];
    return it ? it.rodada : null;
  }

  // Rodada mostrada na aba Questões: a nova começa zerada quando chega a sua vez; até lá fica a última concluída.
  function rodadaExibida(cadernoId) {
    var f = itensFavoritos(cadernoId);
    if (!f || !f.itens.length) return null;
    var aberto = f.itens.filter(function (i) { return !i.concluido; })[0];
    var vez = f.plano.pendentes[0];
    if (aberto && (aberto.feitas || (vez && aberto.passo <= vez.passo))) return aberto;
    var feitos = f.itens.filter(function (i) { return i.concluido; });
    return feitos.length ? feitos[feitos.length - 1] : aberto || null;
  }

  // Sem questões para fazer nesta rodada: não vira sessão (não conta como dia de estudo nem avança o ciclo).
  function marcarRodadaVazia(cadernoId, blocoId, vazia) {
    var c = caderno(cadernoId);
    if (!c) return;
    var lista = (c.rodadasVazias || []).filter(function (id) { return id !== blocoId; });
    if (vazia) lista.push(blocoId);
    if (lista.length) c.rodadasVazias = lista; else delete c.rodadasVazias;
    salvar();
  }

  // O total informado por último vale para todas as linhas da rodada.
  function igualarTotaisRodada(s) {
    (s.cadernos || []).forEach(function (n) {
      if (!n.rodada || !n.totalRodada) return;
      db.sessoes.forEach(function (o) {
        (o.cadernos || []).forEach(function (l) {
          if (l.cadernoId === n.cadernoId && l.rodada === n.rodada) l.totalRodada = n.totalRodada;
        });
      });
    });
  }

  // ---------- Modo Revisão: ciclo simulado → favoritadas (dúvidas, erradas 2x+) → pontos fracos ----------
  var GRUPOS_FAVORITAS = { duvidas: 'Questões em que fiquei em dúvida', erros2x: 'Questões que errei 2x ou mais' };
  var ORDEM_FAVORITAS = ['duvidas', 'erros2x'];
  var GRUPO_FAVORITAS_LEITURA = 'duvidas'; // no Modo Leitura as rodadas são só de dúvidas; os dois grupos valem no Modo Revisão
  var FRACOS_QUESTOES = 50, FRACOS_ASSUNTOS = 3;
  var SIMULADO_MINIMO = 50; // por volta: soma mínima de questões de simulado antes das favoritadas

  function cadernoFavorito(disciplinaId, grupo) {
    var pf = pastaFavoritas(disciplinaId);
    return pf ? cadernosDe(pf.id).filter(function (c) { return c.grupo === grupo; })[0] || null : null;
  }
  function grupoLivre(disciplinaId, excetoCadernoId) {
    var pf = pastaFavoritas(disciplinaId);
    var usados = pf ? cadernosDe(pf.id).filter(function (c) { return c.id !== excetoCadernoId && c.grupo; }).map(function (c) { return c.grupo; }) : [];
    return ORDEM_FAVORITAS.filter(function (g) { return usados.indexOf(g) < 0; })[0] || null;
  }

  // O estado é recalculado repassando as sessões em ordem (data e hora de lançamento); assim editar ou
  // excluir uma sessão no Histórico corrige a recomendação sozinho.
  //  - simulado: o caderno da vez fica concluído quando as questões lançadas nele alcançam o total; enquanto os
  //    cadernos concluídos na volta somarem menos de 50 questões, segue para o próximo simulado;
  //  - duvidas / erros2x: concluídas quando uma sessão marca o caderno como finalizado;
  //  - fracos: concluída com 50 questões dos pontos fracos ou 3 assuntos diferentes (ou todos, se houver menos de 3).
  // Matéria sem pontos fracos nas Estatísticas pula a etapa de fracos.
  function planoRevisao(disciplinaId) {
    var ps = pastaSimulado(disciplinaId);
    var simulados = ps ? cadernosDe(ps.id) : [];
    var fav = { duvidas: cadernoFavorito(disciplinaId, 'duvidas'), erros2x: cadernoFavorito(disciplinaId, 'erros2x') };
    var fracos = window.Estatisticas ? Estatisticas.pontosFracos(disciplinaId) : [];
    var metaAssuntos = Math.min(FRACOS_ASSUNTOS, fracos.length);
    var sessoes = db.sessoes.filter(function (s) { return s.disciplinaId === disciplinaId; }).sort(function (a, b) {
      return a.data === b.data ? (a.criadoEm || 0) - (b.criadoEm || 0) : (a.data < b.data ? -1 : 1);
    });
    var acum = {};
    var est = { etapa: 'simulado', indice: 0, rodada: 1, somaSimulado: 0, fracosQuestoes: 0, fracosAssuntos: {} };
    var historico = []; // etapas já concluídas: { rodada, tipo, caderno?, questoes?, assuntos? }

    function avancar(s) {
      var mudou = true;
      while (mudou) {
        mudou = false;
        if (est.etapa === 'simulado') {
          var cur = simulados[est.indice];
          if (cur && cur.totalQuestoes > 0 && (acum[cur.id] || 0) >= cur.totalQuestoes) {
            historico.push({ rodada: est.rodada, tipo: 'simulado', caderno: cur });
            est.indice++;
            est.somaSimulado += cur.totalQuestoes;
            if (est.somaSimulado >= SIMULADO_MINIMO) est.etapa = 'duvidas';
            mudou = true;
          }
        } else if (est.etapa === 'duvidas' || est.etapa === 'erros2x') {
          var cad = fav[est.etapa];
          var fim = s && cad && (s.cadernos || []).some(function (l) { return l.cadernoId === cad.id && l.finalizado; });
          if (fim) { historico.push({ rodada: est.rodada, tipo: est.etapa, caderno: cad }); est.etapa = est.etapa === 'duvidas' ? 'erros2x' : 'fracos'; est.fracosQuestoes = 0; est.fracosAssuntos = {}; mudou = true; }
        } else if (est.etapa === 'fracos') {
          if (!fracos.length || est.fracosQuestoes >= FRACOS_QUESTOES || Object.keys(est.fracosAssuntos).length >= Math.max(1, metaAssuntos)) {
            if (fracos.length) historico.push({ rodada: est.rodada, tipo: 'fracos', questoes: est.fracosQuestoes, assuntos: Object.keys(est.fracosAssuntos).length });
            est.etapa = 'simulado'; est.rodada++; est.somaSimulado = 0; mudou = true;
          }
        }
      }
    }

    sessoes.forEach(function (s) {
      var etapaAntes = est.etapa;
      (s.cadernos || []).forEach(function (l) {
        var n = (l.acertos || 0) + (l.erros || 0);
        if (l.cadernoId) acum[l.cadernoId] = (acum[l.cadernoId] || 0) + n;
        if (etapaAntes === 'fracos' && l.assunto && n > 0) { est.fracosQuestoes += n; est.fracosAssuntos[l.assunto.chave] = l.assunto.nome; }
      });
      avancar(s);
    });
    avancar(null);

    var atual = simulados[est.indice] || null;
    // O que ainda falta nesta volta, na ordem. A primeira é a etapa atual.
    var faltam = [];
    if (est.etapa === 'simulado') {
      var soma = est.somaSimulado, ind = est.indice;
      while (soma < SIMULADO_MINIMO) {
        var prox = simulados[ind] || null;
        faltam.push({ tipo: 'simulado', caderno: prox, feitas: prox ? Math.min(acum[prox.id] || 0, prox.totalQuestoes || 0) : 0 });
        if (!prox) break;
        soma += prox.totalQuestoes || 0;
        ind++;
      }
    }
    if (est.etapa === 'simulado' || est.etapa === 'duvidas') faltam.push({ tipo: 'duvidas', caderno: fav.duvidas });
    if (est.etapa !== 'fracos') faltam.push({ tipo: 'erros2x', caderno: fav.erros2x });
    if (fracos.length) faltam.push({ tipo: 'fracos' });
    return {
      historico: historico, faltam: faltam,
      etapa: est.etapa, rodada: est.rodada,
      simulado: atual, simuladoFeitas: atual ? Math.min(acum[atual.id] || 0, atual.totalQuestoes || 0) : 0,
      simuladosConcluidos: est.indice, simulados: simulados,
      somaSimulado: est.somaSimulado, minimoSimulado: SIMULADO_MINIMO,
      favoritas: fav, fracos: fracos,
      fracosQuestoes: est.fracosQuestoes, fracosAssuntos: est.fracosAssuntos,
      metaQuestoes: FRACOS_QUESTOES, metaAssuntos: metaAssuntos
    };
  }

  function excluirCaderno(id) {
    remover('cadernos', function (c) { return c.id === id; });
    salvar();
  }

  // ---------- Sessões de estudo ----------
  function sessao(id) { return buscar(db.sessoes, id); }

  // tipo: 'teoria' | 'questoes' | 'revisao' (revisão = questões dos pontos fracos; conta como questões normais)
  //       | 'anki' (só tempo, sem matéria: soma nas horas e na meta semanal, mas não dá XP nem conta como dia estudado)
  function limparCamposSessao(campos) {
    var tipo = ['teoria', 'questoes', 'revisao', 'anki'].indexOf(campos.tipo) >= 0 ? campos.tipo : 'questoes';
    var teoria = tipo === 'teoria';
    return {
      data: campos.data,
      disciplinaId: tipo === 'anki' ? null : campos.disciplinaId,
      segundos: Math.max(0, Math.round(Number(campos.segundos) || 0)),
      tipo: tipo,
      topicoIds: teoria ? (campos.topicoIds || []).slice() : [],
      aulaIds: teoria ? (campos.aulaIds || []).slice() : [],
      // finalizado: caderno de favoritadas terminado nesta sessão; assunto: questões avulsas de um ponto fraco (Revisão).
      cadernos: teoria ? [] : (campos.cadernos || []).map(function (c) {
        var l = { cadernoId: c.cadernoId || null, acertos: Number(c.acertos) || 0, erros: Number(c.erros) || 0 };
        if (c.finalizado && c.cadernoId) l.finalizado = true;
        if (c.rodada && c.cadernoId) { l.rodada = c.rodada; l.totalRodada = Number(c.totalRodada) || 0; }
        if (c.assunto && !c.cadernoId) l.assunto = { chave: c.assunto.chave, nome: c.assunto.nome };
        return l;
      }),
      revisados: tipo === 'revisao' ? (campos.revisados || []).slice() : [], // [{ chave, nome }] dos assuntos marcados como revistos
      anotacao: (campos.anotacao || '').trim()
    };
  }

  // ---------- Pontos fracos revistos ----------
  // Uma marca vale até chegar uma planilha mais nova; aí, se o assunto continuar fraco, volta a ser pendente.
  function revisto(disciplinaId, chave) {
    var m = db.revistos[disciplinaId + '|' + chave];
    if (!m) return null;
    var fim = fimUltimaImportacao();
    return fim && m.ate && m.ate < fim ? null : m;
  }

  function marcarRevisto(disciplinaId, chave, marcado, data) {
    var k = disciplinaId + '|' + chave;
    if (marcado) {
      if (!revisto(disciplinaId, chave)) db.revistos[k] = { data: data || UI.hoje(), ate: fimUltimaImportacao() };
    } else {
      delete db.revistos[k];
    }
    salvar();
  }

  // Lançar um estudo da matéria que está "na vez" do ciclo avança o ciclo.
  function criarSessao(campos) {
    var s = limparCamposSessao(campos);
    s.id = novoId();
    s.criadoEm = Date.now();
    db.sessoes.push(s);
    igualarTotaisRodada(s);
    // Só o lançamento feito pela meta avança o ciclo; o "+ Estudo extra" e os botões das abas não.
    var atual = campos.daMeta ? itemAtualCiclo() : null;
    if (atual && atual.disciplinaId === s.disciplinaId) {
      // Guarda em que posição do ciclo a sessão foi lançada (para mostrar o que foi feito em cada matéria do ciclo).
      s.ciclo = { itemId: atual.id, volta: db.ciclo.voltas || 0, posicao: db.ciclo.posicaoAtual };
      avancarCiclo(1);
    }
    salvar();
    return s;
  }

  // O que foi estudado numa posição do ciclo, na volta atual: a sessão que avançou o ciclo naquela posição e as
  // outras da mesma matéria lançadas logo depois (antes do ciclo avançar de novo). Sessões antigas, de antes deste
  // registro existir, não têm posição: aí devolve a última sessão da matéria e marca o resultado como aproximado.
  function sessoesDaPosicaoCiclo(indice) {
    var c = db.ciclo, item = c.itens[indice];
    if (!item) return { sessoes: [], aproximado: false };
    var porOrdem = db.sessoes.slice().sort(function (a, b) { return (a.criadoEm || 0) - (b.criadoEm || 0); });
    var base = null;
    porOrdem.forEach(function (s) { if (s.ciclo && s.ciclo.itemId === item.id && s.ciclo.volta === (c.voltas || 0)) base = s; });
    if (base) {
      var lista = [base], depois = false;
      for (var i = 0; i < porOrdem.length; i++) {
        var s = porOrdem[i];
        if (s === base) { depois = true; continue; }
        if (!depois) continue;
        if (s.ciclo) break; // o ciclo avançou de novo
        if (s.disciplinaId === base.disciplinaId) lista.push(s);
      }
      return { sessoes: lista, aproximado: false };
    }
    // Aproximação só na volta em que o registro começou (em voltas seguintes, sem registro = posição pulada).
    var registroAntigo = db.sessoes.some(function (s) { return s.ciclo && s.ciclo.volta < (c.voltas || 0); });
    var semRegistro = sessoesDe(item.disciplinaId).filter(function (s) { return !s.ciclo; });
    if (registroAntigo || !semRegistro.length) return { sessoes: [], aproximado: false };
    return { sessoes: [semRegistro[0]], aproximado: true };
  }

  // ---------- Ciclo de estudos ----------
  // ciclo.itens: [{ id, disciplinaId, minutosPlanejados }] em ordem; a mesma matéria pode repetir.
  function itemAtualCiclo() {
    var c = db.ciclo;
    if (!c.itens.length) return null;
    if (c.posicaoAtual >= c.itens.length || c.posicaoAtual < 0) c.posicaoAtual = 0;
    return c.itens[c.posicaoAtual];
  }

  function avancarCiclo(passo) {
    var c = db.ciclo, n = c.itens.length;
    if (!n) return;
    var p = c.posicaoAtual + (passo || 1);
    if (p >= n) { p = 0; c.voltas = (c.voltas || 0) + 1; }
    if (p < 0) p = n - 1;
    c.posicaoAtual = p;
    salvar();
  }

  function irParaPosicaoCiclo(i) {
    if (i >= 0 && i < db.ciclo.itens.length) { db.ciclo.posicaoAtual = i; salvar(); }
  }

  function definirCiclo(itens) {
    db.ciclo.itens = itens.map(function (x) {
      return { id: x.id || novoId(), disciplinaId: x.disciplinaId, minutosPlanejados: Math.max(0, Number(x.minutosPlanejados) || 0) };
    });
    if (db.ciclo.posicaoAtual >= db.ciclo.itens.length) db.ciclo.posicaoAtual = 0;
    salvar();
  }

  function recomecarCiclo() { db.ciclo.posicaoAtual = 0; salvar(); }

  function atualizarSessao(id, campos) {
    var s = sessao(id);
    if (!s) return;
    var novos = limparCamposSessao(campos);
    for (var k in novos) s[k] = novos[k];
    igualarTotaisRodada(s);
    salvar();
  }

  function excluirSessao(id) {
    remover('sessoes', function (s) { return s.id === id; });
    salvar();
  }

  // ---------- Consultas calculadas ----------
  function somarQuestoes(itens) {
    var r = { feitas: 0, acertos: 0, erros: 0, pct: 0 };
    itens.forEach(function (i) { r.acertos += Number(i.acertos) || 0; r.erros += Number(i.erros) || 0; });
    r.feitas = r.acertos + r.erros;
    r.pct = r.feitas ? (r.acertos / r.feitas) * 100 : 0;
    return r;
  }

  // Totais de questões da disciplina (inclui sessões de cadernos já excluídos).
  function statsQuestoes(disciplinaId) {
    var itens = [];
    sessoesDe(disciplinaId, 'questoes').forEach(function (s) { itens = itens.concat(s.cadernos || []); });
    return somarQuestoes(itens);
  }

  function statsCaderno(cadernoId) {
    var itens = [], ultimo = null;
    db.sessoes.forEach(function (s) {
      (s.cadernos || []).forEach(function (c) {
        if (c.cadernoId !== cadernoId) return;
        itens.push(c);
        if (!ultimo || s.data > ultimo) ultimo = s.data;
      });
    });
    var r = somarQuestoes(itens);
    r.ultimo = ultimo;
    var cad = caderno(cadernoId);
    r.total = cad ? cad.totalQuestoes : 0;
    r.faltam = Math.max(0, r.total - r.feitas);
    r.completo = r.total > 0 && r.feitas >= r.total;
    return r;
  }

  function statsPasta(pastaId) {
    var itens = [];
    var ids = cadernosDe(pastaId).map(function (c) { return c.id; });
    db.sessoes.forEach(function (s) {
      (s.cadernos || []).forEach(function (c) { if (ids.indexOf(c.cadernoId) >= 0) itens.push(c); });
    });
    return somarQuestoes(itens);
  }

  // Progresso da teoria: pelas aulas concluídas.
  function progressoTeoria(disciplinaId) {
    var as = [];
    blocosDe(disciplinaId).forEach(function (b) { as = as.concat(aulasDe(b.id)); });
    var feitos = as.filter(function (a) { return a.concluido; }).length;
    return { feitos: feitos, total: as.length, pct: as.length ? (feitos / as.length) * 100 : 0 };
  }

  function progressoBloco(blocoId) {
    var as = aulasDe(blocoId);
    var feitos = as.filter(function (a) { return a.concluido; }).length;
    return { feitos: feitos, total: as.length, pct: as.length ? (feitos / as.length) * 100 : 0 };
  }

  // Sessões de uma disciplina (opcionalmente de um tipo), da mais recente para a mais antiga.
  // tipo 'questoes' inclui as revisões, que também são baterias de questões.
  function sessoesDe(disciplinaId, tipo) {
    return db.sessoes.filter(function (s) {
      return s.disciplinaId === disciplinaId && (!tipo || s.tipo === tipo || (tipo === 'questoes' && s.tipo === 'revisao'));
    }).sort(function (a, b) {
      return a.data === b.data ? (b.criadoEm || 0) - (a.criadoEm || 0) : (a.data < b.data ? 1 : -1);
    });
  }

  function ultimoEstudo(disciplinaId, tipo) {
    var s = sessoesDe(disciplinaId, tipo)[0];
    var data = s ? s.data : null;
    if (tipo !== 'questoes') {
      // Sem sessões lançadas, usa a data em que algum tópico foi marcado como concluído.
      topicosHistoricos(disciplinaId).concat(aulasHistoricas(disciplinaId)).forEach(function (t) {
        if (t.dataConclusao && (!data || t.dataConclusao > data)) data = t.dataConclusao;
      });
    }
    return data;
  }

  function tempoAcumulado(disciplinaId, tipo) {
    return sessoesDe(disciplinaId, tipo).reduce(function (soma, s) { return soma + (s.segundos || 0); }, 0);
  }

  // Anotação da sessão mais recente: se a última sessão não deixou anotação,
  // a anterior já foi "cumprida" e não aparece mais.
  function ultimaAnotacao(disciplinaId, tipo) {
    var s = sessoesDe(disciplinaId, tipo)[0];
    return s && s.anotacao ? s : null;
  }

  function ultimoEstudoTopico(topicoId) {
    var data = null;
    db.sessoes.forEach(function (s) {
      if (s.topicoIds && s.topicoIds.indexOf(topicoId) >= 0 && (!data || s.data > data)) data = s.data;
    });
    var t = topico(topicoId);
    if (t && t.dataConclusao && (!data || t.dataConclusao > data)) data = t.dataConclusao;
    return data;
  }

  function revisoesPendentes(disciplinaId) {
    return topicosDaDisciplina(disciplinaId).filter(function (t) { return !!t.revisaoAgendada; });
  }

  // ---------- Importações do TecConcursos (Estatísticas) ----------
  function importacoes() {
    return db.importacoes.slice().sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; });
  }

  // Maior data final já importada: um novo arquivo precisa começar depois dela.
  function fimUltimaImportacao() {
    return db.importacoes.reduce(function (m, i) { return !m || i.fim > m ? i.fim : m; }, null);
  }

  function adicionarImportacao(imp) {
    imp.id = novoId();
    imp.importadoEm = Date.now();
    db.importacoes.push(imp);
    salvar();
    return imp;
  }

  function excluirImportacao(id) {
    remover('importacoes', function (i) { return i.id === id; });
    salvar();
  }

  // ---------- Incidência dos assuntos nas provas (planilha do TEC) ----------
  var BANCAS = [['todas', 'Todas as bancas'], ['cebraspe', 'Cebraspe'], ['fcc', 'FCC'], ['fgv', 'FGV']];
  var NOME_BANCA = {}; BANCAS.forEach(function (b) { NOME_BANCA[b[0]] = b[1]; });
  var cacheRel = null; // árvores e relevâncias calculadas; zera a cada gravação

  function incidenciasDe(disciplinaId) {
    return db.incidencias.filter(function (i) { return !disciplinaId || i.disciplinaId === disciplinaId; }).sort(function (a, b) {
      var da = disciplina(a.disciplinaId), dbb = disciplina(b.disciplinaId);
      return (da ? da.ordem || 0 : 0) - (dbb ? dbb.ordem || 0 : 0) || ordemBanca(a.banca) - ordemBanca(b.banca);
    });
  }
  function ordemBanca(id) { for (var i = 0; i < BANCAS.length; i++) if (BANCAS[i][0] === id) return i; return 99; }
  function incidencia(disciplinaId, banca) {
    return db.incidencias.filter(function (i) { return i.disciplinaId === disciplinaId && i.banca === banca; })[0] || null;
  }

  // Uma por disciplina e banca: a nova substitui a anterior.
  function salvarIncidencia(imp) {
    remover('incidencias', function (i) { return i.disciplinaId === imp.disciplinaId && i.banca === imp.banca; });
    db.incidencias.push({
      id: novoId(), disciplinaId: imp.disciplinaId, banca: imp.banca, nomeArquivo: imp.nomeArquivo || '', importadoEm: Date.now(),
      total: Number(imp.total) || 0, assuntos: imp.assuntos.map(function (a) {
        return { chave: a.chave, pai: a.pai || '', codigo: a.codigo || '', nome: a.nome, caminho: (a.caminho || []).slice(), qtd: Number(a.qtd) || 0 };
      })
    });
    salvar();
  }
  function excluirIncidencia(id) { remover('incidencias', function (i) { return i.id === id; }); salvar(); }

  function compararCodigo(a, b) { return String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', { numeric: true }) || a.nome.localeCompare(b.nome, 'pt-BR'); }

  function cache() { return cacheRel || (cacheRel = { arvores: {}, rel: {} }); }

  // Árvore dos assuntos de uma disciplina, juntando as bancas importadas:
  // { nos: { chave: { chave, pai, codigo, nome, caminho, bancas: { banca: { qtd, pct } }, filhos } }, raizes, totais: { banca: total } }
  function arvoreIncidencia(disciplinaId) {
    var c = cache();
    if (c.arvores[disciplinaId] !== undefined) return c.arvores[disciplinaId];
    var incs = incidenciasDe(disciplinaId);
    if (!incs.length) return (c.arvores[disciplinaId] = null);
    var nos = {}, totais = {};
    incs.forEach(function (inc) {
      totais[inc.banca] = inc.total;
      inc.assuntos.forEach(function (a) {
        var n = nos[a.chave] || (nos[a.chave] = { chave: a.chave, pai: a.pai, codigo: a.codigo, nome: a.nome, caminho: a.caminho, bancas: {}, filhos: [] });
        if (inc.banca === 'todas') { n.codigo = a.codigo; n.nome = a.nome; }
        n.bancas[inc.banca] = { qtd: a.qtd, pct: inc.total ? a.qtd / inc.total * 100 : 0 };
      });
    });
    var raizes = [];
    Object.keys(nos).forEach(function (k) { var n = nos[k], p = n.pai && nos[n.pai]; (p ? p.filhos : raizes).push(n); });
    Object.keys(nos).forEach(function (k) { nos[k].filhos.sort(compararCodigo); });
    raizes.sort(compararCodigo);
    return (c.arvores[disciplinaId] = { nos: nos, raizes: raizes, totais: totais });
  }

  // Assuntos descendentes (todos os níveis) de um nó da árvore.
  function descendentes(no) {
    var r = [];
    (no.filhos || []).forEach(function (f) { r.push(f); r = r.concat(descendentes(f)); });
    return r;
  }

  // Soma a incidência de um conjunto de chaves sem contar duas vezes um assunto cujo pai também está no conjunto.
  function somarIncidencia(arv, chaves) {
    var raiz = chaves.filter(function (c) { return arv.nos[c] && !chaves.some(function (o) { return o !== c && c.indexOf(o + ' > ') === 0; }); });
    var pct = {}, qtd = {};
    Object.keys(arv.totais).forEach(function (banca) {
      var q = 0;
      raiz.forEach(function (c) { var x = arv.nos[c].bancas[banca]; if (x) q += x.qtd; });
      qtd[banca] = q;
      pct[banca] = arv.totais[banca] ? q / arv.totais[banca] * 100 : 0;
    });
    return { pct: pct, qtd: qtd };
  }

  // Estrelas pela razão entre a incidência do bloco e a média dos blocos da matéria que têm assuntos do TEC.
  function estrelasPorRazao(r) { return r >= 1.75 ? 5 : r >= 1.25 ? 4 : r >= 0.75 ? 3 : r >= 0.4 ? 2 : 1; }

  // Incidência de cada bloco de uma disciplina: { blocoId: { pct, qtd, razao, estrelas, auto } }
  function relevanciasDaDisciplina(disciplinaId) {
    var c = cache();
    if (c.rel[disciplinaId]) return c.rel[disciplinaId];
    var arv = arvoreIncidencia(disciplinaId), r = {};
    if (arv) {
      blocosDe(disciplinaId).forEach(function (b) {
        var chaves = topicosDe(b.id).filter(function (t) { return t.tec && arv.nos[t.tec.chave]; }).map(function (t) { return t.tec.chave; });
        if (chaves.length) r[b.id] = somarIncidencia(arv, chaves);
      });
      var comTodas = Object.keys(r).filter(function () { return arv.totais.todas != null; });
      var media = comTodas.length ? comTodas.reduce(function (s, id) { return s + r[id].pct.todas; }, 0) / comTodas.length : 0;
      Object.keys(r).forEach(function (id) {
        r[id].auto = arv.totais.todas != null && media > 0;
        r[id].razao = media > 0 ? r[id].pct.todas / media : null;
        r[id].estrelas = r[id].auto ? estrelasPorRazao(r[id].razao) : null;
      });
    }
    return (c.rel[disciplinaId] = r);
  }
  function incidenciaBloco(b) { return b ? relevanciasDaDisciplina(b.disciplinaId)[b.id] || null : null; }

  function usadoEmSessao(topicoId) {
    return db.sessoes.some(function (s) { return (s.topicoIds || []).indexOf(topicoId) >= 0; });
  }

  // Assuntos do TEC de um bloco: cria os novos (na ordem do código) e tira os desmarcados. Desmarcado que já tem
  // estudo, conclusão ou revisão é arquivado, não apagado. Os novos herdam a teoria concluída do bloco.
  function definirAssuntosTec(blocoId, chaves) {
    var b = bloco(blocoId), arv = b && arvoreIncidencia(b.disciplinaId);
    if (!b || !arv) return;
    var atuais = topicosDe(blocoId).filter(function (t) { return t.tec; });
    var tirar = atuais.filter(function (t) { return chaves.indexOf(t.tec.chave) < 0; });
    tirar.forEach(function (t) {
      if ((t.concluido && !t.herdado) || t.revisaoAgendada || t.ultimaRevisao || usadoEmSessao(t.id)) t.arquivado = true;
      else remover('topicos', function (x) { return x.id === t.id; });
    });
    var ja = atuais.map(function (t) { return t.tec.chave; });
    var h = b.herancaTeoria, herda = !!(h && h.concluida);
    chaves.forEach(function (c) {
      var n = arv.nos[c];
      if (!n || ja.indexOf(c) >= 0) return;
      var t = { id: novoId(), blocoId: blocoId, nome: n.nome, tec: { chave: c, codigo: n.codigo }, ordem: 0,
        concluido: herda, dataConclusao: herda ? (h.data || UI.hoje()) : null, revisaoAgendada: null, ultimaRevisao: null };
      if (herda) t.herdado = true;
      db.topicos.push(t);
    });
    // Ordem: assuntos do TEC pelo código; depois os tópicos manuais, na ordem em que estavam.
    var lista = topicosDe(blocoId);
    var tec = lista.filter(function (t) { return t.tec; }).sort(function (x, y) { return compararCodigo({ codigo: x.tec.codigo, nome: x.nome }, { codigo: y.tec.codigo, nome: y.nome }); });
    tec.concat(lista.filter(function (t) { return !t.tec; })).forEach(function (t, i) { t.ordem = i + 1; });
    salvar();
  }

  // ---------- Aulas do bloco (guardadas em bloco.materiais; uma aula pode cobrir vários assuntos) ----------
  function aulasDe(blocoId) { var b = bloco(blocoId); return b ? (b.materiais || []) : []; }
  // { aula, bloco } de uma aula pelo id.
  function aula(id) {
    for (var i = 0; i < db.blocos.length; i++) {
      var a = buscar(db.blocos[i].materiais || [], id);
      if (a) return { aula: a, bloco: db.blocos[i] };
    }
    return null;
  }
  // Aulas concluídas que contam para o histórico (XP, ritmo): menos as concluídas por herança.
  function aulasHistoricas(disciplinaId) {
    var r = [];
    db.blocos.forEach(function (b) {
      if (disciplinaId && b.disciplinaId !== disciplinaId) return;
      (b.materiais || []).forEach(function (a) { if (a.concluido && !a.herdado) r.push(a); });
    });
    return r;
  }
  function definirAulaConcluida(id, concluido, data) {
    var x = aula(id);
    if (!x) return;
    var a = x.aula;
    if (a.herdado) { delete a.herdado; a.dataConclusao = null; } // marcada por você: passa a valer como estudo seu
    a.concluido = !!concluido;
    a.dataConclusao = concluido ? (a.dataConclusao || data || UI.hoje()) : null;
    salvar();
  }
  function ultimoEstudoAula(id) {
    var data = null;
    db.sessoes.forEach(function (s) { if ((s.aulaIds || []).indexOf(id) >= 0 && (!data || s.data > data)) data = s.data; });
    var x = aula(id);
    if (x && x.aula.dataConclusao && !x.aula.herdado && (!data || x.aula.dataConclusao > data)) data = x.aula.dataConclusao;
    return data;
  }
  function nomeAula(a) { var t = TIPOS_MATERIAL.filter(function (x) { return x[0] === a.tipo; })[0]; return (t ? t[1] : 'Aula') + ' ' + a.nome; }

  var TIPOS_MATERIAL = [['pdf', 'PDF'], ['video', 'Videoaula'], ['resumo', 'Resumo'], ['lei', 'Lei Seca']];
  function camposMaterial(campos) {
    var tipo = TIPOS_MATERIAL.some(function (x) { return x[0] === campos.tipo; }) ? campos.tipo : 'pdf';
    return { tipo: tipo, nome: (campos.nome || '').trim(), curso: (campos.curso || '').trim(), link: normalizarLink(campos.link) };
  }
  function criarMaterial(blocoId, campos) {
    var b = bloco(blocoId); if (!b) return;
    b.materiais = b.materiais || [];
    var a = Object.assign({ id: novoId(), concluido: false, dataConclusao: null }, camposMaterial(campos));
    // Bloco cuja teoria já estava concluída antes da troca: a aula nova entra concluída (sem XP de novo).
    var h = b.herancaTeoria;
    if (h && h.concluida && (b.materiais || []).every(function (x) { return x.concluido; })) { a.concluido = true; a.dataConclusao = h.data || UI.hoje(); a.herdado = true; }
    b.materiais.push(a);
    salvar();
  }
  function atualizarMaterial(blocoId, id, campos) {
    var b = bloco(blocoId), m = b && buscar(b.materiais || [], id); if (!m) return;
    Object.assign(m, camposMaterial(campos));
    salvar();
  }
  function excluirMaterial(blocoId, id) {
    var b = bloco(blocoId); if (!b) return;
    b.materiais = (b.materiais || []).filter(function (m) { return m.id !== id; });
    salvar();
  }
  function cursosUsados() {
    var r = {};
    db.blocos.forEach(function (b) { (b.materiais || []).forEach(function (m) { if (m.curso) r[m.curso] = true; }); });
    return Object.keys(r).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
  }

  function definirApelido(nomeNormalizado, valor) {
    db.apelidos[nomeNormalizado] = valor;
    salvar();
  }

  // ---------- Backup ----------
  function exportar() { return JSON.stringify(db, null, 2); }

  function importar(texto) {
    var d = JSON.parse(texto);
    if (!d || !Array.isArray(d.disciplinas)) throw new Error('Arquivo não parece ser um backup deste programa.');
    db = normalizar(d);
    salvar();
  }

  function limpar() { db = vazio(); salvar(); }

  function estaVazio() { return db.disciplinas.length === 0; }

  function carregarExemplo() {
    var trib = criarDisciplina({ nome: 'Direito Tributário', cor: '#4f7cff', peso: 10 });
    var b1 = criarBloco(trib.id, 'Bloco 01');
    criarTopicos(b1.id, ['Introdução ao Direito Tributário.', 'Tributos (arts. 03º ao 08º, 16 a 18, 76 a 82 - CTN).']);
    var b2 = criarBloco(trib.id, 'Bloco 02');
    criarTopicos(b2.id, ['Limitações Constitucionais ao Poder de Tributar (arts. 150 a 152 - CF/88).', 'Princípios Tributários e Imunidades Tributárias.']);
    var b3 = criarBloco(trib.id, 'Bloco 03');
    criarTopicos(b3.id, ['Competência Tributária.', 'Repartição de Receitas Tributárias.', 'Impostos de Competência dos Municípios (art. 156 - CF/88).']);
    topicosDe(b1.id).concat(topicosDe(b2.id)).forEach(function (t, i) {
      definirConcluido(t.id, true, UI.somarDias(UI.hoje(), -(i + 2)));
    });
    agendarRevisao(topicosDe(b2.id)[0].id, UI.somarDias(UI.hoje(), 3));

    var bancas = criarPasta(trib.id, 'Bancas CEBRASPE, FCC e FGV');
    var c1 = criarCaderno(bancas.id, { nome: 'Bloco 01', assunto: 'Introdução e Tributos', link: 'https://www.tecconcursos.com.br/', prioridade: 'alta', totalQuestoes: 115 });
    var c2 = criarCaderno(bancas.id, { nome: 'Bloco 02', assunto: 'Limitações Constitucionais ao Poder de Tributar', link: 'https://www.tecconcursos.com.br/', prioridade: 'alta', totalQuestoes: 110 });
    criarCaderno(bancas.id, { nome: 'Bloco 03', assunto: 'Competência Trib. e Repartição de Receitas', prioridade: 'media', totalQuestoes: 110 });
    criarPasta(trib.id, 'Revisão ERRADAS');
    db.sessoes.push(
      { id: novoId(), data: UI.somarDias(UI.hoje(), -5), disciplinaId: trib.id, segundos: 5400, tipo: 'questoes', topicoIds: [],
        cadernos: [{ cadernoId: c1.id, acertos: 94, erros: 21 }], anotacao: '', criadoEm: Date.now() },
      { id: novoId(), data: UI.somarDias(UI.hoje(), -2), disciplinaId: trib.id, segundos: 4200, tipo: 'questoes', topicoIds: [],
        cadernos: [{ cadernoId: c2.id, acertos: 81, erros: 27 }], anotacao: 'Fazer as 2 questões que faltam do Bloco 02 e começar o Bloco 03.', criadoEm: Date.now() }
    );
    salvar();

    var adm = criarDisciplina({ nome: 'Direito Administrativo', cor: '#e5534b', peso: 8 });
    var a1 = criarBloco(adm.id, 'Bloco 01');
    criarTopicos(a1.id, ['Princípios da Administração Pública.', 'Organização Administrativa.', 'Atos Administrativos.', 'Poderes Administrativos.']);
    definirConcluido(topicosDe(a1.id)[0].id, true, UI.somarDias(UI.hoje(), -3));

    var port = criarDisciplina({ nome: 'Português', cor: '#2bb5a0', peso: 6 });
    var p1 = criarBloco(port.id, 'Bloco 01');
    criarTopicos(p1.id, ['Interpretação de Textos.', 'Classes de Palavras.', 'Concordância Verbal e Nominal.']);

    definirCiclo([
      { disciplinaId: trib.id, minutosPlanejados: 120 },
      { disciplinaId: adm.id, minutosPlanejados: 90 },
      { disciplinaId: port.id, minutosPlanejados: 60 },
      { disciplinaId: trib.id, minutosPlanejados: 60 }
    ]);
  }

  return {
    get db() { return db; },
    salvar: salvar, substituir: substituir,
    novoId: novoId,
    porOrdem: porOrdem,
    disciplinas: disciplinas, disciplina: disciplina,
    criarDisciplina: criarDisciplina, atualizarDisciplina: atualizarDisciplina, excluirDisciplina: excluirDisciplina,
    modoDeEstudo: modoDeEstudo,
    blocosDe: blocosDe, bloco: bloco, criarBloco: criarBloco, atualizarBloco: atualizarBloco, excluirBloco: excluirBloco,
    relevancia: relevancia, definirRelevancia: definirRelevancia,
    topicosDe: topicosDe, topico: topico, topicosDaDisciplina: topicosDaDisciplina,
    criarTopicos: criarTopicos, atualizarTopico: atualizarTopico, excluirTopico: excluirTopico,
    definirConcluido: definirConcluido, agendarRevisao: agendarRevisao, concluirRevisao: concluirRevisao,
    pastasDe: pastasDe, pasta: pasta, pastaTeoria: pastaTeoria, pastaErros: pastaErros, pastaFixa: pastaFixa,
    pastaSimulado: pastaSimulado, pastaFavoritas: pastaFavoritas,
    NOME_PASTA_TEORIA: NOME_PASTA_TEORIA, NOME_PASTA_ERROS: NOME_PASTA_ERROS,
    NOME_PASTA_SIMULADO: NOME_PASTA_SIMULADO, NOME_PASTA_FAVORITAS: NOME_PASTA_FAVORITAS, criarPasta: criarPasta,
    GRUPOS_FAVORITAS: GRUPOS_FAVORITAS, ORDEM_FAVORITAS: ORDEM_FAVORITAS, GRUPO_FAVORITAS_LEITURA: GRUPO_FAVORITAS_LEITURA, cadernoFavorito: cadernoFavorito, grupoLivre: grupoLivre,
    planoRevisao: planoRevisao,
    rodadaFavorita: rodadaFavorita, rodadaAberta: rodadaAberta, rodadaExibida: rodadaExibida, marcarRodadaVazia: marcarRodadaVazia,
    paresDeBlocos: paresDeBlocos, nomePar: nomePar, cadernoDoPar: cadernoDoPar, parSemCaderno: parSemCaderno,
    gruposDeErros: gruposDeErros, parDoCaderno: parDoCaderno, atualizarPasta: atualizarPasta, excluirPasta: excluirPasta,
    cadernosDe: cadernosDe, caderno: caderno, cadernosDaDisciplina: cadernosDaDisciplina,
    criarCaderno: criarCaderno, atualizarCaderno: atualizarCaderno, moverCaderno: moverCaderno, excluirCaderno: excluirCaderno,
    blocoSemCaderno: blocoSemCaderno, cadernoDoBloco: cadernoDoBloco,
    numBaterias: numBaterias, divisaoBaterias: divisaoBaterias, divisaoIgual: divisaoIgual, divisaoPadrao: divisaoPadrao,
    bateriasCaderno: bateriasCaderno, planoTeoria: planoTeoria,
    proximaDoCiclo: itemAtualCiclo, avancarCiclo: avancarCiclo, irParaPosicaoCiclo: irParaPosicaoCiclo,
    sessoesDaPosicaoCiclo: sessoesDaPosicaoCiclo,
    definirCiclo: definirCiclo, recomecarCiclo: recomecarCiclo,
    revisto: revisto, marcarRevisto: marcarRevisto,
    sessao: sessao, criarSessao: criarSessao, atualizarSessao: atualizarSessao, excluirSessao: excluirSessao,
    statsQuestoes: statsQuestoes, statsCaderno: statsCaderno, statsPasta: statsPasta,
    progressoTeoria: progressoTeoria, progressoBloco: progressoBloco,
    sessoesDe: sessoesDe, ultimoEstudo: ultimoEstudo, tempoAcumulado: tempoAcumulado,
    ultimaAnotacao: ultimaAnotacao, ultimoEstudoTopico: ultimoEstudoTopico, revisoesPendentes: revisoesPendentes,
    importacoes: importacoes, fimUltimaImportacao: fimUltimaImportacao, adicionarImportacao: adicionarImportacao,
    excluirImportacao: excluirImportacao, definirApelido: definirApelido,
    BANCAS: BANCAS, NOME_BANCA: NOME_BANCA, incidenciasDe: incidenciasDe, incidencia: incidencia, salvarIncidencia: salvarIncidencia,
    excluirIncidencia: excluirIncidencia, arvoreIncidencia: arvoreIncidencia, descendentes: descendentes, somarIncidencia: somarIncidencia,
    estrelasPorRazao: estrelasPorRazao, relevanciasDaDisciplina: relevanciasDaDisciplina, incidenciaBloco: incidenciaBloco,
    definirAssuntosTec: definirAssuntosTec, topicosHistoricos: topicosHistoricos,
    aulasDe: aulasDe, aula: aula, aulasHistoricas: aulasHistoricas, definirAulaConcluida: definirAulaConcluida, ultimoEstudoAula: ultimoEstudoAula, nomeAula: nomeAula,
    TIPOS_MATERIAL: TIPOS_MATERIAL, criarMaterial: criarMaterial, atualizarMaterial: atualizarMaterial, excluirMaterial: excluirMaterial, cursosUsados: cursosUsados,
    atualizarPerfil: atualizarPerfil, criarPausa: criarPausa, encerrarPausa: encerrarPausa,
    exportar: exportar, importar: importar, limpar: limpar, estaVazio: estaVazio, carregarExemplo: carregarExemplo
  };
})();
