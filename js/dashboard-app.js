/* QSC 전체 대시보드 — 전 매장 현황 (조회 전용, 2단계)

   데이터 출처는 본사 통합시트 [데이터] 탭 1회 읽기다(§10-1). 앱은 계산을 하나도 하지 않는다 —
   점수·등급·정렬 순서·가중치·개선 라벨까지 전부 서버가 정해 준 값을 그대로 그린다. 그래서 10월 산식
   개편에도 이 파일은 한 줄도 바뀌지 않는다.

   ★등수를 화면에 찍지 않는다★ — 서버는 rank를 계속 내려주고 정렬에도 쓰지만, '1위·2위' 열은
     두지 않는다. 이 화면은 점장·직원이 함께 보는 화면이고, 줄 세우기로 읽히는 순간
     "우리가 몇 등이냐"가 목적이 되어 정작 개선요청사항을 안 보게 된다.
     같은 이유로 요약 줄에 '최고·최저'를 적지 않는다 — 특정 매장을 지목하는 숫자다.

   ★폴링하지 않는다. 월 단위로 갱신되는 데이터인데 26곳이 자동 갱신을 돌리면 시트 읽기 쿼터가
     먼저 죽는다. 갱신은 topbar의 수동 새로고침뿐이다.
   ★매장명·등급 같은 서버 문자열은 전부 textContent로 넣는다. 외부 스크립트가 0개인 것과
     이 관례가 이 앱의 XSS 방어 전부다.
   ★역할 이름을 비교하지 않는다. 무엇을 보여줄지는 Auth.can()·Auth.hasMenu()만 묻는다. */
(async function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };

  const SNAP = 'qsc-dash-snap-v1';   // 오프라인일 때 그려 줄 마지막 성공 응답

  let loading = false;
  let scrolled = false;   // 자기 매장 자동 스크롤은 진입 시 1회만 (기간을 바꿀 때마다 튀면 거슬린다)

  // ---------- 작은 도구들 ----------

  // 이번 달 기간 키. codes-app.js의 cycle()과 같은 계산이지만 대시보드 기간 키는 'YYYY-MM' 형식이다.
  function curPeriod(d) {
    d = d || new Date();
    return String(d.getFullYear()) + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  // 'YYYY-MM' → 매장 화면이 쓰는 'YYMM'. 연간 키('YYYY')에는 월 탭이 없으므로 null.
  function ymOf(key) {
    const s = String(key || '');
    return /^\d{4}-\d{2}$/.test(s) ? s.slice(2, 4) + s.slice(5, 7) : null;
  }
  // 점수는 소수 1자리 고정. 값이 없으면 '—' (0으로 채우지 않는다 — 조용히 틀린 숫자가 가장 위험하다)
  function fmt1(v) { return (typeof v === 'number') ? v.toFixed(1) : '—'; }
  /* 개선 열은 기간에 따라 '개선율(%)'이거나 '개선요청(건)'이다. 어느 쪽인지는 서버가 cols.improve
     라벨로 정하므로 화면은 묻지 않고, 정수면 정수로 소수면 1자리로만 찍는다(조건문을 두지 않는 방법). */
  function fmtNum(v) {
    if (typeof v !== 'number') return '—';
    return (v === Math.floor(v)) ? String(v) : v.toFixed(1);
  }
  function minsAgo(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return null;
    return Math.max(0, Math.round((Date.now() - t) / 60000));
  }
  function setNote(el, text) {
    el.textContent = text || '';
    el.style.display = text ? '' : 'none';
  }

  /* 점검 모드 — 서버 스크립트 속성 MAINT에 문구가 들어 있는 동안 모든 요청이 code:'MAINT'로 막힌다
     (관리자 역할만 통과). 조회 전용 화면이라 잠글 버튼이 없으므로, 표를 비우고 문구만 남긴다.
     ★스냅샷으로 덮지 않는다. 점검은 대개 숫자를 손보는 중이라는 뜻이고,
       그때 지난달 숫자를 최신인 양 보여주는 것이 빈 표보다 훨씬 나쁘다. */
  function showMaint(msg) {
    setNote($('#maintNote'), msg || '');
    if (!msg) return;
    $('#rankBody').innerHTML = '';
    $('#rankHead').innerHTML = '';
    $('#stats').innerHTML = '';
    setNote($('#adminNote'), '');
    setNote($('#warnNote'), '');
    $('#trust').textContent = '';
    $('#freshInfo').textContent = '점검 중';
    setNote($('#stateNote'), '');   // 문구는 maintNote 한 곳에만 — 같은 말을 두 번 적지 않는다
  }

  // ---------- 가드 ----------

  /* 로그인 화면 주소는 직접 조립하지 않는다. ?next= 화이트리스트(Auth.NEXT_OK)가 auth.js
     한 곳에만 있어야 화면 이름이 바뀌는 날 한 곳만 고치면 된다.
     auth.js가 아예 안 실린 경우(캐시 사고)에만 옛 주소로 떨어진다 — 그때도 로그인은 가능해야 한다. */
  function goLogin() {
    let u = 'login.html?next=dashboard.html';
    try { if (typeof Auth !== 'undefined' && Auth && typeof Auth.loginUrl === 'function') u = Auth.loginUrl(); }
    catch (e) { /* auth.js 미로드 — 위 폴백 주소를 쓴다 */ }
    location.replace(u);
  }

  /* 대시보드는 '리다이렉트' 가드로 충분하다(§2). 현장에서 작성 중인 입력이 없는 조회 화면이라
     로그인 화면으로 보내도 잃는 것이 없다 — 점검표 2화면과 다른 점이 이것이다. */
  let ok = false;
  try { ok = await Auth.ensure(); } catch (e) { ok = false; }
  if (!ok) { goLogin(); return; }

  const me = (Auth.user && Auth.user()) || null;
  if (me && me.name) $('#whoInfo').textContent = me.name;

  /* 권한이 없는 계정이 주소를 직접 쳐서 들어온 경우.
     ★빈 화면으로 두지 않는다★ — 이유를 모른 채 뼈대만 보면 "앱이 고장났다"는 문의가 되고,
       그 사이 다른 주소를 눌러 보게 된다. 이유를 한 줄 보여 준 뒤 홈으로 돌려보낸다.
     안내 문구와 이동은 auth.js의 denyHome() 한 곳에 모아 두었다(전 화면이 같은 말을 쓰게).
     구버전 auth.js가 캐시에 남아 그 함수가 없을 때만 이 화면이 직접 적는다.
     ★menus()가 null이면 막지 않는다★ — '권한이 0개'와 '아직 모른다'는 다르다(auth.js guard와 같은 규칙).
       사본을 못 읽었다는 이유로 담당자를 홈으로 튕기면 안 된다. 모르면 통과시키고 판정은 서버가 한다.
     이것은 안내를 앞당기는 장치일 뿐 보안이 아니다 — 진짜 차단은 서버 ACTIONS 등록표와 can()이다. */
  const menusKnown = (typeof Auth.menus === 'function') ? Auth.menus() : null;
  if (menusKnown && !Auth.hasMenu('dashboard')) {
    if (typeof Auth.denyHome === 'function') { Auth.denyHome(); return; }
    setNote($('#stateNote'), '이 화면을 볼 수 있는 권한이 없습니다. 홈으로 이동합니다.');
    setTimeout(function () { location.replace('index.html'); }, 1800);
    return;
  }
  // 매장 화면 권한이 없으면 표에서 링크를 걸지 않는다(눌러도 막힐 링크를 보여주지 않는다).
  const canStore = Auth.hasMenu('store');
  /* '미입력 매장 N곳' 배너는 통합시트에 점수를 옮겨 적는 사람에게만 의미가 있다.
     그 사람이 누구인지는 역할 이름이 아니라 대시보드 쓰기 권한이 정한다. */
  const isCollector = Auth.can('dashboard', '쓰기');

  // ---------- 렌더 ----------

  function renderPeriods(data) {
    const sel = $('#period');
    const list = (data.periods && data.periods.length) ? data.periods
      : [{ key: data.period.key, label: data.period.label }];
    sel.innerHTML = '';
    list.forEach(function (p) {
      const o = document.createElement('option');
      o.value = p.key;
      o.textContent = p.label || p.key;
      sel.appendChild(o);
    });
    sel.value = data.period.key;
    /* 서버가 실제로 응답한 기간이 periods 목록에 없으면 select가 빈칸이 된다 —
       그 상태로 새로고침을 누르면 화면과 다른 기간을 다시 불러오게 되므로 그 항목을 끼워 넣는다. */
    if (sel.value !== data.period.key) {
      const o = document.createElement('option');
      o.value = data.period.key;
      o.textContent = data.period.label || data.period.key;
      sel.insertBefore(o, sel.firstChild);
      sel.value = data.period.key;
    }
  }

  function renderStats(data) {
    const box = $('#stats');
    box.innerHTML = '';
    const s = data.stats || {};
    /* ★'최고·최저'는 적지 않는다★ — 표를 보면 누구인지 바로 알 수 있는 숫자라, 요약 줄에 올리는
       순간 매달 두 매장을 지목하는 게시판이 된다. 서버는 s.top·s.bottom을 계속 주지만 쓰지 않는다.
       평균만 남긴다 — 우리 매장이 어디쯤인지 가늠하는 데는 평균 하나면 충분하다. */
    const pairs = [
      ['대상', (typeof s.n === 'number') ? String(s.n) : '—'],
      ['점검', (typeof s.scored === 'number') ? String(s.scored) : '—'],
      ['평균', fmt1(s.avgTotal)],
    ];
    pairs.forEach(function (p) {
      const sp = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = p[1];
      sp.appendChild(document.createTextNode(p[0] + ' '));
      sp.appendChild(b);
      box.appendChild(sp);
    });

    if (isCollector && typeof s.n === 'number' && typeof s.scored === 'number' && s.n > s.scored) {
      setNote($('#adminNote'), '아직 점수가 입력되지 않은 매장이 ' + (s.n - s.scored) + '곳 있습니다. 통합시트에 옮겨 적으면 이 화면에 바로 반영됩니다.');
    } else {
      setNote($('#adminNote'), '');
    }
  }

  function renderHead(cols, hasHC) {
    const tr = $('#rankHead');
    tr.innerHTML = '';
    /* 첫 열은 '매장'이다. 등수 열을 두지 않는다 —
       점수 순 정렬만으로도 비교는 되고, 숫자를 찍는 순간 그것이 이 화면의 주제가 된다. */
    const heads = [['매장', false]];
    if (hasHC) { heads.push(['위생', true]); heads.push(['CS', true]); }
    // 개선 열 머리글은 서버가 준 문자열 그대로. 화면이 의미를 해석하지 않는다.
    heads.push([(cols && cols.improve) || '개선', true]);
    heads.push(['종합', true]);
    heads.push(['등급', true]);
    heads.forEach(function (h) {
      const th = document.createElement('th');
      if (h[1]) th.className = 'r';
      th.textContent = h[0];
      tr.appendChild(th);
    });
  }

  function td(row, text, cls) {
    const c = document.createElement('td');
    if (cls) c.className = cls;
    c.textContent = text;
    row.appendChild(c);
    return c;
  }

  function renderRows(data, hasHC) {
    const body = $('#rankBody');
    body.innerHTML = '';
    const ym = (data.period && data.period.type === 'month') ? ymOf(data.period.key) : null;

    /* 서버가 이미 정렬해 주지만 화면에서도 한 번 더 내려 둔다. 아직 점검하지 않은 매장이 표 중간에
       0점으로 섞이면, 점검을 안 한 것뿐인데 점수가 낮은 것처럼 보인다.
       ★r.rank는 정렬에만 쓰고 화면에는 찍지 않는다★ — 서버가 계속 내려주지만 열로 만들지 않는다. */
    const rows = (data.rows || []).slice().sort(function (a, b) {
      const an = (a.status === 'none') ? 1 : 0, bn = (b.status === 'none') ? 1 : 0;
      if (an !== bn) return an - bn;
      if (an) return String(a.store).localeCompare(String(b.store));
      return (a.rank == null ? 9999 : a.rank) - (b.rank == null ? 9999 : b.rank);
    });

    let mineRow = null;
    rows.forEach(function (r) {
      const tr = document.createElement('tr');
      const none = (r.status === 'none');
      const cls = [];
      if (r.mine) cls.push('sum-crit');
      if (none) cls.push('na');
      if (cls.length) tr.className = cls.join(' ');

      /* 매장 — 첫 열이다(등수 열은 없앴다).
         ★자기 매장 ▶ 표시는 남긴다★ — 26행에서 자기 줄을 찾는 용도이지 등수를 알리는 표시가 아니다.
           그래서 '내 순위' 같은 문구는 어디에도 쓰지 않고, 표식만 조용히 앞에 붙인다.
         자기 범위 행만 매장 화면으로 링크한다. 남의 행은 눌리지 않는다.
         ★textContent로 덮지 않고 노드로 붙인다★ — ▶를 먼저 넣어 두었으므로 덮으면 표식이 지워진다. */
      const nm = document.createElement('td');
      nm.className = 'nm';
      if (r.mine) {
        const mk = document.createElement('span');
        mk.className = 'mineMark';
        mk.textContent = '▶';
        nm.appendChild(mk);
      }
      if (r.mine && canStore && ym) {
        const a = document.createElement('a');
        a.href = 'store.html?ym=' + encodeURIComponent(ym) + '&store=' + encodeURIComponent(r.store);
        a.textContent = r.store;      // 매장명은 서버 문자열 — 반드시 textContent
        nm.appendChild(a);
      } else {
        nm.appendChild(document.createTextNode(r.store));
      }
      tr.appendChild(nm);

      if (hasHC) {
        td(tr, none ? '—' : fmt1(r.qsc), 'r');
        td(tr, none ? '—' : fmt1(r.cs), 'r');
      }
      td(tr, none ? '—' : fmtNum(r.improve), 'r');

      // 종합 — 증감은 산식 경계를 넘지 않을 때만 서버가 채워 준다(delta:null이면 아무것도 그리지 않는다)
      const tot = document.createElement('td');
      tot.className = 'r';
      tot.appendChild(document.createTextNode(none ? '—' : fmt1(r.total)));
      if (!none && typeof r.delta === 'number' && r.delta !== 0) {
        const d = document.createElement('span');
        d.className = 'dashDelta ' + (r.delta > 0 ? 'up' : 'down');
        d.textContent = (r.delta > 0 ? '▲' : '▼') + Math.abs(r.delta).toFixed(1);
        tot.appendChild(d);
      }
      tr.appendChild(tot);

      td(tr, none ? '—' : (r.grade || '—'), 'r');

      body.appendChild(tr);
      if (r.mine && !mineRow) mineRow = tr;
    });

    if (!rows.length) setNote($('#stateNote'), '이 기간에 표시할 매장이 없습니다.');

    // 자기 매장이 26행 중 어디 있든 바로 보이게. 진입 시 1회만.
    if (mineRow && !scrolled) {
      scrolled = true;
      try { mineRow.scrollIntoView({ block: 'center' }); } catch (e) { /* 구형 브라우저 — 스크롤 없이도 표는 정상 */ }
    }
  }

  function renderWarn(data, offline) {
    const msgs = [];
    if (offline) msgs.push('오프라인 — 마지막으로 받아둔 화면입니다.');

    // 산식 경계: 10월부터 종합점수 구성이 달라져 이전 달과 그대로 비교하면 전 매장이 '개선'으로 보인다.
    if (data && data.period && data.period.formula === 'v2') {
      msgs.push('2026년 10월부터 산식이 바뀌었습니다(QSC 60% · CS 30% · 개선 10%). 이전 달과의 증감은 비교하지 않습니다.');
    }
    // 연간처럼 서버가 기간 자체에 경고를 달아 준 경우 그 문구를 그대로 보여 준다.
    if (data && data.periods) {
      data.periods.forEach(function (p) {
        if (data.period && p.key === data.period.key && p.warn) msgs.push(p.warn);
      });
    }
    setNote($('#warnNote'), msgs.join(' · '));
  }

  function renderTrust(data, offline) {
    /* "왜 안 바뀌지" 문의를 없애는 한 줄. 관리자가 통합시트를 브라우저에서 직접 고치면 백엔드는
       알 수 없고 캐시 TTL이 유일한 방어선이므로, 기준 시각을 상시 표기한다. */
    let n = minsAgo(data && data.updatedAt);
    if (n == null && data && typeof data.cacheAge === 'number') n = Math.round(data.cacheAge / 60);
    const when = (n == null) ? '방금' : (n <= 0 ? '방금' : n + '분 전');
    $('#trust').textContent = '본사 통합시트 입력 기준 · ' + when + (offline ? ' (저장된 화면)' : '');
    $('#freshInfo').textContent = offline ? '오프라인' : when;
  }

  function render(data, offline) {
    // period는 필수 필드지만, 옛 스냅샷을 그릴 때 없을 수 있어 화면이 통째로 죽지 않도록 채워 둔다.
    if (!data.period) data.period = { key: $('#period').value || curPeriod(), label: '', type: 'month' };
    const hasHC = !(data.cols && data.cols.hasHygieneCs === false);
    renderPeriods(data);
    renderStats(data);
    renderHead(data.cols, hasHC);
    renderRows(data, hasHC);
    renderWarn(data, offline);
    renderTrust(data, offline);
  }

  // ---------- 불러오기 ----------

  function snapRead() {
    try { return JSON.parse(localStorage.getItem(SNAP) || 'null'); } catch (e) { return null; }
  }
  function snapWrite(data) {
    try { localStorage.setItem(SNAP, JSON.stringify(data)); }
    catch (e) { /* 용량 초과 등 — 스냅샷은 편의 기능이라 실패해도 화면은 정상 */ }
  }

  function showSnapshot(reason) {
    const snap = snapRead();
    if (!snap) { setNote($('#stateNote'), reason); return; }
    render(snap, true);
    setNote($('#stateNote'), '');
  }

  async function load(key) {
    if (loading) return;
    loading = true;
    $('#reloadBtn').disabled = true;
    setNote($('#stateNote'), '불러오는 중입니다…');

    const OFFMSG = '연결이 되지 않아 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    let res = null;
    try {
      res = await Api.call('dashboard.get', { period: key });
    } catch (e) {
      /* Api.call은 네트워크 실패를 던지지 않고 code:'NETWORK'로 돌려준다(아래에서 받는다).
         여기까지 오는 것은 Api 자체가 없거나 예상 못 한 예외뿐이라, 그때도 화면은 비우지 않는다. */
      showSnapshot(OFFMSG);
      loading = false; $('#reloadBtn').disabled = false;
      return;
    }

    loading = false;
    $('#reloadBtn').disabled = false;

    if (res && res.ok) {
      setNote($('#stateNote'), '');
      showMaint('');           // 정상 응답이 왔다 = 점검이 풀렸다
      snapWrite(res);
      render(res, false);
      return;
    }

    /* 오류 분기는 code 상수로만 한다. 한국어 문구로 분기하면 서버가 문구를 다듬는 날 조용히 깨진다.
       error 문구는 사용자에게 보여줄 용도로만 쓴다. */
    const code = (res && res.code) || 'SERVER_ERROR';
    const msg = (res && res.error) || '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';

    /* NETWORK는 서버 코드가 아니라 api.js가 붙이는 클라이언트 전용 코드다(오프라인·DNS 실패).
       ★이것을 서버 오류와 같이 취급하면 지하 매장에서 스냅샷이 뜨지 않고 오류 문구만 남는다. */
    if (code === 'NETWORK') { showSnapshot(OFFMSG); return; }

    // 점검 중. 오류가 아니므로 스냅샷도 오류 문구도 아닌, 담당자가 적어 둔 안내를 그대로 보여 준다.
    if (code === 'MAINT') {
      showMaint(msg || '지금은 점검 중입니다. 잠시 후 새로고침해 주세요.');
      return;
    }

    if (code === 'AUTH_REQUIRED' || code === 'AUTH_EXPIRED' || code === 'AUTH_INVALID') {
      /* 세션은 무기한이라(로그아웃 전까지 유지) 여기까지 오는 것은 '지금 이 사람을 끊었다'는 뜻이다:
         비밀번호 변경(credFingerprint 변경) · 계정 상태 '중지' · TOKEN_MINV 전원 강제 로그아웃.
         자동으로 다시 들어올 수단은 없으므로 세션을 버리고 로그인 화면을 보여 준다. */
      Auth.clear();
      goLogin();
      return;
    }
    if (code === 'FORBIDDEN' || code === 'SCOPE_DENIED') { setNote($('#stateNote'), msg); return; }
    if (code === 'APP_OUTDATED') { setNote($('#stateNote'), '앱을 새로 고쳐 주세요 (앱 종료 후 다시 실행)'); return; }
    // 그 밖의 오류(RATE_LIMITED·SERVER_ERROR 등)는 서버 문구를 그대로 보여 준다.
    // 스냅샷으로 덮지 않는다 — 오래된 숫자를 최신인 양 보여주는 것이 오류 문구보다 나쁘다.
    setNote($('#stateNote'), msg);
  }

  // ---------- 조작 ----------

  $('#period').onchange = function () { load($('#period').value); };
  $('#reloadBtn').onclick = function () { load($('#period').value || curPeriod()); };

  // 오프라인 진입이면 네트워크를 기다리지 않고 저장해 둔 화면을 먼저 그린다.
  if (navigator.onLine === false) {
    showSnapshot('오프라인입니다. 저장된 화면이 없어 표시할 내용이 없습니다.');
  }
  await load(curPeriod());
})();
