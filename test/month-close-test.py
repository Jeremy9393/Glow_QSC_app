# -*- coding: utf-8 -*-
"""개선요청 판정 — 기한만 본다 · 이월 없음 · 월 채점 확정은 기한 남은 미완료가 있으면 멈춘다 (2026-09-15)

★Code.gs 의 진짜 impJudge · impRate · impStateFormula · fnMonthClose 를 잘라내서 돌린다★ (사본 아님).
시트·잠금·속성은 가짜로 끼운다.

왜: 담당자 *"예정일 적으나마나 그건 관리자입장에서 알빠 아니야 … 그냥 기한을 넘냐 안넘느냐만 보면 되잖아"* ·
월별 평가라 다음 달로 넘기는 이월을 없앴고, 기한이 남은 미완료가 있으면 확정 전에 묻는다
(점장이 없는 매장은 그래도 마감한다 — force).

보는 것:
  ① 판정: 진행 내용이 있어도 기한이 지나면 「기한 지남」 · 진행 내용 맨 앞 날짜(예정일)는 안 본다
  ② 확정(final): 완료가 아닌 건은 전부 「미조치」
  ③ 개선율: 분모 = 발행 − 감점제외 (이월 없음)
  ④ 시트 수식: 「기한 지남」 판정이 「진행중」보다 먼저
  ⑤ 월 채점 확정: 미리보기에 기한 남은 미완료 · force 없으면 CONFLICT(안 씀) · force 면 미조치로 쓰고 전부 잠금
  ⑥ 소스에 「예정일 지남」·dueDateOf·daysBetween·rolledOnce 가 남지 않았다
"""
import io, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
APP = HERE.parents[1]
SRC = APP / 'backend' / 'Code.gs'
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_month_close.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = src.split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


py_fail = 0


def pyok(name, cond):
    global py_fail
    print(('  ✓ ' if cond else '  ✗ ') + name)
    if not cond:
        py_fail += 1


app = io.open(APP / 'js' / 'store-app.js', 'r', encoding='utf-8', newline='').read()
menu = io.open(APP / 'js' / 'menu.js', 'r', encoding='utf-8', newline='').read()
pyok('⑥ Code.gs 에 「예정일 지남」 없음', '예정일 지남' not in src)
pyok('⑥ store-app.js · menu.js 에 「예정일 지남」 없음', '예정일 지남' not in app and '예정일 지남' not in menu)
pyok('⑥ Code.gs 에 dueDateOf · daysBetween · rolledOnce 없음',
     all(w not in src for w in ('dueDateOf', 'daysBetween', 'rolledOnce')))
pyok('⑤ 화면이 확정 때 force 를 보낸다', 'force: force' in app)

js = r'''
const T = '2026-10-20', TZ = 'Asia/Seoul';
function dateOfCell(v) { return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : ''; }
function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

const G = { ok: true, isNew: true, row0: 12, endRow: 16, last: 20,
  due: 2, state: 3, body: 10, plan: 13, done: 14, audit: 17, redo: 18, waive: 19, roll: 20 };
let VALS = [], writes = [], locked = null, props = {};
const sh = {};
const ss = { getSheetByName: function () { return sh; }, getId: function () { return 'FILE1'; }, getName: function () { return '샘플매장'; } };
const SpreadsheetApp = { openById: function () { return ss; }, flush: function () {} };
const Utilities = { formatDate: function () { return T; } };
const LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
const PROPS = { setProperty: function (k, v) { props[k] = v; } };
/* L_QSC 는 rateShown 이 쓴다 — ★이 harness 의 labelValue 는 .v 를 안 주므로★ 0건일 때
   100%로 올리는 갈래는 여기서 타지 않는다(그쪽은 test/total-formula-test.py 가 본다).
   여기서 필요한 것은 fnMonthClose 가 rateShown 을 불러도 ★멈추지 않는다★는 것뿐이다. */
const MC_PREFIX = 'MC:', L_RATE = ['개선율'], L_QSC = ['QSC점수'];
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function validYm(ym) { return /^\d{4}$/.test(ym); }
function normStore(s) { return String(s || '').trim(); }
function storeFileId() { return 'FILE1'; }
function impGeo() { return G; }
function monthClosedAt() { return ''; }
function fileTz() { return TZ; }
function grid(s, r, c, nr, nc) {
  return {
    getValues: function () { return VALS; },
    setValues: function (x) { writes.push({ col: c, vals: x }); },
    setValue: function (x) { writes.push({ col: c, val: x }); },
  };
}
function labelMap() { return {}; }
function labelValue() { return { found: true, row: 9, col: 9 }; }
function lockMonthTab(s, rows) { locked = rows; return { ok: true }; }
function dropStoreCache() {}
''' + cut('impJudge') + '\n' + cut('impRate') + '\n' + cut('rateShown') + '\n' + cut('impStateFormula') + '\n' + cut('fnMonthClose') + r'''

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); }
}
const J = function (r, fin) { return impJudge(r, T, TZ, '2610', !!fin).state; };

ok('① 진행 내용 있음 + 기한 지남 → 기한 지남', J({ plan: '업체에 청소 요청함', due: '2026-10-10' }) === '기한 지남');
ok('① 진행 내용 맨 앞 날짜가 지났어도 기한 전이면 진행중 (예정일 안 봄)', J({ plan: '10/15 매대 교체 예정', due: '2026-11-01' }) === '진행중');
ok('① 진행 내용 없음 + 기한 전 → 미착수', J({ due: '2026-11-01' }) === '미착수');
ok('① 기한 당일은 아직 기한 안', J({ plan: 'x', due: T }) === '진행중');
ok('① 완료 내용 있음 → 완료(검수 전)', J({ plan: 'x', doneNote: '청소함', due: '2026-10-01' }) === '완료(검수 전)');
ok('① 보완 요청 + 보완 기한 전 → 반려', J({ audit: '반려', redo: '2026-10-25' }) === '반려');
ok('① 보완 요청 + 보완 기한 지남 → 재제출기한 지남', J({ audit: '반려', redo: '2026-10-19' }) === '재제출기한 지남');
ok('② 확정: 진행중(기한 전) → 미조치', J({ plan: 'x', due: '2026-11-01' }, true) === '미조치');
ok('② 확정: 미착수(기한 전) → 미조치', J({ due: '2026-11-01' }, true) === '미조치');
ok('② 확정: 반려(보완 기한 전) → 미조치', J({ audit: '반려', redo: '2026-10-25' }, true) === '미조치');
ok('② 확정: 기한 지남 → 미조치', J({ due: '2026-10-01' }, true) === '미조치');
ok('② 확정: 검수 확정 → 확정', J({ audit: '확정', doneNote: 'x' }, true) === '확정');

const rt = impRate([{ state: '확정' }, { state: '진행중' }, { state: '미착수' }, { state: '반려' }, { state: '진행중', waive: true }]);
ok('③ 분모 = 발행 5 − 감점제외 1 = 4', rt.issued === 5 && rt.waived === 1 && rt.denom === 4, rt);
ok('③ 개선율 1/4 = 0.25 (진행중·반려도 분모에 남는다)', rt.rate === 0.25, rt);
ok('③ rolled 칸 없음', !('rolled' in rt), rt);
ok('③ 발행 0건 → null', impRate([]).rate === null);

const f = impStateFormula({ due: 2, body: 10, plan: 13, done: 14, audit: 17, redo: 18 }, 12);
ok('④ 수식: 「기한 지남」 판정이 「진행중」보다 앞', f.indexOf('"기한 지남"') > 0 && f.indexOf('"기한 지남"') < f.indexOf('"진행중"'), f);
ok('④ 수식 괄호 짝', (f.match(/\(/g) || []).length === (f.match(/\)/g) || []).length, f);

function row(o) {
  const v = new Array(19).fill('');
  Object.keys(o).forEach(function (k) { v[G[k] - 2] = o[k]; });
  return v;
}
function ROWS() {
  return [
    row({ body: '제빙기 청소 미흡', done: '청소함' }),                                  // 1 완료 보고만 → 자동확정
    row({ body: '냉장고 온도 기록 누락', plan: '10/15 교체 예정', due: '2026-11-01' }),   // 2 진행중 · 기한 남음
    row({ body: '바닥 물기', due: '2026-10-01' }),                                       // 3 기한 지남
    row({ body: '후드 기름때', audit: '반려', redo: '2026-10-27', done: '1차 청소' }),    // 4 보완 요청 · 보완 기한 남음
    row({}),                                                                              // 5 빈 줄
  ];
}
function reset(rows) { VALS = rows; writes = []; locked = null; props = {}; }
const ctx = { role: '관리자', id: 'admin' };

reset(ROWS());
const pv = fnMonthClose(ctx, { store: '샘플매장', ym: '2610' });
ok('⑤ 미리보기 ok', pv.ok && pv.dry, pv);
ok('⑤ 기한 남은 미완료 2건 (2번 진행중 · 4번 반려)', pv.pending && pv.pending.length === 2 &&
  pv.pending[0].no === 2 && pv.pending[0].state === '진행중' && pv.pending[1].no === 4 && pv.pending[1].state === '반려', pv.pending);
ok('⑤ 마지막 기한 2026-11-01', pv.lastDue === '2026-11-01', pv.lastDue);
ok('⑤ 미리보기 안내 줄', pv.plan.some(function (x) { return x.indexOf('기한이 남은 미완료 2건') >= 0; }), pv.plan);
ok('⑤ 미리보기는 안 쓰고 안 잠근다', writes.length === 0 && locked === null, writes);

reset(ROWS());
const r1 = fnMonthClose(ctx, { store: '샘플매장', ym: '2610', apply: true });
ok('⑤ force 없이 적용 → CONFLICT', !r1.ok && r1.code === 'CONFLICT', r1);
ok('⑤ CONFLICT 때 안 쓰고 · 안 잠그고 · 확정 기록 없음', writes.length === 0 && locked === null && Object.keys(props).length === 0, { writes: writes, props: props });

reset(ROWS());
const r2 = fnMonthClose(ctx, { store: '샘플매장', ym: '2610', apply: true, force: true });
ok('⑤ force 적용 → ok', r2.ok && !r2.dry, r2);
const st = writes.filter(function (w) { return w.col === G.state; })[0];
ok('⑤ 상태 값: 확정 · 미조치 · 미조치 · 미조치 · 빈칸', st && JSON.stringify(st.vals) === JSON.stringify([['확정'], ['미조치'], ['미조치'], ['미조치'], ['']]), st);
const au = writes.filter(function (w) { return w.col === G.audit; })[0];
ok('⑤ 완료 보고만 있던 1번은 검수 칸에 확정', au && au.vals[0][0] === '확정', au);
ok('⑤ 이월 칸은 안 쓴다', !writes.some(function (w) { return w.col === G.roll; }), writes);
ok('⑤ 개선율 0.25 기입', writes.some(function (w) { return w.val === 0.25; }) && r2.rate.rate === 0.25, r2.rate);
ok('⑤ 매장 칸을 모두 잠근다 (열어 둘 줄 없음)', Array.isArray(locked) && locked.length === 0, locked);
ok('⑤ 확정 기록', props['MC:FILE1:2610'] === T, props);
ok('⑤ 응답에 마감한 미완료 수', r2.forced === 2 && !('rolled' in r2), r2);

reset([row({ body: 'a', done: '함' }), row({ body: 'b', plan: 'x', due: '2026-10-05' }), row({}), row({}), row({})]);
const r3 = fnMonthClose(ctx, { store: '샘플매장', ym: '2610', apply: true });
ok('⑤ 기한 남은 미완료가 없으면 force 없이 확정', r3.ok && !r3.dry, r3);

console.log('JS ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout, end='')
if r.stderr:
    print(r.stderr)
print('PY %d 실패' % py_fail)
sys.exit(1 if (r.returncode or py_fail) else 0)
