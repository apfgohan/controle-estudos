// Service worker: guarda os arquivos do programa para abrir sem internet.
// Busca sempre a versão nova na rede primeiro (atualizações chegam sozinhas) e usa a cópia guardada só offline.
// Os dados não passam por aqui: ficam no navegador e na nuvem.
var CACHE = 'controle-estudos-v3';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Só os arquivos do próprio programa e os scripts do Firebase; o resto (banco, login, fontes) vai direto.
  var proprio = url.origin === self.location.origin;
  var sdk = url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0;
  if (!proprio && !sdk) return;
  // Arquivos do programa: busca sempre por um endereço único, passando por cima dos caches do navegador e da
  // rede de distribuição do GitHub (que pode entregar a versão anterior por alguns minutos depois de uma atualização).
  // Assim nunca se misturam arquivos novos e antigos. São poucos arquivos pequenos; sem internet, usa a cópia guardada.
  var busca = proprio
    ? fetch(req.url + (req.url.indexOf('?') < 0 ? '?' : '&') + '_=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
    : fetch(req);
  e.respondWith(busca.then(function (resp) {
    if (resp.ok) { var copia = resp.clone(); caches.open(CACHE).then(function (c) { c.put(req, copia); }); }
    return resp;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('./index.html'); });
  }));
});
