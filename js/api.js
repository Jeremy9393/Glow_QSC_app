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
      return { ok: false, code: 'SERVER_ERROR', error: '서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.' };
    }
  }

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
      return { ok: false, code: 'NETWORK', error: '네트워크에 연결할 수 없습니다.', _err: err };
    }
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

  return { call: call, submit: submit, getConfig: getConfig, CONFIG: CONFIG };
})();

/* auth.js가 서버 주소를 window.Api에서 찾는다(주소 단일 출처). 최상위 const는 window에
   자동으로 붙지 않아 지금은 항상 auth.js의 폴백 상수가 쓰이고 있다 — 두 주소가 같은 지금은
   증상이 없지만, 배포 주소를 옮기는 날 로그인만 옛 주소를 때린다. 여기서 명시적으로 노출한다. */
try { window.Api = Api; } catch (e) { /* 무시 */ }
