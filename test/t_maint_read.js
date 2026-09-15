
const ADMIN_MENU = 'accounts';
const MAINT_DEFAULT_MSG = '기본 안내';
let props = {};
const PROPS = {
  setProperty(k, v) { props[k] = String(v); },
  deleteProperty(k) { delete props[k]; },
  getProperty(k) { return props[k] || null; },
};
const logs = [];
function auditLog(ctx, action, store, result, reason, note) { logs.push([action, result, reason, note]); }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
const PERM = { '관리자': { '읽기': true, '쓰기': true }, '열람': { '읽기': true } };
function can(role, menu, act) { return { allow: !!(menu === ADMIN_MENU && PERM[role] && PERM[role][act]) }; }
function maintInfo() {
  return { on: !!props.MAINT, msg: props.MAINT || '', at: props.MAINT_AT || '', min: props.MAINT_MIN ? Number(props.MAINT_MIN) : 0 };
}
function fnAdminMaint(ctx, payload) {
  const p = payload || {};

  /* 등록은 「읽기」다(상태등 20초 확인이 감사로그를 채우지 않게 · 2026-09-15). 그래서 켜기·끄기는
     여기서 쓰기 권한을 따로 본다 — 계정관리 읽기만 가진 역할이 생겨도 점검 모드를 못 건드린다. */
  if ((p.on || p.off) && !can(ctx.role, ADMIN_MENU, '쓰기').allow) {
    auditLog(ctx, 'admin.maint', '', '거부', 'FORBIDDEN', p.on ? '점검 시작 시도' : '점검 해제 시도');
    return err('FORBIDDEN', '권한이 없습니다.');
  }

  if (p.on) {
    const msg = String(p.msg == null ? '' : p.msg).trim().slice(0, 300) || MAINT_DEFAULT_MSG;
    const min = Math.max(0, Math.min(600, Number(p.min) || 0));
    PROPS.setProperty('MAINT', msg);
    PROPS.setProperty('MAINT_AT', new Date().toISOString());
    if (min) PROPS.setProperty('MAINT_MIN', String(min));
    else { try { PROPS.deleteProperty('MAINT_MIN'); } catch (e) { } }
    auditLog(ctx, 'admin.maint', '', '성공', '', '점검 시작 · ' + (min ? min + '분 예상 · ' : '') + msg.slice(0, 60));
  } else if (p.off) {
    /* ★끌 때는 MAINT 를 먼저 지운다★ — 여기서 실패하면 매장이 계속 잠긴 채로 남는다.
       부가 정보(AT·MIN)는 지워지지 않아도 무해하므로(maintInfo 가 msg 없으면 off 로 본다) 뒤에 둔다. */
    try { PROPS.deleteProperty('MAINT'); } catch (e) {
      return err('SERVER_ERROR', '점검 모드를 끄지 못했습니다. 다시 시도해 주세요.');
    }
    try { PROPS.deleteProperty('MAINT_AT'); } catch (e) { }
    try { PROPS.deleteProperty('MAINT_MIN'); } catch (e) { }
    auditLog(ctx, 'admin.maint', '', '성공', '', '점검 해제');
  }

  const info = maintInfo();
  let elapsed = 0;
  if (info.on && info.at) {
    const t = new Date(info.at).getTime();
    if (t) elapsed = Math.max(0, Math.floor((Date.now() - t) / 60000));
  }
  return {
    ok: true, on: info.on, msg: info.msg, at: info.at, min: info.min,
    elapsedMin: elapsed, defaultMsg: MAINT_DEFAULT_MSG
  };
}

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
const viewer = { role: '열람', id: 'v' }, admin = { role: '관리자', id: 'admin' };

let r = fnAdminMaint(viewer, {});
ok('② 상태만 — 읽기 역할도 ok · 꺼짐', r.ok === true && r.on === false);
ok('② 상태만 — 감사로그 0줄', logs.length === 0);

r = fnAdminMaint(viewer, { on: true, msg: '시험' });
ok('③ 읽기 역할 켜기 — FORBIDDEN', r.ok === false && r.code === 'FORBIDDEN');
ok('③ 읽기 역할 켜기 — 속성 그대로', !('MAINT' in props));
ok('③ 읽기 역할 켜기 — 거부 1줄', logs.length === 1 && logs[0][1] === '거부');

r = fnAdminMaint(admin, { on: true, msg: '공사중', min: 10 });
ok('④ 관리자 켜기 — 켜짐 · 문구 · 분', r.ok === true && r.on === true && props.MAINT === '공사중' && props.MAINT_MIN === '10');
ok('④ 관리자 켜기 — 「점검 시작」 1줄', logs.length === 2 && logs[1][1] === '성공' && String(logs[1][3]).indexOf('점검 시작') === 0);

r = fnAdminMaint(viewer, { off: true });
ok('③ 읽기 역할 끄기 — FORBIDDEN · 켜진 채', r.code === 'FORBIDDEN' && props.MAINT === '공사중');

r = fnAdminMaint(viewer, {});
ok('② 켜진 상태에서 상태만 — on · 로그 안 늘어남', r.ok === true && r.on === true && logs.length === 3);

r = fnAdminMaint(admin, { off: true });
ok('④ 관리자 끄기 — 꺼짐 · MAINT 삭제', r.ok === true && r.on === false && !('MAINT' in props));
ok('④ 관리자 끄기 — 「점검 해제」 1줄', logs.length === 4 && logs[3][3] === '점검 해제');

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
