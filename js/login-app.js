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

  /* 로그인은 됐는데 세션이 이 기기에 남지 않은 경우를 여기서 잡는다.
     ★안 잡으면 무한 왕복이 된다★ — auth.js의 save()는 저장 실패를 삼키고 메모리 사본으로
       계속한다. 그 상태로 go()를 하면 페이지가 새로 로드되며 사본이 사라지고, 세션이 없는
       홈은 로그인 벽에 걸려 다시 이 화면으로 돌아온다. 사용자 눈에는 "비밀번호는 맞는데
       계속 로그인 화면"으로만 보이고, 원인을 알 방법이 전혀 없다.
       홈의 storageBlocked()는 1바이트 probe라 이 경우(용량 초과)를 잡지 못한다.
     ★벽을 켜기 전에는 아무도 눈치채지 못하던 경로다★ — 홈이 그냥 열렸기 때문이다.
     구버전 auth.js가 캐시에 남아 saved()가 없으면 판정하지 않고 종전대로 진행한다. */
  function keptSession() {
    try {
      if (typeof Auth.saved !== 'function') return true;
      return Auth.saved();
    } catch (e) { return true; }
  }
  const NOT_KEPT = '이 브라우저에 로그인 상태를 저장하지 못했습니다. '
    + '사생활 보호 모드를 끄거나 다른 브라우저에서 다시 시도해 주세요.';

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
      /* '잠겼습니다'라고 하지 않는다 — 대개 오타를 몇 번 낸 것뿐인데 계정이 걸어 잠긴 것처럼
         읽히면 곧장 관리자에게 전화가 온다. 사실(잠시 제한 + 언제 풀리는지)만 적는다. */
      return '보안을 위해 로그인이 잠시 제한되었습니다. ' +
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

  // 세 칸(로그인·설정·변경)이 모두 마크업에 있으므로 한 번만 걸어 두면 된다
  bindMask();

  if (signedIn) toChangePw();
  else initLogin();

  // ---------- ① 로그인 ----------
  /* ★아이디의 정본은 언제나 #lid(직접 입력 칸)다★ — 드롭다운은 거기에 값을 써 넣는 장치일 뿐이다.
     doLogin이 #lid 하나만 읽으면 되므로, 목록이 오든 안 오든 로그인 경로는 한 갈래로 남는다. */
  const MANUAL = '__manual__';   // 매장명과 절대 겹치지 않는 값
  let storeList = [];              // fillStores가 채운 '운영 중인 매장' 목록

  function useManual(on) {
    const box = $('#lidManual');
    if (box) box.style.display = on ? '' : 'none';
  }

  /* #lid가 들고 있는 값을 드롭다운에 맞춰 다시 고른다.
     목록에 있으면 그 항목을 고르고, 없으면(관리자 계정 · 아직 시트에 없는 새 매장)
     직접 입력 칸을 열어 둔다. 목록을 아직 못 받았으면 아무것도 하지 않는다 —
     여기서 성급히 직접 입력 칸을 열면, 잠시 뒤 목록이 도착하며 칸이 닫혀 화면이 덜컥거린다. */
  function syncPick() {
    const sel = $('#lidSel');
    if (!sel) return;
    const cur = String($('#lid').value || '').trim();
    if (!storeList.length) return;
    if (cur && storeList.indexOf(cur) >= 0) { sel.value = cur; useManual(false); return; }
    if (cur) { sel.value = MANUAL; useManual(true); return; }
    sel.value = '';
    useManual(false);
  }

  function initLogin() {
    const savedId = (function () { try { return localStorage.getItem(IDKEY) || ''; } catch (e) { return ''; } })();
    /* 체크박스 기본값은 '켬'이다. 저장되는 값은 매장명(사내 공개 정보)뿐이라 위험이 없고,
       매달 한 번 쓰는 앱에서 한글 매장명을 매번 치게 하는 편이 훨씬 나쁘다.
       공용 기기라 남기고 싶지 않으면 체크를 한 번 풀면 그때 지워진다. */
    if (savedId) $('#lid').value = savedId;

    const sel = $('#lidSel');
    if (sel) {
      sel.onchange = function () {
        const v = sel.value;
        if (v === MANUAL) { $('#lid').value = ''; useManual(true); $('#lid').focus(); return; }
        $('#lid').value = v;
        useManual(false);
        if (v) $('#lpw').focus();
      };
    }
    // 목록은 아직 오지 않았다. 도착하면 fill()이 syncPick()으로 이 값을 다시 맞춘다
    if (savedId) $('#lpw').focus();
  }

  function rememberId(id) {
    const chk = $('#rememberId');
    try {
      if (chk && chk.checked) localStorage.setItem(IDKEY, id);
      else localStorage.removeItem(IDKEY);
    } catch (e) { /* 사생활 모드 등 — 기억하지 못할 뿐 로그인은 끝났다 */ }
  }

  /* 비밀번호 가리기 토글.
     체크(기본) = type을 password로 두어 ●●●로 가리고, 체크를 풀면 text로 바꿔 글자를 그대로 보인다.
     ★기본을 '가림'으로 둔다★ — 매장은 홀에서 폰을 열고, 어깨너머로 보이는 것이 기본값이면 안 된다.
     ★그래도 푸는 길을 남기는 이유★ — 받아 적은 비밀번호를 처음 칠 때 오타를 눈으로 확인할 수
       없으면 "받은 비밀번호로 안 들어가진다"는 문의가 그대로 관리자에게 간다.
     ★상태를 기억하지 않는다★ — 다음에 열 때는 항상 가려진 상태로 시작한다. */
  function bindMask() {
    const boxes = document.querySelectorAll('input[data-mask]');
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      const ids = box.getAttribute('data-mask').split(' ');
      const apply = function () {
        for (let k = 0; k < ids.length; k++) {
          const el = document.getElementById(ids[k]);
          if (el) el.type = box.checked ? 'password' : 'text';
        }
      };
      box.onchange = apply;
      apply();
    }
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
      // 넘어가기 전에 '이 기기에 남았는지'부터 확인한다 (keptSession 주석 참고)
      if (!keptSession()) { show(NOT_KEPT); return; }
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
      if (!keptSession()) { show(NOT_KEPT); return; }
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
     ★공지 배너(속성 NOTICE)도 아래 config.stores 응답에 함께 실려 온다.
       꺼내 그리는 일은 auth.js가 응답이 지나가는 자리에서 이미 하므로 여기서 또 부르지 않는다
       (부르면 로그인 화면에서만 같은 요청이 두 번 나간다). 공지를 못 받으면 그냥 안 뜬다 —
       로그인 자체는 어떤 경우에도 되어야 한다.
     ① 앱에 동봉된 data/master.json으로 먼저 채운다. 오프라인에서도 되고 즉시 뜬다.
     ② 그 다음 config.stores로 실제 목록을 받아 덮어쓴다. 이번 달에 새로 생긴 매장은
        저장본에 없고, 하필 그 매장이 이름을 몰라 전화하는 첫 번째 사용자가 된다.
     ★이 왕복은 점검 모드 탐지도 겸한다 — 비밀번호를 다 치고 나서야 "점검 중"을 보는 것보다
       화면을 열자마자 아는 편이 낫다. 여기서는 문구만 띄우고 버튼은 잠그지 않는다(showMaint 주석 참고). */
  (async function fillStores() {
    // 비밀번호 변경으로 들어온 경우에는 아이디 칸이 아예 없다. 쓸데없는 왕복을 만들지 않는다
    if (mode !== 'login') return;

    function opt(sel, value, text) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;  // 시트에서 온 값이지만 textContent라 마크업으로 해석되지 않는다
      sel.appendChild(o);
    }

    function fill(list) {
      if (!list || !list.length) return false;
      const sel = $('#lidSel');
      if (!sel) return false;
      const names = [];
      for (let i = 0; i < list.length; i++) {
        const name = String(list[i] == null ? '' : list[i]).trim();
        if (name && names.indexOf(name) < 0) names.push(name);
      }
      if (!names.length) return false;
      storeList = names;
      sel.textContent = '';  // 두 번째 호출이면 갈아 끼운다
      opt(sel, '', '— 매장을 골라 주세요 —');
      for (let i = 0; i < names.length; i++) opt(sel, names[i], names[i]);
      /* ★'직접 입력…'을 반드시 남긴다★ — 관리자 계정(admin)은 매장 목록에 없고,
         통합시트에 갓 추가된 매장도 캐시가 도는 동안에는 목록에 없다. 고르는 길만 두면
         그 사람들이 들어올 방법이 사라진다. */
      opt(sel, MANUAL, '직접 입력…');
      syncPick();
      return true;
    }

    /* ★서버 요청을 '먼저 던져 두고' await은 나중에 한다★
       아래 master.json은 fetch라 전파가 나쁜 곳에서는 몇 초가 걸린다. 그 뒤에 요청을
       보내면, auth.js의 autoNotice가 1.5초 뒤에 "아직 공지 액션을 아무도 안 보냈네" 하고
       똑같은 config.stores를 한 번 더 보낸다(noticeSeen은 응답이 아니라 요청 시점에 선다).
       먼저 던져 두면 그 중복이 사라지고, 느린 회선에서는 두 왕복이 겹쳐 오히려 빨라진다.
       ★fill 순서는 그대로다★ — 저장본을 먼저 그리고 서버 응답으로 덮어쓴다(아래 await 순서). */
    /* ★던져 둔 자리에서 곧바로 catch를 붙인다★ — await이 몇 초 뒤에 붙는 사이에 이 프라미스가
       거부되면 브라우저가 '처리되지 않은 거부'로 콘솔을 붉힌다(잡히기는 하는데 이미 늦다). */
    const pending = (function () {
      try {
        return Auth.post('config.stores', {}).catch(function () { return null; });
      } catch (e) { return null; }
    })();

    try {
      /* ★주소에 ?v=N을 붙이지 않는다★ — 서비스워커가 미리 담아 두는 주소는 쿼리가 없는
         'data/master.json'이고, caches.match는 쿼리까지 포함해 정확히 일치할 때만 맞는다.
         ?v=를 붙이면 설치 직후 오프라인 진입에서 캐시를 빗나가 매장 목록이 통째로 빈다.
         게다가 이 숫자는 html의 ?v=N과 따로 놀아, 다음 배포에서 한쪽만 올리면 옛 목록이
         영영 굳는다(버전을 두 곳에서 관리하다 생기는 그 사고다).
         대신 index.html과 같은 방식으로 cache:'no-store'를 써서 항상 최신본을 받는다. */
      const res = await fetch('data/master.json', { cache: 'no-store' });
      const j = await res.json();
      if (j && j.stores) fill(j.stores);
    } catch (e) { /* 저장본을 못 읽어도 그만이다 */ }

    /* ★config.get이 아니라 config.stores다 (v35에서 갈아 끼웠다)★
       config.get은 서버 등록표에서 legacy라 AUTH_ENFORCE='off'인 동안만 토큰 없이 통과한다.
       로그인 화면에는 당연히 토큰이 없으므로, 'on'을 켜는 순간 이 경로가 AUTH_REQUIRED로
       영구히 죽고 자동완성이 앱에 동봉된 master.json에 박제된다 — 그 뒤 시트에서 매장명을
       고치면 자동완성이 '틀린 이름을 적극적으로 제시'하게 되어 자유 입력보다 나빠진다
       ("아이디 또는 비밀번호가 올바르지 않습니다"만 반복된다).
       서버가 그 자리를 이미 열어 두었다 — config.stores는 anon:true라 인증 설정과 무관하게
       통과하고, 매장명 배열 하나만 돌려준다(naPresets는 싣지 않는다).
       ★응답 형태★ Code.gs fnConfigStores → { ok: true, stores: [매장명, …], notice?: {…} }
         config.get과 stores 칸의 모양이 같아서 fill()을 그대로 쓴다. */
    /* ★목록을 끝내 못 받았으면 직접 입력 칸을 연다★ — 드롭다운만 있는 화면에서 목록이 비면
       그 기기에서는 아무도 로그인할 수 없다. 목록은 편의이고 로그인은 업무다.
       두 갈래 출구(점검 모드 return · 정상 종료)에서 모두 불러야 해서 함수로 뺐다. */
    function settle() {
      if (storeList.length) return;
      const sel = $('#lidSel');
      if (sel) { sel.textContent = ''; opt(sel, '', '— 목록을 불러오지 못했습니다 —'); }
      useManual(true);
    }

    try {
      const r = await pending;
      if (r && r.code === 'MAINT') { showMaint(r, false); settle(); return; }
      if (r && r.ok && r.stores) fill(r.stores);
    } catch (e) { /* 오프라인 등 — 위에서 채운 저장본 목록으로 충분하다 */ }
    settle();
    /* 여기서 어떤 실패도 위로 던지지 않는 이유는 블록 첫머리 주석과 같다 —
       자동완성이 비는 것과 로그인이 되지 않는 것은 전혀 다른 사고다. */
  })();
})();
