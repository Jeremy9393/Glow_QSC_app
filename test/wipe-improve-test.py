# -*- coding: utf-8 -*-
"""wipeImprove 시험 — Code.gs 의 ★진짜 함수★를 잘라내 node 로 돌린다 (사본 아님)"""
import io, re, sys, subprocess
from pathlib import Path
SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_wipe.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = src.split('\n')


def cut(name):
    """맨 앞칸의 function <name> 부터 맨 앞칸의 } 까지"""
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝을 못 찾음' % name)


body = cut('improveScan') + '\n\n' + cut('wipeImprove')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ── 가짜 시트 ───────────────────────────────────────────────
// 열: 1=A 2=B(기한) 3=C(상태) 4=D(개선전사진) ... 10=J(개선요청) 11~15=K~O(매장몫)
//     16=P(비고) 17=Q(검수) 18=R(재제출기한) 19=S(감점제외) 20=T(이월)
var CLEARED = [];
function mkSheet(rows) {
  return {
    _v: rows,
    getMaxRows: function () { return rows.length; },
    getLastRow: function () { return rows.length; },
  };
}
function grid(sh, r, c, nr, nc) {
  if (nr <= 0 || nc <= 0) return null;
  return {
    getValues: function () {
      var o = [];
      for (var i = 0; i < nr; i++) {
        var row = [];
        for (var j = 0; j < nc; j++) {
          var rr = sh._v[r - 1 + i] || [];
          row.push(rr[c - 1 + j] === undefined ? '' : rr[c - 1 + j]);
        }
        o.push(row);
      }
      return o;
    },
    clearContent: function () {
      for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) {
        var rr = sh._v[r - 1 + i]; if (!rr) continue;
        if (String(rr[c - 1 + j] || '') !== '') CLEARED.push((r + i) + ',' + (c + j));
        rr[c - 1 + j] = '';
      }
    },
  };
}
function tableEndRow(sh) { return sh._v.length; }
var IC_NEW = { ok: true, row0: 2, due: 2, state: 3, body: 10, isNew: true,
               audit: 17, redo: 18, waive: 19, roll: 20 };
var IC_OLD = { ok: true, row0: 2, due: 2, state: 3, body: 10, isNew: false,
               audit: 0, redo: 0, waive: 0, roll: 0 };
var IC_MODE = IC_NEW;
function impCols(sh) { return IC_MODE; }

__BODY__

// ── 시험 ────────────────────────────────────────────────────
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  ✗    ' + name + (extra ? '   ' + extra : '')); }
}
function row(vals) { var r = new Array(21).fill(''); vals.forEach(function (p) { r[p[0] - 1] = p[1]; }); return r; }

// 머리글(1행) + 본문 2줄
function build(storeWrote, auditMark) {
  var head = row([[2, '기한'], [3, '상태'], [10, '개선요청사항'], [16, '비고']]);
  var r1 = row([[2, '10/10'], [4, '사진A'], [10, '냉장고 온도 기록 누락']]);
  var r2 = row([[2, '10/12'], [4, '사진B'], [10, '바닥 배수구 청소']]);
  if (storeWrote) { r1[10] = '2026-10-08'; r1[13] = '완료사진'; }   // K열·N열 = 매장 몫
  if (auditMark) { r1[16] = '확정'; r1[18] = 'Y'; }                 // Q열(검수) · S열(감점제외)
  return mkSheet([head, r1, r2]);
}

console.log('\n[1] 매장이 아무것도 안 적은 경우 — 종전과 같이 지운다');
CLEARED = [];
var sh = build(false, false);
var w = wipeImprove(sh);
ok('ok=true', w.ok === true, JSON.stringify(w));
ok('2줄 지움', w.n === 2, 'n=' + w.n);
ok('J열(개선요청) 비었다', sh._v[1][9] === '' && sh._v[2][9] === '');
ok('D열(사진) 비었다', sh._v[1][3] === '' && sh._v[2][3] === '');

console.log('\n[2] ★매장이 답을 적은 경우 — 멈추지 않고 그것도 지운다★ (2026-08-27 결정)');
CLEARED = [];
sh = build(true, false);
w = wipeImprove(sh);
ok('★ok=true (종전에는 false 였다)★', w.ok === true, JSON.stringify(w));
ok('매장이 적은 줄 수를 알려준다', w.touched === 1, 'touched=' + w.touched);
ok('★K열(매장 예정일) 지워졌다★', sh._v[1][10] === '', '남음: ' + JSON.stringify(sh._v[1][10]));
ok('★N열(매장 완료사진) 지워졌다★', sh._v[1][13] === '', '남음: ' + JSON.stringify(sh._v[1][13]));
ok('J열도 지워졌다', sh._v[1][9] === '');

console.log('\n[3] 검수 칸(10월 서식) — Q·S 도 지운다');
CLEARED = [];
sh = build(false, true);
w = wipeImprove(sh);
ok('★Q열(검수) 지워졌다★', sh._v[1][16] === '', '남음: ' + JSON.stringify(sh._v[1][16]));
ok('★S열(감점제외) 지워졌다★', sh._v[1][18] === '', '남음: ' + JSON.stringify(sh._v[1][18]));
ok('네 칸을 훑었다', w.extra === 4, 'extra=' + w.extra);

console.log('\n[4] 옛 서식(검수 칸 없음) — 건드리지 않는다');
IC_MODE = IC_OLD;
CLEARED = [];
sh = build(true, false);
sh._v[1][16] = '남아야함';          // 옛 서식에서는 Q가 검수가 아니다
w = wipeImprove(sh);
ok('ok=true', w.ok === true);
ok('매장 몫은 지웠다', sh._v[1][10] === '');
ok('★검수 칸을 모른다면 안 건드린다★', sh._v[1][16] === '남아야함', '값: ' + JSON.stringify(sh._v[1][16]));
ok('extra=0', w.extra === 0, 'extra=' + w.extra);
IC_MODE = IC_NEW;

console.log('\n[5] 비고(P)는 건드리지 않는다 — 누구 칸인지 확인 안 됨');
CLEARED = [];
sh = build(true, true);
sh._v[1][15] = '본사 메모';
w = wipeImprove(sh);
ok('P열 그대로', sh._v[1][15] === '본사 메모', '값: ' + JSON.stringify(sh._v[1][15]));

console.log('\n[6] 개선요청이 원래 없으면 조용히 끝난다');
CLEARED = [];
sh = mkSheet([row([[2, '기한'], [10, '개선요청사항']])]);
w = wipeImprove(sh);
ok('ok=true · n=0', w.ok === true && w.n === 0, JSON.stringify(w));
ok('아무것도 안 지웠다', CLEARED.length === 0, JSON.stringify(CLEARED));

console.log('\n' + (fail ? '★ 실패 ' + fail + '건 ★' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(HARNESS.replace('__BODY__', body))
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:2000])
sys.exit(r.returncode)
