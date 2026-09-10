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

console.log('── 소스에서 직접 보는 것 ──');
__SRC_CHECKS__

console.log('\n' + (fail ? 'X 실패 ' + fail + '건' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

code = '\n\n'.join([cutconst('QSC_DETAIL_HEADER'), cut('qscFixHeader'), cut('prependRows')])
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
