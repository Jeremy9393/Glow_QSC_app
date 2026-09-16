# -*- coding: utf-8 -*-
"""「차기 월 목표」 상자 — ★병합 때문에 조용히 안 지워지던 것★ 시험 (2026-09-16)

★Code.gs 의 진짜 goalBoxIn · dropGoalBox · grid · colLetter 를 잘라내서 돌린다★ (사본 아님).

왜 생겼나 (2026-09-16 실물에서 잡음):
  goalBoxIn 이 상자를 ★6줄 × 2칸(L2:M7)으로 박아★ 두었는데, 실물의 병합은
  제목 L2:P2 · 값 M3:P4 · M5:P6 · M7:P9 로 ★그 밖까지 걸쳐 있었다★.
  좁은 범위에 breakApart 하면 부분 병합이라 실패하고(조용히 catch),
  clearContent 는 병합 칸을 못 건드린다 → ★「비웠습니다」라고 보고하면서 아무것도 안 지운다★.
  admin.dropGoal 도 makeMonthTabIn 도 이 거짓 성공을 받고 있었다(2026-09-03~09-16).

보는 것:
  · 병합을 따라 지울 범위를 넓히는가 (L2:M7 → L2:P9)
  · 넓힌 범위로 지우면 실제로 라벨이 사라지는가
  · ★지운 뒤 다시 읽어 확인하는가★ — 안 지워졌으면 성공이라고 하지 않는가
  · 울타리: 개선요청 표 머리글 줄까지 내려가는 병합은 따라가지 않는가
  · 병합이 아예 없는 시트에서는 종전과 같은가 (6줄 × 2칸)
  · 병합을 못 읽는 시트에서도 죽지 않는가
"""
import io, sys, subprocess
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_goalbox.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

text = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = text.split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = '\n\n'.join(cut(n) for n in ['colLetter', 'grid', 'goalBoxIn', 'dropGoalBox'])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 시트 ═══════════════════════════════════════════════
// cells['2,12'] = 값.  merges = [[r1,c1,r2,c2], …]  (실물 도넛정수 원본 탭 그대로)
function mkSheet(cells, merges, opt) {
  opt = opt || {};
  var sh = {
    _cells: cells, _merges: merges, _broke: 0, _hr: opt.hr || 11,
    getMaxRows: function () { return opt.rows || 988; },
    getMaxColumns: function () { return opt.cols || 32; },
    getRange: function (r, c, nr, nc) { return mkRange(sh, r, c, nr, nc); },
  };
  return sh;
}
function key(r, c) { return r + ',' + c; }
function mkRange(sh, r, c, nr, nc) {
  var rng = {
    _r: r, _c: c, _nr: nr, _nc: nc,
    getRow: function () { return r; }, getColumn: function () { return c; },
    getNumRows: function () { return nr; }, getNumColumns: function () { return nc; },
    getA1Notation: function () { return colLetter(c) + r + ':' + colLetter(c + nc - 1) + (r + nr - 1); },
    getValues: function () {
      var out = [];
      for (var i = 0; i < nr; i++) { var row = [];
        for (var j = 0; j < nc; j++) row.push(sh._cells[key(r + i, c + j)] || '');
        out.push(row); }
      return out;
    },
    getMergedRanges: function () {
      if (sh._merges === null) throw new Error('병합을 못 읽습니다');
      var out = [];
      sh._merges.forEach(function (m) {
        // 범위와 한 칸이라도 겹치면 돌려준다 (구글과 같은 규칙)
        if (m[2] < r || m[0] > r + nr - 1 || m[3] < c || m[1] > c + nc - 1) return;
        out.push(mkRange(sh, m[0], m[1], m[2] - m[0] + 1, m[3] - m[1] + 1));
      });
      return out;
    },
    /* ★구글의 실제 동작을 흉내 낸다★ — 범위 밖으로 걸친 병합은 깨지 않고 던진다 */
    breakApart: function () {
      var bad = sh._merges.some(function (m) {
        var hit = !(m[2] < r || m[0] > r + nr - 1 || m[3] < c || m[1] > c + nc - 1);
        var inside = m[0] >= r && m[2] <= r + nr - 1 && m[1] >= c && m[3] <= c + nc - 1;
        return hit && !inside;
      });
      if (bad) throw new Error('부분 병합은 깰 수 없습니다');
      sh._merges = sh._merges.filter(function (m) {
        return (m[2] < r || m[0] > r + nr - 1 || m[3] < c || m[1] > c + nc - 1);
      });
      sh._broke++;
    },
    /* ★핵심★ — 범위 밖으로 걸친 병합 칸은 ★조용히 안 지워진다★ (이것이 이번 버그의 실체) */
    clearContent: function () {
      for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) {
        var rr = r + i, cc = c + j;
        var crossing = sh._merges.some(function (m) {
          var inCell = m[0] <= rr && rr <= m[2] && m[1] <= cc && cc <= m[3];
          var inside = m[0] >= r && m[2] <= r + nr - 1 && m[1] >= c && m[3] <= c + nc - 1;
          return inCell && !inside;
        });
        if (!crossing) delete sh._cells[key(rr, cc)];
      }
    },
    clearDataValidations: function () {}, clearFormat: function () {},
  };
  return rng;
}
function impCols(sh) { return { ok: true, hr: sh._hr, row0: sh._hr + 1 }; }

// 실물 도넛정수 원본 탭의 차기 월 목표 구역
function realCells() {
  var c = {};
  c[key(2, 12)] = '차기 월 목표'; c[key(3, 12)] = '위생'; c[key(5, 12)] = 'CS'; c[key(7, 12)] = '종합';
  c[key(11, 12)] = '담당자'; c[key(11, 13)] = '예정일\n개선 진행 내용';   // 표 머리글 — 남아야 한다
  c[key(2, 4)] = '월 QSC 현황';                                          // 요약 제목 — 남아야 한다
  return c;
}
var REAL_MERGES = [[2,12,2,16],[3,12,4,12],[3,13,4,16],[5,12,6,12],[5,13,6,16],[7,12,9,12],[7,13,9,16],[2,4,2,7]];

var pass = 0, fail = 0;
function ok(what, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + what); }
  else { fail++; console.log('  ✗ ' + what + '\n      받음: ' + g + '\n      기대: ' + w); }
}

console.log('── ① 병합을 따라 범위를 넓힌다 ──');
var sh = mkSheet(realCells(), REAL_MERGES.slice());
var box = goalBoxIn(sh);
ok('라벨은 L2 에서 찾는다', [box.row, box.col], [2, 12]);
ok('보여 주는 상자는 종전대로 6줄 × 2칸', [box.rows, box.cols], [6, 2]);
ok('★지울 범위는 병합을 따라 L2:P9 로 넓어진다★',
   [box.wipe.row, box.wipe.col, box.wipe.rows, box.wipe.cols], [2, 12, 8, 5]);

console.log('── ② 넓힌 범위로 지우면 실제로 사라진다 ──');
sh = mkSheet(realCells(), REAL_MERGES.slice());
var r = dropGoalBox(sh);
ok('성공이라고 답한다', r.hit, true);
ok('지운 자리를 L2:P9 로 적는다', r.a1, 'L2:P9');
ok('★차기 월 목표 라벨이 사라졌다★', sh._cells[key(2, 12)], undefined);
ok('위생·CS·종합 라벨도 사라졌다',
   [sh._cells[key(3, 12)], sh._cells[key(5, 12)], sh._cells[key(7, 12)]], [undefined, undefined, undefined]);
ok('★개선요청 표 머리글(11행)은 그대로★',
   [sh._cells[key(11, 12)], sh._cells[key(11, 13)]], ['담당자', '예정일\n개선 진행 내용']);
ok('★요약 제목 D2 는 그대로★', sh._cells[key(2, 4)], '월 QSC 현황');
ok('다시 찾으면 표가 없다', goalBoxIn(sh), null);

console.log('── ③ 종전 범위(6줄×2칸)였다면 어떻게 되는가 — ★거짓 성공을 잡아내는가★ ──');
sh = mkSheet(realCells(), REAL_MERGES.slice());
var narrow = goalBoxIn(sh);
delete narrow.wipe;                       // 2026-09-15 까지의 동작을 그대로 재현
var rng = grid(sh, narrow.row, narrow.col, narrow.rows, narrow.cols);
try { rng.breakApart(); } catch (e) { }
rng.clearContent();
ok('★좁은 범위로는 라벨이 안 지워진다 (이것이 버그의 실체)★', sh._cells[key(2, 12)], '차기 월 목표');
sh = mkSheet(realCells(), REAL_MERGES.slice());
var saved = goalBoxIn;
goalBoxIn = function (s) { var b = saved(s); if (b) delete b.wipe; return b; };   // 좁게 잡도록 되돌린다
r = dropGoalBox(sh);
ok('★그때는 성공이라고 답하지 않는다★', r.hit, false);
ok('어디가 남았는지 적어 준다', r.why.indexOf('L2') >= 0, true);
goalBoxIn = saved;

console.log('── ④ 울타리 — 표 머리글까지 내려가는 병합은 안 따라간다 ──');
var big = REAL_MERGES.slice(); big.push([7, 13, 11, 16]);   // 11행(머리글)까지 걸친 병합
sh = mkSheet(realCells(), big);
box = goalBoxIn(sh);
ok('★머리글 줄(11)을 넘지 않는다★', box.wipe.row + box.wipe.rows - 1 <= 10, true);

console.log('── ⑤ 병합이 없는 시트 · 못 읽는 시트 ──');
sh = mkSheet(realCells(), []);
box = goalBoxIn(sh);
ok('병합이 없으면 종전과 같다 (6줄 × 2칸)',
   [box.wipe.rows, box.wipe.cols], [6, 2]);
sh = mkSheet(realCells(), null);           // getMergedRanges 가 던진다
box = goalBoxIn(sh);
ok('★병합을 못 읽어도 죽지 않는다★', box !== null, true);
ok('그때는 종전 범위로 물러선다', box.wipe ? [box.wipe.rows, box.wipe.cols] : [box.rows, box.cols], [6, 2]);

console.log('\n통과 ' + pass + ' · 실패 ' + fail);
if (fail) process.exit(1);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout or '')
if r.stderr:
    print(r.stderr)

sp, sf = 0, 0


def src_ok(what, cond):
    global sp, sf
    if cond:
        sp += 1
        print('  ✓ %s' % what)
    else:
        sf += 1
        print('  ✗ %s' % what)


print('── 소스 검사 ──')
g = text.split('function goalBoxIn')[1].split('\nfunction ')[0]
d = text.split('function dropGoalBox')[1].split('\nfunction ')[0]
src_ok('goalBoxIn 이 병합을 보고 wipe 범위를 낸다', 'getMergedRanges()' in g and 'box.wipe' in g)
src_ok('★넓히는 데 울타리가 있다★ (개선요청 표 머리글 위까지)', 'rowCap' in g)
src_ok('dropGoalBox 가 wipe 범위를 지운다', 'box.wipe || box' in d)
src_ok('★지운 뒤 다시 읽어 확인한다★', 'goalBoxIn(sh)' in d and 'still' in d)

print('\n소스 검사 통과 %d · 실패 %d' % (sp, sf))
try:
    OUT.unlink()
except OSError:
    pass
sys.exit(1 if (r.returncode or sf) else 0)
