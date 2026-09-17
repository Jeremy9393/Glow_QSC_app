const MS_COL = {
  date: 1, time: 2, store: 3, code: 4, no: 5, text: 6, answer: 7, score: 8, memo: 9,
  at: 10, route: 11, total: 12, answered: 13, overall: 14, demo: 15, order: 16,
  way: 17,
};
function msMonthPick(sh, store, ym, tz) {
  const out = { score: null, at: '', n: 0 };
  const last = sh.getLastRow();
  if (last < 2) return out;
  const n = Math.min(6000, last - 1);
  const rng = grid(sh, 2, 1, n, MS_COL.order);
  const vals = rng ? rng.getValues() : [];
  const key = normStore(store);
  const seen = {};
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    const dYm = ymOfCell(v[MS_COL.date - 1], tz);
    if (normStore(v[MS_COL.store - 1]) !== key || dYm !== ym) continue;
    const raw = v[MS_COL.at - 1];
    const at = (raw == null || raw === '') ? '' : stampOf(raw, tz);
    seen[at ? ('B' + at) : ('A' + dateOfCell(v[MS_COL.date - 1], tz) + ' ' + timeKeyOf(v[MS_COL.time - 1], tz))] = 1;
    const sc = v[MS_COL.total - 1];
    if (typeof sc !== 'number') continue;
    if (out.score === null || (at && (!out.at || at > out.at))) { out.score = sc; out.at = at; }
  }
  out.n = Object.keys(seen).length;
  return out;
}
function shopperMonthAvg(sh, store, dateStr, tz) {
  const p = msMonthPick(sh, store, String(dateStr).slice(0, 7), tz);
  return p.score === null ? 0 : p.score;
}
function stampOf(v, tz) {
  let d = null;
  if (v instanceof Date) {
    d = v;
  } else {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    const hasZone = /Z$/.test(s) || /[+\-]\d{2}:?\d{2}$/.test(s);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m && !hasZone) return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
    const t = Date.parse(s);
    if (isNaN(t)) return '';
    d = new Date(t);
  }
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm');
}
function ymOfCell(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM');
  return String(v == null ? '' : v).trim().slice(0, 7);
}
function dateOfCell(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim().slice(0, 10);
}
function timeKeyOf(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'HH:mm');
  return String(v == null ? '' : v).trim();
}

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
