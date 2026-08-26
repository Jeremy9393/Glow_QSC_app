/* 오프라인 대응 서비스 워커.
   전략은 두 갈래다.
   ① 화면(html)·데이터(json) = 네트워크 우선(항상 최신) → 실패 시 캐시(오프라인에서도 앱 실행).
   ② 주소에 버전이 박힌 js/css(?v=N)와 폰트·아이콘 = 캐시 우선 → 없을 때만 네트워크.
   ②를 따로 뗀 이유: 전파가 나쁜 매장에서 fetch는 '실패'로 끝나지 않고 한참 매달린다.
   그러면 catch 폴백이 제때 안 터져 첫 화면이 통째로 멈춰 있었다(페이지당 왕복 ~11회).
   제출(POST)과 외부 주소(앱스 스크립트)는 건드리지 않는다 — 오프라인 제출 큐는 추후. */
/* ⚠버전은 여기 한 곳만 고친다. html 쪽 ?v=N 과 숫자를 맞출 것.
   예전엔 아래 목록에도 ?v=30 을 일일이 적어서, VER만 올리고 목록을 안 고쳐
   새 파일이 캐시에 안 담기는 사고가 반복됐다. 이제 v()가 붙여주므로 어긋날 수 없다. */
const VER = 'v71';
const CACHE = 'qsc-app-' + VER;
const QS = '?v=' + VER.slice(1); // 'v36' → '?v=45'
function v(path) { return path + QS; }
const ASSETS = [
  'index.html', 'login.html', 'qsc.html', 'shopper.html', 'survey.html',
  'codes.html', 'dashboard.html', 'store.html', 'accounts.html', 'admin.html', 'manifest.json',
  /* ⚠쿼리 없이 적는다. js/login-app.js·index.html이 fetch('data/master.json', {cache:'no-store'})로
     부르는데, caches.match는 주소가 한 글자라도 다르면 안 맞는다. 여기에 ?v=N을 붙여두면
     설치 직후 오프라인 진입에서 매장 목록이 통째로 빈다. */
  'data/master.json', 'data/qr.json',
  'fonts/NanumSquareL.woff2', 'fonts/NanumSquareR.woff2', 'fonts/NanumSquareB.woff2', 'fonts/NanumSquareEB.woff2',
  'icons/icon-192-v2.png', 'icons/icon-512-v2.png',
].concat([
  'css/app.css',
  'js/auth.js', 'js/api.js', 'js/menu.js', 'js/scoring.js', 'js/ui-time.js', 'js/ui-photo.js',
  'js/qsc-app.js', 'js/shopper-core.js', 'js/codes-app.js',
  'js/login-app.js', 'js/dashboard-app.js', 'js/store-app.js', 'js/accounts-app.js', 'js/admin-app.js',
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

  /* ★캐시를 먼저 보는 것은 딱 이 두 부류★ — 주소에 버전이 박힌 js/css(?v=N)와,
     내용이 바뀌지 않는 폰트·아이콘. 버전이 주소에 들어 있으니 캐시에 있는 사본은 곧
     '그 버전의 사본'이고, 새로 배포하면 VER이 올라 주소 자체가 달라진다 — 낡은 것을
     최신인 양 내줄 여지가 없다.
     ★fresh(화면·데이터)는 절대 넣지 않는다★. !fresh를 앞에 둔 것은 나중에 누가 json에
     ?v=N을 붙이더라도 화면·데이터가 이쪽으로 새지 않게 못을 박아두려는 것이다.
     data/master.json도 .json이라 fresh 쪽에 그대로 남는다(2026-08-13 '옛 화면이 굳는' 사고). */
  const cacheFirst = !fresh && (url.search.indexOf('v=') !== -1 ||
    url.pathname.indexOf('fonts/') !== -1 || url.pathname.indexOf('icons/') !== -1);

  function fromNetwork() {
    return (fresh ? fetch(url.href, { cache: 'reload' }) : fetch(e.request)).then(function (res) {
      /* ★성공한 응답만 담는다★ — 캐시 우선으로 바꾼 뒤로는, 배포가 퍼지는 틈에 한 번 받은
         404가 캐시에 눌러앉아 다음 VER 올림까지 계속 그대로 나간다. 안 담아두면
         다음 요청이 다시 네트워크로 가므로 전파가 끝나는 대로 저절로 복구된다. */
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      // 오프라인 — 마지막으로 받아둔 사본으로 실행
      return caches.match(e.request).then(function (m) {
        if (m) return m;
        /* ★사본이 없을 때 index.html로 떨어지는 것은 '화면 이동'에만 해당한다★
           종전에는 모든 요청에 index.html(HTML)을 200으로 돌려줬다. 그래서 v34→v35처럼
           버전이 바뀌는 날, 새 index.html은 네트워크에서 받았는데 js/auth.js?v=35는 아직
           캐시에 없는 기기가 스크립트 대신 HTML을 받아 문법 오류를 내고 Auth가 통째로
           사라졌다 — 하필 로그인 벽을 켜는 그날 가장 잘 나는 사고다.
           스크립트·스타일은 '없으면 없는 것'이 맞다. 그래야 화면이 구버전 대비 갈래
           (Auth 미로드 시 종전대로 진행)로 정상 동작한다. */
        if (e.request.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    });
  }

  e.respondWith(
    /* 캐시 조회 자체가 튕기는 기기(저장소 잠김·시크릿 창 등)에서 화면이 통째로 죽으면 안 되니
       조회 실패는 '사본 없음'으로 보고 네트워크로 넘긴다 — 그 경우 종전 동작 그대로가 된다. */
    cacheFirst
      ? caches.match(e.request).catch(function () { return null; })
        .then(function (m) { return m || fromNetwork(); })
      : fromNetwork()
  );
});
