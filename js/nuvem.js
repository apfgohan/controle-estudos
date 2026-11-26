// Nuvem: login com Google e sincronização dos dados entre aparelhos pelo Firebase Realtime Database.
//
//   usuarios/{uid}/dados         <- todos os dados, em JSON (texto)
//   usuarios/{uid}/atualizadoEm  <- quando foram alterados pela última vez (vale a versão mais recente)
//   usuarios/{uid}/resumos/{id}  <- resumo de cada matéria, gravado à parte (ver resumos-dados.js)
//
// As regras do banco (ver regrasSugeridas) só deixam cada conta ler e gravar a própria área;
// por enquanto, só a conta do dono. O localStorage continua como cópia rápida e permite usar sem internet.
var Nuvem = (function () {
  var ESPERA_MS = 1500;
  var VERSAO_SDK = '10.12.2';

  // O login do Google não funciona com o index.html aberto direto do disco (file://): lá a nuvem fica desligada.
  var pelaWeb = /^https?:$/.test(location.protocol);
  var ativa = !!(window.FIREBASE_CONFIG && window.firebase && pelaWeb);
  // 'desligada' | 'entrar' | 'conectando' | 'sincronizado' | 'offline' | 'negado' | 'erro'
  var estado = ativa ? 'conectando' : 'desligada';
  var usuario = null;
  var ref = null;
  var online = true;
  var pendente = false;
  var timer = null;
  var remotoEsperando = null; // versão mais nova da nuvem aguardando um formulário ser fechado
  var comparado = false;      // só grava depois de comparar com a versão da nuvem ao entrar
  var mensagemErro = '';
  var ultimoSalvo = null;
  var ouvintes = [];

  function notificar() { ouvintes.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function aoMudar(f) { ouvintes.push(f); }

  function falhar(e) {
    console.error(e);
    var negado = e && /permission|PERMISSION_DENIED/i.test(e.code + ' ' + e.message);
    estado = negado ? 'negado' : 'erro';
    mensagemErro = e && e.message ? e.message : String(e);
    notificar();
  }

  // ---------- Login ----------
  function entrar() {
    var provedor = new firebase.auth.GoogleAuthProvider();
    provedor.setCustomParameters({ prompt: 'select_account' });
    return firebase.auth().signInWithPopup(provedor).catch(function (e) {
      // Celulares às vezes bloqueiam a janela: entra pelo redirecionamento.
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        return firebase.auth().signInWithRedirect(provedor);
      }
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') UI.aviso('Não foi possível entrar: ' + e.message);
    });
  }

  function sair() {
    UI.confirmar('Sair da sua conta neste aparelho? Os dados continuam na nuvem; para usar de novo, entre com a mesma conta.', function () {
      gravarAgora().then(function () { return firebase.auth().signOut(); });
    }, 'Sair');
  }

  // ---------- Sincronização ----------
  function local() { return Dados.db.atualizadoEm || 0; }
  // Base: a versão da nuvem que este aparelho leu ou gravou por último. Se a nuvem e este aparelho mudaram depois dela,
  // os dois lados são juntados (as sessões lançadas aqui que não subiram não se perdem).
  var CHAVE_BASE = 'controle-estudos.base-nuvem';
  function base() { try { return Number(localStorage.getItem(CHAVE_BASE)) || 0; } catch (e) { return 0; } }
  function definirBase(v) { try { if (v) localStorage.setItem(CHAVE_BASE, String(v)); } catch (e) { /* segue */ } }
  function juntar(textoRemoto, quandoRemoto) {
    var remoto; try { remoto = JSON.parse(textoRemoto); } catch (e) { return false; }
    var m = Dados.mesclarComRemoto(remoto, Dados.db, base());
    Dados.substituir(m.dados, 'nuvem');
    Dados.db.atualizadoEm = Math.max(Date.now(), (quandoRemoto || 0) + 1);
    if (window.App) App.atualizar();
    if (m.adicionadas) UI.aviso(m.adicionadas + (m.adicionadas === 1 ? ' sessão deste aparelho foi juntada' : ' sessões deste aparelho foram juntadas') + ' com a nuvem');
    return true;
  }
  function vazioNoTexto(texto) {
    try { var d = JSON.parse(texto); return !d || !Array.isArray(d.disciplinas) || Dados.semDados(d); } catch (e) { return false; }
  }

  function aplicarRemoto(texto) {
    var dados;
    try { dados = JSON.parse(texto); } catch (e) { falhar(new Error('Os dados da nuvem estão ilegíveis e não foram aplicados.')); return; }
    if (!dados || !Array.isArray(dados.disciplinas)) { falhar(new Error('Os dados da nuvem não parecem ser deste programa.')); return; }
    // Não troca os dados com um formulário aberto (perderia o que está sendo digitado).
    if (document.querySelector('.modal-fundo')) { remotoEsperando = texto; return; }
    remotoEsperando = null;
    Dados.substituir(dados, 'nuvem');
    if (window.App) App.atualizar();
  }

  setInterval(function () {
    if (remotoEsperando && !document.querySelector('.modal-fundo')) aplicarRemoto(remotoEsperando);
  }, 2000);

  // Ao entrar: se a nuvem for mais recente (ou este aparelho estiver vazio), carrega dela;
  // senão, envia os dados deste aparelho. Depois fica ouvindo alterações feitas em outros aparelhos.
  function conectar(u) {
    usuario = u;
    comparado = false;
    estado = online ? 'conectando' : 'offline';
    notificar();
    esconderTelaLogin();
    ref = firebase.database().ref('usuarios/' + u.uid);
    // Lê só os dados e a data: os resumos (que podem ser grandes) são baixados quando cada matéria é aberta.
    Promise.all([ref.child('dados').once('value'), ref.child('atualizadoEm').once('value')]).then(function (snaps) {
      var v = { dados: snaps[0].val(), atualizadoEm: snaps[1].val() };
      // Dados vazios nunca vencem dados preenchidos, seja qual for a data
      // (protege contra um aparelho novo ou vazio apagar o que já está na nuvem, e vice-versa).
      var remotoVazio = !v || !v.dados || vazioNoTexto(v.dados);
      var localVazio = Dados.semDados();
      var b = base(), rt = v.atualizadoEm || 0;
      if (!remotoVazio && !localVazio && b && rt > b && local() > b && rt !== local()) {
        // Os dois mudaram desde a última sincronização: junta e envia o resultado.
        juntar(v.dados, rt);
        pendente = true;
      } else if (!remotoVazio && (localVazio || rt >= local())) {
        aplicarRemoto(v.dados);
        ultimoSalvo = v.atualizadoEm || null;
        definirBase(rt);
        pendente = false;
      } else if (!localVazio) {
        pendente = true;
      } else {
        pendente = false; // os dois vazios: nada a enviar
      }
      comparado = true;
      estado = online ? 'sincronizado' : 'offline';
      notificar();
      if (window.ResumosDados) ResumosDados.enviarPendentes();
      // Cronômetro iniciado em outro aparelho (ou parado lá): acompanha.
      var primeiroCron = true;
      ref.child('cronometro').on('value', function (s) {
        var v = null; try { v = s.val() ? JSON.parse(s.val()) : null; } catch (e) { v = null; }
        if (aoCron) aoCron(v, primeiroCron);
        primeiroCron = false;
      });
      if (window.PdfsDados) PdfsDados.enviarPendentes();
      return embutirFotoPerfil().then(function () { if (pendente) return gravarAgora(); });
    }).then(function () {
      ref.child('atualizadoEm').on('value', function (snap) {
        var quando = snap.val() || 0;
        if (quando > local() && !pendente) {
          ref.child('dados').once('value').then(function (s) { if (s.val()) { aplicarRemoto(s.val()); ultimoSalvo = quando; definirBase(quando); notificar(); } });
        }
      }, falhar);
    }).catch(falhar);
  }

  function gravarAgora() {
    clearTimeout(timer);
    if (!ref || !comparado || estado === 'negado') return Promise.resolve();
    var alvo = ref;
    // Antes de gravar: se outro aparelho gravou depois da nossa base, junta primeiro (em vez de passar por cima).
    return alvo.child('atualizadoEm').once('value').then(function (s) {
      var rt = s.val() || 0, b = base();
      if (b && rt > b && rt !== local()) {
        return alvo.child('dados').once('value').then(function (sd) { if (sd.val()) juntar(sd.val(), rt); });
      }
    }).then(function () {
    var quando = local() || Date.now();
    // Sem internet, o Firebase guarda a gravação e envia quando a conexão voltar (com a página aberta).
    return alvo.update({ dados: Dados.exportar(), atualizadoEm: quando });
    }).then(function () {
      definirBase(local() || Date.now());
      pendente = false;
      ultimoSalvo = local();
      copiaDoDia();
      if (estado !== 'offline') estado = 'sincronizado';
      notificar();
    }).catch(falhar);
  }

  function agendar() {
    if (!ref) return;
    pendente = true;
    notificar();
    clearTimeout(timer);
    timer = setTimeout(gravarAgora, ESPERA_MS);
  }

  // A foto padrão do perfil é um arquivo da pasta do programa; na nuvem ela passa a ir junto com os dados
  // (assim o arquivo não precisa ser publicado e a foto aparece em qualquer aparelho).
  function embutirFotoPerfil() {
    var p = Dados.db.perfil;
    if (!p || !p.foto || /^data:/.test(p.foto)) return Promise.resolve();
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () {
        var lado = Math.min(img.width, img.height), tam = 256;
        var c = document.createElement('canvas');
        c.width = c.height = tam;
        c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, tam, tam);
        Dados.atualizarPerfil({ nome: p.nome, cargo: p.cargo, foto: c.toDataURL('image/jpeg', 0.88) });
        ok();
      };
      img.onerror = function () { ok(); };
      img.src = p.foto;
    });
  }

  // ---------- Cópia diária dos dados principais (14 dias), para voltar atrás se algo der errado ----------
  // Guarda o estado do primeiro salvamento de cada dia. Um índice pequeno lista as cópias sem baixá-las.
  var CHAVE_COPIA = 'controle-estudos.copia-nuvem', COPIAS_NUVEM = 14;
  function copiaDoDia() {
    var hoje = UI.hoje();
    try { if (localStorage.getItem(CHAVE_COPIA) === hoje) return; } catch (e) { /* segue */ }
    if (!ref || Dados.semDados()) return;
    var alvo = ref;
    alvo.child('copiasIndice/' + hoje).once('value').then(function (s) {
      if (s.val()) return null; // outro aparelho já fez a de hoje
      var texto = Dados.exportar();
      return alvo.child('copias/' + hoje).set({ dados: texto, atualizadoEm: Date.now() }).then(function () {
        return alvo.child('copiasIndice/' + hoje).set({ tamanho: texto.length, atualizadoEm: Date.now() });
      }).then(function () {
        return alvo.child('copiasIndice').once('value').then(function (si) {
          var datas = Object.keys(si.val() || {}).sort().reverse();
          return Promise.all(datas.slice(COPIAS_NUVEM).map(function (d) { return Promise.all([alvo.child('copias/' + d).remove(), alvo.child('copiasIndice/' + d).remove()]); }));
        });
      });
    }).then(function () { try { localStorage.setItem(CHAVE_COPIA, hoje); } catch (e) { /* tenta amanhã de novo */ } })
      .catch(function (e) { console.warn('Cópia diária na nuvem não feita', e); });
  }
  function listarCopias() {
    if (!ref) return Promise.reject(new Error('Entre com a sua conta para ver as cópias.'));
    return ref.child('copiasIndice').once('value').then(function (s) {
      var v = s.val() || {};
      return Object.keys(v).sort().reverse().map(function (d) { return { data: d, tamanho: v[d].tamanho || 0, atualizadoEm: v[d].atualizadoEm || 0 }; });
    });
  }
  function baixarCopia(data) {
    return ref.child('copias/' + data).once('value').then(function (s) { var v = s.val(); if (!v || !v.dados) throw new Error('Cópia não encontrada.'); return v.dados; });
  }

  // ---------- Cronômetro em andamento (aparece em qualquer aparelho) ----------
  var aoCron = null;
  function salvarCron(c) { if (ref && comparado) ref.child('cronometro').set(c ? JSON.stringify(c) : null).catch(function (e) { console.warn(e); }); }
  function ouvirCron(f) { aoCron = f; }

  // ---------- Resumos (um por matéria, fora dos dados principais) ----------
  function podeGravar() { return !!(ref && comparado && estado !== 'negado'); }
  function salvarResumo(id, rec) { return ref.child('resumos/' + id).set(rec); }
  function buscarResumo(id) { return ref.child('resumos/' + id).once('value').then(function (s) { return s.val(); }); }
  function apagarResumo(id) { return Promise.all([ref.child('resumos/' + id).remove(), ref.child('resumosInfo/' + id).remove()]); }
  // Índice leve dos resumos (data, títulos, tamanho): a lista mostra o que existe sem baixar todos os textos.
  function salvarResumoInfo(id, info) { return ref.child('resumosInfo/' + id).set(info); }
  function listarResumosInfo() { return ref.child('resumosInfo').once('value').then(function (s) { return s.val() || {}; }); }
  // Lei Seca: uma lei por registro (texto estruturado, marcações e questões, em JSON) e um índice leve.
  function salvarLei(id, rec) { return ref.child('leis/' + id).set(rec); }
  function buscarLei(id) { return ref.child('leis/' + id).once('value').then(function (s) { return s.val(); }); }
  function apagarLei(id) { return Promise.all([ref.child('leis/' + id).remove(), ref.child('leisInfo/' + id).remove()]); }
  function salvarLeiInfo(id, info) { return ref.child('leisInfo/' + id).set(info); }
  function listarLeisInfo() { return ref.child('leisInfo').once('value').then(function (s) { return s.val() || {}; }); }
  // Grifos e anotações dos PDFs, um registro por aula.
  function salvarGrifos(id, rec) { return ref.child('grifos/' + id).set(rec); }
  function buscarGrifos(id) { return ref.child('grifos/' + id).once('value').then(function (s) { return s.val(); }); }
  function apagarGrifos(id) { return ref.child('grifos/' + id).remove(); }

  window.addEventListener('beforeunload', function (e) {
    if (pendente && ref) { gravarAgora(); e.preventDefault(); e.returnValue = ''; }
  });

  // Regras do banco com a conta do dono já preenchida (o usuário cola no console do Firebase).
  // Para liberar outras pessoas no futuro, a condição do uid dá lugar a uma lista de aprovados.
  function regrasSugeridas(uid) {
    var cond = "auth != null && auth.uid === $uid && auth.uid === '" + uid + "'";
    return JSON.stringify({ rules: { usuarios: { $uid: { '.read': cond, '.write': cond } } } }, null, 2);
  }

  // ---------- Tela de login ----------
  var tela = null;
  function mostrarTelaLogin() {
    if (tela) return;
    var el = UI.el;
    tela = el('div', { class: 'tela-login' }, el('div', { class: 'login-caixa' }, [
      el('div', { class: 'login-marca', text: 'Controle de Estudos' }),
      el('p', { class: 'login-texto', text: 'Entre com a sua conta Google para acessar seus dados em qualquer aparelho.' }),
      UI.botao('Entrar com Google', entrar, 'btn-primario btn-login'),
      el('p', { class: 'campo-ajuda', text: 'Acesso restrito: só a conta autorizada consegue ver e alterar os dados.' })
    ]));
    document.body.appendChild(tela);
  }
  function esconderTelaLogin() { if (tela) { tela.remove(); tela = null; } }

  // ---------- Indicador no topo e aviso ----------
  // "às 14:32", "ontem 22:10" ou "18/11 09:05".
  function quandoTexto(ms) {
    if (!ms) return '';
    var d = new Date(ms), hoje = new Date(), ontem = new Date(Date.now() - 86400000);
    var h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === hoje.toDateString()) return 'às ' + h;
    if (d.toDateString() === ontem.toDateString()) return 'ontem ' + h;
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + h;
  }
  setInterval(function () { if (estado === 'sincronizado') desenharIndicador(); }, 60000); // "ontem" vira data com o passar do tempo
  function desenharIndicador() {
    if (!ativa) return;
    var caixa = document.getElementById('status-dados');
    if (!caixa) return;
    var el = UI.el, n;
    caixa.innerHTML = '';
    var hora = ultimoSalvo ? ' · última sincronização às ' + new Date(ultimoSalvo).toLocaleTimeString('pt-BR') : '';
    // Além dos dados principais: resumo que não subiu e PDFs na fila do Google Drive.
    var resumoPendente = window.ResumosDados && ResumosDados.pendencias ? ResumosDados.pendencias() : 0;
    var pdfsNaFila = window.Drive && Drive.ligado() ? Drive.situacao().fila.filter(function (x) { return x.op === 'enviar'; }).length : 0;
    if (estado === 'sincronizado' && !pendente && resumoPendente) {
      n = el('a', { href: '#/resumos', class: 'status-dados atencao', title: resumoPendente + (resumoPendente === 1 ? ' resumo ainda não subiu' : ' resumos ainda não subiram') + ' para a nuvem (estão salvos neste aparelho e o envio é tentado de novo sozinho).' },
        [el('span', { class: 'status-ponto' }), 'Resumo pendente']);
    } else if (estado === 'sincronizado') {
      n = el('a', { href: pdfsNaFila ? '#/configuracoes' : '#/backup', class: 'status-dados ok' + (pendente || pdfsNaFila ? ' salvando' : ''), title: 'Dados salvos na nuvem' + hora + (pdfsNaFila ? ' · ' + pdfsNaFila + (pdfsNaFila === 1 ? ' PDF subindo' : ' PDFs subindo') + ' para o Google Drive' : '') },
        [el('span', { class: 'status-ponto' }), pendente ? 'Salvando…' : pdfsNaFila ? 'Enviando PDFs…' : 'Salvo na nuvem' + (ultimoSalvo ? ' ' + quandoTexto(ultimoSalvo) : '')]);
    } else if (estado === 'offline') {
      n = el('a', { href: '#/backup', class: 'status-dados atencao', title: 'Sem internet: as alterações ficam neste aparelho e vão para a nuvem quando a conexão voltar.' },
        [el('span', { class: 'status-ponto' }), 'Sem internet']);
    } else if (estado === 'conectando') {
      n = el('span', { class: 'status-dados salvando' }, [el('span', { class: 'status-ponto' }), 'Conectando…']);
    } else if (estado === 'negado' || estado === 'erro') {
      n = el('a', { href: '#/backup', class: 'status-dados erro', title: mensagemErro }, [el('span', { class: 'status-ponto' }), estado === 'negado' ? 'Acesso negado' : 'Erro na nuvem']);
    }
    if (n) caixa.appendChild(n);
  }
  aoMudar(desenharIndicador);
  document.addEventListener('DOMContentLoaded', function () {
    if (window.ResumosDados && ResumosDados.aoMudarEstado) ResumosDados.aoMudarEstado(function () { desenharIndicador(); });
    if (window.Drive) Drive.aoMudar(desenharIndicador);
  });

  function desenharAviso() {
    if (!ativa) return;
    var caixa = document.getElementById('aviso-dados');
    if (!caixa) return;
    var el = UI.el;
    caixa.innerHTML = '';
    if (estado === 'negado' && usuario) {
      caixa.appendChild(el('div', { class: 'aviso-dados erro' }, [UI.icone('alerta'),
        el('span', { text: 'A nuvem recusou o acesso da conta ' + (usuario.email || '') + '. Se esta é a sua conta, configure as regras do banco na página Backup.' }),
        el('a', { class: 'btn btn-secundario', href: '#/backup', text: 'Ver como resolver' })]));
    } else if (estado === 'erro') {
      caixa.appendChild(el('div', { class: 'aviso-dados erro' }, [UI.icone('alerta'), el('span', { text: 'Problema na sincronização: ' + mensagemErro }),
        UI.botao('Tentar de novo', function () { if (usuario) conectar(usuario); }, 'btn-secundario')]));
    }
  }
  aoMudar(desenharAviso);

  // ---------- Início ----------
  function iniciar() {
    if (!ativa) { notificar(); return; }
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    } catch (e) { ativa = false; estado = 'desligada'; console.error(e); notificar(); return; }
    firebase.database().ref('.info/connected').on('value', function (s) {
      online = !!s.val();
      if ((estado === 'sincronizado' || estado === 'conectando') && !online && usuario) estado = 'offline';
      else if (estado === 'offline' && online) estado = comparado ? 'sincronizado' : 'conectando';
      notificar();
    });
    firebase.auth().getRedirectResult().catch(function (e) { UI.aviso('Não foi possível entrar: ' + e.message); });
    firebase.auth().onAuthStateChanged(function (u) {
      if (ref) { ref.child('atualizadoEm').off(); ref.child('cronometro').off(); ref = null; }
      if (u) conectar(u);
      else { usuario = null; estado = 'entrar'; notificar(); mostrarTelaLogin(); }
    });
  }

  return {
    iniciar: iniciar, agendar: agendar, gravarAgora: gravarAgora, entrar: entrar, sair: sair, aoMudar: aoMudar,
    regrasSugeridas: regrasSugeridas, VERSAO_SDK: VERSAO_SDK, pelaWeb: pelaWeb,
    podeGravar: podeGravar, salvarResumo: salvarResumo, buscarResumo: buscarResumo, apagarResumo: apagarResumo,
    salvarResumoInfo: salvarResumoInfo, listarResumosInfo: listarResumosInfo,
    salvarLei: salvarLei, buscarLei: buscarLei, apagarLei: apagarLei, salvarLeiInfo: salvarLeiInfo, listarLeisInfo: listarLeisInfo,
    listarCopias: listarCopias, baixarCopia: baixarCopia, salvarCron: salvarCron, ouvirCron: ouvirCron,
    salvarGrifos: salvarGrifos, buscarGrifos: buscarGrifos, apagarGrifos: apagarGrifos,
    ativa: function () { return ativa; },
    info: function () {
      return { ativa: ativa, estado: estado, email: usuario ? usuario.email : null, uid: usuario ? usuario.uid : null,
        ultimoSalvo: ultimoSalvo, pendente: pendente, erro: mensagemErro };
    }
  };
})();
