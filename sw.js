const RELEASE_VERSION = '6.156';
const CACHE = 'genesis-pos-v6.156-auth';
const ASSETS = ['./', './index.html', './styles.css', './commercial-ui.css?v=6.156', './list-analysis.css?v=6.156', './boot-compat.js?v=6.156', './firebase-init.js?v=6.156', './gms-json-core.js?v=6.156', './sync-core.js?v=6.156', './charge-core.js?v=6.156', './analysis-data.js?v=6.156', './list-analysis-core.js?v=6.156', './list-analysis-ui.js?v=6.156', './settings-store.js?v=6.156', './settings-editor.js?v=6.156', './settings-actions.js?v=6.156', './settings-editor.css?v=6.156', './release-notes.js?v=6.156', './release-notes.css?v=6.156', './app.js?v=6.156', './manifest.json', './icon-192.png', './icon-512.png'];

ASSETS.push('./access-control.js?v=6.156', './access-ui.js?v=6.156', './account-access-ui.js?v=6.156', './account-access.css?v=6.156');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: RELEASE_VERSION })))
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // プリンターへの通信はService Workerを完全にバイパス
  if(url.includes('192.168.') || url.includes('cgi-bin') || url.includes('epos')){
    return;
  }

  // Firebase / Google APIはバイパス
  if(url.includes('firebase') || url.includes('googleapis') || url.includes('gstatic')){
    return;
  }

  // GETのみキャッシュ対象
  if(e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
