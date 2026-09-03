# -*- coding: utf-8 -*-
"""「차기 월 목표」 걷어내기 시험 (2026-09-03)

★Code.gs 의 진짜 goalBoxIn · dropGoalBox · dropGoalIn · grid · colLetter 를 잘라내서 돌린다★
(사본 아님). 시트는 2차원 배열로 흉내 내고, 지운 자리를 그대로 되읽어 대조한다.

보는 것:
  · 표를 라벨로 찾는가 (열이 밀려 있어도)
  · 지우는 상자가 제목 1줄 + 라벨 5줄 × 2칸인가 — 그 밖은 안 건드리는가
  · A1:J10 의 점수 라벨이 살아남는가 (앱 연동이 여기 걸려 있다)
  · 대상 탭이 새 원본과 2610~ 뿐인가 (1~9월 기록은 그대로)
  · 미리보기가 아무것도 안 지우는가
  · 두 번 돌려도 안전한가
"""
import io, sys, subprocess
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_dropgoal.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = '\n\n'.join(cut(n) for n in
                   ['colLetter', 'grid', 'goalBoxIn', 'dropGoalBox', 'dropGoalIn'])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var TPL_NEW = '0QSC현황(원본_2610~)';

function mkSheet(name, rows) {
  var sh = {
    _name: name, _rows: rows, _broke: 0, _dv: 0, _fmt: 0, _cleared: [],
    getName: function () { return name; },
    getMaxRows: function () { return rows.length; },
    getMaxColumns: function () {
      var m = 0; rows.forEach(function (r) { m = Math.max(m, r.length); }); return m;
    },
    getRange: function (r, c, nr, nc) { return mkRange(sh, r, c, nr, nc); },
  };
  return sh;
}

function mkRange(sh, r, c, nr, nc) {
  var max = sh.getMaxColumns();
  if (r < 1 || c < 1 || r + nr - 1 > sh.getMaxRows() || c + nc - 1 > max) {
    throw new Error('그리드 밖: ' + r + ',' + c + ',' + nr + ',' + nc);
  }
  return {
    getValues: function () {
      var o = [];
      for (var i = 0; i < nr; i++) {
        var row = [], src = sh._rows[r - 1 + i] || [];
        for (var j = 0; j < nc; j++) row.push(src[c - 1 + j] === undefined ? '' : src[c - 1 + j]);
        o.push(row);
      }
      return o;
    },
    getA1Notation: function () {
      return colLetter(c) + r + ':' + colLetter(c + nc - 1) + (r + nr - 1);
    },
    breakApart: function () { sh._broke++; },
    clearContent: function () {
      for (var i = 0; i < nr; i++) {
        for (var j = 0; j < nc; j++) {
          var rr = sh._rows[r - 1 + i]; if (!rr) continue;
          while (rr.length < c - 1 + nc) rr.push('');
          rr[c - 1 + j] = '';
        }
      }
      sh._cleared.push(colLetter(c) + r + ':' + colLetter(c + nc - 1) + (r + nr - 1));
    },
    clearDataValidations: function () { sh._dv++; },
    clearFormat: function () { sh._fmt++; },
  };
}

/* 실물 월 탭을 닮은 표. 왼쪽(A~J)은 앱이 읽고 쓰는 자리, K~L 이 「차기 월 목표」다. */
function monthRows(goalTitle, goalCol) {
  var rows = [];
  for (var i = 0; i < 14; i++) rows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  rows[1][3] = '9월 QSC 현황';
  rows[1][4] = '위생점수'; rows[1][5] = 92;
  rows[2][4] = 'CS점수'; rows[2][5] = 88;
  rows[3][4] = '종합점수'; rows[3][5] = 90;
  rows[8][3] = '개선율'; rows[8][7] = 0.8;
  rows[10][1] = '담당부서'; rows[10][9] = '비고';
  rows[11][1] = '주방'; rows[11][9] = '9월 지적';
  if (goalTitle !== null) {
    var c = goalCol;                    // 0-based
    rows[0][c] = goalTitle;
    rows[1][c] = '위생'; rows[1][c + 1] = 0.95;
    rows[2][c] = '';    rows[2][c + 1] = '';
    rows[3][c] = 'CS';   rows[3][c + 1] = 'B';
    rows[4][c] = '';    rows[4][c + 1] = '';
    rows[5][c] = '종합'; rows[5][c + 1] = 'CS재교육을 통해 95%달성';
  }
  return rows;
}

// ══ 시험틀 ═══════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      나온 것: ' + g + '\n      바란 것: ' + w); }
}
function okTrue(name, got) { ok(name, !!got, true); }

// ── ① 자리 찾기 ────────────────────────────────────────────
console.log('\n① 표 자리를 라벨로 찾는다');
var sh = mkSheet('2610', monthRows('차기 월 목표', 10));
var box = goalBoxIn(sh);
ok('제목이 K1 이면 상자는 K1 부터', [box.row, box.col], [1, 11]);
ok('상자는 6줄 × 2칸', [box.rows, box.cols], [6, 2]);
ok('미리보기 줄은 6줄', box.shown.length, 6);
okTrue('미리보기에 값이 보인다', box.shown[5].indexOf('CS재교육') >= 0);
ok('오른쪽에 딴 글자는 없다', box.extra, []);

var sh2 = mkSheet('2610', monthRows('차기월목표', 10));
okTrue('공백 없이 적혀 있어도 찾는다', goalBoxIn(sh2) !== null);
var sh3 = mkSheet('2610', monthRows('차기  월\n목표', 10));
okTrue('줄바꿈·겹공백이 있어도 찾는다', goalBoxIn(sh3) !== null);

var sh4 = mkSheet('2610', monthRows(null, 0));
ok('표가 없으면 null', goalBoxIn(sh4), null);

/* 열이 밀린 파일 — 개선요청 4칸을 끼운 뒤에는 표가 오른쪽으로 간다 */
var shift = monthRows('차기 월 목표', 12);
var box2 = goalBoxIn(mkSheet('2610', shift));
ok('열이 밀려 있어도 그 자리를 찾는다', [box2.row, box2.col], [1, 13]);

/* 상자 오른쪽에 글자가 있으면 적어만 낸다 */
var extra = monthRows('차기 월 목표', 10);
extra[1][12] = '메모';
var box3 = goalBoxIn(mkSheet('2610', extra));
ok('오른쪽 글자는 extra 로 적어 낸다', box3.extra, ['M2=메모']);

// ── ② 지우기 ───────────────────────────────────────────────
console.log('\n② 지우는 것과 남기는 것');
var sh5 = mkSheet('2610', monthRows('차기 월 목표', 10));
var r5 = dropGoalBox(sh5);
ok('지웠다고 답한다', [r5.hit, r5.a1], [true, 'K1:L6']);
ok('제목이 비었다', sh5._rows[0][10], '');
ok('맨 아랫줄 값도 비었다', sh5._rows[5][11], '');
ok('★위생점수 라벨은 살아 있다★', sh5._rows[1][4], '위생점수');
ok('★점수 값도 살아 있다★', sh5._rows[1][5], 92);
ok('★개선율 수식 자리도 그대로★', sh5._rows[8][7], 0.8);
ok('★개선요청 본문도 그대로★', sh5._rows[11][9], '9월 지적');
ok('병합을 먼저 풀었다', sh5._broke, 1);
ok('입력규칙도 지웠다', sh5._dv, 1);
ok('서식도 지웠다', sh5._fmt, 1);

var sh6 = mkSheet('2610', monthRows(null, 0));
ok('표가 없으면 안 지우고 그렇다고 답한다', [dropGoalBox(sh6).hit, sh6._broke], [false, 0]);

/* 두 번 돌려도 안전한가 */
var again = dropGoalBox(sh5);
ok('두 번째는 표 없음으로 지나간다', [again.hit, again.why], [false, '표 없음']);

/* 상자가 시트 끝에 걸리는 파일 — grid 가 시트 안쪽으로 잘라 주므로 죽지 않는다.
   (실물 월 탭은 12줄이 넘어 이 길로 오지 않는다. 죽지 않는 것만 확인한다) */
var tiny = mkSheet('2610', [['', '', '차기 월 목표']]);
var r7 = dropGoalBox(tiny);
ok('시트 끝에 걸려도 죽지 않는다', r7.hit, true);
ok('시트 안쪽까지만 지운다', tiny._rows[0][2], '');

// ── ③ 대상 탭 고르기 ────────────────────────────────────────
console.log('\n③ 어느 탭을 손대는가');
function mkSS(names) {
  var m = {};
  names.forEach(function (n) { m[n] = mkSheet(n, monthRows('차기 월 목표', 10)); });
  return {
    _m: m,
    getSheets: function () { return names.map(function (n) { return m[n]; }); },
    getSheetByName: function (n) { return m[n] || null; },
  };
}
var ss = mkSS(['2608', '2609', '2610', '2611', TPL_NEW, '월별 QSC현황표']);
var out = dropGoalIn(ss, true);
var hit = out.filter(function (l) { return l.charAt(0) === '✓'; }).join(' ');
okTrue('2610 을 지운다', hit.indexOf('2610') >= 0);
okTrue('2611 을 지운다', hit.indexOf('2611') >= 0);
okTrue('새 원본을 지운다', hit.indexOf(TPL_NEW) >= 0);
ok('★2609 는 안 건드린다★', ss._m['2609']._rows[0][10], '차기 월 목표');
ok('★2608 도 안 건드린다★', ss._m['2608']._rows[0][10], '차기 월 목표');
ok('★월별 QSC현황표는 안 건드린다★', ss._m['월별 QSC현황표']._rows[0][10], '차기 월 목표');
ok('손댄 탭은 셋뿐', hit.split('✓').length - 1, 3);

var empty = dropGoalIn(mkSS(['2608', '2609']), true);
okTrue('대상이 없으면 그렇다고 답한다', empty[0].indexOf('대상 탭이 없습니다') >= 0);

// ── ④ 미리보기는 아무것도 안 지운다 ─────────────────────────
console.log('\n④ 미리보기');
var ss2 = mkSS(['2610', TPL_NEW]);
var pv = dropGoalIn(ss2, false);
ok('★미리보기 뒤에도 값이 그대로★', ss2._m['2610']._rows[5][11], 'CS재교육을 통해 95%달성');
ok('미리보기는 아무것도 안 지운다', ss2._m['2610']._cleared.length, 0);
okTrue('지울 자리를 적어 준다', pv.join(' ').indexOf('K1:L6 를 지울 예정') >= 0);
okTrue('지울 내용을 눈으로 보여 준다', pv.join(' ').indexOf('CS재교육') >= 0);

var ss3 = mkSS(['2610']);
ss3._m['2610']._rows[1][12] = '메모';
okTrue('오른쪽 글자는 안 지운다고 미리 알린다',
  dropGoalIn(ss3, false).join(' ').indexOf('오른쪽에 글자가 더 있습니다') >= 0);

// ── 끝 ──────────────────────────────────────────────────────
console.log('\n' + (fail ? '✗ ' + fail + '개 실패 · ' : '✓ 전부 통과 · ') + pass + '개 통과');
process.exit(fail ? 1 : 0);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr)
OUT.unlink(missing_ok=True)
sys.exit(r.returncode)
