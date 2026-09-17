# -*- coding: utf-8 -*-
"""admin.fixGrade — 종합등급 수식을 「QSC·MS 둘 다 숫자일 때만」으로 감싼다 (2026-09-17 담당자 ②-5a)

★Code.gs 의 진짜 wrapGradeFormula · fixGradeTabIn · fixGradeDashRun · fixGradeRun · colLetter 를 잘라내서 돌린다★ (사본 아님).

왜: 종합 수식이 「채워진 것부터 더하기」로 바뀐 뒤 QSC 만 있어도 종합이 숫자가 됐고, 시트의 등급 수식이 월중에
    「부적합」을 붙였다(카페 라 2612 실물). 매장 파일·통합시트가 공개라 매장이 본다.

보는 것:
  ① wrapGradeFormula — 감싸기 · 이미 감싼 것은 '' · 값 칸은 null
  ② 월 탭 — 라벨로 찾은 QSC점수·MS점수 칸을 참조해 감싼다 · 다시 돌리면 「이미」 · 값 칸은 손대지 않음 · 쓴 뒤 다시 읽어 대조
  ③ 통합시트 — 10·11·12월 종합등급 열(CB·CI·CP = MONTH_COL+6) 6~39행이 BV/BX 를 보게 · 값 칸은 그대로 · 고칠 칸만 쓴다
  ④ 미리보기는 아무것도 안 쓴다 · page 0 만 통합시트 · 7곳씩 4쪽 · 대상 탭은 새 원본 + 2610~
  ⑤ 등록표 'admin.fixGrade' — ADMIN_MENU 쓰기 · fn fnFixGrade
"""
import io, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_fix_grade.js'
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


def cutconst(prefix):
    return next(l for l in lines if l.startswith(prefix))


py_fail = 0


def pyok(name, cond):
    global py_fail
    print(('  ✓ ' if cond else '  ✗ ') + name)
    if not cond:
        py_fail += 1


reg = re.search(r"'admin\.fixGrade':\s*\{[^}]*\}", src)
pyok("⑤ 등록표 admin.fixGrade — ADMIN_MENU · 쓰기 · fnFixGrade",
     bool(reg) and 'menu: ADMIN_MENU' in reg.group(0) and "act: '쓰기'" in reg.group(0) and 'fn: fnFixGrade' in reg.group(0))

body = '\n'.join([cutconst('const FIX_GRADE_PER_PAGE '), cutconst('const GRADE_WRAP_RE '),
                  cut('colLetter'), cut('wrapGradeFormula'), cut('fixGradeTabIn'), cut('fixGradeDashRun'), cut('fixGradeRun')])

js = r'''
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
''' + body + r'''

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
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
if py_fail or res.returncode != 0:
    sys.exit(1)
