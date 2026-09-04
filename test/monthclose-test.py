# -*- coding: utf-8 -*-
"""월말 반영 — 매장 파일 MS점수를 그 달 말일 23시에 연다 (2026-09-04)

★Code.gs 의 진짜 monthClosed · daysInMonth · setTotalFormula 를 잘라내서 돌린다★ (사본 아님).

보는 것:
  · 말일 23시 ★전★에는 안 열리고, 23시가 되면 열리는가 (경계가 정확한가)
  · 지난 달은 즉시 열리는가 (늦게 넣는 자료를 숨길 이유가 없다)
  · 2월·윤년·31일 달의 말일을 맞게 아는가
  · 종합 수식이 ★QSC·MS 둘 다 있어야★ 계산하게 바뀌었는가 (개선율 빈칸은 만점 유지)
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_mclose.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cutconst(name):
    return next(l for l in lines if l.startswith('const %s ' % name))


body = '\n'.join([cut('daysInMonth'), cutconst('MONTH_OPEN_HOUR'),
                  cut('monthClosed'), cut('setTotalFormula')])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var NOW = '2026-10-15 10';                 // 시트 타임존 기준 '지금'
var Utilities = { formatDate: function (d, tz, fmt) {
  if (fmt === 'yyyy-MM-dd HH') return NOW;
  if (fmt === 'yyyy-MM') return NOW.slice(0, 7);
  return NOW;
} };
function ssTz() { return 'Asia/Seoul'; }

// setTotalFormula 용 가짜 시트
var FORMULA = null;
function labelMap() { return {}; }
function labelValue(lm, names) {
  var at = { 'QSC점수': { row: 3, col: 5 }, 'MS점수': { row: 3, col: 7 },
             '종합점수': { row: 3, col: 9 }, '개선율': { row: 9, col: 8 } };
  for (var i = 0; i < names.length; i++) {
    if (at[names[i]]) return { found: true, row: at[names[i]].row, col: at[names[i]].col };
  }
  return { found: false };
}
var L_QSC = ['QSC점수'], L_MS = ['MS점수'], L_TOT = ['종합점수'], L_RATE = ['개선율'];
function colLetter(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - 1 - m) / 26; } return s; }
function grid(sh, r, c) {
  return { getA1Notation: function () { return colLetter(c) + r; },
           setFormula: function (f) { FORMULA = f; } };
}
var SH = {};

// ══ 시험틀 ═══════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      나온 것: ' + g + '\n      바란 것: ' + w); }
}
function closedAt(now, visit) { NOW = now; return monthClosed(visit, 'Asia/Seoul'); }

// ── ① 말일 23시 경계 ────────────────────────────────────────
console.log('\n① 말일 23시가 경계다 (10월은 31일까지)');
ok('10/15 낮 — 아직 안 열린다', closedAt('2026-10-15 10', '2026-10-05'), false);
ok('10/20 점검이 끝나도 안 열린다', closedAt('2026-10-20 18', '2026-10-20'), false);
ok('10/31 22시 — 아직', closedAt('2026-10-31 22', '2026-10-05'), false);
ok('★10/31 23시 — 열린다★', closedAt('2026-10-31 23', '2026-10-05'), true);
ok('11/01 00시 — 10월 자료는 열려 있다', closedAt('2026-11-01 00', '2026-10-05'), true);

// ── ② 지난 달·다음 달 ───────────────────────────────────────
console.log('\n② 지난 달은 즉시 · 다음 달은 아직');
ok('11월에 9월 자료를 넣으면 즉시', closedAt('2026-11-10 09', '2026-09-20'), true);
ok('10월에 11월 자료(미래)는 아직', closedAt('2026-10-10 09', '2026-11-01'), false);
ok('날짜가 이상하면 안 연다', closedAt('2026-10-10 09', ''), false);

// ── ③ 달마다 말일이 다르다 ──────────────────────────────────
console.log('\n③ 말일을 맞게 아는가');
ok('2월 28일 (2026년)', daysInMonth('2026-02'), 28);
ok('2월 29일 (2028년 윤년)', daysInMonth('2028-02'), 29);
ok('2100년은 윤년이 아니다', daysInMonth('2100-02'), 28);
ok('2000년은 윤년이다', daysInMonth('2000-02'), 29);
ok('4월은 30일', daysInMonth('2026-04'), 30);
ok('★2/28 23시에 열린다★', closedAt('2026-02-28 23', '2026-02-10'), true);
ok('2/28 22시엔 아직', closedAt('2026-02-28 22', '2026-02-10'), false);
ok('윤년 2/28 23시엔 아직 (29일이 남았다)', closedAt('2028-02-28 23', '2028-02-10'), false);
ok('윤년 2/29 23시에 열린다', closedAt('2028-02-29 23', '2028-02-10'), true);

// ── ④ 종합 수식 ─────────────────────────────────────────────
console.log('\n④ 종합점수 수식 — QSC·MS 둘 다 있어야');
setTotalFormula(SH);
ok('둘 다 없을 때가 아니라 ★둘 다 있어야★ 계산', /COUNT\(E3,G3\)<2/.test(FORMULA), true);
ok('옛 규칙(=0)이 남아 있지 않다', /COUNT\([^)]*\)=0/.test(FORMULA), false);
ok('가중치는 그대로', /E3\*0\.6\+G3\*0\.3/.test(FORMULA), true);
ok('★개선율 빈칸은 만점★ (0건인 매장을 벌하지 않는다)', /IF\(H9="",1,H9\)\*0\.1/.test(FORMULA), true);

console.log('\n' + (fail ? '✗ ' + fail + '개 실패 · ' : '✓ 전부 통과 · ') + pass + '개 통과');
process.exit(fail ? 1 : 0);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:2000])
OUT.unlink(missing_ok=True)
sys.exit(r.returncode)
