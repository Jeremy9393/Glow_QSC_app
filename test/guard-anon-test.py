# -*- coding: utf-8 -*-
"""무인증 덮어쓰기 차단 시험 (2026-08-27)

★Code.gs 의 진짜 guardResubmit 을 잘라내서 돌린다★ (사본 아님).

막으려는 것: 로그인 벽(AUTH_ENFORCE)을 끄면 qsc.submit·shopper.submit 이 토큰 없이 통과하고
(legacy), 무인증이면 권한 게이트도 건너뛴다. 그 상태로 overwrite:true 를 보내면
남의 매장 그 달 기록이 통째로 지워진다. 첫 제출은 막지 않고 '지우는 힘'만 막는다.
"""
import io, sys, subprocess
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_guard.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = cut('guardResubmit')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var PREV = [];              // prevSubmitsOf 가 돌려줄 것
var UNDO_CALLS = [];        // fnUndoSubmit 이 몇 번 불렸나 = 실제로 지웠나
function prevSubmitsOf() { return PREV; }
function improveBlocked() { return null; }
function fnUndoSubmit(ctx, p) {
  UNDO_CALLS.push(p);
  return { ok: true, done: ['(시험) 지웠다'], dirty: false };
}

__BODY__

// ══ 시험 ════════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  X    ' + n + (e ? '   ' + e : '')); } }
var ANON = { auth: false, id: '(무인증)', role: '' };
var USER = { auth: true, id: 'admin', role: '관리자' };
function reset() { PREV = [{ kind: 'qsc', date: '2026-10-05', time: '', route: '', who: '문수', score: 88 }]; UNDO_CALLS = []; }

console.log('\n[1] ★무인증 + overwrite → 거절하고 아무것도 안 지운다★');
reset();
var r = guardResubmit({}, 'qsc', { store: '금종제과', date: '2026-10-20', overwrite: true }, ANON, []);
ok('막았다', !!(r && r.ok === false), JSON.stringify(r));
ok('★한 번도 안 지웠다★', UNDO_CALLS.length === 0, '지운 횟수=' + UNDO_CALLS.length);
ok('로그인이 필요하다고 말한다', !!(r && String(r.error).indexOf('로그인') >= 0), JSON.stringify(r && r.error));

console.log('\n[2] ★무인증이어도 첫 제출은 막지 않는다★ (벽을 끈 목적을 살린다)');
PREV = []; UNDO_CALLS = [];
r = guardResubmit({}, 'qsc', { store: '금종제과', date: '2026-10-20' }, ANON, []);
ok('그냥 통과 (null)', r === null, JSON.stringify(r));

console.log('\n[3] 로그인했으면 종전 그대로 — 되묻기');
reset();
r = guardResubmit({}, 'qsc', { store: '금종제과', date: '2026-10-20' }, USER, []);
ok('CONFLICT 로 되묻는다', !!(r && r.code === 'CONFLICT'), JSON.stringify(r && r.code));
ok('아직 안 지웠다', UNDO_CALLS.length === 0, '지운 횟수=' + UNDO_CALLS.length);
ok('기존 기록을 함께 준다', !!(r && r.existing && r.existing.length === 1));

console.log('\n[4] 로그인 + 덮어쓰기 → 종전 그대로 지운다');
reset();
var done = [];
r = guardResubmit({}, 'qsc', { store: '금종제과', date: '2026-10-20', overwrite: true }, USER, done);
ok('통과시킨다 (null)', r === null, JSON.stringify(r));
ok('★한 번 지웠다★', UNDO_CALLS.length === 1, '지운 횟수=' + UNDO_CALLS.length);
ok('한 일을 화면으로 넘긴다', done.length === 1, JSON.stringify(done));

console.log('\n[5] ctx 가 아예 없어도 막는다 (안전한 쪽으로 실패)');
reset();
r = guardResubmit({}, 'qsc', { store: '금종제과', date: '2026-10-20', overwrite: true }, null, []);
ok('막았다', !!(r && r.ok === false), JSON.stringify(r));
ok('안 지웠다', UNDO_CALLS.length === 0, '지운 횟수=' + UNDO_CALLS.length);

console.log('\n[6] 쇼퍼도 같은 규칙');
PREV = [{ kind: 'shopper', date: '2026-10-05', time: '', route: '관리자 입력', who: '', score: 90 }];
UNDO_CALLS = [];
r = guardResubmit({}, 'shopper', { store: '금종제과', date: '2026-10-20', overwrite: true }, ANON, []);
ok('무인증이면 막는다', !!(r && r.ok === false));
ok('안 지웠다', UNDO_CALLS.length === 0, '지운 횟수=' + UNDO_CALLS.length);

console.log('\n' + (fail ? 'X 실패 ' + fail + '건' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(HARNESS.replace('__BODY__', body))
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:2000])
sys.exit(r.returncode)
