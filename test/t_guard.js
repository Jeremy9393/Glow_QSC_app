
// ══ 가짜 세계 ═══════════════════════════════════════════════
var PREV = [];              // prevSubmitsOf 가 돌려줄 것
var UNDO_CALLS = [];        // fnUndoSubmit 이 몇 번 불렸나 = 실제로 지웠나
function prevSubmitsOf() { return PREV; }
function improveBlocked() { return null; }
function fnUndoSubmit(ctx, p) {
  UNDO_CALLS.push(p);
  return { ok: true, done: ['(시험) 지웠다'], dirty: false };
}

function guardResubmit(ss, kind, payload, ctx, doneOut) {
  const prev = prevSubmitsOf(ss, kind, payload && payload.store, payload && payload.date);
  if (!prev.length) return null;                       // 이번 달 첫 제출 — 묻지 않는다
  if (!(payload && payload.overwrite === true)) {
    /* ★매장이 이미 적은 답이 있으면 그것도 알린다★ (2026-08-27) — 덮어쓰면 함께 지워진다.
       되돌리기는 '그 회차를 없던 일로' 하는 것이라 그게 맞지만, ★모르고 누르면 안 된다★.
       QSC 만 본다 — 개선요청은 QSC 가 내려보내는 것이다. */
    let wrote = null;
    if (kind !== 'shopper') {
      const dd = [];
      prev.forEach(function (p) { if (dd.indexOf(p.date) < 0) dd.push(p.date); });
      for (let i = 0; i < dd.length; i++) {
        const b = improveBlocked(payload.store, dd[i]);
        if (b) { wrote = { date: dd[i], touched: b.touched, filled: b.filled }; break; }
      }
    }
    const res = {
      ok: false, code: 'CONFLICT',
      error: '이 매장은 이번 달에 이미 제출된 기록이 있습니다.',
      existing: prev,
    };
    if (wrote) res.storeWrote = wrote;
    return res;
  }
  /* ★누구인지 확인 안 된 요청은 덮어쓰기를 못 한다★ (2026-08-27)

     덮어쓰기는 '먼저 지우고 새로 쓰는' 것이라, 이 문을 통과하면 남의 매장 그 달 기록이
     통째로 사라진다. 그런데 qsc.submit·shopper.submit 은 legacy 라
     ★AUTH_ENFORCE 를 끄면 토큰 없이 통과하고★(doPost 6단계), 무인증이면 그 다음
     권한 게이트도 통째로 건너뛴다(`if (ctx.auth && spec.menu)` — 7단계).
     그러면 서버 주소만 아는 사람이 store·date·overwrite 세 칸으로 한 달치를 지울 수 있다.
     주소·매장 이름·overwrite 라는 낱말은 전부 공개 저장소에 있다.

     ★첫 제출은 막지 않는다★ — 벽을 끈 목적(옛 경로로 업무를 계속하는 것)은 그대로 살린다.
     막는 것은 '지우는 힘'뿐이다. 벽이 켜져 있는 동안에는 이 줄에 닿을 일이 없다. */
  if (!(ctx && ctx.auth)) {
    return { ok: false, code: 'CONFLICT', existing: prev,
      error: '이 매장은 이번 달에 이미 제출된 기록이 있습니다. 덮어쓰려면 로그인이 필요합니다.' };
  }

  /* 사람이 '덮어씁니다'를 눌렀다 — 되돌리기를 그대로 태운다.
     그 달에 날짜가 여럿이면 날짜마다 한 번씩. */
  const days = [];
  prev.forEach(function (p) { if (days.indexOf(p.date) < 0) days.push(p.date); });

  for (let i = 0; i < days.length; i++) {
    /* ★손님이 낸 설문은 건드리지 않는다★ (2026-08-27)
       담당자가 자기 MS 를 다시 내는 것인데, 그 달에 손님이 낸 설문까지 지워지면 안 된다.
       시트 줄 삭제는 휴지통이 없어 되찾을 수 없다. '입력경로' 칸으로 담당자 것만 고른다.
       (QSC 에는 손님 경로가 없으므로 route 를 주지 않는다.) */
    const u = fnUndoSubmit(ctx, { store: payload.store, date: days[i], kind: kind, apply: true,
      route: kind === 'shopper' ? '관리자 입력' : '' });
    if (u && u.done && doneOut) doneOut.push.apply(doneOut, u.done);
    if (!u || u.ok !== true) {
      return { ok: false, code: 'SERVER_ERROR',
        error: (i > 0 ? ('앞 제출 ' + days.slice(0, i).join('·') + ' 는 이미 정리했고, ') : '') +
          days[i] + ' 에서 멈췄습니다: ' + ((u && u.error) || '알 수 없는 이유') +
          ' — 저장하지 않았습니다. 관리자 도구에서 남은 상태를 확인해 주세요.' };
    }
    if (u.dirty) {
      /* ★이제 '매장이 적어서' 멈추는 일은 없다★ (2026-08-27) — 매장 몫도 함께 지운다.
         여기까지 오는 것은 개선요청 표 자체를 읽지 못한 경우뿐이다(머리글이 바뀌었거나 탭이 망가짐). */
      return { ok: false, code: 'CONFLICT', blocked: true,
        error: days[i] + ' 의 개선요청 표를 지우지 못했습니다 — ' + (u.why || '표를 읽지 못했습니다') +
          ' 저장하지 않았습니다 — 매장 파일의 개선요청 표를 확인해 주세요.' };
    }
  }
  return null;
}

// ══ 시험 ════════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  X    ' + n + (e ? '   ' + e : '')); } }
var ANON = { auth: false, id: '(무인증)', role: '' };
var USER = { auth: true, id: 'admin', role: '관리자' };
function reset() { PREV = [{ kind: 'qsc', date: '2026-10-05', time: '', route: '', who: '문수', score: 88 }]; UNDO_CALLS = []; }

console.log('\n[1] ★무인증 + overwrite → 거절하고 아무것도 안 지운다★');
reset();
var r = guardResubmit({}, 'qsc', { store: '금종제과', date: '2026-10-20', overwrite: true }, ANON, []);
ok('막았다', !!(r && r.ok === false), JSON.stringify(r));
ok('★한 번도 안 지웠다★', UNDO_CALLS.length === 0, '지운 횟수=' + UNDO_CALLS.length);
ok('로그인이 필요하다고 말한다', !!(r && String(r.error).indexOf('로그인') >= 0), JSON.stringify(r && r.error));

console.log('\n[2] ★무인증이어도 첫 제출은 막지 않는다★ (벽을 끈 목적을 살린다)');
PREV = []; UNDO_CALLS = [];
r = guardResubmit({}, 'qsc', { store: '금종제과', date: '2026-10-20' }, ANON, []);
ok('그냥 통과 (null)', r === null, JSON.stringify(r));

console.log('\n[3] 로그인했으면 종전 그대로 — 되묻기');
reset();
r = guardResubmit({}, 'qsc', { store: '금종제과', date: '2026-10-20' }, USER, []);
ok('CONFLICT 로 되묻는다', !!(r && r.code === 'CONFLICT'), JSON.stringify(r && r.code));
ok('아직 안 지웠다', UNDO_CALLS.length === 0, '지운 횟수=' + UNDO_CALLS.length);
ok('기존 기록을 함께 준다', !!(r && r.existing && r.existing.length === 1));

console.log('\n[4] 로그인 + 덮어쓰기 → 종전 그대로 지운다');
reset();
var done = [];
r = guardResubmit({}, 'qsc', { store: '금종제과', date: '2026-10-20', overwrite: true }, USER, done);
ok('통과시킨다 (null)', r === null, JSON.stringify(r));
ok('★한 번 지웠다★', UNDO_CALLS.length === 1, '지운 횟수=' + UNDO_CALLS.length);
ok('한 일을 화면으로 넘긴다', done.length === 1, JSON.stringify(done));

console.log('\n[5] ctx 가 아예 없어도 막는다 (안전한 쪽으로 실패)');
reset();
r = guardResubmit({}, 'qsc', { store: '금종제과', date: '2026-10-20', overwrite: true }, null, []);
ok('막았다', !!(r && r.ok === false), JSON.stringify(r));
ok('안 지웠다', UNDO_CALLS.length === 0, '지운 횟수=' + UNDO_CALLS.length);

console.log('\n[6] 쇼퍼도 같은 규칙');
PREV = [{ kind: 'shopper', date: '2026-10-05', time: '', route: '관리자 입력', who: '', score: 90 }];
UNDO_CALLS = [];
r = guardResubmit({}, 'shopper', { store: '금종제과', date: '2026-10-20', overwrite: true }, ANON, []);
ok('무인증이면 막는다', !!(r && r.ok === false));
ok('안 지웠다', UNDO_CALLS.length === 0, '지운 횟수=' + UNDO_CALLS.length);

console.log('\n' + (fail ? 'X 실패 ' + fail + '건' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
