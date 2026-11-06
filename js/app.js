// Navegação entre abas (rotas no endereço: #/teoria, #/teoria/<id>, ...).
var App = (function () {
  var rotas = {
    dashboard: Dashboard.render,
    teoria: Teoria.render,
    questoes: Questoes.render,
    estatisticas: Estatisticas.render,
    historico: Historico.render,
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

  return { atualizar: render };
})();
