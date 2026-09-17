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

import os
# QSC_SRC 환경변수로 다른 Code.gs(예: 고치기 전 사본)를 가리키면 대조군 실행이 된다 (2026-09-17)
SRC = Path(os.environ.get('QSC_SRC') or r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\_도구\node\node.exe')
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
                  cut('monthClosed'), cut('attachAdminLive'), cut('dropStoreCache')])
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
/* 60초 캐시(2026-09-17 ③-5) — 키를 매장 캐시와 따로 두는지, 제출·되돌리기의 dropStoreCache 가 이 키도 버리는지 본다 */
var CACHE = {};
var CacheService = { getScriptCache: function () { return {
  get: function (k) { return Object.prototype.hasOwnProperty.call(CACHE, k) ? CACHE[k] : null; },
  put: function (k, v) { CACHE[k] = String(v); },
  removeAll: function (ks) { ks.forEach(function (k) { delete CACHE[k]; }); } }; } };
function epoch() { return '1'; }
function normStore(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }
var OPENS = 0;                  // 응답 시트를 몇 번 열었나
function ssOpen(id) { return SpreadsheetApp.openById(id); }
var SpreadsheetApp = { openById: function () {
  OPENS++;
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
  if (!opts.keepCache) CACHE = {};        // 시험마다 새 실행처럼 — 캐시 시험([8])만 keepCache
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

console.log('── 60초 캐시 (2026-09-17 ③-5) ──');
CACHE = {}; OPENS = 0;
ok('[8-1] 첫 호출은 시트를 연다', (run({ keepCache: true }), OPENS), 1);
ok('[8-2] ★두 번째 호출은 시트를 안 연다★ (캐시)', (run({ keepCache: true, avg: 70 }), OPENS), 1);
ok('[8-3] 캐시에 담긴 값(88)이 그대로 — 60초 안 재조회 없음', run({ keepCache: true, avg: 70 }).msLive, 88);
ok('[8-4] 캐시 키는 매장 캐시(store:)와 따로다', Object.keys(CACHE).filter(function (k) { return k.indexOf('mslive:') === 0; }).length, 1);
ok('[8-5] ★매장 계정에는 캐시가 있어도 안 간다★', run({ keepCache: true, admin: false }).msLive, undefined);
dropStoreCache('금종제과', '2610');
ok('[8-6] 제출·되돌리기의 dropStoreCache 가 이 키도 버린다', Object.keys(CACHE).length, 0);
ok('[8-7] 버린 뒤엔 다시 읽는다(70)', run({ keepCache: true, avg: 70 }).msLive, 70);
ok('[8-8] 그때 시트를 다시 연다', OPENS, 2);
CACHE = {}; OPENS = 0;
run({ keepCache: true, avg: 0 }); run({ keepCache: true, avg: 0 });
ok('[8-9] 응답 없음(0)도 담는다 — 없는 달을 매번 다시 읽지 않는다', OPENS, 1);

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
