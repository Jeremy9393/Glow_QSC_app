# -*- coding: utf-8 -*-
"""개선요청 표 — 서식을 끝 줄까지 편다 (2026-09-08)

★Code.gs 의 진짜 spreadImproveRows 를 잘라내서 돌린다★ (사본 아님).

담당자 지적 (2026-09-07 · 그때 미뤄졌다):
  *"현재 서식이 원본을 기준으로 4개만 있는데 / 개선요청 건수에 맞게 서식 자동생성 하게
    못만들어? / 지금 시트 보면 5번째껀 서식이 망가져있어"*

무엇이 문제였나 —
  서식(테두리·사진칸 병합·담당부서 드롭다운)을 만드는 코드가 ★어디에도 없었다★.
  원본 탭을 copyTo 로 복제할 때만 따라오는데, 원본에 4줄만 그려져 있으면 새 탭도 4줄이다.
  그런데 표의 끝은 요약칸 `=COUNTA(J12:J38)` 이 정하고(tableEndRow), 쓰기 경로는
  그 끝까지 값을 얹는다 → ★5번째 줄부터 값은 있고 서식은 없다★.

★이 시험이 막으려는 것★
  ① 표 범위 ★밖★까지 서식이 번지는 것 — 오른쪽에 「차기 월 목표」가 있던 파일이 있다
  ② 병합을 빠뜨리는 것 — 사진 칸(D:I)이 풀리면 값이 조용히 버려진다
     (writeStoreQscInto 주석: "E~I 값은 조용히 버려지고… O열이 빈 값으로 덮여 지워진다")
  ③ 이미 병합된 줄에 또 merge 해서 터지는 것
  ④ 서식 펴기가 실패했을 때 ★탭 만들기 자체가 막히는 것★ — 서식은 덤이다
  ⑤ 날짜서식·상태 수식보다 ★나중에★ 불려 그것들을 덮는 것
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_impfmt.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = cut('spreadImproveRows')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

# ★부르는 순서를 자리별로 본다★ — 날짜서식보다 먼저여야 그 위에 다시 깔린다
UP = cut('upgradeMonthTab')
i_spread = UP.find('spreadImproveRows(sh, c, plan);')
i_date = UP.find("setNumberFormat('yyyy-mm-dd')")
i_state = UP.find('.setFormulas(fs)')
ORDER_OK = (0 <= i_spread < i_date) and (0 <= i_spread < i_state)

HARNESS = r'''
// ══ 가짜 시트 ═══════════════════════════════════════════════
var LOG = [];          // 무슨 일을 했는지 순서대로
var MERGED = {};       // 'r,c,w' → true (이미 병합된 칸)
var THROW_ON_COPY = false;

function rangeObj(r, c, nr, nc) {
  return {
    _r: r, _c: c, _nr: nr, _nc: nc,
    copyTo: function (dest, opt) {
      if (THROW_ON_COPY) throw new Error('가짜 실패');
      LOG.push({ act: 'copyTo', from: [r, c, nr, nc],
                 to: [dest._r, dest._c, dest._nr, dest._nc], opt: opt });
    },
    getMergedRanges: function () {
      /* 첫 줄(견본)에는 미리 심어 둔 병합을 돌려주고, 그 밖에는 MERGED 를 본다 */
      var out = [];
      for (var k in MERGED) {
        var p = k.split(',').map(Number);
        if (p[0] === r && p[1] >= c && p[1] + p[2] - 1 <= c + nc - 1) {
          out.push({ getColumn: function () { return p[1]; },
                     getNumColumns: function () { return p[2]; } });
        }
      }
      return out;
    },
    merge: function () {
      MERGED[r + ',' + c + ',' + nc] = true;
      LOG.push({ act: 'merge', at: [r, c, nc] });
    },
  };
}
function mkSheet() {
  return {
    getRange: function (r, c, nr, nc) { return rangeObj(r, c, nr || 1, nc || 1); },
    /* ★행 높이★ (2026-09-10) — copyTo(formatOnly) 는 셀 서식만 옮기므로 높이는 따로 건다.
       견본 줄은 34, 그 아래는 시트 기본값(21)이라고 본다. */
    getRowHeight: function (r) { return r === 12 ? 34 : 21; },
    setRowHeights: function (at, n, h) { LOG.push({ act: 'rowH', at: at, n: n, h: h }); },
  };
}
/* 표 자리 — 실제 새 서식과 같은 모양: 기한 B(2) · 상태 C(3) · 사진 D~I(4~9 병합) ·
   개선요청 J(10) · 담당부서 K(11) · 비고 O(15) · 검수 P~S(16~19) */
function mkCols(o) {
  o = o || {};
  return { ok: true, hr: 11, row0: o.row0 || 12, endRow: o.endRow === undefined ? 38 : o.endRow,
           due: 2, state: 3, body: 10, dept: 11, memo: 15,
           audit: 16, redo: 17, waive: 18, roll: 19 };
}

var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}
function run(o, seedMerges) {
  LOG = []; MERGED = {}; THROW_ON_COPY = !!(o && o.throws);
  if (seedMerges) for (var k in seedMerges) MERGED[k] = true;
  var plan = [];
  spreadImproveRows(mkSheet(), mkCols(o), plan);
  return { log: LOG, plan: plan };
}
function copies(r) { return r.log.filter(function (x) { return x.act === 'copyTo'; }); }
function merges(r) { return r.log.filter(function (x) { return x.act === 'merge'; }); }

console.log('── 서식 복제 범위 ──');
var r = run({}, { '12,4,6': true });          // 견본 줄에 D~I(4열 6칸) 병합
var cp = copies(r);
ok('[1-1] 복제는 한 번', cp.length, 1);
ok('[1-2] ★견본은 본문 첫 줄★', cp[0].from, [12, 2, 1, 18]);
ok('[1-3] ★둘째 줄부터 끝 줄까지★ (12행은 견본이라 뺀다)', cp[0].to, [13, 2, 26, 18]);
ok('[1-4] ★formatOnly★ — 값·수식은 안 옮긴다', cp[0].opt, { formatOnly: true });
/* 기한(2)부터 이월(19)까지 18칸. ★표 밖(20열 이후)으로 번지지 않는다★ —
   오른쪽에 「차기 월 목표」가 있던 파일이 있다 */
ok('[1-5] 폭은 기한~이월 18칸', cp[0].from[3], 18);

console.log('── 병합을 첫 줄 기준으로 되풀이한다 ──');
var mg = merges(r);
ok('[2-1] ★26줄에 병합을 건다★ (13~38행)', mg.length, 26);
ok('[2-2] 첫 병합은 13행 D열 6칸', mg[0].at, [13, 4, 6]);
ok('[2-3] 마지막은 38행', mg[mg.length - 1].at, [38, 4, 6]);
ok('[2-4] plan 에 남긴다', /서식·행 높이를 12행 기준으로 38행까지/.test(r.plan.join(' ')), true);

/* ★행 높이★ — 담당자 2026-09-10: "6번째 개선요청부터 행 높이가 설정 안된상태".
   사진 칸이 병합돼 있어 높이가 곧 사진 크기다 — 납작하면 사진이 안 보인다. */
console.log('── 행 높이도 견본 줄을 따라간다 ──');
function heights(x) { return x.log.filter(function (y) { return y.act === 'rowH'; }); }
var rh = heights(r);
ok('[2-5] 높이를 한 번 건다', rh.length, 1);
ok('[2-6] ★둘째 줄부터 끝 줄까지 · 견본 줄 높이(34)★', [rh[0].at, rh[0].n, rh[0].h], [13, 26, 34]);
ok('[2-7] 병합보다 먼저 건다 (병합이 터져도 높이는 남는다)',
   r.log.indexOf(rh[0]) < r.log.indexOf(merges(r)[0]), true);

console.log('── 이미 병합된 줄은 건드리지 않는다 (다시 merge 하면 터진다) ──');
r = run({}, { '12,4,6': true, '13,4,6': true, '14,4,6': true });
ok('[3-1] 이미 된 둘을 빼고 24줄', merges(r).length, 24);
ok('[3-2] 15행부터 시작', merges(r)[0].at[0], 15);

console.log('── 병합이 없는 표 ──');
r = run({});
ok('[4-1] 복제는 한다', copies(r).length, 1);
ok('[4-2] 병합은 안 한다', merges(r).length, 0);

console.log('── 한 칸짜리 병합은 무시한다 (병합이 아니다) ──');
r = run({}, { '12,4,1': true });
ok('[5-1] merge 를 부르지 않는다', merges(r).length, 0);

console.log('── 펼 것이 없을 때 ──');
ok('[6-1] 본문이 한 줄이면 아무것도 안 한다', run({ endRow: 12 }).log.length, 0);
ok('[6-2] 끝이 시작보다 앞이면 안 한다', run({ endRow: 11 }).log.length, 0);

console.log('── ★터져도 탭 만들기를 막지 않는다★ ──');
r = run({ throws: true });
ok('[7-1] 예외를 밖으로 안 던진다', true, true);   // 여기까지 왔으면 안 던진 것이다
ok('[7-2] plan 에 실패를 남긴다', /서식 펴기 실패/.test(r.plan.join(' ')), true);

console.log('\n' + (fail ? '★' + fail + '개 실패★' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(body + '\n' + HARNESS)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout or '', end='')
if r.stderr:
    print(r.stderr)
OUT.unlink(missing_ok=True)

print('── 부르는 순서 (upgradeMonthTab 안) ──')
if ORDER_OK:
    print('  ★날짜서식·상태 수식보다 먼저 부른다★ — 그래야 그 위에 다시 깔린다')
else:
    print('  ✗ ★순서가 틀렸다★ — spreadImproveRows 가 날짜서식/상태 수식보다 뒤에 있으면')
    print('      복제가 그것들을 덮어 상태 칸이 통째로 첫 줄 수식으로 바뀐다')
    print('      (spread=%d · date=%d · state=%d)' % (i_spread, i_date, i_state))
    sys.exit(1)

sys.exit(r.returncode)
