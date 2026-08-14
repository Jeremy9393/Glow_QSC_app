/* 오프라인 대응 서비스 워커.
   전략: 네트워크 우선(항상 최신) → 실패 시 캐시(오프라인에서도 앱 실행).
   제출(POST)과 외부 주소(앱스 스크립트)는 건드리지 않는다 — 오프라인 제출 큐는 추후. */
const VER = 'v29';
const CACHE = 'qsc-app-' + VER;
const ASSETS = [
  'index.html', 'qsc.html', 'shopper.html', 'survey.html', 'codes.html', 'manifest.json',
  'css/app.css?v=29',
  'js/scoring.js?v=29', 'js/api.js?v=29', 'js/ui-time.js?v=29', 'js/ui-photo.js?v=29',
  'js/qsc-app.js?v=29', 'js/shopper-core.js?v=29', 'js/codes-app.js?v=29',
  'data/master.json', 'data/qr.json',
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

  /* 화면(html)·데이터(json)는 브라우저 HTTP 캐시까지 우회해서 항상 서버 최신본을 받는다.
     GitHub Pages가 10분 캐시를 주기 때문에, 이걸 안 하면 새 버전을 올려도
     기존 방문자에게 한동안 옛 화면이 그대로 보인다(2026-08-13 실제 발생).
     js·css는 ?v=N으로 주소가 바뀌므로, 폰트·아이콘은 안 바뀌므로 일반 캐시로 충분. */
  const fresh = e.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') || url.pathname.endsWith('.json');

  e.respondWith(
    (fresh ? fetch(url.href, { cache: 'reload' }) : fetch(e.request)).then(function (res) {
      const copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      // 오프라인 — 마지막으로 받아둔 사본으로 실행
      return caches.match(e.request).then(function (m) {
        return m || caches.match('index.html');
      });
    })
  );
});
