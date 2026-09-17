# -*- coding: utf-8 -*-
"""MS 「가장 최근 제출 1건」 고르기 — 빈 제출시각은 언제나 진다 (2026-09-17 #29)

★Code.gs 의 진짜 msMonthPick · shopperMonthAvg · stampOf · ymOfCell · dateOfCell · timeKeyOf 를 잘라내서 돌린다★ (사본 아님).

왜: 맨 위 제출의 제출시각이 비어 있으면(옛 이관 줄) 종전 규칙(`at > bestAt`)은 그 줄을 「가장 최근」으로 잡았다 —
    아래쪽에 제출시각이 있는 더 최근 제출이 있어도. NAS 아카이빙(fnArchiveData)은 'B'+제출시각 > 'A'+날짜 로 골라
    둘이 어긋났다(같은 달 자료인데 앱 점수와 엑셀 점수가 다르게 나온다).

보는 것:
  ① 맨 위가 빈 제출시각 · 아래가 제출시각 있는 줄 → 아래 줄(제출시각 있는 쪽)이 이긴다  ← 종전엔 위 줄
  ② 제출시각이 있는 줄끼리는 늦은 쪽 · 같으면 위쪽
  ③ ★fnArchiveData 와 같은 규칙인가★ — 원문에서 열쇠 식을 그대로 확인하고, 무작위 3000판을 그 열쇠 규칙(오라클)과 대조
     (제출시각이 하나라도 있는 달 — 전부 빈 달은 「시트 위쪽 줄」이 정해진 규칙이라 대조에서 뺀다 · ms-detail-test [7-1])
  ④ n(제출 건수)은 38줄이어도 1건으로 센다 · 코드 발급 거부(②-2)가 이 값을 쓴다
  ⑤ 대조군: QSC_SRC=<고치기 전 사본> 으로 돌리면 ①이 실패해야 한다

    python test/ms-latest-pick-test.py
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_ms_latest.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = src.split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cut_opt(name):
    try:
        return cut(name)
    except SystemExit:
        return '/* %s 없음 (옛 사본) */' % name


def cutconst(prefix):
    st = next(i for i, l in enumerate(lines) if l.startswith(prefix))
    if lines[st].rstrip().endswith(';'):
        return lines[st]
    for j in range(st + 1, len(lines)):
        if lines[j].startswith('};'):
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % prefix)


py_fail = 0


def pyok(name, cond):
    global py_fail
    print(('  ✓ ' if cond else '  ✗ ') + name)
    if not cond:
        py_fail += 1


arch = cut('fnArchiveData')
pyok("③ fnArchiveData 열쇠 식이 원문 그대로다 ('B'+제출시각 · 'A'+날짜 시간)",
     "'B' + stampOf(r[MS_COL.at - 1], tz) : 'A' + d + ' ' + timeKeyOf(r[MS_COL.time - 1], tz)" in arch)
pyok('③ fnArchiveData 는 가장 큰 열쇠를 고른다 (if (k > pick) pick = k)', 'if (k > pick) pick = k;' in arch)

body = '\n'.join([cutconst('const MS_COL '), cut_opt('msMonthPick'), cut('shopperMonthAvg'), cut('stampOf'),
                  cut('ymOfCell'), cut('dateOfCell'), cut('timeKeyOf')])

js = r'''
function normStore(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }
var Utilities = { formatDate: function (d) { return String(d); } };   // 시험은 문자열만 쓴다
function grid(sh, r, c, nr, nc) {
  if (nr <= 0) return null;
  return { getValues: function () { return sh._rows.slice(r - 2, r - 2 + nr); } };
}
function mkSheet(rows) { return { _rows: rows, getLastRow: function () { return rows.length + 1; } }; }
function row(o) {
  var a = new Array(MS_COL.order).fill('');
  a[MS_COL.date - 1] = o.date; a[MS_COL.time - 1] = o.time || ''; a[MS_COL.store - 1] = o.store;
  a[MS_COL.no - 1] = o.no || 1; a[MS_COL.at - 1] = o.at; a[MS_COL.total - 1] = o.total;
  return a;
}
function submit(o, n) {   // 한 제출 = n줄 (기본 38)
  var out = []; n = n || 38;
  for (var i = 1; i <= n; i++) out.push(row({ date: o.date, time: o.time, store: o.store, no: i, at: o.at, total: o.total }));
  return out;
}
var pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
var S = '금종제과', TZ = 'Asia/Seoul';
function score(sh) { return shopperMonthAvg(sh, S, '2026-10-01', TZ); }

console.log('① 맨 위 줄이 빈 제출시각이면 진다');
var sh = mkSheet(submit({ date: '2026-10-25', store: S, at: '', total: 55 })
  .concat(submit({ date: '2026-10-02', store: S, at: '2026-10-02 09:00', total: 88 })));
ok('위 55(제출시각 없음) · 아래 88(있음) → 88', score(sh) === 88, score(sh));
sh = mkSheet(submit({ date: '2026-10-25', store: S, at: '', total: 55 })
  .concat(submit({ date: '2026-10-02', store: S, at: '2026-10-02 09:00', total: 88 }))
  .concat(submit({ date: '2026-10-01', store: S, at: '2026-10-01 09:00', total: 70 })));
ok('빈 줄이 맨 위 · 아래 둘 중 늦은 88', score(sh) === 88, score(sh));
sh = mkSheet(submit({ date: '2026-10-25', store: S, at: '', total: 55 })
  .concat(submit({ date: '2026-10-20', store: S, at: '', total: 66 }))
  .concat(submit({ date: '2026-10-02', store: S, at: '2026-10-02 09:00', total: 88 })));
ok('빈 줄이 둘이고 맨 아래만 있어도 88', score(sh) === 88, score(sh));

console.log('② 제출시각이 있는 줄끼리');
sh = mkSheet(submit({ date: '2026-10-05', store: S, at: '2026-10-05 10:00', total: 90 })
  .concat(submit({ date: '2026-10-20', store: S, at: '2026-10-20 10:00', total: 70 })));
ok('시트 순서가 뒤집혀도 제출시각이 늦은 70', score(sh) === 70, score(sh));
sh = mkSheet(submit({ date: '2026-10-25', store: S, at: '2026-10-25 10:00', total: 100 })
  .concat(submit({ date: '2026-10-25', store: S, at: '2026-10-25 10:00', total: 60 })));
ok('제출시각이 같으면 위쪽 100', score(sh) === 100, score(sh));
sh = mkSheet(submit({ date: '2026-10-05', time: '11:00', store: S, at: '', total: 90 })
  .concat(submit({ date: '2026-10-05', time: '15:00', store: S, at: '', total: 70 })));
ok('전부 빈 제출시각이면 시트 위쪽 90 (정해진 규칙 · ms-detail [7-1])', score(sh) === 90, score(sh));

console.log('③ fnArchiveData 열쇠 규칙(오라클)과 무작위 3000판 대조 — 제출시각이 하나라도 있는 달');
/* 오라클 — fnArchiveData 원문의 열쇠 식을 그대로 옮긴 것(위 파이썬 검사가 원문과 같음을 확인했다) */
function oracle(rows) {
  var groups = {};
  rows.forEach(function (r) {
    var d = dateOfCell(r[MS_COL.date - 1], TZ);
    var key = String(r[MS_COL.at - 1] || '') ? 'B' + stampOf(r[MS_COL.at - 1], TZ) : 'A' + d + ' ' + timeKeyOf(r[MS_COL.time - 1], TZ);
    (groups[key] = groups[key] || []).push(r);
  });
  var keys = Object.keys(groups), pick = keys[0];
  keys.forEach(function (k) { if (k > pick) pick = k; });
  return groups[pick][0][MS_COL.total - 1];
}
var seed = 12345;
function rnd(n) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; }
var bad = 0, tried = 0;
for (var t = 0; t < 3000; t++) {
  var subs = [], k = 1 + rnd(4), hasAt = false;
  for (var i = 0; i < k; i++) {
    var day = 1 + rnd(28), hh = rnd(24), mm = rnd(60);
    var d = '2026-10-' + (day < 10 ? '0' : '') + day;
    var tm = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    var withAt = rnd(3) !== 0;
    if (withAt) hasAt = true;
    subs.push({ date: d, time: tm, at: withAt ? (d + ' ' + tm) : '', total: 50 + rnd(51), n: 1 + rnd(3) });
  }
  if (!hasAt) continue;                         // 전부 빈 달은 규칙이 다르다(위 ②)
  tried++;
  var rows = [];
  subs.forEach(function (s) { rows = rows.concat(submit({ date: s.date, time: s.time, store: S, at: s.at, total: s.total }, s.n)); });
  var mine = score(mkSheet(rows)), want = oracle(rows);
  if (mine !== want) { bad++; if (bad <= 3) console.log('    어긋남: ' + JSON.stringify(subs) + ' → 앱 ' + mine + ' · 아카이빙 ' + want); }
}
ok('무작위 ' + tried + '판 전부 같다', bad === 0, bad);

console.log('④ 건수(n)는 제출 단위');
if (typeof msMonthPick === 'function') {
  sh = mkSheet(submit({ date: '2026-10-05', store: S, at: '2026-10-05 10:00', total: 90 })
    .concat(submit({ date: '2026-10-20', store: S, at: '2026-10-20 10:00', total: 70 }))
    .concat(submit({ date: '2026-10-21', store: S, at: '', total: 60 })));
  var p = msMonthPick(sh, S, '2026-10', TZ);
  ok('38줄×3 → n=3 · 점수는 제출시각 있는 것 중 늦은 70', p.n === 3 && p.score === 70, p);
  ok('그 달에 없으면 n=0 · score=null', (function () { var q = msMonthPick(sh, S, '2026-09', TZ); return q.n === 0 && q.score === null; })());
} else {
  ok('msMonthPick 이 있다 (코드 발급 거부 ②-2 가 쓴다)', false);
}

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(body + '\n' + js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
if py_fail or res.returncode != 0:
    sys.exit(1)
