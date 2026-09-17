# -*- coding: utf-8 -*-
"""월 탭 요약 건수 — 「재제출기한 지남」은 진행이 아니라 미조치다 (2026-09-17 #28)

★Code.gs 의 진짜 recountSummary · impJudge · impRate · rateShown 을 잘라내서 돌린다★ (사본 아님).

왜: 앱(store-app.js)은 보완 기한이 지난 건을 「기한 지남」으로 세는데, 시트 요약(recountSummary)만
    「개선예정/진행」에 넣고 있었다. 그 줄이 월별 QSC현황표로 가므로 두 곳이 달랐다(개선율엔 영향 없음).

보는 것:
  ① 반려 + 보완 기한 지남 → 진행 0 · 미조치 1   ← 종전엔 진행 1
  ② 진행중(기한 전) → 진행 1 · 반려(보완 기한 전) → 진행 1
  ③ 확정·완료(검수 전) → 완료 · 기한 지남 → 미조치 · 요청 건수는 본문이 있는 줄 수
  ④ 대조군: QSC_SRC=<고치기 전 사본> 으로 돌리면 ①이 실패해야 한다
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_recount.js'
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


js = r'''
const T = '2026-10-20', TZ = 'Asia/Seoul';
function dateOfCell(v) { return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : ''; }
const Utilities = { formatDate: function () { return T; } };
const L_QSC = ['QSC점수'];
/* 새 서식 자리 — 열 번호 그대로(impCols 가 주는 모양). 줄 배열은 B열(2)부터 담는다: index = col - 2 */
const G = { isNew: true, row0: 12, endRow: 15, last: 20, due: 2, state: 3, body: 10, plan: 13, done: 14,
  audit: 17, redo: 18, waive: 19, roll: 20 };
function impGeo() { return G; }
let VALS = [];
function grid(sh, r, c, nr, nc) { return { getValues: function () { return VALS; }, setValue: function () {} }; }
function labelMap() { return {}; }
function labelValue() { return { found: false }; }     // 개선율 칸 없음 — 건수만 본다
const WROTE = {};
function writeCount(sh, lm, names, n) { WROTE[names[0]] = n; }
function mkRow(o) {
  const a = new Array(19).fill('');
  a[G.due - 2] = o.due || ''; a[G.body - 2] = (o.body === undefined ? '지적' : o.body); a[G.plan - 2] = o.plan || ''; a[G.done - 2] = o.done || '';
  a[G.audit - 2] = o.audit || ''; a[G.redo - 2] = o.redo || ''; a[G.waive - 2] = !!o.waive; a[G.roll - 2] = o.sub || '';
  return a;
}
''' + '\n'.join([cut('impJudge'), cut('impRate'), cut('rateShown'), cut('recountSummary')]) + r'''

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
const sh = { getName: function () { return '2610'; } };

console.log('① 반려 + 보완 기한 지남 → 미조치');
VALS = [mkRow({ due: '2026-10-10', audit: '반려', redo: '2026-10-19' })];
let r = recountSummary(sh, TZ);
ok('impJudge 판정이 「재제출기한 지남」이다(전제)', impJudge({ audit: '반려', redo: '2026-10-19' }, T, TZ, '2610', false).state === '재제출기한 지남');
ok('진행 0', r.prog === 0, r);
ok('미조치 1', r.todo === 1, r);
ok('시트에 쓴 값도 같다 (진행 0 · 미조치 1)', WROTE['진행'] === 0 && WROTE['미조치'] === 1, WROTE);

console.log('② 진행으로 세는 것');
VALS = [mkRow({ due: '2026-11-01', plan: '업체 요청' }), mkRow({ due: '2026-10-10', audit: '반려', redo: '2026-10-25' })];
r = recountSummary(sh, TZ);
ok('진행중 + 반려(보완 기한 전) → 진행 2 · 미조치 0', r.prog === 2 && r.todo === 0, r);

console.log('③ 완료·미조치·요청');
VALS = [mkRow({ audit: '확정', done: '했음' }), mkRow({ done: '했음', due: '2026-11-01' }), mkRow({ due: '2026-10-01' }),
        mkRow({ due: '2026-10-10', audit: '반려', redo: '2026-10-19' }), mkRow({ body: '' })];
r = recountSummary(sh, TZ);
ok('요청 4(본문 빈 줄 제외) · 완료 2 · 진행 0 · 미조치 2', r.req === 4 && r.done === 2 && r.prog === 0 && r.todo === 2, r);
ok('개선율 = 2/4', r.rate === 0.5, r.rate);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
sys.exit(1 if res.returncode != 0 else 0)
