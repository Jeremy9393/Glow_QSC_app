
// ══ 가짜 세계 ═══════════════════════════════════════════════
var SHEETS = {};          // 이름 -> 2차원 배열 (1행 = 머리글)
var WROTE = [];           // 매장 파일/통합시트에 쓴 값 기록
var DELETED = [];

function mkSheet(name, rows) { SHEETS[name] = rows; }
function grid(sh, r, c, nr, nc) {
  if (!sh || nr <= 0 || nc <= 0) return null;
  var v = sh._rows;
  return {
    getValues: function () {
      var o = [];
      for (var i = 0; i < nr; i++) { var row = [];
        for (var j = 0; j < nc; j++) { var rr = v[r - 1 + i] || []; row.push(rr[c - 1 + j] === undefined ? '' : rr[c - 1 + j]); }
        o.push(row); }
      return o;
    },
    clearContent: function () {},
  };
}
function wrapSheet(name) {
  var rows = SHEETS[name]; if (!rows) return null;
  return { _name: name, _rows: rows,
    getLastRow: function () { return rows.length; },
    getLastColumn: function () { var m = 0; rows.forEach(function (r) { m = Math.max(m, r.length); }); return m; } };
}
var SpreadsheetApp = { openById: function () { return {
  getSheetByName: function (n) { return wrapSheet(n); },
  getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; },
  deleteSheet: function () { DELETED.push('탭삭제'); } }; } };
function ssTz() { return 'Asia/Seoul'; }
function fileTz() { return 'Asia/Seoul'; }
function normStore(v) { return String(v == null ? '' : v).replace(/\s+/g, ''); }
function dateOfCell(v) { return String(v == null ? '' : v).slice(0, 10); }
function ymOfCell(v) { return String(v == null ? '' : v).slice(0, 7); }
function timeKeyOf(v) { return String(v == null ? '' : v).trim(); }
function yymm(d) { return d.slice(2, 4) + d.slice(5, 7); }
function round1(n) { return Math.round(n * 10) / 10; }
function err(c, m) { return { ok: false, code: c, error: m }; }
function delRows(sh, rows) {
  rows.slice().sort(function (a, b) { return b - a; }).forEach(function (r) { sh._rows.splice(r - 1, 1); });
}
function dropNaCache() {} function dropDashCache() {} function dropStoreCache() {}
function auditLog() {}
function storeFileId() { return 'FAKE'; }
function labelMap() { return {}; }
function labelValue() { return { v: VISIT_DATE }; }
function setByLabel(sh, label, v) { WROTE.push(['매장파일:' + label, v]); return true; }
function setByLabelAny(sh, labels, v) { WROTE.push(['매장파일:' + labels[0], v]); return true; }
var L_QSC = ['QSC점수'], L_MS = ['MS점수'];
function wipeImprove() { return { ok: true, n: 0, touched: 0, extra: 0 }; }
function improveBlocked() { return null; }
function writeDashboard(store, date, v, off) { WROTE.push(['통합시트:' + (off === 0 ? 'QSC' : 'MS'), v]); return { ok: true, cell: off === 0 ? 'BV6' : 'BX6' }; }
var DASHBOARD_ID = 'X';
var DriveApp = { getFileById: function () { return { setTrashed: function () {} }; } };
var VISIT_DATE = '';
var SPREADSHEET_ID = 'X';
/* 쓰기 밸브는 2026-08-27에 지웠다 — 스텁도 필요 없다 */
function undoList() { return { ok: true, items: [] }; }
function tableEndRow() { return 0; }
function impCols() { return { ok: false }; }
function improveScan() { return { ok: true, filled: 0, touched: 0 }; }

function fnUndoSubmit(ctx, payload) {
  const p = payload || {};
  const store = String(p.store || '').trim();
  const date = String(p.date || '').trim();
  const time = p.time ? timeKeyOf(p.time, ssTz()) : '';
  const kind = String(p.kind || 'both');
  const apply = p.apply === true;
  if (!store) return err('BAD_REQUEST', '매장명을 주십시오.');
  /* ★날짜를 안 주면 '무엇이 있는지'만 알려 준다★ (2026-08-26) — 화면에서 고르게 하려는 것이다.
     날짜를 외워서 정확히 타이핑해야 했던 것이 이 기능의 가장 큰 벽이었다.
     한 글자만 틀려도 0건으로 끝나고, 담당자는 '되돌릴 게 없다'고 잘못 읽는다. */
  if (!date) return undoList(store);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('BAD_REQUEST', '날짜는 2026-10-01 모양으로 주십시오.');
  if (['both', 'qsc', 'shopper'].indexOf(kind) < 0) return err('BAD_REQUEST', "kind는 'qsc'·'shopper'·'both' 중 하나입니다.");

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = ssTz();
  const key = normStore(store);
  const ym = date.slice(0, 7);
  const tab = yymm(date);
  const doQsc = (kind !== 'shopper'), doShop = (kind !== 'qsc');
  const log = [], done = [];
  /* 개선요청 행을 끝내 못 지운 채 끝났는가 — 그 상태로 새 제출을 얹으면 두 벌이 된다.
     부르는 쪽(guardResubmit)이 이 값을 보고 저장을 멈춘다. */
  let dirty = false, dirtyWhy = '';

  /* 지울 행을 먼저 전부 모은다 — 미리보기와 실제 실행이 같은 판단을 쓰게 하기 위해서다.

     routeCol/routeWant: '입력경로' 칸으로 ★누가 낸 것인지★ 가린다 (2026-08-27).
       종전에는 매장명+날짜만 봤다. 그래서 담당자가 MS 를 다시 내면 그 달 ★손님이 낸 설문까지★
       함께 지워졌다 — 시트 줄 삭제는 휴지통이 없어 되찾을 수 없다.
       시트에 '입력경로'('고객 직접'/'관리자 입력') 칸이 원래부터 있는데 안 보고 있었다.
     leftRows: 지우지 않고 그 달에 ★남는★ 줄의 값. 지운 뒤 점수를 다시 계산할 때 쓴다. */
  function pick(shName, dateCol, storeCol, timeCol, routeCol, routeWant) {
    const sh = ss.getSheetByName(shName);
    if (!sh) return { sh: null, rows: [], monthLeft: 0, leftRows: [] };
    const last = sh.getLastRow();
    if (last < 2) return { sh: sh, rows: [], monthLeft: 0, leftRows: [] };
    const rng = grid(sh, 2, 1, last - 1, sh.getLastColumn());
    const vals = rng ? rng.getValues() : [];
    const rows = [], leftRows = [];
    let monthLeft = 0;
    for (let i = 0; i < vals.length; i++) {
      if (normStore(vals[i][storeCol - 1]) !== key) continue;
      const d = dateOfCell(vals[i][dateCol - 1], tz);
      const sameDay = (d === date);
      const sameTime = (!time || !timeCol) ? true : (timeKeyOf(vals[i][timeCol - 1], tz) === time);
      const routeOk = (!routeCol || !routeWant) ? true
        : (String(vals[i][routeCol - 1] == null ? '' : vals[i][routeCol - 1]).trim() === routeWant);
      if (sameDay && sameTime && routeOk) rows.push(i + 2);
      else if (d.slice(0, 7) === ym) { monthLeft++; leftRows.push(vals[i]); }   // 같은 달에 남을 자료
    }
    return { sh: sh, rows: rows, monthLeft: monthLeft, leftRows: leftRows };
  }

  /* ★route★ — 없으면 그 날짜 쇼퍼 줄을 전부 지운다(관리자 도구의 '통째로 되돌리기').
     '관리자 입력' 을 주면 담당자가 낸 것만 지운다 — 재제출 덮어쓰기가 이 길로 온다. */
  const route = (p.route === '관리자 입력' || p.route === '고객 직접') ? p.route : '';
  const round = doQsc ? pick('QSC_회차', 2, 4, 3) : { sh: null, rows: [], monthLeft: 0, leftRows: [] };
  const detail = doQsc ? pick('QSC_상세', 1, 3, 2) : { sh: null, rows: [], monthLeft: 0, leftRows: [] };
  const shop = doShop ? pick('쇼퍼_응답', 2, 4, 0, 8, route) : { sh: null, rows: [], monthLeft: 0, leftRows: [] };
  /* ★쇼퍼_비고도 그 제출이 쓴 것이다★ (2026-08-26) — 종전에는 빼먹어서, 되돌린 뒤에도
     문항별 이유·비고가 시트에 남았다. 점수는 쇼퍼_응답에서만 계산하므로 점수는 안 틀렸지만,
     '되돌렸다'고 해 놓고 기록이 남아 있는 것은 그 자체로 틀린 상태다. */
  const shopMemo = doShop ? pick('쇼퍼_비고', 2, 4, 0, 5, route) : { sh: null, rows: [], monthLeft: 0, leftRows: [] };
  const na = (doQsc && time === '') ? pick('NA프리셋', 3, 1, 0) : { sh: null, rows: [], monthLeft: 0, leftRows: [] };

  const hit = round.rows.length + detail.rows.length + shop.rows.length + shopMemo.rows.length + na.rows.length;
  log.push('QSC_회차 ' + round.rows.length + '건 · QSC_상세 ' + detail.rows.length +
    '건 · 쇼퍼_응답 ' + shop.rows.length + '건 · 쇼퍼_비고 ' + shopMemo.rows.length +
    '건 · NA프리셋 ' + na.rows.length + '건');

  /* ★찾은 것이 하나도 없으면 여기서 끝낸다★ — 아래로 내려가면 안 된다.
     내려가면 "그 달에 남는 자료가 없다"가 참이 되어 ★매장 파일 탭을 지우겠다★고 나선다.
     매장 파일에만 있고 응답 시트에는 없는 탭(담당자가 손으로 만든 탭)이 그렇게 날아간다.
     매장명 오타도 여기서 걸린다 — 없는 매장은 당연히 0건이다. */
  if (!hit) {
    return { ok: true, preview: true, nothing: true, store: store, date: date,
      plan: ['되돌릴 제출을 찾지 못했습니다 — 매장명·날짜를 다시 보십시오 (아무것도 건드리지 않았습니다)'] };
  }

  /* 그 달에 아무것도 안 남는가 — 매장 파일 탭을 지워도 되는지의 판단 기준이다.
     한쪽만 되돌리는 경우(kind)에는 손대지 않은 쪽이 그대로 남으므로 탭을 지우지 않는다. */
  const oneSided = (kind !== 'both');
  const monthEmpty = !oneSided && (round.monthLeft === 0) && (shop.monthLeft === 0);
  /* ★두 줄이 서로 어긋나지 않게 한다★ (2026-08-26) — 종전에는 여기서 '건드리지 않습니다 ·
     개선요청은 손으로'라고 적어 놓고, 바로 아래에서 '개선요청 행도 함께 비웁니다'라고 적었다.
     한쪽만 되돌릴 때도 개선요청을 지우도록 고친 뒤로 이 문구가 사실과 달라진 것이다.
     미리보기는 사람이 읽고 [정말 지웁니다]를 누르는 근거라, 여기서 어긋나면 안 된다. */
  const scoreCols = (doQsc ? 'QSC' : '') + (doQsc && doShop ? '·' : '') + (doShop ? 'MS' : '');
  log.push(monthEmpty
    ? ('매장 파일 ' + tab + ' 탭: 그 달에 남는 자료가 없어 통째로 지웁니다 (탭의 방문일이 ' + date + '일 때만)')
    : ('매장 파일 ' + tab + ' 탭: 탭은 그대로 두고 ' + scoreCols + ' 점수 칸을 비웁니다' +
      (oneSided ? ' (한쪽만 되돌리기라 탭 자체는 지우지 않습니다 — 빈 양식으로 남고 다음에 그대로 쓰입니다)'
        : ' — 그 달에 QSC ' + round.monthLeft + '건 · 쇼퍼 ' + shop.monthLeft + '건이 남습니다')));
  /* ★방문일·방문시간·개선요청은 QSC가 쓴 것이다★ — 그래서 그 달에 QSC가 하나도 안 남을 때만
     되돌린다. 남아 있으면 그 줄들이 남은 회차의 것일 수 있어 가릴 방법이 없다(행에 회차 표식이 없다). */
  if (doQsc && !monthEmpty) {
    /* 미리보기에서도 매장 파일을 한 번 열어 '매장이 적은 답이 몇 건인지'를 정확히 적는다.
       ★지워지는 것을 지우기 전에 보여 주는 것이 이 화면의 존재 이유다.★ */
    let wroteN = 0;
    if (round.monthLeft === 0) {
      const b = improveBlocked(store, date);
      if (b) wroteN = b.touched;
    }
    log.push(round.monthLeft === 0
      ? ('매장 파일 ' + tab + ' 탭: 방문일·방문시간·개선요청 행도 함께 비웁니다' +
        (wroteN ? ('  ★매장이 적은 답 ' + wroteN + '건도 함께 지워집니다 — 다시 작성을 요청하셔야 합니다★') : ''))
      : ('매장 파일 ' + tab + ' 탭: ★개선요청 행은 그대로 둡니다★ — 그 달에 QSC ' + round.monthLeft +
        '건이 남아 어느 줄이 이 제출 것인지 가릴 수 없습니다'));
  }
  log.push('통합시트 ' + ym + ' ' + (doQsc ? 'QSC' : '') + (doQsc && doShop ? '·' : '') + (doShop ? 'MS' : '') + ' 점수 칸을 비웁니다');

  if (!apply) return { ok: true, preview: true, store: store, date: date, plan: log };

  /* ★사진 파일 ID를 행을 지우기 전에 모아 둔다★ — QSC_상세 사진열(13번째)에 주소가 남아 있고,
     그 주소 안에 파일 ID가 들어 있다. 행을 먼저 지우면 어느 사진이 이 제출 것인지 영영 알 수 없다. */
  const photoIds = [];
  if (detail.sh && detail.rows.length) {
    const lastD = detail.sh.getLastRow();
    const colR = grid(detail.sh, 2, 13, Math.max(0, lastD - 1), 1);
    const col = colR ? colR.getValues() : [];
    detail.rows.forEach(function (r) {
      String((col[r - 2] || [''])[0] || '').split(/\s+/).forEach(function (u) {
        const m = u.match(/[-\w]{25,}/);
        if (m && photoIds.indexOf(m[0]) < 0) photoIds.push(m[0]);
      });
    });
  }

  /* ★지운 뒤 그 칸에 무엇을 넣을 것인가★ (2026-08-27)

     종전에는 무조건 빈칸('')으로 만들었다. 그 달에 다른 제출이 남아 있어도 그랬다.
     특히 CS 점수는 원래 「그 달에 들어온 쇼퍼 응답 ★전부의 평균★」인데(shopperMonthAvg),
     그 평균 함수를 부르는 곳이 저장할 때 한 곳뿐이라 되돌릴 때는 다시 계산되지 않았다.
     그래서 손님 설문 3건 중 하루치만 되돌려도 나머지 2건이 멀쩡히 있는데 CS 가 사라지고,
     종합점수 수식이 「QSC·MS 둘 다 있어야 뜬다」라서 ★종합까지 안 뜬다★.

     ⚠빈칸과 0점은 다르다. 통합시트 수식은
         =IF(COUNT(BV,BX)<2,"", BV*0.6 + BX*0.3 + IF(BZ="",1,BZ)*0.1)
       이라, MS 칸에 0 이 들어가면 COUNT 가 2가 되어 ★종합이 0점으로 계산되어 뜬다★.
       빈칸이어야 종합도 빈칸이 된다. 그래서 「남은 게 있나」를 점수가 아니라
       ★남은 줄 수(monthLeft)★ 로 가린다. */
  function qscAfter() {
    if (!round.sh || !round.leftRows.length) return '';       // 그 달에 QSC 가 안 남는다 → 빈칸
    /* 저장 경로는 제출할 때마다 그 칸을 덮어쓴다 — 즉 「마지막에 낸 것이 이긴다」.
       되돌린 뒤에도 같은 규칙으로, 남은 것 중 가장 나중에 낸 회차의 점수를 쓴다. */
    let best = null, bestT = -1;
    round.leftRows.forEach(function (v) {
      const raw = v[0];                                       // 1열 제출시각
      const t = (raw instanceof Date) ? raw.getTime() : Date.parse(String(raw || '')) || 0;
      if (t >= bestT) { bestT = t; best = v; }
    });
    const sc = best ? best[5] : null;                         // 6열 QSC점수 (0~100)
    return (typeof sc === 'number') ? sc / 100 : '';
  }
  function msAfter() {
    if (!shop.sh || shop.monthLeft <= 0) return '';           // 그 달에 쇼퍼가 안 남는다 → 빈칸
    /* ★줄을 지운 뒤에 불러야 한다★ — 이 함수는 시트를 다시 읽는다. */
    const avg = shopperMonthAvg(shop.sh, store, date, tz);
    return (typeof avg === 'number') ? avg / 100 : '';
  }

  /* ── 여기부터 실제로 지운다. 아래에서 위로 지워야 행 번호가 밀리지 않는다 ── */
  [round, detail, shop, shopMemo, na].forEach(function (t) {
    if (!t.sh || !t.rows.length) return;
    delRows(t.sh, t.rows);
  });
  done.push('응답 시트 ' + (round.rows.length + detail.rows.length + shop.rows.length +
    shopMemo.rows.length + na.rows.length) + '행 삭제');
  if (na.rows.length) dropNaCache();   // NA프리셋 줄을 지웠으면 캐시도 버린다

  /* ★되돌리기는 늘 매장 파일과 통합시트를 정리한다★ — 건너뛰는 조건이 없다.
     멈추는 수단은 「관리자 도구 → 제출 관리 → 제출 되돌리기」, 곧 이 함수 하나다. */
  const fileId = storeFileId(store);
  if (!fileId) done.push('★매장 파일을 못 찾았습니다★: ' + store);
  else {
    const ss2 = SpreadsheetApp.openById(fileId);
    const sh2 = ss2.getSheetByName(tab);
    if (!sh2) done.push('매장 파일 ' + tab + ' 탭이 원래 없습니다');
    else if (monthEmpty && dateOfCell(labelValue(labelMap(sh2), ['방문일', '방문일자', '점검일', '점검일자']).v, fileTz(ss2)) !== date) {
      /* ★탭의 방문일이 다르면 지우지 않는다★ — 응답 시트에서는 안 보이는 회차가 그 탭에
         들어 있다는 뜻이다(담당자가 손으로 만든 탭 등). 지우면 되돌릴 수 없다. */
      if (doQsc) setByLabelAny(sh2, L_QSC, qscAfter());
      if (doShop) setByLabelAny(sh2, L_MS, msAfter());
      done.push('매장 파일 ' + tab + ' 탭: ★방문일이 ' + date + '가 아니라 지우지 않았습니다★ — 점수 칸만 고쳤습니다');
    }
    else if (monthEmpty) { ss2.deleteSheet(sh2); done.push('매장 파일 ' + tab + ' 탭 삭제'); }
    else {
      const qv = doQsc ? qscAfter() : '', mv = doShop ? msAfter() : '';
      if (doQsc) setByLabelAny(sh2, L_QSC, qv);
      if (doShop) setByLabelAny(sh2, L_MS, mv);
      const parts = [(qv === '' && mv === '')
        ? '점수 칸을 비웠습니다'
        : ('점수 칸을 남은 자료로 다시 계산했습니다' +
           (qv === '' ? '' : ' (QSC ' + round1(qv * 100) + '점)') +
           (mv === '' ? '' : ' (MS ' + round1(mv * 100) + '점)'))];
      /* 방문일·방문시간·개선요청은 QSC가 쓴 것이다. 그 달에 QSC가 하나도 안 남고, 탭의 방문일이
         지금 되돌리는 날짜와 같을 때만 되돌린다 — 그 조건이면 표의 모든 줄이 이 제출 것이다. */
      const tabDate = dateOfCell(labelValue(labelMap(sh2),
        ['방문일', '방문일자', '점검일', '점검일자']).v, fileTz(ss2));
      if (doQsc && round.monthLeft === 0 && tabDate === date) {
        /* ★개선요청을 먼저 지우고, 성공했을 때만 방문일을 지운다★ (2026-08-27)
           순서가 반대였다. 방문일을 먼저 비우면 — 개선요청을 못 지웠을 때 —
           다음 제출이 '다른 회차'로 보고 남은 줄 ★아래에 이어 붙인다★.
           그러면 개선요청이 두 벌이 되고 개선율이 반토막 난 채 종합점수에 들어간다.
           방문일을 남겨 두면 다음 제출이 '같은 회차'로 보고 덮어쓰기를 시도하다가
           매장이 적은 것을 보고 스스로 멈춘다 — 안전한 쪽으로 실패한다. */
        const w = wipeImprove(sh2);
        if (w.ok) {
          setByLabel(sh2, '방문일', '');
          setByLabel(sh2, '방문시간', '');
          parts.push('방문일·방문시간을 비웠습니다');
          parts.push(w.n
            ? ('개선요청 ' + w.n + '행을 비웠습니다' +
               (w.touched ? (' (매장이 적은 답 ' + w.touched + '건도 함께 지웠습니다 — 매장에 다시 요청하셔야 합니다)') : ''))
            : '개선요청 행은 원래 없었습니다');
        } else {
          dirty = true; dirtyWhy = w.why || '';
          parts.push('★개선요청 ' + (w.n || 0) + '행을 지우지 못했습니다★ — ' + w.why +
            ' · 방문일도 그대로 두었습니다(다음 제출이 이어 붙지 않게)');
        }
      } else if (doQsc) {
        parts.push('★개선요청 행은 손으로 지우십시오★ — ' + (round.monthLeft
          ? '그 달에 QSC ' + round.monthLeft + '건이 남아 어느 줄이 이 제출 것인지 가릴 수 없습니다'
          : '탭의 방문일이 ' + date + '가 아닙니다'));
      }
      done.push('매장 파일 ' + tab + ' 탭: ' + parts.join(' · '));
    }
  }

  /* 통합시트 — writeDashboard 를 그대로 탄다. 빈 값을 쓰는 것뿐이라
     '올해인가·그 칸이 수식인가' 두 검사도 똑같이 걸린다. */
  if (DASHBOARD_ID) {
    if (doQsc) {
      const v = qscAfter();
      const a = writeDashboard(store, date, v, 0);
      done.push('통합시트 QSC 칸: ' + (a.ok
        ? (a.cell + (v === '' ? ' 비움' : (' → ' + round1(v * 100) + '점 (남은 자료로 다시 계산)'))) : a.error));
    }
    if (doShop) {
      const v = msAfter();
      const b = writeDashboard(store, date, v, 2);
      done.push('통합시트 MS 칸: ' + (b.ok
        ? (b.cell + (v === '' ? ' 비움' : (' → ' + round1(v * 100) + '점 (그 달 남은 ' + shop.monthLeft + '건 평균)'))) : b.error));
    }
  }
  /* ★지우지 않고 휴지통으로 보낸다★ — 되돌리기를 잘못 눌렀을 때 되찾을 수 있어야 한다
     (구글 드라이브 휴지통 30일). 이 저장소의 "코드가 사진을 지우지 않는다" 정책은
     '어느 사진이 어느 제출 것인지 모르는' 정리 작업을 두고 한 말이고, 여기는 정확히 안다. */
  if (photoIds.length) {
    let okN = 0, badN = 0;
    photoIds.forEach(function (id) {
      try { DriveApp.getFileById(id).setTrashed(true); okN++; } catch (e) { badN++; }
    });
    done.push('사진 ' + okN + '장을 휴지통으로 보냈습니다' +
      (badN ? ' (' + badN + '장은 못 찾았습니다 — 이미 지워졌을 수 있습니다)' : ''));
  }

  dropDashCache(date);
  dropStoreCache(store, tab);
  auditLog(ctx, 'admin.undoSubmit', store, '성공', '', date + (time ? ' ' + time : '') + ' / ' + kind + ' / ' + done.join(' · '));
  return { ok: true, preview: false, store: store, date: date, plan: log, done: done, dirty: dirty, why: dirtyWhy };
}

function shopperMonthAvg(sh, store, dateStr, tz) {
  const ym = dateStr.slice(0, 7); // 'YYYY-MM'
  /* ★끝에서부터 읽는다★ — 이 시트는 익명 고객 설문이 함께 쌓이는 공개 시트라
     getDataRange()면 제출 1건마다 수천 행을 읽게 된다 (submittedStores와 같은 이유). */
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const n = Math.min(3000, last - 1);
  const rng = grid(sh, last - n + 1, 1, n, 9);
  const vals = rng ? rng.getValues() : [];
  const scores = [];
  const key = normStore(store);
  /* ★본사가 채운 것과 고객이 낸 것을 구별하지 않는다★ (2026-08-20 사용자 결정)
     담당자가 직접 체크하는 경우도 미스터리쇼퍼와 같은 일이다 — 손님으로 가서 보고 적는 것이다.
     그래서 두 경로가 CS 점수에 똑같이 들어간다. 시트의 '입력경로' 칸은 ★기록용으로만★ 남는다.

     ⚠종전에는 '관리자 입력'만 셌다. 이유는 survey.html을 누구나 열 수 있다는 것이었다 —
       아무나 특정 매장 이름으로 설문을 여러 건 넣어 그 달 CS를 끌어내리거나(또는 올리거나) 할 수 있다.
       CS는 10월부터 종합점수의 30%다. ★그 방어는 제출 코드(매장 1곳 = 코드 1개 = 월 1회)가 맡는다★ —
       설계는 `_보관/설계/쇼퍼_제출코드_설계.md`에 있고 아직 만들지 않았다.
       그때까지는 담당자가 `쇼퍼_응답` 시트를 보고 이상한 건을 지우거나 고친다(그 편집이 곧 반영된다). */
  for (let i = 0; i < vals.length; i++) {
    const dYm = ymOfCell(vals[i][1], tz);
    // 열 순서: 0 제출시각 · 1 방문날짜 · 2 방문시간 · 3 매장명 … 7 입력경로 · 8 점수
    if (normStore(vals[i][3]) === key && dYm === ym && typeof vals[i][8] === 'number') {
      scores.push(vals[i][8]);
    }
  }
  if (!scores.length) return 0;
  return scores.reduce(function (a, b) { return a + b; }, 0) / scores.length;
}

// ══ 시험 ════════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  X    ' + n + (e ? '   ' + e : '')); } }
function wroteOf(k) { for (var i = WROTE.length - 1; i >= 0; i--) if (WROTE[i][0] === k) return WROTE[i][1]; return undefined; }

function reset(shopRows, roundRows, visit) {
  SHEETS = {}; WROTE = []; DELETED = []; VISIT_DATE = visit || '';
  // 쇼퍼_응답: 1제출시각 2방문날짜 3방문시간 4매장명 5~7 8입력경로 9점수
  mkSheet('쇼퍼_응답', [['제출시각','방문날짜','방문시간','매장명','a','b','c','입력경로','점수']].concat(shopRows));
  mkSheet('쇼퍼_비고', [['제출시각','방문날짜','방문시간','매장명','입력경로']]);
  // QSC_회차: 1제출시각 2점검일자 3방문시간 4매장명 5점검자 6QSC점수
  mkSheet('QSC_회차', [['제출시각','점검일자','방문시간','매장명','점검자','QSC점수']].concat(roundRows || []));
  mkSheet('QSC_상세', [['점검일자','방문시간','매장명']]);
  mkSheet('NA프리셋', [['매장명','문항','날짜']]);
  mkSheet('2610', [['매장 파일 10월 탭']]);   // 매장 파일 월 탭 (없으면 점수 칸을 안 건드린다)
}
var S = '금종제과';

console.log('\n[1] ★손님 설문 3건 + 담당자 MS 1건 → 담당자 것만 되돌린다★');
reset([
  ['2026-10-05T10:00','2026-10-05','','금종제과','','','','고객 직접',90],
  ['2026-10-12T10:00','2026-10-12','','금종제과','','','','고객 직접',80],
  ['2026-10-20T10:00','2026-10-20','','금종제과','','','','고객 직접',100],
  ['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60],
]);
var r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('되돌리기 성공', r.ok === true, JSON.stringify(r.error || ''));
ok('★손님 3건이 살아 있다★', SHEETS['쇼퍼_응답'].length === 4, '남은 줄(머리글 포함)=' + SHEETS['쇼퍼_응답'].length);
ok('담당자 것만 지워졌다', !SHEETS['쇼퍼_응답'].some(function (x) { return x[7] === '관리자 입력'; }));
var ms = wroteOf('통합시트:MS');
ok('★통합시트 MS = 남은 3건 평균 0.90★', Math.abs(ms - 0.9) < 1e-9, '값=' + ms);
ok('매장 파일 MS 도 같은 값', Math.abs(wroteOf('매장파일:MS점수') - 0.9) < 1e-9, '값=' + wroteOf('매장파일:MS점수'));

console.log('\n[2] 그 달에 아무것도 안 남으면 ★빈칸★ (0점이 아니다)');
reset([['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60]]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('되돌리기 성공', r.ok === true);
ok('★통합시트 MS = 빈칸★', wroteOf('통합시트:MS') === '', '값=' + JSON.stringify(wroteOf('통합시트:MS')));
ok('★매장파일 MS = 빈칸★', wroteOf('매장파일:MS점수') === '', '값=' + JSON.stringify(wroteOf('매장파일:MS점수')));

console.log('\n[3] 점수가 진짜 0인 경우는 0으로 쓴다 (빈칸과 구별)');
reset([
  ['2026-10-05T10:00','2026-10-05','','금종제과','','','','고객 직접',0],
  ['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60],
]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('★MS = 0 (빈칸 아님)★', wroteOf('통합시트:MS') === 0, '값=' + JSON.stringify(wroteOf('통합시트:MS')));

console.log('\n[4] 관리자 도구에서 route 없이 되돌리면 그 날짜를 통째로');
reset([
  ['2026-10-25T09:00','2026-10-25','','금종제과','','','','고객 직접',70],
  ['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60],
  ['2026-10-05T10:00','2026-10-05','','금종제과','','','','고객 직접',90],
]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true });
ok('그날 2건 다 지웠다', SHEETS['쇼퍼_응답'].length === 2, '남은 줄=' + SHEETS['쇼퍼_응답'].length);
ok('다른 날 1건으로 다시 계산 = 0.90', Math.abs(wroteOf('통합시트:MS') - 0.9) < 1e-9, '값=' + wroteOf('통합시트:MS'));

console.log('\n[5] QSC — 그 달에 남은 회차가 있으면 ★마지막 것★으로');
reset([], [
  ['2026-10-05T10:00','2026-10-05','','금종제과','문수',88],
  ['2026-10-20T10:00','2026-10-20','','금종제과','문수',92],
]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-20', kind: 'qsc', apply: true });
ok('되돌리기 성공', r.ok === true, JSON.stringify(r.error || ''));
ok('★QSC = 남은 5일 회차 0.88★', Math.abs(wroteOf('통합시트:QSC') - 0.88) < 1e-9, '값=' + wroteOf('통합시트:QSC'));

console.log('\n[6] QSC — 월 1회라 남는 게 없으면 빈칸 (실제 운영 모습)');
reset([], [['2026-10-20T10:00','2026-10-20','','금종제과','문수',92]]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-20', kind: 'qsc', apply: true });
ok('★QSC = 빈칸★', wroteOf('통합시트:QSC') === '', '값=' + JSON.stringify(wroteOf('통합시트:QSC')));

console.log('\n[7] 되돌릴 것이 없으면 아무것도 안 건드린다');
reset([['2026-10-05T10:00','2026-10-05','','금종제과','','','','고객 직접',90]]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('nothing=true', r.nothing === true, JSON.stringify(r));
ok('아무것도 안 썼다', WROTE.length === 0, JSON.stringify(WROTE));
ok('손님 것 그대로', SHEETS['쇼퍼_응답'].length === 2);

/* ★쓰기 밸브는 2026-08-27에 통째로 지웠다★ (담당자 결정)
   종전 [8]은 「밸브가 잠기면 안 건드린다」를 쟀는데, 그 기능이 이제 없다.
   대신 ★밸브가 없어도 늘 제대로 쓴다★ 를 잰다 — 지운 뒤 조용히 안 쓰게 되면 그게 사고다. */
console.log('\n[8] ★밸브 없이도 매장 파일·통합시트에 늘 쓴다★');
reset([['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60]]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('응답 시트 줄을 지운다', SHEETS['쇼퍼_응답'].length === 1, '남은 줄=' + SHEETS['쇼퍼_응답'].length);
ok('★매장 파일에 썼다★', wroteOf('매장파일:MS점수') !== undefined, JSON.stringify(WROTE));
ok('★통합시트에 썼다★', wroteOf('통합시트:MS') !== undefined, JSON.stringify(WROTE));
ok('「밸브」라는 말이 결과에 없다', r.done.join(' ').indexOf('밸브') < 0, JSON.stringify(r.done));

console.log('\n[9] 손님 건이 남으면 그 평균으로 다시 쓴다 (밸브와 무관)');
reset([
  ['2026-10-05T10:00','2026-10-05','','금종제과','','','','고객 직접',90],
  ['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60],
]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('통합시트 MS = 0.90', Math.abs(wroteOf('통합시트:MS') - 0.9) < 1e-9, '값=' + wroteOf('통합시트:MS'));

console.log('\n' + (fail ? 'X 실패 ' + fail + '건' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
