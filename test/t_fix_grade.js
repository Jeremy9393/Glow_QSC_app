
const DASHBOARD_ID = 'dash', DASHBOARD_SHEET = '데이터';
const MONTH_COL = { 1: 5, 2: 12, 3: 19, 4: 28, 5: 35, 6: 42, 7: 51, 8: 58, 9: 65, 10: 74, 11: 81, 12: 88 };
const TPL_NEW = '0QSC현황(원본_2610~)';
const L_QSC = ['QSC점수', '위생점수', '위생'], L_MS = ['MS점수', 'CS점수', 'CS'];
const STORES = ['가', '나', '다', '라', '마', '바', '사', '아', '자'];
function displayStores() { return STORES.slice(); }
function storeFileId(s) { return s === '자' ? null : 'F-' + s; }
function err(code, msg) { return { ok: false, code: code, error: msg }; }

/* ── 가짜 탭: 수식 칸 f['r,c'] · 값 칸 v['r,c'] ── */
function mkTab(name, f, v, labels) {
  const T = { _n: name, f: Object.assign({}, f || {}), v: Object.assign({}, v || {}), labels: labels || {}, writes: 0,
    getName: function () { return name; },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        getFormula: function () { return T.f[r + ',' + c] || ''; },
        setFormula: function (x) { T.f[r + ',' + c] = x; T.writes++; },
        getFormulas: function () { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(T.f[(r + i) + ',' + (c + j)] || ''); o.push(row); } return o; },
        getA1Notation: function () { return colLetter(c) + r; },
      };
    } };
  return T;
}
function grid(sh, r, c, nr, nc) { return sh.getRange(r, c, nr, nc); }
function labelMap(sh) { return sh; }
function labelValue(sh, names) {
  for (let i = 0; i < names.length; i++) { const p = sh.labels[names[i]]; if (p) return { found: true, row: p.row, col: p.col, v: null }; }
  return { found: false };
}
/* 월 탭 실물 모양 — QSC점수 값 H2 · MS점수 값 H3 · 종합등급 값 I4 (라벨 자리는 이 시험에선 중요하지 않다) */
const LBL = { 'QSC점수': { row: 2, col: 8 }, 'MS점수': { row: 3, col: 8 }, '종합등급': { row: 4, col: 9 } };
const IFS = '=IFS(H4>=0.93,"우수",H4>=0.8,"보통",TRUE,"부적합")';
let FILES = {};
function mkFile(id, tabs) { FILES[id] = { tabs: tabs, getSheets: function () { return tabs; }, getSheetByName: function (n) { return tabs.find(function (t) { return t._n === n; }) || null; } }; }
let DASH = null;
const SpreadsheetApp = { openById: function (id) { if (id === 'dash') return { getSheetByName: function () { return DASH; } }; if (!FILES[id]) throw new Error('없는 파일 ' + id); return FILES[id]; }, flush: function () {} };
function mkDash() {
  const f = {}, v = {};
  [10, 11, 12].forEach(function (m) { const g = MONTH_COL[m] + 6; for (let r = 6; r <= 39; r++) f[r + ',' + g] = '=IFS(' + colLetter(g - 1) + r + '>=0.93,"우수",TRUE,"부적합")'; });
  delete f['20,' + (MONTH_COL[10] + 6)]; v['20,' + (MONTH_COL[10] + 6)] = '보통';    // 10월 20행은 값 칸
  return mkTab('데이터', f, v);
}
function reset() {
  FILES = {};
  STORES.forEach(function (s, i) {
    if (s === '자') return;
    const tabs = [mkTab(TPL_NEW, { '4,9': IFS }, {}, LBL), mkTab('2610', { '4,9': IFS }, {}, LBL), mkTab('2609', { '4,9': IFS }, {}, LBL)];
    if (s === '나') tabs.push(mkTab('2611', {}, { '4,9': '보통' }, LBL));                       // 값 칸
    if (s === '다') tabs.push(mkTab('2611', { '4,9': IFS }, {}, { 'QSC점수': LBL['QSC점수'], '종합등급': LBL['종합등급'] })); // MS 라벨 없음
    mkFile('F-' + s, tabs);
  });
  DASH = mkDash();
}
const FIX_GRADE_PER_PAGE = 7;
const GRADE_WRAP_RE = /^=IF\(OR\(NOT\(ISNUMBER\(/i;
function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - 1 - m) / 26; }
  return s;
}
function wrapGradeFormula(f, qA1, mA1) {
  const cur = String(f == null ? '' : f).trim();
  if (!cur || cur.charAt(0) !== '=') return null;
  if (GRADE_WRAP_RE.test(cur.replace(/\s+/g, ''))) return '';
  return '=IF(OR(NOT(ISNUMBER(' + qA1 + ')),NOT(ISNUMBER(' + mA1 + '))),"",' + cur.slice(1) + ')';
}
function fixGradeTabIn(sh, apply) {
  const norm = function (f) { return String(f == null ? '' : f).replace(/\s+/g, ''); };
  const lm = labelMap(sh);
  const q = labelValue(lm, L_QSC), m = labelValue(lm, L_MS), g = labelValue(lm, ['종합등급']);
  if (!(q.found && q.row && m.found && m.row && g.found && g.row)) {
    return { mark: '✗', msg: '라벨을 못 찾았습니다(' + (q.found ? '' : 'QSC점수 ') + (m.found ? '' : 'MS점수 ') + (g.found ? '' : '종합등급') + ')' };
  }
  const a1 = function (pv) { return grid(sh, pv.row, pv.col, 1, 1).getA1Notation(); };
  const cell = grid(sh, g.row, g.col, 1, 1);
  const next = wrapGradeFormula(cell.getFormula(), a1(q), a1(m));
  if (next === null) return { mark: '·', msg: '종합등급 ' + a1(g) + ' 이 수식이 아니라 손대지 않았습니다' };
  if (next === '') return { mark: '·', msg: '이미 감싸져 있습니다' };
  if (!apply) return { mark: '·', msg: '고칠 칸 ' + a1(g) + ' → ' + next.slice(0, 60) + (next.length > 60 ? '…' : '') };
  cell.setFormula(next);
  SpreadsheetApp.flush();
  const back = grid(sh, g.row, g.col, 1, 1).getFormula();
  if (norm(back) !== norm(next)) return { mark: '✗', msg: a1(g) + ' 에 썼는데 다시 읽은 값이 다릅니다' };
  return { mark: '✓', msg: a1(g) + ' 감쌌습니다' };
}
function fixGradeDashRun(apply) {
  const lines = [];
  if (!DASHBOARD_ID) return { ok: false, changed: 0, wrote: 0, mismatch: 0, lines: ['통합시트 ID 가 설정되어 있지 않습니다'] };
  let sh;
  try { sh = SpreadsheetApp.openById(DASHBOARD_ID).getSheetByName(DASHBOARD_SHEET); }
  catch (e) { return { ok: false, changed: 0, wrote: 0, mismatch: 0, lines: ['통합시트를 열지 못했습니다: ' + String(e).slice(0, 60)] }; }
  if (!sh) return { ok: false, changed: 0, wrote: 0, mismatch: 0, lines: ['통합시트 [' + DASHBOARD_SHEET + '] 탭을 찾지 못했습니다'] };

  const ROW0 = 6, ROWN = 34;              // 6~39행 (fixDashTotalRun 과 같다)
  const norm = function (f) { return String(f == null ? '' : f).replace(/\s+/g, ''); };
  let changed = 0, wrote = 0, bad = 0;
  [10, 11, 12].forEach(function (mo) {
    const base = MONTH_COL[mo];
    const gCol = base + 6;                                    // +6 종합등급 (MONTH_COL 주석의 오프셋)
    const a1 = colLetter(gCol) + ROW0 + ':' + colLetter(gCol) + (ROW0 + ROWN - 1);
    const rng = sh.getRange(ROW0, gCol, ROWN, 1);
    const now = rng.getFormulas();
    const next = [];
    let d = 0, valueCells = 0, already = 0;
    for (let i = 0; i < ROWN; i++) {
      const r = ROW0 + i;
      const w = wrapGradeFormula(now[i][0], colLetter(base) + r, colLetter(base + 2) + r);
      if (w === null) { valueCells++; next.push(null); }
      else if (w === '') { already++; next.push(null); }
      else { d++; next.push(w); }
    }
    changed += d;
    if (!apply) {
      lines.push('· ' + mo + '월 ' + a1 + ' — 고칠 칸 ' + d + ' / 이미 감싼 칸 ' + already + ' / 수식 아닌 칸 ' + valueCells);
      if (d && mo === 10) { const k = next.findIndex(function (x) { return x !== null; }); lines.push('   새 수식(첫 칸): ' + next[k]); }
      return;
    }
    if (!d) { lines.push('· ' + mo + '월 ' + a1 + ' — 고칠 칸 없음'); return; }
    /* ★칸마다 쓴다★ — 값 칸이 섞여 있을 수 있어 열 통째 setFormulas 는 그 값을 지운다. 고칠 칸만 쓴다(최대 34회) */
    for (let i = 0; i < ROWN; i++) if (next[i] !== null) sh.getRange(ROW0 + i, gCol).setFormula(next[i]);
    SpreadsheetApp.flush();
    const back = sh.getRange(ROW0, gCol, ROWN, 1).getFormulas();
    let okc = 0;
    for (let i = 0; i < ROWN; i++) if (next[i] !== null && norm(back[i][0]) === norm(next[i])) okc++;
    wrote += d; bad += (d - okc);
    lines.push((okc === d ? '✓ ' : '★ ') + mo + '월 ' + a1 + ' — 썼다 ' + d + ' · 대조 ' + okc + '/' + d + (okc === d ? '' : ' ★어긋난 칸이 있습니다★'));
  });
  return { ok: true, changed: changed, wrote: wrote, mismatch: bad, lines: lines };
}
function fixGradeRun(page, apply) {
  const all = displayStores();
  const p = Math.max(0, Number(page || 0) | 0);
  const list = all.slice(p * FIX_GRADE_PER_PAGE, p * FIX_GRADE_PER_PAGE + FIX_GRADE_PER_PAGE);
  const pages = Math.ceil(all.length / FIX_GRADE_PER_PAGE);
  const t0 = Date.now();
  const lines = ['=== 종합등급 수식 감싸기 ' + (apply ? '★적용★' : '미리보기') + ' · ' + (p + 1) + '/' + pages + '쪽 (매장 ' + list.length + '곳) ==='];
  let dash = null;
  if (p === 0) {
    dash = fixGradeDashRun(apply);
    lines.push('[통합시트]');
    dash.lines.forEach(function (x) { lines.push('  ' + x); });
  }
  let stores = 0, tabs = 0, todo = 0, bad = 0;
  for (let i = 0; i < list.length; i++) {
    if (Date.now() - t0 > 40 * 1000) { lines.push('★시간이 부족해 ' + i + '곳에서 멈췄습니다 — 같은 쪽을 다시 돌리십시오★'); break; }
    const store = list[i];
    try {
      const id = storeFileId(store);
      if (!id) { lines.push('✗ ' + store + ' — 파일 ID 없음'); bad++; continue; }
      const ss2 = SpreadsheetApp.openById(id);
      /* ★대상은 새 원본 탭과 2610~ 월 탭뿐★ — 1~9월은 끝난 기록이고 본사 자물쇠라 손도 못 댄다(fixTotalFormulaRun 과 같다) */
      const names = ss2.getSheets().map(function (x) { return x.getName().trim(); })
        .filter(function (n) { return n === TPL_NEW || (/^\d{4}$/.test(n) && n >= '2610'); });
      if (!names.length) { lines.push('· ' + store + ' — 대상 탭 없음'); stores++; continue; }
      const parts = [];
      names.forEach(function (n) {
        const sh2 = ss2.getSheetByName(n);
        if (!sh2) return;
        const r = fixGradeTabIn(sh2, apply);
        if (r.mark === '✓') tabs++;
        if (r.mark === '✗') bad++;
        if (!apply && r.msg.indexOf('고칠 칸') === 0) todo++;
        parts.push(r.mark + ' ' + n + ': ' + r.msg);
      });
      lines.push('· ' + store + ' — ' + parts.join(' | '));
      stores++;
    } catch (e) { lines.push('✗ ' + store + ' — ' + String(e).slice(0, 70)); bad++; }
  }
  lines.push('매장 ' + stores + '곳 · ' + (apply ? ('감싼 탭 ' + tabs + '개') : ('고칠 탭 ' + todo + '개')) + (bad ? ' · 못 한 곳 ' + bad : '') +
    (dash ? (' · 통합시트 ' + (apply ? ('쓴 칸 ' + dash.wrote + ' · 어긋남 ' + dash.mismatch) : ('고칠 칸 ' + dash.changed))) : ''));
  if (!apply) lines.push('실제로 하려면 {apply:true} 를 붙여 다시 부르십시오 (지금은 아무것도 안 바꿨습니다)');
  if (p + 1 < pages) lines.push('다음 쪽: {page:' + (p + 1) + '}');
  return { ok: true, apply: !!apply, page: p, pages: pages, stores: stores, tabs: tabs, todo: todo, bad: bad,
    dash: dash ? { changed: dash.changed, wrote: dash.wrote, mismatch: dash.mismatch } : null, lines: lines };
}

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }

console.log('① wrapGradeFormula');
const W = wrapGradeFormula(IFS, 'H2', 'H3');
ok('감싼다', W === '=IF(OR(NOT(ISNUMBER(H2)),NOT(ISNUMBER(H3))),"",IFS(H4>=0.93,"우수",H4>=0.8,"보통",TRUE,"부적합"))', W);
ok("이미 감싼 것은 ''", wrapGradeFormula(W, 'H2', 'H3') === '');
ok("띄어쓰기가 있어도 「이미」", wrapGradeFormula('= IF( OR( NOT( ISNUMBER(H2)),NOT(ISNUMBER(H3))),"",1)', 'H2', 'H3') === '');
ok('값 칸(수식 아님)은 null', wrapGradeFormula('', 'H2', 'H3') === null && wrapGradeFormula('보통', 'H2', 'H3') === null);

console.log('② 월 탭');
reset();
let t = FILES['F-가'].getSheetByName('2610');
let r = fixGradeTabIn(t, false);
ok('미리보기 — 고칠 칸 I4 · 안 쓴다', r.mark === '·' && r.msg.indexOf('고칠 칸 I4') === 0 && t.writes === 0, r);
r = fixGradeTabIn(t, true);
ok('적용 — ✓ · H2/H3 참조로 감쌌다', r.mark === '✓' && t.f['4,9'] === W, [r, t.f['4,9']]);
r = fixGradeTabIn(t, true);
ok('다시 돌리면 「이미 감싸져 있습니다」 · 안 쓴다', r.mark === '·' && r.msg === '이미 감싸져 있습니다' && t.writes === 1, r);
t = FILES['F-나'].getSheetByName('2611');
r = fixGradeTabIn(t, true);
ok('값 칸은 손대지 않는다', r.mark === '·' && /수식이 아니라/.test(r.msg) && t.writes === 0, r);
t = FILES['F-다'].getSheetByName('2611');
r = fixGradeTabIn(t, true);
ok('MS점수 라벨이 없으면 ✗ · 안 쓴다', r.mark === '✗' && /MS점수/.test(r.msg) && t.writes === 0, r);

console.log('③ 통합시트');
reset();
r = fixGradeDashRun(false);
ok('미리보기 — 10월 33(값 칸 1 빼고) · 11월 34 · 12월 34 = 101', r.ok && r.changed === 101 && DASH.writes === 0, r);
r = fixGradeDashRun(true);
ok('적용 — 쓴 칸 101 · 어긋남 0', r.wrote === 101 && r.mismatch === 0, r);
ok('CB6 이 BV6/BX6 을 본다', DASH.f['6,80'] === '=IF(OR(NOT(ISNUMBER(BV6)),NOT(ISNUMBER(BX6))),"",IFS(CA6>=0.93,"우수",TRUE,"부적합"))', DASH.f['6,80']);
ok('CI7 이 CC7/CE7 을 본다', DASH.f['7,87'].indexOf('=IF(OR(NOT(ISNUMBER(CC7)),NOT(ISNUMBER(CE7))),"",') === 0, DASH.f['7,87']);
ok('CP39 가 CJ39/CL39 를 본다', DASH.f['39,94'].indexOf('=IF(OR(NOT(ISNUMBER(CJ39)),NOT(ISNUMBER(CL39))),"",') === 0, DASH.f['39,94']);
ok('★값 칸(CB20)은 그대로★', DASH.f['20,80'] === undefined && DASH.v['20,80'] === '보통');
r = fixGradeDashRun(true);
ok('다시 돌리면 고칠 칸 0 · 안 쓴다', r.changed === 0 && r.wrote === 0 && DASH.writes === 101, r);

console.log('④ fixGradeRun — 쪽 · 미리보기 · 대상 탭');
reset();
r = fixGradeRun(0, false);
ok('page 0 = 통합시트 + 매장 7곳 · 4쪽', r.page === 0 && r.pages === 2 || (r.pages === Math.ceil(9 / FIX_GRADE_PER_PAGE) && r.stores === 7), r);
ok('미리보기는 아무 데도 안 쓴다', DASH.writes === 0 && Object.keys(FILES).every(function (k) { return FILES[k].tabs.every(function (x) { return x.writes === 0; }); }));
ok('고칠 탭 = 7곳 × (원본 + 2610) = 14 · 2609 는 대상 아님', r.todo === 14, r);
ok('통합시트 고칠 칸 101', r.dash && r.dash.changed === 101, r.dash);
r = fixGradeRun(1, true);
ok('page 1 — 통합시트 없음 · 나머지 2곳 · 파일 없는 「자」는 못 한 곳', r.dash === null && r.stores === 1 && r.bad === 1, r);
ok('「아」 원본+2610 감쌌다(2)', r.tabs === 2 && FILES['F-아'].getSheetByName('2610').f['4,9'] === W && FILES['F-아'].getSheetByName('2609').f['4,9'] === IFS, r);
r = fixGradeRun(0, true);
ok('page 0 적용 — 「나」의 값 칸 탭은 건너뛰고 나머지 감싼다', r.tabs === 14 && r.dash.wrote === 101, r);
ok('안내 줄에 다음 쪽이 없다(마지막 쪽 아님 → 있다)', fixGradeRun(0, false).lines.some(function (l) { return l.indexOf('다음 쪽: {page:1}') === 0; }));

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
