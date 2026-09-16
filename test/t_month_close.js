
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
function impJudge(r, today, tz, ym, final) {
  const S = function (v) { return String(v == null ? '' : v).trim(); };
  const audit = S(r.audit);
  const doneNote = S(r.doneNote);
  const plan = S(r.plan);

  if (audit === '재반려') return { state: '미조치', why: '재제출한 뒤에도 다시 반려되었습니다' };
  if (audit === '반려') {
    const redo = r.redo ? dateOfCell(r.redo, tz) : '';
    if (redo && redo < today) {
      return { state: final ? '미조치' : '재제출기한 지남', why: '재제출기한 ' + redo + ' 이 지났습니다', redo: redo };
    }
    if (final) return { state: '미조치', why: '보완 기한 전에 마감했습니다', redo: redo || null };
    return { state: '반려', why: '', redo: redo || null };
  }
  if (audit === '확정') return { state: '확정', why: '' };
  if (doneNote) return { state: '완료(검수 전)', why: '' };

  /* ★기한이 먼저다★ — 진행 내용을 적었어도 조치기한이 지났으면 '기한 지남'이다 (2026-09-15 담당자) */
  const due = r.due ? dateOfCell(r.due, tz) : '';
  if (due && due < today) {
    return { state: final ? '미조치' : '기한 지남', why: '조치기한 ' + due + ' 이 지났습니다', due: due };
  }
  if (final) return { state: '미조치', why: '조치기한 전에 마감했습니다', due: due || null };
  if (plan) return { state: '진행중', why: '', due: due || null };
  return { state: '미착수', why: '', due: due || null };
}
function impRate(recs) {
  let issued = 0, done = 0, waived = 0;
  recs.forEach(function (r) {
    issued++;
    if (r.waive) { waived++; return; }
    if (r.state === '확정' || r.state === '완료(검수 전)') done++;
  });
  const denom = issued - waived;
  return {
    issued: issued, done: done, waived: waived, denom: denom,
    /* ★발행이 0건이면 null이다★ — 여기서는 '아직 모른다'는 뜻일 뿐이다. 그것을 '—'로 보일지
       '100%'로 보일지는 ★rateShown 이 QSC 점수를 보고 가른다★ (2026-09-16).
       분모가 0이면(발행은 있는데 전부 감점제외) 이 달에 따질 것이 없으므로 만점이 맞다. */
    rate: issued === 0 ? null : (denom > 0 ? Math.round((done / denom) * 100) / 100 : 1),
  };
}
function rateShown(sh, lm, rate) {
  if (rate != null) return rate;
  try {
    const q = labelValue(lm || labelMap(sh), L_QSC);
    return (typeof q.v === 'number') ? 1 : null;
  } catch (e) { return null; }
}
function impStateFormula(c, r) {
  const A = function (col) { return '$' + colLetter(col) + r; };
  const B = A(c.due), J = A(c.body), M = A(c.plan), N = A(c.done);
  const Q = A(c.audit), R = A(c.redo);
  return '=IF(' + J + '="","",' +
    'IF(' + Q + '="재반려","미조치",' +
    'IF(' + Q + '="반려",IF(AND(ISNUMBER(' + R + '),TODAY()>' + R + '),"미조치","반려"),' +
    'IF(' + Q + '="확정","확정",' +
    'IF(' + N + '<>"","완료(검수 전)",' +
    'IF(AND(ISNUMBER(' + B + '),TODAY()>' + B + '),"기한 지남",' +
    'IF(' + M + '<>"","진행중","미착수")))))))';
}
function fnMonthClose(ctx, payload) {
  const p = payload || {};
  const ym = String(p.ym || '').trim();
  const apply = p.apply === true;
  if (!validYm(ym)) return err('BAD_REQUEST', 'ym 형식이 올바르지 않습니다 (예: 2610)');

  let ss, key;
  if (p.fileId) {
    try { ss = SpreadsheetApp.openById(String(p.fileId)); }
    catch (e) { return err('BAD_REQUEST', '그 ID로 파일을 열지 못했습니다'); }
    if (String(ss.getName()).indexOf('_연동테스트') < 0) {
      return err('FORBIDDEN', '파일 ID로는 이름에 _연동테스트가 있는 사본만 다룰 수 있습니다: ' + ss.getName());
    }
    key = ss.getName();
  } else {
    const store = normStore(p.store || '');
    if (!store) return err('BAD_REQUEST', '매장을 지정해 주세요');
    const id = storeFileId(store);
    if (!id) return err('NOT_FOUND', '매장 파일을 찾지 못했습니다.');
    ss = SpreadsheetApp.openById(id);
    key = store;
  }

  const sh = ss.getSheetByName(ym);
  if (!sh) return err('NOT_FOUND', ym + ' 탭이 없습니다.');
  const g = impGeo(sh);
  if (!g.isNew) return err('CONFLICT', '이 달 탭은 아직 새 서식이 아닙니다 — 확정할 수 없습니다.');

  const already = monthClosedAt(ss, ym);
  if (already && !p.again) {
    return err('CONFLICT', ym + '은 이미 ' + already + '에 확정했습니다. 다시 확정하시려면 담당자에게 문의해 주세요.');
  }

  const tz = fileTz(ss);
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const n = g.endRow - g.row0 + 1;
  if (n <= 0) return err('CONFLICT', '표 본문이 비어 있습니다');

  const rng = grid(sh, g.row0, 2, n, Math.max(14, g.last - 1));
  if (!rng) return err('SERVER_ERROR', '표를 읽지 못했습니다');
  const vals = rng.getValues();
  const at = function (row, col) { return row[col - 2]; };

  const judged = [], plan = [], pending = [];
  const auditCol = [], stateCol = [];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    const row = g.row0 + i;
    const body = String(at(v, g.body) == null ? '' : at(v, g.body)).trim();
    if (!body) { auditCol.push([at(v, g.audit)]); stateCol.push(['']); continue; }

    let audit = String(at(v, g.audit) == null ? '' : at(v, g.audit)).trim();
    const doneNote = String(at(v, g.done) == null ? '' : at(v, g.done)).trim();
    /* ① 미검수 자동확정 — 완료 보고가 있는데 검수를 안 한 건 */
    if (!audit && doneNote) { audit = '확정'; plan.push(row + '행 자동확정'); }

    const cellIn = {
      audit: audit, redo: at(v, g.redo), doneNote: doneNote,
      plan: at(v, g.plan), due: at(v, g.due),
    };
    const jd = impJudge(cellIn, today, tz, ym, true);

    const waive = at(v, g.waive) === true;
    judged.push({ state: jd.state, waive: waive });

    /* ④ 기한이 남은 미완료 — 오늘 기준(final=false)으로 반려·진행중·미착수면 아직 기한 안이다.
       ★확정하면 이 건도 미조치다★ — 그래서 먼저 보여 주고 force 로만 마감한다(아래) */
    if (!waive) {
      const live = impJudge(cellIn, today, tz, ym, false);
      const left = live.state === '반려' ? live.redo
        : (live.state === '진행중' || live.state === '미착수') ? live.due : null;
      if (left) pending.push({ no: i + 1, row: row, state: live.state, due: left });
    }

    auditCol.push([audit]);
    stateCol.push([jd.state]);   // ② 상태를 값으로
  }

  const calc = impRate(judged);
  /* 0건이어도 점검을 한 달이면 100%다 — 시트·화면·확정이 ★같은 값★을 써야 한다 (rateShown).
     여기서 한 번 갈아 두면 아래의 안내문·시트 기록·응답이 전부 같은 값을 쓴다. */
  calc.rate = rateShown(sh, null, calc.rate);
  const lastDue = pending.reduce(function (a, x) { return x.due > a ? x.due : a; }, '');
  plan.push('개선율 ' + (calc.rate == null ? '—' : Math.round(calc.rate * 100) + '%') +
    ' (발행 ' + calc.issued + ' · 완료 ' + calc.done + ' · 제외 ' + calc.waived + ' · 분모 ' + calc.denom + ')');
  if (pending.length) {
    plan.push('★기한이 남은 미완료 ' + pending.length + '건 (마지막 기한 ' + lastDue + ') — 지금 확정하면 미조치로 칩니다★');
  }
  plan.push('매장 칸을 모두 잠급니다 (다음 달로 넘기는 이월은 없습니다)');

  if (!apply) {
    return { ok: true, dry: true, store: key, ym: ym, plan: plan, rate: calc,
      pending: pending, lastDue: lastDue || null, closedAt: already || null };
  }
  /* ★기한이 남은 미완료가 있으면 force 없이는 확정하지 않는다★ (2026-09-15 담당자)
     기다릴지 마감할지는 사람이 고른다 — 점장이 없어 기다려도 소용없는 매장은 그대로 마감한다.
     화면(store-app.js)이 미리보기의 pending 을 보여 한 번 더 묻고 force:true 로 다시 부른다. */
  if (pending.length && p.force !== true) {
    return err('CONFLICT', '기한이 남은 미완료 ' + pending.length + '건이 있습니다 (마지막 기한 ' + lastDue +
      '). 기다리시거나, 그래도 마감하시려면 확정을 다시 눌러 주세요.');
  }

  const lock = LockService.getScriptLock();
  let got = false;
  try { got = lock.tryLock(25000); } catch (e) { got = false; }
  if (!got) return err('CONFLICT', '다른 처리가 진행 중입니다. 잠시 후 다시 시도해 주세요.');
  try {
    /* ★잠그기 전에 쓴다★ — 순서를 뒤집으면 보호가 걸린 뒤라 스크립트가 자기 글을 못 쓴다.
       (스크립트는 보호 편집자로 들어가지만, 그 등록이 실패하는 파일이 하나라도 있으면
       그 매장만 조용히 빈 채로 확정된다) */
    grid(sh, g.row0, g.audit, n, 1).setValues(auditCol);
    grid(sh, g.row0, g.state, n, 1).setValues(stateCol);

    const lm = labelMap(sh);
    const pr = labelValue(lm, L_RATE);
    if (pr.found && pr.row) {
      try { grid(sh, pr.row, pr.col, 1, 1).setValue(calc.rate); } catch (e) { }
    }
    SpreadsheetApp.flush();

    const lk = lockMonthTab(sh, []);   // 이월이 없으므로 매장 칸을 모두 잠근다
    PROPS.setProperty(MC_PREFIX + ss.getId() + ':' + ym, today);
    if (!p.fileId) dropStoreCache(key, ym);

    return {
      ok: true, dry: false, store: key, ym: ym, closedAt: today,
      rate: calc, forced: pending.length, plan: plan,
      lock: lk.ok ? '잠금 ✓' : ('★잠그지 못했습니다 — ' + lk.why + '★'),
    };
  } finally {
    try { lock.releaseLock(); } catch (e) { }
  }
}

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

const f = impStateFormula({ due: 2, body: 10, plan: 13, done: 14, audit: 17, redo: 18 }, 12);
ok('④ 수식: 「기한 지남」 판정이 「진행중」보다 앞', f.indexOf('"기한 지남"') > 0 && f.indexOf('"기한 지남"') < f.indexOf('"진행중"'), f);
ok('④ 수식 괄호 짝', (f.match(/\(/g) || []).length === (f.match(/\)/g) || []).length, f);

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

console.log('JS ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
