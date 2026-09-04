# -*- coding: utf-8 -*-
"""되돌리기 점수 재계산 + 손님 설문 보존 시험

★Code.gs 의 진짜 fnUndoSubmit 본문을 잘라내서 돌린다★ (사본 아님).
구글 API 는 전부 가짜로 갈아 끼우고, 시트는 2차원 배열로 흉내 낸다.
"""
import io, re, sys, subprocess
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_undo.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = cut('fnUndoSubmit') + '\n\n' + cut('shopperMonthAvg')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
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

__BODY__

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

console.log('\n[1-2] ★그 달이 아직 안 끝났으면 매장 파일에는 안 쓴다★ (2026-09-04 지연 규칙)');
MONTH_OPEN = false;                       // 월중에 되돌린 경우
reset([
  ['2026-10-25T10:00','2026-10-25','','금종제과','','','','관리자 입력',60],
  ['2026-10-10T10:00','2026-10-10','','금종제과','','','','고객 직접',90],
]);
r = fnUndoSubmit({}, { store: S, date: '2026-10-25', kind: 'shopper', apply: true, route: '관리자 입력' });
ok('되돌리기 성공', r.ok === true, JSON.stringify(r.error || ''));
ok('★통합시트에는 그대로 쓴다★ (본사 것이라 매장이 못 본다)',
   Math.abs(wroteOf('통합시트:MS') - 0.9) < 1e-9, '값=' + wroteOf('통합시트:MS'));
ok('★매장 파일에는 빈칸★ — 월중에 점수가 보이면 지연이 무너진다',
   wroteOf('매장파일:MS점수') === '', '값=' + JSON.stringify(wroteOf('매장파일:MS점수')));
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
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(HARNESS.replace('__BODY__', body))
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:2500])
sys.exit(r.returncode)
