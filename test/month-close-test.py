# -*- coding: utf-8 -*-
"""개선요청 판정 — 기한만 본다 · 이월 없음 · 월 채점 확정은 기한 남은 미완료가 있으면 멈춘다 (2026-09-15)

★Code.gs 의 진짜 impJudge · impRate · impStateFormula · fnMonthClose 를 잘라내서 돌린다★ (사본 아님).
시트·잠금·속성은 가짜로 끼운다.

왜: 담당자 *"예정일 적으나마나 그건 관리자입장에서 알빠 아니야 … 그냥 기한을 넘냐 안넘느냐만 보면 되잖아"* ·
월별 평가라 다음 달로 넘기는 이월을 없앴고, 기한이 남은 미완료가 있으면 확정 전에 묻는다
(점장이 없는 매장은 그래도 마감한다 — force).

보는 것:
  ① 판정: 진행 내용이 있어도 기한이 지나면 「기한 지남」 · 진행 내용 맨 앞 날짜(예정일)는 안 본다
  ② 확정(final): 완료가 아닌 건은 전부 「미조치」
  ③ 개선율: 분모 = 발행 − 감점제외 (이월 없음)
  ④ 시트 수식: 「기한 지남」 판정이 「진행중」보다 먼저
  ⑤ 월 채점 확정: 미리보기에 기한 남은 미완료 · force 없으면 CONFLICT(안 씀) · force 면 미조치로 쓰고 전부 잠금
  ⑥ 소스에 「예정일 지남」·dueDateOf·daysBetween·rolledOnce 가 남지 않았다
  ⑦ (2026-09-17 J1·J9) 완료 제출일(옛 이월 칸 T) — 기한 뒤 완료는 「기한 후 완료」 · 개선율 분자 아님 ·
     확정 때 미조치 · 보완본은 「완료(검수 전)」 · 확정 때 기한 뒤 완료는 자동확정 안 함 · 보완본은 자동확정
  ⑧ (J1·J9) ★시트 상태 수식과 서버 판정이 같은 답을 내는가★ — 수식을 작은 계산기로 돌려 무작위 3000건 대조
"""
import io, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
APP = HERE.parents[1]
SRC = APP / 'backend' / 'Code.gs'
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_month_close.js'
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


py_fail = 0


def pyok(name, cond):
    global py_fail
    print(('  ✓ ' if cond else '  ✗ ') + name)
    if not cond:
        py_fail += 1


app = io.open(APP / 'js' / 'store-app.js', 'r', encoding='utf-8', newline='').read()
menu = io.open(APP / 'js' / 'menu.js', 'r', encoding='utf-8', newline='').read()
pyok('⑥ Code.gs 에 「예정일 지남」 없음', '예정일 지남' not in src)
pyok('⑥ store-app.js · menu.js 에 「예정일 지남」 없음', '예정일 지남' not in app and '예정일 지남' not in menu)
pyok('⑥ Code.gs 에 dueDateOf · daysBetween · rolledOnce 없음',
     all(w not in src for w in ('dueDateOf', 'daysBetween', 'rolledOnce')))
pyok('⑤ 화면이 확정 때 force 를 보낸다', 'force: force' in app)

js = r'''
const T = '2026-10-20', TZ = 'Asia/Seoul';
function dateOfCell(v) { return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : ''; }
function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

const G = { ok: true, isNew: true, row0: 12, endRow: 16, last: 20,
  due: 2, state: 3, body: 10, plan: 13, done: 14, audit: 17, redo: 18, waive: 19, roll: 20 };
let VALS = [], writes = [], locked = null, props = {};
const sh = {};
const ss = { getSheetByName: function () { return sh; }, getId: function () { return 'FILE1'; }, getName: function () { return '샘플매장'; } };
const SpreadsheetApp = { openById: function () { return ss; }, flush: function () {} };
const Utilities = { formatDate: function () { return T; } };
const LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
const PROPS = { setProperty: function (k, v) { props[k] = v; } };
/* L_QSC 는 rateShown 이 쓴다 — ★이 harness 의 labelValue 는 .v 를 안 주므로★ 0건일 때
   100%로 올리는 갈래는 여기서 타지 않는다(그쪽은 test/total-formula-test.py 가 본다).
   여기서 필요한 것은 fnMonthClose 가 rateShown 을 불러도 ★멈추지 않는다★는 것뿐이다. */
const MC_PREFIX = 'MC:', L_RATE = ['개선율'], L_QSC = ['QSC점수'];
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function validYm(ym) { return /^\d{4}$/.test(ym); }
// 2026-09-26 — fnMonthClose 가 「아직 시작하지 않은 달」을 거절한다. 시험의 「이번 달」은 10월(2610)로 고정한다.
function curYymm() { return '2610'; }
function ymLabel(ym) { return '20' + String(ym).slice(0, 2) + '년 ' + Number(String(ym).slice(2, 4)) + '월'; }
function normStore(s) { return String(s || '').trim(); }
function storeFileId() { return 'FILE1'; }
function impGeo() { return G; }
function monthClosedAt() { return ''; }
function fileTz() { return TZ; }
function grid(s, r, c, nr, nc) {
  return {
    getValues: function () { return VALS; },
    setValues: function (x) { writes.push({ col: c, vals: x }); },
    setValue: function (x) { writes.push({ col: c, val: x }); },
  };
}
function labelMap() { return {}; }
function labelValue() { return { found: true, row: 9, col: 9 }; }
function lockMonthTab(s, rows) { locked = rows; return { ok: true }; }
function dropStoreCache() {}
''' + cut('impJudge') + '\n' + cut('impRate') + '\n' + cut('rateShown') + '\n' + cut('impStateFormula') + '\n' + cut('fnMonthClose') + r'''

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); }
}
const J = function (r, fin) { return impJudge(r, T, TZ, '2610', !!fin).state; };

ok('① 진행 내용 있음 + 기한 지남 → 기한 지남', J({ plan: '업체에 청소 요청함', due: '2026-10-10' }) === '기한 지남');
ok('① 진행 내용 맨 앞 날짜가 지났어도 기한 전이면 진행중 (예정일 안 봄)', J({ plan: '10/15 매대 교체 예정', due: '2026-11-01' }) === '진행중');
ok('① 진행 내용 없음 + 기한 전 → 미착수', J({ due: '2026-11-01' }) === '미착수');
ok('① 기한 당일은 아직 기한 안', J({ plan: 'x', due: T }) === '진행중');
ok('① 완료 내용 있음 → 완료(검수 전)', J({ plan: 'x', doneNote: '청소함', due: '2026-10-01' }) === '완료(검수 전)');
ok('① 보완 요청 + 보완 기한 전 → 반려', J({ audit: '반려', redo: '2026-10-25' }) === '반려');
ok('① 보완 요청 + 보완 기한 지남 → 재제출기한 지남', J({ audit: '반려', redo: '2026-10-19' }) === '재제출기한 지남');
ok('② 확정: 진행중(기한 전) → 미조치', J({ plan: 'x', due: '2026-11-01' }, true) === '미조치');
ok('② 확정: 미착수(기한 전) → 미조치', J({ due: '2026-11-01' }, true) === '미조치');
ok('② 확정: 반려(보완 기한 전) → 미조치', J({ audit: '반려', redo: '2026-10-25' }, true) === '미조치');
ok('② 확정: 기한 지남 → 미조치', J({ due: '2026-10-01' }, true) === '미조치');
ok('② 확정: 검수 확정 → 확정', J({ audit: '확정', doneNote: 'x' }, true) === '확정');

const rt = impRate([{ state: '확정' }, { state: '진행중' }, { state: '미착수' }, { state: '반려' }, { state: '진행중', waive: true }]);
ok('③ 분모 = 발행 5 − 감점제외 1 = 4', rt.issued === 5 && rt.waived === 1 && rt.denom === 4, rt);
ok('③ 개선율 1/4 = 0.25 (진행중·반려도 분모에 남는다)', rt.rate === 0.25, rt);
ok('③ rolled 칸 없음', !('rolled' in rt), rt);
ok('③ 발행 0건 → null', impRate([]).rate === null);

console.log('⑦ 완료 제출일 (J1·J9)');
ok('⑦ 조치기한 안에 올린 완료 → 완료(검수 전)', J({ doneNote: '함', due: '2026-10-15', sub: '2026-10-15' }) === '완료(검수 전)');
ok('⑦ 조치기한 뒤에 올린 완료 → 기한 후 완료', J({ doneNote: '함', due: '2026-10-15', sub: '2026-10-16' }) === '기한 후 완료');
ok('⑦ 기한 후 완료 why 는 조치기한 · 개선율 안내', impJudge({ doneNote: '함', due: '2026-10-15', sub: '2026-10-16' }, T, TZ, '2610', false).why ===
   '조치기한 2026-10-15 이 지난 뒤 완료했습니다 — 개선율에는 넣지 않습니다');
ok('⑦ 제출일 없음(규칙 전 완료) → 기한 안으로 본다', J({ doneNote: '함', due: '2026-10-01' }) === '완료(검수 전)');
ok('⑦ 제출일이 숫자 1(옛 이월 표시) → 날짜로 안 본다', J({ doneNote: '함', due: '2026-10-01', sub: 1 }) === '완료(검수 전)');
ok('⑦ 완료 칸이 비면 제출일을 안 본다', J({ plan: 'x', due: '2026-11-01', sub: '2026-11-05' }) === '진행중');
ok('⑦ 검수 확정이어도 기한 뒤 완료면 기한 후 완료', J({ audit: '확정', doneNote: '함', due: '2026-10-15', sub: '2026-10-18' }) === '기한 후 완료');
ok('⑦ 확정(final): 기한 후 완료 → 미조치', J({ doneNote: '함', due: '2026-10-15', sub: '2026-10-18' }, true) === '미조치');
ok('⑦ 확정(final): 기한 안 완료 + 검수 확정 → 확정', J({ audit: '확정', doneNote: '함', due: '2026-10-15', sub: '2026-10-15' }, true) === '확정');
ok('⑦ 보완 요청 뒤 보완본(보완 기한 안) → 완료(검수 전) · resub', (function () {
  const x = impJudge({ audit: '반려', redo: '2026-10-19', doneNote: '다시 함', sub: '2026-10-18', due: '2026-10-01' }, T, TZ, '2610', false);
  return x.state === '완료(검수 전)' && x.resub === true; })());
ok('⑦ ★보완본이 있으면 보완 기한이 지나도 「재제출기한 지남」이 아니다★', J({ audit: '반려', redo: '2026-10-19', doneNote: '다시 함', sub: '2026-10-19' }) === '완료(검수 전)');
ok('⑦ 보완본을 보완 기한 뒤에 올림 → 기한 후 완료 (why 는 보완 기한)', (function () {
  const x = impJudge({ audit: '반려', redo: '2026-10-19', doneNote: '다시 함', sub: '2026-10-20' }, T, TZ, '2610', false);
  return x.state === '기한 후 완료' && x.resub === true && x.why.indexOf('보완 기한 2026-10-19') === 0; })());
ok('⑦ 보완본 없음 + 보완 기한 지남 → 재제출기한 지남 · why 는 「보완 기한 … 이 지났습니다」', (function () {
  const x = impJudge({ audit: '반려', redo: '2026-10-19', doneNote: '처음 것' }, T, TZ, '2610', false);
  return x.state === '재제출기한 지남' && x.why === '보완 기한 2026-10-19 이 지났습니다'; })());
ok('⑦ 확정 뒤에도 재제출기한이 남아 있으면 그것과 견준다 (보완본 기한 안 → 확정)', J({ audit: '확정', redo: '2026-10-19', due: '2026-10-01', doneNote: 'x', sub: '2026-10-12' }) === '확정');
ok('⑦ 재반려(미조치 처리) → 미조치 · 새 문구', (function () {
  const x = impJudge({ audit: '재반려', doneNote: 'x' }, T, TZ, '2610', false);
  return x.state === '미조치' && x.why === '보완 요청 뒤 미조치로 처리되었습니다'; })());
ok('⑦ 옛 문구(재제출한 뒤에도·재제출기한 …이 지났습니다)가 Code.gs 판정에 없다',
   impJudge.toString().indexOf('재제출한 뒤에도') < 0 && impJudge.toString().indexOf("'재제출기한 ' +") < 0);
const rt2 = impRate([{ state: '확정' }, { state: '기한 후 완료' }, { state: '완료(검수 전)' }, { state: '미착수' }]);
ok('⑦ 개선율: 기한 후 완료는 분자 아님 · 분모엔 남음 (2/4)', rt2.done === 2 && rt2.denom === 4 && rt2.rate === 0.5, rt2);

const f = impStateFormula({ due: 2, body: 10, plan: 13, done: 14, audit: 17, redo: 18, roll: 20 }, 12);
ok('④ 수식: 「기한 지남」 판정이 「진행중」보다 앞', f.indexOf('"기한 지남"') > 0 && f.indexOf('"기한 지남"') < f.indexOf('"진행중"'), f);
ok('④ 수식 괄호 짝', (f.match(/\(/g) || []).length === (f.match(/\)/g) || []).length, f);
ok('④ 수식: 보완 기한 지난 반려는 월중에 「재제출기한 지남」 (impJudge 와 같음 · 미조치 아님)',
   f.indexOf('"재제출기한 지남","반려"') > 0 && f.indexOf('),"미조치","반려")') < 0, f);
ok('④ 수식: 제출일 칸(T) 을 본다', f.indexOf('$T12') > 0, f);
const f0 = impStateFormula({ due: 2, body: 10, plan: 13, done: 14, audit: 17, redo: 18 }, 12);
ok('④ 수식: 제출일 칸을 모르면 FALSE 로 두고 깨지지 않는다', f0.indexOf('$T') < 0 && f0.indexOf('$12') < 0 &&
   (f0.match(/\(/g) || []).length === (f0.match(/\)/g) || []).length, f0);

/* ⑧ ★시트 수식 ↔ 서버 판정 무작위 대조★ — 수식 글자를 JS 로 옮겨 계산한다.
   날짜는 시트처럼 일련번호(숫자), 빈 칸은 "" 다. 수식에 나오는 것은 IF·AND·ISNUMBER·TODAY·비교뿐이다. */
function serial(s) { const p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5 + 25569; }
function IF(c, a, b) { return c ? a : b; }
function AND() { for (let i = 0; i < arguments.length; i++) if (!arguments[i]) return false; return true; }
function ISNUMBER(v) { return typeof v === 'number'; }
function evalFormula(fml, cells) {
  const js = fml.slice(1)
    .replace(/\$([A-Z]+)12/g, function (_, col) { return 'C.' + col; })
    .replace(/<>/g, '!=').replace(/([^!<>=])=(?!=)/g, '$1==')
    .replace(/TODAY\(\)/g, 'TODAY').replace(/\bFALSE\b/g, 'false');
  return Function('C', 'TODAY', 'IF', 'AND', 'ISNUMBER', 'return (' + js + ');')(cells, serial(T), IF, AND, ISNUMBER);
}
const DAYS = ['2026-10-10', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-25'];
let seed = 7;
/* ★윗자리를 쓴다★ — 2의 거듭제곱으로 나누는 LCG 는 아랫자리 주기가 짧아(맨 아래 비트는 0,1 반복)
   항목끼리 묶여 나와 어떤 조합은 영영 안 나온다. 한 번 그렇게 헛통과했다(수식을 망가뜨려도 통과). */
function rnd(n) { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor(seed / 65536) % n; }
function pick(arr) { return arr[rnd(arr.length)]; }
let same = 0, diff = [];
for (let k = 0; k < 3000; k++) {
  const c = {
    audit: pick(['', '', '확정', '반려', '재반려']), doneNote: pick(['', '함']), plan: pick(['', 'x']),
    due: pick(['', ...DAYS]), redo: pick(['', '', ...DAYS]), sub: pick(['', '', ...DAYS]),
  };
  const server = impJudge(c, T, TZ, '2610', false).state;
  const toCell = function (v) { return v ? serial(v) : ''; };
  const sheet = evalFormula(f, { J: '문장', B: toCell(c.due), M: c.plan, N: c.doneNote, Q: c.audit, R: toCell(c.redo), T: toCell(c.sub) });
  if (server === sheet) same++; else if (diff.length < 5) diff.push({ c: c, server: server, sheet: sheet });
}
ok('⑧ 수식 = 서버 판정 (무작위 3000건)', same === 3000, diff);
/* ★대조군★ — 수식 한 조각(보완본 기한 뒤 → 기한 후 완료)을 망가뜨리면 어긋남이 잡혀야 한다.
   안 잡히면 위 3000건 대조가 그 갈래를 한 번도 안 돈 것이다. */
seed = 7; let caught = 0;
const broken = f.split('"기한 후 완료","완료(검수 전)"').join('"완료(검수 전)","완료(검수 전)"');
for (let k = 0; k < 3000; k++) {
  const c = {
    audit: pick(['', '', '확정', '반려', '재반려']), doneNote: pick(['', '함']), plan: pick(['', 'x']),
    due: pick(['', ...DAYS]), redo: pick(['', '', ...DAYS]), sub: pick(['', '', ...DAYS]),
  };
  const toCell = function (v) { return v ? serial(v) : ''; };
  const sheet = evalFormula(broken, { J: '문장', B: toCell(c.due), M: c.plan, N: c.doneNote, Q: c.audit, R: toCell(c.redo), T: toCell(c.sub) });
  if (sheet !== impJudge(c, T, TZ, '2610', false).state) caught++;
}
ok('⑧ 대조군: 수식을 망가뜨리면 어긋남이 잡힌다', broken !== f && caught > 0, caught);
ok('⑧ 계산기가 수식을 실제로 돌렸다 (빈 본문 → 빈칸)', evalFormula(f, { J: '', B: '', M: '', N: '', Q: '', R: '', T: '' }) === '');

function row(o) {
  const v = new Array(19).fill('');
  Object.keys(o).forEach(function (k) { v[G[k] - 2] = o[k]; });
  return v;
}
function ROWS() {
  return [
    row({ body: '제빙기 청소 미흡', done: '청소함' }),                                  // 1 완료 보고만 → 자동확정
    row({ body: '냉장고 온도 기록 누락', plan: '10/15 교체 예정', due: '2026-11-01' }),   // 2 진행중 · 기한 남음
    row({ body: '바닥 물기', due: '2026-10-01' }),                                       // 3 기한 지남
    row({ body: '후드 기름때', audit: '반려', redo: '2026-10-27', done: '1차 청소' }),    // 4 보완 요청 · 보완 기한 남음
    row({}),                                                                              // 5 빈 줄
  ];
}
function reset(rows) { VALS = rows; writes = []; locked = null; props = {}; }
const ctx = { role: '관리자', id: 'admin' };

reset(ROWS());
// 2026-09-26 — 아직 시작하지 않은 달(이번 달 2610 기준 2611)은 실제 매장에서 확정할 수 없다 · 아무것도 쓰지 않는다
const fut = fnMonthClose(ctx, { store: '샘플매장', ym: '2611', apply: true });
ok('⑤-0 시작 안 한 달 확정은 거절 · 안 씀', fut && fut.ok === false && fut.code === 'BAD_REQUEST' && /시작하지 않은 달/.test(fut.error)
   && writes.length === 0 && Object.keys(props).length === 0, fut);
reset(ROWS());
const pv = fnMonthClose(ctx, { store: '샘플매장', ym: '2610' });
ok('⑤ 미리보기 ok', pv.ok && pv.dry, pv);
ok('⑤ 기한 남은 미완료 2건 (2번 진행중 · 4번 반려)', pv.pending && pv.pending.length === 2 &&
  pv.pending[0].no === 2 && pv.pending[0].state === '진행중' && pv.pending[1].no === 4 && pv.pending[1].state === '반려', pv.pending);
ok('⑤ 마지막 기한 2026-11-01', pv.lastDue === '2026-11-01', pv.lastDue);
ok('⑤ 미리보기 안내 줄', pv.plan.some(function (x) { return x.indexOf('기한이 남은 미완료 2건') >= 0; }), pv.plan);
ok('⑤ 미리보기는 안 쓰고 안 잠근다', writes.length === 0 && locked === null, writes);

reset(ROWS());
const r1 = fnMonthClose(ctx, { store: '샘플매장', ym: '2610', apply: true });
ok('⑤ force 없이 적용 → CONFLICT', !r1.ok && r1.code === 'CONFLICT', r1);
ok('⑤ CONFLICT 때 안 쓰고 · 안 잠그고 · 확정 기록 없음', writes.length === 0 && locked === null && Object.keys(props).length === 0, { writes: writes, props: props });

reset(ROWS());
const r2 = fnMonthClose(ctx, { store: '샘플매장', ym: '2610', apply: true, force: true });
ok('⑤ force 적용 → ok', r2.ok && !r2.dry, r2);
const st = writes.filter(function (w) { return w.col === G.state; })[0];
ok('⑤ 상태 값: 확정 · 미조치 · 미조치 · 미조치 · 빈칸', st && JSON.stringify(st.vals) === JSON.stringify([['확정'], ['미조치'], ['미조치'], ['미조치'], ['']]), st);
const au = writes.filter(function (w) { return w.col === G.audit; })[0];
ok('⑤ 완료 보고만 있던 1번은 검수 칸에 확정', au && au.vals[0][0] === '확정', au);
ok('⑤ 이월 칸은 안 쓴다', !writes.some(function (w) { return w.col === G.roll; }), writes);
ok('⑤ 개선율 0.25 기입', writes.some(function (w) { return w.val === 0.25; }) && r2.rate.rate === 0.25, r2.rate);
ok('⑤ 매장 칸을 모두 잠근다 (열어 둘 줄 없음)', Array.isArray(locked) && locked.length === 0, locked);
ok('⑤ 확정 기록', props['MC:FILE1:2610'] === T, props);
ok('⑤ 응답에 마감한 미완료 수', r2.forced === 2 && !('rolled' in r2), r2);

reset([row({ body: 'a', done: '함' }), row({ body: 'b', plan: 'x', due: '2026-10-05' }), row({}), row({}), row({})]);
const r3 = fnMonthClose(ctx, { store: '샘플매장', ym: '2610', apply: true });
ok('⑤ 기한 남은 미완료가 없으면 force 없이 확정', r3.ok && !r3.dry, r3);

/* ⑦ 확정 — 기한 뒤 완료 · 보완본 (J1·J9) */
reset([
  row({ body: 'a', done: '함', due: '2026-10-10', roll: '2026-10-09' }),                          // 기한 안 완료 → 자동확정
  row({ body: 'b', done: '늦게 함', due: '2026-10-10', roll: '2026-10-12' }),                     // 기한 뒤 완료 → 미조치
  row({ body: 'c', done: '보완함', audit: '반려', redo: '2026-10-19', roll: '2026-10-18' }),        // 보완본(기한 안) → 자동확정
  row({ body: 'd', done: '보완 늦음', audit: '반려', redo: '2026-10-15', roll: '2026-10-17' }),     // 보완본(기한 뒤) → 미조치
  row({}),
]);
const r4 = fnMonthClose(ctx, { store: '샘플매장', ym: '2610', apply: true });
ok('⑦ 확정 ok (기한 남은 미완료 없음)', r4.ok && !r4.dry, r4);
const st4 = writes.filter(function (w) { return w.col === G.state; })[0];
ok('⑦ 상태: 확정 · 미조치 · 확정 · 미조치 · 빈칸', st4 && JSON.stringify(st4.vals) === JSON.stringify([['확정'], ['미조치'], ['확정'], ['미조치'], ['']]), st4);
const au4 = writes.filter(function (w) { return w.col === G.audit; })[0];
ok('⑦ 검수 칸: 기한 안 완료·보완본은 확정 도장 · 기한 뒤 완료는 그대로', au4 && JSON.stringify(au4.vals) === JSON.stringify([['확정'], [''], ['확정'], ['반려'], ['']]), au4);
ok('⑦ 개선율 2/4 = 0.5', r4.rate.rate === 0.5 && r4.rate.done === 2, r4.rate);
ok('⑦ 제출일 칸(T)은 확정이 쓰지 않는다', !writes.some(function (w) { return w.col === G.roll; }), writes);

console.log('JS ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout, end='')
if r.stderr:
    print(r.stderr)
print('PY %d 실패' % py_fail)
sys.exit(1 if (r.returncode or py_fail) else 0)
