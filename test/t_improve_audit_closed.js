
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function validYm(ym) { return /^\d{4}$/.test(ym); }
function normStore(s) { return String(s || '').trim(); }
function storeFileId() { return 'FILE1'; }
function fileTz() { return 'Asia/Seoul'; }
function ymLabel(ym) { return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월'; }
const Utilities = { formatDate: function () { return '2026-10-20'; } };
const sh = {};
const ss = { getSheetByName: function () { return sh; }, getId: function () { return 'FILE1'; }, getName: function () { return '샘플' } };
const SpreadsheetApp = { openById: function () { return ss; } };
let IS_NEW = true, CLOSED_AT = '', LOCK_GOT = 0, LOCK_REL = 0, FIND = 0;
function impGeo() { return { isNew: IS_NEW, row0: 12, endRow: 15, audit: 17, redo: 18, waive: 19, roll: 20 }; }
function monthClosedAt() { return CLOSED_AT; }
const LockService = { getScriptLock: function () { return { tryLock: function () { LOCK_GOT++; return true; }, releaseLock: function () { LOCK_REL++; } }; } };
/* 행 찾기에서 멈춘다 — 이 시험은 「거기까지 가는가」만 본다 */
function impFindRow() { FIND++; return { ok: false, code: 'NOT_FOUND', error: '(시험) 행 없음' }; }
function grid() { return { getValues: function () { return [['']]; }, setValue: function () {} }; }
function fnImproveAudit(ctx, payload) {
  const p = payload || {};
  const ym = String(p.ym || '').trim();
  const no = p.no;
  const verdict = String(p.verdict == null ? '' : p.verdict).trim();
  if (!validYm(ym)) return err('BAD_REQUEST', 'ym 형식이 올바르지 않습니다 (예: 2610)');
  if (!(typeof no === 'number' && no >= 1 && no === Math.floor(no))) {
    return err('BAD_REQUEST', '항목 번호가 올바르지 않습니다.');
  }
  /* ★점수 제외★ (2026-08-27 담당자 요청) — waive 가 참·거짓이면 검수 칸은 건드리지 않고
     「감점제외」 체크칸만 여닫는다. 그 칸이 켜지면 impRate 가 그 건을 개선율 분모에서 뺀다
     (Code.gs impRate 의 `if (r.waive) { waived++; return; }`). 계산식은 손대지 않았다.
     ★시트에는 체크가 그대로 남는다★ — 담당자가 원한 「시트엔 기록」이 이것이다. */
  const doWaive = (p.waive === true || p.waive === false);
  if (!doWaive && ['확정', '반려', '미조치', ''].indexOf(verdict) < 0) {
    return err('BAD_REQUEST', "검수는 '확정'·'반려'·'미조치'·빈칸만 가능합니다.");
  }

  let ss, label;
  if (p.fileId) {
    /* ★사본에만 열어 준다★ — store.upgrade와 같은 규칙이다. 실매장은 매장명으로만 부른다.
       사본과 실매장을 가르는 것은 아래 '_연동테스트' 이름 검사 하나다. */
    try { ss = SpreadsheetApp.openById(String(p.fileId)); }
    catch (e) { return err('BAD_REQUEST', '그 ID로 파일을 열지 못했습니다'); }
    if (String(ss.getName()).indexOf('_연동테스트') < 0) {
      return err('FORBIDDEN', '파일 ID로는 이름에 _연동테스트가 있는 사본만 다룰 수 있습니다: ' + ss.getName());
    }
    label = ss.getName();
  } else {
    const store = normStore(p.store || '');
    if (!store) return err('BAD_REQUEST', '매장을 지정해 주세요');
    const id = storeFileId(store);
    if (!id) return err('NOT_FOUND', '매장 파일을 찾지 못했습니다.');
    ss = SpreadsheetApp.openById(id);
    label = store;
  }

  const sh = ss.getSheetByName(ym);
  if (!sh) return err('NOT_FOUND', ym + ' 탭이 없습니다.');
  const g = impGeo(sh);
  if (!g.isNew) return err('CONFLICT', '이 달 탭은 아직 새 서식이 아닙니다 — 검수 칸이 없습니다.');
  /* ★감점제외 칸이 없는 탭도 있을 수 있다★ — impGeo 는 검수 칸만 보고 새 서식이라 판정한다.
     그 상태로 grid(sh, r, 0, …) 을 부르면 엉뚱한 곳에 쓰거나 예외가 난다. 먼저 막는다. */
  if (doWaive && !g.waive) {
    return err('CONFLICT', '이 달 탭에는 「감점제외」 칸이 없습니다 — 탭을 새 서식으로 올린 뒤 다시 시도해 주세요.');
  }
  /* ★확정된 달은 검수·감점제외도 받지 않는다★ (2026-09-17 #27) — fnStoreSave 와 같은 문구·방식.
     종전에는 화면의 closedAt() 하나에 기대고 있어(store-app.js 주석이 스스로 인정) 서버는 확정 뒤 검수를 그대로 받았다. */
  if (monthClosedAt(ss, ym)) {
    return err('FORBIDDEN', ymLabel(ym) + ' 채점이 확정되어 검수할 수 없습니다.');
  }

  const lock = LockService.getScriptLock();
  let got = false;
  try { got = lock.tryLock(20000); } catch (e) { got = false; }
  if (!got) return err('CONFLICT', '다른 처리가 진행 중입니다. 잠시 후 다시 시도해 주세요.');
  try {
    const found = impFindRow(sh, g, no);
    if (!found.ok) return err(found.code, found.error);
    const r = found.row;
    const tz = fileTz(ss);
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    /* ★점수 제외는 여기서 끝난다★ — 검수 칸·재제출기한은 건드리지 않는다.
       개선율은 화면을 열 때마다 다시 계산되므로(fnStoreGet), 켜는 즉시 점수에 반영된다.
       시트의 개선율 칸은 매장이 저장할 때나 [월 채점 확정] 때 맞춰진다. */
    if (doWaive) {
      grid(sh, r, g.waive, 1, 1).setValue(p.waive === true);
      SpreadsheetApp.flush();
      if (!p.fileId) dropStoreCache(label, ym);
      auditLog(ctx, 'improve.audit', label, '성공', '',
        ym + ' ' + no + '번 ' + (p.waive === true ? '점수 제외' : '점수 제외 해제'));
      /* 점수에서 뺀 건은 더 볼 것이 없다 — 종의 열린 알림을 닫는다(실패해도 검수는 끝났다).
         해제는 닫지 않는다: 다시 볼 것이 생긴 쪽이다. */
      if (!p.fileId && p.waive === true) {
        try { notifyResolve(label, ym, no, '점수 제외'); } catch (e) { Logger.log('알림 처리 실패: ' + String(e)); }
      }
      return { ok: true, store: label, ym: ym, no: no, waive: p.waive === true };
    }

    const W = Math.max(14, g.last - 1);
    const judgeRow = function (row) {
      const at0 = function (col) { return col ? row[col - 2] : ''; };
      return impJudge({
        audit: at0(g.audit), redo: at0(g.redo), sub: at0(g.roll),
        doneNote: at0(g.done), plan: at0(g.plan), planRaw: at0(g.plan), due: at0(g.due),
      }, today, tz, ym, false);
    };
    const before = grid(sh, r, 2, 1, W).getValues()[0];
    const cur = String(before[g.audit - 2] == null ? '' : before[g.audit - 2]).trim();
    /* 재제출기한이 적혀 있으면 ★이 건은 이미 한 번 보완 요청을 받았다★ — 확정·검수 취소를 거쳐도 남겨 두므로
       그 길로 두 번째 보완 요청을 여는 틈이 없다. (보완본이 오기 전에 검수 취소하면 요청을 통째로 거둔 것으로
       보고 아래에서 함께 지운다 — 잘못 누른 보완 요청을 되돌리는 길이다.) */
    const hadRedo = String(dateOfCell(before[g.redo - 2], tz) || '').trim() !== '';
    let put = verdict, redo = null;   // redo === null → 재제출기한 칸을 건드리지 않는다
    if (verdict === '반려') {
      if (cur === '반려' || cur === '재반려' || hadRedo) {
        return err('CONFLICT', '보완 요청은 한 건에 한 번만 할 수 있습니다. 보완본이 부족하면 「미조치 처리」를 눌러 주세요.');
      }
      if (judgeRow(before).state === '기한 후 완료') {
        return err('CONFLICT', '기한이 지난 뒤 완료한 건이라 보완 요청을 할 수 없습니다 — 개선율에는 들어가지 않습니다.');
      }
      const plus7 = impPlusDays(today, IMP_REDO_DAYS, tz);
      const dl = dateOfCell(before[g.due - 2], tz);
      redo = (dl && plus7 && dl > plus7) ? dl : plus7;   // 긴 쪽
    } else if (verdict === '미조치') {
      if (cur !== '반려' && cur !== '재반려') {
        return err('CONFLICT', '미조치 처리는 보완 요청한 건에만 할 수 있습니다.');
      }
      put = '재반려';   // 값 이름은 옛 탭 검수 목록과 맞춘다 (함수 앞 주석)
    } else if (verdict === '' && cur === '반려' && !judgeRow(before).resub) {
      redo = '';        // 보완본이 오기 전의 검수 취소 = 보완 요청을 거둔다 → 보완 기한도 지운다
    }
    grid(sh, r, g.audit, 1, 1).setValue(put);
    if (redo !== null) grid(sh, r, g.redo, 1, 1).setValue(redo);
    /* 보완 요청 — 완료 제출일을 비워 보완본 제출일을 새로 받는다 */
    if (verdict === '반려' && g.roll) grid(sh, r, g.roll, 1, 1).setValue('');
    SpreadsheetApp.flush();

    /* ★쓴 값이 아니라 시트를 다시 읽어 판정한다★ — 날짜 서식이 값을 어떻게 저장했는지는
       시트가 안다. 쓴 값으로 계산하면 화면과 시트가 갈라진다. */
    const row = grid(sh, r, 2, 1, W).getValues()[0];
    const at = function (col) { return row[col - 2]; };
    const jd = judgeRow(row);

    if (!p.fileId) dropStoreCache(label, ym);   // 매장이 바로 보게

    /* ★검수를 했으면 종의 열린 알림을 닫는다★ — 사유는 화면 버튼 이름으로 적는다.
       검수 취소('')는 닫지 않는다: 다시 볼 것이 생긴 쪽이다. 실패해도 검수는 이미 끝났다. */
    if (!p.fileId && put) {
      try {
        notifyResolve(label, ym, no, put === '확정' ? '개선확정' : (put === '재반려' ? '미조치 처리' : '보완 요청'));
      } catch (e) { Logger.log('알림 처리 실패: ' + String(e)); }
    }

    return {
      ok: true, store: label, ym: ym, no: no,
      audit: put, redo: dateOfCell(at(g.redo), tz) || null,
      status: jd.state, statusWhy: jd.why || '', resub: !!jd.resub,
    };
  } finally {
    try { lock.releaseLock(); } catch (e) { }
  }
}

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
const ctx = { id: 'admin', role: '관리자' };
function call(p) { LOCK_GOT = 0; LOCK_REL = 0; FIND = 0; return fnImproveAudit(ctx, Object.assign({ store: '금종제과', ym: '2610', no: 1 }, p)); }

console.log('① 확정된 달');
CLOSED_AT = '2026-11-02';
let r = call({ verdict: '확정' });
ok('FORBIDDEN', r.ok === false && r.code === 'FORBIDDEN', r);
ok('문구 「2026년 10월 채점이 확정되어 검수할 수 없습니다.」', r.error === '2026년 10월 채점이 확정되어 검수할 수 없습니다.', r.error);
ok('락을 안 잡고 행도 안 찾는다', LOCK_GOT === 0 && FIND === 0, [LOCK_GOT, FIND]);

console.log('② 감점제외도 같다');
r = call({ waive: true });
ok('FORBIDDEN · 락 없음', r.code === 'FORBIDDEN' && LOCK_GOT === 0, r);

console.log('③ 확정 안 된 달');
CLOSED_AT = '';
r = call({ verdict: '확정' });
ok('락을 잡고(1) 놓고(1) 행을 찾으러 간다(1)', LOCK_GOT === 1 && LOCK_REL === 1 && FIND === 1, [LOCK_GOT, LOCK_REL, FIND]);
ok('행이 없다는 답이 그대로 온다(NOT_FOUND)', r.code === 'NOT_FOUND', r);

console.log('④ 순서 — 새 서식 검사가 먼저');
IS_NEW = false; CLOSED_AT = '2026-11-02';
r = call({ verdict: '확정' });
ok('옛 서식이면 CONFLICT (확정 판정보다 앞)', r.code === 'CONFLICT', r);
IS_NEW = true;

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
