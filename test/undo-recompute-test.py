# -*- coding: utf-8 -*-
"""되돌리기 점수 재계산 + 손님 설문 보존 시험

★Code.gs 의 진짜 fnUndoSubmit 본문을 잘라내서 돌린다★ (사본 아님).
구글 API 는 전부 가짜로 갈아 끼우고, 시트는 2차원 배열로 흉내 낸다.
"""
import io, os, re, sys, subprocess
from pathlib import Path

# QSC_SRC 환경변수로 다른 Code.gs(예: 고치기 전 사본)를 가리키면 대조군 실행이 된다 (2026-09-17)
SRC = Path(os.environ.get('QSC_SRC') or r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_undo.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cut_opt(name):
    """없으면 빈 줄 — 고치기 전 사본(대조군)에는 아직 없는 함수라서"""
    try:
        return cut(name)
    except StopIteration:
        return '/* %s 없음 (옛 사본) */' % name


body = cut('fnUndoSubmit') + '\n\n' + cut_opt('msMonthPick') + '\n\n' + cut('shopperMonthAvg') + '\n\n' + cut('stampOf')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
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

__BODY__

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
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(HARNESS.replace('__BODY__', body))
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:2500])
sys.exit(r.returncode)
