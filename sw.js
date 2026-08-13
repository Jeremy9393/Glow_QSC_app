/* 오프라인 대응 서비스 워커.
   전략: 네트워크 우선(항상 최신) → 실패 시 캐시(오프라인에서도 앱 실행).
   제출(POST)과 외부 주소(앱스 스크립트)는 건드리지 않는다 — 오프라인 제출 큐는 추후. */
const VER = 'v23';
const CACHE = 'qsc-app-' + VER;
const ASSETS = [
  'index.html', 'qsc.html', 'shopper.html', 'survey.html', 'manifest.json',
  'css/app.css?v=23',
  'js/scoring.js?v=23', 'js/api.js?v=23', 'js/qsc-app.js?v=23', 'js/shopper-core.js?v=23',
  'data/master.json',
  'fonts/NanumSquareL.woff2', 'fonts/NanumSquareR.woff2', 'fonts/NanumSquareB.woff2', 'fonts/NanumSquareEB.woff2',
  'icons/icon-192-v2.png', 'icons/icon-512-v2.png',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (m) {
        return m || caches.match('index.html');
      });
    })
  );
});
