# -*- coding: utf-8 -*-
"""개선요청 — 지적 1건 = 한 줄 = 사진 한 장 (2026-09-04)

★Code.gs 의 진짜 writeStoreQscInto 를 잘라내서 돌린다★ (사본 아님).
구글 API 는 가짜로 갈아 끼우고 매장 파일 월 탭을 2차원 배열로 흉내 낸다.

담당자 실제 시험(2026-09-03)에서 나온 문제:
  한 문항에 2건 · 사진 2장을 올렸더니 ★한 줄★에 몰려서
  「소비기한 표기 미흡  · 사진 2장: url url」 이 되었다. 기준은 「지적 1건당 사진 1장」이다.

보는 것:
  · 건수만큼 줄이 생기는가 · 사진이 순서대로 한 장씩 들어가는가
  · 건수보다 사진이 적을 때 / 많을 때
  · 문장이 줄마다 들어가는가 · 빈 문장 경고를 문항당 한 번만 세는가
  · 표에 빈 줄이 모자랄 때 몇 건을 못 썼는지 알리는가
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_split.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = cut('writeStoreQscInto')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var PHOTO_EMBED = false;          // 링크 모드로 본다 (D열에 url 문자열이 그대로 보인다)
var WROTE = {};                   // 'D' / 'J' / 'BC' -> 2차원 배열
var ROWS = 0, HEADROW = 11, LASTROW = 25;

function safe(s) { return s; }
function epoch() { return 1; }
function fileTz() { return 'Asia/Seoul'; }
function impDueOf() { return '2026-12-31'; }
function cellImageOf() { return null; }
function setByLabel() { return true; }
function setByLabelAny() { return true; }
function makeMonthTabIn() { return { mark: '✓' }; }
function dropStoreCache() {}
function labelMap() { return { at: {} }; }
function labelValue() { return { found: false, v: '' }; }   // 방문일 없음 = 첫 제출로 본다
function dateOfCell(v) { return v || null; }
function timeKeyOf(v) { return v || null; }
function tableEndRow() { return LASTROW; }
function yymm(d) { return d.slice(2, 4) + d.slice(5, 7); }
var L_QSC = ['QSC점수'], L_MS = ['MS점수'];
var CacheService = { getScriptCache: function () { return { remove: function () {} }; } };
var Utilities = { formatDate: function () { return '2026-12-01'; } };
var SpreadsheetApp = { openById: function () { return FAKE_SS; } };

function impCols() {
  return { ok: true, isNew: true, audit: 14, hr: HEADROW, row0: HEADROW + 1,
           endRow: LASTROW, due: 2, state: 3, body: 10, plan: 11, done: 12,
           dept: 5, memo: 9, last: 15 };
}
function grid(sh, row, col, nr, nc) {
  return {
    getValues: function () {
      var o = [];
      for (var i = 0; i < nr; i++) { var r = [];
        for (var j = 0; j < nc; j++) r.push(sh._get(row + i, col + j));
        o.push(r); }
      return o;
    },
    getFormulas: function () {
      var o = []; for (var i = 0; i < nr; i++) { var r = [];
        for (var j = 0; j < nc; j++) r.push(''); o.push(r); } return o;
    },
    getNumColumns: function () { return nc; },
    setValues: function (v) { WROTE[col] = v; for (var i = 0; i < v.length; i++)
      for (var j = 0; j < v[i].length; j++) sh._set(row + i, col + j, v[i][j]); },
    setValue: function (v) { sh._set(row, col, v); },
    clearContent: function () { for (var i = 0; i < nr; i++)
      for (var j = 0; j < nc; j++) sh._set(row + i, col + j, ''); },
  };
}

function mkSheet() {
  var cells = {};
  var sh = {
    _c: cells,
    _get: function (r, c) { var v = cells[r + ',' + c]; return v === undefined ? '' : v; },
    _set: function (r, c, v) { cells[r + ',' + c] = v; },
    getName: function () { return '2612'; },
    getMaxRows: function () { return 60; },
    getMaxColumns: function () { return 20; },
    getLastRow: function () { return LASTROW; },
    getRange: function (r, c, nr, nc) { return grid(sh, r, c, nr, nc); },
  };
  sh._set(HEADROW, 2, '기한'); sh._set(HEADROW, 3, '상태');
  sh._set(HEADROW, 10, '개선요청사항');
  return sh;
}
var SHEET = mkSheet();
var FAKE_SS = { getSheetByName: function () { return SHEET; },
                getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; } };

// ══ 시험틀 ═══════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      나온 것: ' + g + '\n      바란 것: ' + w); }
}

function run(items, photoMap) {
  SHEET = mkSheet(); WROTE = {};
  var p = { store: '금종제과', date: '2026-12-01', time: '10:00',
            result: { final: 90 }, items: items };
  return writeStoreQscInto(FAKE_SS, p, photoMap || {}, '2612');
}
function rowsJ(n) {
  var o = [];
  for (var i = 1; i <= n; i++) { var v = SHEET._get(HEADROW + i, 10); if (v !== '') o.push(v); }
  return o;
}
function rowsD(n) {
  var o = [];
  for (var i = 1; i <= n; i++) o.push(SHEET._get(HEADROW + i, 4));
  return o;
}

// ── ① 담당자가 실제로 겪은 경우 ─────────────────────────────
console.log('\n① 한 문항 2건 · 사진 2장 (2026-09-03 실제 시험)');
var r = run([{ no: 'C-03', code: 'C-03', value: 2, memo: '소비기한 표기 미흡' }],
            { 'C-03': [{ url: 'U1', id: 'I1' }, { url: 'U2', id: 'I2' }] });
ok('줄이 2개 생긴다', r.tickets, 2);
ok('두 줄 다 같은 문장', rowsJ(4), ['소비기한 표기 미흡', '소비기한 표기 미흡']);
ok('★사진이 한 장씩 따로 들어간다★', rowsD(2), ['U1', 'U2']);
ok('본문에 「사진 2장:」이 안 붙는다', /사진 2장/.test(rowsJ(4).join(' ')), false);

// ── ② 건수와 사진 수가 안 맞을 때 ───────────────────────────
console.log('\n② 건수 ≠ 사진 수');
run([{ no: 'C-03', code: 'C-03', value: 3, memo: '표기 미흡' }],
    { 'C-03': [{ url: 'U1', id: 'I1' }] });
ok('건수 3 · 사진 1 → 줄 3개', rowsJ(5).length, 3);
ok('사진은 첫 줄만', rowsD(3), ['U1', '', '']);

run([{ no: 'C-03', code: 'C-03', value: 1, memo: '표기 미흡' }],
    { 'C-03': [{ url: 'U1', id: 'I1' }, { url: 'U2', id: 'I2' }, { url: 'U3', id: 'I3' }] });
ok('건수 1 · 사진 3 → 줄 1개', rowsJ(5).length, 1);
ok('첫 장은 사진 칸에', rowsD(1), ['U1']);
ok('★남는 사진은 버리지 않는다★', /사진 2장 더: U2 U3/.test(rowsJ(1)[0]), true);

// ── ②-2 건마다 다른 문장 (2026-09-04 담당자) ────────────────
console.log('\n②-2 건마다 다른 문장 · 사진이 건 번호를 달고 온다');
r = run([{ no: 'C-01', code: 'C-01', value: 2, memo: '내부 라벨 미흡',
           notes: ['내부 라벨에 월이 없습니다', '내부 라벨에 일이 없습니다'] }],
        { 'C-01': [{ url: 'P1', id: 'p1', slot: 0 }, { url: 'P2', id: 'p2', slot: 1 }] });
ok('줄 2개', r.tickets, 2);
ok('★줄마다 제 문장★', rowsJ(4), ['내부 라벨에 월이 없습니다', '내부 라벨에 일이 없습니다']);
ok('사진도 제 줄에', rowsD(2), ['P1', 'P2']);

run([{ no: 'C-01', code: 'C-01', value: 2, memo: '라벨',
       notes: ['월 누락', '일 누락'] }],
    { 'C-01': [{ url: 'P2', id: 'p2', slot: 1 }] });
ok('★2건에만 사진이 있으면 1건 줄은 비운다★ (앞으로 밀지 않는다)', rowsD(2), ['', 'P2']);

run([{ no: 'C-01', code: 'C-01', value: 2, memo: '라벨', notes: ['월 누락', ''] }], {});
ok('건별 문장이 비면 문항 문장으로 채운다', rowsJ(3), ['월 누락', '라벨']);

run([{ no: 'C-01', code: 'C-01', value: 1, memo: '라벨', notes: ['월 누락'] }],
    { 'C-01': [{ url: 'P1', id: 'p1', slot: 0 }, { url: 'P9', id: 'p9', slot: 5 }] });
ok('★건수 밖 사진도 잃지 않는다★', /사진 1장 더: P9/.test(rowsJ(1)[0]), true);

run([{ no: 'C-01', code: 'C-01', value: 1, memo: '라벨', notes: ['월 누락'] }],
    { 'C-01': [{ url: 'A', id: 'a', slot: 0 }, { url: 'B', id: 'b', slot: 0 }] });
ok('한 건에 두 장이면 첫 장이 칸에', rowsD(1), ['A']);
ok('나머지는 그 줄 뒤에 글로', /사진 1장 더: B/.test(rowsJ(1)[0]), true);

// ── ③ 여러 문항이 섞일 때 ───────────────────────────────────
console.log('\n③ 여러 문항');
r = run([{ no: 'A-01', code: 'A-01', value: 1, memo: '서류 없음' },
         { no: 'C-03', code: 'C-03', value: 2, memo: '표기 미흡' },
         { no: 'E-05', code: 'E-05', value: 0, memo: '해당 없음' }],
        { 'A-01': [{ url: 'A1', id: 'a1' }], 'C-03': [{ url: 'C1', id: 'c1' }, { url: 'C2', id: 'c2' }] });
ok('0건 문항은 안 들어간다 · 1+2 = 3줄', r.tickets, 3);
ok('문항 순서대로 이어 붙는다', rowsJ(6), ['서류 없음', '표기 미흡', '표기 미흡']);
ok('사진도 순서대로', rowsD(3), ['A1', 'C1', 'C2']);

// ── ④ 빈 문장 경고는 문항당 한 번 ───────────────────────────
console.log('\n④ 개선요청 문장이 비었을 때');
r = run([{ no: 'C-03', code: 'C-03', value: 3, memo: '' }], {});
var w = r.warn.filter(function (x) { return /비어 있는 항목/.test(x); });
ok('줄은 3개', r.tickets, 3);
ok('★경고는 3건이 아니라 1건으로 센다★', /1건입니다/.test(w[0] || ''), true);

// ── ⑤ 표에 빈 줄이 모자랄 때 ────────────────────────────────
console.log('\n⑤ 빈 줄이 모자랄 때');
LASTROW = HEADROW + 2;                     // 쓸 수 있는 줄 2개뿐
r = run([{ no: 'C-03', code: 'C-03', value: 5, memo: '표기 미흡' }], {});
ok('쓸 수 있는 만큼만 쓴다', r.tickets, 2);
ok('못 쓴 건수를 알린다', r.skipped, 3);
ok('★조용히 자르지 않고 경고한다★', /5건 중 2건만 기록/.test(r.warn.join(' ')), true);
LASTROW = 25;

console.log('\n' + (fail ? '✗ ' + fail + '개 실패 · ' : '✓ 전부 통과 · ') + pass + '개 통과');
process.exit(fail ? 1 : 0);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:3000])
OUT.unlink(missing_ok=True)
sys.exit(r.returncode)
