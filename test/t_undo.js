
// ★MS_상세 상수★ (2026-09-08 통합) — 진짜 Code.gs 의 값과 같아야 한다.
//   시험틀은 함수만 잘라오므로 상수는 여기서 세워 준다.
var MS_DETAIL = 'MS_상세';
var MS_COL = {
  date: 1, time: 2, store: 3, code: 4, no: 5, text: 6, answer: 7, score: 8, memo: 9,
  at: 10, route: 11, total: 12, answered: 13, overall: 14, demo: 15, order: 16,
};
var MS_HEADER = [
  '방문날짜', '방문시간', '매장명', '코드', '문항번호', '문항', '응답', '점수', '비고',
  '제출시각', '입력경로', '제출점수', '응답수', '총평', '작성자연령대성별', '주문내역',
];
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
/* ★그 달이 열렸는가★ — 되돌리기가 매장 파일 MS점수를 쓸지 말지를 이걸로 가른다(2026-09-04).
   이 시험은 '남은 자료로 다시 계산하는가'를 보는 것이라 ★열린 달★로 둔다.
   닫힌 달일 때 빈칸으로 두는지는 monthclose-test 가 경계값으로 따로 본다. */
var MONTH_OPEN = true;
function monthClosed() { return MONTH_OPEN; }
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
/* 2026-09-17 저녁 — 확정된 달 거부(②-3h) · 스크립트 락(#26) 대역 */
var CLOSED_AT = '';                              // 날짜를 넣으면 그 달이 확정된 것으로 본다
function monthClosedAt() { return CLOSED_AT; }
function ymLabel(ym) { return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월'; }
function ssOpen(id) { return SpreadsheetApp.openById(id); }
var LOCK_OK = true, LOCK_GOT = 0, LOCK_REL = 0;  // 락을 잡을 수 있는가 · 잡은 횟수 · 놓은 횟수
var LockService = { getScriptLock: function () { return {
  tryLock: function () { if (LOCK_OK) LOCK_GOT++; return LOCK_OK; },
  releaseLock: function () { LOCK_REL++; } }; } };
function labelMap() { return {}; }
function labelValue() { return { v: VISIT_DATE }; }
function setByLabel(sh, label, v) { WROTE.push(['매장파일:' + label, v]); return true; }
function setByLabelAny(sh, labels, v) { WROTE.push(['매장파일:' + labels[0], v]); return true; }
var L_QSC = ['QSC점수'], L_MS = ['MS점수'];
/* 개선요청 비우기 대역 — 결과를 바꿔 끼울 수 있고, 몇 번 불렸는지 센다 (2026-09-22) */
var WIPE = { ok: true, n: 0, touched: 0, extra: 0 }, WIPE_CALLS = 0;
function wipeImprove() { WIPE_CALLS++; return WIPE; }
/* ★개선율 칸 되살리기 대역★ (2026-09-22 · 1.50) — 알맹이(resetRateCellIn)는 reset-rate-test 가 따로 잰다.
   여기서는 「되돌리기가 언제 부르고, 결과를 어떻게 알리는가」만 본다. */
var LAYOUT = 'new';
function monthTabLayout() { return LAYOUT; }
var RATE_CALLS = [], RATE_RES = { ok: true, done: true, cell: 'H9', was: 1, now: '=IFERROR(H7/H5, "")' };
function resetRateCellIn(ss, sh, apply) { RATE_CALLS.push(apply); return RATE_RES; }
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
  /* atCol 을 주면 ★남은 것을 제출시각으로 묶어★ 한 번 더 센다 (monthLeftSubmits).
     MS_상세는 한 제출이 38줄이라, 줄 수를 그대로 「남은 건수」로 적으면 38배로 보인다.
     ★지울 줄(rows)은 그대로 줄 단위★다 — 38줄을 다 지워야 하기 때문이다. */
  function pick(shName, dateCol, storeCol, timeCol, routeCol, routeWant, atCol) {
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
    /* 남은 것을 제출 단위로도 세어 둔다 — 화면 문구가 이것을 쓴다 */
    let monthLeftSubmits = monthLeft;
    if (atCol) {
      const seen = {};
      leftRows.forEach(function (v) {
        const k = String(v[atCol - 1] == null ? '' : v[atCol - 1]);
        seen[k || ('#' + Object.keys(seen).length)] = 1;
      });
      monthLeftSubmits = Object.keys(seen).length;
    }
    return { sh: sh, rows: rows, monthLeft: monthLeft,
             monthLeftSubmits: monthLeftSubmits, leftRows: leftRows };
  }

  /* ★route★ — 없으면 그 날짜 쇼퍼 줄을 전부 지운다(관리자 도구의 '통째로 되돌리기').
     '관리자 입력' 을 주면 담당자가 낸 것만 지운다 — 재제출 덮어쓰기가 이 길로 온다. */
  const route = (p.route === '관리자 입력' || p.route === '고객 직접') ? p.route : '';
  const round = doQsc ? pick('QSC_회차', 2, 4, 3) : { sh: null, rows: [], monthLeft: 0, leftRows: [] };
  const detail = doQsc ? pick('QSC_상세', 1, 3, 2) : { sh: null, rows: [], monthLeft: 0, leftRows: [] };
  /* ★쇼퍼 자료는 이제 MS_상세 한 곳뿐이다★ (2026-09-08) — 종전에는 쇼퍼_응답·쇼퍼_비고
     두 시트를 따로 지워야 했고, 한쪽을 빼먹어 되돌린 뒤에도 기록이 남은 적이 있다(2026-08-26).
     한 시트가 되면서 그 실수가 원천적으로 없어졌다. */
  const shop = doShop ? pick(MS_DETAIL, MS_COL.date, MS_COL.store, 0, MS_COL.route, route, MS_COL.at)
    : { sh: null, rows: [], monthLeft: 0, monthLeftSubmits: 0, leftRows: [] };
  const shopMemo = { sh: null, rows: [], monthLeft: 0, leftRows: [] };   // 합쳐졌다 — 자리만 남긴다
  const na = (doQsc && time === '') ? pick('NA프리셋', 3, 1, 0) : { sh: null, rows: [], monthLeft: 0, leftRows: [] };

  const hit = round.rows.length + detail.rows.length + shop.rows.length + shopMemo.rows.length + na.rows.length;
  log.push('QSC_회차 ' + round.rows.length + '건 · QSC_상세 ' + detail.rows.length +
    '건 · ' + MS_DETAIL + ' ' + shop.rows.length + '줄' +
    ' · NA프리셋 ' + na.rows.length + '건');

  /* ★찾은 것이 하나도 없으면 여기서 끝낸다★ — 아래로 내려가면 안 된다.
     내려가면 "그 달에 남는 자료가 없다"가 참이 되어 ★매장 파일 탭을 지우겠다★고 나선다.
     매장 파일에만 있고 응답 시트에는 없는 탭(담당자가 손으로 만든 탭)이 그렇게 날아간다.
     매장명 오타도 여기서 걸린다 — 없는 매장은 당연히 0건이다. */
  if (!hit) {
    return { ok: true, preview: true, nothing: true, store: store, date: date,
      plan: ['되돌릴 제출을 찾지 못했습니다 — 매장명·날짜를 다시 보십시오 (아무것도 건드리지 않았습니다)'] };
  }

  /* 그 달에 아무것도 안 남는가 — 미리보기 문구만 가른다.
     ★탭은 어떤 경우에도 지우지 않는다★ (2026-09-22 · 1.50) — 종전에는 이 값이 참이면 매장 파일 월 탭을 통째로
     지웠다(deleteSheet). 그런데 요약 탭(월별 QSC현황표)의 그 달 칸이 =IFERROR(VLOOKUP("개선율", '2610'!D2:I9, 5, FALSE), "")
     처럼 ★탭 이름으로★ 읽고 있어, 탭을 지우면 그 참조가 #REF! 로 바뀌고 탭이 다시 생겨도 안 이어진다
     (→ 개선율 빈칸 → 통합시트 종합이 개선율 만점으로 +10 · 09-07 사고와 같은 꼴). 요약 탭은 본사 보호라 앱이 되살릴 수도 없다.
     그래서 늘 빈 양식으로 남기고(점수·방문일·개선요청·개선율을 비운다) 다음 제출이 그 탭을 그대로 쓴다
     — 2026-09-22 12월 베타 원상복구에서 담당자가 고른 방식과 같다. */
  const oneSided = (kind !== 'both');
  const monthEmpty = !oneSided && (round.monthLeft === 0) && (shop.monthLeft === 0);
  /* ★두 줄이 서로 어긋나지 않게 한다★ (2026-08-26) — 종전에는 여기서 '건드리지 않습니다 ·
     개선요청은 손으로'라고 적어 놓고, 바로 아래에서 '개선요청 행도 함께 비웁니다'라고 적었다.
     한쪽만 되돌릴 때도 개선요청을 지우도록 고친 뒤로 이 문구가 사실과 달라진 것이다.
     미리보기는 사람이 읽고 [정말 지웁니다]를 누르는 근거라, 여기서 어긋나면 안 된다. */
  const scoreCols = (doQsc ? 'QSC' : '') + (doQsc && doShop ? '·' : '') + (doShop ? 'MS' : '');
  log.push('매장 파일 ' + tab + ' 탭: 탭은 지우지 않고 ' + scoreCols + ' 점수 칸을 비웁니다' +
    (monthEmpty ? ' — 그 달에 남는 자료가 없어 빈 양식으로 남고, 다음 제출이 그 탭을 그대로 씁니다'
      : oneSided ? ' (한쪽만 되돌리기 — 손대지 않은 쪽은 그대로 남습니다)'
        : ' — 그 달에 QSC ' + round.monthLeft + '건 · 쇼퍼 ' +
          (shop.monthLeftSubmits == null ? shop.monthLeft : shop.monthLeftSubmits) + '건이 남습니다'));   // 제출 건수(38줄=1건 · #17)
  /* ★방문일·방문시간·개선요청은 QSC가 쓴 것이다★ — 그래서 그 달에 QSC가 하나도 안 남을 때만
     되돌린다. 남아 있으면 그 줄들이 남은 회차의 것일 수 있어 가릴 방법이 없다(행에 회차 표식이 없다).
     ★통째(monthEmpty)일 때도 같은 문을 지난다★ (2026-09-22) — 종전에는 탭을 지우느라 이 안내(매장이 적은 답 N건)를 건너뛰었다. */
  if (doQsc) {
    /* 미리보기에서도 매장 파일을 한 번 열어 '매장이 적은 답이 몇 건인지'를 정확히 적는다.
       ★지워지는 것을 지우기 전에 보여 주는 것이 이 화면의 존재 이유다.★ */
    let wroteN = 0;
    if (round.monthLeft === 0) {
      const b = improveBlocked(store, date);
      if (b) wroteN = b.touched;
    }
    log.push(round.monthLeft === 0
      ? ('매장 파일 ' + tab + ' 탭: 방문일·방문시간·개선요청 행도 함께 비우고 개선율 칸은 원본 수식으로 되돌립니다(새 서식 탭)' +
        (wroteN ? ('  ★매장이 적은 답 ' + wroteN + '건도 함께 지워집니다 — 다시 작성을 요청하셔야 합니다★') : ''))
      : ('매장 파일 ' + tab + ' 탭: ★개선요청 행은 그대로 둡니다★ — 그 달에 QSC ' + round.monthLeft +
        '건이 남아 어느 줄이 이 제출 것인지 가릴 수 없습니다'));
  }
  log.push('통합시트 ' + ym + ' ' + (doQsc ? 'QSC' : '') + (doQsc && doShop ? '·' : '') + (doShop ? 'MS' : '') + ' 점수 칸을 비웁니다');

  /* ★확정된 달은 되돌리지 않는다★ (2026-09-17 담당자 ②-3h) — 제출 경로(qscMonthClosed·writeStoreQscInto)와 같은 판단·문구.
     미리보기는 그대로 되고 그 사실을 계획에 적는다 · 실행(apply)은 거부한다. 매장 파일을 못 찾으면(응답 시트만 있는 시험 자료)
     판정할 수 없으므로 막지 않는다 — 그때는 아래 done 에 「매장 파일을 못 찾았습니다」가 남는다. */
  const fileId = storeFileId(store);
  const closedAt = fileId ? monthClosedAt(ssOpen(fileId), tab) : '';
  if (closedAt) log.push('★' + ymLabel(tab) + ' 채점이 ' + closedAt + '에 확정된 달입니다 — 되돌릴 수 없습니다(실행이 거부됩니다)★');

  if (!apply) return { ok: true, preview: true, store: store, date: date, plan: log, closedAt: closedAt || null };
  if (closedAt) return err('MONTH_CLOSED', ymLabel(tab) + ' 채점이 확정되어 되돌릴 수 없습니다.');

  /* ★스크립트 락★ (2026-09-17 #26) — 종전에는 락 없이 응답 행을 지웠다. 매장 파일 단계에서 예외가 나면 반쯤 지워진 채 재개할 수 없고,
     같은 매장의 개선보고 저장(fnStoreSave · 락 20초)과 몇 초 겹칠 수 있었다. fnMonthClose 와 같은 모양으로 잡는다 —
     못 잡으면 아무것도 지우지 않고 알린다. ★락을 쥔 채 이 함수를 부르는 곳은 없다★(guardResubmit 은 락 밖이다 · 앱스 스크립트 락은 재진입이 안 된다). */
  const lock = LockService.getScriptLock();
  let got = false;
  try { got = lock.tryLock(20000); } catch (e) { got = false; }
  if (!got) return err('CONFLICT', '다른 처리가 진행 중입니다. 잠시 후 다시 시도해 주세요.');
  try {

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

       ⚠빈칸과 0점은 다르다. 통합시트 종합 수식은(2026-09-16 부터)
           =IF(NOT(ISNUMBER(BV)),"",BV*0.6+IF(ISNUMBER(BX),BX,0)*0.3+IF(ISNUMBER(BZ),BZ,1)*0.1)
         이라, MS 칸이 비면 0 으로 치고 QSC 만으로 종합이 뜬다 — MS 에 0 을 넣어도 같은 종합이지만 ★「0점 받았다」로 읽힌다★.
         QSC 칸은 비어야 종합도 빈다(0 이면 0점 종합이 뜬다). 그래서 「남은 게 있나」를 점수가 아니라
         ★남은 줄 수(monthLeft)★ 로 가린다. (옛 수식 `IF(COUNT(BV,BX)<2,"",…)` 시절의 「MS 가 비면 종합도 빈다」는 이제 거짓이다 · #32) */
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
    /* ★MS 를 쓰는 곳은 전부 한 번 더 거른다★ (2026-09-04 검수에서 찾은 구멍)
       되돌리기는 남은 자료로 점수를 다시 계산해 쓴다. 그런데 그 달이 아직 안 끝났으면
       ★쓰는 순간 지연이 무너진다★ — 월중에 MS 점수가 매장 화면에 뜬다.
       그 달이 열리기 전에는 빈칸으로 둔다(월말 반영이 그때 채운다).
       ★매장 파일과 통합시트에 똑같이 건다★ — 통합시트도 웹에 공개돼 매장이 본다. */
    function msAfterVisible() { return monthClosed(date, tz) ? msAfter() : ''; }

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
    if (!fileId) done.push('★매장 파일을 못 찾았습니다★: ' + store);
    else {
      const ss2 = ssOpen(fileId);
      const sh2 = ss2.getSheetByName(tab);
      if (!sh2) done.push('매장 파일 ' + tab + ' 탭이 원래 없습니다');
      /* ★탭은 지우지 않는다★ (2026-09-22 · 1.50) — 통째(monthEmpty)여도 아래 한 길로 비운다(위 monthEmpty 주석).
         탭의 방문일이 이 날짜와 다르면(담당자가 손으로 만든 탭 등) 아래 길이 점수 칸만 고치고 개선요청은 손대지 않는다 — 종전과 같다. */
      else {
        const qv = doQsc ? qscAfter() : '', mv = doShop ? msAfterVisible() : '';
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
            /* ★개선율 칸도 원본 수식으로★ (2026-09-22 · 1.50) — 새 서식에서는 매장이 개선보고를 저장할 때
               recountSummary 가 이 칸을 ★값★으로 덮는다(§1-8). 표만 비우고 그 값을 두면 재제출(덮어쓰기)·다음 제출이
               이 탭에 들어가도 매장이 다시 저장하기 전까지 옛 개선율(예: 1 = 100%)이 통합시트 종합에 간다.
               옛 서식 탭은 서버가 값으로 적지 않고 칸 자리도 달라 건드리지 않는다. 실패해도 되돌리기는 계속한다(알리기만). */
            if (monthTabLayout(ss2, tab) === 'new') {
              const rr = resetRateCellIn(ss2, sh2, true);
              if (rr.done) parts.push('개선율 칸(' + rr.cell + ')을 원본 수식으로 되돌렸습니다 (값 ' + (rr.was === '' ? '빈칸' : rr.was) + ' → 수식)');
              else if (!rr.ok) parts.push('★개선율 칸을 원본 수식으로 되돌리지 못했습니다★ — ' + rr.why);
            }
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
        const v = msAfterVisible();      // ★통합시트도 월중에는 빈칸으로 둔다★
        const b = writeDashboard(store, date, v, 2);
        done.push('통합시트 MS 칸: ' + (b.ok
          ? (b.cell + (v === '' ? ' 비움' : (' → ' + round1(v * 100) + '점 (그 달 남은 ' +
             (shop.monthLeftSubmits == null ? shop.monthLeft : shop.monthLeftSubmits) + '건 중 가장 최근 1건)'))) : b.error));
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
  } finally {
    try { lock.releaseLock(); } catch (e) { }
  }
}

function msMonthPick(sh, store, ym, tz) {
  const out = { score: null, at: '', n: 0 };
  const last = sh.getLastRow();
  if (last < 2) return out;
  const n = Math.min(6000, last - 1);
  const rng = grid(sh, 2, 1, n, MS_COL.order);
  const vals = rng ? rng.getValues() : [];
  const key = normStore(store);
  const seen = {};
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    const dYm = ymOfCell(v[MS_COL.date - 1], tz);
    if (normStore(v[MS_COL.store - 1]) !== key || dYm !== ym) continue;
    const raw = v[MS_COL.at - 1];
    const at = (raw == null || raw === '') ? '' : stampOf(raw, tz);
    seen[at ? ('B' + at) : ('A' + dateOfCell(v[MS_COL.date - 1], tz) + ' ' + timeKeyOf(v[MS_COL.time - 1], tz))] = 1;
    const sc = v[MS_COL.total - 1];
    if (typeof sc !== 'number') continue;
    if (out.score === null || (at && (!out.at || at > out.at))) { out.score = sc; out.at = at; }
  }
  out.n = Object.keys(seen).length;
  return out;
}

function shopperMonthAvg(sh, store, dateStr, tz) {
  const p = msMonthPick(sh, store, String(dateStr).slice(0, 7), tz);
  return p.score === null ? 0 : p.score;
}

function stampOf(v, tz) {
  let d = null;
  if (v instanceof Date) {
    d = v;
  } else {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    const hasZone = /Z$/.test(s) || /[+\-]\d{2}:?\d{2}$/.test(s);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m && !hasZone) return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
    const t = Date.parse(s);
    if (isNaN(t)) return '';
    d = new Date(t);
  }
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm');
}

// ══ 시험 ════════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  X    ' + n + (e ? '   ' + e : '')); } }
function wroteOf(k) { for (var i = WROTE.length - 1; i >= 0; i--) if (WROTE[i][0] === k) return WROTE[i][1]; return undefined; }

function reset(shopRows, roundRows, visit) {
  SHEETS = {}; WROTE = []; DELETED = []; VISIT_DATE = visit || '';
  /* ★MS_상세★ (2026-09-08 통합) — 한 줄 = 한 문항.
     시험은 문항 하나짜리 제출로 줄인다(회차 판정과 점수 계산만 보므로 38줄일 필요가 없다).
     shopRows 는 [제출시각, 날짜, 시간, 매장, x, x, x, 경로, 점수] 형태로 들어온다 —
     옛 시험 자료를 그대로 쓰려고 여기서 MS_상세 자리로 옮겨 준다. */
  mkSheet(MS_DETAIL, [MS_HEADER.slice(0)].concat(shopRows.map(function (o) {
    var a = new Array(MS_COL.order).fill('');
    a[MS_COL.date - 1] = o[1];
    a[MS_COL.time - 1] = o[2];
    a[MS_COL.store - 1] = o[3];
    a[MS_COL.no - 1] = 1;
    a[MS_COL.at - 1] = o[0];
    a[MS_COL.route - 1] = o[7];
    a[MS_COL.total - 1] = o[8];
    return a;
  })));
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
ok('★손님 3건이 살아 있다★', SHEETS[MS_DETAIL].length === 4, '남은 줄(머리글 포함)=' + SHEETS[MS_DETAIL].length);
ok('담당자 것만 지워졌다', !SHEETS[MS_DETAIL].some(function (x) { return x[MS_COL.route-1] === '관리자 입력'; }));
var ms = wroteOf('통합시트:MS');
/* ★2026-09-17 담당자 결정 — 그 달 MS 는 평균이 아니라 가장 최근 제출 1건★ → 남은 3건 중 10-20 의 100점 */
ok('★통합시트 MS = 남은 3건 중 가장 최근(10-20) 1.00 — 평균 0.90 아님★', Math.abs(ms - 1.0) < 1e-9, '값=' + ms);
ok('매장 파일 MS 도 같은 값', Math.abs(wroteOf('매장파일:MS점수') - 1.0) < 1e-9, '값=' + wroteOf('매장파일:MS점수'));

console.log('\n[1-2] ★그 달이 아직 안 끝났으면 두 곳 다 안 쓴다★ (2026-09-04 지연 규칙)');
MONTH_OPEN = false;                       // 월중에 되돌린 경우
reset([
  ['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60],
  ['2026-10-10T10:00','2026-10-10','','금종제과','','','','고객 직접',90],
]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('되돌리기 성공', r.ok === true, JSON.stringify(r.error || ''));
/* ★2026-09-04 규칙 변경★ — 종전에는 「통합시트에는 그대로 쓴다(본사 것이라 매장이 못 본다)」
   였는데 ★그 전제가 틀렸다★: 통합시트는 「웹에 공개 · 링크가 있는 인터넷상의 모든 사용자」다.
   매장 파일만 늦추면 매장이 통합시트에서 그대로 보므로 늦추는 장치가 무의미해진다.
   그래서 되돌리기도 두 곳 모두 월중에는 빈칸으로 둔다. */
ok('★통합시트도 빈칸★ — 매장이 이 시트를 본다',
   wroteOf('통합시트:MS') === '', '값=' + JSON.stringify(wroteOf('통합시트:MS')));
ok('★매장 파일도 빈칸★ — 월중에 점수가 보이면 지연이 무너진다',
   wroteOf('매장파일:MS점수') === '', '값=' + JSON.stringify(wroteOf('매장파일:MS점수')));
ok('★MS 만 되돌렸으면 QSC 칸은 건드리지 않는다★ (지연은 MS 에만 건다)',
   wroteOf('통합시트:QSC') === undefined, '값=' + JSON.stringify(wroteOf('통합시트:QSC')));
MONTH_OPEN = true;                        // 나머지 시험은 열린 달 기준

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
ok('그날 2건 다 지웠다', SHEETS[MS_DETAIL].length === 2, '남은 줄=' + SHEETS[MS_DETAIL].length);
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
ok('손님 것 그대로', SHEETS[MS_DETAIL].length === 2);

/* ★쓰기 밸브는 2026-08-27에 통째로 지웠다★ (담당자 결정)
   종전 [8]은 「밸브가 잠기면 안 건드린다」를 쟀는데, 그 기능이 이제 없다.
   대신 ★밸브가 없어도 늘 제대로 쓴다★ 를 잰다 — 지운 뒤 조용히 안 쓰게 되면 그게 사고다. */
console.log('\n[8] ★밸브 없이도 매장 파일·통합시트에 늘 쓴다★');
reset([['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60]]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('응답 시트 줄을 지운다', SHEETS[MS_DETAIL].length === 1, '남은 줄=' + SHEETS[MS_DETAIL].length);
ok('★매장 파일에 썼다★', wroteOf('매장파일:MS점수') !== undefined, JSON.stringify(WROTE));
ok('★통합시트에 썼다★', wroteOf('통합시트:MS') !== undefined, JSON.stringify(WROTE));
ok('「밸브」라는 말이 결과에 없다', r.done.join(' ').indexOf('밸브') < 0, JSON.stringify(r.done));

console.log('\n[9] 손님 건이 남으면 그 점수(남은 것 중 가장 최근)로 다시 쓴다 (밸브와 무관)');
reset([
  ['2026-10-05T10:00','2026-10-05','','금종제과','','','','고객 직접',90],
  ['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60],
]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('통합시트 MS = 0.90', Math.abs(wroteOf('통합시트:MS') - 0.9) < 1e-9, '값=' + wroteOf('통합시트:MS'));

console.log('\n[10] ★스크립트 락★ (2026-09-17 #26) — 못 잡으면 아무것도 안 지운다 · 잡았으면 끝에 놓는다');
reset([['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60]]);
LOCK_OK = false; LOCK_GOT = 0; LOCK_REL = 0;
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('락을 못 잡으면 CONFLICT', r.ok === false && r.code === 'CONFLICT', JSON.stringify(r));
ok('★응답 시트 줄이 그대로다★', SHEETS[MS_DETAIL].length === 2, '남은 줄=' + SHEETS[MS_DETAIL].length);
ok('매장 파일·통합시트에 아무것도 안 썼다', WROTE.length === 0, JSON.stringify(WROTE));
LOCK_OK = true;
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: false, route: '관리자 입력' });
ok('미리보기는 락을 잡지 않는다', r.preview === true && LOCK_GOT === 0, 'got=' + LOCK_GOT);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('실행은 락을 잡고(1) 끝에 놓는다(1)', r.ok === true && LOCK_GOT === 1 && LOCK_REL === 1, 'got=' + LOCK_GOT + ' rel=' + LOCK_REL);
ok('지워졌다', SHEETS[MS_DETAIL].length === 1);

console.log('\n[11] ★확정된 달은 되돌리지 않는다★ (2026-09-17 담당자 ②-3h) — 미리보기는 되고 실행은 거부');
reset([['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60]]);
CLOSED_AT = '2026-11-02'; LOCK_GOT = 0;
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: false, route: '관리자 입력' });
ok('미리보기는 된다', r.ok === true && r.preview === true, JSON.stringify(r));
ok('계획에 「확정된 달」 줄이 있다', r.plan.some(function (l) { return l.indexOf('2026년 10월 채점이 2026-11-02에 확정된 달입니다') >= 0; }), JSON.stringify(r.plan));
ok('closedAt 을 돌려준다', r.closedAt === '2026-11-02', JSON.stringify(r.closedAt));
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('실행은 MONTH_CLOSED', r.ok === false && r.code === 'MONTH_CLOSED', JSON.stringify(r));
ok('문구 「2026년 10월 채점이 확정되어 되돌릴 수 없습니다.」', r.error === '2026년 10월 채점이 확정되어 되돌릴 수 없습니다.', JSON.stringify(r.error));
ok('★응답 시트 줄이 그대로다★', SHEETS[MS_DETAIL].length === 2, '남은 줄=' + SHEETS[MS_DETAIL].length);
ok('아무것도 안 썼다 · 락도 안 잡았다', WROTE.length === 0 && LOCK_GOT === 0, JSON.stringify(WROTE) + ' got=' + LOCK_GOT);
CLOSED_AT = '';
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('확정 안 된 달은 종전대로 지운다', r.ok === true && SHEETS[MS_DETAIL].length === 1, JSON.stringify(r.error || ''));

console.log('\n[12] 미리보기 문구 (2026-09-17 #17 · #19 · #18)');
reset([
  ['2026-10-05T10:00','2026-10-05','','금종제과','','','','고객 직접',90],
  ['2026-10-05T10:00','2026-10-05','','금종제과','','','','고객 직접',90],   // 같은 제출의 둘째 줄(38줄 중 하나)
  ['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60],
], [['2026-10-25T09:00','2026-10-25','10:00','금종제과','신문수',80]]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', apply: false });
var plan = r.plan.join('\n');
ok('#19 「MS_상세 1줄 · NA프리셋」 — 「줄건」 오타 없음', plan.indexOf('줄건') < 0 && plan.indexOf(MS_DETAIL + ' 1줄 · NA프리셋') >= 0, plan);
ok('#17 「쇼퍼 1건이 남습니다」 — 줄 수(2)가 아니라 제출 건수(1)', plan.indexOf('쇼퍼 1건이 남습니다') >= 0 && plan.indexOf('쇼퍼 2건') < 0, plan);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
var doneTxt = r.done.join('\n');
ok('#18 「그 달 남은 1건 중 가장 최근 1건」 — 「평균」이라는 말이 없다', doneTxt.indexOf('건 중 가장 최근 1건') >= 0 && doneTxt.indexOf('평균') < 0, doneTxt);

/* ══ 2026-09-22 (1.50) — ①통째 되돌리기도 탭을 지우지 않는다 ②개선요청을 비운 뒤 개선율 칸을 원본 수식으로 ══
   종전: 그 달이 비면 ss.deleteSheet — 요약 탭의 '2610'!D2:I9 참조가 #REF! 로 바뀌어 다음 달 탭이 생겨도 안 이어진다.
   종전: 개선요청만 비우고 매장 저장 때 값으로 적힌 개선율(예: 1)은 그대로 — 재제출 뒤 옛 개선율이 종합에 갔다. */
function freshRate() { RATE_CALLS = []; RATE_RES = { ok: true, done: true, cell: 'H9', was: 1, now: '=IFERROR(H7/H5, "")' }; LAYOUT = 'new'; WIPE = { ok: true, n: 2, touched: 1, extra: 0 }; WIPE_CALLS = 0; }

console.log('\n[13] ★통째 되돌리기(그 달 비움)도 탭을 지우지 않는다★ — 빈 양식으로 남기고 비운다');
freshRate();
reset([['2026-10-20T11:00','2026-10-20','','금종제과','','','','관리자 입력',80]],
      [['2026-10-20T10:00','2026-10-20','10:00','금종제과','문수',92]], '2026-10-20');
r = fnUndoSubmit({}, { store: S, date: '2026-10-20', apply: false });
plan = r.plan.join('\n');
ok('미리보기에 「통째로 지웁니다」가 없다', plan.indexOf('통째로 지웁니다') < 0, plan);
ok('미리보기에 「빈 양식으로 남고」가 있다', plan.indexOf('빈 양식으로 남고') >= 0, plan);
ok('미리보기가 통째일 때도 「개선요청 행도 함께 비우고 개선율 칸은 원본 수식으로」를 알린다', plan.indexOf('개선요청 행도 함께 비우고 개선율 칸은 원본 수식으로') >= 0, plan);
r = fnUndoSubmit({}, { store: S, date: '2026-10-20', apply: true });
doneTxt = (r.done || []).join('\n');
ok('되돌리기 성공', r.ok === true, JSON.stringify(r.error || ''));
ok('★탭을 지우지 않았다★ (deleteSheet 0번)', DELETED.length === 0, JSON.stringify(DELETED));
ok('결과에 「탭 삭제」가 없다', doneTxt.indexOf('탭 삭제') < 0, doneTxt);
ok('QSC·MS 점수 칸을 비웠다', wroteOf('매장파일:QSC점수') === '' && wroteOf('매장파일:MS점수') === '', JSON.stringify(WROTE));
ok('개선요청을 비웠다(wipe 1번) · 방문일·방문시간도 비웠다', WIPE_CALLS === 1 && wroteOf('매장파일:방문일') === '' && wroteOf('매장파일:방문시간') === '', 'wipe=' + WIPE_CALLS + ' ' + JSON.stringify(WROTE));
ok('★개선율 칸 되살리기를 실제로(apply) 1번 불렀다★', RATE_CALLS.length === 1 && RATE_CALLS[0] === true, JSON.stringify(RATE_CALLS));
ok('결과에 「개선율 칸(H9)을 원본 수식으로 되돌렸습니다 (값 1 → 수식)」', doneTxt.indexOf('개선율 칸(H9)을 원본 수식으로 되돌렸습니다 (값 1 → 수식)') >= 0, doneTxt);
ok('통합시트 두 칸도 비웠다', wroteOf('통합시트:QSC') === '' && wroteOf('통합시트:MS') === '', JSON.stringify(WROTE));

console.log('\n[14] 한쪽(QSC) 되돌리기 = 재제출 덮어쓰기 길 — 개선요청을 비웠으면 개선율도 되살린다');
freshRate();
reset([], [['2026-10-20T10:00','2026-10-20','10:00','금종제과','문수',92]], '2026-10-20');
r = fnUndoSubmit({}, { store: S, date: '2026-10-20', kind: 'qsc', apply: true });
doneTxt = (r.done || []).join('\n');
ok('되돌리기 성공 · 탭 그대로', r.ok === true && DELETED.length === 0, JSON.stringify(r.error || '') + JSON.stringify(DELETED));
ok('★개선율 되살리기 1번★', RATE_CALLS.length === 1 && RATE_CALLS[0] === true, JSON.stringify(RATE_CALLS));
ok('빈칸이던 값은 「값 빈칸 → 수식」으로 알린다', (function () { freshRate(); RATE_RES.was = '';
  reset([], [['2026-10-20T10:00','2026-10-20','10:00','금종제과','문수',92]], '2026-10-20');
  var t = fnUndoSubmit({}, { store: S, date: '2026-10-20', kind: 'qsc', apply: true }).done.join('\n');
  return t.indexOf('(값 빈칸 → 수식)') >= 0; })());

console.log('\n[15] 옛 서식 탭(라벨 B·값 E)은 개선율을 건드리지 않는다 — 칸 자리가 달라 원본 수식을 옮기면 틀린다');
freshRate(); LAYOUT = 'old';
reset([], [['2026-09-20T10:00','2026-09-20','10:00','금종제과','문수',92]], '2026-09-20');
SHEETS['2609'] = [['매장 파일 9월 탭']];
r = fnUndoSubmit({}, { store: S, date: '2026-09-20', kind: 'qsc', apply: true });
ok('되돌리기 성공 · 개선요청은 비움', r.ok === true && WIPE_CALLS === 1, JSON.stringify(r.error || '') + ' wipe=' + WIPE_CALLS);
ok('★개선율 되살리기 0번★', RATE_CALLS.length === 0, JSON.stringify(RATE_CALLS));

console.log('\n[16] 개선요청을 못 비웠으면(dirty) 개선율도 안 건드린다 — 방문일을 남기는 규칙과 같은 편');
freshRate(); WIPE = { ok: false, n: 3, touched: 0, why: '보호된 범위' };
reset([], [['2026-10-20T10:00','2026-10-20','10:00','금종제과','문수',92]], '2026-10-20');
r = fnUndoSubmit({}, { store: S, date: '2026-10-20', kind: 'qsc', apply: true });
ok('dirty 로 알린다', r.ok === true && r.dirty === true, JSON.stringify(r));
ok('★개선율 되살리기 0번★ · 방문일도 그대로', RATE_CALLS.length === 0 && wroteOf('매장파일:방문일') === undefined, JSON.stringify(RATE_CALLS) + JSON.stringify(WROTE));

console.log('\n[17] 되살리기가 실패해도(원본 칸이 수식 아님 등) 되돌리기는 끝까지 간다 — 알리기만');
freshRate(); RATE_RES = { ok: false, why: '원본 탭의 개선율 칸이 수식이 아닙니다 — 짐작해서 적지 않습니다' };
reset([], [['2026-10-20T10:00','2026-10-20','10:00','금종제과','문수',92]], '2026-10-20');
r = fnUndoSubmit({}, { store: S, date: '2026-10-20', kind: 'qsc', apply: true });
doneTxt = (r.done || []).join('\n');
ok('되돌리기 성공 · 통합시트까지 비웠다', r.ok === true && wroteOf('통합시트:QSC') === '', JSON.stringify(r.error || '') + JSON.stringify(WROTE));
ok('결과에 「★개선율 칸을 원본 수식으로 되돌리지 못했습니다★ — 원본 탭의 개선율 칸이 수식이 아닙니다」', doneTxt.indexOf('★개선율 칸을 원본 수식으로 되돌리지 못했습니다★ — 원본 탭의 개선율 칸이 수식이 아닙니다') >= 0, doneTxt);

console.log('\n[18] 이미 원본 수식이면(same) 아무 말도 덧붙이지 않는다');
freshRate(); RATE_RES = { ok: true, same: true, cell: 'H9', was: '=IFERROR(H7/H5, "")', now: '=IFERROR(H7/H5, "")' };
reset([], [['2026-10-20T10:00','2026-10-20','10:00','금종제과','문수',92]], '2026-10-20');
r = fnUndoSubmit({}, { store: S, date: '2026-10-20', kind: 'qsc', apply: true });
doneTxt = (r.done || []).join('\n');
ok('불렀지만(1번) 결과에 개선율 말이 없다', RATE_CALLS.length === 1 && doneTxt.indexOf('개선율 칸') < 0, doneTxt);

console.log('\n[19] 탭의 방문일이 다르면(손으로 만든 탭) 통째여도 개선요청·개선율을 건드리지 않고 점수 칸만');
freshRate();
reset([], [['2026-10-20T10:00','2026-10-20','10:00','금종제과','문수',92]], '2026-10-03');
r = fnUndoSubmit({}, { store: S, date: '2026-10-20', apply: true });
doneTxt = (r.done || []).join('\n');
ok('탭을 지우지 않았다 · 개선요청 wipe 0번 · 되살리기 0번', DELETED.length === 0 && WIPE_CALLS === 0 && RATE_CALLS.length === 0, JSON.stringify(DELETED) + ' wipe=' + WIPE_CALLS + ' rate=' + RATE_CALLS.length);
ok('「탭의 방문일이 2026-10-20가 아닙니다」로 알린다', doneTxt.indexOf('탭의 방문일이 2026-10-20가 아닙니다') >= 0, doneTxt);
ok('점수 칸은 비웠다', wroteOf('매장파일:QSC점수') === '', JSON.stringify(WROTE));

console.log('\n' + (fail ? 'X 실패 ' + fail + '건' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
