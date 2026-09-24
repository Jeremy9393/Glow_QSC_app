# -*- coding: utf-8 -*-
"""MS 도 확정된 달에는 쓰지 않는다 (2026-09-25 검수 · dates-3)

★Code.gs 의 진짜 saveShopper(첫 문) · writeStoreShopper · qscMonthClosed · submitWithCode · submitDateGate 를 잘라내서 돌린다★ (사본 아님).

왜: QSC 는 09-17(②-3h)에 「확정된 달은 제출 불가」를 걸었는데 MS 쓰기 길에는 없었다. 지난달 날짜(달력 오선택·되살아난 임시저장)로 낸
    MS 가 제출시각 최신 1건이 되어 확정된 달의 MS점수·종합점수를 조용히 덮고, 되돌리기는 확정된 달을 거부해 앱으로 못 고쳤다.

보는 것:
  ① saveShopper — 확정된 달이면 MONTH_CLOSED 「2026년 10월 채점이 확정되어 제출할 수 없습니다.」 · ★MS_상세에 한 줄도 안 쓴다★
  ② saveShopper — 확정 안 된 달·다른 달 확정·매장 파일 못 찾음은 종전대로 MS_상세까지 간다
  ③ ★고객 설문(submitWithCode) — 확정된 달이면 거부되고 코드는 소진되지 않는다(살아 있다)★ · 확정 안 된 달은 소진
  ④ writeStoreShopper — 확정된 달이면 MONTH_CLOSED 「… 채점이 확정되어 기록하지 않습니다.」 · 탭을 만들지도 MS점수를 쓰지도 않는다
     (월말 반영 monthCloseRun 길도 이 함수를 지난다) · 확정 안 된 달은 종전대로 쓴다
  ⑤ backend-1 — 월말 반영(monthCloseRun)은 closeRun=true 로 불러 달 중간에 확정된 매장에도 MS점수를 쓴다(통합시트와 같은 값) ·
     실패 0 이라 매일 밤 다시 돌지 않는다 · 그래도 MONTH_CLOSED 가 오면 건너뜀으로 세고 통합시트도 안 건드린다
  ⑥ contract-1 — fnShopperSubmit(guardResubmit 포함): 확정 달에 기존 MS 가 있어도 덮어쓰기 창(CONFLICT) 대신 MONTH_CLOSED
  ⑦ backend-2/security-1 — ' 2026-10-20'·'2026-10-20 ' 은 날짜 문에서 끊긴다(확정 검사를 비켜 가지 못한다)
  대조군: QSC_SRC=<고치기 전 사본> 이면 ①③④(dates-3 전) · ⑤⑥⑦(2026-09-25 재수정 전)이 실패해야 한다
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_ms_closed.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cut_opt(name, stub):
    try:
        return cut(name)
    except SystemExit:
        return stub


js = r'''
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
''' + '\n'.join([
    cut_opt('qscMonthClosed', 'function qscMonthClosed() { return null; }'),
    cut('saveShopper').replace('function saveShopper(', 'function saveShopperReal(', 1),
    cut('writeStoreShopper').replace('function writeStoreShopper(', 'function writeStoreShopperReal(', 1),
    cut('submitWithCode'),
    cut_opt('submitDateGate', 'function submitDateGate() { return null; }'),
    cut('validYm'),
    cut('monthCloseRun'),
    cut('fnShopperSubmit'),
    cut('guardResubmit'),
]) + r'''
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
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
sys.exit(1 if res.returncode != 0 else 0)
