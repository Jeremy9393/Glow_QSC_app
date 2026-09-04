# -*- coding: utf-8 -*-
"""관리자에게만 「이번 달 잠정 MS」 (2026-09-04)

★Code.gs 의 진짜 attachAdminLive 를 잘라내서 돌린다★ (사본 아님).

무엇을 막으려고 만들었나 —
  MS 점수는 매장 파일에 말일 23시에 들어간다(매장이 월중에 「끝났다」로 읽지 않게).
  그동안 본사는 그 매장의 MS를 못 본다. 그래서 관리자에게만 쇼퍼_응답에서 계산해 얹는다.
  ★매장에게 새어 나가면 늦추는 장치 전체가 무의미해진다★ — 그래서 시험의 절반이 「안 가는가」다.

보는 것:
  · 매장 계정에는 ★값이 아예 안 실리는가★ (화면에서 가리는 것이 아니라 서버가 안 보낸다)
  · 관리자 + 월중 → 잠정 MS·종합이 실리는가 · 종합 산식이 시트 수식과 같은가
  · 관리자 + 말일 지남 → 안 실린다 (이미 진짜 점수가 매장 파일에 있다)
  · 쇼퍼 응답이 없으면 안 실린다 (0점을 실으면 「0점 받았다」로 읽힌다)
  · 개선율이 비면 시트와 똑같이 100%로 친다
  · 시트를 못 열어도 화면은 그대로 뜬다 (덤이지 본체가 아니다)
"""
import io, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_adminlive.js'
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


body = '\n'.join([cut('daysInMonth'), cutconst('MONTH_OPEN_HOUR'), cutconst('MS_DEFER_FROM'),
                  cut('monthClosed'), cut('attachAdminLive')])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var NOW = '2026-10-15 10';        // 시트 타임존 기준 '지금'
var Utilities = { formatDate: function (d, tz, fmt) {
  if (fmt === 'yyyy-MM-dd HH') return NOW;
  if (fmt === 'yyyy-MM') return NOW.slice(0, 7);
  return NOW;
} };
var ADMIN_MENU = 'accounts';
var SPREADSHEET_ID = 'fake';
var IS_ADMIN = true;            // can() 이 돌려줄 값
var AVG = 88;                   // shopperMonthAvg 가 돌려줄 값 (0~100)
var SHEET_OK = true;            // 쇼퍼_응답 시트가 있는가
var OPEN_THROWS = false;        // 시트 열기가 터지는가

function can(role, menu, act) { return { allow: (menu === ADMIN_MENU && IS_ADMIN) }; }
function fileTz() { return 'Asia/Seoul'; }
function round1(v) { return Math.round(v * 10) / 10; }
function shopperMonthAvg(sh, store, dateStr, tz) { return AVG; }
var SpreadsheetApp = { openById: function () {
  if (OPEN_THROWS) throw new Error('시트를 열 수 없습니다');
  return { getSheetByName: function (n) { return SHEET_OK ? { fake: n } : null; } };
} };

// ══ 시험 ═══════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; }
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}
function run(opts) {
  opts = opts || {};
  NOW = opts.now || '2026-10-15 10';
  IS_ADMIN = (opts.admin !== false);
  AVG = (opts.avg === undefined) ? 88 : opts.avg;
  SHEET_OK = (opts.sheet !== false);
  OPEN_THROWS = !!opts.throws;
  var out = { summary: { hygiene: opts.qsc === undefined ? 92 : opts.qsc,
                         rate: opts.rate === undefined ? 0.5 : opts.rate } };
  attachAdminLive(out, { role: 'x' }, '금종제과', opts.ym || '2610');
  return out.summary;
}

console.log('── 매장 계정에는 값이 안 간다 ──');
var s = run({ admin: false });
ok('[1-1] admin 은 false 로 실린다', s.admin, false);
ok('[1-2] msLive 가 아예 없다', s.msLive, undefined);
ok('[1-3] totalLive 도 없다', s.totalLive, undefined);

console.log('── 관리자 · 월중 ──');
s = run({});
ok('[2-1] admin true', s.admin, true);
ok('[2-2] 잠정 MS', s.msLive, 88);
// 92*0.6 + 88*0.3 + 0.5*100*0.1 = 55.2 + 26.4 + 5 = 86.6
ok('[2-3] 잠정 종합 = 시트 수식과 같은 산식', s.totalLive, 86.6);

console.log('── 관리자 · 그 달이 이미 끝났다 ──');
ok('[3-1] 말일 23시 지나면 안 싣는다 (진짜 점수가 이미 있다)',
   run({ now: '2026-10-31 23' }).msLive, undefined);
ok('[3-2] 지난 달도 안 싣는다', run({ ym: '2609', now: '2026-10-15 10' }).msLive, undefined);
ok('[3-3] 말일 22시에는 아직 싣는다', run({ now: '2026-10-31 22' }).msLive, 88);
ok('[3-4] 그래도 admin 표시는 남는다', run({ now: '2026-10-31 23' }).admin, true);

console.log('── 실을 것이 없을 때 ──');
ok('[4-1] 쇼퍼 응답 0건이면 안 싣는다 (0점으로 오해된다)', run({ avg: 0 }).msLive, undefined);
ok('[4-2] 쇼퍼_응답 시트가 없으면 안 싣는다', run({ sheet: false }).msLive, undefined);
ok('[4-3] QSC 가 아직 없으면 종합은 못 낸다', run({ qsc: null }).totalLive, undefined);
ok('[4-4] 그래도 MS 는 싣는다', run({ qsc: null }).msLive, 88);

console.log('── 개선율 ──');
// 92*0.6 + 88*0.3 + 1*100*0.1 = 55.2 + 26.4 + 10 = 91.6
ok('[5-1] 개선율이 비면 시트와 똑같이 100%로 친다', run({ rate: null }).totalLive, 91.6);
// 92*0.6 + 88*0.3 + 0*100*0.1 = 81.6
ok('[5-2] 개선율 0 은 0 으로 (100%로 치지 않는다)', run({ rate: 0 }).totalLive, 81.6);

console.log('── 터져도 화면은 뜬다 ──');
s = run({ throws: true });
ok('[6-1] 시트를 못 열어도 예외를 안 던진다', s.msLive, undefined);
ok('[6-2] admin 표시는 남는다', s.admin, true);

console.log('── 요약이 없는 응답 ──');
var out2 = { ok: true, exists: false };      // 탭이 없는 달
attachAdminLive(out2, { role: 'x' }, '금종제과', '2612');
ok('[7-1] summary 가 없으면 아무것도 안 만든다', out2.summary, undefined);

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
