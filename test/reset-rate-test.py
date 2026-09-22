# -*- coding: utf-8 -*-
"""개선율 칸 되살리기 시험 (2026-09-22 · 백엔드 1.50)

★Code.gs 의 진짜 resetRateCellIn · fnStoreResetRate 본문을 잘라내서 돌린다★ (사본 아님).
새 서식에서는 매장이 개선보고를 저장할 때 recountSummary 가 월 탭 개선율 칸(H9)을 ★값★으로 덮는다.
되돌리기로 표를 비운 뒤 그 값이 남으면 다음 제출이 그 탭에 들어가도 옛 개선율이 통합시트 종합에 간다
(12월 베타 원상복구에서 해운대 H9 = 1 로 확인). 원본 탭의 같은 칸 수식을 그대로 옮겨 되살린다.
QSC_SRC 환경변수로 다른 Code.gs(고치기 전 사본)를 가리키면 대조군 실행이 된다.
"""
import io, os, sys, subprocess
from pathlib import Path

SRC = Path(os.environ.get('QSC_SRC') or r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\_도구\node\node.exe')
OUT = Path(__file__).parent / '_reset_rate.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut_opt(name):
    try:
        st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    except StopIteration:
        return '/* %s 없음 (옛 사본) */' % name
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = cut_opt('resetRateCellIn') + '\n\n' + cut_opt('fnStoreResetRate')

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var TPL_NEW = '0QSC현황(원본_2610~)';
var WRITES = [];
function a1(r, c) { return String.fromCharCode(64 + c) + r; }
// 시트 = { name, labels: {라벨: [행, 열]}, cells: {A1: {f, v}} }
function mkSheet(name, rateAt, cell) { var c = {}; if (rateAt) c[a1(rateAt[0], rateAt[1])] = cell; return { name: name, labels: rateAt ? { '개선율': rateAt } : {}, cells: c, getName: function () { return name; } }; }
function labelMap(sh) { return sh; }
function labelValue(lm, names) { var p = lm.labels[names[0]]; return p ? { found: true, row: p[0], col: p[1] } : { found: false, v: null }; }
function grid(sh, r, c, nr, nc) {
  if (!sh) return null;
  var k = a1(r, c);
  return {
    getA1Notation: function () { return k; },
    getFormula: function () { return (sh.cells[k] || {}).f || ''; },
    getValue: function () { return (sh.cells[k] || {}).v; },
    setFormula: function (f) { WRITES.push(sh.name + '!' + k + ' ← ' + f); sh.cells[k] = { f: f, v: '' }; },   // 표가 비었으니 IFERROR 가 "" 를 낸다
  };
}
var SS;   // 매장 파일
function ssOpen() { return SS; }
function mkFile(sheets) { var m = {}; sheets.forEach(function (s) { m[s.name] = s; }); return { getSheetByName: function (n) { return m[n] || null; }, getId: function () { return 'F'; } }; }
var FILE_ID = 'F', CLOSED = '', FILLED = 0, LAYOUT = 'new';
function storeFileId() { return FILE_ID; }
function monthClosedAt() { return CLOSED; }
function improveScan() { return { ok: true, filled: FILLED, touched: 0 }; }
function monthTabLayout() { return LAYOUT; }
function validYm(ym) { return /^\d{4}$/.test(ym); }
function ymLabel(ym) { return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월'; }
function err(c, m) { return { ok: false, code: c, error: m }; }
var DROPPED = 0; function dropStoreCache() { DROPPED++; }
var SpreadsheetApp = { flush: function () {} };

__BODY__

// ══ 시험 ════════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  X    ' + n + (e ? '   ' + e : '')); } }
function run(f) { try { return f(); } catch (e) { return { threw: String(e) }; } }
var F = '=IFERROR(H7/H5, "")';
function world(monthCell, tplCell, opts) {
  opts = opts || {};
  WRITES = []; DROPPED = 0; CLOSED = ''; FILLED = 0; LAYOUT = 'new'; FILE_ID = 'F';
  var month = mkSheet('2612', opts.noLabel ? null : [9, 8], monthCell);
  var sheets = [month];
  if (!opts.noTpl) sheets.push(mkSheet(TPL_NEW, [9, 8], tplCell));
  SS = mkFile(sheets);
  return month;
}

console.log('\n[1] 알맹이 resetRateCellIn — 값 1 로 덮인 칸을 원본 수식으로');
var m = world({ f: '', v: 1 }, { f: F, v: '' });
var r = run(function () { return resetRateCellIn(SS, m, false); });
ok('미리보기: ok · preview · was 1 · now 원본 수식', r.ok === true && r.preview === true && r.was === 1 && r.now === F && r.cell === 'H9', JSON.stringify(r));
ok('미리보기는 아무것도 안 쓴다', WRITES.length === 0 && m.cells.H9.v === 1, JSON.stringify(WRITES));
r = run(function () { return resetRateCellIn(SS, m, true); });
ok('실행: done · H9 ← 원본 수식 글자 그대로', r.ok === true && r.done === true && m.cells.H9.f === F && WRITES.length === 1, JSON.stringify(r) + JSON.stringify(WRITES));
ok('행·열도 돌려준다(부르는 쪽이 값을 다시 읽는다)', r.row === 9 && r.col === 8, JSON.stringify(r));
r = run(function () { return resetRateCellIn(SS, m, true); });
ok('두 번째는 same — 다시 쓰지 않는다', r.ok === true && r.same === true && WRITES.length === 1, JSON.stringify(r));

console.log('\n[2] 짐작하지 않는다 — 원본 칸이 수식이 아니면 멈춘다');
m = world({ f: '', v: 1 }, { f: '', v: 0.5 });
r = run(function () { return resetRateCellIn(SS, m, true); });
ok('ok:false · 「짐작해서 적지 않습니다」', r.ok === false && /짐작해서 적지 않습니다/.test(r.why || ''), JSON.stringify(r));
ok('월 탭은 그대로(값 1)', m.cells.H9.v === 1 && WRITES.length === 0, JSON.stringify(WRITES));

console.log('\n[3] 원본 탭이 없거나 · 월 탭에 개선율 라벨이 없으면 멈춘다');
m = world({ f: '', v: 1 }, null, { noTpl: true });
r = run(function () { return resetRateCellIn(SS, m, true); });
ok('원본 탭 없음 → ok:false', r.ok === false && /원본 탭/.test(r.why || '') && WRITES.length === 0, JSON.stringify(r));
m = world(null, { f: F, v: '' }, { noLabel: true });
r = run(function () { return resetRateCellIn(SS, m, true); });
ok('월 탭 라벨 없음 → ok:false', r.ok === false && /「개선율」 칸을 못 찾았습니다/.test(r.why || '') && WRITES.length === 0, JSON.stringify(r));

console.log('\n[4] 관리자 액션 store.resetRate — 문 네 개(탭·확정·빈 표·새 서식) 뒤에서만 쓴다');
m = world({ f: '', v: 1 }, { f: F, v: '' });
r = run(function () { return fnStoreResetRate({}, { store: '스탠다드브레드 해운대', ym: '2611' }); });
ok('탭 없음 → NOT_FOUND', r.ok === false && r.code === 'NOT_FOUND', JSON.stringify(r));
CLOSED = '2026-11-02';
r = run(function () { return fnStoreResetRate({}, { store: '스탠다드브레드 해운대', ym: '2612', apply: true }); });
ok('확정된 달 → MONTH_CLOSED · 안 씀', r.ok === false && r.code === 'MONTH_CLOSED' && WRITES.length === 0, JSON.stringify(r));
CLOSED = ''; FILLED = 3;
r = run(function () { return fnStoreResetRate({}, { store: '스탠다드브레드 해운대', ym: '2612', apply: true }); });
ok('개선요청 표가 차 있으면 → CONFLICT · 안 씀', r.ok === false && r.code === 'CONFLICT' && WRITES.length === 0, JSON.stringify(r));
FILLED = 0; LAYOUT = 'old';
r = run(function () { return fnStoreResetRate({}, { store: '스탠다드브레드 해운대', ym: '2612', apply: true }); });
ok('★옛 서식 탭 → CONFLICT · 안 씀★ (칸 자리가 달라 원본 수식을 옮기면 틀린다)', r.ok === false && r.code === 'CONFLICT' && /옛 서식/.test(r.error || '') && WRITES.length === 0, JSON.stringify(r));
LAYOUT = 'new';
r = run(function () { return fnStoreResetRate({}, { store: '스탠다드브레드 해운대', ym: '2612' }); });
ok('미리보기: now 1 · will 원본 수식 · 안 씀', r.ok === true && r.preview === true && r.now === 1 && r.will === F && WRITES.length === 0, JSON.stringify(r));
r = run(function () { return fnStoreResetRate({}, { store: '스탠다드브레드 해운대', ym: '2612', apply: true }); });
ok('실행: done · was 1 · now 수식 · 값 빈칸 · 캐시 비움', r.ok === true && r.done === true && r.was === 1 && r.now === F && r.value === '' && DROPPED === 1, JSON.stringify(r));
r = run(function () { return fnStoreResetRate({}, { store: '스탠다드브레드 해운대', ym: '2612', apply: true }); });
ok('다시 하면 same', r.ok === true && r.same === true, JSON.stringify(r));

console.log('\n' + (fail ? 'X 실패 ' + fail + '건' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(HARNESS.replace('__BODY__', body))
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:2500])
try:
    OUT.unlink()
except Exception:
    pass
sys.exit(r.returncode)
