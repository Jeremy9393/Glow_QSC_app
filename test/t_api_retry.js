
global.window = {};
let sent = [];
let queue = [];
global.fetch = async function (url, init) {
  sent.push(JSON.parse(init.body));
  const next = queue.shift();
  if (!next) throw new Error('보낼 답이 없습니다 — 요청이 예상보다 많습니다');
  if (next.offline) throw new Error('offline');
  return { text: async function () { return next.body; } };
};
global.localStorage = { getItem: function () { return null; }, setItem: function () { } };
const HTML = '<!DOCTYPE html><html><body>페이지를 찾을 수 없음</body></html>';
/* 저장 연동 계층.
   APPS_SCRIPT_URL이 비어 있으면 모의 저장(브라우저 localStorage) — 개발·데모용.
   구글 앱스 스크립트 배포 후 URL을 넣으면 실제 스프레드시트/드라이브에 저장된다.

   ★이 파일은 auth.js에 의존하지 않는다(있으면 쓰고, 없어도 그대로 돈다).
     survey.html에는 auth.js를 싣지 않으므로(익명 진입이 설계다) 전역 Auth가 '없는 것이 정상'인
     화면이 여전히 남아 있다. Auth가 없으면 토큰 없이 옛 봉투로 보내고,
     서버는 AUTH_ENFORCE=off인 동안 종전처럼 받는다.
     qsc.html·shopper.html은 이제 auth.js를 싣는다 — 다만 '부드러운 가드'라 로그인 화면으로
     보내지 않고 제출 버튼만 잠근다. 지하 매장에서 작성 중인 내용이 날아가는 것이 가장 비싼 사고다. */
const Api = (function () {
  const CONFIG = {
    // 개인 계정(tlsanstn93) 앱스 스크립트 'QSC 앱 백엔드' 웹앱 · 2026-08-15 배포
    // ⚠재배포는 '새 배포'가 아니라 '배포 관리 > 수정'으로 — 새 배포를 누르면 이 주소가 바뀐다
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyBwNdYNbvgw6R3d6tiqrYTURJnKrI0Jw-MZtZGlfJDegoUUMnzbOzrsbh-AscHT_xBiw/exec',
  };

  // 프론트는 한국어 문구가 아니라 이 상수로만 분기한다 (문구는 언제든 바뀐다)
  const AUTH_CODES = { AUTH_REQUIRED: 1, AUTH_EXPIRED: 1, AUTH_INVALID: 1 };

  function photoCount(payload) {
    if (!payload.items) return 0;
    return payload.items.reduce(function (a, it) { return a + (it.photos ? it.photos.length : 0); }, 0);
  }

  /* 멱등키. crypto.randomUUID는 보안 컨텍스트(https)에서만 존재하므로 단계적으로 내려간다.
     맨 아래 폴백에서만 Math.random을 쓰는데, reqId는 '충돌만 안 하면 되는' 값이지
     자격증명·토큰이 아니다(자격증명 생성에 Math.random을 쓰는 것은 설계 위반). */
  function newReqId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* 구형 웹뷰 */ }
    try {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      let s = '';
      for (let i = 0; i < 16; i++) s += ('0' + a[i].toString(16)).slice(-2);
      return s;
    } catch (e) { /* getRandomValues도 없는 환경 */ }
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  }

  // 토큰은 auth.js가 보관한다. auth.js를 싣지 않는 화면(survey.html)에서는 조용히 null.
  function token() {
    try {
      if (typeof Auth !== 'undefined' && Auth && typeof Auth.token === 'function') return Auth.token() || null;
    } catch (e) { /* auth.js 미로드 */ }
    return null;
  }

  /* 토큰이 죽었을 때의 조용한 재로그인. 성공하면 true.
     ★아이디+비밀번호 방식으로 바뀌면서 앱이 스스로 다시 로그인할 재료가 사라졌다 —
       비밀번호 원문을 저장하지 않는 것이 원칙이라 저장해 둔 자격증명이 아예 없다.
       그래서 이 함수는 사실상 항상 false이고, 호출부는 서버 오류를 그대로 화면에 돌려준다.
       (세션 유효기간이 10년이라 이 경로 자체가 거의 밟히지 않는다. 밟힌다면
        비밀번호 변경·계정 중지·TOKEN_MINV 인상 — 셋 다 '다시 로그인해야 하는 것이 맞는' 상황이다.)
     ★그래도 Auth.relogin()을 계속 부르는 이유: '재로그인 가능한가'의 판정을 auth.js 한 곳에만
       두기 위해서다. 나중에 갱신 토큰 같은 수단이 생겨도 이 파일은 고칠 것이 없다.
     ★Auth.ensure()로 대신하면 안 된다. ensure()는 '만료 전 세션'이면 즉시 true를 돌려주므로,
       서버가 방금 거절한 그 토큰을 다시 보내 같은 오류만 한 번 더 받는다. */
  async function relogin() {
    try {
      if (typeof Auth === 'undefined' || !Auth || typeof Auth.relogin !== 'function') return false;
      return !!(await Auth.relogin());
    } catch (e) { return false; }
  }

  /* 앱스 스크립트는 오류가 나면 JSON이 아니라 HTML 오류 페이지를 돌려준다.
     res.json()을 바로 부르면 SyntaxError로 터져 사용자에게는 원인 불명의 '네트워크 오류'로만 보인다.
     그래서 항상 text로 받아 직접 파싱한다. */
  async function post(body) {
    // text/plain으로 보내면 CORS 사전요청 없이 앱스 스크립트가 받을 수 있음.
    // 그래서 토큰을 Authorization 같은 커스텀 헤더에 실을 수 없고 본문에만 넣는다.
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      /* _unparsed — '서버가 준 오류'가 아니라 '응답을 못 읽었다'는 표식. 아래 call()이 조회만
         한 번 더 묻는 근거로 쓴다. 서버가 JSON으로 보낸 SERVER_ERROR와 섞으면 안 된다. */
      return { ok: false, code: 'SERVER_ERROR', _unparsed: true, error: '서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    }
  }

  /* ★깨진 응답이면 조회만 한 번 더 묻는다★ (2026-09-15 담당자 선택)
     사무실 PC 에서 구글이 JSON 대신 안내 페이지(404)를 주는 일이 잦다 — 연결·암호화는 빠른데
     답을 주는 단계에서 10~27초 기다리다 404가 온다(현재상황.md ㉑). 새로고침하면 대개 되므로
     그 한 번을 앱이 대신한다.
     ★쓰기는 절대 넣지 않는다★ — 제출·저장·확정이 두 번 들어가면 점수가 두 벌이 된다.
       응답을 못 읽었을 뿐 서버는 이미 처리했을 수 있다(그래서 목록에 적힌 조회만 다시 묻는다).
     ★목록에 없으면 재시도가 없을 뿐이다★ — 새 조회 액션을 만들면 여기에 적어 주는 편이 좋지만,
       빠뜨려도 종전과 같게 동작한다(안전한 쪽으로 실패한다). */
  const READ_ACTIONS = {
    'auth.session': 1, 'config.get': 1, 'dashboard.get': 1, 'store.get': 1,
    'notify.badge': 1, 'notify.admin': 1, 'qsc.status': 1, 'shopper.status': 1,
    'codes.list': 1, 'account.list': 1, 'admin.maint': 1,
  };
  const REREAD_MS = 700;    // 곧바로 다시 물으면 같은 답을 받기 쉽다 — 한 박자 쉰다

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* 단일 POST 창구.
     opts.legacyType — 토큰이 없을 때 보낼 옛 봉투의 type. 이것이 있으면 미로그인 상태에서도
       종전 경로(AUTH_ENFORCE=off)로 그대로 제출된다. 9월 실업무를 지금과 똑같이 굴리기 위한 장치다.
     opts.reqId — 재시도 시 같은 멱등키를 물려주기 위해 쓴다. */
  async function call(action, payload, opts) {
    opts = opts || {};
    if (!CONFIG.APPS_SCRIPT_URL) {
      return { ok: false, code: 'SERVER_ERROR', error: '서버 주소가 설정되지 않았습니다.' };
    }
    const t = token();
    const reqId = opts.reqId || newReqId();
    const body = { reqId: reqId, payload: payload || {} };
    if (t) { body.action = action; body.token = t; }
    else if (opts.legacyType) { body.type = opts.legacyType; }
    else { body.action = action; }

    let data;
    try {
      data = await post(body);
    } catch (err) {
      // 오프라인·DNS 실패 등. 던지지 않고 코드로 돌려줘 화면이 분기할 수 있게 한다.
      return { ok: false, code: 'NETWORK', error: '네트워크에 연결할 수 없습니다. 연결을 확인한 뒤 다시 시도해 주세요.', _err: err };
    }
    /* 응답을 못 읽었고(_unparsed) 조회라면 딱 한 번 조용히 다시 묻는다 — 위 READ_ACTIONS 주석.
       ★화면에는 아무 말도 하지 않는다★ — 이미 '불러오는 중' 덮개가 떠 있고, 두 번째도 실패하면
       종전과 똑같은 오류가 그대로 화면에 간다. */
    /* admin.maint 는 조회(빈 payload)와 켜기·끄기(on/off)를 한 이름으로 쓴다 — ★켜기·끄기는 쓰기라 다시 보내지 않는다★ (2026-09-17) */
    const isMaintWrite = action === 'admin.maint' && payload && (payload.on || payload.off);
    if (data && data._unparsed && !opts._reread && READ_ACTIONS[action] && !isMaintWrite) {
      await sleep(REREAD_MS);
      return call(action, payload, {
        reqId: reqId, legacyType: opts.legacyType, _retried: opts._retried, _reread: true,
      });
    }
    /* 점검 모드(공사중) 판정은 maint.js 한 곳에 맡긴다 — 응답을 보여만 주고 흐름은 바꾸지 않는다.
       ★MAINT면 화면 전체가 덮이고, ok면 덮개가 걷힌다.★ maint.js가 없어도(구버전 캐시 등)
       그냥 지나가야 하므로 존재를 확인하고 부른다. */
    try { if (window.Maint) window.Maint.saw(data); } catch (e) { /* 덮개 실패가 요청을 깨면 안 된다 */ }

    /* 여기서 가로채는 것은 AUTH_* 세 코드뿐이다.
       MAINT(점검 모드)·LOCKED·FORBIDDEN 등 나머지 코드는 손대지 않고 그대로 호출부로 넘긴다 —
       점검 모드 안내 문구는 서버가 정하고 화면이 그대로 보여 주는 것이 설계다. */
    if (!data || data.ok || !AUTH_CODES[data.code] || opts._retried) return data;

    // 토큰이 죽었다. 되살릴 수단이 있을 때만 조용히 재로그인하고 원래 요청을 딱 1회 재시도한다.
    // 되살릴 수 없으면 서버 오류를 그대로 돌려준다 — 이 파일은 절대 화면을 옮기지 않는다
    // (점검 화면이 로그인 화면으로 튕기면 작성 중이던 내용이 통째로 날아간다).
    if (!(await relogin())) return data;
    // 같은 reqId를 물려준다 — 인증 실패는 서버 게이트 5단계라 멱등 마커가 찍히기 전이고,
    // 혹시 찍혔더라도 서버가 중복으로 처리하지 않는다.
    return call(action, payload, { reqId: reqId, legacyType: opts.legacyType, _retried: true });
  }

  /* 기존 호출부(js/qsc-app.js:381 · js/shopper-core.js:347)를 한 줄도 고치지 않기 위한 래퍼.
     ★NETWORK만 예외를 다시 던진다 — 두 호출부가 catch에서 "네트워크 연결을 확인해 주세요"를
       띄우고 있어, 여기서 조용히 객체로 돌려주면 그 안내 문구가 사라진다. */
  async function submit(type, payload) {
    /* ★고객 설문은 'shopper'가 아니라 'survey'로 보낸다.
       js/shopper-core.js 한 파일이 관리자 평가표(shopper.html)와 고객 설문(survey.html)을 함께
       그리는데, 제출할 때는 두 화면 모두 type:'shopper'로 부른다. 그대로 보내면
       서버가 입력경로를 '고객 직접'이 아니라 '관리자 입력'으로 적고, 그 결과
         · 고객 응답이 공식 CS 월 평균에 그대로 합산되고(종합점수의 30%),
         · 고객이 한 건만 넣어도 그 매장이 '쇼퍼 제출 완료'로 잡혀 독촉이 누락된다.
       판정 재료는 이미 payload 안에 있다 — shopper-core.js가 source에 'admin'/'customer'를 싣는다.
       ★호출부가 나중에 type:'survey'로 고쳐져도 이 줄은 아무 일도 하지 않는다(두 번 걸려도 결과가 같다).
       ★여기(맨 위)에 두는 이유: 아래 모의 저장 키('qsc-mock-'+type)도 같은 이름으로 갈라져야
         연동 전 테스트에서 관리자 평가표와 고객 설문이 한 통에 섞이지 않는다. */
    if (type === 'shopper' && payload && payload.source === 'customer') type = 'survey';

    if (!CONFIG.APPS_SCRIPT_URL) {
      const key = 'qsc-mock-' + type;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      const copy = JSON.parse(JSON.stringify(payload));
      if (copy.items) copy.items.forEach(function (it) { if (it.photos) it.photos = it.photos.length; });
      copy._savedAt = new Date().toISOString();
      list.push(copy);
      localStorage.setItem(key, JSON.stringify(list));
      return { ok: true, mock: true, count: list.length, photos: photoCount(payload) };
    }
    /* ★survey(고객 직접 설문)만 옛 봉투를 붙이지 않는다.
       survey.submit은 서버 등록표에서 anon:true라 토큰 없이 action만으로 도달하고,
       그 경로로 들어가야 시트 '입력경로'가 '고객 직접'으로 기록되어 공식 CS 평균과 격리된다.
       여기서 legacyType:'survey'를 붙이면 서버 별칭표에 'survey'가 없어 BAD_REQUEST가 나거나,
       별칭이 생기더라도 익명 응답이 '관리자 입력'으로 섞여 들어간다. */
    const r = await call(type + '.submit', payload, type === 'survey' ? {} : { legacyType: type });
    if (r && r.code === 'NETWORK' && r._err) throw r._err;
    return r;
  }

  /* ★'이번 달에 이미 있습니다' 안내를 한 곳에서 그린다★ (2026-08-26)
     QSC 점검과 미스터리쇼퍼가 같은 말을 해야 사람이 헷갈리지 않는다.
     el 은 안내를 담을 요소, action 은 'qsc.status' 또는 'shopper.status'.
     ★조용히 실패한다★ — 이건 편의 안내이고 판정은 제출 때 서버가 한다.
       못 물어봤다고 경고창을 띄우면, 할 수 있는 조치가 없는데 작성만 끊긴다. */
  function watchDup(el, action, getStore, getDate) {
    if (!el) return function () { };
    let timer = null;
    let last = '';
    let seq = 0;
    function paint(list) {
      if (!list || !list.length) { el.textContent = ''; el.style.display = 'none'; return; }
      const lines = list.map(function (e) {
        return '   · ' + e.date + (e.time ? ' ' + e.time : '') +
          (e.route ? ' · ' + e.route : '') + (e.who ? ' · ' + e.who : '') +
          (typeof e.score === 'number' ? ' · ' + e.score.toFixed(1) + '점' : '');
      });
      // 서버 문자열이라 textContent로만 넣는다 (이 앱의 XSS 방어 관례)
      el.textContent = '이 매장은 이번 달에 이미 제출된 기록이 ' + list.length + '건 있습니다.\n' +
        lines.join('\n') +
        '\n계속 작성하시면 제출할 때 덮어쓸지 여쭤봅니다. 다른 매장이라면 지금 바꿔 주세요.';
      el.style.display = '';
    }
    function ask() {
      const store = (getStore() || '').trim();
      const date = (getDate() || '').trim();
      const key = store + '|' + date.slice(0, 7);
      if (!store || !date) { last = ''; paint(null); return; }
      if (key === last) return;         // 같은 매장·같은 달이면 다시 묻지 않는다
      last = key;
      const my = ++seq;
      call(action, { store: store, date: date }).then(function (r) {
        if (my !== seq) return;         // 늦게 온 답이 새 선택을 덮지 않게
        if (r && r.ok) paint(r.existing);
      }).catch(function () { /* 안내는 없어도 된다 — 판정은 제출 때 서버가 한다 */ });
    }
    /* 날짜 입력은 한 글자마다 이벤트가 온다. 조금 기다렸다 묻는다(분당 요청 상한도 지킨다). */
    return function () { clearTimeout(timer); timer = setTimeout(ask, 400); };
  }

  /* ★재제출 되묻기 문구는 한 곳에만 둔다★ — QSC 점검과 미스터리쇼퍼가 같은 말을 해야
     사람이 헷갈리지 않는다(서버 규칙도 하나다). true면 '덮어쓴다'는 뜻이다.
     ★매장 확인을 먼저 권한다★ — '덮어쓸까요?'만 물으면 사람은 읽지 않고 예를 누른다.
       이 창이 막으려는 사고 1번이 '매장을 잘못 골랐다'이므로, 그 말이 맨 앞에 와야 한다. */
  function askOverwrite(store, existing, storeWrote) {
    const rows = (existing || []).map(function (e) {
      return '   · ' + e.date + (e.time ? ' ' + e.time : '') +
        (e.route ? ' · ' + e.route : '') +
        (e.who ? ' · ' + e.who : '') +
        (typeof e.score === 'number' ? ' · ' + e.score.toFixed(1) + '점' : '');
    });
    /* ★매장이 이미 적은 답이 있으면 그 줄을 반드시 넣는다★ (2026-08-27)
       덮어쓰면 그것도 함께 지워진다 — 모르고 누르면 매장의 노동이 조용히 사라진다. */
    const wrote = storeWrote
      ? ('\n★매장이 이미 개선 내용을 적은 항목이 ' + storeWrote.touched +
         '건 있습니다 (' + storeWrote.date + ').\n' +
         '   덮어쓰면 그 내용도 함께 지워집니다 — 매장에 다시 작성을 요청하셔야 합니다.\n')
      : '';
    /* ★손님이 낸 설문은 지우지 않는다★ (2026-08-27) — 담당자가 자기 것을 다시 내는 것이므로
       그 달 '고객 직접' 줄은 그대로 두고, CS 점수는 남은 것으로 다시 계산된다.
       종전 문구('위 기록을 모두 지우고')는 손님 것까지 지운다는 뜻이라 사실과 달라졌다. */
    const keepCust = (existing || []).filter(function (e) { return e.route === '고객 직접'; }).length;
    const keep = keepCust
      ? ('\n손님이 직접 낸 설문 ' + keepCust + '건은 ★그대로 둡니다★ — 점수는 남은 것으로 다시 계산됩니다.\n')
      : '';
    return confirm(store + '\n이번 달에 이미 제출된 기록이 ' + rows.length + '건 있습니다.\n\n' +
      rows.join('\n') + wrote + keep +
      '\n\n★매장을 잘못 고르지 않으셨는지 먼저 확인해 주세요.★\n' +
      '다른 매장이라면 [취소]를 누르고 매장을 다시 골라 주세요.\n' +
      '작성하신 내용은 그대로 남습니다.\n\n' +
      (keepCust ? '담당자가 낸 기록을 지우고' : '위 기록을 모두 지우고') + ' 지금 내용으로 새로 쓸까요?');
  }

  /* 통합시트의 실시간 상태(매장 목록 등) 조회.
     ★폴백 체인을 절대 끊지 말 것: 서버 → localStorage 캐시 → null.
       마지막 성공본이 남아 있어야 오프라인 지하 매장에서도 매장 선택이 된다.
     ★옛 'GET ?action=config' 폴백을 지웠다. 서버가 그 경로를 없앤 뒤로 doGet은 상태확인용
       {ok:true, service:'qsc-app', …}만 돌려주는데, ok가 참이라는 이유로 그 응답을 캐시에
       덮어쓰면 마지막 성공본(진짜 매장 목록)이 파괴되어 다음 오프라인 진입에서 복구가 불가능해진다.
     ★점검 모드(MAINT)로 거절당해도 같은 폴백을 탄다 — 마지막 성공본으로 매장 목록만 보여 주고,
       점검 중이라는 사실은 제출을 눌렀을 때 서버 문구로 안내된다. 점검 모드가 '작성'까지
       막을 이유는 없다(막는 순간 현장에서 작성 중이던 내용이 날아간다).
     ★토큰이 없어도 config.get을 부른다. 이 액션은 서버 등록표에서 legacy:true라
       AUTH_ENFORCE='off'인 동안 토큰 없이 POST해도 통과하고, 점검 3화면(토큰 없음)이
       실시간 매장 목록·NA프리셋을 받는 유일한 경로다.
     URL이 없으면(연동 전) null → 화면은 master.json 저장본으로 동작. */
  async function getConfig() {
    if (!CONFIG.APPS_SCRIPT_URL) return null;
    try {
      const cfg = await call('config.get', {});
      // ok만 보지 않는다 — stores가 있어야 '진짜 config 응답'이다(위 ★ 사고 방지의 핵심)
      if (cfg && cfg.ok && cfg.stores) {
        try { localStorage.setItem('qsc-live-config', JSON.stringify(cfg)); } catch (e) { /* 용량 초과 등 */ }
        return cfg;
      }
    } catch (e) { /* 아래 캐시로 */ }
    try { return JSON.parse(localStorage.getItem('qsc-live-config') || 'null'); } catch (e) { return null; }
  }

  return { call: call, submit: submit, getConfig: getConfig, askOverwrite: askOverwrite, watchDup: watchDup, CONFIG: CONFIG };
})();

/* auth.js가 서버 주소를 window.Api에서 찾는다(주소 단일 출처). 최상위 const는 window에
   자동으로 붙지 않아 지금은 항상 auth.js의 폴백 상수가 쓰이고 있다 — 두 주소가 같은 지금은
   증상이 없지만, 배포 주소를 옮기는 날 로그인만 옛 주소를 때린다. 여기서 명시적으로 노출한다. */
try { window.Api = Api; } catch (e) { /* 무시 */ }


let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); }
}

(async function () {
  // ① 조회 — 깨진 응답 뒤 한 번 더
  sent = []; queue = [{ body: HTML }, { body: '{"ok":true,"items":[]}' }];
  let r = await Api.call('store.get', { ym: '2610' });
  ok('① 조회: 깨진 응답이면 한 번 더 묻는다', sent.length === 2 && r.ok === true, { n: sent.length, r: r });
  ok('① 같은 요청 열쇠(reqId)로 다시 묻는다', sent[0].reqId === sent[1].reqId, sent.map(function (c) { return c.reqId; }));
  ok('① 같은 action·payload 그대로', sent[1].action === 'store.get' && sent[1].payload.ym === '2610', sent[1]);

  // ② 두 번 다 깨지면 종전 오류 그대로
  sent = []; queue = [{ body: HTML }, { body: HTML }];
  r = await Api.call('dashboard.get', { period: '2610' });
  ok('② 두 번 다 깨지면 요청은 두 번까지', sent.length === 2, sent.length);
  ok('② 종전과 같은 오류를 돌려준다', r.ok === false && r.code === 'SERVER_ERROR' && r.error.indexOf('서버 응답을 읽지 못했습니다') === 0, r);

  // ③ 쓰기는 다시 묻지 않는다
  sent = []; queue = [{ body: HTML }];
  r = await Api.call('qsc.submit', { store: '샘플매장' });
  ok('③ 제출은 다시 묻지 않는다', sent.length === 1 && r.code === 'SERVER_ERROR', { n: sent.length, r: r });
  sent = []; queue = [{ body: HTML }];
  r = await Api.call('month.close', { store: '샘플매장', ym: '2610', apply: true });
  ok('③ 월 채점 확정도 다시 묻지 않는다', sent.length === 1, sent.length);
  sent = []; queue = [{ body: HTML }];
  r = await Api.call('store.saveImprove', { no: 1 });
  ok('③ 개선요청 저장도 다시 묻지 않는다', sent.length === 1, sent.length);

  // ④ 서버가 JSON 으로 보낸 오류는 그대로
  sent = []; queue = [{ body: '{"ok":false,"code":"SERVER_ERROR","error":"시트를 읽지 못했습니다."}' }];
  r = await Api.call('store.get', { ym: '2610' });
  ok('④ JSON 오류는 다시 묻지 않는다', sent.length === 1 && r.error === '시트를 읽지 못했습니다.', { n: sent.length, r: r });

  // ⑤ 오프라인은 그대로
  sent = []; queue = [{ offline: true }];
  r = await Api.call('store.get', { ym: '2610' });
  ok('⑤ 오프라인은 다시 묻지 않는다 (NETWORK)', sent.length === 1 && r.code === 'NETWORK', { n: sent.length, r: r });

  console.log('JS ' + pass + ' 통과 · ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
