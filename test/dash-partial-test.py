# -*- coding: utf-8 -*-
"""통합시트 조회 — 종합이 아직 없어도 QSC 는 보여야 한다 (2026-09-08)

★Code.gs 의 진짜 fillPeriod 를 잘라내서 돌린다★ (사본 아님).

무엇을 막으려고 만들었나 —
  2026-09-04 부터 ★MS 는 그 달 말일에 열린다★. 그래서 월중 통합시트는 이렇게 된다:
      QSC 96 · MS 빈칸 → 종합 수식 =IF(COUNT(BV,BX)<2,"",…) 가 빈칸
  그런데 fillPeriod 가 「종합이 숫자가 아니면 미점검」으로 보고 ★QSC 까지 지웠다★.
  실제로 이티에프 베이커리 더현대 2612 가 그 상태였다(시트에는 0.96 인데 화면은 빈칸).
  10월이면 26곳 전부가 월중 내내 「점검 안 한 매장」으로 보였을 것이다.

보는 것:
  · QSC 만 있고 종합이 없을 때 ★QSC 가 살아 있는가★ (status=partial)
  · 그때 종합·등급은 비는가 (MS 가 안 열렸으니 종합은 아직 없는 것이 맞다)
  · 아무것도 없을 때만 none 이고 그때는 전부 비우는가
  · 둘 다 있고 종합도 있으면 done 인가
  · 0점을 미점검으로 오해하지 않는가 (0도 점수다)
"""
import io, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_dashpart.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = '\n'.join([cut('fillPeriod'), cut('pct'), cut('cnt'), cut('str')])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
function round1(n) { return Math.round(n * 10) / 10; }
/* 통합시트 한 매장 행 — 열 자리는 MONTH_COL 방식대로 상대 위치만 쓴다 */
var COLS = { qsc: 1, qscGrade: 2, cs: 3, csGrade: 4, improve: 5, total: 6, grade: 7 };
function mkRow(o) {
  var v = [];
  v[COLS.qsc - 1] = (o.qsc === undefined) ? '' : o.qsc;
  v[COLS.qscGrade - 1] = o.qscGrade || '';
  v[COLS.cs - 1] = (o.cs === undefined) ? '' : o.cs;
  v[COLS.csGrade - 1] = o.csGrade || '';
  v[COLS.improve - 1] = (o.improve === undefined) ? '' : o.improve;
  v[COLS.total - 1] = (o.total === undefined) ? '' : o.total;
  v[COLS.grade - 1] = o.grade || '';
  return v;
}
function run(o, key) {
  var row = { qsc: null, qscGrade: null, cs: null, csGrade: null,
              improve: null, total: null, grade: null, status: 'none' };
  fillPeriod(row, mkRow(o), COLS, key || '2026-10', false);
  return row;
}

var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}

console.log('── ★월중: QSC 만 있고 MS·종합은 아직★ ──');
var r = run({ qsc: 0.96, qscGrade: '우수', improve: 0 });
ok('[1-1] status = partial', r.status, 'partial');
ok('[1-2] ★QSC 가 살아 있다★', r.qsc, 96);
ok('[1-3] QSC 등급도 살아 있다', r.qscGrade, '우수');
ok('[1-4] MS 는 아직 없다', r.cs, null);
ok('[1-5] 종합은 비운다 (MS 가 안 열렸다)', r.total, null);
ok('[1-6] 종합 등급도 비운다', r.grade, null);
ok('[1-7] 개선율은 살아 있다', r.improve, 0);

console.log('── 말일 뒤: 둘 다 있고 종합도 나왔다 ──');
r = run({ qsc: 0.96, qscGrade: '우수', cs: 0.987, csGrade: '우수', improve: 0, total: 0.8721, grade: '양호' });
ok('[2-1] status = done', r.status, 'done');
ok('[2-2] QSC', r.qsc, 96);
ok('[2-3] MS', r.cs, 98.7);
ok('[2-4] 종합', r.total, 87.2);
ok('[2-5] 등급', r.grade, '양호');

console.log('── 아무것도 안 온 매장 ──');
r = run({});
ok('[3-1] status = none', r.status, 'none');
ok('[3-2] 전부 비운다', [r.qsc, r.cs, r.total, r.grade, r.improve], [null, null, null, null, null]);

console.log('── MS 만 먼저 온 경우 (지난 달 자료를 늦게 넣는 등) ──');
r = run({ cs: 0.9, csGrade: '우수' });
ok('[4-1] partial', r.status, 'partial');
ok('[4-2] MS 가 살아 있다', r.cs, 90);
ok('[4-3] QSC 는 없다', r.qsc, null);

console.log('── ★0점도 점수다★ ──');
r = run({ qsc: 0, qscGrade: '미흡', cs: 0, csGrade: '미흡', improve: 0, total: 0, grade: '미흡' });
ok('[5-1] done — 0을 미점검으로 보지 않는다', r.status, 'done');
ok('[5-2] QSC 0 이 그대로', r.qsc, 0);
ok('[5-3] 종합 0 이 그대로', r.total, 0);

console.log('── 9월(옛 산식)에서도 같은 규칙 ──');
r = run({ qsc: 0.92, qscGrade: '양호', improve: 0.03 }, '2026-09');
ok('[6-1] partial', r.status, 'partial');
ok('[6-2] QSC 살아 있다', r.qsc, 92);
ok('[6-3] 9월 개선은 ★건수★로 읽는다 (0.03 → 3건)', r.improve, 3);

console.log('── 10월부터는 개선을 비율로 읽는다 ──');
r = run({ qsc: 0.92, improve: 0.5 }, '2026-10');
ok('[7-1] 0.5 → 50%', r.improve, 50);

console.log('\n' + (fail ? '★' + fail + '개 실패★' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(body + '\n' + HARNESS)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout or '', end='')
if r.stderr:
    print(r.stderr)
OUT.unlink(missing_ok=True)
sys.exit(r.returncode)
