/* 로그인 화면.
   한 화면에서 세 가지를 처리한다 —
     ① 아이디 + 비밀번호 로그인 (관리자·매장 모두 같은 경로. 매장 아이디는 통합시트 D열 매장명 그대로다)
     ② 비밀번호 설정 (서버가 SET_PW를 줄 때만. 평소에는 쓰이지 않는다 — 비밀번호는 관리자가 정해 알려 준다)
     ③ 이미 로그인한 사람의 비밀번호 변경 (?mode=changepw — 홈 하단 버튼이 여기로 보낸다)
   ★링크(?k=…) 진입은 폐기됐다. 앱 주소를 전원에게 공유하는 구조라 주소에 자격증명을 실을 수 없다.

   ★ 오류를 alert()가 아니라 카드 안 .note(빨강)로 표시한다.
     앱의 다른 화면은 전부 alert()를 쓰지만 로그인만 예외로 둔다 — 로그인은 오타로 반복 입력이
     잦고, 그때마다 alert가 뜨면 확인을 누르는 동작이 매번 끼어 입력 흐름이 끊긴다.
     의도적으로 관례에서 벗어나는 유일한 지점이다.
   ★ 화면 분기는 서버가 준 code 상수로만 한다. 한국어 문구를 비교하면 서버 문구를 다듬는 날 깨진다.
   ★ 비밀번호 원문은 어디에도 저장하지 않는다. 기기에 남기는 것은 아이디 한 줄뿐이다. */
(async function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const IDKEY = 'qsc-login-id-v1';   // 아이디만 기억한다. 비밀번호는 어디에도 저장하지 않는다

  let mode = 'login';   // 'login' | 'setpw' | 'changepw'
  let setupId = '';     // SET_PW로 넘어올 때의 아이디 / 변경 모드의 본인 아이디
  let setupCode = '';   // 그때 입력한 값(=설정코드). 메모리에만 두고 저장하지 않는다
  let busy = false;
  let maintLock = false;   // 점검 모드로 잠긴 상태. 새로고침해야 풀린다(점검이 끝났는지 서버에 다시 물어야 하므로)

  function qs(name) {
    const m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  const next = Auth.safeNext(qs('next'));

  // ok를 주면 빨강(.noteErr) 대신 초록(.noteOk) — 비밀번호 변경 성공을 알리는 데만 쓴다
  function show(text, ok) {
    const el = $('#msg');
    el.textContent = text || '';                 // 서버 문구도 사용자 데이터다 — textContent로만
    el.className = ok ? 'note noteOk' : 'note noteErr';
    el.style.display = text ? 'block' : 'none';
  }
  function lock(on, label) {
    busy = on;
    const b = $('#goBtn');
    // ★점검 잠금이 걸려 있으면 on=false로 풀려 해도 버튼을 다시 열지 않는다
    b.disabled = on || maintLock;
    b.textContent = on ? '확인 중…' : label;
  }
  function go() { location.replace(next); }

  /* 점검 모드(스크립트 속성 MAINT) 안내.
     hard=true는 '로그인 요청 자체가 점검에 막혔다'는 뜻이라 버튼까지 잠근다.
     hard=false는 화면을 열 때 던진 탐지용 요청이 막힌 경우다 — 문구만 띄우고 버튼은 열어 둔다.
     ★관리자는 점검 중에도 통과해야 하는데, 로그인 전에는 누가 관리자인지 알 수 없다.
       여기서 무조건 잠그면 점검을 건 담당자 본인이 들어오지 못한다. */
  function showMaint(r, hard) {
    const el = $('#maint');
    el.textContent = textOf(r) || '지금은 점검 중입니다. 잠시 후 다시 이용해 주세요.';
    el.style.display = 'block';
    if (!hard) return;
    maintLock = true;
    $('#goBtn').disabled = true;
  }

  // 서버는 자리에 따라 error(기능층)와 msg(게이트층)를 섞어 쓴다. 둘 다 본다
  function textOf(r) {
    if (!r) return '';
    return String(r.error || r.msg || '');
  }

  /* 오류 문구. NETWORK와 LOCKED는 서버 문구에 기대지 않고 여기서 만든다 —
     둘을 뭉뚱그리면 "잠긴 건지 인터넷이 끊긴 건지"를 사용자가 알 수 없다. */
  function msgOf(r) {
    if (!r) return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    if (r.code === 'NETWORK') return '네트워크에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
    if (r.code === 'LOCKED') {
      return '로그인 시도가 많아 잠겼습니다. ' +
        (r.retryAfterMin ? r.retryAfterMin + '분 후' : '잠시 후') + ' 다시 시도해 주세요.';
    }
    return textOf(r) || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  // ---------- ③ 비밀번호 변경으로 들어왔는가 (?mode=changepw) ----------
  /* 로그인 상태에서만 의미가 있다. 세션이 없으면 아래 ①로 떨어져 평소대로 로그인부터 한다.
     이 분기를 두지 않으면 홈의 [비밀번호 변경] 버튼이 곧장 ensure() → go()를 타고
     홈으로 되돌아와 무한 왕복이 된다. */
  const wantChg = qs('mode') === 'changepw';

  // ---------- 이미 들어와 있으면 화면을 보여주지 않는다 ----------
  // 세션은 무기한이다. ensure()는 서버에 묻지 않고 저장된 세션만 확인한다
  const signedIn = await Auth.ensure();
  if (signedIn && !wantChg) { go(); return; }

  if (signedIn) toChangePw();
  else initLogin();

  // ---------- ① 로그인 ----------
  function initLogin() {
    const savedId = (function () { try { return localStorage.getItem(IDKEY) || ''; } catch (e) { return ''; } })();
    /* 체크박스 기본값은 '켬'이다. 저장되는 값은 매장명(사내 공개 정보)뿐이라 위험이 없고,
       매달 한 번 쓰는 앱에서 한글 매장명을 매번 치게 하는 편이 훨씬 나쁘다.
       공용 기기라 남기고 싶지 않으면 체크를 한 번 풀면 그때 지워진다. */
    if (savedId) { $('#lid').value = savedId; $('#lpw').focus(); }
    else { $('#lid').focus(); }
  }

  function rememberId(id) {
    const chk = $('#rememberId');
    try {
      if (chk && chk.checked) localStorage.setItem(IDKEY, id);
      else localStorage.removeItem(IDKEY);
    } catch (e) { /* 사생활 모드 등 — 기억하지 못할 뿐 로그인은 끝났다 */ }
  }

  function toSetPw(id, code) {
    mode = 'setpw';
    setupId = id;
    setupCode = code;
    $('#cardTitle').textContent = '비밀번호 설정';
    $('#stepLogin').style.display = 'none';
    $('#stepPw').style.display = 'block';
    $('#goBtn').textContent = '비밀번호 설정';
    $('#np1').focus();
  }

  async function doLogin() {
    /* 아이디 정규화는 Auth.normId 한 곳에서만 한다(서버와 규칙을 맞춰야 하는 값이다).
       ★toLowerCase를 걸지 않는다★ — 아이디가 한글 매장명이라 소문자 개념이 없고,
         영문이 섞인 이름을 소문자로 바꾸면 시트 값과 어긋난다. */
    const id = Auth.normId($('#lid').value);
    const pw = $('#lpw').value;
    if (!id || !pw) { show('아이디와 비밀번호를 입력해 주세요.'); return; }
    $('#lid').value = id;   // 앞뒤 공백을 지운 결과를 눈으로 확인할 수 있게 되돌려 준다

    show('');
    lock(true, '로그인');
    const r = await Auth.login(id, pw);   // 성공하면 Auth가 세션까지 저장한다
    lock(false, '로그인');

    if (r && r.ok && r.token) {
      rememberId(id);
      // 비밀번호를 바꾸러 왔는데 세션이 끊겨 있었던 경우. 홈까지 갔다가 다시 오게 하지 않는다
      if (wantChg) { toChangePw(); return; }
      go();
      return;
    }
    if (r && r.code === 'MAINT') {
      $('#lpw').value = '';
      show('');
      showMaint(r, true);
      return;
    }
    if (r && r.code === 'SET_PW') {
      // 이 응답은 아이디가 실제로 있고 해시가 비어 있을 때만 온다. 입력값이 곧 설정코드다
      show(textOf(r) || '최초 로그인입니다. 새 비밀번호를 정해 주세요.');
      toSetPw(id, pw);
      return;
    }
    $('#lpw').value = '';
    show(msgOf(r));
  }

  // ---------- ② 비밀번호 설정 ----------
  async function doSetPw() {
    const p1 = $('#np1').value;
    const p2 = $('#np2').value;
    // 서버도 같은 규칙으로 다시 검사한다. 여기 검사는 왕복 한 번을 아끼기 위한 것일 뿐이다
    if (p1.length < 8) { show('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (p1 !== p2) { show('두 비밀번호가 서로 다릅니다. 다시 입력해 주세요.'); return; }
    if (Auth.normId(p1) === setupId) { show('아이디와 다른 비밀번호를 정해 주세요.'); return; }
    if (p1 === setupCode) { show('발급받은 설정코드와 다른 비밀번호를 정해 주세요.'); return; }

    show('');
    lock(true, '비밀번호 설정');
    const r = await Auth.post('auth.setPassword', { id: setupId, setupCode: setupCode, newPw: p1 });
    lock(false, '비밀번호 설정');

    if (r && r.ok && r.token) {
      // 설정에 성공하면 서버가 토큰을 함께 준다 — 다시 로그인시키지 않는다
      Auth.save(r);
      rememberId(setupId);
      go();
      return;
    }
    $('#np1').value = '';
    $('#np2').value = '';
    if (r && r.code === 'MAINT') { show(''); showMaint(r, true); return; }
    show(msgOf(r));
  }

  // ---------- ③ 비밀번호 변경 (로그인 상태) ----------
  function toChangePw() {
    mode = 'changepw';
    setupId = ((Auth.user() || {}).id) || '';
    $('#cardTitle').textContent = '비밀번호 변경';
    $('#stepLogin').style.display = 'none';
    $('#stepChg').style.display = 'block';
    $('#goBtn').textContent = '비밀번호 변경';
    $('#loginFoot').textContent = '바꾸지 않으시려면 뒤로 가기를 눌러 주세요.';
    $('#cp0').focus();
  }

  async function doChangePw() {
    const cur = $('#cp0').value;
    const p1 = $('#cp1').value;
    const p2 = $('#cp2').value;
    if (!cur) { show('현재 비밀번호를 입력해 주세요.'); return; }
    if (p1.length < 8) { show('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (p1 !== p2) { show('두 비밀번호가 서로 다릅니다. 다시 입력해 주세요.'); return; }
    if (p1 === cur) { show('지금 쓰고 계신 비밀번호와 다르게 정해 주세요.'); return; }
    if (setupId && Auth.normId(p1) === setupId) { show('아이디와 다른 비밀번호를 정해 주세요.'); return; }

    show('');
    lock(true, '비밀번호 변경');
    // ★본인 변경 경로는 토큰으로 신원을 확인한다 — 세 번째 인자를 빠뜨리면 서버가 익명으로 본다
    const r = await Auth.post('auth.setPassword',
      { id: setupId, curPw: cur, newPw: p1 }, Auth.token());
    lock(false, '비밀번호 변경');

    if (r && r.ok) {
      $('#cp0').value = ''; $('#cp1').value = ''; $('#cp2').value = '';
      /* 비밀번호가 바뀌면 서버가 그 계정의 기존 토큰을 전부 죽인다(자격증명 지문이 바뀐다).
         무기한 세션의 강제 로그아웃 수단 ①이 바로 이것이다.
         그래서 새 토큰을 함께 주면 갈아 끼우고, 주지 않으면 들고 있는 토큰이 이미 죽은 것이므로
         세션을 버리고 새 비밀번호로 다시 로그인하게 한다 — 그대로 next로 보내면
         다음 화면이 곧바로 AUTH_INVALID를 맞고 원인 모를 오류처럼 보인다. */
      if (r.token) {
        Auth.save(r);
        show('비밀번호를 변경했습니다.', true);
        setTimeout(go, 1200);        // 바로 넘기면 바뀐 것을 확인할 틈이 없다
      } else {
        Auth.clear();
        show('비밀번호를 변경했습니다. 새 비밀번호로 다시 로그인해 주세요.', true);
        setTimeout(function () { location.replace('login.html?next=' + encodeURIComponent(next)); }, 1500);
      }
      return;
    }
    $('#cp0').value = '';
    $('#cp1').value = '';
    $('#cp2').value = '';
    if (r && r.code === 'MAINT') { show(''); showMaint(r, true); return; }
    show(msgOf(r));
  }

  $('#loginForm').onsubmit = function (ev) {
    ev.preventDefault();              // 기본 GET 제출을 막지 않으면 비밀번호가 주소창에 실린다
    if (busy || maintLock) return;
    if (mode === 'setpw') doSetPw();
    else if (mode === 'changepw') doChangePw();
    else doLogin();
  };

  /* ---------- 매장명 자동완성 + 점검 모드 탐지 + 공지 ----------
     로그인 전이라 토큰이 없다. 그래서 이 블록은 통째로 '실패해도 되는' 코드다 —
     자동완성이 비는 것과 로그인이 막히는 것은 전혀 다른 사고라, 어떤 실패도 위로 던지지 않는다.
     ★공지 배너(속성 NOTICE)도 아래 config.get 응답에 함께 실려 온다.
       꺼내 그리는 일은 auth.js가 응답이 지나가는 자리에서 이미 하므로 여기서 또 부르지 않는다
       (부르면 로그인 화면에서만 같은 요청이 두 번 나간다). 공지를 못 받으면 그냥 안 뜬다 —
       로그인 자체는 어떤 경우에도 되어야 한다.
     ① 앱에 동봉된 data/master.json으로 먼저 채운다. 오프라인에서도 되고 즉시 뜬다.
     ② 그 다음 config.get으로 실제 목록을 받아 덮어쓴다. 이번 달에 새로 생긴 매장은
        저장본에 없고, 하필 그 매장이 이름을 몰라 전화하는 첫 번째 사용자가 된다.
     ★이 왕복은 점검 모드 탐지도 겸한다 — 비밀번호를 다 치고 나서야 "점검 중"을 보는 것보다
       화면을 열자마자 아는 편이 낫다. 여기서는 문구만 띄우고 버튼은 잠그지 않는다(showMaint 주석 참고). */
  (async function fillStores() {
    // 비밀번호 변경으로 들어온 경우에는 아이디 칸이 아예 없다. 쓸데없는 왕복을 만들지 않는다
    if (mode !== 'login') return;

    function fill(list) {
      if (!list || !list.length) return false;
      const dl = $('#storeIds');
      if (!dl) return false;
      dl.textContent = '';   // 두 번째 호출이면 갈아 끼운다
      for (let i = 0; i < list.length; i++) {
        const name = String(list[i] == null ? '' : list[i]).trim();
        if (!name) continue;
        const o = document.createElement('option');
        o.value = name;      // 시트에서 온 값이지만 value 대입은 마크업으로 해석되지 않는다
        dl.appendChild(o);
      }
      return true;
    }

    try {
      /* ★주소에 ?v=32를 붙이지 않는다★ — 서비스워커가 미리 담아 두는 주소는 쿼리가 없는
         'data/master.json'이고, caches.match는 쿼리까지 포함해 정확히 일치할 때만 맞는다.
         ?v=를 붙이면 설치 직후 오프라인 진입에서 캐시를 빗나가 매장 목록이 통째로 비었다.
         게다가 이 숫자는 html의 ?v=N과 따로 놀아, 다음 배포에서 한쪽만 올리면 옛 목록이
         영영 굳는다(버전을 두 곳에서 관리하다 생기는 그 사고다).
         대신 index.html과 같은 방식으로 cache:'no-store'를 써서 항상 최신본을 받는다. */
      const res = await fetch('data/master.json', { cache: 'no-store' });
      const j = await res.json();
      if (j && j.stores) fill(j.stores);
    } catch (e) { /* 저장본을 못 읽어도 그만이다 */ }

    try {
      // config.get은 서버 등록표에서 legacy라 AUTH_ENFORCE='off'인 동안 토큰 없이 통과한다
      const r = await Auth.post('config.get', {});
      if (r && r.code === 'MAINT') { showMaint(r, false); return; }
      if (r && r.ok && r.stores) fill(r.stores);
    } catch (e) { /* 인증이 켜졌거나 오프라인 — 저장본 목록으로 넘어간다 */ }
    /* ⚠AUTH_ENFORCE를 'on'으로 올리는 날 이 두 번째 경로가 영구히 죽는다 —
       로그인 화면에는 토큰이 없으므로 config.get이 AUTH_REQUIRED로 거절된다.
       그러면 자동완성 목록이 앱에 동봉된 master.json에 박제되고, 시트에서 매장명을 고친 뒤에는
       '틀린 이름을 적극적으로 제시하는' 상태가 된다(자유 입력보다 나쁘다).
       조치는 둘 중 하나이며 서버 쪽 일이라 여기서 하지 않는다 —
         ① 등록표에 매장명 배열만 돌려주는 익명 액션(anon)을 하나 두거나
         ② 배포할 때마다 master.json을 통합시트에서 다시 뽑는 절차를 매뉴얼에 못박거나.
       ①이 생기면 위 config.get 자리를 그 액션으로 바꾸기만 하면 된다. */
  })();
})();
