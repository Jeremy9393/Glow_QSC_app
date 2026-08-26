/* 매장 QSC현황 — 명세 §11(서버 로직) · §12-5(store.html) · §9(시트 결합 안전 규칙)
   쓰는 사람은 매장 점장·매니저이고 도구는 폰이다. 시트를 어려워해서 앱을 만드는 것이므로,
   화면에서 고칠 수 있는 것은 '매장이 채워야 하는 칸'뿐이어야 한다.

   ★ 말투가 기능이다 ★ — 이 화면은 감사 결과를 매장 사람에게 직접 보여 준다.
     같은 내용도 '지적/적발/미조치'로 적으면 사람을 깎는 문서가 되고, '개선요청사항/시작 전'으로
     적으면 할 일 목록이 된다. 목적은 개선이지 서열이 아니므로 화면 문구는 전부 후자로 쓴다.
     시트에 쓰는 값과 서버가 주는 값은 그대로 두고(남의 시트다), 표시할 때만 바꿔 적는다.

   ★ 본사 영역(NO·구분·본사 사진·개선요청 본문)은 disabled input이 아니라 아예 입력 요소가 아니다.
     서버가 K열 미만을 쓰지 않는 것(§8-3 방어④)과 짝을 이루는 화면 쪽 장치다.
     disabled input은 개발자도구로 한 번 푸는 것으로 '고칠 수 있는 것처럼' 보이게 되고,
     그 순간 매장은 본사가 적은 개선요청 본문을 고치려고 시도한다.
   ★ 제출 버튼이 없다. 점장과 부점장이 같은 화면을 동시에 여는 일이 실제로 있어(아이디 공용)
     전체 저장은 서로의 입력을 지운다. 저장 단위는 항목 1건이고 충돌은 rev로 잡는다.
   ★ 임시저장에 사진 base64를 절대 넣지 않는다 — localStorage 용량(대개 5MB)을 한 장으로 태운다. */
(async function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };

  const DRAFT_KEY = 'qsc-store-draft-v1';
  const SNAP_KEY = 'qsc-store-snap-v1';
  const SNAP_MAX = 6;                     // 매장 여러 곳을 오가도 스냅샷이 무한히 쌓이지 않도록

  /* codes-app.js:15의 cycle()을 그대로 옮겨 왔다(§12-3-5).
     공용 파일을 새로 만들면 sw.js 캐시 목록·로드 순서가 늘어나므로 복사가 더 싸다. */
  function cycle(d) {
    d = d || new Date();
    return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0');
  }
  function ymLabel(ym) {
    if (!/^\d{4}$/.test(String(ym))) return String(ym || '');
    return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월';
  }
  /* 서버(store.get)는 예정일을 'yyyy-MM-dd'로 준다 — 스프레드시트 타임존으로 계산된 값이다.
     폰 한 줄에 연도까지 들어갈 자리가 없고 어차피 보고 있는 달과 같은 해라 '10/15'로 줄인다.
     ★자르기만 한다. 여기서 날짜를 다시 계산하면 기기 시계·시간대가 끼어들어
       §5가 막으려던 '월초에 하루 어긋남'이 그대로 돌아온다. 못 읽으면 받은 문자열 그대로 적는다. */
  function dueLabel(v) {
    const s = String(v == null ? '' : v);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? (Number(m[2]) + '/' + Number(m[3])) : s;
  }
  function num1(v) { return (typeof v === 'number') ? v.toFixed(1) : '—'; }
  function ratePct(v) { return (typeof v === 'number') ? Math.round(v * 100) + '%' : '—'; }
  function cnt(v) { return (typeof v === 'number') ? v : 0; }
  function str(v) { return v == null ? '' : String(v); }
  function online() { return navigator.onLine !== false; }

  // ---------- 상태 ----------
  let scope = { all: false, list: [] };   // Auth.stores() 사본 — 화면 조립용일 뿐 권한 판정은 서버가 한다
  let curStore = '';
  let curYm = '';
  let data = null;                        // 마지막 store.get 응답
  let fromSnap = false;                   // 지금 화면이 스냅샷(지난번 받아 둔 사본)인가
  /* 그 스냅샷을 ★전파가 되는 곳에서★ 띄워 둔 채 서버 응답을 기다리는 중인가.
     fromSnap 하나로는 '지금 오프라인이다'와 '지금 받아오는 중이다'가 구별되지 않는데,
     둘에 같은 문구를 쓰면 멀쩡히 연결된 매장이 '오프라인'이라는 글자를 보고 본사에 전화한다.
     저장을 잠그는 판정(writable)은 둘 다 같으므로 이 변수는 ★문구를 가르는 데만★ 쓴다. */
  let revalidating = false;
  let loading = false;
  let maint = '';                         // 점검 모드 문구 (''이면 점검 아님)
  let modes = [];                         // 그려져 있는 항목 카드들의 applyMode 목록

  /* 점검 모드 — 서버 스크립트 속성 MAINT에 문구가 들어 있는 동안 모든 요청이 code:'MAINT'로 막힌다.
     관리자 역할만 통과하므로 이 화면에서 이 코드를 보는 사람은 사실상 매장이다.
     ★오류로 취급하지 않는다. 고장이 아니라 잠깐 멈춘 것이고, 매장이 '앱이 깨졌다'고 판단해
       시트를 직접 열기 시작하면 §9의 결합 안전 규칙이 통째로 무너진다. */
  function showMaint(msg) {
    maint = str(msg);
    const el = $('#maintNote');
    el.textContent = maint;               // 서버가 담당자에게 받아 적어 둔 문구 — 반드시 textContent
    el.style.display = maint ? '' : 'none';
    refreshModes();                       // 저장 버튼 잠금/해제를 이미 그려진 카드에도 즉시 반영
  }
  function refreshModes() {
    modes.forEach(function (f) { try { f(); } catch (e) { /* 카드 하나가 죽어도 나머지는 그린다 */ } });
  }

  function showState(msg) {
    const el = $('#stateNote');
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = '';
    el.textContent = msg;                 // 서버 문구·매장명이 섞이므로 textContent
  }
  function clearBody() {
    $('#sumCard').style.display = 'none';
    $('#items').innerHTML = '';
    modes = [];                           // 카드를 지웠으므로 죽은 applyMode를 남기지 않는다
    $('#listNote').textContent = '';
    $('#bbRate').textContent = '—';
    $('#bbProg').textContent = '완료 0 / 개선요청 0';   // store.html의 초기값과 같은 문구여야 한다
  }
  /* ?next= 화이트리스트는 auth.js 한 곳이 정본이다(§5-1). 여기서 주소를 직접 조립하면
     화이트리스트가 바뀔 때 이 파일만 옛 주소로 남는다. */
  function goLogin() {
    location.replace((Auth.loginUrl && Auth.loginUrl()) || 'login.html?next=store.html');
  }

  /* 권한이 없는 사람이 이 주소를 직접 열었을 때.
     ★빈 화면으로 두지 않는다★ — 안내문 한 줄만 남은 회색 화면은 '앱이 고장 났다'로 읽히고,
       그러면 매장은 시트를 직접 열어 보려 한다(§9의 결합 안전 규칙이 거기서 무너진다).
     ★즉시 튕기지도 않는다★ — 화면이 순식간에 바뀌면 왜 못 들어갔는지 읽을 새가 없어
       "눌렀는데 홈으로 돌아가요"라는 문의만 남는다. 이유를 읽을 시간을 준 뒤 홈으로 옮긴다.
     자동 이동이 막히는 경우(구형 웹뷰·타이머 정지)를 대비해 누를 수 있는 버튼도 함께 둔다. */
  let denied = false;
  function denyHome(msg) {
    if (denied) return;                   // 응답이 여러 번 와도 안내와 타이머는 한 번만
    denied = true;
    clearBody();
    /* 문구는 auth.js의 denyHome(:326)이 정본이고 여기서는 한 글자까지 같은 말을 쓴다 —
       같은 상황에 화면마다 다른 문장이 뜨면 매장은 '다른 문제'로 받아들여 따로 문의한다.
       그 문구도 '홈으로 이동합니다'로 끝나 예고 조건('곧 화면이 바뀐다')을 이미 만족한다.
       ★Auth.denyHome()을 그대로 부르지 않는 이유★ — 그 함수는 .wrap만 갈아 끼우는데
         이 화면은 개선율 하단바가 .wrap 밖에 있어, 볼 수 없는 매장의 '완료 0 / 개선요청 0'이
         그대로 남는다. 이 화면 가구까지 치우는 아래 코드가 필요하다. */
    showState(msg || '이 화면을 볼 수 있는 권한이 없습니다. 홈으로 이동합니다.');
    $('#pickCard').style.display = 'none';
    const foot = document.querySelector('.bottombar');
    if (foot) foot.style.display = 'none';   // 저장할 것이 없는 화면에 개선율 하단바를 남기지 않는다

    const host = document.querySelector('.wrap');
    if (host && !document.getElementById('denyHome')) {
      const b = document.createElement('button');
      b.id = 'denyHome';
      b.type = 'button';
      b.className = 'backBtn';            // auth.js가 붙이는 하단 '← 뒤로'와 같은 모양
      b.textContent = '홈으로 가기';
      b.onclick = function () { location.replace('index.html'); };
      host.appendChild(b);
    }
    // replace다 — 뒤로가기로 이 화면에 다시 갇히지 않게
    setTimeout(function () { location.replace('index.html'); }, 3000);
  }

  // ---------- 세션 ----------
  /* auth.js·api.js는 최상위 const로 선언되어 window에 붙지 않는다(브라우저 규격).
     window.Auth로 확인하면 파일이 정상 로드돼도 '없다'고 판정한다 — typeof로 봐야 한다. */
  if (typeof Auth === 'undefined' || typeof Api === 'undefined') {
    showState('앱을 새로 고쳐 주세요 (앱 종료 후 다시 실행).');
    return;
  }

  /* 이 화면이 읽는 쿼리는 ym·store 둘뿐이다. 주소로 자격증명을 넘겨받는 경로는 없다 —
     앱 주소를 회사 관련자 전원에게 공유하는 구조라, 주소에 실린 자격증명은 곧 전원에게 열린 문이다.
     매장도 아이디(매장명) + 비밀번호로 login.html에서 들어온다.
     그래서 주소를 다시 쓰는(history.replaceState) 코드도 여기 없다 — 지울 것이 없다. */
  const q = new URLSearchParams(location.search);

  let sessionOk = false;
  try { sessionOk = !!(await Auth.ensure()); } catch (e) { sessionOk = false; }
  /* 시트에서 역할·담당 매장을 고치면 여기서 반영된다(§7-3 auth.session).
     store.get보다 앞에 두는 이유: 매장 선택 드롭다운을 옛 목록으로 그려 두면
     방금 담당에서 빠진 매장을 골라 SCOPE_DENIED를 맞는다. */
  /* ★10분 안에 받은 사본이면 서버에 다시 묻지 않는다 (2026-08-16)★
     이 줄과 아래 load()의 store.get이 완전 순차라, 여기서 왕복 하나를 아끼면 화면이 그만큼
     빨리 뜬다(왕복 1회 ≈ 2초). 홈에서 카드를 눌러 들어오는 흔한 동선에서는 방금 홈이
     받아 둔 값이라 거의 항상 건너뛴다. 근거와 안전성은 auth.js의 sync() 주석에 적어 두었다.
     ★인자를 지우면 종전 동작으로 돌아간다★ — 되돌리기가 이 한 숫자다. */
  if (sessionOk && online()) { try { await Auth.sync(600); } catch (e) { /* 실패해도 기존 세션으로 진행 */ } }
  scope = (Auth.stores && Auth.stores()) || { all: false, list: [] };
  scope.list = scope.list || [];

  /* 오프라인이면 Auth.ensure()가 실패할 수밖에 없다(로그인은 네트워크가 필요하다).
     저장해 둔 세션이 있으면 로그인 화면으로 튕기지 않고 스냅샷을 보여준다 —
     지하 매장에서 화면이 로그인으로 바뀌는 것이 이 앱에서 가장 비싼 사고다. */
  if (!sessionOk && (online() || !scope.list.length)) { goLogin(); return; }

  if (!Auth.hasMenu('store')) {
    denyHome();                           // 문구는 denyHome 기본값 한 곳에서만 관리한다
    return;
  }

  // ---------- 매장·월 선택 ----------
  const qYm = q.get('ym');
  const qStore = q.get('store');

  curYm = /^\d{4}$/.test(str(qYm)) ? qYm : cycle();

  if (scope.list.length > 1) {
    /* 담당 매장이 2곳 이상일 때만 드롭다운을 그린다. 지역담당·관리자가 생기면
       계정 D열에 매장을 더 적는 것만으로 여기가 저절로 나타난다(코드 무변경). */
    const sel = $('#storeSel');
    scope.list.forEach(function (s) {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      sel.appendChild(o);
    });
    curStore = (qStore && scope.list.indexOf(qStore) >= 0) ? qStore : scope.list[0];
    sel.value = curStore;
    $('#storeBox').style.display = '';
    sel.onchange = function () { curStore = sel.value; load(); };
  } else {
    curStore = scope.list[0] || '';
    $('#whoInfo').textContent = curStore;
  }

  $('#ymSel').onchange = function () { curYm = $('#ymSel').value; load(); };

  /* ---------- [월 채점 확정] — ★본사에게만 만들어진다★ ----------
     매장 화면에는 이 버튼이 존재하지 않는다(감추는 것이 아니라 만들지 않는다).
     ★반드시 미리보기를 먼저 보여 준다★ — 무엇이 확정되고 무엇이 이월되는지 읽고 누르게 한다.
     한 번 누르면 점수가 굳고 시트가 잠긴다. */
  function paintClose() {
    const box = $('#closeBox');
    if (!box) return;
    if (!canAudit() || !(data && data.items)) { box.style.display = 'none'; return; }
    box.style.display = '';
    const done = closedAt();
    $('#closeNote').textContent = done
      ? (curYm.slice(0,2) + '/' + curYm.slice(2) + ' 채점이 ' + done + '에 확정되었습니다')
      : '확정하면 점수가 굳고 시트가 잠깁니다 (이월 건의 매장 칸만 열립니다)';
    $('#closeBtn').disabled = !!done;
    $('#closeBtn').textContent = done ? '확정됨' : '월 채점 확정';
  }
  const closeBtn = $('#closeBtn');
  if (closeBtn) closeBtn.onclick = async function () {
    closeBtn.disabled = true;
    const pre = await Api.call('month.close', { store: curStore, ym: curYm })
      .catch(function () { return null; });
    closeBtn.disabled = false;
    if (!(pre && pre.ok)) {
      alert('미리보기를 불러오지 못했습니다.\n' + ((pre && pre.error) || '잠시 후 다시 시도해 주세요.'));
      return;
    }
    const lines = (pre.plan || []).join('\n');
    if (!confirm(curStore + ' ' + curYm.slice(0,2) + '/' + curYm.slice(2) + ' 채점을 확정할까요?\n\n'
      + lines + '\n\n★확정하면 점수가 굳고 되돌릴 수 없습니다.★')) return;
    closeBtn.disabled = true;
    closeBtn.textContent = '확정하는 중…';
    const r = await Api.call('month.close', { store: curStore, ym: curYm, apply: true })
      .catch(function () { return null; });
    if (!(r && r.ok)) {
      closeBtn.disabled = false; closeBtn.textContent = '월 채점 확정';
      alert('확정하지 못했습니다.\n' + ((r && r.error) || '잠시 후 다시 시도해 주세요.'));
      return;
    }
    alert('확정했습니다.\n\n개선율 ' + (r.rate && r.rate.rate != null ? Math.round(r.rate.rate * 100) + '%' : '—')
      + '\n이월 ' + r.rolled + '건\n' + (r.lock || ''));
    load();
  };
  $('#reloadBtn').onclick = function () { load(); };
  // 다시 연결되면 스냅샷 화면을 실제 값으로 바꿔 준다 (저장 버튼도 그때 살아난다)
  window.addEventListener('online', function () { if (fromSnap) load(); });

  // ---------- 임시저장 (사진 제외) ----------
  function draftAll() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (e) { return {}; } }
  function draftKey(no) { return (curStore || '-') + '|' + curYm + '|' + no; }
  function draftSave(map) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(map)); } catch (e) { /* 용량 초과 등 — 임시저장은 실패해도 업무가 멈추지 않는다 */ } }
  function draftPut(no, v) { const a = draftAll(); a[draftKey(no)] = v; draftSave(a); }
  function draftDel(no) { const a = draftAll(); delete a[draftKey(no)]; draftSave(a); }

  // ---------- 오프라인 스냅샷 ----------
  function snapAll() { try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '{}'); } catch (e) { return {}; } }
  function snapKey() { return (curStore || '-') + '|' + curYm; }
  function snapGet() { return snapAll()[snapKey()] || null; }
  function snapPut(res) {
    const a = snapAll();
    const copy = JSON.parse(JSON.stringify(res));
    copy._at = Date.now();
    a[snapKey()] = copy;
    const keys = Object.keys(a);
    if (keys.length > SNAP_MAX) {
      keys.sort(function (x, y) { return (a[x]._at || 0) - (a[y]._at || 0); });
      while (keys.length > SNAP_MAX) delete a[keys.shift()];
    }
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(a)); } catch (e) { /* 무시 */ }
  }

  // ---------- 불러오기 ----------
  function handleErr(res) {
    const code = res && res.code;

    /* 점검 모드. 표는 비우되 로그인으로 보내지 않고, 안내 문구를 상단에 남긴다. */
    if (code === 'MAINT') {
      clearBody();
      showState('');
      showMaint(str(res && res.error) || '지금은 점검 중입니다. 잠시 후 다시 열어 주세요.');
      return;
    }

    /* AUTH_*는 자동 재로그인 수단이 없어진 뒤로 '정말 다시 로그인해야 하는 상태'만 뜻한다.
       ★세션은 무기한이라(로그아웃 전까지 유지) 이 경로는 사실상 세 가지 경우에만 탄다:
         ① 관리자가 비밀번호를 바꿔 credFingerprint가 달라졌을 때
         ② 계정 상태를 '중지'로 돌렸을 때
         ③ 스크립트 속성 TOKEN_MINV를 올려 전원을 강제 로그아웃시켰을 때
       셋 다 '이 사람을 지금 끊어야 한다'는 뜻이므로, 조용히 되돌려 보내지 말고 로그인 화면을 보여야 한다.
       FORBIDDEN·SCOPE_DENIED는 이동하지 않는다(§7-1) — 로그인해도 달라지지 않는 문제다. */
    if (code === 'AUTH_REQUIRED' || code === 'AUTH_EXPIRED' || code === 'AUTH_INVALID') {
      if (Auth.clear) Auth.clear();
      goLogin();
      return;
    }

    /* 불러오기 단계의 FORBIDDEN은 '이 계정에 이 화면 권한이 없다'는 뜻이다(서버 액션 등록표 판정).
       화면 쪽 hasMenu 검사를 통과했는데 여기까지 왔다면 세션 사본이 낡았다는 뜻이므로,
       화면 사본을 믿지 말고 서버 판정대로 안내한 뒤 홈으로 보낸다.
       ★저장 단계의 FORBIDDEN은 여기로 오지 않는다★ — 그쪽은 '조회 전용 기간'이라는
         전혀 다른 뜻이고(§ 서버 store.saveImprove), 홈으로 보내면 적어 둔 내용이 날아간다. */
    if (code === 'FORBIDDEN') {
      denyHome();                         // 위와 같은 문구여야 한다 — 인자를 주지 않는 것이 그 방법이다
      return;
    }
    /* SCOPE_DENIED는 '담당하지 않는 매장을 골랐다'는 뜻이다 — 화면 권한 자체는 있으므로
       홈으로 보내지 않는다. 담당 매장이 여럿인 사람은 드롭다운에서 다른 곳을 고르면 된다. */

    showState(str(res && res.error) || '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    clearBody();
  }

  async function load() {
    if (loading) return;
    loading = true;
    showState('');
    $('#listNote').textContent = '불러오는 중…';

    const payload = { ym: curYm };
    // 담당 매장이 1곳이면 서버가 payload.store를 아예 읽지 않는다(§8-3). 보낼 이유가 없다.
    if (scope.list.length > 1 && curStore) payload.store = curStore;

    /* ★지난번 받아 둔 사본을 먼저 그려 둔다 (2026-08-26)★
       store.get 왕복이 2초, 잠들어 있던 서버면 11초다. 그동안 '불러오는 중…' 한 줄뿐이면
       매장은 멈춘 줄 알고 다시 누르거나 앱을 닫는다 — 손에 목록을 들고 있으면서
       빈 화면을 보여 줄 이유가 없다. 응답이 오면 아래에서 실데이터로 다시 그린다.
       ★오프라인이면 하지 않는다★ — 그때는 아래 스냅샷 분기가 '오프라인' 문구까지 붙여
         그리므로, 여기서 미리 그리면 같은 화면을 두 번 그리고 문구만 엇갈린다.
       ★paintClose()는 부르지 않는다★ — [월 채점 확정]은 되돌릴 수 없는 버튼이라
         옛 사본의 확정 여부로 켜 두면 안 된다. 실데이터가 온 뒤에만 판단한다. */
    if (online()) {
      const pre = snapGet();
      /* ★'탭이 아직 없다'는 사본은 미리 그리지 않는다★ — 그 응답도 ok라서 사본으로 남는데
         (서버 store.get: exists:false + items:[]), 그리면 renderAll()이 화면을 비운 자리에
         '아래는 지난번에 받아 둔 내용입니다'만 남아 없는 것을 가리키는 문장이 된다.
         보여 줄 것이 없으면 종전대로 '불러오는 중…' 한 줄로 기다리는 편이 맞다. */
      if (pre && pre.exists !== false) {
        data = pre; fromSnap = true; revalidating = true;
        renderAll();                      // 저장·검수는 writable()·canAudit()이 fromSnap을 보고 잠근다
        // 낡은 사본을 최신인 양 보여주지 않으려면, 지금 무엇을 보고 있는지 글로 말해 줘야 한다
        showState('최신 내용을 불러오는 중입니다… 아래는 지난번에 받아 둔 내용입니다.');
        /* 달·매장을 바꿔 다시 부른 경우, 직전 달의 확정 안내가 남아 이번 달 것처럼 읽힌다.
           paintClose()를 부르는 대신 접어 둔다 — 켜는 판단은 실데이터 몫이다. */
        const closeBox = $('#closeBox');
        if (closeBox) closeBox.style.display = 'none';
      }
    }

    let res = null;
    if (online()) {
      try { res = await Api.call('store.get', payload); } catch (e) { res = null; }
    }
    loading = false;
    revalidating = false;                 // 응답이 왔든 실패했든 '받아오는 중'은 여기서 끝난다
    $('#listNote').textContent = '';

    // api.js는 던지지 않고 code:'NETWORK'로 돌려준다 — 오프라인 판정은 이 코드까지 봐야 한다
    if (!res || res.code === 'NETWORK') {
      const snap = snapGet();
      if (snap) {
        data = snap; fromSnap = true;
        renderAll();
        showState('오프라인 — 마지막으로 받아둔 화면입니다. 저장은 전파가 되는 곳에서 해 주세요.');
      } else {
        clearBody();
        showState('오프라인이라 불러오지 못했습니다. 전파가 되는 곳에서 다시 열어 주세요.');
      }
      return;
    }
    if (!res.ok) { handleErr(res); return; }

    // 여기까지 왔으면 서버가 정상 응답한 것이다 — 점검이 풀렸다는 뜻이므로 안내를 내린다
    if (maint) showMaint('');
    data = res; fromSnap = false;
    snapPut(res);
    renderAll();
    paintClose();
  }

  // ---------- 그리기 ----------
  function renderYmSel() {
    const sel = $('#ymSel');
    const months = (data && data.months && data.months.length) ? data.months.slice() : [];
    // 아직 탭이 없는 달을 보고 있을 수도 있으므로 현재 선택값은 항상 목록에 넣는다
    if (months.indexOf(curYm) < 0) months.unshift(curYm);
    sel.innerHTML = '';
    months.forEach(function (m) {
      const o = document.createElement('option');
      o.value = m; o.textContent = ymLabel(m);
      sel.appendChild(o);
    });
    sel.value = curYm;
  }

  /* ★검수는 본사만 한다★ — improve.audit의 서버 권한(menu:'accounts')과 ★같은 어휘★를 쓴다.
     여기서 역할 이름('관리자')을 비교하지 않는다. 두 곳이 다른 근거로 판정하면, 시트에서
     권한을 거둔 뒤에도 버튼은 남아 눌리고 서버에서만 막히는 상태가 된다. */
  /* ★스냅샷 화면에서는 검수 칸을 만들지 않는다(!fromSnap)★ — 서버(fnImproveAudit)에 확정월
     가드가 없어서, '이 달은 이미 확정됐다'를 막는 것은 이 화면의 closedAt() 하나뿐이다.
     옛 사본의 closedAt으로 판정하면 확정된 달을 다시 검수해 굳은 점수와 화면이 갈라진다.
     실데이터가 온 뒤 paintAudit()이 다시 불리므로, 늦게 켜질 뿐 사라지지 않는다. */
  function canAudit() {
    try { return !!(Auth.can('accounts', '쓰기') && !maint && online() && !fromSnap); } catch (e) { return false; }
  }

  /* 이 달이 확정되었나 — 서버(store.get)가 준 값만 본다. 화면이 날짜로 추측하지 않는다. */
  function closedAt() { return (data && str(data.closedAt)) || ''; }

  function writable() {
    // 하나라도 아니면 저장할 수 없다: 점검 아님 · 역할 권한 · 서버 조회전용 아님 · 실데이터 · 온라인
    return !!(!maint && Auth.can('store', '쓰기') && data && !data.readOnly && !fromSnap && online());
  }

  function renderAll() {
    renderYmSel();

    if (data.exists === false) {
      clearBody();
      showState(str(data.error) || (ymLabel(curYm) + ' 탭이 아직 만들어지지 않았습니다. 본사 담당자에게 문의해 주세요.'));
      return;
    }
    if (!fromSnap) {
      if (data.readOnly) showState('지금은 조회만 가능합니다. 개선보고 입력은 준비되는 대로 열립니다.');
      else if (!Auth.can('store', '쓰기')) showState('조회 권한만 있습니다. 개선보고 입력은 매장 담당자 계정으로 해 주세요.');
      else showState('');
    }

    renderSummary(data.summary);
    renderItems(data.items || []);
  }

  function renderSummary(sum) {
    sum = sum || {};
    $('#sumCard').style.display = '';

    const rows = [
      ['위생', sum.hygiene, sum.hygieneGrade, false],
      ['CS', sum.cs, sum.csGrade, false],
      ['종합', sum.total, sum.totalGrade, true],
    ];
    const body = $('#sumBody');
    body.innerHTML = '';
    rows.forEach(function (r) {
      const tr = document.createElement('tr');
      if (r[3]) tr.className = 'sum-crit';
      const td0 = document.createElement('td');
      td0.textContent = r[0];
      // '잠정'은 개선율(익월 IMPROVE_DUE_DAY 이전)이 아직 확정 전이라는 뜻 — 숫자만 보면 낮게 보인다
      if (r[3] && sum.provisional) {
        const tag = document.createElement('span');
        tag.className = 'provTag';
        tag.textContent = '잠정';
        td0.appendChild(document.createTextNode(' '));
        td0.appendChild(tag);
      }
      const td1 = document.createElement('td');
      td1.className = 'r'; td1.textContent = num1(r[1]);
      const td2 = document.createElement('td');
      td2.className = 'r'; td2.textContent = str(r[2]) || '—';
      tr.appendChild(td0); tr.appendChild(td1); tr.appendChild(td2);
      body.appendChild(tr);
    });

    const req = cnt(sum.req), done = cnt(sum.done);
    const fin = $('#sumFinal');
    fin.innerHTML = '';
    /* 서버가 진행·시작 전 건수까지 내려주는데 완료만 보여주면, 매장은 '남은 게 몇 건인지'를
       카드를 세어 봐야 안다. 다만 서버가 그 칸을 못 읽었을 때(숫자가 아닐 때) 0으로 단정하면
       "시작 전 0건"이라는 거짓말이 되므로, 숫자로 온 것만 골라 적는다.
       ★sum.todo는 시트 라벨 '미조치'에서 온 값이다. 값은 그대로 쓰고 화면에만 '시작 전'으로 적는다 —
         아직 손대지 않았다는 사실은 같은데, 앞의 말은 잘못을 세는 말이고 뒤의 말은 순서를 세는 말이다. */
    const seg = [];
    if (typeof sum.prog === 'number') seg.push('진행 ' + sum.prog);
    seg.push('완료 ' + done);
    if (typeof sum.todo === 'number') seg.push('시작 전 ' + sum.todo);
    fin.appendChild(document.createTextNode('개선요청사항 ' + req + '건 (' + seg.join(' · ') + ') · '));
    const b = document.createElement('b');
    b.textContent = '개선율 ' + ratePct(sum.rate);
    fin.appendChild(b);
    $('#sumFill').style.width = Math.round((typeof sum.rate === 'number' ? sum.rate : 0) * 100) + '%';

    $('#visitNote').textContent = sum.visitDate ? ('방문일 ' + str(sum.visitDate)) : '';

    /* 라벨을 못 찾아 값이 비었다는 경고는 그대로 보여준다.
       조용히 0을 표시하는 것이 이 화면에서 가장 위험하다(§9-7). */
    const warn = $('#warnNote');
    const ws = sum.warn && sum.warn.length ? sum.warn : null;
    if (ws) { warn.style.display = ''; warn.textContent = ws.join(' / '); }
    else { warn.style.display = 'none'; warn.textContent = ''; }

    /* 예정일이 지난 건수는 서버가 항목마다 내려준 overdue를 세기만 한다 — 화면에서 예정일을
       다시 계산하지 않는다(§5 주의). 0건이면 아예 적지 않는다: 늘 붙어 있는 글자는 배경이 되어,
       정작 1건이 생긴 달에 눈에 걸리지 않는다.
       ★'지연'이 아니라 '예정일 지남'으로 적는다★ — 같은 사실인데 앞의 말은 사람을 탓하고
         뒤의 말은 날짜를 말한다. 매장이 스스로 정한 예정일이라 더욱 그렇다. 색은 그대로 둔다. */
    const late = lateCount();
    if (late > 0) {
      const lc = document.createElement('span');
      lc.className = 'lateCount';
      lc.textContent = ' · 예정일 지남 ' + late + '건';
      fin.appendChild(lc);
    }

    $('#bbRate').textContent = '개선율 ' + ratePct(sum.rate);
    const bp = $('#bbProg');
    // 하단바는 스크롤과 무관하게 늘 보이는 자리다. 해당 건이 있을 때만 한 조각을 빨갛게 덧붙인다.
    bp.textContent = '완료 ' + done + ' / 개선요청 ' + req;
    if (late > 0) {
      const s = document.createElement('span');
      s.className = 'lateCount';
      s.textContent = ' · 예정일 지남 ' + late + '건';
      bp.appendChild(s);
    }
  }

  /* 요약·하단바가 함께 쓰는 '예정일 지난 건수'. data.items 하나를 정본으로 삼아야
     두 자리에 다른 숫자가 뜨는 일이 없다. */
  function lateCount() {
    const arr = (data && data.items) || [];
    let n = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].overdue) n++;
    return n;
  }

  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  /* 저장·충돌 응답으로 받은 최신 항목을 카드와 원본 배열(data.items) 양쪽에 반영한다.
     반영하지 않으면 방금 완료 처리한 항목이 data.items에는 예정일이 지난 채로 남아
     요약의 '예정일 지남 n건'이 실제 카드와 어긋난다.

     ★통째로 갈아끼우지 않고 '서버가 보낸 칸만' 덮어쓴다.
       store.saveImprove 응답의 항목에는 store.get이 주던 칸이 일부 없다
       (구분·본문·본사 사진·예정일·overdue·NEW). 그대로 대입하면 방금 저장한 그 항목만
       그 칸들을 잃어, ①아직 기한이 지난 항목인데 '예정일 지남'과 빨간 선이 사라지고
       ②요약·하단바의 '예정일 지남 n건'이 실제보다 적게 나오며 ③나중에 목록을 다시 그리는 코드가
       생기는 순간 본문이 통째로 비어 보인다.
       빠진 칸은 '바뀌지 않았다'는 뜻이므로 직전 값을 그대로 두는 편이 맞다. */
  function mergeItem(next) {
    const arr = (data && data.items) || [];
    let prev = null, at = -1;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && String(arr[i].no) === String(next.no)) { prev = arr[i]; at = i; break; }
    }
    const out = {};
    Object.keys(prev || {}).forEach(function (k) { out[k] = prev[k]; });
    Object.keys(next || {}).forEach(function (k) { out[k] = next[k]; });

    /* overdue는 '예정일이 지났는데 완료일이 비었다'는 뜻이다. 서버가 이 응답에 overdue를
       안 실어 준 경우, 방금 완료로 바뀐 항목까지 직전 값(참)을 물려받으면
       이미 마무리한 항목에 빨강이 남는다 — 확실히 내릴 수 있는 이 한 경우만 손으로 내린다.
       반대로 '완료가 아닌' 항목을 화면에서 새로 판정하지는 않는다(§5 주의). */
    if (!has(next, 'overdue') && String(out.state) === '완료') out.overdue = false;

    if (at >= 0) arr[at] = out;
    return out;
  }

  const STATE_CLASS = { '완료': 'done', '진행': 'prog', '미조치': 'todo' };

  /* 시트 값 → 화면에 적을 말.
     ★키는 시트·서버가 쓰는 값 그대로다★ — 남의 시트라 바꿀 수 없고, 바꿔서도 안 된다.
       (STATE_CLASS의 키·저장 요청 본문·집계도 전부 이 원래 값을 쓴다.)
     여기 없는 값은 받은 그대로 적는다 — 시트에 새 상태 라벨이 생겨도 화면이 빈칸이 되지 않는다. */
  const STATE_LABEL = { '미조치': '시작 전', '미이행': '시작 전' };   // 시트가 두 라벨을 같은 뜻으로 쓴다
  function stateLabel(v) { return STATE_LABEL[v] || v; }

  /* ---------- 새 서식(2610~)의 상태 ----------
     서버(impJudge)가 판정해 `it.status`로 내려준다. 옛 달에는 null이라 위 STATE_* 를 그대로 쓴다.

     ★말을 고르는 규칙★ (2026-08-21 확정)
       · '반려' → **보완 요청** — 무엇을 해야 하는지가 말 안에 있고, 잘못했다는 느낌이 없다
       · '미조치' → **다음 점검 시 확인** — 끝난 일이 아니라 이어진다는 뜻이 들어간다
       · '기한 지남'은 그대로 쓴다 — 사람을 탓하는 말이 아니라 날짜를 말하는 말이다
     ★여기 없는 값은 받은 그대로 적는다★ — 서버에 새 상태가 생겨도 화면이 빈칸이 되지 않는다. */
  const STATUS_LABEL = {
    '미착수': '시작 전',
    '진행중': '진행 중',
    '완료(검수 전)': '완료 · 확인 대기',
    '확정': '완료',
    '반려': '보완 요청',
    '재제출기한 지남': '보완 기한 지남',
    '미조치': '다음 점검 시 확인',
  };
  const STATUS_CLASS = {
    '미착수': '',            // 아직 기한 안이다 — 빨강을 붙일 이유가 없다
    '진행중': 'prog',
    '완료(검수 전)': 'done',
    '확정': 'done',
    '반려': 'prog',          // 할 일이 남았다는 뜻이지 잘못했다는 뜻이 아니다 → 주황
    '기한 지남': 'todo',
    '예정일 지남': 'todo',
    '재제출기한 지남': 'todo',
    '미조치': 'todo',
  };
  /* 카드 왼쪽 빨간 선을 붙일 상태 — 날짜가 지난 것만이다 */
  const URGENT = { '기한 지남': 1, '예정일 지남': 1, '재제출기한 지남': 1, '미조치': 1 };

  function renderItems(items) {
    const box = $('#items');
    box.innerHTML = '';
    modes = [];                           // 카드를 다시 그리므로 옛 applyMode 참조를 버린다
    if (!items.length) {
      $('#listNote').textContent = '이 달에는 개선요청사항이 없습니다.';
      return;
    }
    $('#listNote').textContent = '';

    /* 예정일 지남 → NEW → 나머지 순으로 올린다.
       왜 서버가 준 NO. 순서를 흐트러뜨리면서까지 이렇게 하냐면, 이 화면을 보는 도구가 폰이고
       한 화면에 카드가 두세 개밖에 안 들어가기 때문이다. 매장이 위에서부터 읽다가 스크롤을 멈추면
       정작 기한이 지난 항목을 못 본 채 앱을 닫는다. 급한 순서를 화면 순서로 만들어 둔다.
       같은 묶음 안에서는 원래 순서(=시트 NO. 순)를 그대로 지킨다 —
       Array.prototype.sort가 안정 정렬이 아닌 브라우저가 아직 있어 원래 위치를 tie-breaker로 넣었다. */
    /* 급한 순서: 날짜가 지난 것 → 보완 요청 → NEW → 나머지.
       ★보완 요청을 위로 올리는 이유★ — 매장이 이미 한 번 올린 건이라 다 끝냈다고 생각하고 있다.
       목록 아래쪽에 있으면 스크롤을 멈추는 순간 그대로 묻힌다. */
    function rank(it) {
      if (!it) return 3;
      const st = str(it.status);
      if (st ? !!URGENT[st] : !!it.overdue) return 0;
      if (st === '반려') return 1;
      return it.isNew ? 2 : 3;
    }
    const ordered = items.map(function (it, i) { return { it: it, i: i }; });
    ordered.sort(function (a, b) {
      const d = rank(a.it) - rank(b.it);
      return d !== 0 ? d : a.i - b.i;
    });
    ordered.forEach(function (o) { box.appendChild(buildItem(o.it)); });
  }

  function buildItem(item) {
    let it = item;
    let pendingClear = false;

    const el = document.createElement('section');
    el.className = 'item storeItem';
    // 정적 뼈대만 innerHTML로 만든다. 매장명·본문·담당자명은 아래에서 전부 textContent로 넣는다.
    el.innerHTML =
      '<div class="itemTop"><span class="no"></span><span class="stTag"></span>' +
        '<span class="dueTag" style="display:none"></span>' +
        '<span class="flagTag late" style="display:none">예정일 지남</span>' +
        '<span class="flagTag new" style="display:none">NEW</span></div>' +
      '<p class="hqBody"></p>' +
      '<p class="lateNote" style="display:none"></p>' +
      '<div class="thumbs hqThumbs"></div>' +
      '<div class="itemSplit"></div>' +
      '<div class="meta-grid">' +
        '<div><label class="f">담당부서</label><select class="dept"></select></div>' +
        '<div><label class="f">담당자</label><input type="text" class="owner" placeholder="이름"></div>' +
        '<div class="full"><label class="f">진행 내용</label>' +
          '<textarea class="plan" rows="2" placeholder="어떻게 개선할지 적어 주세요"></textarea></div>' +
        '<div class="full"><label class="f">완료 내용</label>' +
          '<textarea class="doneNote" rows="2" placeholder="개선한 내용을 적어 주세요"></textarea></div>' +
        '<div class="full"><div class="savedPhoto" style="display:none"></div><div class="pickBox"></div></div>' +
      '</div>' +
      '<div class="auditRow" style="display:none">' +
        '<span class="auditNote"></span><span class="auditBtns"></span></div>' +
      '<div class="itemFoot"><span class="itemNote"></span>' +
        '<button type="button" class="miniBtn saveBtn">저장</button></div>';

    const noEl = $('.no', el), stEl = $('.stTag', el), bodyEl = $('.hqBody', el);
    const lateTag = $('.flagTag.late', el), newTag = $('.flagTag.new', el);
    const dueTag = $('.dueTag', el);
    const lateNote = $('.lateNote', el);
    const thumbs = $('.hqThumbs', el);
    const deptSel = $('.dept', el), ownerIn = $('.owner', el);
    const planIn = $('.plan', el), doneIn = $('.doneNote', el);
    const savedBox = $('.savedPhoto', el), pickBox = $('.pickBox', el);
    const noteEl = $('.itemNote', el), saveBtn = $('.saveBtn', el);
    const auditRow = $('.auditRow', el), auditNote = $('.auditNote', el), auditBtns = $('.auditBtns', el);

    const pick = PhotoPick.mount(pickBox, { id: 'af' + it.no, label: '개선 후 사진', max: 1 });

    // ----- 본사 영역 (읽기 전용 텍스트. 입력 요소를 만들지 않는다) -----
    noEl.textContent = 'NO.' + str(it.no) + (it.cat ? ' · ' + str(it.cat) : '');
    bodyEl.textContent = str(it.text);
    (it.beforePhotos || []).forEach(function (url) {
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      const im = document.createElement('img');
      im.src = url; im.alt = '개선요청사항 사진'; im.title = '누르면 크게 보입니다';
      a.appendChild(im);
      thumbs.appendChild(a);
    });

    // ----- 담당부서 목록 -----
    function fillDept(cur) {
      deptSel.innerHTML = '';
      const opts = (data.deptOptions || []).slice();
      // 시트에 적혀 있던 값이 목록에 없더라도 조용히 바꾸지 않는다 — 저장하면 그 값이 지워진다
      if (cur && opts.indexOf(cur) < 0) opts.unshift(cur);
      const blank = document.createElement('option');
      blank.value = ''; blank.textContent = '선택';
      deptSel.appendChild(blank);
      opts.forEach(function (d) {
        const o = document.createElement('option');
        o.value = d; o.textContent = d;
        deptSel.appendChild(o);
      });
      deptSel.value = cur || '';
    }

    function paintPhoto() {
      if (it.afterPhoto && !pendingClear) {
        savedBox.style.display = '';
        savedBox.innerHTML = '<label class="f">현재 개선 후 사진</label>' +
          '<div class="thumbs"><img alt="개선 후 사진"></div>' +
          '<button type="button" class="miniBtn warn delPhoto">사진 삭제</button>';
        $('img', savedBox).src = it.afterPhoto;
        $('.delPhoto', savedBox).onclick = function () {
          if (!confirm('개선 후 사진을 삭제할까요?\n저장을 눌러야 실제로 지워집니다.')) return;
          pendingClear = true;
          paintPhoto();
          noteEl.className = 'itemNote';   // 직전 저장의 초록(ok)·빨강(err)을 그대로 물려받지 않게
          noteEl.textContent = '저장을 누르면 사진이 삭제됩니다.';
        };
      } else {
        savedBox.style.display = 'none';
        savedBox.innerHTML = '';
      }
    }

    /* ----- 예정일 지남 · NEW 표시 -----
       판정은 전부 서버가 한 것(it.overdue·it.isNew)을 그대로 옮기기만 한다.
       ★화면에서 M열(예정일+진행 내용)을 다시 파싱해 추측하지 않는다. 한 번이라도 멀쩡한 항목에
         빨강이 붙으면 매장은 그다음부터 빨강 전체를 무시한다 — 없는 빨강이 틀린 빨강보다 낫다.
       서버가 필드를 안 보내면 undefined → 거짓으로 떨어져 뱃지가 안 붙는다(같은 이유로 이게 맞다). */
    /* 조치기한 — 새 서식에서만 온다(옛 달은 null이라 칸이 안 뜬다).
       보완 요청을 받은 건은 ★그 기한이 아니라 보완 기한★을 보여 준다. 원래 기한은 이미 지났고,
       매장이 봐야 하는 날짜는 '언제까지 다시 올려야 하나'다. */
    function paintDue() {
      const st = str(it.status);
      const redo = str(it.redo);
      const dl = str(it.deadline);
      let txt = '';
      if (st === '반려' || st === '재제출기한 지남') {
        if (redo) txt = '보완 기한 ' + dueLabel(redo) + '까지';
      } else if (dl) {
        txt = '기한 ' + dueLabel(dl) + '까지';
      }
      dueTag.textContent = txt;
      dueTag.style.display = txt ? '' : 'none';
    }

    function paintFlags() {
      const st = str(it.status);
      const late = st ? !!URGENT[st] : !!it.overdue;
      /* 클래스 이름은 'late'다 — css/app.css의 선택자가 `.storeItem.late`라서,
         여기서 'lateItem'을 붙이면 왼쪽 빨간 선이 영영 안 그려진다(그동안 그랬다). */
      el.className = 'item storeItem' + (late ? ' late' : '');
      /* 뱃지 글자도 상태에 맞춘다 — '예정일 지남'으로 굳어 있으면 기한이 지난 건에도 그 말이 붙는다 */
      lateTag.textContent = st ? (STATUS_LABEL[st] || st) : '예정일 지남';
      lateTag.style.display = late ? '' : 'none';
      newTag.style.display = it.isNew ? '' : 'none';

      /* '며칠 지났는지'는 날짜가 있어야 쓸 수 있는데, 그 계산도 서버 몫이다(스프레드시트 타임존).
         서버가 예정일(due)이나 지난 일수(overdueDays)를 함께 주면 적고, 없으면 뱃지만 남긴다. */
      const seg = [];
      /* ★왜 그런 상태인지 서버가 한 줄로 말해 준다★ — 화면이 다시 판정하지 않는다.
         "기한이 지났다는데 왜?"에 답이 없으면 매장은 담당자에게 전화한다. */
      if (st && str(it.statusWhy)) seg.push(str(it.statusWhy));
      else {
        if (late && str(it.due)) seg.push('예정일 ' + dueLabel(it.due));
        if (late && typeof it.overdueDays === 'number' && it.overdueDays > 0) seg.push(it.overdueDays + '일 지남');
      }
      lateNote.textContent = seg.join(' · ');   // 서버 문구가 섞이므로 textContent
      lateNote.style.display = seg.length ? '' : 'none';
      paintDue();
    }

    /* ----- 검수 (본사만 보인다) -----
       ★새 서식에서만 나타난다★ — 옛 달 탭에는 검수 칸 자체가 없어서 status가 null이다.
       ★버튼은 매장에게 아예 만들어지지 않는다★ — 숨기는 것이 아니라 만들지 않는다. */
    function paintAudit() {
      if (!canAudit() || !str(it.status)) { auditRow.style.display = 'none'; return; }
      auditRow.style.display = '';
      /* ★확정된 달은 손대지 않는다★ — 점수가 이미 굳었다(§1-7 ⑪). 검수를 되돌리면
         화면의 상태와 이미 반영된 점수가 갈라진다. 무엇이 확정됐는지만 적어 둔다. */
      if (closedAt()) {
        auditNote.textContent = '이 달은 ' + closedAt() + '에 채점이 확정되었습니다';
        auditBtns.innerHTML = '';
        return;
      }
      auditBtns.innerHTML = '';
      const a = str(it.audit);

      const note = a === '확정' ? '개선확정했습니다'
        : a === '반려' ? ('보완 요청했습니다' + (str(it.redo) ? ' · ' + dueLabel(it.redo) + '까지' : ''))
        : a === '재반려' ? '보완본을 다시 요청했습니다 — 다음 점검에서 확인합니다'
        : '아직 검수하지 않았습니다';
      auditNote.textContent = note;

      function btn(label, kind, fn) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'miniBtn' + (kind ? ' ' + kind : '');
        b.textContent = label;
        b.onclick = fn;
        auditBtns.appendChild(b);
        return b;
      }
      if (a !== '확정') btn('개선확정', 'ok', function () { audit('확정'); });
      if (a !== '재반려') btn(a === '반려' ? '다시 보완 요청' : '보완 요청', 'warn', function () { audit('반려'); });
      if (a) btn('검수 취소', '', function () { audit(''); });
    }

    async function audit(verdict) {
      /* ★보완 요청만 한 번 더 묻는다★ — 매장 화면의 상태가 바뀌고 기한이 새로 잡히기 때문이다.
         개선확정과 취소는 되돌릴 수 있으므로 묻지 않는다(누를 때마다 묻는 창은 곧 무시된다). */
      if (verdict === '반려') {
        const again = str(it.audit) === '반려';
        const msg = again
          ? '보완본을 다시 요청하시겠습니까?\n\n두 번째 요청부터는 이 건이 다음 점검에서 확인하는 것으로 넘어갑니다.'
          : '이 건에 보완을 요청하시겠습니까?\n\n매장 화면에 「보완 요청」으로 뜨고, 기한이 새로 잡힙니다.';
        if (!confirm(msg)) return;
      }
      const btns = auditBtns.querySelectorAll('button');
      btns.forEach(function (b) { b.disabled = true; });
      const r = await Api.call('improve.audit', {
        store: curStore, ym: curYm, no: it.no, verdict: verdict,
      }).catch(function () { return null; });
      btns.forEach(function (b) { b.disabled = false; });
      if (!(r && r.ok)) {
        alert('검수를 저장하지 못했습니다.\n' + ((r && r.error) || '잠시 후 다시 시도해 주세요.'));
        return;
      }
      /* ★서버가 돌려준 값만 반영한다★ — 화면에서 다음 상태를 추측하면 시트와 갈라진다
         (예: 반려 → 재반려로 넘어가는 판정은 시트의 현재 값을 봐야 안다). */
      it.audit = str(r.audit);
      it.redo = r.redo || null;
      it.status = str(r.status) || it.status;
      it.statusWhy = str(r.statusWhy);
      fill(it);
    }

    // ----- 카드 내용 채우기 (최초·저장 후·CONFLICT 후 모두 이 함수 하나를 쓴다) -----
    function fill(next) {
      it = next;
      pendingClear = false;
      /* ★새 서식이면 서버 판정(status)을 쓴다★ — 시트의 state(완료/진행/미조치)는 완료일이
         찼는지만 보는 옛 값이라 '보완 요청'·'기한 지남'을 구별하지 못한다.
         옛 달에는 status가 null이라 종전 그대로 그린다. */
      const sv = str(it.status);
      if (sv) {
        stEl.textContent = STATUS_LABEL[sv] || sv;
        const cls = STATUS_CLASS[sv];
        stEl.className = 'stTag' + (cls ? ' ' + cls : '');
      } else {
        const st = str(it.state) || '미조치';   // 시트 값 그대로 (색 판정·비교에 쓴다)
        stEl.textContent = stateLabel(st);      // 화면에 적을 때만 바꿔 적는다
        stEl.className = 'stTag ' + (STATE_CLASS[st] || 'todo');
      }
      fillDept(str(it.dept));
      ownerIn.value = str(it.owner);
      planIn.value = str(it.plan);
      doneIn.value = str(it.doneNote);
      pick.set([]);
      paintPhoto();
      paintFlags();
      paintAudit();
      applyMode();
    }

    function applyMode() {
      const w = writable();
      [deptSel, ownerIn, planIn, doneIn].forEach(function (x) { x.disabled = !w; });
      saveBtn.disabled = !w;
      const btn = $('.photoBtn', pickBox);
      if (btn) btn.disabled = !w;
      /* 왜 저장이 안 되는지 카드마다 알려준다 — 버튼만 회색이면 고장으로 오해한다.
         점검 문구 본문은 상단 maintNote에 한 번만 두고, 여기서는 '지금 저장이 안 된다'만 짧게 알린다. */
      /* ★'받아오는 중'과 '오프라인'을 갈라 적는다★ — 잠기는 이유는 같아도 매장이 할 일이 다르다.
         앞은 몇 초 기다리면 되는 일이고, 뒤는 자리를 옮겨야 하는 일이다. 연결된 매장에
         '오프라인'이라고 적으면 기다리면 될 것을 본사에 전화한다. */
      if (!w) {
        noteEl.className = 'itemNote';
        noteEl.textContent = maint ? '점검 중에는 저장할 수 없습니다.'
          : revalidating ? '최신 내용을 불러오는 중입니다. 잠시만 기다려 주세요.'
          : (fromSnap ? '오프라인에서는 저장할 수 없습니다.' : '');
      }
    }
    modes.push(applyMode);

    // ----- 임시저장 -----
    function draftNow() {
      draftPut(it.no, {
        rev: it.rev, dept: deptSel.value, owner: ownerIn.value,
        plan: planIn.value, doneNote: doneIn.value,
      });
    }
    [deptSel, ownerIn, planIn, doneIn].forEach(function (x) {
      x.addEventListener('change', draftNow);
      x.addEventListener('input', draftNow);
    });

    fill(it);

    /* 임시저장은 서버 값과 rev가 같을 때만 되살린다.
       본사가 그 사이 항목을 고쳤다면 옛 입력을 덮어씌우는 편보다 버리는 편이 안전하다. */
    const d = draftAll()[draftKey(it.no)];
    if (d && d.rev === it.rev) {
      fillDept(str(d.dept));
      ownerIn.value = str(d.owner);
      planIn.value = str(d.plan);
      doneIn.value = str(d.doneNote);
      noteEl.textContent = '저장하지 않은 입력을 되살렸습니다.';
    }

    // ----- 항목별 저장 -----
    saveBtn.onclick = async function () {
      if (!writable()) return;
      saveBtn.disabled = true;
      const label = saveBtn.textContent;
      saveBtn.textContent = '저장 중…';
      noteEl.textContent = '';
      noteEl.className = 'itemNote';

      const body = {
        ym: curYm, no: it.no, rev: it.rev,
        dept: deptSel.value, owner: ownerIn.value.trim(),
        plan: planIn.value, doneNote: doneIn.value,
        clearPhoto: !!pendingClear,
      };
      if (scope.list.length > 1 && curStore) body.store = curStore;
      const pics = pick.get();
      if (pics.length) body.photo = { name: 'after.jpg', dataUrl: pics[0] };

      let res = null;
      try { res = await Api.call('store.saveImprove', body); } catch (e) { res = null; }

      saveBtn.textContent = label;
      saveBtn.disabled = false;

      /* 클래스가 'bad'가 아니라 'err'다 — css/app.css에 있는 것은 .itemNote.err(빨강)·
         .itemNote.ok(초록)뿐이라, 그동안 오류 문구가 안내 문구와 똑같은 회색으로 떴다. */
      if (!res || res.code === 'NETWORK') {
        noteEl.className = 'itemNote err';
        // 입력값은 임시저장에 남아 있으므로 다시 눌러도 처음부터 적을 필요가 없다
        noteEl.textContent = '저장되지 않았습니다. 연결을 확인하고 다시 눌러 주세요.';
        return;
      }

      if (res.ok) {
        draftDel(it.no);
        if (res.duplicate) { noteEl.textContent = '이미 저장된 내용입니다.'; return; }
        if (res.item) fill(mergeItem(res.item));
        /* 저장 응답의 summary에는 건수·개선율만 들어 있다(§7-3).
           그대로 renderSummary에 넘기면 위생·CS·종합이 '—'로 지워진다 — 덮어쓰지 말고 겹쳐 쓴다. */
        if (res.summary) {
          const merged = data.summary || {};
          Object.keys(res.summary).forEach(function (k) { merged[k] = res.summary[k]; });
          data.summary = merged;
          renderSummary(merged);
        } else if (res.item) {
          // summary가 안 왔어도 '예정일 지남' 건수는 방금 바뀌었을 수 있다 — 요약을 같은 값으로 다시 그린다
          renderSummary(data.summary || {});
        }
        noteEl.className = 'itemNote ok';
        noteEl.textContent = '저장되었습니다.';
        return;
      }
      if (res.code === 'CONFLICT' && res.item) {
        /* 다른 사람이 먼저 고쳤다 — 이 카드만 서버 최신값으로 되돌린다.
           화면 전체를 새로 그리면 다른 카드에 쓰던 내용이 함께 날아간다. */
        draftDel(it.no);
        fill(mergeItem(res.item));
        renderSummary(data.summary || {});   // 남이 고친 결과로 건수가 달라질 수 있다
        noteEl.className = 'itemNote err';
        noteEl.textContent = str(res.error) || '다른 분이 방금 이 항목을 수정했습니다. 최신 내용을 확인해 주세요.';
        return;
      }
      /* 저장을 누른 순간 점검이 걸린 경우. 화면을 비우지 않는다 —
         적어 둔 내용을 날리는 것이 이 화면에서 가장 비싼 사고이고, 입력값은 임시저장에 남아 있다.
         상단에 문구를 띄우고 모든 카드의 저장 버튼만 잠근다. */
      if (res.code === 'MAINT') {
        showMaint(str(res.error) || '지금은 점검 중입니다. 잠시 후 다시 시도해 주세요.');
        noteEl.className = 'itemNote err';
        noteEl.textContent = '점검 중이라 저장되지 않았습니다. 적으신 내용은 남아 있습니다.';
        return;
      }
      if (res.code === 'AUTH_REQUIRED' || res.code === 'AUTH_EXPIRED' || res.code === 'AUTH_INVALID') {
        if (Auth.clear) Auth.clear();
        goLogin();
        return;
      }
      /* 남은 거절 사유는 서버 문구를 그대로 보여준다(FORBIDDEN='권한이 없습니다.',
         SCOPE_DENIED='담당하지 않는 매장입니다.' 등 — 이미 사람 말로 되어 있다).
         ★여기서 홈으로 보내지 않는다★ — 저장 단계의 FORBIDDEN은 '조회 전용 기간'이라는 뜻일 수 있고,
           화면을 갈아 끼우면 방금 적은 내용이 눈앞에서 사라진다. 적은 것은 임시저장에 남겨 둔다. */
      noteEl.className = 'itemNote err';
      noteEl.textContent = str(res.error) || '저장되지 않았습니다. 잠시 후 다시 시도해 주세요.';
    };

    return el;
  }

  await load();
})();
