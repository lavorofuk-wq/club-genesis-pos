const RELEASE_VERSION = '6.155';
const CACHE = 'genesis-pos-v6.155-auth';
const ASSETS = ['./', './index.html', './styles.css', './list-analysis.css?v=6.155', './boot-compat.js?v=6.155', './firebase-init.js?v=6.155', './gms-json-core.js?v=6.155', './sync-core.js?v=6.155', './charge-core.js?v=6.155', './analysis-data.js?v=6.155', './list-analysis-core.js?v=6.155', './list-analysis-ui.js?v=6.155', './settings-store.js?v=6.155', './settings-editor.js?v=6.155', './settings-actions.js?v=6.155', './settings-editor.css?v=6.155', './release-notes.js?v=6.155', './release-notes.css?v=6.155', './app.js?v=6.155', './manifest.json', './icon-192.png', './icon-512.png'];

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
