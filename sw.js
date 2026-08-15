/* 오프라인 대응 서비스 워커.
   전략: 네트워크 우선(항상 최신) → 실패 시 캐시(오프라인에서도 앱 실행).
   제출(POST)과 외부 주소(앱스 스크립트)는 건드리지 않는다 — 오프라인 제출 큐는 추후. */
/* ⚠버전은 여기 한 곳만 고친다. html 쪽 ?v=N 과 숫자를 맞출 것.
   예전엔 아래 목록에도 ?v=30 을 일일이 적어서, VER만 올리고 목록을 안 고쳐
   새 파일이 캐시에 안 담기는 사고가 반복됐다. 이제 v()가 붙여주므로 어긋날 수 없다. */
const VER = 'v31';
const CACHE = 'qsc-app-' + VER;
const QS = '?v=' + VER.slice(1); // 'v31' → '?v=31'
function v(path) { return path + QS; }
const ASSETS = [
  'index.html', 'qsc.html', 'shopper.html', 'survey.html', 'codes.html', 'manifest.json',
  'data/master.json', 'data/qr.json',
  'fonts/NanumSquareL.woff2', 'fonts/NanumSquareR.woff2', 'fonts/NanumSquareB.woff2', 'fonts/NanumSquareEB.woff2',
  'icons/icon-192-v2.png', 'icons/icon-512-v2.png',
].concat([
  'css/app.css',
  'js/scoring.js', 'js/api.js', 'js/ui-time.js', 'js/ui-photo.js',
  'js/qsc-app.js', 'js/shopper-core.js', 'js/codes-app.js',
].map(v));

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
