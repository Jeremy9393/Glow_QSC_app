/* 세션 보관과 화면 조립.
   ★ localStorage의 t(토큰) 외 모든 필드는 화면 조립용 사본이며 서버 판정과 무관하다.
     사용자가 개발자도구로 role을 '관리자'로 고치면 카드는 늘어나지만, 서버는 토큰의 u로
     시트를 다시 읽으므로 데이터가 한 톨도 나오지 않는다. 화면 필터는 편의일 뿐 보안이 아니다.

   ★ 링크키(?k=)는 완전히 폐기됐다. 앱 주소를 회사 관련자 전원에게 공유하는 구조라,
     주소에 자격증명을 실어 나르는 방식이 애초에 성립하지 않는다. 이제 모든 계정은
     아이디(=통합시트 표시 매장명) + 비밀번호로 들어온다. 저장하는 자격증명은 하나도 없다.

   ★ 세션은 무기한이다 — 로그아웃을 누르기 전까지 유지된다. 서버가 exp를 10년 뒤로 끊어 주므로
     아래 만료 판정 코드는 사실상 타지 않지만, 토큰 형식과 검증 경로를 그대로 쓰기 위해 남겨 둔다.
     대신 강제 로그아웃 3수단이 안전장치의 전부다 —
       ① 비밀번호 변경 → credFingerprint가 바뀌어 그 계정의 모든 기기가 즉시 로그아웃
       ② 계정 상태 '중지'  → 그 계정 차단
       ③ 스크립트 속성 TOKEN_MINV +1 → 전원 강제 로그아웃
     셋 다 서버가 토큰을 거절하는 방식이라, 이 파일이 할 일은 '거절당하면 세션을 버리는 것'뿐이다. */

/* 이 파일은 api.js에 의존하지 않는다(항상 가장 먼저 로드된다).
   login.html은 api.js를 아예 싣지 않고 이 파일의 post()만으로 로그인을 끝낸다.
   단 서버 주소는 두 벌로 두면 이사할 때 한쪽만 고치는 사고가 나므로,
   호출 시점에 Api가 있으면 그쪽 CONFIG를 정본으로 쓰고 없을 때만 아래 상수를 쓴다.
   ─ '로드 순서 독립'과 '주소 단일 출처'를 둘 다 지키는 방법이 이것뿐이었다. */
const Auth = (function () {
  const SKEY = 'qsc-auth-v1';        // 세션(토큰 + 화면 조립용 사본). 앱이 보관하는 유일한 인증 흔적
  const EXP_SKEW = 60;               // 만료 60초 전부터 만료로 본다 (요청 도중 죽는 것을 막는다)

  const NHIDE = 'qsc-notice-hide';   // 사용자가 ✕로 닫은 공지 id (계약: 문구가 바뀌면 id가 달라져 다시 뜬다)
  const NLAST = 'qsc-notice-last';   // 마지막으로 받은 공지. 다음 진입에서 왕복을 기다리지 않고 바로 그리기 위한 사본
  /* 공지는 이 세 액션의 응답에만 실려 온다. 다른 액션 응답에 notice가 없다는 이유로
     배너를 내리면, notify.badge 한 번에 멀쩡한 공지가 사라진다.
     ★config.stores를 함께 적어 둔다★ — 로그인 벽을 켠 뒤 로그인 화면이 매장 목록을 받는
       경로가 config.get에서 config.stores로 바뀌었다. 여기에 안 적으면 공지가 실려 와도
       배너가 안 뜨고, 게다가 autoNotice가 같은 요청을 1.5초 뒤에 한 번 더 보낸다. */
  const NOTICE_ACTIONS = { 'auth.session': 1, 'config.get': 1, 'config.stores': 1 };

  // api.js가 없을 때만 쓰는 폴백 주소. 재배포는 '배포 관리 > 수정'으로 — 주소가 바뀌면 안 된다
  const FALLBACK_URL = 'https://script.google.com/macros/s/AKfycbyBwNdYNbvgw6R3d6tiqrYTURJnKrI0Jw-MZtZGlfJDegoUUMnzbOzrsbh-AscHT_xBiw/exec';

  /* ?next= 화이트리스트. 여기 없는 값은 전부 index.html로 떨어진다(오픈 리다이렉트 차단).
     login-app.js와 로그아웃 링크가 같은 목록을 봐야 하므로 여기 한 곳에만 둔다.
     ★accounts.html(계정 관리)을 빼먹으면 login.html?next=accounts.html이 조용히 홈으로 떨어져,
       관리자가 저녁에 매장 비밀번호를 풀어 주려고 눌렀을 때 엉뚱한 화면이 열린다. */
  const NEXT_OK = ['index.html', 'qsc.html', 'shopper.html', 'codes.html', 'dashboard.html', 'store.html', 'accounts.html'];

  let cache = undefined;   // 파싱 결과 메모이즈 (한 화면에서 수십 번 읽힌다)
  /* undefined = 아직 모른다 · null = 공지 없음 · 객체 = 표시할 공지.
     '없다'와 '아직 모른다'를 구분해야, 서버가 공지를 내렸을 때만 배너를 지울 수 있다. */
  let noticeNow = undefined;
  let noticeSeen = false;  // 이번 페이지 로드에서 서버 응답으로 공지를 확인했는가 (중복 왕복 방지)

  /* 마지막으로 확인한 점검 모드(MAINT) 문구. '' = 점검 중이 아니거나 아직 모른다.
     ★왜 auth.js가 기억해야 하는가★ — 점검 모드는 '거절당한 응답'에만 실려 온다. 그런데 관리자
       역할은 점검 중에도 통과하므로, 점검을 켠 담당자 본인 화면에는 아무 흔적이 남지 않는다.
       금요일 저녁에 켜고 잊으면 월요일 아침 26곳이 전부 멈춰 있는 동안 담당자 화면만 멀쩡하고,
       유일한 단서는 감사로그 한 줄이다. '켠 사람에게 가장 크게 보인다'가 이 스위치에 없었다.
     그래서 두 갈래로 줍는다 —
       ① 거절 응답의 문구(지금 바로 동작한다)
       ② 서버가 세션 응답에 maint 칸을 실어 주면 그 값(관리자에게도 보이게 되는 경로).
     여기 한 곳에 모아 두면 화면은 Auth.maint()만 읽으면 되고, 점검 여부를 물어보는
     추가 왕복도 사라진다(index.html이 sync 실패 뒤에 auth.session을 한 번 더 던지고 있었다). */
  let maintNow = '';

  function endpoint() {
    /* api.js는 `const Api = …`로 선언한다. 최상위 const는 window의 속성이 되지 않으므로
       window.Api로 보면 api.js가 실려 있어도 항상 undefined다(주소가 늘 폴백으로 떨어진다).
       지금은 두 주소가 같아 증상이 없지만, 배포 주소를 옮기는 날 로그인만 옛 주소로 간다. */
    try {
      if (typeof Api !== 'undefined' && Api && Api.CONFIG && Api.CONFIG.APPS_SCRIPT_URL) {
        return Api.CONFIG.APPS_SCRIPT_URL;
      }
    } catch (e) { /* api.js 미로드 — 폴백으로 */ }
    return FALLBACK_URL;
  }

  /* 아이디 정규화. 아이디는 통합시트 D열의 표시 매장명 그대로다 —
     한글과 공백이 들어 있고 대소문자 개념이 없다(그래서 toLowerCase를 절대 걸지 않는다.
     걸면 영문이 섞인 '스탠다드브레드 신세계강남점' 같은 이름이 시트 값과 어긋난다).
     ★NFC가 핵심이다★ — 맥·아이폰에서 붙여넣은 한글은 자모가 분리된 NFD로 들어와서
       눈으로는 똑같은데 문자열 비교가 실패한다. 매장 입장에서는 '분명히 맞게 쳤는데 안 됨'이 된다.
     서버도 반드시 같은 규칙으로 정규화해야 한다(계약: trim + 연속 공백 1칸 + NFC). */
  function normId(v) {
    v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    try { v = v.normalize('NFC'); } catch (e) { /* 구형 웹뷰 — 정규화 없이 그대로 */ }
    return v;
  }

  // ---------- 저장소 ----------
  /* 이 기기에 실제로 저장할 수 있는가. 사파리 사생활 모드·저장소 차단·용량 초과에서 거짓이 된다.
     ★있어야 하는 이유★ — session()은 예외를 삼키고 null을 돌려주므로, 화면에서는
       '로그아웃 상태'와 '저장소가 막혀서 알 수 없는 상태'가 똑같이 보인다. 그 둘을 같게 다루면 —
       ① 홈의 로그인 벽(LOGIN_GATE)은 v35에서 켜졌다. 이 판정이 없으면 로그인 화면으로 보내고
          → 로그인에 성공해도 세션을 남기지 못해 → 다시 로그인 화면으로 돌아오는 무한 왕복이 된다.
       ② qsc.html·shopper.html의 '부드러운 가드'가 제출 버튼을 잠근다. 두 파일의 주석은
          "알 수 없으면 절대 잠그지 않는다"고 약속하지만, token()이 예외를 던지지 않고 ''을
          돌려주기 때문에 실제로는 '로그아웃'으로 판정해 잠근다. 아이폰은 홈 화면에 설치하지
          않은 PWA의 저장소를 7일 미사용 시 지우는데, QSC 점검은 월 1회다 — 즉 점검자는 매달
          저장소가 비워진 상태로 매장에 도착한다. 지하 매장이면 그날 점검이 통째로 날아간다.
     ★가드는 이 함수가 false면 아무것도 잠그지 않는다★ (프론트 가드는 안내를 앞당기는 장치일
       뿐 보안이 아니다. 진짜 차단은 서버 AUTH_ENFORCE가 한다). */
  function storageOk() {
    try {
      localStorage.setItem('qsc-probe', '1');
      localStorage.removeItem('qsc-probe');
      return true;
    } catch (e) { return false; }
  }

  /* 세션이 이 기기에 '실제로 남았는가'. storageOk()와 목적이 다르다 —
     그쪽은 1바이트 probe라, 저장소가 거의 찬 기기에서는 참을 돌려주면서도
     정작 세션(수백 바이트)은 용량 초과로 못 쓰는 경우가 있다.
     ★이 함수가 필요한 이유★ — save()는 저장 실패를 삼키고 메모리 사본으로 계속한다.
       그 상태로 홈으로 넘어가면 페이지가 새로 로드되며 메모리 사본이 사라지고,
       세션이 없으니 로그인 벽이 다시 로그인 화면으로 보낸다 — 로그인은 매번 성공하는데
       화면만 왕복하는, 사용자가 원인을 절대 알 수 없는 상태가 된다.
       그래서 로그인 직후 '남았는지'를 눈으로 확인하고 안내할 수 있어야 한다.
     SKEY를 아는 곳을 이 파일 하나로 유지하려고 여기에 둔다(호출부가 키를 베끼지 않게). */
  function saved() {
    try {
      const s = session();
      if (!s || !s.t) return false;
      /* 키가 '있는지'가 아니라 '지금 들고 있는 토큰이 실제로 적혔는지'를 본다.
         용량 초과는 옛 기록을 지우지 않으므로, 키 존재만 보면 죽은 옛 세션을 보고
         "잘 저장됐다"고 답하게 된다. */
      const raw = JSON.parse(localStorage.getItem(SKEY) || 'null');
      return !!(raw && raw.t === s.t);
    } catch (e) { return false; }
  }

  function session() {
    if (cache !== undefined) return cache;
    try {
      const s = JSON.parse(localStorage.getItem(SKEY) || 'null');
      cache = (s && s.t) ? s : null;
    } catch (e) { cache = null; }
    return cache;
  }
  function save(r) {
    /* 서버 응답(auth.login·auth.setPassword)을 §12-4의 저장 형태로 옮겨 담는다.
       ★t를 r.token으로 통째로 덮지 않는다. auth.session 응답에는 token이 없어서
         그대로 쓰면 t가 undefined가 되고 JSON.stringify가 키를 버려 로그아웃된다
         (홈이 진입할 때마다 Auth.save(세션응답)을 부른다). 갱신 용도는 sync()가 정본이지만,
         호출부가 save()를 쓰더라도 토큰을 잃지 않도록 여기서 막아 둔다. */
    const prev = session();
    const s = {
      t: r.token || (prev && prev.t) || '',
      exp: r.exp || (r.token ? 0 : (prev && prev.exp) || 0),
      user: r.user || {},
      stores: r.stores || { all: false, list: [] },
      menus: r.menus || [],
      savedAt: Math.floor(Date.now() / 1000),
      skew: skewOf(r.serverTime, prev),
    };
    try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { /* 용량 초과 등 — 메모리 사본으로 계속 */ }
    cache = s;
    return s;
  }
  /* 세션을 버린다. 남겨 둘 자격증명이 없으므로 인자도 없다
     (종전에는 링크키를 남길지 말지를 인자로 받았다 — 링크키와 함께 사라졌다).
     ★호출부가 아직 clear(true)로 부르더라도 여분의 인자는 그냥 무시된다 — 동작은 같다. */
  function clear() {
    try { localStorage.removeItem(SKEY); } catch (e) { /* 무시 */ }
    cache = null;
  }

  /* 기기 시계와 서버 시계의 차이(초). 응답의 serverTime을 기준으로 잡는다.
     태블릿 시계가 하루 어긋나 있으면 exp를 로컬 시계와 비교하는 것만으로
     멀쩡한 토큰을 만료로 보거나(관리자가 매번 로그인 화면으로 감) 그 반대가 된다. */
  function skewOf(serverTime, prev) {
    const sv = Number(serverTime);
    // 서버가 안 줬으면 직전 보정값을 유지한다. 값이 터무니없으면(2020년 이전) 신뢰하지 않는다
    if (!sv || sv < 1600000000) return (prev && prev.skew) || 0;
    return sv - Math.floor(Date.now() / 1000);
  }
  function nowSec(s) {
    return Math.floor(Date.now() / 1000) + ((s && s.skew) || 0);
  }

  /* 무기한 세션이라 이 함수가 참을 돌려주는 일은 10년 뒤에나 생긴다.
     그래도 지우지 않는다 — 서버가 exp를 짧게 끊도록 정책을 되돌리는 날(사고 대응 등)
     클라이언트를 다시 손대지 않아도 되게 하기 위해서다. */
  function expired(s) {
    if (!s || !s.t) return true;
    if (!s.exp) return false;   // exp를 안 준 응답이면 서버 판정에 맡긴다
    return (s.exp - EXP_SKEW) <= nowSec(s);
  }

  // ---------- 서버 호출 (최소한만 — 본체는 api.js가 담당) ----------
  async function post(action, payload, token) {
    const body = { action: action, payload: payload || {} };
    if (token) body.token = token;
    /* 공지를 실어 오는 액션이 이미 날아갔다는 표시를 '응답'이 아니라 '요청' 시점에 남긴다.
       응답을 받고 나서 표시하면, 앱스 스크립트가 콜드 스타트로 2~3초 걸리는 동안
       autoNotice의 보조 왕복이 겹쳐 같은 요청을 두 번 보내게 된다. */
    if (NOTICE_ACTIONS[action]) noticeSeen = true;
    let text;
    try {
      // text/plain이어야 CORS 사전요청 없이 앱스 스크립트가 받는다. 토큰은 URL이 아니라 본문에만
      const res = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      text = await res.text();
    } catch (e) {
      // NETWORK는 서버가 주는 코드가 아니라 클라이언트 전용 코드다.
      // 이걸 SERVER_ERROR와 섞으면 오프라인인데 "서버 오류"라고 안내하게 된다
      return { ok: false, code: 'NETWORK', error: '네트워크에 연결할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.' };
    }
    let r;
    try { r = JSON.parse(text); } catch (e) {
      // 앱스 스크립트가 오류 HTML을 돌려주면 여기로 온다 — 그대로 두면 SyntaxError로 터진다
      return { ok: false, code: 'SERVER_ERROR', error: '서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    }
    /* 점검 문구 기억. 거절 응답에 실려 온 문구는 확실한 신호이고, ok 응답에 maint 칸이
       들어 있으면(서버가 세션 응답에 실어 주는 날) 그것이 정본이다.
       ★칸이 아예 없으면 손대지 않는다★ — '안 보냈다'를 '점검이 아니다'로 읽으면,
         점검 중에 통과한 관리자 화면에서 방금 주운 문구가 도로 지워진다.
         지금 서버는 이 칸을 보내지 않으므로 ①번 경로만 동작한다(종전과 같은 동작). */
    if (r && r.code === 'MAINT') maintNow = String(r.error || r.msg || '현재 점검 중입니다.');
    else if (r && r.ok && typeof r.maint === 'string') maintNow = r.maint;

    /* 공지 낚아채기. 화면마다 "응답에서 notice를 꺼내 배너를 그린다"를 반복하면 새 화면에서
       반드시 빠뜨리므로, 응답이 지나가는 이 한 곳에서 처리한다.
       ★ok일 때만 본다★ — 거절 응답(MAINT·AUTH_*)에는 notice가 없는데 그것을 '공지 없음'으로
         받아들이면, 토큰이 죽은 화면을 한 번 여는 것만으로 멀쩡한 공지가 사라진다. */
    if (NOTICE_ACTIONS[action] && r && r.ok) {
      rememberNotice(r.notice);
      whenReady(function () { mountNotice(); });
    }
    return r;
  }

  /* 아이디 + 비밀번호 로그인. 성공하면 세션까지 저장한다.
     정규화를 이 안에서 한 번 더 하는 이유: 호출부(로그인 화면·계정 관리 화면)가 늘어나도
     서버에 닿는 아이디 형태는 언제나 한 가지여야 하기 때문이다. */
  async function login(id, pw) {
    const r = await post('auth.login', { id: normId(id), pw: String(pw == null ? '' : pw) });
    if (r && r.ok && r.token) save(r);
    return r;
  }

  /* 세션이 살아 있으면 true.
     ★조용한 재로그인은 이제 존재하지 않는다★ — 저장해 둔 자격증명이 없기 때문이다.
       그래서 서버 왕복이 사라졌고 동시 호출 병합(inFlight)도 함께 지웠다.
       그래도 프라미스를 돌려준다 — 호출부가 전부 `await Auth.ensure()`로 쓰고 있다.
     화면 이동은 하지 않는다 — 어디로 보낼지는 화면이 정한다(점검 화면은 보내면 안 된다). */
  async function ensure() {
    const s = session();
    if (s && !expired(s)) return true;
    if (s) clear();       // 죽은 세션을 들고 있어 봐야 다음 요청도 같은 오류를 맞는다
    return false;
  }

  /* api.js가 AUTH_REQUIRED·AUTH_EXPIRED·AUTH_INVALID를 받았을 때 부르는 자리.
     ★재로그인 수단이 없는데도 함수를 지우지 않고 남긴다★ — api.js(js/api.js:59 relogin)가
       이 이름을 보고 '조용히 다시 들어갈 수 있는가'를 판정한다. 지우면 그 파일도 함께 고쳐야 하고,
       나중에 갱신 토큰 같은 수단이 생기면 되살릴 자리가 바로 여기다.
       판정을 auth.js 한 곳에 모아 두기 위해 빈 함수로 남긴다.
     세션은 버린다 — 서버가 방금 거절한 토큰이라, 남겨 두면 다음 화면도 같은 오류를 맞는다.
     여기서 login.html로 보내지는 않는다: 점검 작성 중에 화면을 갈아 끼우면
     그날 현장에서 적은 내용이 통째로 날아간다. 이동은 각 화면의 가드가 결정한다. */
  async function relogin() {
    clear();
    return false;
  }

  /* 시트에서 역할을 고치면 여기서 반영된다. 화면 진입 시 1회 부른다.
     실패해도 기존 세션을 버리지 않는다 — 오프라인에서 화면이 비는 편이 더 나쁘다
     (점검 모드 MAINT 응답도 여기서는 그냥 false다. 계정이 죽은 것이 아니다).

     ★maxAgeSec을 주면 그만큼 안에 받은 사본은 그냥 쓴다 (2026-08-16)★
     앱스 스크립트는 왕복 1회가 약 2초다 — 서버가 아무 일도 안 해도 1.5초다(실측).
     그런데 매장 사람이 홈에서 매장현황으로 넘어가는 30초 안에 이 값을 세 번 받는다:
     ①로그인 응답이 이미 세션 본문이고 ②홈이 한 번 ③매장현황이 또 한 번.
     ★사본이 낡아도 위험하지 않은 근거는 서버에 있다★ — 역할·범위 판정은 매 요청마다
       토큰으로 다시 하고(getAccount → acctToCtx → scopeOf), 담당 매장이 1곳인 계정은
       resolveTarget이 payload.store를 아예 읽지 않으며, 범위 밖 요청은 SCOPE_DENIED로 끊긴다.
       즉 이 사본은 '화면을 그리는 재료'일 뿐 권한의 근거가 아니다.
     인자를 안 주면 종전 그대로 매번 물어본다 — 부르는 쪽이 명시할 때만 건너뛴다. */
  async function sync(maxAgeSec) {
    const s = session();
    if (!s) return false;
    if (maxAgeSec) {
      const age = Math.floor(Date.now() / 1000) - (s.savedAt || 0);
      if (age >= 0 && age < maxAgeSec) {
        /* ★건너뛸 때 noticeSeen을 함께 세운다★ — 안 세우면 autoNotice가 1.5초 뒤에
           똑같은 auth.session을 한 번 더 보낸다(요청 수가 하나도 안 준다). 게다가 종전에는
           순차이던 두 요청이 동시 요청이 되어 아침 26곳 러시 때 동시 실행 한도만 갉아먹는다.
           공지는 mountNotice가 사본으로 이미 그리고, 홈은 인자 없이 sync하므로 늘 최신이다. */
        noticeSeen = true;
        return true;
      }
    }
    const r = await post('auth.session', null, s.t);
    if (!r || !r.ok) return false;
    s.user = r.user || s.user;
    s.stores = r.stores || s.stores;
    s.menus = r.menus || s.menus;
    s.savedAt = Math.floor(Date.now() / 1000);
    s.skew = skewOf(r.serverTime, s);   // 화면을 열 때마다 시계 보정을 다시 잡는다
    try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { /* 무시 */ }
    cache = s;
    return true;
  }

  // ---------- 권한 조회 (화면 조립용 — 보안 판정이 아니다) ----------
  function menuOf(key) {
    const s = session();
    if (!s || !s.menus) return null;
    for (let i = 0; i < s.menus.length; i++) {
      if (s.menus[i] && s.menus[i].key === key) return s.menus[i];
    }
    return null;
  }
  function hasMenu(key) {
    const m = menuOf(key);
    return !!(m && (m.read || m.write));
  }
  /* 저장된 메뉴 사본 전체. 홈이 서버 왕복 전에(그리고 오프라인에서는 계속) 카드를 거르는 데 쓴다.
     세션이 없으면 null — '권한이 0개'와 '아직 모른다'는 다르게 다뤄야 하기 때문이다. */
  function menus() {
    const s = session();
    return (s && s.menus) ? s.menus : null;
  }
  // act: '읽기' | '쓰기' (생략하면 읽기). 역할 이름은 여기서도 비교하지 않는다
  function can(menu, act) {
    const m = menuOf(menu);
    if (!m) return false;
    return act === '쓰기' ? !!m.write : !!m.read;
  }
  function stores() {
    const s = session();
    if (!s || !s.stores) return { all: false, list: [] };
    return { all: !!s.stores.all, list: s.stores.list || [] };
  }
  function user() {
    const s = session();
    return (s && s.user) ? s.user : null;
  }
  function token() {
    const s = session();
    return (s && s.t) ? s.t : '';
  }

  // ---------- 화면 이동 ----------
  function safeNext(v) {
    v = String(v == null ? '' : v).trim();
    for (let i = 0; i < NEXT_OK.length; i++) if (NEXT_OK[i] === v) return v;
    return 'index.html';
  }
  function here() {
    const f = location.pathname.split('/').pop() || 'index.html';
    return safeNext(f);
  }
  function loginUrl() {
    return 'login.html?next=' + encodeURIComponent(here());
  }
  /* 권한이 없는 화면에 들어왔을 때. ★빈 화면으로 두지 않는다★ —
     주소를 직접 치거나 옛 즐겨찾기로 들어오면 화면 뼈대만 남고 아무것도 안 뜨는데,
     매장 입장에서는 '앱이 고장났다'로 읽혀 그대로 문의가 온다. 왜 안 보이는지 말해 준다.
     ★alert()를 쓰지 않는다★ — 확인을 누르기 전까지 화면이 멈춰 있고, 그 뒤로 권한 없는
       화면의 표·버튼이 그대로 비쳐 보인다. 본문을 안내 한 줄로 갈아 끼우고 홈으로 보낸다.
     ★문구를 고르는 기준★ — '거부되었습니다' 같은 말을 쓰지 않는다. 잘못한 사람이 없는
       상황이고, 이 앱은 매장 직원이 보는 화면이다. 사실만 담담하게 적는다.
     이것은 안내를 앞당기는 장치일 뿐 보안이 아니다 — 진짜 차단은 서버 등록표(ACTIONS)와
     can()이 한다. 카드를 손으로 되살려도 데이터는 한 톨도 나오지 않는다. */
  function denyHome(msg) {
    const text = msg || '이 화면을 볼 수 있는 권한이 없습니다. 홈으로 이동합니다.';
    whenReady(function () {
      const host = document.querySelector('.wrap') || document.querySelector('.home') || document.body;
      host.textContent = '';                 // 뼈대를 지운다(상단바는 .wrap 밖이라 그대로 남는다)
      const p = document.createElement('p');
      p.className = 'note denyNote';
      p.textContent = text;                  // 호출부가 넘긴 문구도 사용자 데이터로 다룬다
      host.appendChild(p);
    });
    /* 읽을 틈을 준다. 즉시 replace하면 안내가 지나간 줄도 모르고 홈으로 튕긴 것처럼 보인다.
       replace라서 뒤로 가기로 이 화면에 다시 들어올 수도 없다. */
    setTimeout(function () { location.replace('index.html'); }, 1800);
    return false;
  }

  /* 화면 파일명 → 그 화면이 필요로 하는 메뉴 키.
     ★왜 화면이 아니라 여기서 정하는가★ — codes.html·accounts.html은 Auth.guard()를 인자
       없이 부르고 있어 '로그인했는가'만 본다. 특히 codes-app.js에는 권한 검사가 한 줄도
       없어서, 로그인한 매장 계정이 주소만 치면 제출 코드 관리 화면이 그대로 열린다
       (서버 데이터는 나가지 않지만, '매장 사람이 관리자 화면에 들어올 수 없어야 한다'는
       요구에는 정면으로 어긋난다). 화면마다 인자를 적어 넣는 것이 정석이지만 —
       적는 것을 잊는 화면이 반드시 하나 생기고, 그 하나가 이번 같은 구멍이 된다.
       주소가 곧 화면이므로 표를 여기 한 곳에 두면 새로 만드는 화면도 자동으로 보호된다.
     ★인자를 명시하면 언제나 그쪽이 이긴다★ — 화면이 자기 사정을 더 잘 안다(쓰기 권한 등).
     ★index.html·login.html은 일부러 넣지 않는다★ — 홈은 권한이 하나도 없는 계정에게도
       열려야 "아직 이용할 수 있는 화면이 없습니다" 안내를 볼 자리가 남는다.
     ★qsc.html·shopper.html도 일부러 넣지 않는다★ — 그 두 화면은 guard()를 아예 부르지
       않는 것이 설계다(리다이렉트 금지). 표에 적어 두면 언젠가 누가 guard()를 부르는 순간
       현장에서 작성 중이던 74문항이 통째로 날아간다. 적지 않는 것이 안전장치다. */
  const MENU_BY_PAGE = {
    'codes.html': 'codes',
    'dashboard.html': 'dashboard',
    'store.html': 'store',
    'accounts.html': 'accounts',
  };

  /* 리다이렉트형 가드. codes.html·dashboard.html·store.html·accounts.html 전용이다.
     qsc.html·shopper.html에서는 절대 쓰지 말 것 — 현장에서 작성 중인 내용이 날아간다.
     그 두 화면은 auth.js를 싣되(토큰을 붙여야 관리자 본인의 제출이 막히지 않는다)
     Auth.session()을 직접 보고 제출 버튼만 잠그는 '부드러운 가드'를 쓴다.

     menu를 넘기면 로그인 여부에 더해 '그 화면 권한이 있는가'까지 본다.
     ★인자를 생략하면 위 MENU_BY_PAGE에서 지금 화면의 키를 찾아 같은 검사를 한다★
       (표에 없는 화면 = 홈·로그인 = 종전과 똑같이 로그인 여부만 본다).
     act는 '읽기'|'쓰기'이며 생략하면 읽기다. 역할 이름은 여기서도 비교하지 않는다. */
  async function guard(menu, act) {
    const ok = await ensure();
    if (!ok) { location.replace(loginUrl()); return false; }
    /* hasOwnProperty로 감싼다 — 그냥 [ ]로 꺼내면 주소가 /toString·/constructor일 때
       프로토타입의 함수가 나와 can()에 엉뚱한 값이 들어간다(서버 actionSpec과 같은 규칙). */
    const page = location.pathname.split('/').pop() || '';
    const key = menu
      || (Object.prototype.hasOwnProperty.call(MENU_BY_PAGE, page) ? MENU_BY_PAGE[page] : '');
    /* ★menus()가 null이면 막지 않는다★ — '권한이 0개'와 '아직 모른다'는 다르다.
       사본을 못 읽었다는 이유로 담당자를 홈으로 튕기면, 저장소가 비워진 아이폰에서
       그날 점검이 통째로 막힌다. 모르면 통과시키고 판정은 서버에 맡긴다. */
    if (key && menus() && !can(key, act)) return denyHome();
    return true;
  }
  function logout() {
    clear();
    location.replace('login.html');
  }

  // ---------- 공지 배너 (서버 스크립트 속성 NOTICE) ----------
  /* ★점검 모드(MAINT)와 전혀 다른 것이다★
       MAINT = 요청을 '막는다'. 각 화면이 점선 앰버(.mockNote)로 "지금 멈춰 있다"를 알린다.
       NOTICE = 막지 않고 '알리기만' 한다. 그래서 경고색을 쓰지 않고 정보성 파랑(.noticeBar)이다.
     둘을 같은 모양으로 그리면 공지 한 줄에 "지금 앱이 막힌 건가요?" 하는 전화가 온다.
   ★이 파일에 두는 이유: auth.js는 survey.html을 뺀 모든 화면에 실린다. 화면마다 배너 코드를
     복사하면 다음에 만드는 화면에서 반드시 빠뜨린다. 여기 한 곳이면 전 화면에 적용된다. */

  function hiddenId() {
    try { return localStorage.getItem(NHIDE) || ''; } catch (e) { return ''; }
  }
  function hideId(id) {
    try { localStorage.setItem(NHIDE, id); } catch (e) { /* 사생활 모드 등 — 이번 화면에서만 닫힌다 */ }
  }
  /* 응답의 notice를 기억한다. 값이 없으면(=서버가 NOTICE를 비웠다) 사본까지 지운다 —
     남겨 두면 담당자가 공지를 내린 뒤에도 오프라인 기기에 옛 문구가 계속 뜬다.
     id·text가 둘 다 있어야 공지로 인정한다(빈 객체는 계약상 오지 않지만, 오면 빈 줄이 그려진다). */
  function rememberNotice(n) {
    const ok = n && n.id && n.text;
    noticeNow = ok ? { id: String(n.id), text: String(n.text) } : null;
    try {
      if (noticeNow) localStorage.setItem(NLAST, JSON.stringify(noticeNow));
      else localStorage.removeItem(NLAST);
    } catch (e) { /* 저장 못 해도 이번 화면 표시에는 지장이 없다 */ }
    return noticeNow;
  }
  /* 지금 보여 줄 공지. 서버 응답을 아직 못 받았으면 마지막으로 받아 둔 사본을 쓴다 —
     오프라인에서도 뜨고, 온라인이면 잠시 뒤 서버 응답으로 교체되거나 조용히 내려간다.
     사본을 안 쓰면 배너가 1~2초 뒤에 끼어들며 화면이 아래로 밀려, 그때 누르던 버튼이 어긋난다. */
  function notice() {
    if (noticeNow !== undefined) return noticeNow;
    try { noticeNow = JSON.parse(localStorage.getItem(NLAST) || 'null'); } catch (e) { noticeNow = null; }
    return noticeNow;
  }

  /* 배너를 그린다(없으면 지운다). 인자는 둘 다 생략할 수 있고, 컨테이너 하나만 넘겨도 된다.
     같은 공지를 두 번 그리지 않으므로 몇 번을 불러도 안전하다.
     ★n을 생략하거나 null로 주면 '공지를 지우라'가 아니라 '마지막으로 받은 공지를 쓰라'는 뜻이다.
       서버가 NOTICE를 비운 것을 반영하는 일은 응답이 post()를 지나갈 때 자동으로 처리되므로,
       화면에서 배너를 내리려고 이 함수를 부를 일은 없다. */
  function mountNotice(n, container) {
    if (n && n.nodeType) { container = n; n = null; }   // mountNotice(container) 형태 지원
    const info = n || notice();
    const old = document.getElementById('noticeBar');
    const id = (info && info.id) ? String(info.id) : '';
    const text = (info && info.text) ? String(info.text) : '';
    // 공지가 없거나, 사용자가 이미 ✕로 닫은 문구면 배너를 두지 않는다
    if (!id || !text || hiddenId() === id) { if (old) old.remove(); return null; }
    if (old && old.getAttribute('data-nid') === id) return old;   // 같은 공지는 다시 그리지 않는다
    if (old) old.remove();

    const bar = document.createElement('div');
    bar.className = 'noticeBar';
    bar.id = 'noticeBar';
    bar.setAttribute('data-nid', id);

    const t = document.createElement('span');
    t.className = 'nbText';
    t.textContent = text;              // 시트에서 온 문구다 — 반드시 textContent

    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'nbClose';
    x.setAttribute('aria-label', '공지 닫기');
    x.textContent = '✕';
    /* 닫은 id만 기억한다. 문구를 고치면 서버가 새 id(문구 SHA-256 앞 6자)를 주므로
       닫아 둔 사람에게도 자동으로 다시 뜬다 — 담당자가 따로 해제할 일이 없다. */
    x.onclick = function () { hideId(id); bar.remove(); };

    bar.appendChild(t);
    bar.appendChild(x);

    /* 자리: 지정한 컨테이너 > 본문 맨 위(.wrap) > 홈·로그인의 브랜드 문구 아래(.home).
       ★단, 점검 안내(#maintNote)가 있으면 그 아래에 둔다★ — MAINT는 '지금 막혔다'라
         가장 먼저 읽혀야 하고, 공지는 그다음이다. 평소 #maintNote는 숨어 있어 자리를 먹지 않는다. */
    function put(host, fallback) {
      let after = host.querySelector('#maintNote') || fallback;
      /* ★insertBefore는 기준 노드가 host의 '직계 자식'이 아니면 예외를 던진다.
         지금은 index·dashboard·store 모두 #maintNote가 직계 자식이지만, 새 화면에서
         점검 안내를 카드 안에 넣는 순간 배너가 아니라 화면 스크립트 전체가 거기서 멈춘다.
         공지 하나 때문에 화면이 죽는 것은 어떤 경우에도 남는 장사가 아니다. */
      if (after && after.parentNode !== host) after = null;
      host.insertBefore(bar, after ? after.nextSibling : host.firstChild);
      return bar;
    }
    const wrap = container || document.querySelector('.wrap');
    if (wrap) return put(wrap, null);
    const home = document.querySelector('.home');
    if (home) return put(home, home.querySelector('.homeSub'));
    document.body.insertBefore(bar, document.body.firstChild);
    return bar;
  }

  /* 화면이 열릴 때 자동으로 한 번.
     ① 사본이 있으면 즉시 그린다(왕복 0회).
     ② 이번 로드에서 공지를 실어 오는 액션의 응답을 아직 못 봤을 때만 가볍게 한 번 물어본다.
        홈·로그인·매장현황은 이미 그런 액션을 부르므로 여기서 왕복이 늘지 않고,
        나머지 화면(점검·쇼퍼·전체 대시보드·계정)만 요청 하나가 는다.
     실패는 전부 무시한다 — 공지가 안 뜨는 것과 화면이 안 열리는 것은 비교할 일이 아니다. */
  function autoNotice() {
    mountNotice();
    setTimeout(function () {
      if (noticeSeen) return;
      if (navigator.onLine === false) return;   // 오프라인이면 실패할 왕복을 만들지 않는다
      const t = token();
      /* 토큰이 있으면 가벼운 auth.session, 없으면 익명으로 통과하는 config.stores.
         ★config.get이 아니다★ — 그쪽은 서버 등록표에서 legacy라 AUTH_ENFORCE='on'이면
           토큰 없이는 거절된다. 로그인 벽을 켠 지금, 토큰이 없는 화면에서 config.get을
           부르면 응답에 notice가 실리지 않아 로그인 화면에서 공지가 영영 안 뜬다.
           config.stores는 anon이라 인증과 무관하게 통과하고 공지를 함께 실어 준다. */
      post(t ? 'auth.session' : 'config.stores', {}, t);
    }, 1500);
  }

  /* 지금까지 확인한 점검 문구('' = 점검 아님/모름).
     화면은 이 값을 '표시'에만 쓴다 — 점검 여부의 판정은 언제나 서버가 하고, 여기 값은
     방금 지나간 응답의 사본일 뿐이다. 캐시하지 않는 이유도 같다(다음 로드에서 다시 확인한다). */
  function maint() { return maintNow; }

  // DOM이 준비된 뒤에 부른다. 인자를 넘기지 않는다 — 이벤트 객체가 함수의 첫 인자로 새는 것을 막는다
  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { fn(); });
    else fn();
  }

  /* topbar 로그아웃 주입.
     세션이 있을 때만 붙인다 — AUTH_ENFORCE=off인 동안 로그인 없이 쓰는 화면에
     의미 없는 로그아웃 버튼이 뜨면 "눌러도 되나" 하는 문의가 생긴다. */
  function mountLogout() {
    const bar = document.querySelector('.topbar');
    if (!bar || document.getElementById('authOut')) return;
    if (!session()) return;
    const b = document.createElement('button');
    b.id = 'authOut';
    b.type = 'button';
    b.className = 'resetBtn';
    b.textContent = '로그아웃';
    b.onclick = function () { if (confirm('로그아웃하시겠습니까?')) logout(); };
    bar.appendChild(b);
  }
  /* 뒤로가기.
     ★상단바의 ←만으로는 부족하다★ — QSC 점검은 74문항, 매장현황은 개선요청 건수만큼 길어서
       뒤로 가려면 맨 위까지 스크롤해 올라가야 한다. 그래서 본문 맨 아래에도 같은 버튼을 둔다.
     ★href가 아니라 실제 방문 기록으로 돌아간다★ — 매장현황은 전체 대시보드에서도, 홈에서도
       들어온다. href를 박아 두면 홈에서 들어온 사람이 대시보드로 튕긴다.
       온 곳으로 돌려보내는 것이 맞다.
       단 로그인 화면에서 온 경우는 예외다(돌아가면 다시 홈으로 튕겨 제자리다). */

  /* 실제로 돌아갈 곳이 있는가. 두 조건을 모두 본다 —
       ① 직전 화면이 같은 출처의 다른 화면일 것(로그인 화면과 지금 이 화면은 제외)
       ② 기록이 실제로 쌓여 있을 것
     ★홈·로그인에서 이 판정이 특히 중요하다★ — 그 두 화면에는 돌려보낼 fallback이 없다.
       홈에서 index.html로 보내면 제자리이고, 로그인에서 홈으로 보내면 벽에 다시 튕긴다.
       그래서 이 함수가 거짓이면 버튼을 아예 그리지 않는다(눌러도 아무 일 없는 버튼이 최악이다). */
  function canGoBack() {
    const ref = document.referrer || '';
    const inside = ref.indexOf(location.origin) === 0 && ref.indexOf('login.html') < 0
      && ref.split('#')[0] !== location.href.split('#')[0];
    return inside && history.length > 1;
  }
  function goBack(fallback) {
    if (canGoBack()) { history.back(); return; }
    /* fallback이 없으면(홈·로그인) 아무 데도 보내지 않는다. 버튼을 그린 뒤에 기록이
       사라지는 경우(bfcache 복원 등)가 있어 이 갈래가 필요하다 — 그때 index.html로
       보내 버리면 로그인 화면에서 누른 사람이 벽에 튕겨 다시 로그인 화면으로 돌아온다. */
    if (fallback) location.href = fallback;
  }

  /* 상단바가 없는 화면(홈·로그인)에 왼쪽 위 화살표만 얹는다.
     ★큰 버튼을 따로 만들지 않는다★ — 사용자가 원한 것은 '왼쪽 상단의 작은 화살표'다.
       본문에 전폭 버튼을 넣으면 화면마다 덩어리가 하나씩 늘고, 눌러야 할 것이 많아 보인다. */
  function floatBack() {
    if (document.getElementById('backFloat')) return;
    const b = document.createElement('button');
    b.id = 'backFloat';
    b.type = 'button';
    b.className = 'backFloat';
    b.textContent = '←';
    b.setAttribute('aria-label', '뒤로');
    b.onclick = function () { goBack(''); };
    document.body.appendChild(b);
  }

  /* 뒤로가기는 왼쪽 위 화살표 하나로 끝낸다.
     상단바가 있는 화면은 이미 그 자리에 ←가 있으므로 동작만 바꿔 주고(주소 대신 방문 기록),
     상단바가 없는 화면(홈·로그인)에는 같은 자리에 떠 있는 화살표를 얹는다. */
  function mountBack() {
    const top = document.querySelector('.topbar .back');
    if (top) {
      const fallback = top.getAttribute('href') || 'index.html';
      top.onclick = function (e) { e.preventDefault(); goBack(fallback); };
      return;
    }
    /* 홈·로그인은 '돌아갈 곳'이 정해져 있지 않으므로 방문 기록만 쓴다.
       기록이 없으면 그리지 않는다 — 눌러도 아무 일이 없는 화살표는 없는 편이 낫다. */
    if (!canGoBack()) return;
    /* 로그아웃 상태의 로그인 화면에서는 돌아가 봐야 로그인 벽에 다시 튕겨 제자리다. */
    if ((location.pathname.split('/').pop() || '') === 'login.html' && !session()) return;
    floatBack();
  }

  whenReady(function () { mountLogout(); mountBack(); autoNotice(); });

  return {
    NEXT_OK: NEXT_OK,
    normId: normId,
    session: session, save: save, clear: clear, storageOk: storageOk, saved: saved,
    token: token, user: user, stores: stores,
    can: can, hasMenu: hasMenu, menus: menus,
    ensure: ensure, relogin: relogin, guard: guard, denyHome: denyHome, sync: sync, logout: logout,
    login: login, post: post, endpoint: endpoint,
    safeNext: safeNext, loginUrl: loginUrl, mountLogout: mountLogout, mountBack: mountBack,
    canGoBack: canGoBack, goBack: goBack,
    notice: notice, mountNotice: mountNotice, maint: maint,
  };
})();

/* ══════════════════════════════════════════════════════════════
   ★앱 버전·배포 날짜★ (2026-08-27 담당자 요청) — 홈·로그인 화면 맨 아래에 적는다.

   "앱 화면 제일 하단에 버전정보 및 업데이트 날짜 표기"

   ★손으로 적는 자리를 만들지 않는다★ — 손으로 적는 버전은 반드시 낡는다.
     · 버전 숫자: 이 파일이 불러와진 주소(js/auth.js?v=83)에서 뽑는다.
       그 숫자는 tools/release.py 가 배포마다 자동으로 올리는 값이고,
       ★지금 이 화면이 실제로 불러온 것★ 이라 캐시에 묶인 폰은 옛 숫자를 보여 준다 —
       매장이 낡은 화면을 붙들고 있는지 그 자리에서 알 수 있다.
     · 날짜: 아래 BUILT 한 줄. release.py 가 배포할 때마다 다시 적는다.

   ⚠document.currentScript 는 ★스크립트를 읽는 그 순간에만★ 살아 있다.
     DOMContentLoaded 콜백 안에서 꺼내면 null 이라 TypeError 가 난다.
     그래서 여기서 지금 붙잡아 둔다.
   ══════════════════════════════════════════════════════════════ */
var BUILT = '2026-08-27';   /* release.py 가 고쳐 쓴다 — 손으로 고치지 말 것 */
(function () {
  var ver = '';
  try {
    var me = document.currentScript && document.currentScript.src;
    var m = me && me.match(/[?&]v=(\d+)/);
    if (m) ver = 'v' + m[1];
  } catch (e) { /* 못 읽어도 화면은 그대로 뜬다 */ }

  function stamp() {
    try {
      var box = document.querySelector('.homeFoot');
      if (!box) return;                       // 홈·로그인 말고는 이 칸이 없다
      if (box.querySelector('.buildStamp')) return;
      var d = document.createElement('div');
      d.className = 'buildStamp';
      d.style.cssText = 'margin-top:6px;font-size:11px;opacity:.55';
      d.textContent = '앱 ' + (ver || '버전 미상') + ' · ' + BUILT;
      box.appendChild(d);
    } catch (e) { /* 이 표시가 화면을 깨뜨리면 안 된다 */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stamp);
  else stamp();
})();
