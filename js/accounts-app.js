/* 계정 관리 (관리자) — 확정사항 6.

   이 화면의 존재 이유는 하나다. 저녁에 매장에서 "로그인이 안 돼요" 연락이 왔을 때,
   담당자가 폰으로 그 자리에서 풀어 주는 것. 그래서 모든 조작이 목록 한 줄 안에서 끝나야 하고,
   비밀번호를 설정한 직후 곧바로 '매장에 보낼 안내 문구'를 복사할 수 있어야 한다.

   ★현재 비밀번호는 목록에 그대로 보인다★ (2026-08-20). 종전에는 설정한 직후 한 번만 볼 수
     있었고, 매장이 "뭐였죠"라고 물으면 다시 설정하는 수밖에 없었다 — 그러면 그 매장의
     로그인이 전부 끊긴다. 서버가 원문을 따로 보관한다(Code.gs pwStash 주석에 이유와 대가).
     ★그래서 이 화면은 26곳의 비밀번호가 한눈에 보이는 화면이다★ — 매장 안에서 펼쳐야 할 때를
     위해 [비밀번호 숨기기]를 두었고, 그 선택은 이 기기에만 기억된다.
   ★역할 이름을 비교하지 않는다. 무엇을 보여줄지는 Auth.hasMenu()·Auth.can()만 묻는다.
   ★매장명·서버 문구는 전부 textContent로 넣는다. 외부 스크립트가 0개인 것과 이 관례가
     이 앱의 XSS 방어 전부다.
   ★목록 순서는 서버가 준 순서(=계정 시트 순서) 그대로 둔다. 화면이 다시 정렬하면
     "아까 그 줄이 어디 갔지"가 되고, 급할 때 그 1초가 제일 비싸다. 찾기는 검색칸이 맡는다. */
(async function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };

  const BASE = 'https://jeremy9393.github.io/Glow_QSC_app/';   // codes-app.js와 같은 앱 주소
  const MINPW = 8;                                             // login-app.js·서버와 같은 규칙
  const AUDIT_LIMIT = 100;                                     // 서버가 1~200으로 클램프한다
  const PWSHOW_KEY = 'qsc-acct-pwshow';                        // api.js·auth.js와 같은 'qsc-' 접두어

  /* 비밀번호를 눈에 보이게 둘지. ★기본은 보임이다★ — 이 화면을 여는 이유의 대부분이
     "그 매장 비밀번호가 뭐였죠"이고, 한 번 더 눌러야 보인다면 그 한 번이 매번 든다.
     매장 안에서 화면을 펴야 할 때만 가린다. 가려도 [복사]는 그대로 동작한다 —
     가리기는 어깨너머를 막는 것이지 값을 잠그는 것이 아니다(잠금은 로그인이 맡는다). */
  let pwShow = true;
  try { pwShow = (localStorage.getItem(PWSHOW_KEY) !== '0'); } catch (e) { /* 사생활 모드 */ }
  function savePwShow() {
    try { localStorage.setItem(PWSHOW_KEY, pwShow ? '1' : '0'); } catch (e) { /* 이번 화면에서만 */ }
  }

  /* 감사로그 표시용 매핑표. 로그를 읽는 사람은 비개발자 한 명이므로 'store.saveImprove'가
     아니라 '개선보고 저장'이 보여야 한다.
     ★표에 없는 값은 원문을 그대로 보여준다★ — 서버에 액션이 하나 늘 때마다 여기를 고쳐야
       한다면 언젠가 반드시 빠뜨리고, 그때 화면에는 빈칸이 남는다. 원문이라도 보이는 편이 낫다.
     ★한국어 문구로 분기하지 않는다 — 이 표는 '보여줄 때'만 쓰고, 판정은 아래 result 원문으로 한다. */
  const ACTION_LABEL = {
    'auth.login': '로그인',
    'auth.verify': '세션 확인',
    'auth.session': '세션 조회',
    'auth.setPassword': '비밀번호 변경(본인)',
    'config.get': '설정 조회',
    'qsc.submit': 'QSC 평가표 제출',
    'shopper.submit': '미스터리쇼퍼 제출',
    'survey.submit': '고객 설문 제출',
    'dashboard.get': '전체 대시보드 조회',
    'store.get': '매장별 QSC현황 조회',
    'store.saveImprove': '개선보고 저장',
    'account.list': '계정 목록 조회',
    'account.setPassword': '비밀번호 설정',
    'account.setStatus': '계정 사용/중지',
    'account.sync': '계정 동기화',
    'audit.list': '감사로그 조회',
    'status.month': '미제출 현황 조회',
    'notify.badge': '알림 배지 조회',
    'maint': '점검 모드 차단',
    'role.table': '역할표 점검',
    'resolveTarget': '대상 매장 판정',
  };
  /* 사유 코드도 같은 원칙이다. 사유가 'FORBIDDEN'으로만 보이면 담당자가 판단을 못 한다.
     ★코드(키)는 서버 계약이라 그대로 두고 라벨만 순화한다★ */
  const REASON_LABEL = {
    'FORBIDDEN': '권한 없음',
    'SCOPE_DENIED': '담당 매장 아님',
    'BAD_PASSWORD': '비밀번호 틀림',
    'NO_ACCOUNT': '없는 아이디',
    'BAD_ID': '아이디 형식 오류',
    'ACCOUNT_DISABLED': '중지된 계정',
    'CRED_CHANGED': '비밀번호 변경됨',
    'AUTH_REQUIRED': '로그인 필요',
    'AUTH_EXPIRED': '세션 만료',
    'AUTH_INVALID': '토큰 오류',
    'AUTH_BYPASS': '토큰 없이 통과',
    'MAINT': '점검 중',
    'LOCKED': '잠금',
    'BAD_REQUEST': '요청 형식 오류',
    'SERVER_ERROR': '서버 오류',
    'NOT_FOUND': '대상 없음',
    'HASH_BUDGET': '로그인 시도 과다',
    'GLOBAL_THROTTLE': '전체 로그인 시도 과다',
    'ROLE_TABLE_DUP': '역할표 중복',
    'ROLE_STAR_MULTI': '역할표 `*` 행 확인 필요',
    'SET_PW': '비밀번호 최초 설정',
    'PHOTO_SKIPPED': '사진 저장 안 됨',
  };
  /* 결과 칸도 같다. 시트에 적히는 값(`성공`·`실패`·`거부`…)은 계약이라 그대로 두고
     ★보이는 문구만★ 순화한다 — 이 표는 사람이 무엇을 잘못했는지 따지는 표가 아니라
     "무엇이 어디서 멈췄나"를 찾는 표다. 표에 없는 값은 다른 매핑표와 같이 원문 그대로 나간다.
     ★`성공`은 바꾸지 않는다★ — 부정적인 말이 아니고, 아래 bad 판정과 눈으로 짝이 맞아야 한다. */
  const RESULT_LABEL = {
    '실패': '되지 않음',
    '거부': '막힘',
    '차단': '멈춤',
    '경보': '주의',
    '통과(무인증)': '통과(로그인 없음)',
  };

  let rows = [];        // 서버가 준 계정 목록 (표시 순서 = 시트 순서)
  let dups = null;      // 정규화 후 아이디가 겹치는 계정 (아래 findDups 주석 참조)
  let busy = false;
  let openId = '';      // 비밀번호 패널이 열려 있는 계정. 한 번에 하나만 연다
  let panel = null;     // 그 패널 DOM. 목록을 다시 그려도 이 노드를 그대로 다시 끼워 넣는다

  // ---------- 작은 도구들 ----------

  function setNote(el, text) {
    el.textContent = text || '';
    el.style.display = text ? '' : 'none';
  }
  function warn(text) { setNote($('#warnNote'), text); }
  /* 점검 모드 문구는 전용 칸에 넣는다 — 다른 화면과 같은 id(#maintNote)라야
     auth.js의 공지 배너가 이 안내 '아래'로 들어간다(accounts.html 주석 참조). */
  function maint(text) { setNote($('#maintNote'), text); }

  function curMonth(d) {
    d = d || new Date();
    return String(d.getFullYear()) + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  /* 최근접속 표시. 서버는 'yyyy-MM-dd HH:mm'으로 적는다(Code.gs touchLastSeen).
     ★형식이 다르면 원문을 그대로 보여준다 — 빈칸으로 만들면 "접속 기록 없음"과 구별되지 않고,
       그 구별이 이 열의 존재 이유(아직 앱을 안 쓰는 매장 찾기)다. */
  function fmtSeen(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    return m ? (Number(m[2]) + '/' + Number(m[3])) : s;
  }
  /* ★curMonth()와 글자 그대로 같은 형태('YYYY-MM')를 돌려줘야 한다.
     0을 채우지 않으면 9월까지는 '2026-8' vs '2026-08'로 영영 어긋나 '이번 달 접속'이 늘 0이 된다. */
  function seenMonth(v) {
    const m = /^(\d{4})-(\d{1,2})/.exec(String(v == null ? '' : v).trim());
    return m ? (m[1] + '-' + String(Number(m[2])).padStart(2, '0')) : '';
  }

  /* 감사로그 시각. 서버는 'yyyy-MM-dd HH:mm:ss'로 적고 계약은 'yyyy-MM-dd HH:mm'이다 —
     둘 다 받아 'MM/DD HH:mm'으로 줄인다. 연도는 최근 100건을 보는 표에서 자리만 차지한다.
     ★new Date()로 파싱하지 않는다★ — 이 문자열에는 시간대가 없어 브라우저마다 다르게 읽고,
       기록은 스프레드시트 시간대 기준이다. 글자를 잘라 쓰면 어긋날 일이 없다. */
  function fmtAt(v) {
    const s = String(v == null ? '' : v).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
    return m ? (m[2] + '/' + m[3] + ' ' + m[4] + ':' + m[5]) : s;
  }
  // 표에 없으면 원문 그대로 (위 매핑표 주석의 ★와 같은 이유)
  function label(map, v) {
    const s = String(v == null ? '' : v).trim();
    return map[s] || s;
  }

  /* ---------- 아이디 중복 탐지 ----------
     ★서버가 아이디를 정규화(NFC·앞뒤공백·연속공백·소문자)한 뒤 내려주기 때문에,
       「계정」 탭에 `금종제과`와 `금종제과 `(끝 공백)처럼 원문이 다른 두 행이 있으면
       화면에는 똑같은 아이디가 두 줄로 보인다★
     이때 서버의 getAccount는 '첫 일치 행'만 쓴다. 즉 아래쪽 줄의 [비밀번호]를 눌러도
     자격증명은 위쪽 계정에 쓰이고, 결과적으로 ① 위쪽 매장의 로그인이 전부 끊기고
     ② 아래쪽 매장에 알려 준 비밀번호로 들어가면 위쪽 매장의 담당 범위를 얻는다.
     조용히 남의 매장 자료가 열리는 경로라, 여기서는 경고하고 조작을 막는 쪽을 택한다
     (고치는 곳은 앱이 아니라 시트다 — 중복 행을 지워야 끝난다).
     ★Object.create(null) — 아이디가 'constructor'·'__proto__'여도 오탐이 나지 않게. */
  function findDups(list) {
    const seen = Object.create(null), dup = Object.create(null);
    list.forEach(function (a) {
      if (seen[a.id]) dup[a.id] = true;
      else seen[a.id] = true;
    });
    return dup;
  }
  function isDup(id) { return !!(dups && dups[id]); }

  // codes-app.js:115의 복사 패턴을 그대로 쓴다 (clipboard 실패 시 textarea 폴백)
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const t = document.createElement('textarea');
      t.value = text; document.body.appendChild(t); t.select();
      document.execCommand('copy'); t.remove();
    }
    const old = btn.textContent;
    btn.textContent = '복사됨';
    setTimeout(function () { btn.textContent = old; }, 1200);
  }

  /* 자동 생성 비밀번호. 32글자 알파벳이라 바이트를 32로 나눈 나머지에 치우침이 없다
     (256 = 32 × 8). 헷갈리는 0·o·1·l은 뺐다 — 이 값은 전화로 불러 주게 된다.
     ★crypto가 없으면 만들지 않는다. 자격증명을 Math.random으로 만드는 것은 설계 위반이라
       (js/api.js의 같은 주석) 그때는 버튼을 감추고 담당자가 직접 정하게 한다. */
  const PWSET = 'abcdefghijkmnpqrstuvwxyz23456789';
  function hasCrypto() {
    try { return !!(window.crypto && crypto.getRandomValues); } catch (e) { return false; }
  }
  function genPw(n) {
    const a = new Uint8Array(n || 10);
    crypto.getRandomValues(a);
    let s = '';
    for (let i = 0; i < a.length; i++) s += PWSET.charAt(a[i] % PWSET.length);
    return s;
  }

  function msgFor(id, pw) {
    return '[GLOW SEOUL QSC 앱]\n아래 주소로 접속해 로그인해 주세요.\n' + BASE +
      '\n\n아이디 : ' + id + '\n비밀번호 : ' + pw +
      '\n\n· 아이디는 매장명 그대로입니다 (띄어쓰기까지 같아야 합니다)\n' +
      '· 로그인이 안 되시면 감사총무팀으로 연락 주세요.';
  }

  // ---------- 가드 ----------

  /* 로그인 화면 주소는 직접 조립하지 않는다. ?next= 화이트리스트(Auth.NEXT_OK)가 auth.js
     한 곳에만 있어야 화면 이름이 바뀌는 날 한 곳만 고치면 된다.
     ★auth.js의 NEXT_OK에 'accounts.html'이 없으면 loginUrl()이 next=index.html로 떨어져
       로그인 후 홈으로 간다 — 동작은 하지만 한 번 더 눌러야 한다.
       (확인함: auth.js:40 NEXT_OK에 'accounts.html'이 들어 있다. 화면 이름을 바꾸는 날 함께 고칠 것) */
  function goLogin() {
    let u = 'login.html?next=accounts.html';
    try { if (typeof Auth !== 'undefined' && Auth && typeof Auth.loginUrl === 'function') u = Auth.loginUrl(); }
    catch (e) { /* auth.js 미로드 — 위 폴백 주소를 쓴다 */ }
    location.replace(u);
  }

  /* 조회 전용 화면이라 리다이렉트 가드로 충분하다. 작성 중인 입력이 없어 잃을 것이 없다
     (점검표 2화면과 다른 점이 이것이다). */
  let signedIn = false;
  try { signedIn = await Auth.ensure(); } catch (e) { signedIn = false; }
  if (!signedIn) { goLogin(); return; }

  /* ★매장 사용자가 주소를 직접 쳐서 들어온 경우★ (2026-08-16 지시 §4).
     서버는 menu:'accounts' 게이트가 이미 막고 있고, 여기서 막는 것은 '화면'이다 —
     안내 없이 빈 목록만 남겨 두면 "고장 났다"로 읽힌다. 문구를 먼저 보여 주고 홈으로 옮긴다.

     ★문구를 여기서 짓지 않는다★ — Auth.denyHome()이 앱 전체의 같은 상황을 한 문구로 맡는다.
       화면마다 조금씩 다른 말("…볼 권한이 없습니다" / "…잠시 후 홈으로")을 쓰면 같은 일을
       겪은 두 사람이 서로 다른 말을 전해 오고, 그때 담당자가 원인을 못 맞춘다.
     ★아래 폴백은 auth.js가 옛 캐시(v34)로 남았을 때만 쓴다★ — 그때 denyHome은 없다.
     ★DOM을 하나씩 확인하고 만진다★ — accounts.html의 guard('accounts')가 먼저 돌면
       .wrap을 안내 한 줄로 갈아 끼운 뒤라 #stateNote·#syncBtn이 이미 없다. */
  function deny() {
    if (typeof Auth.denyHome === 'function') return Auth.denyHome();
    const n = $('#stateNote');
    if (n) setNote(n, '이 화면을 볼 수 있는 권한이 없습니다. 홈으로 이동합니다.');
    /* 감사로그·조작 버튼도 함께 감춘다. 서버가 어차피 열어 주지 않지만, 누를 수 있게 두면
       "권한이 없습니다"를 두 번 읽히는 화면이 된다. */
    ['#syncBtn', '#q', '#auditCard', '.pwEyeBar'].forEach(function (s) {
      const el = $(s); if (el) el.style.display = 'none';
    });
    /* replace다 — push로 남기면 홈에서 뒤로가기를 누를 때 이 화면으로 다시 떨어진다 */
    setTimeout(function () { location.replace('index.html'); }, 1800);
    return false;
  }

  /* ★역할 이름을 묻지 않는다★ — Auth.hasMenu()만 본다(서버 `역할` 탭이 정본).
     ★menus()가 null이면 막지 않는다★ — '권한이 0개'와 '아직 모른다'는 다르다(auth.js guard와
     같은 규칙). 종전에는 hasMenu() 단독이라, 저장소가 비워져 권한 사본을 못 읽은 담당자까지
     "권한이 없습니다"를 보고 홈으로 튕겼다. 모를 때는 통과시키고 서버에 판정을 맡긴다 —
     그 판정(FORBIDDEN)은 아래 load()가 받아 같은 자리로 데려간다. 매장 계정이 이 갈래로
     들어와도 목록은 한 줄도 내려오지 않는다. */
  const knownMenus = (typeof Auth.menus === 'function') ? Auth.menus() : null;
  if (knownMenus && !Auth.hasMenu('accounts')) { deny(); return; }
  /* 읽기만 있는 역할이 생기더라도 화면이 깨지지 않게 조작 버튼만 감춘다(역할 이름은 묻지 않는다).
     ★null 확인★ — 읽기 없이 쓰기만 켜진 표를 만나면 accounts.html의 guard('accounts')가
     먼저 본문을 갈아 끼우고 지나간 뒤라 이 버튼이 없다. 그때 여기서 터지면 안내가 지워진다. */
  const canWrite = Auth.can('accounts', '쓰기');
  if (!canWrite) { const sb = $('#syncBtn'); if (sb) sb.style.display = 'none'; }
  const meId = ((Auth.user && Auth.user()) || {}).id || '';

  // ---------- 오류 처리 ----------

  /* 오류 분기는 code 상수로만 한다. 한국어 문구로 분기하면 서버가 문구를 다듬는 날 조용히 깨진다.
     반환값 = 화면에 보여줄 문구. 이동이 필요한 경우(세션 만료)에는 ''를 돌려주고 여기서 옮긴다. */
  function failMsg(res) {
    const code = (res && res.code) || 'SERVER_ERROR';
    const msg = (res && res.error) || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

    // NETWORK는 서버 코드가 아니라 api.js가 붙이는 클라이언트 전용 코드다(오프라인·DNS 실패)
    if (code === 'NETWORK') return '연결이 되지 않아 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    if (code === 'AUTH_REQUIRED' || code === 'AUTH_EXPIRED' || code === 'AUTH_INVALID') {
      // api.js가 조용한 재로그인까지 시도한 뒤에도 실패한 상태다 — 여기서는 로그인 화면뿐
      Auth.clear();
      goLogin();
      return '';
    }
    /* 점검 모드(스크립트 속성 MAINT). 관리자 역할은 통과시키는 것이 확정사항이라 이 화면에서는
       거의 볼 일이 없지만, 관리자 예외를 잠시 끄는 경우가 있어 문구를 그대로 띄운다. */
    /* ★코드는 'MAINT'다★ — 서버가 주는 값(Code.gs의 code:'MAINT')과 글자가 달라
       이 화면에서만 점검 문구가 앰버 배너로 안 뜨고 회색 안내로 밀려나 있었다.
       다른 화면(login·dashboard·store)은 모두 'MAINT'로 맞춰져 있다. */
    if (code === 'MAINT') { maint(msg); return msg; }
    /* APP_OUTDATED는 옛 봉투(type)로 온 제출에만 붙는다 — 이 화면의 account.* 는 그 경로가
       아니라 사실상 닿지 않는다. 그래서 문구를 여기서 다시 짓지 않고 서버 문구를 그대로 쓴다.
       ★종전 문구('앱 종료 후 다시 실행')를 지운 이유★ — 같은 코드가 점검표 화면에서는
       74문항의 사진을 날리는 안내가 된다. 문구는 서버 한 곳(Code.gs doPost)에서만 관리한다. */
    return msg;
  }

  function lock(on) {
    busy = on;
    $('#reloadBtn').disabled = on;
    $('#syncBtn').disabled = on;
  }

  // ---------- 비밀번호 설정 패널 ----------

  /* prompt()를 쓰지 않는 이유: 설정에 성공한 '뒤'가 이 기능의 본체다 —
     안내 문구를 복사해 매장에 보내는 것까지가 한 동작이다. prompt로는 그 뒤를 붙일 수 없다. */
  function buildPanel(a) {
    const self = (a.id === meId);
    const box = document.createElement('section');
    box.className = 'card pwPanel';
    box.innerHTML =
      '<h2>비밀번호 설정</h2>' +
      '<p class="note pwWho"></p>' +
      '<div class="meta-grid"><div class="full">' +
      '<label class="f" for="npw">새 비밀번호</label>' +
      /* type=password가 아니라 text다. 담당자가 정해 매장에 불러 줘야 하는 값이라
         가려 놓으면 오타를 잡을 수 없다. autocomplete는 꺼서 브라우저 비밀번호 관리자가
         '담당자 본인의 비밀번호'로 오해해 저장하려 드는 것을 막는다. */
      '<input type="text" id="npw" name="qsc-newpw" autocomplete="off" ' +
      'autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="latin">' +
      '</div></div>' +
      '<div class="bcAct">' +
      '<button class="miniBtn" id="genBtn">자동 생성</button>' +
      '<button class="miniBtn" id="pwOk">설정</button>' +
      '<button class="miniBtn" id="pwNo">취소</button>' +
      '</div>' +
      '<p class="note noteErr" id="pwMsg" style="display:none"></p>' +
      '<div id="pwDone" style="display:none"></div>';

    $('.pwWho', box).textContent = self
      ? a.id + ' — 본인 계정입니다. 바꾸면 지금 이 기기도 곧바로 로그아웃됩니다.'
      : a.id + ' 계정의 비밀번호를 새로 정합니다. 설정하는 즉시 이 계정에 로그인되어 있던 기기가 모두 로그아웃됩니다.';

    if (!hasCrypto()) $('#genBtn', box).style.display = 'none';
    $('#genBtn', box).onclick = function () { $('#npw', box).value = genPw(10); };
    $('#pwNo', box).onclick = function () { closePanel(); };
    $('#pwOk', box).onclick = function () { doSetPw(a, box); };
    return box;
  }

  function closePanel() {
    openId = '';
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
  }

  function openPanel(a) {
    closePanel();
    openId = a.id;
    panel = buildPanel(a);
    render();                       // 목록을 다시 그리면서 해당 줄 아래에 끼워 넣는다
    const el = $('#npw', panel);
    if (el) el.focus();
  }

  async function doSetPw(a, box) {
    if (busy) return;
    const pw = $('#npw', box).value.trim();
    const msg = $('#pwMsg', box);

    // 서버도 같은 규칙으로 다시 검사한다. 여기 검사는 왕복 한 번을 아끼기 위한 것일 뿐이다
    if (pw.length < MINPW) { setNote(msg, '비밀번호는 ' + MINPW + '자 이상이어야 합니다.'); return; }
    if (pw === a.id) { setNote(msg, '아이디와 다른 비밀번호를 정해 주세요.'); return; }
    if (/\s/.test(pw)) { setNote(msg, '비밀번호에 공백은 넣을 수 없습니다.'); return; }
    if (!confirm(a.id + '\n\n비밀번호를 이 값으로 설정합니다.\n' + pw +
      '\n\n설정하면 이 계정의 기존 로그인이 모두 끊깁니다. 계속할까요?')) return;

    setNote(msg, '');
    lock(true);
    $('#pwOk', box).disabled = true;
    let res = null;
    try { res = await Api.call('account.setPassword', { id: a.id, newPw: pw }); }
    catch (e) { res = null; }
    lock(false);
    $('#pwOk', box).disabled = false;

    if (!(res && res.ok)) { setNote(msg, failMsg(res)); return; }

    /* 본인 계정을 바꾼 경우. 서버가 새 토큰을 함께 주면 갈아 끼워 로그인을 유지하고,
       주지 않으면 지금 들고 있는 토큰은 이미 죽은 것이다(자격증명 지문이 바뀐다) —
       그대로 두면 다음 조작이 원인 모를 오류로 보이므로 닫을 때 로그아웃시킨다. */
    let dead = (a.id === meId);
    if (dead && res.token) {
      try { Auth.save(res); dead = false; } catch (e) { /* 저장 실패면 아래 로그아웃 경로로 */ }
    }

    a.hasPw = true;
    /* 서버 응답에도 account.pw로 들어 있지만, 여기서 직접 넣는다 — 응답 형태가 바뀌어도
       방금 내가 정한 값이 목록에 안 뜨는 일은 없어야 한다. */
    a.pw = pw;
    showDone(a, pw, box, dead);
    render();     // 목록의 '미설정' 뱃지를 즉시 지운다 (서버 왕복을 한 번 더 하지 않는다)
  }

  /* 설정 성공 화면. 창을 닫아도 비밀번호는 목록에 그대로 남는다(2026-08-20부터) —
     그래도 안내 문구 복사를 여기 두는 이유는, 매장에 보낼 문장을 만드는 일이 이 조작의
     마지막 한 걸음이기 때문이다. 여기서 안 보내면 대개 영영 안 보낸다.
     dead = 본인 계정을 바꿔 이 기기의 세션이 죽은 경우. 닫기가 곧 로그아웃이 된다. */
  function showDone(a, pw, box, dead) {
    $('#npw', box).disabled = true;
    $('#genBtn', box).style.display = 'none';
    $('#pwOk', box).style.display = 'none';
    $('#pwNo', box).textContent = '닫기';

    const done = $('#pwDone', box);
    done.style.display = '';
    done.innerHTML =
      '<p class="note noteOk">비밀번호를 설정했습니다. 이 계정의 기존 로그인은 모두 끊겼습니다.</p>' +
      '<p class="note pre msgPrev"></p>' +
      '<div class="bcAct">' +
      '<button class="miniBtn" id="cpMsg">안내 문구 복사</button>' +
      '<button class="miniBtn" id="cpPw">비밀번호만 복사</button>' +
      '</div>' +
      '<p class="note">이 비밀번호는 목록에도 계속 보입니다. 잊으셔도 다시 확인하실 수 있습니다.</p>';

    const text = msgFor(a.id, pw);
    $('.msgPrev', done).textContent = text;         // 사용자 데이터 — 반드시 textContent
    $('#cpMsg', done).onclick = function () { copy(text, this); };
    $('#cpPw', done).onclick = function () { copy(pw, this); };

    if (dead) {
      const p = document.createElement('p');
      p.className = 'note noteErr';
      p.textContent = '본인 계정입니다. 닫으면 로그아웃되며, 새 비밀번호로 다시 로그인해 주세요.';
      done.appendChild(p);
      // 닫기가 곧 로그아웃이다. 죽은 토큰으로 화면에 남아 있으면 다음 조작이 전부 오류로 보인다
      $('#pwNo', box).onclick = function () { Auth.logout(); };
    }
  }

  // ---------- 사용/중지 토글 ----------

  async function doToggle(a) {
    if (busy) return;
    const to = (a.status === '사용') ? '중지' : '사용';
    const ask = (to === '중지')
      ? a.id + '\n\n이 계정을 중지합니다.\n\n· 지금 로그인되어 있는 기기까지 즉시 접속이 막힙니다\n' +
        '· 비밀번호는 지워지지 않아 [사용]으로 되돌리면 그대로 다시 들어옵니다\n\n중지할까요?'
      : a.id + '\n\n이 계정을 다시 사용으로 바꿉니다.\n종전 비밀번호로 다시 로그인할 수 있게 됩니다.\n\n계속할까요?';
    if (!confirm(ask)) return;

    lock(true);
    let res = null;
    try { res = await Api.call('account.setStatus', { id: a.id, status: to }); }
    catch (e) { res = null; }
    lock(false);

    // failMsg가 빈 문자열을 주는 경우는 이미 로그인 화면으로 보낸 뒤다 — 빈 alert를 띄우지 않는다
    if (!(res && res.ok)) { const m = failMsg(res); if (m) alert(m); return; }
    a.status = to;
    render();
  }

  // ---------- 렌더 ----------

  function rowEl(a, month) {
    const off = (a.status !== '사용');
    const nopw = !a.hasPw;
    // 마커는 '지금 이 계정을 쓸 수 있는가'만 말한다. 중지가 미설정보다 강한 상태다
    const mark = off ? '⛔' : (nopw ? '⚠' : '●');
    /* 이번 달에 한 번도 안 들어온 계정. 마커를 바꾸지 않는 이유는 위 주석 그대로다 —
       마커는 '쓸 수 있는가'만 말하고, 접속 여부는 '실제로 쓰고 있는가'라는 다른 축이다.
       그래서 흐리게 + 뱃지로 따로 표시한다. */
    const idle = (seenMonth(a.lastSeen) !== month);
    const dup = isDup(a.id);

    const row = document.createElement('div');
    row.className = 'codeRow accRow' + (off ? ' acc-off' : (nopw ? ' acc-nopw' : ' acc-ok'))
      + (idle ? ' acc-idle' : '') + (dup ? ' acc-dup' : '');

    const st = document.createElement('span');
    st.className = 'st';
    st.textContent = mark;

    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = a.id;                       // 사용자 데이터 — 반드시 textContent

    const info = document.createElement('span');
    info.className = 'info';
    // 문제 상태를 맨 앞에 둔다. 폰에서 줄이 잘려도 '미설정'·'중지'는 먼저 보여야 한다
    if (dup) {
      // 가장 먼저 보여야 하는 상태다 — 이 줄은 조작해도 다른 계정이 바뀐다
      const b = document.createElement('b');
      b.className = 'accBadge bad';
      b.textContent = '아이디 중복';
      info.appendChild(b);
    }
    if (nopw) {
      const b = document.createElement('b');
      b.className = 'accBadge warn';
      b.textContent = '비밀번호 미설정';
      info.appendChild(b);
    }
    if (off) {
      const b = document.createElement('b');
      b.className = 'accBadge bad';
      b.textContent = '중지';
      info.appendChild(b);
    }
    /* 접속 뱃지는 두 상태를 구별해 하나만 단다 — '한 번도 안 옴'과 '오긴 왔는데 지난달'은
       대응이 다르다(전자는 안내부터, 후자는 그냥 기다리면 된다). 둘 다 달면 같은 말이 두 줄 된다. */
    const seen = fmtSeen(a.lastSeen);
    if (idle) {
      const b = document.createElement('b');
      b.className = 'accBadge dim';
      b.textContent = seen ? '이번 달 미접속' : '접속 기록 없음';
      info.appendChild(b);
    }
    /* ★현재 비밀번호★ — 이 화면의 존재 이유가 여기로 옮겨 왔다.
       · 값이 없으면 빈칸으로 두지 않고 '확인 불가'라고 적는다. 빈칸은 '비밀번호가 없다'로
         읽히는데 실제로는 설정되어 있다(이 기능 이전에 정했거나, 시트를 손으로 고친 경우).
       · 눌러서 복사된다. 폰에서 매장에 불러 주는 것보다 붙여넣어 보내는 편이 오타가 없다.
       · 가려 두었어도 복사는 된다 — 가리기는 어깨너머 대비이지 값을 잠그는 장치가 아니다. */
    if (a.hasPw) {
      const pwEl = document.createElement('button');
      pwEl.type = 'button';
      pwEl.className = 'accPw' + (a.pw ? '' : ' accPw-none');
      if (a.pw) {
        // 사용자 데이터 — 반드시 textContent. 가릴 때도 원문 길이를 흘리지 않도록 고정 길이로 덮는다
        pwEl.textContent = pwShow ? a.pw : '••••••••';
        pwEl.title = pwShow ? '눌러서 복사' : '가려 둔 상태입니다. 눌러서 복사';
        pwEl.onclick = function () { copy(a.pw, this); };
      } else {
        pwEl.textContent = '비밀번호 확인 불가';
        pwEl.title = '이 비밀번호는 보관 기능이 생기기 전에 설정되었습니다. 새로 설정하시면 이 자리에 보입니다.';
        pwEl.disabled = true;
      }
      info.appendChild(pwEl);
    }

    const tail = document.createElement('span');
    /* '비밀번호 설정됨'을 빼 두었다 — 바로 위 칸이 값을 그대로 보여 주므로 같은 말이 두 번 된다
       (가려 둔 상태에서도 ●●●● 칸이 그 자리에 있어 '설정되어 있다'는 사실은 그대로 읽힌다). */
    tail.textContent = [
      a.role || '',
      off ? '' : '사용중',
      seen ? (seen + ' 접속') : '',
    ].filter(function (v) { return !!v; }).join(' · ');
    info.appendChild(tail);

    const act = document.createElement('span');
    act.className = 'act';
    /* 중복 아이디 줄에는 조작 버튼을 아예 두지 않는다. 눌러도 이 줄이 아니라 위쪽 줄이
       바뀌므로, 비활성 버튼으로 남겨 두면 "왜 안 눌리지"가 아니라 "눌렀는데 왜 저 매장이"가 된다.
       고칠 곳은 시트이고, 그 안내는 상단 경고문이 한다. */
    if (canWrite && !dup) {
      const pwBtn = document.createElement('button');
      pwBtn.className = 'miniBtn';
      pwBtn.type = 'button';
      pwBtn.textContent = '비밀번호';
      pwBtn.onclick = function () { if (openId === a.id) closePanel(); else openPanel(a); };
      act.appendChild(pwBtn);

      /* 본인 계정에는 중지 버튼을 두지 않는다. 자기를 중지하면 이 화면 자체에 다시 들어올 수
         없고, 그때는 시트를 직접 고치는 수밖에 없다 — 폰만 들고 있는 저녁에는 복구 불가다.
         (서버도 거부하겠지만, 누를 수 있게 두는 것 자체가 사고다) */
      if (a.id !== meId) {
        const stBtn = document.createElement('button');
        stBtn.className = 'miniBtn' + (off ? '' : ' warn');
        stBtn.type = 'button';
        stBtn.textContent = off ? '사용' : '중지';
        stBtn.onclick = function () { doToggle(a); };
        act.appendChild(stBtn);
      }
    }

    row.appendChild(st);
    row.appendChild(nm);
    row.appendChild(info);
    row.appendChild(act);
    return row;
  }

  function render() {
    const q = $('#q').value.trim();
    const list = $('#list');
    list.innerHTML = '';

    const month = curMonth();
    let all = 0, nopw = 0, off = 0, seen = 0, shown = 0;

    rows.forEach(function (a) {
      // 요약은 검색과 무관하게 '전체'를 센다 — 걸러 놓고 보는 중에 숫자가 바뀌면 오히려 헷갈린다
      all++;
      if (!a.hasPw) nopw++;
      if (a.status !== '사용') off++;
      if (seenMonth(a.lastSeen) === month) seen++;

      if (q && a.id.indexOf(q) < 0 && String(a.name || '').indexOf(q) < 0) return;
      list.appendChild(rowEl(a, month));
      shown++;
      if (openId === a.id && panel) list.appendChild(panel);
    });

    // 패널을 연 계정이 검색에 걸리지 않으면 갈 곳이 없다 — 목록 끝에라도 붙여 잃어버리지 않게 한다
    if (openId && panel && !panel.parentNode) list.appendChild(panel);

    const sum = $('#sum');
    sum.innerHTML = '';
    [
      ['계정', String(all), ''],
      ['비밀번호 미설정', String(nopw), nopw ? 'hot' : ''],
      ['중지', String(off), off ? 'bad' : ''],
      /* '18'이 아니라 '18/27'로 낸다 — 분모가 없으면 18이 많은 건지 적은 건지 판단할 수 없고,
         이 숫자를 보는 이유가 바로 "몇 곳이 아직 안 쓰는가"이기 때문이다.
         전부 들어왔을 때만 초록, 아니면 색을 주지 않는다(빨강은 사고를 뜻하게 남겨 둔다). */
      ['이번 달 접속', String(seen) + '/' + String(all), (all && seen === all) ? 'ok' : ''],
    ].forEach(function (p) {
      const sp = document.createElement('span');
      sp.textContent = p[0] + ' ';
      const b = document.createElement('b');
      if (p[2]) b.className = p[2];
      b.textContent = p[1];
      sp.appendChild(b);
      sum.appendChild(sp);
    });

    /* 중복 경고는 render()가 통째로 맡는다(설정/해제를 한 곳에서 해야 지운 뒤 남지 않는다).
       #warnNote는 점검 문구를 #maintNote로 옮긴 뒤로 이 용도만 쓴다. */
    const dupNames = Object.keys(dups || {});
    warn(dupNames.length
      ? ('「계정」 탭에 아이디가 겹치는 행이 있습니다 — ' + dupNames.join(', ') +
         '. 같은 아이디가 둘 이상이면 아래쪽 줄을 조작해도 위쪽 계정이 바뀌므로, 그 줄의 조작 버튼을 감춰 두었습니다. ' +
         '인증 시트의 「계정」 탭에서 중복 행을 정리해 주세요 (앞뒤 공백·대소문자만 달라도 같은 아이디가 됩니다).')
      : '');

    if (!all) setNote($('#stateNote'), '계정이 없습니다. [통합시트에서 계정 동기화]를 눌러 주세요.');
    else if (!shown) setNote($('#stateNote'), '찾으시는 계정이 없습니다.');
    else setNote($('#stateNote'), '');
  }

  // ---------- 불러오기 ----------

  /* 서버 응답을 화면이 쓰는 형태로 고정한다. 빠진 칸은 '모른다'가 아니라 '없음'으로 본다 —
     hasPw가 undefined일 때 설정된 것처럼 보이면 매장이 못 들어오는 이유를 영영 못 찾는다. */
  function normalize(list) {
    return (list || []).filter(function (a) { return a && a.id; }).map(function (a) {
      return {
        id: String(a.id),
        name: String(a.name || ''),
        role: String(a.role || ''),
        status: (String(a.status || '') === '사용') ? '사용' : '중지',
        hasPw: !!a.hasPw,
        /* 현재 비밀번호. 서버가 보관값을 확신하지 못하면 빈 문자열로 온다 —
           그때는 '없음'이 아니라 '확인 불가'다(hasPw는 여전히 true다). */
        pw: String(a.pw || ''),
        lastSeen: String(a.lastSeen || ''),
      };
    });
  }

  /* 비밀번호 보임/숨김 버튼. 문구는 '지금 상태'가 아니라 '누르면 일어나는 일'을 적는다 —
     이 자리에서 상태를 적으면(보이는 중) 누르면 뭐가 되는지 매번 한 번 더 생각해야 한다. */
  function paintPwEye() {
    const b = $('#pwEyeBtn');
    if (!b) return;
    b.textContent = pwShow ? '비밀번호 숨기기' : '비밀번호 보기';
  }

  async function load() {
    if (busy) return;
    lock(true);
    setNote($('#stateNote'), '불러오는 중입니다…');
    let res = null;
    try { res = await Api.call('account.list', {}); }
    catch (e) { res = null; }
    lock(false);

    if (res && res.ok) {
      /* 점검 문구를 지운다 — 관리자는 MAINT를 통과하므로, 점검을 켜 둔 채 새로고침하면
         조회는 성공하는데 아까 뜬 점검 안내만 남아 "아직 막혀 있나" 싶게 만든다.
         (#warnNote는 여기서 손대지 않는다 — 중복 경고는 render()가 단독으로 맡는다) */
      maint('');
      /* ★서버(fnAccountList)가 담는 키는 `rows`다★ — 여기서 res.accounts만 읽고 있어
         목록이 늘 비어 보였다. 옛 이름도 함께 받아 두어, 서버 쪽이 어느 이름으로 오든 뜨게 한다. */
      rows = normalize(res.rows || res.accounts);
      dups = findDups(rows);
      /* 목록을 새로 받으면 열려 있던 패널의 계정 객체가 옛 객체를 가리키게 된다.
         비밀번호를 이미 설정한 뒤라면 그 화면을 유지해야 하므로 닫지는 않고, 그대로 둔다. */
      render();
      return;
    }
    /* ★서버가 이 화면을 열어 주지 않았다★ (2026-08-16 지시 §4).
       위 가드는 권한 사본(menus)이 있을 때만 판정한다 — 사본이 비어 통과한 매장 계정은
       여기까지 온다. 서버는 목록을 한 줄도 주지 않았으니, 오류 문구만 남기고 화면에 세워 두는
       대신 위 가드와 같은 자리(안내 → 홈)로 데려간다.
       ★저장 계열(setPassword·setStatus·sync)에는 이 처리를 붙이지 않는다★ — 그쪽 FORBIDDEN은
       "지금 이 조작만 안 된다"이고, 화면을 통째로 걷어내면 방금 설정한 비밀번호를 복사할 자리가
       사라진다. 화면을 여는 조회(account.list)의 거절만 홈 이동 신호로 쓴다. */
    if (res && res.code === 'FORBIDDEN') { deny(); return; }
    const msg = failMsg(res);
    /* 점검 문구는 위 maint()가 앰버 배너에 이미 띄웠다 — 여기서 또 적으면 같은 말이 두 줄 된다.
       (dashboard-app.js와 같은 관례다) */
    if (res && res.code === 'MAINT') { setNote($('#stateNote'), ''); return; }
    if (msg) setNote($('#stateNote'), msg);
  }

  // ---------- 감사로그 (접이식) ----------

  /* 이 섹션은 계정 목록과 완전히 따로 논다 — busy/lock을 공유하지 않고 auditBusy만 쓴다.
     감사로그는 시트를 끝에서부터 읽어 1~3초가 걸리는데, 그 사이 계정 목록의 [비밀번호]·[중지]가
     잠기면 "저녁에 폰으로 그 자리에서 풀어 준다"는 이 화면의 존재 이유가 무너진다. */
  let auditBusy = false;
  let auditLoaded = false;      // 처음 펼칠 때 한 번만 부른다 (자동 폴링 없음)

  function auditRowEl(r) {
    // ★판정은 원문으로 한다★ — 화면 문구(라벨)로 분기하면 매핑표를 손대는 날 조용히 깨진다
    const result = String(r.result == null ? '' : r.result).trim();
    const bad = (result !== '성공');

    const row = document.createElement('div');
    row.className = 'logRow' + (bad ? ' logBad' : '');

    const t = document.createElement('span');
    t.className = 'lt';
    t.textContent = fmtAt(r.at);

    const who = document.createElement('span');
    who.className = 'lw';
    who.textContent = String(r.id || '(익명)');          // 사용자 데이터 — 반드시 textContent

    const what = document.createElement('span');
    what.className = 'la';
    what.textContent = label(ACTION_LABEL, r.action);

    const rs = document.createElement('span');
    rs.className = 'lr';
    /* 결과와 사유는 한 칸에 붙여 둔다 — '막힘'만으로는 무엇을 고쳐야 할지 알 수 없다.
       ★여기서만 라벨로 바꾼다★ — 위 bad 판정은 원문(result)으로 이미 끝났다. */
    rs.textContent = [label(RESULT_LABEL, result), r.reason ? label(REASON_LABEL, r.reason) : '']
      .filter(function (v) { return !!v; }).join(' ');

    row.appendChild(t);
    row.appendChild(who);
    row.appendChild(what);
    row.appendChild(rs);

    /* 둘째 줄(대상 매장·비고)은 있을 때만 만든다. 대상이 행위자와 같으면 적지 않는다 —
       매장이 자기 매장을 저장한 기록이 대부분이라, 그대로 두면 같은 이름이 매 줄 두 번 나온다. */
    const store = String(r.store || '');
    const note = String(r.note || '');
    const detail = [(store && store !== String(r.id || '')) ? store : '', note]
      .filter(function (v) { return !!v; }).join(' · ');
    if (detail) {
      const d = document.createElement('span');
      d.className = 'ld';
      d.textContent = detail;
      row.appendChild(d);
    }
    return row;
  }

  function renderAudit(list) {
    const box = $('#auditList');
    box.innerHTML = '';
    (list || []).forEach(function (r) { if (r) box.appendChild(auditRowEl(r)); });
  }

  async function loadAudit() {
    if (auditBusy) return;
    const onlyDenied = !!$('#onlyDenied').checked;
    auditBusy = true;
    $('#auditReload').disabled = true;
    setNote($('#auditNote'), '불러오는 중입니다…');

    let res = null;
    try {
      res = await Api.call('audit.list', { limit: AUDIT_LIMIT, onlyDenied: onlyDenied });
    } catch (e) { res = null; }
    auditBusy = false;
    $('#auditReload').disabled = false;

    if (!(res && res.ok)) {
      /* 실패해도 이미 그려 둔 로그는 지우지 않는다 — 새로고침 한 번 실패했다고
         보고 있던 표가 사라지면 다시 펼치는 수밖에 없다. */
      const msg = failMsg(res);
      if (msg) setNote($('#auditNote'), msg);
      return;
    }
    auditLoaded = true;
    const list = res.rows || [];
    renderAudit(list);
    setNote($('#auditNote'), list.length
      ? ''
      : (onlyDenied ? '막힌 기록이 없습니다.' : '기록이 없습니다.'));
  }

  /* 펼칠 때 한 번만. ontoggle은 닫을 때도 오므로 open을 본다.
     ★자동 갱신은 넣지 않는다★ — 이 조회는 시트를 읽어 느리고, 켜 두면 화면을 열어 둔 동안
       계정 목록 조작까지 서버 쿼터를 나눠 쓰게 된다. 갱신은 [새로고침]으로 한다. */
  $('#auditBox').addEventListener('toggle', function () {
    if (this.open && !auditLoaded) loadAudit();
  });
  $('#auditReload').onclick = function () { loadAudit(); };
  // 체크박스는 서버 조건이 바뀌는 것이라 다시 부른다(100건을 화면에서 걸러내면 거부가 몇 건 안 남는다)
  $('#onlyDenied').onchange = function () { loadAudit(); };

  // ---------- 조작 ----------

  $('#q').oninput = function () { render(); };
  $('#reloadBtn').onclick = function () { load(); };

  /* 보임/숨김. 서버를 부르지 않는다 — 값은 이미 받아 두었고 화면만 덮는 것이다.
     새로고침해도 유지되도록 이 기기에 기억한다(다른 기기에는 영향이 없다). */
  if ($('#pwEyeBtn')) {
    $('#pwEyeBtn').onclick = function () {
      pwShow = !pwShow;
      savePwShow();
      paintPwEye();
      render();
    };
  }
  paintPwEye();

  $('#syncBtn').onclick = async function () {
    if (busy) return;
    if (!confirm('통합시트의 매장 목록을 읽어 계정을 맞춥니다.\n\n' +
      '· 새로 생긴 매장의 계정이 추가됩니다 (상태 사용 · 비밀번호 미설정)\n' +
      '· 이미 있는 계정은 손대지 않습니다\n' +
      '· 없어진 매장의 계정은 자동으로 지워지지 않습니다 — 필요하면 [중지]로 막아 주세요\n\n계속할까요?')) return;

    /* 열려 있는 비밀번호 패널은 닫지 않는다. 방금 설정한 안내 문구를 아직 복사하지 않았을 수
       있고, 조작 하나가 남의 화면을 치우는 것은 그 자체로 놀랄 일이다(값 자체는 이제 목록에도
       남으므로 잃지는 않는다). 목록을 다시 그려도 패널은 남는다. */
    lock(true);
    $('#syncBtn').textContent = '동기화 중…';
    let res = null;
    try { res = await Api.call('account.sync', {}); }
    catch (e) { res = null; }
    lock(false);
    $('#syncBtn').textContent = '통합시트에서 계정 동기화';

    if (!(res && res.ok)) { const m = failMsg(res); if (m) alert(m); return; }
    /* ★서버(syncStoreAccountsCore)가 주는 added는 '만든 계정 이름의 배열'이다★
       typeof []는 'object'라 숫자로만 받으면 계정을 몇 개 만들어도 항상 0으로 떨어져
       "새로 만들 계정이 없습니다"만 나온다 — 담당자는 동기화가 안 된 줄 알고 반복해서 누른다.
       나중에 서버가 숫자로 바꿔도 그대로 동작하도록 두 형태를 다 받는다. */
    const added = Array.isArray(res.added) ? res.added.length
                : (typeof res.added === 'number' ? res.added : 0);
    alert(added
      ? ('동기화를 마쳤습니다.\n계정 ' + added + '개를 새로 만들었습니다.\n\n새 계정은 비밀번호가 아직 없습니다 — [비밀번호]로 정해 매장에 알려 주세요.')
      : '동기화를 마쳤습니다.\n새로 만들 계정이 없습니다.');
    await load();
  };

  await load();
})();
