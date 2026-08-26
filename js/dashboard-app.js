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

  /* 오프라인일 때 그려 줄 마지막 성공 응답.
     ★키에 계정을 붙인다 (2026-08-16)★ — 응답에는 mine(우리 매장) 표식이 들어 있다.
     계정 없이 한 칸에 담아 두면, 공용 PC에서 A계정으로 보고 B계정으로 로그인한 뒤
     오프라인이 되는 순간 ★A의 매장★에 '▶ 우리 매장' 표시와 강조가 붙고 store.html 링크까지
     걸린 채 그 행으로 자동 스크롤된다. 서버는 멀쩡한데 화면이 남의 담당을 알려주는 셈이다. */
  const SNAP_BASE = 'qsc-dash-snap-v1';
  /* 기간을 여러 개 오가도 저장소가 무한히 늘지 않게 (매장 화면 store-app.js와 같은 방식·같은 이름).
     응답 하나가 수 KB라 용량이 문제는 아니고, 남겨 두는 키가 끝없이 쌓이지 않게 하려는 것이다. */
  const SNAP_MAX = 8;
  function snapWho() {
    try {
      const u = (Auth.user && Auth.user()) || null;
      const id = u ? (typeof u === 'string' ? u : (u.id || u.name || '')) : '';
      return String(id || '').trim() || '-';
    } catch (e) { return '-'; }
  }
  function snapName() { return SNAP_BASE + '|' + snapWho(); }

  let loading = false;
  let inflightKey = '';   // 지금 달리고 있는 요청의 기간
  let scrolled = false;   // 자기 매장 자동 스크롤은 진입 시 1회만 (기간을 바꿀 때마다 튀면 거슬린다)

  /* 왕복이 끝날 때까지(2초, 콜드 스타트면 11초) '불러오는 중입니다…'와 빈 표를 보여주던 자리에
     지난번 받아 둔 표를 먼저 그린다(2026-08-26).
     ★기간별로 따로 담아 둔다★ (2026-08-26 확장) — 예전에는 계정당 한 칸이라 마지막 응답만
       남았고, 그래서 '진입 1회'로 제한할 수밖에 없었다(다른 달 표를 그리면 renderPeriods가
       select까지 그 달로 되돌려, 점장이 고른 달의 숫자라고 믿고 다른 달 숫자를 읽게 된다).
       이제 고른 그 달의 표만 그리므로 select와 숫자가 어긋날 수 없고, 10월→9월→10월처럼
       오갈 때마다 기다리지 않아도 된다. 그려 둔 뒤에는 언제나 배경에서 다시 받아 온다
       (서버가 이미 300초 캐시를 물고 있으므로 왕복을 '아낀다'고 건너뛰지는 않는다 —
        제출이 있으면 서버가 그 캐시를 바로 버리는데, 화면이 자기 캐시를 믿으면 그게 안 보인다). */

  /* 지금 화면에 그려져 있는 ★서버 응답★의 기간. 캐시본·오류·점검 화면이면 ''.
     같은 기간을 새로고침할 때 옛 숫자가 잠깐 깜빡였다가 돌아오는 일을 막는 데 쓴다. */
  let shownKey = '';

  /* 지금 화면 위에는 캐시본을 그리면 안 된다(오류·점검·오프라인 안내를 띄워 둔 상태).
     표를 비운 이유가 '오래된 숫자를 최신인 양 보여주지 않는다'인데, 다음 조작에서 옛 숫자를
     되살리면 그 비움이 통째로 무의미해진다. 정상 응답이 한 번 오면 풀린다. */
  let noStale = false;

  // 지금 화면에 떠 있는 표가 캐시본인가 (non-ok 응답이 오면 지워야 할 표식)
  let staleShown = false;

  /* ★마지막 요청만 화면에 반영한다★ — 지금은 아래 loading 게이트가 겹침을 막지만, 그 게이트는
     시트 읽기 쿼터를 지키려는 장치이지 순서를 지키려는 장치가 아니다. 겹침이 한 번이라도 새면
     늦게 도착한 옛 기간 응답이 새 기간 표를 덮어 ★기간 select와 숫자가 어긋난 채로 남는다★ —
     화면이 틀렸다는 것조차 알 수 없는 상태라, 게이트와 별개로 순서 가드를 둔다. */
  let reqSeq = 0;

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
    shownKey = '';   // 표를 비웠다 = 화면에 서버 숫자가 남아 있지 않다
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

  /* stale = 캐시본을 먼저 그려 두고 서버 응답을 기다리는 중(제3의 상태).
     offline과 뭉뚱그리지 않는다 — 오프라인은 '이게 지금 받을 수 있는 전부'라는 뜻이고,
     stale은 '곧 바뀐다'는 뜻이라 점장이 기다려야 할지 말지가 정반대다. */
  function renderTrust(data, offline, stale) {
    /* "왜 안 바뀌지" 문의를 없애는 한 줄. 관리자가 통합시트를 브라우저에서 직접 고치면 백엔드는
       알 수 없고 캐시 TTL이 유일한 방어선이므로, 기준 시각을 상시 표기한다. */
    let n = minsAgo(data && data.updatedAt);
    if (n == null && data && typeof data.cacheAge === 'number') n = Math.round(data.cacheAge / 60);
    const when = (n == null) ? '방금' : (n <= 0 ? '방금' : n + '분 전');
    /* 캐시본을 그리는 동안에도 '몇 분 전 기준'은 그대로 적는다 — 옛 숫자라는 사실을 지우지 않기
       위해서다. 다만 그 옆에 갱신 중임을 반드시 붙인다(꼬리표 없는 옛 숫자가 이 화면 최악의 사고다). */
    $('#trust').textContent = '본사 통합시트 입력 기준 · ' + when
      + (offline ? ' (저장된 화면)' : (stale ? ' (지난번 받아둔 화면 · 갱신 중)' : ''));
    $('#freshInfo').textContent = offline ? '오프라인' : (stale ? '갱신 중…' : when);
  }

  function render(data, offline, stale) {
    // period는 필수 필드지만, 옛 스냅샷을 그릴 때 없을 수 있어 화면이 통째로 죽지 않도록 채워 둔다.
    if (!data.period) data.period = { key: $('#period').value || curPeriod(), label: '', type: 'month' };
    const hasHC = !(data.cols && data.cols.hasHygieneCs === false);
    renderPeriods(data);
    renderStats(data);
    renderHead(data.cols, hasHC);
    renderRows(data, hasHC);
    renderWarn(data, offline);
    renderTrust(data, offline, stale);
  }

  // ---------- 불러오기 ----------

  /* 저장 형태: { '2026-10': {응답…, _at: 저장시각}, '2026-09': {…} } — 계정당 한 칸 안에 기간별로.
     ★옛 형태도 읽을 수 있어야 한다★ — 앱 v62까지 이 칸에는 마지막 응답 하나가 통째로 들어 있었다.
       그걸 기간별 지도로 잘못 읽으면 rows·cols·stats를 기간 키인 줄 알고 화면이 깨진다. */
  function snapAll() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(snapName()) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return {};
    if (o.rows || o.cols || o.ok) {                 // 옛 형태 — 그 기간 한 칸짜리 지도로 바꿔서 쓴다
      const k = o.period && o.period.key;
      if (!k) return {};
      const m = {};
      m[k] = o;
      return m;
    }
    return o;
  }

  function snapPut(key, data) {
    try {
      const a = snapAll();
      const copy = JSON.parse(JSON.stringify(data));   // _at을 살아 있는 응답 객체에 묻히지 않게
      copy._at = Date.now();
      a[key] = copy;
      const keys = Object.keys(a).sort(function (x, y) { return (a[x]._at || 0) - (a[y]._at || 0); });
      while (keys.length > SNAP_MAX) delete a[keys.shift()];   // 오래 안 본 기간부터 버린다
      localStorage.setItem(snapName(), JSON.stringify(a));
      /* 계정 없이 저장하던 시절의 한 칸을 치운다 — 남겨 두면 그 안의 mine 표식이
         계속 기기에 남는다(읽지는 않지만 지울 이유가 있는 값이다). */
      localStorage.removeItem(SNAP_BASE);
    } catch (e) { /* 용량 초과 등 — 스냅샷은 편의 기능이라 실패해도 화면은 정상 */ }
  }

  /* 한 기간의 저장본. 없으면 null.
     ★'몇 분 전'이 정직하게 늙게 만든다★ — updatedAt(서버가 찍은 시각)이 있으면 그대로 두면 되지만,
       그것이 없을 때 쓰는 cacheAge는 '받아 온 그 순간의 나이'라, 손대지 않으면 사흘 묵은 저장본이
       '3분 전'이라고 말한다. 이 화면에서 꼬리표 없는 옛 숫자가 가장 나쁜 사고다. */
  function snapGet(key) {
    const e = snapAll()[key];
    if (!e || !e.period || e.period.key !== key) return null;
    if (!e.updatedAt && typeof e.cacheAge === 'number' && e._at) {
      e.cacheAge = e.cacheAge + Math.max(0, Math.round((Date.now() - e._at) / 1000));
    }
    return e;
  }

  // 오프라인에 그려 줄 것 — 그 기간이 있으면 그것, 없으면 가장 최근에 받아 둔 기간
  function snapAny(key) {
    const a = snapAll();
    if (key && a[key]) return snapGet(key);
    const keys = Object.keys(a).sort(function (x, y) { return (a[y]._at || 0) - (a[x]._at || 0); });
    return keys.length ? snapGet(keys[0]) : null;
  }

  function showSnapshot(reason, key) {
    const snap = snapAny(key);
    if (!snap) { setNote($('#stateNote'), reason); return; }
    render(snap, true);
    shownKey = '';   // 저장본이지 서버 숫자가 아니다
    setNote($('#stateNote'), '');
  }

  /* 서버를 기다리는 동안 ★그 기간의★ 지난번 표를 먼저 그린다. 그렸으면 true.
     ★기간이 다른 표는 절대 그리지 않는다★ — 그리는 순간 renderPeriods가 select까지 그 달로
       되돌려, 점장은 자기가 고른 달의 숫자라고 믿고 다른 달 숫자를 읽는다.
       기간별로 담아 두므로(snapGet이 기간까지 대조한다) 없으면 예전처럼 '불러오는 중'만 보여준다.
     문구는 render() 뒤에 적는다 — renderRows가 '표시할 매장이 없습니다'로 stateNote를 덮을 수 있다. */
  function showStale(key) {
    const snap = snapGet(key);
    if (!snap) return false;
    render(snap, false, true);
    shownKey = '';   // 캐시본이지 서버 숫자가 아니다
    setNote($('#stateNote'), '지난번 받아둔 화면입니다. 최신 자료를 불러오는 중입니다…');
    return true;
  }

  /* 캐시본을 그려 둔 채로 non-ok 응답을 받았을 때 표를 즉시 비운다.
     ★서버가 "지금은 못 준다"고 답했는데 지난 표가 남아 있으면, 문구만 오류이고 숫자는 최신처럼
       읽힌다★ — 점검 때 스냅샷을 덮지 않는 이유(showMaint 위 주석)·오류 때 스냅샷을 쓰지 않는
       이유(load 끝 주석)와 같은 원칙이다. 캐시를 먼저 그리기로 한 이상 되돌리는 쪽도 있어야 한다. */
  function clearStale() {
    staleShown = false;
    shownKey = '';
    $('#rankBody').innerHTML = '';
    $('#rankHead').innerHTML = '';
    $('#stats').innerHTML = '';
    setNote($('#adminNote'), '');
    setNote($('#warnNote'), '');
    $('#trust').textContent = '';
    $('#freshInfo').textContent = '';
  }

  async function load(key) {
    /* ★같은 기간을 겹쳐 부르지만 않는다★ — 시트 읽기를 두 번 하지 않으려는 장치다.
       (새로고침 버튼은 도는 동안 비활성이라 여기 걸릴 일이 드물지만 남겨 둔다.)
       ★다른 기간이면 버리지 않는다★ (2026-08-26) — 예전에는 이것도 버리고 '아직 불러오는 중'만
         남겼다. 기간별 캐시가 생긴 뒤로는 고른 달의 표가 곧바로 떠 있는데 그 선택을 버리면,
         잠시 뒤 도착한 옛 응답이 select를 원래 기간으로 되돌려 사용자가 고른 것이 취소된 것처럼
         보인다. 늦게 온 옛 응답은 아래 reqSeq 가드가 화면에 못 닿게 버린다. */
    if (loading && key === inflightKey) {
      setNote($('#stateNote'), '이미 불러오는 중입니다. 잠시만 기다려 주세요.');
      return;
    }
    loading = true;
    inflightKey = key;
    const seq = ++reqSeq;
    $('#reloadBtn').disabled = true;

    /* 그 기간의 캐시본을 먼저 그린다. 못 그리면(캐시 없음) 예전 그대로 빈 표 + 안내.
       ★같은 기간을 새로고침할 때는 그리지 않는다★(key === shownKey) — 화면에 이미 서버가 준
         숫자가 떠 있는데 옛 숫자로 한 번 깜빡였다 돌아오는 것은 개선이 아니라 불안이다.
       ★오류·점검 화면 위에도 그리지 않는다★(noStale) — 표를 비운 이유가 그것이었다.
       staleShown은 '이 화면의 숫자가 캐시본이다'라는 표식이라, 아래 non-ok 분기에서 지울 근거가 된다. */
    staleShown = (!noStale && key !== shownKey) ? showStale(key) : false;
    if (!staleShown) {
      /* ★다른 달을 기다리는 동안 지난 달 표를 남겨 두지 않는다★ — select는 새 달을 가리키는데
         숫자는 지난 달 그대로면, 점장은 자기가 고른 달의 숫자라고 믿고 다른 달 숫자를 읽는다.
         (shownKey가 있을 때만 지운다 — 오프라인·오류 안내 화면은 자기 문구를 지키게 둔다) */
      if (shownKey && key !== shownKey) clearStale();
      setNote($('#stateNote'), '불러오는 중입니다…');
    }

    const OFFMSG = '연결이 되지 않아 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    let res = null;
    try {
      res = await Api.call('dashboard.get', { period: key });
    } catch (e) {
      /* Api.call은 네트워크 실패를 던지지 않고 code:'NETWORK'로 돌려준다(아래에서 받는다).
         여기까지 오는 것은 Api 자체가 없거나 예상 못 한 예외뿐이라, 서버에서 받아 그려 둔 표는
         그대로 둔다. 다만 캐시본은 여기서도 내린다 — 바로 아래 showSnapshot이 같은 틱에 다시
         그려 주므로 보통은 아무 차이가 없지만, 스냅샷을 못 읽는 순간이면 '갱신 중' 꼬리표가 붙은
         옛 표가 갱신도 없이 눌러앉는다. non-ok 분기와 같은 규칙을 예외 경로에도 똑같이 적용한다. */
      if (seq !== reqSeq) return;
      noStale = true;
      if (staleShown) clearStale();
      showSnapshot(OFFMSG, key);
      loading = false; $('#reloadBtn').disabled = false;
      return;
    }

    /* 지나간 요청의 응답은 여기서 버린다. loading·버튼도 건드리지 않는다 —
       아직 달리고 있는 최신 요청이 끝날 때 정리하게 두어야 버튼이 일찍 풀리지 않는다. */
    if (seq !== reqSeq) return;

    loading = false;
    $('#reloadBtn').disabled = false;

    if (res && res.ok) {
      setNote($('#stateNote'), '');
      showMaint('');           // 정상 응답이 왔다 = 점검이 풀렸다
      /* 저장은 ★서버가 실제로 답한 기간★으로 한다 — 요청한 키와 다를 수 있고(기간 보정),
         그때 요청 키로 담아 두면 다음에 그 키를 열 때 다른 달 표가 캐시본으로 뜬다. */
      const got = (res.period && res.period.key) || key;
      snapPut(got, res);
      render(res, false);
      staleShown = false;   // 이제 화면 숫자는 서버가 준 것이다 — 캐시본 표식을 내린다
      noStale = false;      // 오류·점검이 풀렸다 — 캐시본을 다시 그려도 된다
      shownKey = got;
      return;
    }

    /* 여기부터는 전부 non-ok다. 캐시본을 그려 둔 화면이라면 ★분기를 나누기 전에 먼저 지운다★ —
       뒤에 오는 분기 중 하나라도(FORBIDDEN·APP_OUTDATED·SERVER_ERROR…) 문구만 바꾸고 표를 그대로
       두면, 그 순간 화면은 '오류 문구 + 지난달 숫자'가 된다. 지우는 쪽을 위에 두면 나중에 분기가
       하나 늘어도 캐시본이 남는 경로가 생기지 않는다.
       NETWORK·MAINT는 곧바로 자기 화면을 다시 그리므로 같은 틱 안에서 덮여 깜빡이지 않는다. */
    noStale = true;
    if (staleShown) clearStale();

    /* 오류 분기는 code 상수로만 한다. 한국어 문구로 분기하면 서버가 문구를 다듬는 날 조용히 깨진다.
       error 문구는 사용자에게 보여줄 용도로만 쓴다. */
    const code = (res && res.code) || 'SERVER_ERROR';
    const msg = (res && res.error) || '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';

    /* NETWORK는 서버 코드가 아니라 api.js가 붙이는 클라이언트 전용 코드다(오프라인·DNS 실패).
       ★이것을 서버 오류와 같이 취급하면 지하 매장에서 스냅샷이 뜨지 않고 오류 문구만 남는다. */
    if (code === 'NETWORK') { showSnapshot(OFFMSG, key); return; }

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
    showSnapshot('오프라인입니다. 저장된 화면이 없어 표시할 내용이 없습니다.', curPeriod());
    /* 이미 '오프라인'으로 그렸다 — 바로 뒤 load가 같은 표를 '갱신 중'으로 덮었다가 NETWORK 응답에
       다시 '오프라인'으로 되돌리면, 잠깐이라도 곧 갱신될 것처럼 보였다가 아니라고 말하는 꼴이다. */
    noStale = true;
  }
  await load(curPeriod());
})();
