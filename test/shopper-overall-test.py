# -*- coding: utf-8 -*-
"""saveShopper 가 MS_상세에 제대로 쓰는가 (2026-09-08 통합 뒤 다시 씀)

★Code.gs 의 진짜 saveShopper 를 잘라내서 돌린다★ (사본 아님).

★이 시험의 목적이 바뀌었다★
  종전에는 「쇼퍼_응답의 옛 '영수증' 열을 총평이 물려받는가」를 봤다. 2026-09-08 에
  쇼퍼_응답 + 쇼퍼_비고 가 MS_상세 한 시트로 합쳐지면서 그 구조 자체가 없어졌다.
  그래서 새 구조가 지켜야 할 것을 본다.

보는 것:
  · 한 제출이 ★문항 수만큼 줄★이 되는가 (비고 없는 문항도 남긴다)
  · 앞 14열이 ★QSC_상세와 같은 자리★인가 · 총평·연령대·주문내역이 15~21열인가
  · 제출 단위 값(총평·점수·경로)이 ★모든 줄에 같이★ 들어가는가 — MS 점수 계산이 그것을 쓴다
  · ★최신이 맨 위★로 들어가는가 (insertRowsBefore(2))
  · 문항 환산 점수·코드·유형이 바르게 채워지는가
  · 총평이 비어도 줄은 그대로 남는가
"""
import io, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_shopover.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cutconst(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('const %s ' % name))
    buf = []
    for j in range(st, len(lines)):
        buf.append(lines[j])
        if lines[j].rstrip().endswith(';'):
            break
    return '\n'.join(buf)


body = '\n'.join([cutconst('MS_DETAIL'), cutconst('MS_HEADER'), cutconst('MS_COL'),
                  cut('msCodeOf'), cut('msConvert'), cut('msKindOf'),
                  cut('msPrepend'), cut('saveShopper')])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var ROWS = [];            // MS_상세 본문 (머리글 제외)
var HEADER = null;
var DASHBOARD_ID = '';    // 통합시트는 이 시험에서 다루지 않는다
function safeRow(r) { return r; }
function round1(n) { return Math.round(n * 10) / 10; }
function normStore(s) { return String(s == null ? '' : s).trim(); }
function sheet(ss, name, header) {
  HEADER = header;
  return {
    _name: name,
    getLastRow: function () { return ROWS.length + 1; },
    insertRowsBefore: function (at, n) {
      var blank = [];
      for (var i = 0; i < n; i++) blank.push(new Array(HEADER.length).fill(''));
      ROWS = blank.concat(ROWS);          // 2행 앞에 끼우면 본문 맨 앞이다
    },
    getRange: function (r, c, nr, nc) {
      return { setValues: function (vals) {
        for (var i = 0; i < vals.length; i++) ROWS[r - 2 + i] = vals[i];
      } };
    },
  };
}
function monthClosed() { return false; }          // 월중 — 매장 파일·통합시트는 미룬다
function writeStoreShopper() { return { ok: true }; }
function writeDashboard() { return { ok: true }; }
function shopperMonthAvg() { return 0; }
function dropDashCache() {} function dropStoreCache() {}
function yymm(d) { return d.slice(2, 4) + d.slice(5, 7); }
function opErr(a, e) { return String(e); }

function mkPayload(o) {
  o = o || {};
  var qs = o.answers || [
    { no: 1, text: '1-1. 인사를 건넸나요?', scale: 'yn', cat: '1. 입·퇴점 응대', answer: '예', memo: '' },
    { no: 2, text: '1-2. 눈을 맞췄나요?', scale: 'yn', cat: '1. 입·퇴점 응대', answer: '아니오', memo: '다른 곳을 봤어요' },
    { no: 3, text: '3-1. 설명이 충분했나요?', scale: '1-5', cat: '3. 메뉴 안내', answer: 4, memo: '' },
  ];
  return {
    submittedAt: o.at || '2026-10-05T10:00:00Z',
    date: o.date || '2026-10-05', time: o.time || '11:00', store: o.store || '금종제과',
    staff: '', order: o.order || '아메리카노', demographic: o.demo || '30대 여성',
    overall: o.overall === undefined ? '친절했습니다' : o.overall,
    result: { score: o.score === undefined ? 83.3 : o.score, answered: qs.length },
    answers: qs,
  };
}
function run(o, isSurvey) {
  ROWS = [];
  saveShopper({ getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; } },
              mkPayload(o), {}, !!isSurvey);
  return ROWS;
}

var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}

console.log('── 한 제출 = 문항 수만큼 줄 ──');
var r = run({});
ok('[1-1] 문항 3개 → 3줄', r.length, 3);
ok('[1-2] 비고 없는 문항도 남는다', r.filter(function (x) { return !x[MS_COL.memo - 1]; }).length, 2);
ok('[1-3] 머리글은 21열', HEADER.length, 21);

console.log('── 앞 14열이 QSC_상세와 같은 자리 ──');
ok('[2-1] 방문날짜', r[0][MS_COL.date - 1], '2026-10-05');
ok('[2-2] 방문시간', r[0][MS_COL.time - 1], '11:00');
ok('[2-3] 매장명', r[0][MS_COL.store - 1], '금종제과');
ok('[2-4] 코드', r[0][MS_COL.code - 1], '1-1');
ok('[2-5] 문항번호', r[0][MS_COL.no - 1], 1);
ok('[2-6] 구분(카테고리)', r[0][MS_COL.cat - 1], '1. 입·퇴점 응대');
ok('[2-7] 문항', r[0][MS_COL.text - 1], '1-1. 인사를 건넸나요?');
ok('[2-8] 유형', r[0][MS_COL.kind - 1], '예/아니오');
ok('[2-9] 응답', r[0][MS_COL.answer - 1], '예');
ok('[2-10] 상태는 빈칸 (MS 에 없다)', r[0][MS_COL.state - 1], '');
ok('[2-11] 사진·NA사유도 빈칸', [r[0][MS_COL.photo - 1], r[0][MS_COL.naWhy - 1]], ['', '']);

console.log('── 문항 환산 점수 ──');
ok('[3-1] 예 → 1', r[0][MS_COL.score - 1], 1);
ok('[3-2] 아니오 → 0', r[1][MS_COL.score - 1], 0);
ok('[3-3] 4점 → 0.75', r[2][MS_COL.score - 1], 0.75);
ok('[3-4] 척도 문항의 유형', r[2][MS_COL.kind - 1], '5점 척도');
ok('[3-5] 비고가 들어간다', r[1][MS_COL.memo - 1], '다른 곳을 봤어요');

console.log('── 제출 단위 값은 모든 줄에 같이 ──');
ok('[4-1] 제출시각', r.map(function (x) { return x[MS_COL.at - 1]; }),
   ['2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z', '2026-10-05T10:00:00Z']);
ok('[4-2] ★제출점수★ — MS 점수 계산이 이 열을 쓴다',
   r.map(function (x) { return x[MS_COL.total - 1]; }), [83.3, 83.3, 83.3]);
ok('[4-3] 응답수', r[0][MS_COL.answered - 1], 3);
ok('[4-4] 총평', r[0][MS_COL.overall - 1], '친절했습니다');
ok('[4-5] 연령대·성별', r[0][MS_COL.demo - 1], '30대 여성');
ok('[4-6] 주문내역', r[0][MS_COL.order - 1], '아메리카노');
ok('[4-7] 입력경로 — 관리자', r[0][MS_COL.route - 1], '관리자 입력');

console.log('── 익명 설문은 입력경로를 서버가 정한다 ──');
var s = run({}, true);
ok('[5-1] 고객 직접', s[0][MS_COL.route - 1], '고객 직접');

console.log('── 총평이 비어도 줄은 남는다 ──');
var e = run({ overall: '' });
ok('[6-1] 3줄 그대로', e.length, 3);
ok('[6-2] 총평만 빈칸', e[0][MS_COL.overall - 1], '');

console.log('── 최신이 맨 위 ──');
/* 같은 시트에 두 번 저장하면 나중 것이 앞에 와야 한다 */
ROWS = [];
saveShopper({ getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; } },
            mkPayload({ at: 'FIRST', score: 60 }), {}, false);
saveShopper({ getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; } },
            mkPayload({ at: 'SECOND', score: 90 }), {}, false);
ok('[7-1] 6줄', ROWS.length, 6);
ok('[7-2] ★나중 제출이 맨 위★', ROWS[0][MS_COL.at - 1], 'SECOND');
ok('[7-3] 옛 제출은 아래에', ROWS[3][MS_COL.at - 1], 'FIRST');
ok('[7-4] 묶음 안에서는 문항 순서 그대로',
   [ROWS[0][MS_COL.no - 1], ROWS[1][MS_COL.no - 1], ROWS[2][MS_COL.no - 1]], [1, 2, 3]);

console.log('── 점수가 없어도(무응답) 죽지 않는다 ──');
var n = run({ score: null, answers: [
  { no: 1, text: '1-1. 인사', scale: 'yn', cat: 'A', answer: null, memo: '' }] });
ok('[8-1] 한 줄', n.length, 1);
ok('[8-2] 응답 빈칸', n[0][MS_COL.answer - 1], '');
ok('[8-3] 점수 빈칸', n[0][MS_COL.score - 1], '');
ok('[8-4] 제출점수도 빈칸', n[0][MS_COL.total - 1], '');

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
