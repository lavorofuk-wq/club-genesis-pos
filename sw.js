const CACHE = 'genesis-pos-v3';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
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
