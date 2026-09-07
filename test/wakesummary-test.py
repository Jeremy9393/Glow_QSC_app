# -*- coding: utf-8 -*-
"""요약 탭 깨우기 — wakeSummaryIn (2026-09-07)

★Code.gs 의 진짜 wakeSummaryIn 을 잘라내서 돌린다★ (사본 아님).

무엇을 막으려고 만들었나 —
  매장 파일 요약 탭(월별 QSC현황표)은 월 탭을 VLOOKUP 으로 읽는데, 그 수식은 월 탭이
  태어나기 ★전부터★ 거기 있다. 없는 탭을 가리키던 동안 오류였고, 탭이 생겨도 구글 시트가
  스스로 다시 계산하지 않아 빈칸으로 굳는다. 그러면 통합시트 개선율이 비고, 종합 수식이
  IF(개선율="",1,…) 로 100%로 쳐서 ★종합이 10점 높게★ 나온다.
  (2026-09-04 검수 실측: 호우주의보 이태원 2612 → 매장 파일 87.2 ↔ 통합시트 97.2)

보는 것:
  · 수식이 없는 칸은 ★절대 건드리지 않는가★ — 손으로 넣은 값을 덮으면 그 값이 사라진다
  · 이미 값이 나오는 칸은 건너뛰는가 (멀쩡한 것을 다시 쓸 이유가 없다)
  · 그 달 열을 ★머리글★로 찾는가 (수식 다수결로 찾으면 붙여넣기 사고에 오염된 파일에서 엉뚱한 열)
  · 다섯 줄(개선요청사항~개선율)만 보는가 — 점수 줄은 요약 탭이 다루지 않는다
  · apply=false 면 정말 아무것도 안 바꾸는가
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_wake.js'
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


body = '\n'.join([cutconst('SUM_TAB'), cutconst('SUM_ROW_LABELS'),
                  cut('sumNorm'), cut('wakeSummaryIn')])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 시트 ═══════════════════════════════════════════════
// grid[row][col] = {v: 값, f: 수식}
var WROTE = [];            // setFormula 로 쓴 것들
var FLUSHED = 0;
var SpreadsheetApp = { flush: function () { FLUSHED++; } };

function mkSheet(grid, name) {
  var rows = grid.length, cols = 0;
  grid.forEach(function (r) { cols = Math.max(cols, r.length); });
  function cell(r, c) { return (grid[r - 1] && grid[r - 1][c - 1]) || {}; }
  return {
    getName: function () { return name; },
    getLastRow: function () { return rows; },
    getLastColumn: function () { return cols; },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < nr; i++) {
            var row = [];
            for (var j = 0; j < nc; j++) {
              var v = cell(r + i, c + j).v;
              row.push(v === undefined ? '' : v);
            }
            out.push(row);
          }
          return out;
        },
        getFormulas: function () {
          var out = [];
          for (var i = 0; i < nr; i++) {
            var row = [];
            for (var j = 0; j < nc; j++) {
              var f = cell(r + i, c + j).f;
              row.push(f === undefined ? '' : f);
            }
            out.push(row);
          }
          return out;
        },
        setFormula: function (f) {
          WROTE.push({ row: r, col: c, f: f });
          if (!grid[r - 1]) grid[r - 1] = [];
          if (!grid[r - 1][c - 1]) grid[r - 1][c - 1] = {};
          grid[r - 1][c - 1].f = f;
          // 다시 쓰면 계산된다 — 그것이 이 장치의 전부다
          if (grid[r - 1][c - 1].wake !== undefined) grid[r - 1][c - 1].v = grid[r - 1][c - 1].wake;
        }
      };
    }
  };
}

function mkSs(grid, name) {
  return { getSheetByName: function (n) { return n === (name || '월별 QSC현황표') ? mkSheet(grid, n) : null; } };
}

// A=1 B=2 C=3 … 표를 만들기 쉽게
function cellsFrom(spec) {
  var g = [];
  Object.keys(spec).forEach(function (k) {
    var m = k.match(/^([A-Z]+)(\d+)$/);
    var col = 0;
    m[1].split('').forEach(function (ch) { col = col * 26 + (ch.charCodeAt(0) - 64); });
    var row = Number(m[2]);
    if (!g[row - 1]) g[row - 1] = [];
    g[row - 1][col - 1] = spec[k];
  });
  for (var i = 0; i < g.length; i++) if (!g[i]) g[i] = [];
  return g;
}

// ══ 시험 ═══════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}

/* 실물과 같은 모양: 3행이 머리글(1월…12월), B열이 라벨, 4~8행이 다섯 줄 */
function 기본표(opt) {
  opt = opt || {};
  var s = {
    'C3': { v: '1월' }, 'K3': { v: '9월' }, 'L3': { v: '10월' }, 'M3': { v: '11월' }, 'N3': { v: '12월' },
    'B4': { v: '개선요청사항' }, 'B5': { v: '개선예정/진행' }, 'B6': { v: '개선완료' },
    'B7': { v: '미조치' }, 'B8': { v: '개선율' },
    'B3': { v: '구분' }
  };
  // 12월(N열) 다섯 줄 — 수식은 있는데 값이 비어 있다(잠든 상태). 깨우면 wake 값이 나온다
  [[4, 3], [5, 0], [6, 0], [7, 3], [8, 0]].forEach(function (p, i) {
    s['N' + p[0]] = { v: '', f: '=IFERROR(VLOOKUP("x", \'2612\'!D2:I9, 5, FALSE), "")', wake: p[1] };
  });
  // 9월(K열)은 이미 값이 나온다
  s['K8'] = { v: 0.5, f: '=IFERROR(VLOOKUP("개선율", \'2609\'!D2:I9, 5, FALSE), "")' };
  Object.keys(opt).forEach(function (k) { s[k] = opt[k]; });
  return cellsFrom(s);
}

console.log('── 잠든 칸을 깨운다 ──');
WROTE = []; FLUSHED = 0;
var g = 기본표();
var r = wakeSummaryIn(mkSs(g), '2612', true);
ok('[1-1] 성공', r.ok, true);
ok('[1-2] 12월 열(N=14)을 머리글로 찾았다', r.col, 14);
ok('[1-3] 다섯 줄을 다시 썼다', r.todo.length, 5);
ok('[1-4] 다섯 칸이 값을 냈다', r.woke, 5);
ok('[1-5] 쓴 칸은 전부 N열이다', WROTE.every(function (x) { return x.col === 14; }), true);
ok('[1-6] flush 를 불렀다', FLUSHED > 0, true);

console.log('── ★수식이 없는 칸은 건드리지 않는다★ ──');
WROTE = [];
g = 기본표({ 'N6': { v: '' } });          // 개선완료 칸에 수식이 없다(손으로 관리하는 칸)
r = wakeSummaryIn(mkSs(g), '2612', true);
ok('[2-1] 네 칸만 다시 썼다', r.todo.length, 4);
ok('[2-2] 수식 없는 줄(6행)은 안 건드렸다',
   WROTE.some(function (x) { return x.row === 6; }), false);

console.log('── 이미 값이 나오는 칸은 건너뛴다 ──');
WROTE = [];
g = 기본표({ 'N8': { v: 0.75, f: '=IFERROR(VLOOKUP("개선율", \'2612\'!D2:I9, 5, FALSE), "")' } });
r = wakeSummaryIn(mkSs(g), '2612', true);
ok('[3-1] 네 칸만 다시 썼다', r.todo.length, 4);
ok('[3-2] 값이 있던 8행은 안 건드렸다',
   WROTE.some(function (x) { return x.row === 8; }), false);

console.log('── 9월은 이미 다 나온다 ──');
WROTE = [];
g = 기본표();
r = wakeSummaryIn(mkSs(g), '2609', true);
ok('[4-1] 9월 열(K=11)을 찾았다', r.col, 11);
ok('[4-2] 깨울 것이 없다 (K8은 값이 있고 나머지는 수식이 없다)', r.todo.length, 0);
ok('[4-3] 아무것도 안 썼다', WROTE.length, 0);

console.log('── 미리보기는 아무것도 안 바꾼다 ──');
WROTE = []; FLUSHED = 0;
g = 기본표();
r = wakeSummaryIn(mkSs(g), '2612', false);
ok('[5-1] 할 일은 다섯 칸이라고 알려준다', r.todo.length, 5);
ok('[5-2] 하나도 안 썼다', WROTE.length, 0);
ok('[5-3] flush 도 안 불렀다', FLUSHED, 0);
ok('[5-4] woke 는 0 이다', r.woke, 0);

console.log('── 못 하는 경우는 이유를 말한다 ──');
r = wakeSummaryIn({ getSheetByName: function () { return null; } }, '2612', true);
ok('[6-1] 요약 탭이 없으면 알린다', r.ok, false);
ok('[6-2] 이유가 있다', /탭이 없습니다/.test(r.why || ''), true);

g = cellsFrom({ 'B4': { v: '개선요청사항' }, 'B8': { v: '개선율' } });   // 머리글이 없다
r = wakeSummaryIn(mkSs(g), '2612', true);
ok('[6-3] 머리글에서 그 달을 못 찾으면 아무것도 안 한다', r.ok, false);
ok('[6-4] 이유가 있다', /머리글/.test(r.why || ''), true);

console.log('── 다섯 줄 밖은 보지 않는다 ──');
WROTE = [];
g = 기본표({ 'B9': { v: 'QSC점수' }, 'N9': { v: '', f: '=SOMETHING()', wake: 0.9 } });
r = wakeSummaryIn(mkSs(g), '2612', true);
ok('[7-1] 점수 줄은 다시 쓰지 않는다',
   WROTE.some(function (x) { return x.row === 9; }), false);
ok('[7-2] 여전히 다섯 칸이다', r.todo.length, 5);

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
