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
      if (!remotoVazio && (localVazio || (v.atualizadoEm || 0) >= local())) {
        aplicarRemoto(v.dados);
        ultimoSalvo = v.atualizadoEm || null;
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
      return embutirFotoPerfil().then(function () { if (pendente) return gravarAgora(); });
    }).then(function () {
      ref.child('atualizadoEm').on('value', function (snap) {
        var quando = snap.val() || 0;
        if (quando > local() && !pendente) {
          ref.child('dados').once('value').then(function (s) { if (s.val()) { aplicarRemoto(s.val()); ultimoSalvo = quando; notificar(); } });
        }
      }, falhar);
    }).catch(falhar);
  }

  function gravarAgora() {
    clearTimeout(timer);
    if (!ref || !comparado || estado === 'negado') return Promise.resolve();
    var quando = local() || Date.now();
    // Sem internet, o Firebase guarda a gravação e envia quando a conexão voltar (com a página aberta).
    return ref.update({ dados: Dados.exportar(), atualizadoEm: quando }).then(function () {
      pendente = false;
      ultimoSalvo = quando;
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

  // ---------- Resumos (um por matéria, fora dos dados principais) ----------
  function podeGravar() { return !!(ref && comparado && estado !== 'negado'); }
  function salvarResumo(id, rec) { return ref.child('resumos/' + id).set(rec); }
  function buscarResumo(id) { return ref.child('resumos/' + id).once('value').then(function (s) { return s.val(); }); }
  function apagarResumo(id) { return ref.child('resumos/' + id).remove(); }

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
  function desenharIndicador() {
    if (!ativa) return;
    var caixa = document.getElementById('status-dados');
    if (!caixa) return;
    var el = UI.el, n;
    caixa.innerHTML = '';
    var hora = ultimoSalvo ? ' · última sincronização às ' + new Date(ultimoSalvo).toLocaleTimeString('pt-BR') : '';
    if (estado === 'sincronizado') {
      n = el('a', { href: '#/backup', class: 'status-dados ok' + (pendente ? ' salvando' : ''), title: 'Dados salvos na nuvem' + hora },
        [el('span', { class: 'status-ponto' }), pendente ? 'Salvando…' : 'Salvo na nuvem']);
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
      if (ref) { ref.child('atualizadoEm').off(); ref = null; }
      if (u) conectar(u);
      else { usuario = null; estado = 'entrar'; notificar(); mostrarTelaLogin(); }
    });
  }

  return {
    iniciar: iniciar, agendar: agendar, gravarAgora: gravarAgora, entrar: entrar, sair: sair, aoMudar: aoMudar,
    regrasSugeridas: regrasSugeridas, VERSAO_SDK: VERSAO_SDK, pelaWeb: pelaWeb,
    podeGravar: podeGravar, salvarResumo: salvarResumo, buscarResumo: buscarResumo, apagarResumo: apagarResumo,
    ativa: function () { return ativa; },
    info: function () {
      return { ativa: ativa, estado: estado, email: usuario ? usuario.email : null, uid: usuario ? usuario.uid : null,
        ultimoSalvo: ultimoSalvo, pendente: pendente, erro: mensagemErro };
    }
  };
})();
