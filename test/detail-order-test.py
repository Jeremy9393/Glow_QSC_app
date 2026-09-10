# -*- coding: utf-8 -*-
"""QSC_회차·QSC_상세 — 최신이 맨 위 · 제출시각·제출점수 열 (2026-09-10)

★Code.gs 의 진짜 함수를 잘라내서 돌린다★ (사본 아님).

담당자 요청 원문:
  *"QSC_상세에 제출시각, 제출점수도 MS_상세 참고하여 열 추가"*
  *"그리고 모든 시트 가장 최신 입력된 자료가 제일 위로 오게 했는데 적용 안됨
    (제출 시각이 없어서 그런가? 그런거면 제출시각 전부 다 열 추가해)"*

무엇을 막으려고 만들었나 —
  ① ★쓰는 방향을 뒤집으면 읽는 쪽이 조용히 옛 자료를 본다★. MS_상세에서 이미 한 번 밟았다
     (submittedStores 에 fromTop 을 안 줘서 「이번 달 미제출」이 늘 26곳 전부로 나왔다).
     같은 함정이 QSC_회차에 그대로 있으므로 호출문을 시험으로 굳힌다.
  ② ★13번째 '사진' 칸★ — fnUndoSubmit 이 열 번호로 직접 읽는다. 새 열을 앞에 끼우면
     되돌리기가 사진을 못 찾고 드라이브에 영영 남는다. 자리를 시험으로 못 박는다.
  ③ 시트를 손으로 정렬해 두는 것으로는 안 된다 — 그 뒤 앱이 쓰는 줄은 여전히 맨 아래로 간다.
     담당자가 "정렬했는데 적용 안됨" 이라고 본 것이 이것이다.

보는 것:
  · prependRows 가 ★2행에 끼우는가★ · 묶음 안 순서를 뒤집지 않는가 · 열이 모자라면 넓히는가
  · QSC_상세 머리글이 16개이고 사진 13 · NA사유 14 · 제출시각 15 · 제출점수 16 인가
  · qscFixHeader 가 ★모자랄 때만★ 쓰는가
  · saveQsc 가 QSC_회차·QSC_상세 둘 다 prependRows 로 쓰는가
  · submittedStores 의 QSC_회차 호출에 ★fromTop★ 이 켜져 있는가
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_detailorder.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

gs = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = gs.split('\n')


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


# ── ① 소스를 직접 읽어 확인하는 것 (돌려 볼 수 없는 자리) ────────────────────
src_checks = []

# QSC_회차 호출에 fromTop(마지막 true) 이 붙어 있는가
m = re.search(r"submittedStores\(ss\.getSheetByName\('QSC_회차'\)[^)]*\)", gs)
src_checks.append(('QSC_회차 호출에 fromTop 이 켜져 있다',
                   bool(m) and m.group(0).rstrip(')').rstrip().endswith('true')))

# saveQsc 가 두 시트 모두 prependRows 로 쓰는가
sq = cut('saveQsc')
src_checks.append(('saveQsc 가 QSC_회차를 prependRows 로 쓴다', 'prependRows(sum,' in sq))
src_checks.append(('saveQsc 가 QSC_상세를 prependRows 로 쓴다', 'prependRows(det,' in sq))
# ★NA프리셋만 append 로 남는다★ — 매장마다 한 줄인 ★대장★이지 시간순 기록이 아니다.
#   이미 있는 매장이면 그 줄을 고치고, 없을 때만 새로 붙인다. 최신이 위로 올 이유가 없다.
appends = [l.strip() for l in sq.split('\n') if 'appendRow' in l]
src_checks.append(('append 로 남은 곳은 NA프리셋 한 곳뿐이다',
                   len(appends) == 1 and 'naSheet' in appends[0]))

# clearMonthBody 가 셀 위에 뜬 사진을 지우는가 (8월 사진이 12월로 따라오던 것)
cb = cut('clearMonthBody')
src_checks.append(('clearMonthBody 가 over-grid 이미지를 훑는다', 'getImages()' in cb))
src_checks.append(('★본문 아래만 지운다★ (머리글 위 로고는 살린다)', 'ar >= row0' in cb))

js_src_checks = ''.join(
    "ok(%s, %s, true);\n" % (repr(n).replace("'", '"'), 'true' if v else 'false')
    for n, v in src_checks)

HARNESS = r'''
var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('  X ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}

__CODE__

/* ── 가짜 시트 ── */
function mkSheet(maxCols, lastCol) {
  var S = { rows: {}, inserted: [], widened: 0, headWrites: 0,
            _maxCols: maxCols || 20, _lastCol: lastCol === undefined ? 14 : lastCol };
  S.getMaxColumns = function () { return S._maxCols; };
  S.getLastColumn = function () { return S._lastCol; };
  S.insertColumnsAfter = function (at, n) { S._maxCols += n; S.widened += n; };
  S.insertRowsBefore = function (at, n) { S.inserted.push([at, n]); };
  S.getRange = function (r, c, nr, nc) {
    return { setValues: function (v) { S.rows[r] = v; S.lastWrite = [r, c, nr, nc];
                                       if (r === 1) S.headWrites++; } };
  };
  return S;
}

console.log('── prependRows — 최신이 맨 위 ──');
var sh = mkSheet(20);
prependRows(sh, [['a1', 'a2'], ['b1', 'b2']]);
ok('[1-1] ★2행에 끼운다★ (머리글 바로 밑)', sh.inserted, [[2, 2]]);
ok('[1-2] 그 자리에 쓴다', sh.lastWrite, [2, 1, 2, 2]);
ok('[1-3] ★묶음 안 순서는 그대로★ (한 제출의 74줄은 문항 순서)',
   sh.rows[2], [['a1', 'a2'], ['b1', 'b2']]);

sh = mkSheet(20);
prependRows(sh, []);
ok('[1-4] 빈 배열이면 아무 일도 안 한다', [sh.inserted.length, sh.widened], [0, 0]);

sh = mkSheet(3);
prependRows(sh, [[1, 2, 3, 4, 5]]);
ok('[1-5] 열이 모자라면 넓힌다 (그리드를 넘으면 예외가 난다)', sh.widened, 2);

console.log('── QSC_상세 머리글 ──');
var H = QSC_DETAIL_HEADER;
ok('[2-1] 열은 16개', H.length, 16);
ok('[2-2] ★사진은 13번째★ — 되돌리기가 이 자리를 직접 읽는다', H.indexOf('사진') + 1, 13);
ok('[2-3] NA사유는 14번째', H.indexOf('NA사유') + 1, 14);
ok('[2-4] ★제출시각 15★ (MS_상세의 10열과 같은 뜻)', H.indexOf('제출시각') + 1, 15);
ok('[2-5] ★제출점수 16★ (MS_상세의 12열과 같은 뜻)', H.indexOf('제출점수') + 1, 16);
ok('[2-6] 새 칸은 사진보다 뒤에 있다',
   H.indexOf('제출시각') > H.indexOf('사진') && H.indexOf('제출점수') > H.indexOf('사진'), true);

console.log('── qscFixHeader — 모자랄 때만 쓴다 ──');
sh = mkSheet(20, 14);                 // 옛 시트: 14열까지만 있다
qscFixHeader(sh);
ok('[3-1] 짧으면 머리글을 다시 쓴다', sh.headWrites, 1);
ok('[3-2] 16칸을 쓴다', sh.lastWrite, [1, 1, 1, 16]);
ok('[3-3] 이름이 그대로 들어간다', sh.rows[1][0][14], '제출시각');

sh = mkSheet(20, 16);                 // 이미 16열
qscFixHeader(sh);
ok('[3-4] ★이미 넉넉하면 건드리지 않는다★ (여러 번 돌아도 무해)', sh.headWrites, 0);

sh = mkSheet(20, 20);
qscFixHeader(sh);
ok('[3-5] 더 넓어도 건드리지 않는다', sh.headWrites, 0);

console.log('── 이미 쌓인 줄 뒤집기 (rowGroups · reverseGroups) ──');
/* 가짜 시트 — 실제로 행을 옮긴다. ★열쇠 칸만 읽는지★ 도 같이 본다
   (QSC_상세 13열 사진은 셀 내 이미지라, 읽어서 다시 쓰면 날아간다). */
function mkGrid(rows) {
  var G = { body: rows.map(function (r) { return r.slice(); }), reads: [], moves: [] };
  G.getLastRow = function () { return G.body.length + 1; };
  G.getRange = function (r, c, nr, nc) {
    return {
      _r: r, _nr: nr,
      getValues: function () {
        G.reads.push([r, c, nr, nc]);
        return G.body.slice(r - 2, r - 2 + nr).map(function (x) { return x.slice(c - 1, c - 1 + nc); });
      },
    };
  };
  G.moveRows = function (rng, dest) {
    G.moves.push([rng._r, rng._nr, dest]);
    var cut = G.body.splice(rng._r - 2, rng._nr);
    G.body.splice.apply(G.body, [dest - 2, 0].concat(cut));
  };
  return G;
}
/* 한 제출 = 2줄인 세 묶음. 3번째 칸에 「사진 자리」를 흉내 낸 물건을 둔다 */
var IMG = { 사진: true };
var g = mkGrid([
  ['09-01', 'A', IMG], ['09-01', 'A', IMG],
  ['09-05', 'B', IMG], ['09-05', 'B', IMG],
  ['09-07', 'C', IMG], ['09-07', 'C', IMG],
]);
var gr = rowGroups(g, [1, 2]);
ok('[4-1] 이어진 같은 열쇠끼리 묶는다', gr.map(function (x) { return [x.row, x.len]; }),
   [[2, 2], [4, 2], [6, 2]]);
ok('[4-2] ★열쇠 칸까지만 읽는다★ — 사진 칸(3열)을 안 읽는다', g.reads, [[2, 1, 6, 2]]);

orderGroups(g, gr, wantOrderOf(gr, 'reverse'));
ok('[4-3] reverse — ★묶음 차례가 뒤집힌다★ (최신이 맨 위)',
   g.body.map(function (r) { return r[0] + r[1]; }),
   ['09-07C', '09-07C', '09-05B', '09-05B', '09-01A', '09-01A']);
ok('[4-4] ★묶음 안 순서는 그대로★ · 줄 수도 그대로', g.body.length, 6);
ok('[4-5] 사진 자리가 살아 있다 (moveRows 는 값을 다시 쓰지 않는다)',
   g.body.every(function (r) { return r[2] === IMG; }), true);

/* ★2026-09-10 사고★ — MS_상세는 이미 위쪽이 최신순이었는데 통째로 뒤집어 거꾸로 만들었다.
   그 시트는 제출시각이 있으므로 keydesc 로 세워야 하고, keydesc 는 ★몇 번을 돌려도 같다★. */
function mkMS(keys) { return mkGrid(keys.map(function (k) { return [k]; })); }
var m = mkMS(['09-10', '09-08', '09-03', '09-07']);   // 앞은 최신순인데 뒤 둘이 뒤엉킨 모양
var mg = rowGroups(m, [1]);
orderGroups(m, mg, wantOrderOf(mg, 'keydesc'));
ok('[4-6] keydesc — 제출시각 내림차순으로 세운다',
   m.body.map(function (r) { return r[0]; }), ['09-10', '09-08', '09-07', '09-03']);

var m2 = mkMS(['09-10', '09-08', '09-07', '09-03']);
var before2 = m2.body.map(function (r) { return r[0]; });
var g2 = rowGroups(m2, [1]);
ok('[4-7] ★이미 최신순이면 손대지 않는다★', alreadyOrdered(wantOrderOf(g2, 'keydesc')), true);
orderGroups(m2, g2, wantOrderOf(g2, 'keydesc'));
orderGroups(m2, rowGroups(m2, [1]), wantOrderOf(rowGroups(m2, [1]), 'keydesc'));
ok('[4-8] ★keydesc 는 두 번 돌려도 같다★ (reverse 와 다른 점)',
   m2.body.map(function (r) { return r[0]; }), before2);

var r2 = mkMS(['a', 'b', 'c']);
orderGroups(r2, rowGroups(r2, [1]), wantOrderOf(rowGroups(r2, [1]), 'reverse'));
orderGroups(r2, rowGroups(r2, [1]), wantOrderOf(rowGroups(r2, [1]), 'reverse'));
ok('[4-9] ★reverse 는 두 번 돌리면 제자리★ — 그래서 only 로 이름을 대야 돈다',
   r2.body.map(function (r) { return r[0]; }), ['a', 'b', 'c']);

var g3 = mkGrid([['x', '1'], ['x', '2']]);
ok('[4-10] 묶음이 하나면 옮길 것이 없다', rowGroups(g3, [1]).length, 1);
ok('[4-11] 같은 열쇠끼리는 원래 차례를 지킨다 (묶음 안이 안 흔들린다)',
   wantOrderOf([{key:'x'},{key:'x'},{key:'y'}], 'keydesc'), [2, 0, 1]);

console.log('── 소스에서 직접 보는 것 ──');
__SRC_CHECKS__

console.log('\n' + (fail ? 'X 실패 ' + fail + '건' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

code = '\n\n'.join([cutconst('QSC_DETAIL_HEADER'), cut('qscFixHeader'), cut('prependRows'),
                    cut('rowGroups'), cut('orderGroups'), cut('wantOrderOf'), cut('alreadyOrdered')])
print('잘라낸 줄 수: %d' % len(code.split('\n')))

js = HARNESS.replace('__CODE__', code).replace('__SRC_CHECKS__', js_src_checks)
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:2000])
try:
    OUT.unlink()
except Exception:
    pass
sys.exit(r.returncode)
