
const ADMIN_MENU = 'accounts';
const PERM = { '관리자': { '읽기': true, '쓰기': true }, '매장': {} };
function can(role, menu, act) { return { allow: !!(role && menu === ADMIN_MENU && PERM[role] && PERM[role][act]) }; }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function validYm(ym) { return /^\d{4}$/.test(ym); }
function capText(v) { return String(v == null ? '' : v); }
let opened = [], looked = [];
const FILES = { 'REALFILE_ID_0000000000': '제주당_QSC현황', 'TESTFILE_ID_0000000000': '제주당_QSC현황_연동테스트' };
function storeFileId(store) { looked.push(store); return 'REALFILE_ID_0000000000'; }
const SpreadsheetApp = {
  openById(id) {
    opened.push(id);
    if (!FILES[id]) throw new Error('no file');
    return { getName() { return FILES[id]; } };
  }
};
/* 잠금을 못 잡게 해서 「잠금 단계까지 왔다」를 CONFLICT 로 확인한다 — 그 뒤는 이 시험의 몫이 아니다 */
const LockService = { getScriptLock() { return { tryLock() { return false; }, releaseLock() { } }; } };
function fnStoreSave(ctx, payload, target) {
  /* ★사본(_연동테스트)으로 미리 돌려 볼 수 있게 열어 둔 자리★ — 실매장을 건드리지 않고
     이 경로를 시험하기 위한 것이다. 안 그러면 10/1에 처음으로 돌려 보게 된다.
     이름에 _연동테스트가 없으면 곧바로 거절한다.
     ★fileId 는 계정관리 쓰기 권한(관리자)이 있어야 받는다 (2026-09-15)★ — 종전 주석은 「관리자만 보낼 수
     있다」였지만 이 액션의 등록 권한(menu:'store' 쓰기)은 ★매장도 가진다★. 그래서 매장 계정이 아무 파일 ID나
     보내면 서버가 그 파일을 열어 거절 문구에 ★파일 이름을 적어 돌려줬다★(보안 점검 ③). 열기 전에 막는다. */
  const testId = String((payload && payload.fileId) || '');
  if (testId && !can(ctx && ctx.role, ADMIN_MENU, '쓰기').allow) {
    return err('FORBIDDEN', '권한이 없습니다.');   // 감사로그는 doPost 가 쓰기 결과로 남긴다(실패 · FORBIDDEN)
  }
  const store = target;
  const ym = String(payload.ym || '').trim();
  if (!validYm(ym)) return err('BAD_REQUEST', '월이 올바르지 않습니다.');
  const no = payload.no;
  /* ★Number('')===0 이라 이 검사를 빼면 12행(첫 데이터 행)에 쓴다★ */
  if (!(typeof no === 'number' && no >= 1 && no === Math.floor(no))) {
    return err('BAD_REQUEST', '항목 번호가 올바르지 않습니다.');
  }
  const texts = {
    dept: capText(payload.dept), owner: capText(payload.owner),
    plan: capText(payload.plan), doneNote: capText(payload.doneNote)
  };
  for (const k in texts) if (texts[k].length > 1000) return err('BAD_REQUEST', '입력이 너무 깁니다 (1000자 이내).');

  let id;
  if (testId) {
    let probe;
    try { probe = SpreadsheetApp.openById(testId); }
    catch (e) { return err('BAD_REQUEST', '그 ID로 파일을 열지 못했습니다'); }
    if (String(probe.getName()).indexOf('_연동테스트') < 0) {
      return err('FORBIDDEN', '파일 ID로는 이름에 _연동테스트가 있는 사본만 다룰 수 있습니다: ' + probe.getName());
    }
    id = testId;
  } else {
    id = storeFileId(store);
    if (!id) return err('NOT_FOUND', '매장 파일을 찾지 못했습니다.');
  }

  const lock = LockService.getScriptLock();
  let got = false;
  try { got = lock.tryLock(20000); } catch (e) { got = false; }
  if (!got) return err('CONFLICT', '다른 저장이 처리 중입니다. 잠시 후 다시 시도해 주세요.');
  try {
    const ss = SpreadsheetApp.openById(id);
    const sh = ss.getSheetByName(ym);
    if (!sh) return err('NOT_FOUND', ym + ' 탭이 아직 만들어지지 않았습니다.');
    const tz = fileTz(ss);
    const g = impGeo(sh);

    const found = impFindRow(sh, g, no);
    if (!found.ok) return err(found.code, found.error);
    const r = found.row;

    /* ★확정된 달은 이월된 줄만 받는다★ (2026-08-21)
       시트 잠금은 ★사람★을 막는다. 앱은 스크립트 계정으로 쓰므로 그 잠금을 그냥 통과한다
       (스크립트가 보호 편집자여야 애초에 기록을 할 수 있기 때문이다).
       그래서 여기서 한 번 더 막는다 — 안 그러면 확정 뒤에도 앱으로 고칠 수 있고,
       §1-7⑪ '확정 후 점수 불변'이 말뿐이 된다. ★검수에서 실제로 뚫렸다.★
       이월된 줄만 여는 이유는 그 건이 다음 달로 넘어가 아직 답할 것이 남았기 때문이다(§1-8). */
    if (g.isNew && monthClosedAt(ss, ym)) {
      const rc = grid(sh, r, g.roll, 1, 1);
      const rolled = rc ? Number(rc.getValue() || 0) : 0;
      if (!(rolled >= 1)) {
        return err('FORBIDDEN', ym.slice(0, 2) + '/' + ym.slice(2) +
          ' 채점이 확정되어 이 항목은 더 고칠 수 없습니다. 다음 점검에서 확인합니다.');
      }
    }

    // 현재 개선요청~개선 후 6칸 재읽기 → rev 비교
    const cur = grid(sh, r, g.body, 1, 6);
    if (!cur) return err('SERVER_ERROR', '시트를 읽지 못했습니다.');
    const curV = cur.getValues()[0];
    const curF = cur.getFormulas()[0];
    const curRev = revOf(no, curV, curF);
    if (String(payload.rev || '') !== curRev) {
      return {
        ok: false, code: 'CONFLICT',
        error: '다른 분이 방금 이 항목을 수정했습니다. 최신 내용을 확인해 주세요.',
        item: itemOf(no, curV, curF, tz, ym)
      };
    }

    /* ★관리자 알림(종) 판정에 쓸 저장 전 검수 값★ — 검수 칸은 새 서식(2610~)에만 있다.
       사본 시험(fileId)·옛 서식·9월 이전 탭은 알림을 아예 보지 않는다(noteAudit=null).
       읽기가 실패해도 저장은 계속한다 — 검수 값만 빈 것으로 본다. */
    let noteAudit = null;
    if (!testId && g.isNew && g.audit && ym >= NOTIFY_FROM_YM) {
      noteAudit = '';
      try {
        const ac = grid(sh, r, g.audit, 1, 1);
        if (ac) noteAudit = ac.getValue();
      } catch (e) { Logger.log('알림용 검수 칸 읽기 실패: ' + String(e)); }
    }

    /* 사진 — 교체·삭제면 이전 드라이브 파일을 실제로 지운다 (안 하면 고아 파일이 쌓인다).
       ★새 사진 저장이 성공한 뒤에 옛 파일을 지운다★ — 순서를 반대로 두면, 400KB를 넘는 사진을
       올렸을 때 옛 파일은 이미 휴지통에 있는데 저장은 BAD_REQUEST로 되돌아가고 O열에는 그
       사라진 파일을 가리키는 =IMAGE() 수식이 남는다. 매장에서 보기에는 "사진이 없어졌는데
       저장은 실패했다"가 된다. */
    let photoCell = null;   // null이면 O열을 건드리지 않는다
    const wantPhoto = payload.photo && payload.photo.dataUrl;
    if (wantPhoto) {
      const saved = saveImprovePhoto(store, ym, no, payload.photo, ctx);
      if (!saved.ok) return err('BAD_REQUEST', saved.error);
      /* ★셀 내 이미지로 넣는다★ — 종전에는 =IMAGE() 수식이었다. 매장이 시트를 직접 열어
         쓰는 일이 있는데, 수식은 실수로 지워지거나 앞에 글자가 붙으면 그대로 깨진다.
         셀 값이면 그런 일이 없고 모바일 시트 앱에서도 그대로 보인다. */
      photoCell = PHOTO_EMBED ? cellImageOf(saved.id, '개선 후 사진') : saved.url;
    } else if (payload.clearPhoto) {
      photoCell = '';
    }
    if (photoCell !== null) {
      const olds = photoIdsOf(curV[5], curF[5]);
      for (let i = 0; i < olds.length; i++) {
        try { DriveApp.getFileById(olds[i]).setTrashed(true); } catch (e) { }
      }
    }

    // 담당부서·담당자·예정일·완료일 — 시트에 쓰는 모든 문자열은 safe()를 통과한다
    const wRng = grid(sh, r, g.dept, 1, 4);
    if (!wRng || wRng.getNumColumns() < 4) return err('SERVER_ERROR', '이 월 탭에는 담당부서~완료 칸이 없습니다. 담당자에게 문의해 주세요.');
    wRng.setValues([safeRow([texts.dept, texts.owner, texts.plan, texts.doneNote])]);
    if (photoCell !== null) {
      const oRng = grid(sh, r, g.after, 1, 1);
      if (oRng) oRng.setValue(photoCell);
    }

    // 재읽기해서 rev·item 구성 — ★쓴 값으로 계산하면 안 된다★ (safe()의 아포스트로피 때문)
    const after = grid(sh, r, g.body, 1, 6);
    const aV = after.getValues()[0];
    const aF = after.getFormulas()[0];
    const item = itemOf(no, aV, aF, tz, ym);

    const summary = recountSummary(sh, tz);
    try {
      CacheService.getScriptCache().remove('store:v' + epoch() + ':' + store + ':' + ym);
    } catch (e) { }
    dropStoreCache(store, ym);   // 저장 직후 조회가 직전 값을 보여주지 않게

    /* ★관리자 알림(종)★ — 저장은 이미 끝났다. 무엇이 터져도 저장 결과는 그대로 돌려준다.
       판정은 notifyOnSave 주석(처음 완료 → 검수대기 · 보완 요청 뒤 다시 올림 → 재제출 · 완료 취소 → 처리). */
    if (noteAudit !== null) {
      try {
        notifyOnSave(store, ym, no, cell(curV[4], tz), item.doneNote, noteAudit, photoCell !== null);
      } catch (e) { Logger.log('알림 기록 실패: ' + String(e)); }
    }
    return { ok: true, item: item, summary: summary };
  } finally {
    try { lock.releaseLock(); } catch (e) { }
  }
}

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
const store = { role: '매장', id: '제주당', auth: true }, admin = { role: '관리자', id: 'admin', auth: true };
const base = { ym: '2610', no: 1, doneNote: '완료' };
function reset() { opened = []; looked = []; }

reset();
let r = fnStoreSave(store, Object.assign({ fileId: 'REALFILE_ID_0000000000' }, base), '제주당');
ok('① 매장 + fileId — FORBIDDEN', r.ok === false && r.code === 'FORBIDDEN');
ok('① 매장 + fileId — 파일을 열지 않음', opened.length === 0);
ok('① 매장 + fileId — 응답에 파일 이름 없음', JSON.stringify(r).indexOf('QSC현황') < 0);

reset();
r = fnStoreSave({}, Object.assign({ fileId: 'TESTFILE_ID_0000000000' }, base), '제주당');
ok('② 역할 없음 + fileId — FORBIDDEN · 안 엶', r.code === 'FORBIDDEN' && opened.length === 0);

reset();
r = fnStoreSave(store, base, '제주당');
ok('③ 매장 · fileId 없음 — 원래 길(storeFileId → 잠금 단계)', r.code === 'CONFLICT' && looked.length === 1 && looked[0] === '제주당');

reset();
r = fnStoreSave(admin, Object.assign({ fileId: 'REALFILE_ID_0000000000' }, base), '제주당');
ok('④ 관리자 + 실매장 파일 — 이름 검사가 FORBIDDEN', r.code === 'FORBIDDEN' && opened.length === 1);

reset();
r = fnStoreSave(admin, Object.assign({ fileId: 'TESTFILE_ID_0000000000' }, base), '제주당');
ok('⑤ 관리자 + _연동테스트 사본 — 잠금 단계까지 통과', r.code === 'CONFLICT' && opened.length === 1 && looked.length === 0);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
