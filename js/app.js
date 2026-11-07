// Navegação entre abas (rotas no endereço: #/teoria, #/teoria/<id>, ...).
var App = (function () {
  var rotas = {
    dashboard: Dashboard.render,
    teoria: Teoria.render,
    questoes: Questoes.render,
    estatisticas: Estatisticas.render,
    historico: Historico.render,
    resumos: Resumos.render,
    backup: Backup.render
  };
  var ROTA_INICIAL = 'dashboard';

  var ultimaRota = null;

  function render() {
    var partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    var nome = rotas[partes[0]] ? partes[0] : ROTA_INICIAL;
    var chave = partes.join('/');
    var rolagem = chave === ultimaRota ? window.scrollY : 0;
    ultimaRota = chave;

    document.querySelectorAll('#menu a').forEach(function (a) {
      a.classList.toggle('ativo', a.getAttribute('data-rota') === nome);
    });

    var raiz = document.getElementById('conteudo');
    raiz.innerHTML = '';
    rotas[nome](raiz, partes.slice(1));
    window.scrollTo(0, rolagem);
    Patentes.conferirAvisos();
  }

  window.addEventListener('hashchange', render);
  document.addEventListener('DOMContentLoaded', function () {
    render();
    Nuvem.aoMudar(Patentes.conferirAvisos);
    Nuvem.iniciar();         // login e sincronização entre aparelhos (se o Firebase estiver configurado)
    Armazenamento.iniciar(); // conecta à pasta de dados (se já escolhida) e carrega o arquivo, se for mais recente
    // Permite instalar como app e abrir sem internet (só funciona em https ou localhost).
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Service worker não registrado', e); });
    }
  });

  // ---------- Versão nova publicada ----------
  // Uma aba aberta continua com os arquivos antigos até ser recarregada. O programa confere o arquivo versao.json
  // ao voltar para a aba e a cada 10 minutos; se houver versão nova, mostra um aviso para recarregar.
  var avisoVersao = null;
  function conferirVersao() {
    if (!window.VERSAO_APP || !/^https?:$/.test(location.protocol) || avisoVersao) return;
    fetch('versao.json?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
      if (!v || !v.versao || v.versao === window.VERSAO_APP || avisoVersao) return;
      var el = UI.el;
      avisoVersao = el('div', { class: 'aviso-versao' }, [
        el('span', { text: 'Há uma versão nova do programa.' }),
        UI.botao('Atualizar agora', function () {
          if (window.Resumos && Resumos.salvarAgora) Resumos.salvarAgora();
          setTimeout(function () { location.reload(); }, 300);
        }, 'btn-primario')
      ]);
      document.body.appendChild(avisoVersao);
    }).catch(function () { /* sem internet: confere depois */ });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') conferirVersao(); });
  setInterval(conferirVersao, 10 * 60 * 1000);
  setTimeout(conferirVersao, 5000);

  return { atualizar: render };
})();
