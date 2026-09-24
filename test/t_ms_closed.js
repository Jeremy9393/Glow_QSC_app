
/* ── 가짜 세계 ── */
const MS_DETAIL = 'MS_상세', MS_HEADER = ['점검일자'], L_MS = ['MS점수', 'CS점수'];
let CLOSED = {}, FILE_ID = 'FILE1', SHEET_CALLS = 0, TAB_EXISTS = true, MADE = 0, MS_WRITES = [], CODE_MARKS = [];
function storeFileId() { return FILE_ID; }
function monthClosedAt(ss, tab) { const id = (ss && ss.getId) ? ss.getId() : String(ss); return CLOSED[id + ':' + tab] || ''; }
function mkFile(id) { return { getId: function () { return id; }, getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; }, getSheetByName: function (n) { return TAB_EXISTS ? { _tab: n } : null; } }; }
function ssOpen(id) { return mkFile(id); }
const SpreadsheetApp = { openById: function (id) { return mkFile(id); } };
function yymm(d) { return d.slice(2, 4) + d.slice(5, 7); }
function ymLabel(ym) { return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월'; }
let CUR = '2611';
function curYymm() { return CUR; }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function normStore(s) { return String(s == null ? '' : s).trim(); }
function makeMonthTabIn(ss, ym) { MADE++; TAB_EXISTS = true; return { mark: '✓', msg: '만듦' }; }
function setByLabelAny(sh, labels, v) { MS_WRITES.push([sh._tab, v]); return true; }
/* saveShopper 는 확정 판정 뒤 곧바로 sheet(ss, MS_DETAIL, …) 로 MS_상세를 연다 — 여기서 멈춰 「쓰기에 닿았는지」만 본다 */
function sheet(ss, name) { SHEET_CALLS++; throw new Error('STOP:' + name); }
/* submitWithCode 의 나머지 부품 */
const STORE_MAP_SHEET = '매장목록';
const LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
const Logger = { log: function () {} };
function codeFailOk() { return true; }
function codeVerify(ss, code, store) { return { ok: true, rec: { row: 5, store: store }, code: code, store: store }; }
function codeSheet() { return {}; }
function grid(sh, row, col) { return { setValues: function (v) { CODE_MARKS.push([row, v[0][0]]); } }; }
let SAVE_REAL = true;
/* ⑤ 월말 반영(monthCloseRun) 부품 — 2026-09-25 검수 · backend-1 */
const SPREADSHEET_ID = 'RESP', DASHBOARD_ID = 'DASH';
let DASH_WRITES = [], FORCE_MC = false, WSS_ARGS = [];
function displayStores() { return ['금종제과']; }
function shopperMonthAvg() { return 88; }
function round1(x) { return Math.round(x * 10) / 10; }
function writeDashboard(store, d, frac) { DASH_WRITES.push([store, d, frac]); return { ok: true }; }
function setTotalFormula() {}
/* ⑥ fnShopperSubmit 전체(guardResubmit 포함) 부품 — 2026-09-25 검수 · contract-1 */
let PREV = [], UNDO_CALLS = 0;
function prevSubmitsOf() { return PREV; }
function improveBlocked() { return null; }
function fnUndoSubmit() { UNDO_CALLS++; return { ok: false, code: 'MONTH_CLOSED', error: '2026년 10월 채점이 확정되어 되돌릴 수 없습니다.' }; }
function qscMonthClosed(store, dateStr) {
  try {
    const id = storeFileId(store);
    if (!id) return null;
    const tab = yymm(dateStr);
    if (!monthClosedAt(ssOpen(id), tab)) return null;
    return { ok: false, code: 'MONTH_CLOSED', error: ymLabel(tab) + ' 채점이 확정되어 제출할 수 없습니다.' };
  } catch (e) { return null; }
}
function saveShopperReal(ss, p, ctx, isSurvey) {
  /* ★확정된 달은 MS 도 받지 않는다★ (2026-09-25 검수 · dates-3) — QSC 는 09-17(②-3h)에 막았는데 MS 쓰기 길에는 없었다.
     지난달 날짜(달력 오선택·되살아난 임시저장)로 낸 MS 가 제출시각 최신 1건이 되어 ★확정된 달의 MS점수·종합점수를 조용히 덮고★,
     되돌리기는 확정된 달을 거부해 앱으로 못 고쳤다. MS_상세에 쓰기 전에 끊는다.
     고객 설문(submitWithCode)은 saved.ok 가 아니면 코드를 소진하지 않으므로 손님 코드는 살아 있다. */
  const closedMs = qscMonthClosed(p && p.store, p && p.date);
  if (closedMs) return closedMs;
  // 익명 경로는 입력경로를 서버가 강제한다. 클라이언트가 보낸 p.source는 읽지 않는다.
  const route = isSurvey ? '고객 직접' : '관리자 입력';
  /* ★MS_상세 한 시트에 문항마다 한 줄★ (2026-09-08 담당자 결정)
     종전에는 쇼퍼_응답(제출 1줄 + 문항 38열)과 쇼퍼_비고(비고 있는 문항만)로 나뉘어 있었다.
     QSC 와 같은 짜임으로 맞추면서 ★한 시트★로 합쳤다 — 앞 5열(날짜·시간·매장·코드·문항번호)까지 QSC_상세와 자리가 같다(MS_HEADER 주석).
     비고가 없는 문항도 한 줄씩 남긴다(QSC_상세가 74문항을 다 남기는 것과 같다) —
     '답을 안 한 것'과 '기록이 없는 것'을 구별할 수 있어야 한다. */
  const sh = sheet(ss, MS_DETAIL, MS_HEADER.slice(0));
  /* ★p.result 의 숫자는 쓰지 않는다★ — 받은 답으로 서버가 센다 (msScoreOf 주석 · J51) */
  const sc = msScoreOf(p.answers);
  const total = sc.score == null ? '' : round1(sc.score);
  const rows = p.answers.map(function (a) {
    const conv = msConvert(a.answer);
    return safeRow([
      p.date, p.time || '', p.store, msCodeOf(a.text), a.no, a.text,
      a.answer == null ? '' : a.answer,
      conv == null ? '' : conv,             // 점수 — 문항 환산값 (0~1)
      a.memo || '',
      p.submittedAt, route, total, sc.answered,
      p.overall || '', p.demographic || '', p.order || '',
      /* ★주문방법★ — 「일부만 키오스크」 매장에서만 값이 온다. 서버는 판정하지 않고
         손님이 고른 사실을 그대로 남긴다(문항을 뺄지 정하는 것은 앱이다). */
      p.way || '',
    ]);
  });
  msPrepend(sh, rows);

  /* ★제출이 들어올 때마다 그 달 MS 점수를 다시 계산해 덮어쓴다★ (2026-08-20 사용자 제안)
     ★2026-09-17 부터 그 점수는 평균이 아니라 「가장 최근 제출 1건」이다★ (shopperMonthAvg 주석) — 아래 「평균」은 옛 말이다.

     종전에는 익명 설문이 여기서 곧장 끝났다 — 매장 파일·통합시트를 아예 부르지 않았다.
     그래서 순서에 따라 이런 일이 생겼다:
         5일  본사 제출        → 그때까지의 평균이 숫자로 박힌다
         20일 고객 3건 들어옴  → 아무 일도 일어나지 않는다 (영영 점수에 안 들어간다)
     고객 응답도 CS에 똑같이 반영하기로 한 이상 이 구멍을 그대로 둘 수 없다.
     ★그 달 마지막 제출이 항상 옳은 값을 남기게 한다★ — 덮어쓰기라 몇 번 돌아도 결과가 같다.

     ⚠이 줄 때문에 ★익명 경로가 매장 파일 한 칸(CS 점수)을 쓰게 된다★.
       쓰는 값은 사용자가 보낸 숫자가 아니라 시트에서 다시 계산한 평균이다.
       ⚠★이 경로는 늘 쓴다★ — 막아 주는 것은 제출 코드 하나뿐이다(1회용·매장 지정·만료).
         그 코드 검사가 유일한 문지기이므로, 그 자리를 느슨하게 만들지 말 것. */

  // 통합시트 MS 칸 + 매장 파일 MS점수: 같은 달 제출이 여럿이면 ★가장 최근 제출 1건★으로 기록 (평균 아님 · 2026-09-17)
  const extra = { dashboard: null, storeFile: null };
  if (DASHBOARD_ID && sc.score != null) {
    const avg = shopperMonthAvg(sh, p.store, p.date, ss.getSpreadsheetTimeZone());   // 이름만 옛것 — 값은 「가장 최근 1건」
    /* dashboard와 storeFile의 catch를 분리한다 — 합쳐 두면 매장 파일 실패가
       성공한 dashboard 결과를 오류로 덮어써 원인을 잘못 보게 된다. */
    /* ★MS 점수는 그 달이 끝나야 연다 — 매장 파일과 통합시트 ★둘 다★★ (2026-09-04 담당자 결정)

       매장은 MS가 월 1회인 것을 안다. 점수가 제출 즉시 보이면 「이번 달 끝났다」로 읽고
       남은 날 응대가 느슨해질 수 있다.

       ★종전 주석은 「통합시트는 본사 것이고 매장은 못 본다」였는데 그것이 틀렸다★ —
       통합시트는 공유 설정이 「웹에 공개 · 링크가 있는 인터넷상의 모든 사용자」다(2026-09-04 실물 확인).
       매장 파일만 늦추면 매장이 통합시트에서 그대로 보므로 늦추는 장치가 통째로 무의미해진다.
       그래서 두 곳에 ★같은 가드★를 건다 — 늦추는 규칙은 monthClosed 한 곳뿐이다.

       ⚠늦추는 것은 MS 하나다. QSC 점수(offset 0)는 지금처럼 즉시 쓴다.
       ⚠이미 끝난 달(지난 달 자료를 늦게 넣는 경우)은 숨길 이유가 없으므로 즉시 쓴다.
       ⚠통합시트 종합 수식은 2026-09-16 부터
           =IF(NOT(ISNUMBER(BV)),"",BV*0.6+IF(ISNUMBER(BX),BX,0)*0.3+IF(ISNUMBER(BZ),BZ,1)*0.1)
         이라 ★MS 칸이 비어도 종합은 QSC 만으로 뜬다★(MS 를 0 으로 친다 · fixDashTotalRun). 「MS 가 비면 종합도 빈다」는 옛 수식
         `IF(COUNT(BV,BX)<2,"",…)` 시절 말이다 — 월중에 종합이 보이는 것은 설계다(★COUNT 판정으로 되돌리지 말 것★ · 현재상황).
         종합등급 수식은 admin.fixGrade 가 「QSC·MS 둘 다 숫자일 때만」으로 감싼다(②-5a).
       월말에 여는 일은 monthCloseRun() 이 한다(트리거·관리자 버튼 공용). */
    const msOpen = monthClosed(p.date, ss.getSpreadsheetTimeZone());
    const deferMsg = { ok: true, deferred: true, msg: '그 달 말일 23시에 반영합니다' };
    try {
      extra.dashboard = msOpen ? writeDashboard(p.store, p.date, avg / 100, 2) : deferMsg;
    } catch (err) { extra.dashboard = { ok: false, error: opErr('통합시트 기록', err) }; }
    try {
      extra.storeFile = msOpen ? writeStoreShopper(p.store, p.date, avg / 100) : deferMsg;
    } catch (err) { extra.storeFile = { ok: false, error: opErr('매장 파일 기록', err) }; }
  }
  dropDashCache(p.date);
  dropStoreCache(p.store, yymm(p.date));   // 방금 쓴 매장·달의 조회 캐시도 함께 비운다
  /* ★익명 제출에는 결과를 돌려주지 않는다★ — 쓰기는 하되 무엇이 쓰였는지는 알려 주지 않는다.
     extra 안에는 그 매장의 이번 달 CS 평균(monthAvg)과 시트 기록 상태가 들어 있다.
     고객 화면은 그 값을 쓰지 않지만(감사 인사만 띄운다), 응답 본문에 실리면
     설문을 한 건 넣는 것만으로 그 매장 점수를 읽어 갈 수 있다. */
  return isSurvey ? { ok: true } : { ok: true, dashboard: extra.dashboard, storeFile: extra.storeFile };
}
function writeStoreShopperReal(store, dateStr, frac, closeRun) {
  const id = storeFileId(store);
  if (!id) return { ok: false, error: STORE_MAP_SHEET + '에 매장 없음: ' + store };
  /* ★탭이 없으면 만든다★ — 쇼퍼가 점검보다 먼저 올 수 있다(CS도 그 달 점수의 일부다).
     writeStoreQscInto와 같은 이유다: 담당자에게 "편집기를 여세요"라고 할 수 없다. */
  const ss0 = SpreadsheetApp.openById(id);
  const tab0 = yymm(dateStr);
  /* 2026-09-25 검수 · dates-3 — writeStoreQscInto 와 같은 마지막 문. 월말 반영(monthCloseRun)·사본 시험 길도 확정된 달에는 안 쓴다 */
  /* 2026-09-25 검수 · backend-1 — 단 월말 반영(monthCloseRun · closeRun=true)은 확정 달에도 쓴다.
     10월부터 MS 는 제출 때 미뤄 두고 월말 반영만 매장 파일에 쓰는데, 확정은 달 중간에도 할 수 있어(개선요청 0건 등)
     그 매장 MS점수·종합이 빈칸으로 남고 통합시트와 어긋났다. 확정 뒤 새 MS 는 saveShopper 가 이미 막으므로
     월말 반영이 쓰는 평균은 확정 전에 들어온 응답뿐이다(확정 뒤 조용히 바뀌지 않는다). */
  const closedAt = closeRun === true ? '' : monthClosedAt(ss0, tab0);
  if (closedAt) return { ok: false, code: 'MONTH_CLOSED', error: ymLabel(tab0) + ' 채점이 확정되어 기록하지 않습니다.' };
  let sh = ss0.getSheetByName(tab0);
  if (!sh) {
    let made0;
    try { made0 = makeMonthTabIn(ss0, tab0); }
    catch (e) { return { ok: false, error: tab0 + ' 탭을 만들지 못했습니다: ' + String(e).slice(0, 80) }; }
    sh = ss0.getSheetByName(tab0);
    if (!sh || made0.mark === '✗') return { ok: false, error: tab0 + ' 탭을 만들지 못했습니다 — ' + made0.msg };
  }
  /* 라벨을 못 찾았을 때 { ok:false } 만 돌려주면 화면에는 아무것도 안 뜬다(§9-7).
     QSC 쪽과 같은 모양으로 warn을 실어 프론트가 그대로 보여줄 수 있게 한다. */
  if (!setByLabelAny(sh, L_MS, frac)) {
    return { ok: false, error: "'MS점수'(옛 'CS점수') 라벨을 찾지 못해 매장 파일에 기록하지 못했습니다.",
      warn: ["'MS점수'(옛 'CS점수') 라벨을 찾지 못했습니다"] };
  }
  return { ok: true, warn: [] };
}
function submitWithCode(ss, p, ctx) {
  const code = String((p && p.code) || '').replace(/\D/g, '');
  if (!code) return err('BAD_REQUEST', '제출 코드를 입력해 주세요.');
  const store = normStore(p && p.store);
  if (!store) return err('BAD_REQUEST', '매장을 선택해 주세요.');
  /* 2026-09-25 검수 · dates-4 — 코드를 보기 전에 날짜부터(날짜가 틀리면 실패 카운터도 안 올리고 코드도 살아 있다) */
  const badDate = submitDateGate(p && p.date, '방문 날짜');
  if (badDate) return badDate;
  if (!codeFailOk(store)) {   // 매장별 15회 + 전체 CODE_FAIL_ALL회 (②-3c) — 잠겨 있으면 락을 기다리지도 않는다
    return err('RATE_LIMITED', '코드 확인이 잠시 막혀 있습니다. 10분 뒤에 다시 시도해 주세요.');
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { return err('BUSY', '잠시 후 다시 시도해 주세요.'); }
  try {
    /* 판정은 codeVerify 한 곳 (2026-09-18) — 문항 열기(survey.questions)와 같은 규칙·같은 문구 */
    const v = codeVerify(ss, code, store, 'BAD_REQUEST');
    if (!v.ok) return v;
    const rec = v.rec;

    const saved = saveShopper(ss, p, ctx, true);
    if (!saved || saved.ok !== true) return saved;

    try {
      const c = grid(codeSheet(ss), rec.row, 6, 1, 2);   // 상태 · 사용시각
      if (c) c.setValues([['사용됨', new Date()]]);
    } catch (e) {
      /* 소진 표시만 실패했다. 응답은 이미 저장됐으므로 되돌리지 않는다 —
         최악이 '그 코드가 한 번 더 쓰일 수 있음'이고, 그건 담당자가 시트에서 닫으면 된다. */
      Logger.log('코드 소진 표시 실패(응답은 저장됨): ' + String(e));
    }
    return { ok: true };
  } finally { try { lock.releaseLock(); } catch (e) { } }
}
function submitDateGate(dateStr, word) {
  const w = word || '점검일자';
  /* 2026-09-25 검수 · backend-2/security-1 — trim 하지 않는다. 뒤따르는 qscMonthClosed·yymm·저장은 원래 값을 쓰므로
     ' 2026-10-20' 이 문을 지나면 탭 '02-1' 을 보아 확정 달 검사를 비켜 갔다. 앱 date 입력은 공백이 없다. */
  const d = String(dateStr == null ? '' : dateStr);
  const ym = /^\d{4}-\d{2}-\d{2}$/.test(d) ? yymm(d) : '';
  const day = Number(d.slice(8, 10));
  if (!ym || !validYm(ym) || !(day >= 1 && day <= 31)) return err('BAD_REQUEST', w + '를 선택해 주세요.');
  if (ym < '2610') return err('BAD_REQUEST', Number(ym.slice(2, 4)) + '월은 앱으로 제출할 수 없습니다 — ' + w + '를 확인해 주세요.');
  const cur = curYymm();
  if (cur >= '2610' && ym > cur) return err('BAD_REQUEST', '아직 오지 않은 달입니다 — ' + w + '를 확인해 주세요.');
  return null;
}
function validYm(ym) {
  if (!/^\d{4}$/.test(String(ym))) return false;
  const m = Number(String(ym).slice(2, 4));
  return m >= 1 && m <= 12;
}
function monthCloseRun(ym, apply, stores) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const target = ym || Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const t0 = Date.now();
  const lines = ['=== 월말 반영 ' + target + (apply ? ' ★적용★' : ' 미리보기') + ' ==='];
  const resp = ss.getSheetByName(MS_DETAIL);
  if (!resp) return { ok: false, error: MS_DETAIL + ' 시트가 없습니다', lines: lines };

  const list = (stores && stores.length) ? stores.map(normStore) : displayStores();
  const done = [], skip = [], bad = [], left = [];
  for (let i = 0; i < list.length; i++) {
    if (Date.now() - t0 > 4.5 * 60 * 1000) { left.push.apply(left, list.slice(i)); break; }
    const store = list[i];
    try {
      const avg = shopperMonthAvg(resp, store, target + '-01', tz);
      if (!avg) { skip.push(store); continue; }
      if (!apply) { done.push(store + ' → ' + round1(avg) + '점'); continue; }
      const r = writeStoreShopper(store, target + '-01', avg / 100, true);   // 2026-09-25 검수 · backend-1 — 확정 달에도 쓴다
      /* 2026-09-25 검수 · backend-1 — 그래도 MONTH_CLOSED 가 오면(옛 사본 등) 실패가 아니라 건너뜀으로 센다.
         실패로 세면 monthCloseDone 이 영원히 false 가 되어 다음 달 내내 매일 밤 전체를 다시 돈다. 통합시트도 건드리지 않는다. */
      if (r && r.code === 'MONTH_CLOSED') { skip.push(store + '(확정됨)'); continue; }
      /* ★통합시트도 이때 함께 연다★ (2026-09-04) — 제출 때 둘 다 미뤄 두었으므로
         둘 다 여기서 채워야 한다. 한쪽만 채우면 같은 달 점수가 두 곳에서 달라진다.
         ⚠매장 파일 기록이 실패해도 통합시트는 시도한다 — 하나가 막혔다고 나머지를
           비워 둘 이유가 없고, 실패는 아래 bad 줄에 그대로 적힌다. */
      let d = null;
      try {
        d = DASHBOARD_ID ? writeDashboard(store, target + '-01', avg / 100, 2) : null;
      } catch (e) { d = { ok: false, error: String(e).slice(0, 70) }; }
      /* 종합 수식도 이때 새 규칙으로 고쳐 둔다 — 옛 탭은 MS가 비면 틀린 종합을 띄운다 */
      try {
        const id = storeFileId(store);
        const sh2 = id ? SpreadsheetApp.openById(id).getSheetByName(yymm(target + '-01')) : null;
        if (sh2) setTotalFormula(sh2);
      } catch (e) { /* 수식 교정 실패가 점수 기록을 되돌릴 이유는 없다 */ }
      const okS = !!(r && r.ok), okD = !d || !!d.ok;
      if (okS && okD) done.push(store + ' → ' + round1(avg) + '점');
      else bad.push(store + ' — ' + (okS ? '' : ('매장 파일: ' + ((r && r.error) || '기록 실패'))) +
        (okS || okD ? '' : ' · ') + (okD ? '' : ('통합시트: ' + (d.error || '기록 실패'))));
    } catch (e) { bad.push(store + ' — ' + String(e).slice(0, 70)); }
  }

  lines.push('반영 ' + done.length + '곳 · 그 달 응답 없음 ' + skip.length + '곳 · 실패 ' + bad.length + '곳');
  done.forEach(function (x) { lines.push('  ✓ ' + x); });
  bad.forEach(function (x) { lines.push('  ✗ ' + x); });
  if (skip.length) lines.push('  · 응답 없음: ' + skip.join(', '));
  if (left.length) lines.push('★시간이 부족해 ' + left.length + '곳을 못 했습니다★ — 다시 돌리십시오: ' + left.join(', '));

  /* ★돌았다는 사실을 시트에 남긴다★ — 트리거는 조용히 실패한다. 기록이 없으면 아무도 모른다. */
  if (apply) {
    try {
      const log = sheet(ss, '월말반영', ['실행시각', '대상월', '반영', '응답없음', '실패', '못한곳', '비고']);
      log.appendRow(safeRow([nowIso(), target, done.length, skip.length, bad.length, left.length,
        bad.concat(left).join(' / ').slice(0, 400)]));
      gridForget(log);
    } catch (e) { lines.push('(실행 기록을 남기지 못했습니다: ' + String(e).slice(0, 50) + ')'); }
  }
  return { ok: true, apply: !!apply, ym: target, done: done.length, skipped: skip.length,
    failed: bad.length, left: left.length, lines: lines };
}
function fnShopperSubmit(ctx, payload) {
  const badDate = submitDateGate(payload && payload.date);   // 2026-09-25 검수 · dates-4
  if (badDate) return badDate;
  /* 2026-09-25 검수 · contract-1 — 확정 달은 되묻기(guardResubmit) 앞에서 끝낸다(QSC 와 같은 순서).
     종전에는 그 달 MS 가 이미 있으면 덮어쓰기 창 → 되돌리기 거절 → 「…에서 멈췄습니다」가 떴다.
     saveShopper 안의 같은 검사는 고객 설문(submitWithCode) 경로용으로 그대로 둔다. */
  const closed = qscMonthClosed(payload && payload.store, payload && payload.date);
  if (closed) return closed;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const undone = [];
  const stop = guardResubmit(ss, 'shopper', payload, ctx, undone);
  if (stop) return stop;
  const out = saveShopper(ss, payload, ctx, false);
  if (out && out.ok && undone.length) out.undone = undone;
  return out;
}
function guardResubmit(ss, kind, payload, ctx, doneOut) {
  const prev = prevSubmitsOf(ss, kind, payload && payload.store, payload && payload.date);
  if (!prev.length) return null;                       // 이번 달 첫 제출 — 묻지 않는다
  if (!(payload && payload.overwrite === true)) {
    /* ★매장이 이미 적은 답이 있으면 그것도 알린다★ (2026-08-27) — 덮어쓰면 함께 지워진다.
       되돌리기는 '그 회차를 없던 일로' 하는 것이라 그게 맞지만, ★모르고 누르면 안 된다★.
       QSC 만 본다 — 개선요청은 QSC 가 내려보내는 것이다. */
    let wrote = null;
    if (kind !== 'shopper') {
      const dd = [];
      prev.forEach(function (p) { if (dd.indexOf(p.date) < 0) dd.push(p.date); });
      for (let i = 0; i < dd.length; i++) {
        const b = improveBlocked(payload.store, dd[i]);
        if (b) { wrote = { date: dd[i], touched: b.touched, filled: b.filled }; break; }
      }
    }
    const res = {
      ok: false, code: 'CONFLICT',
      error: '이 매장은 이번 달에 이미 제출된 기록이 있습니다.',
      existing: prev,
    };
    if (wrote) res.storeWrote = wrote;
    return res;
  }
  /* ★누구인지 확인 안 된 요청은 덮어쓰기를 못 한다★ (2026-08-27)

     덮어쓰기는 '먼저 지우고 새로 쓰는' 것이라, 이 문을 통과하면 남의 매장 그 달 기록이
     통째로 사라진다. 그런데 qsc.submit·shopper.submit 은 legacy 라
     ★AUTH_ENFORCE 를 끄면 토큰 없이 통과하고★(doPost 6단계), 무인증이면 그 다음
     권한 게이트도 통째로 건너뛴다(`if (ctx.auth && spec.menu)` — 7단계).
     그러면 서버 주소만 아는 사람이 store·date·overwrite 세 칸으로 한 달치를 지울 수 있다.
     주소·매장 이름·overwrite 라는 낱말은 전부 공개 저장소에 있다.

     ★첫 제출은 막지 않는다★ — 벽을 끈 목적(옛 경로로 업무를 계속하는 것)은 그대로 살린다.
     막는 것은 '지우는 힘'뿐이다. 벽이 켜져 있는 동안에는 이 줄에 닿을 일이 없다. */
  if (!(ctx && ctx.auth)) {
    return { ok: false, code: 'CONFLICT', existing: prev,
      error: '이 매장은 이번 달에 이미 제출된 기록이 있습니다. 덮어쓰려면 로그인이 필요합니다.' };
  }

  /* 사람이 '덮어씁니다'를 눌렀다 — 되돌리기를 그대로 태운다.
     그 달에 날짜가 여럿이면 날짜마다 한 번씩. */
  const days = [];
  prev.forEach(function (p) { if (days.indexOf(p.date) < 0) days.push(p.date); });

  for (let i = 0; i < days.length; i++) {
    /* ★손님이 낸 설문은 건드리지 않는다★ (2026-08-27)
       담당자가 자기 MS 를 다시 내는 것인데, 그 달에 손님이 낸 설문까지 지워지면 안 된다.
       시트 줄 삭제는 휴지통이 없어 되찾을 수 없다. '입력경로' 칸으로 담당자 것만 고른다.
       (QSC 에는 손님 경로가 없으므로 route 를 주지 않는다.) */
    const u = fnUndoSubmit(ctx, { store: payload.store, date: days[i], kind: kind, apply: true,
      route: kind === 'shopper' ? '관리자 입력' : '' });
    if (u && u.done && doneOut) doneOut.push.apply(doneOut, u.done);
    if (!u || u.ok !== true) {
      return { ok: false, code: 'SERVER_ERROR',
        error: (i > 0 ? ('앞 제출 ' + days.slice(0, i).join('·') + ' 는 이미 정리했고, ') : '') +
          days[i] + ' 에서 멈췄습니다: ' + ((u && u.error) || '알 수 없는 이유') +
          ' — 저장하지 않았습니다. 관리자 도구에서 남은 상태를 확인해 주세요.' };
    }
    if (u.dirty) {
      /* ★이제 '매장이 적어서' 멈추는 일은 없다★ (2026-08-27) — 매장 몫도 함께 지운다.
         여기까지 오는 것은 개선요청 표 자체를 읽지 못한 경우뿐이다(머리글이 바뀌었거나 탭이 망가짐). */
      return { ok: false, code: 'CONFLICT', blocked: true,
        error: days[i] + ' 의 개선요청 표를 지우지 못했습니다 — ' + (u.why || '표를 읽지 못했습니다') +
          ' 저장하지 않았습니다 — 매장 파일의 개선요청 표를 확인해 주세요.' };
    }
  }
  return null;
}
/* 진짜 writeStoreShopper 로 넘기되, 받은 인자를 적고 · FORCE_MC 면 「옛 사본처럼」 MONTH_CLOSED 를 돌려준다 */
function writeStoreShopper(a, b, c, d) {
  WSS_ARGS.push([a, b, c, d]);
  if (FORCE_MC) return { ok: false, code: 'MONTH_CLOSED', error: '2026년 10월 채점이 확정되어 기록하지 않습니다.' };
  return d === undefined ? writeStoreShopperReal(a, b, c) : writeStoreShopperReal(a, b, c, d);
}
/* 실제 saveShopper 를 부르고, MS_상세에 닿으면(STOP) 「저장됨」으로 본다 */
function saveShopper(ss, p, ctx, isSurvey) {
  try { return saveShopperReal(ss, p, ctx, isSurvey); }
  catch (e) { if (String(e.message).indexOf('STOP:') === 0) return { ok: true, reached: true }; throw e; }
}

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
function reset() { CLOSED = {}; FILE_ID = 'FILE1'; SHEET_CALLS = 0; TAB_EXISTS = true; MADE = 0; MS_WRITES = []; CODE_MARKS = []; CUR = '2611';
  DASH_WRITES = []; FORCE_MC = false; WSS_ARGS = []; PREV = []; UNDO_CALLS = 0; }
const SS = { getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; } };
function p(date) { return { store: '금종제과', date: date, code: '123456', answers: [{ no: 1, answer: '예' }] }; }

console.log('① saveShopper — 확정된 달');
reset(); CLOSED['FILE1:2610'] = '2026-11-03';
let r = saveShopper(SS, p('2026-10-28'), { auth: true, id: 'admin' }, false);
ok('MONTH_CLOSED', r.ok === false && r.code === 'MONTH_CLOSED', r);
ok('문구 「2026년 10월 채점이 확정되어 제출할 수 없습니다.」', r.error === '2026년 10월 채점이 확정되어 제출할 수 없습니다.', r.error);
ok('★MS_상세에 한 줄도 안 썼다★', SHEET_CALLS === 0, SHEET_CALLS);

console.log('② saveShopper — 종전대로 가는 경우');
reset();
ok('확정 안 된 달 → MS_상세까지 간다', saveShopper(SS, p('2026-11-02'), {}, false).reached === true && SHEET_CALLS === 1);
reset(); CLOSED['FILE1:2609'] = '2026-10-05';
ok('다른 달만 확정 → 간다', saveShopper(SS, p('2026-10-28'), {}, false).reached === true);
reset(); FILE_ID = null; CLOSED['FILE1:2610'] = '2026-11-03';
ok('매장 파일을 못 찾으면 막지 않는다(기록 쪽이 알린다)', saveShopper(SS, p('2026-10-28'), {}, false).reached === true);

console.log('③ 고객 설문 — 확정된 달이면 거부 · ★코드는 살아 있다★');
reset(); CLOSED['FILE1:2610'] = '2026-11-03';
r = submitWithCode(SS, p('2026-10-28'), { auth: false });
ok('거부(MONTH_CLOSED)', r.ok === false && r.code === 'MONTH_CLOSED', r);
ok('★코드 소진 표시를 안 했다(살아 있다)★', CODE_MARKS.length === 0, CODE_MARKS);
ok('MS_상세에도 안 썼다', SHEET_CALLS === 0);
reset();
r = submitWithCode(SS, p('2026-11-02'), { auth: false });
ok('확정 안 된 달 — 저장되고 코드 소진', r.ok === true && CODE_MARKS.length === 1 && CODE_MARKS[0][1] === '사용됨', [r, CODE_MARKS]);

console.log('④ writeStoreShopper — 확정된 달은 기록하지 않는다');
reset(); CLOSED['FILE1:2610'] = '2026-11-03'; TAB_EXISTS = false;
r = writeStoreShopper('금종제과', '2026-10-01', 0.88);
ok('MONTH_CLOSED 「2026년 10월 채점이 확정되어 기록하지 않습니다.」', r.ok === false && r.code === 'MONTH_CLOSED' && r.error === '2026년 10월 채점이 확정되어 기록하지 않습니다.', r);
ok('탭을 만들지 않았다 · MS점수를 안 썼다', MADE === 0 && MS_WRITES.length === 0, [MADE, MS_WRITES]);
reset();
r = writeStoreShopper('금종제과', '2026-10-01', 0.88);
ok('확정 안 된 달 — 종전대로 MS점수를 쓴다', r.ok === true && MS_WRITES.length === 1 && MS_WRITES[0][0] === '2610' && MS_WRITES[0][1] === 0.88, [r, MS_WRITES]);
reset(); TAB_EXISTS = false;
r = writeStoreShopper('금종제과', '2026-11-01', 0.5);
ok('탭이 없으면 종전대로 만든 뒤 쓴다', r.ok === true && MADE === 1 && MS_WRITES.length === 1, [r, MADE]);

console.log('⑤ backend-1 — 월말 반영은 달 중간에 확정된 매장에도 MS점수를 쓴다');
reset(); CLOSED['FILE1:2610'] = '2026-10-25';
ok('writeStoreShopper(…, closeRun=true) — 확정 달에도 쓴다', writeStoreShopperReal('금종제과', '2026-10-01', 0.88, true).ok === true && MS_WRITES.length === 1 && MS_WRITES[0][1] === 0.88, MS_WRITES);
reset(); CLOSED['FILE1:2610'] = '2026-10-25';
r = monthCloseRun('2026-10', true, null);
ok('monthCloseRun 은 closeRun=true 로 부른다', WSS_ARGS.length === 1 && WSS_ARGS[0][3] === true, WSS_ARGS);
ok('확정 매장 → 매장 파일 MS점수 기록(빈칸으로 남지 않는다)', MS_WRITES.length === 1 && MS_WRITES[0][0] === '2610' && MS_WRITES[0][1] === 0.88, MS_WRITES);
ok('통합시트에도 같은 값 → 두 곳이 어긋나지 않는다', DASH_WRITES.length === 1 && DASH_WRITES[0][2] === 0.88, DASH_WRITES);
ok('반영 1 · 실패 0(→ monthCloseDone 이 끝으로 본다 · 매일 밤 다시 돌지 않는다)', r.done === 1 && r.failed === 0 && r.left === 0, r);
reset(); FORCE_MC = true;
r = monthCloseRun('2026-10', true, null);
ok('그래도 MONTH_CLOSED 가 오면 실패가 아니라 건너뜀으로 센다', r.failed === 0 && r.skipped === 1 && r.done === 0, r);
ok('그때는 통합시트도 건드리지 않는다(두 곳이 어긋나지 않게)', DASH_WRITES.length === 0, DASH_WRITES);
reset(); CLOSED['FILE1:2610'] = '2026-10-25';
ok('saveShopper 길(closeRun 없음)은 여전히 확정 달에 안 쓴다', writeStoreShopper('금종제과', '2026-10-01', 0.9).code === 'MONTH_CLOSED' && MS_WRITES.length === 0);

console.log('⑥ contract-1 — 확정 달 MS 재입력: 덮어쓰기 창이 아니라 MONTH_CLOSED');
reset(); CUR = '2610'; CLOSED['FILE1:2610'] = '2026-10-25';
PREV = [{ date: '2026-10-05', kind: 'shopper' }];
r = fnShopperSubmit({ auth: true, id: 'admin' }, { store: '금종제과', date: '2026-10-20' });
ok('기존 MS 가 있어도 code MONTH_CLOSED · 「2026년 10월 채점이 확정되어 제출할 수 없습니다.」',
   r.ok === false && r.code === 'MONTH_CLOSED' && r.error === '2026년 10월 채점이 확정되어 제출할 수 없습니다.', r);
ok('CONFLICT·existing 없음(덮어쓰기 창이 뜨지 않는다)', r.code !== 'CONFLICT' && !r.existing, r);
r = fnShopperSubmit({ auth: true, id: 'admin' }, { store: '금종제과', date: '2026-10-20', overwrite: true });
ok('overwrite:true 로 와도 MONTH_CLOSED · 되돌리기를 부르지 않는다(「…에서 멈췄습니다」 없음)', r.code === 'MONTH_CLOSED' && UNDO_CALLS === 0 && !/멈췄습니다/.test(r.error), [r, UNDO_CALLS]);
ok('MS_상세에도 닿지 않았다', SHEET_CALLS === 0, SHEET_CALLS);
reset(); CUR = '2610'; PREV = [{ date: '2026-10-05', kind: 'shopper' }];
r = fnShopperSubmit({ auth: true, id: 'admin' }, { store: '금종제과', date: '2026-10-20' });
ok('확정 안 된 달에 기존 MS 가 있으면 종전대로 덮어쓰기 창(CONFLICT·existing)', r.code === 'CONFLICT' && r.existing && r.existing.length === 1, r);

console.log('⑦ backend-2/security-1 — 공백 붙은 날짜는 문에서 끊는다(확정 검사를 비켜 가지 못한다)');
reset(); CUR = '2611'; CLOSED['FILE1:2610'] = '2026-11-03';
[' 2026-10-20', '2026-10-20 '].forEach(function (d) {
  const g = submitWithCode(SS, p(d), { auth: false });
  ok('고객 설문 ' + JSON.stringify(d) + ' → 「방문 날짜를 선택해 주세요.」 · MS_상세·코드 그대로', g.ok === false && g.error === '방문 날짜를 선택해 주세요.' && SHEET_CALLS === 0 && CODE_MARKS.length === 0, g);
  const a = fnShopperSubmit({ auth: true, id: 'admin' }, { store: '금종제과', date: d });
  ok('관리자 MS ' + JSON.stringify(d) + ' → 「점검일자를 선택해 주세요.」', a.ok === false && a.error === '점검일자를 선택해 주세요.' && SHEET_CALLS === 0, a);
});

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
