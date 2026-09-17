
const T = '2026-10-20', TZ = 'Asia/Seoul';
function dateOfCell(v) { return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : ''; }
const Utilities = { formatDate: function () { return T; } };
const L_QSC = ['QSC점수'];
/* 새 서식 자리 — 열 번호 그대로(impCols 가 주는 모양). 줄 배열은 B열(2)부터 담는다: index = col - 2 */
const G = { isNew: true, row0: 12, endRow: 15, last: 20, due: 2, state: 3, body: 10, plan: 13, done: 14,
  audit: 17, redo: 18, waive: 19, roll: 20 };
function impGeo() { return G; }
let VALS = [];
function grid(sh, r, c, nr, nc) { return { getValues: function () { return VALS; }, setValue: function () {} }; }
function labelMap() { return {}; }
function labelValue() { return { found: false }; }     // 개선율 칸 없음 — 건수만 본다
const WROTE = {};
function writeCount(sh, lm, names, n) { WROTE[names[0]] = n; }
function mkRow(o) {
  const a = new Array(19).fill('');
  a[G.due - 2] = o.due || ''; a[G.body - 2] = (o.body === undefined ? '지적' : o.body); a[G.plan - 2] = o.plan || ''; a[G.done - 2] = o.done || '';
  a[G.audit - 2] = o.audit || ''; a[G.redo - 2] = o.redo || ''; a[G.waive - 2] = !!o.waive; a[G.roll - 2] = o.sub || '';
  return a;
}
function impJudge(r, today, tz, ym, final) {
  const S = function (v) { return String(v == null ? '' : v).trim(); };
  const audit = S(r.audit);
  const doneNote = S(r.doneNote);
  const plan = S(r.plan);
  const due = r.due ? dateOfCell(r.due, tz) : '';
  const redo = r.redo ? dateOfCell(r.redo, tz) : '';
  /* ★날짜 모양일 때만 쓴다★ — 시트 수식의 ISNUMBER 와 같은 뜻. 옛 이월 표시(숫자 1)가 남은 칸을 날짜로 읽지 않는다 */
  const D = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
  const sub = (doneNote && r.sub) ? D(dateOfCell(r.sub, tz)) : '';
  const limit = D(redo) || D(due);
  const late = !!(sub && limit && sub > limit);
  const lateWhy = (D(redo) ? '보완 기한 ' : '조치기한 ') + limit + ' 이 지난 뒤 완료했습니다 — 개선율에는 넣지 않습니다';

  /* '재반려' = 「미조치 처리」 버튼 (J16 · 보완 요청은 한 번만). 값 이름은 옛 탭의 검수 목록과 맞추려고 그대로 둔다 */
  if (audit === '재반려') return { state: '미조치', why: '보완 요청 뒤 미조치로 처리되었습니다' };
  if (audit === '반려') {
    if (sub) {   // 보완본이 올라왔다
      if (late) return { state: final ? '미조치' : '기한 후 완료', why: lateWhy, redo: redo || null, resub: true, late: true };
      return { state: '완료(검수 전)', why: '', redo: redo || null, resub: true };
    }
    if (redo && redo < today) {
      return { state: final ? '미조치' : '재제출기한 지남', why: '보완 기한 ' + redo + ' 이 지났습니다', redo: redo };
    }
    if (final) return { state: '미조치', why: '보완 기한 전에 마감했습니다', redo: redo || null };
    return { state: '반려', why: '', redo: redo || null };
  }
  if (late) return { state: final ? '미조치' : '기한 후 완료', why: lateWhy, due: due || null, late: true };
  if (audit === '확정') return { state: '확정', why: '' };
  if (doneNote) return { state: '완료(검수 전)', why: '' };

  /* ★기한이 먼저다★ — 진행 내용을 적었어도 조치기한이 지났으면 '기한 지남'이다 (2026-09-15 담당자) */
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
function recountSummary(sh, tz) {
  const g = impGeo(sh);
  const at = function (row, col) { return row[col - 2]; };
  const endRow2 = g.endRow;   // 표 끝 아래의 안내문까지 세지 않는다
  const rng = grid(sh, g.row0, 2, endRow2 ? Math.max(0, endRow2 - g.row0 + 1) : 200, Math.max(14, g.last - 1));
  const vals = rng ? rng.getValues() : [];
  const ym = String(sh.getName() || '');
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  let req = 0, prog = 0, done = 0;
  const judged = [];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!String(at(v, g.body) == null ? '' : at(v, g.body)).trim()) continue;
    req++;
    if (g.isNew) {
      const m = String(at(v, g.plan) == null ? '' : at(v, g.plan)).trim();
      const n = String(at(v, g.done) == null ? '' : at(v, g.done)).trim();
      const jd = impJudge({
        audit: at(v, g.audit), redo: at(v, g.redo), doneNote: n, plan: m,
        planRaw: at(v, g.plan), due: at(v, g.due), sub: g.roll ? at(v, g.roll) : '',
      }, today, tz, ym, false);
      judged.push({ state: jd.state, waive: at(v, g.waive) === true });
      /* '기한 후 완료'는 완료로도 진행으로도 세지 않는다(미조치 칸) — 개선율 분자와 같다 (2026-09-17 J1)
         '재제출기한 지남'도 진행이 아니라 ★미조치★로 흘린다 (2026-09-17 #28) — 앱(store-app.js)은 그 건을 「기한 지남」으로 세는데
         시트 요약만 「개선예정/진행」에 넣고 있었다. 이 줄이 월별 QSC현황표로 가므로 앱과 같은 집계여야 한다(개선율엔 영향 없음). */
      if (jd.state === '확정' || jd.state === '완료(검수 전)') done++;
      else if (jd.state === '진행중' || jd.state === '반려') prog++;
    } else {
      const s = stateOf(at(v, g.plan), at(v, g.done));
      if (s === '완료') done++;
      else if (s === '진행') prog++;
    }
  }
  const todo = req - done - prog;
  const lm = labelMap(sh);
  writeCount(sh, lm, ['개선요청', '요청', '요청건수', '개선요청건수'], req);
  writeCount(sh, lm, ['진행', '개선진행', '진행중', '개선예정'], prog);
  writeCount(sh, lm, ['완료', '조치완료', '개선완료'], done);
  writeCount(sh, lm, ['미조치', '미이행'], todo);

  /* ★새 서식에서는 개선율을 서버가 값으로 적는다★ (§1-8) — 수식을 덮어쓴다.
     writeCount는 수식이면 건드리지 않지만 여기서는 일부러 덮는다: 화면·확정과 같은 impRate 한 곳에서
     세야 세 곳(화면·시트·확정)이 갈라지지 않는다. 적힌 값은 본사가 고칠 수 있다. */
  let calc = null;
  if (g.isNew) {
    calc = impRate(judged);
    const pr = labelValue(lm, ['개선율']);
    if (pr.found && pr.row) {
      try { grid(sh, pr.row, pr.col, 1, 1).setValue(rateShown(sh, lm, calc.rate)); } catch (e) { }
    }
  }
  return {
    req: req, prog: prog, done: done, todo: todo,
    rate: calc ? calc.rate : (req > 0 ? Math.round((done / req) * 100) / 100 : null),
    rateDetail: calc,
  };
}

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
const sh = { getName: function () { return '2610'; } };

console.log('① 반려 + 보완 기한 지남 → 미조치');
VALS = [mkRow({ due: '2026-10-10', audit: '반려', redo: '2026-10-19' })];
let r = recountSummary(sh, TZ);
ok('impJudge 판정이 「재제출기한 지남」이다(전제)', impJudge({ audit: '반려', redo: '2026-10-19' }, T, TZ, '2610', false).state === '재제출기한 지남');
ok('진행 0', r.prog === 0, r);
ok('미조치 1', r.todo === 1, r);
ok('시트에 쓴 값도 같다 (진행 0 · 미조치 1)', WROTE['진행'] === 0 && WROTE['미조치'] === 1, WROTE);

console.log('② 진행으로 세는 것');
VALS = [mkRow({ due: '2026-11-01', plan: '업체 요청' }), mkRow({ due: '2026-10-10', audit: '반려', redo: '2026-10-25' })];
r = recountSummary(sh, TZ);
ok('진행중 + 반려(보완 기한 전) → 진행 2 · 미조치 0', r.prog === 2 && r.todo === 0, r);

console.log('③ 완료·미조치·요청');
VALS = [mkRow({ audit: '확정', done: '했음' }), mkRow({ done: '했음', due: '2026-11-01' }), mkRow({ due: '2026-10-01' }),
        mkRow({ due: '2026-10-10', audit: '반려', redo: '2026-10-19' }), mkRow({ body: '' })];
r = recountSummary(sh, TZ);
ok('요청 4(본문 빈 줄 제외) · 완료 2 · 진행 0 · 미조치 2', r.req === 4 && r.done === 2 && r.prog === 0 && r.todo === 2, r);
ok('개선율 = 2/4', r.rate === 0.5, r.rate);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
