
/* ── 가짜 세계 ── */
let RAW = {}, RAW_READS = 0, RAW_THROW = false;
const PropertiesService = { getScriptProperties: function () { return {
  getProperty: function (k) { RAW_READS++; return Object.prototype.hasOwnProperty.call(RAW, k) ? RAW[k] : null; },
  setProperty: function (k, v) { if (RAW_THROW) throw new Error('쓰기 실패'); RAW[k] = String(v); },
  deleteProperty: function (k) { delete RAW[k]; },
  getProperties: function () { return Object.assign({}, RAW); }, getKeys: function () { return Object.keys(RAW); } }; } };
let OPENS = [];
const SpreadsheetApp = { openById: function (id) { OPENS.push(id); return { _id: id }; } };
function mkSheet(rows, cols) {
  const S = { _rows: rows, _cols: cols, asked: 0, ranges: [],
    getMaxRows: function () { S.asked++; return S._rows; },
    getMaxColumns: function () { S.asked++; return S._cols; },
    getLastRow: function () { return S._rows; },
    getRange: function (r, c, nr, nc) { if (r + nr - 1 > S._rows || c + nc - 1 > S._cols) throw new Error('그리드 밖 ' + [r, c, nr, nc].join(',')); S.ranges.push([r, c, nr, nc]); return { setValues: function () {} }; },
    insertRowsAfter: function (at, n) { S._rows += n; },
    insertRowsBefore: function (at, n) { S._rows += n; },
    insertColumnsAfter: function (at, n) { S._cols += n; },
    deleteRows: function (at, n) { S._rows -= n; },
  };
  return S;
}
const PROPS = (function (raw) {
  const memo = {};
  const TTL = 60;                          // 초
  const NIL = '#QSC-NO-PROP#';            // 「속성 없음」을 캐시에 담을 때의 표식(실제 값으로 쓰일 리 없는 글자)
  const norm = function (v) { return (v === null || v === undefined) ? null : String(v); };
  const has = function (k) { return Object.prototype.hasOwnProperty.call(memo, k); };
  const wipe = function () { for (const k in memo) if (has(k)) delete memo[k]; };
  const ck = function (k) { const s = String(k); return s.length <= 200 ? 'pc:' + s : ''; };   // 캐시 키 상한 250자
  const store = function () { try { return CacheService.getScriptCache(); } catch (e) { return null; } };
  const cGet = function (k) {                // undefined = 캐시에 없음(속성을 읽어야 한다)
    const key = ck(k);
    if (!key) return undefined;
    try {
      const c = store();
      const v = c ? c.get(key) : null;
      if (v === null || v === undefined) return undefined;
      return v === NIL ? null : String(v);
    } catch (e) { return undefined; }
  };
  const cPut = function (k, v) {
    const key = ck(k);
    if (!key) return;
    const c = store();
    if (!c) return;
    try { c.put(key, v === null ? NIL : v, TTL); }
    catch (e) { try { c.remove(key); } catch (e2) { } }   // 못 맞추면 지워서 다음 실행이 속성을 읽게 한다
  };
  const cDrop = function (keys) {
    try {
      const c = store();
      if (!c) return;
      const ks = (keys || []).map(ck).filter(function (s) { return !!s; });
      if (ks.length) c.removeAll(ks);
    } catch (e) { }
  };
  return {
    getProperty: function (k) {
      if (!has(k)) {
        const hit = cGet(k);
        if (hit !== undefined) memo[k] = hit;
        else { memo[k] = norm(raw.getProperty(k)); cPut(k, memo[k]); }
      }
      return memo[k];
    },
    setProperty: function (k, v) { raw.setProperty(k, v); memo[k] = norm(v); cPut(k, memo[k]); return this; },
    deleteProperty: function (k) { raw.deleteProperty(k); memo[k] = null; cPut(k, null); return this; },
    getProperties: function () { return raw.getProperties(); },
    getKeys: function () { return raw.getKeys(); },
    setProperties: function (o, del) {
      const before = del ? raw.getKeys() : [];
      raw.setProperties(o, del); wipe();
      cDrop(before.concat(Object.keys(o || {})));
      return this;
    },
    deleteAllProperties: function () { const before = raw.getKeys(); raw.deleteAllProperties(); wipe(); cDrop(before); return this; },
  };
})(PropertiesService.getScriptProperties());
const _gridMemo = (typeof WeakMap === 'function') ? new WeakMap() : null;
function gridSize(sh) {
  let m = null;
  try { m = _gridMemo ? _gridMemo.get(sh) : null; } catch (e) { m = null; }
  if (!m) {
    m = { rows: sh.getMaxRows(), cols: sh.getMaxColumns() };
    try { if (_gridMemo) _gridMemo.set(sh, m); } catch (e) { /* 객체가 아닌 것은 기억하지 않는다 */ }
  }
  return m;
}
function gridForget(sh) { try { if (_gridMemo) _gridMemo.delete(sh); } catch (e) { } }

function grid(sh, row, col, nRows, nCols) {
  const g = gridSize(sh);
  const r = Math.max(0, Math.min(nRows, g.rows - row + 1));
  const c = Math.max(0, Math.min(nCols, g.cols - col + 1));
  if (r <= 0 || c <= 0) return null;
  return sh.getRange(row, col, r, c);
}
function grid(sh, row, col, nRows, nCols) {
  const g = gridSize(sh);
  const r = Math.max(0, Math.min(nRows, g.rows - row + 1));
  const c = Math.max(0, Math.min(nCols, g.cols - col + 1));
  if (r <= 0 || c <= 0) return null;
  return sh.getRange(row, col, r, c);
}
function appendRows(sh, rows) {
  if (!rows || !rows.length) return;
  const g = gridSize(sh);
  const start = sh.getLastRow() + 1;
  const need = start + rows.length - 1 - g.rows;
  if (need > 0) sh.insertRowsAfter(g.rows, need);
  const width = rows[0].length;
  if (g.cols < width) sh.insertColumnsAfter(g.cols, width - g.cols);
  gridForget(sh);   // 행·열이 늘었을 수 있다 — 다음 grid() 는 다시 묻는다
  sh.getRange(start, 1, rows.length, width).setValues(rows);
}
function prependRows(sh, rows) {
  if (!rows || !rows.length) return;
  const width = rows[0].length;
  const g = gridSize(sh);
  if (g.cols < width) sh.insertColumnsAfter(g.cols, width - g.cols);
  sh.insertRowsBefore(2, rows.length);
  gridForget(sh);   // 행(·열)이 늘었다 — 다음 grid() 는 다시 묻는다
  sh.getRange(2, 1, rows.length, width).setValues(rows);
}
function delRows(sh, rows) {
  const s = [];
  rows.slice().sort(function (a, b) { return a - b; }).forEach(function (r) {
    if (!s.length || s[s.length - 1] !== r) s.push(r);      // 중복 제거
  });
  const runs = [];
  for (let i = 0; i < s.length; i++) {
    const last = runs.length ? runs[runs.length - 1] : null;
    if (last && s[i] === last.at + last.n) last.n += 1;
    else runs.push({ at: s[i], n: 1 });
  }
  for (let i = runs.length - 1; i >= 0; i--) sh.deleteRows(runs[i].at, runs[i].n);
  gridForget(sh);   // 행이 줄었다 — grid() 메모를 버린다(옛 값을 쓰면 getRange 가 그리드를 넘어 예외)
  return runs.length;
}
const _ssMemo = {};
function ssOpen(id) {
  const k = String(id || '');
  if (!k) throw new Error('ssOpen: 파일 ID 가 비어 있습니다');
  if (!_ssMemo[k]) _ssMemo[k] = SpreadsheetApp.openById(k);
  return _ssMemo[k];
}

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }

console.log('① grid 메모');
let sh = mkSheet(100, 10);
grid(sh, 2, 1, 50, 5); grid(sh, 2, 1, 50, 5); grid(sh, 1, 1, 200, 20);
ok('세 번 불러도 행·열은 한 번씩만 묻는다(2)', sh.asked === 2, sh.asked);
ok('세 번째는 100×10 으로 잘라 준다', JSON.stringify(sh.ranges[2]) === '[1,1,100,10]', sh.ranges[2]);
let sh2 = mkSheet(30, 3);
grid(sh2, 1, 1, 5, 5);
ok('다른 시트 객체는 따로 묻는다', sh2.asked === 2 && sh.asked === 2);

console.log('② 무효화');
sh = mkSheet(100, 10); grid(sh, 1, 1, 5, 5);
delRows(sh, [2, 3, 4, 10]);                                     // 100 → 96
let threw = false;
try { grid(sh, 1, 1, 200, 5); } catch (e) { threw = true; }
ok('delRows 뒤 — 다시 묻고(4) 줄어든 96행으로 잘라 예외가 없다', !threw && sh.asked === 4 && JSON.stringify(sh.ranges[sh.ranges.length - 1]) === '[1,1,96,5]', [threw, sh.asked, sh.ranges[sh.ranges.length - 1]]);
sh = mkSheet(10, 3); grid(sh, 1, 1, 5, 3);
appendRows(sh, [[1, 2, 3, 4], [1, 2, 3, 4]]);                   // 행 12 · 열 4
grid(sh, 1, 1, 100, 100);
ok('appendRows 뒤 — 늘어난 12×4 를 본다', JSON.stringify(sh.ranges[sh.ranges.length - 1]) === '[1,1,12,4]', sh.ranges[sh.ranges.length - 1]);
sh = mkSheet(10, 3); grid(sh, 1, 1, 5, 3);
prependRows(sh, [[1, 2, 3], [1, 2, 3], [1, 2, 3]]);            // 행 13
grid(sh, 1, 1, 100, 100);
ok('prependRows 뒤 — 늘어난 13행을 본다', JSON.stringify(sh.ranges[sh.ranges.length - 1]) === '[1,1,13,3]', sh.ranges[sh.ranges.length - 1]);
sh = mkSheet(10, 3); grid(sh, 1, 1, 5, 3);
sh._rows = 7; gridForget(sh); grid(sh, 1, 1, 100, 100);
ok('gridForget 뒤 — 다시 묻는다(7행)', JSON.stringify(sh.ranges[sh.ranges.length - 1]) === '[1,1,7,3]', sh.ranges[sh.ranges.length - 1]);
ok('gridForget 에 이상한 값을 줘도 안 터진다', (function () { try { gridForget(null); gridForget(3); return true; } catch (e) { return false; } })());

console.log('③ PROPS 메모');
RAW = { A: '1' }; RAW_READS = 0;
ok('같은 키 두 번 → 원본 한 번', PROPS.getProperty('A') === '1' && PROPS.getProperty('A') === '1' && RAW_READS === 1, RAW_READS);
ok('없는 키는 null · 그것도 한 번만', PROPS.getProperty('B') === null && PROPS.getProperty('B') === null && RAW_READS === 2, RAW_READS);
PROPS.setProperty('A', '2');
ok('쓴 뒤 읽으면 새 값 · 원본 안 읽음', PROPS.getProperty('A') === '2' && RAW_READS === 2 && RAW.A === '2', [PROPS.getProperty('A'), RAW_READS]);
PROPS.setProperty('B', 7);
ok('숫자를 써도 문자열로 돌아온다(구글과 같다)', PROPS.getProperty('B') === '7');
PROPS.deleteProperty('A');
ok('지운 뒤는 null · 원본도 없다', PROPS.getProperty('A') === null && !('A' in RAW));
RAW = { C: 'old' }; RAW_READS = 0; PROPS.getProperty('C'); RAW_THROW = true;
let boom = false; try { PROPS.setProperty('C', 'new'); } catch (e) { boom = true; }
RAW_THROW = false;
ok('쓰기가 예외면 예외가 그대로 나가고 메모는 옛 값', boom && PROPS.getProperty('C') === 'old' && RAW.C === 'old');
ok('getProperties/getKeys 는 원본 그대로', PROPS.getKeys().indexOf('C') >= 0 && PROPS.getProperties().C === 'old');

console.log('④ ssOpen 메모');
OPENS = [];
const a = ssOpen('X'), b = ssOpen('X'), c = ssOpen('Y');
ok('같은 ID 는 같은 객체 · 한 번만 열었다', a === b && OPENS.length === 2 && OPENS.join() === 'X,Y', OPENS);
ok('다른 ID 는 다른 객체', c !== a && c._id === 'Y');
ok('빈 ID 는 예외', (function () { try { ssOpen(''); return false; } catch (e) { return true; } })());

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
