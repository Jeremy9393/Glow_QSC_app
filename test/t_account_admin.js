const STATUS_ON = '사용';
const STATUS_OFF = '중지';
const AUTH_ACCOUNT_SHEET = '계정';
function syncStoreAccountsCore(preview) {
  const ss = authSS();
  if (!ss) return { ok: false, error: 'AUTH_SHEET_ID 속성이 비어 있습니다.', added: [], skipped: [] };
  ensureAuthSheets();
  const sh = ss.getSheetByName(AUTH_ACCOUNT_SHEET);
  if (!sh) return { ok: false, error: '계정 탭이 없습니다.', added: [], skipped: [] };

  const have = readAccounts();
  const taken = {};
  have.forEach(function (a) {
    taken[a.id] = true;
    if (a.scope) taken[normId(a.scope)] = true;   // 아이디를 손으로 바꿔 둔 계정도 건너뛴다
  });

  let stores;
  try { stores = displayStores(); }
  catch (e) { return { ok: false, error: '통합시트를 읽지 못했습니다.', added: [], skipped: [] }; }

  /* ★통합시트에 없는 매장 계정★ (2026-09-11 담당자 — "새로 생기기만 하잖아 … 셋 다 동기화")
     매장담당자 계정인데 매장범위의 어느 매장도(아이디도) 통합시트에 없으면 「시트에 없는 계정」이다.
     여기서는 ★보고만 한다★ — 이름만 바뀐 것인지 정말 없어진 것인지는 코드가 알 수 없으므로,
     지우거나 이름을 바꾸는 것은 담당자가 화면에서 하나씩 고른다(account.rename · account.delete). */
  const liveKeys = {};
  stores.forEach(function (n) { liveKeys[normId(n)] = true; });
  const orphans = [];
  have.forEach(function (a) {
    if (a.dup) return;
    const scope = String(a.scope || '').trim();
    if (!scope || scope === '*') return;
    const items = scope.split(',').map(function (s) { return normId(s); }).filter(function (s) { return !!s; });
    const alive = !!liveKeys[a.id] || items.some(function (k) { return !!liveKeys[k]; });
    if (alive) return;
    orphans.push({ id: a.id, name: a.rawId || a.id, role: a.role, status: a.status,
      hasPw: !!a.hash, lastSeen: a.lastSeen || '' });
  });

  const added = [], skipped = [], conflict = [];
  /* ★'대소문자·공백만 다른 매장'을 '이미 있음'으로 묻지 않는다★
     displayStores()는 normStore로 dedup하므로 '스타벅스 A점'과 '스타벅스 a점'이 둘 다 남는데,
     taken은 normId(소문자화 포함) 기준이라 두 번째가 skipped(이미 있음)로 분류됐다.
     그 매장은 계정이 없는데 화면에는 "처리됨"으로 보이고, missingStoreAccounts도 같은 이유로
     잡지 못한다 — 아무도 모르는 채 그 매장만 영영 로그인하지 못한다. 사유를 갈라 적는다. */
  const mine = {};   // 이번 실행에서 추가한 정규화 아이디 → 매장명
  stores.forEach(function (name) {
    const key = normId(name);
    if (mine[key]) { conflict.push(name + ' ↔ ' + mine[key]); return; }
    if (taken[key]) { skipped.push(name); return; }
    /* A~F만 쓴다. G~K(해시~최근접속)는 비워 두어 '비밀번호 미설정'으로 남긴다.
       ★preview 면 쓰지 않고 「추가될 것」 목록만 만든다★ */
    if (!preview) sh.appendRow(safeRow([name, name, '매장담당자', name, STATUS_ON, '']));
    taken[key] = true;
    mine[key] = name;
    added.push(name);
  });
  if (!preview) added.forEach(function (n) { dropAccountCache(normId(n)); });
  return { ok: true, added: added, skipped: skipped, conflict: conflict, orphans: orphans };
}
function fnAccountSync(ctx, payload) {
  /* ★preview:true 면 아무것도 쓰지 않는다★ (2026-09-11) — 화면이 먼저 「추가될 계정」과
     「통합시트에 없는 계정」을 보여 주고, 담당자가 이름 변경·삭제·그대로를 고른 뒤 다시 부른다. */
  const preview = !!(payload && payload.preview === true);
  const r = syncStoreAccountsCore(preview);
  if (!r.ok) return err('SERVER_ERROR', r.error);
  const conflict = r.conflict || [];
  if (!preview) auditLog(ctx, 'account.sync', '', '성공', '',
    '추가 ' + r.added.length + '건 · 건너뜀 ' + r.skipped.length + '건' +
    (conflict.length ? ' · 이름 충돌 ' + conflict.length + '건' : ''));
  /* ★added는 배열이다★ — 화면이 개수를 셀 때 length를 봐야 한다(숫자로 읽으면 항상 0이 되어
     계정을 5개 만들어도 "새로 만들 계정이 없습니다"가 뜬다). 그 오해를 없애려고 count도 함께 준다. */
  return { ok: true, preview: preview, added: r.added, skipped: r.skipped, conflict: conflict,
    count: r.added.length, orphans: r.orphans || [] };
}
function fnAccountDelete(ctx, payload) {
  const id = normId(payload && payload.id);
  if (!id || !validId(id)) return err('BAD_REQUEST', '아이디가 올바르지 않습니다.');
  if (id === ctx.id) return err('BAD_REQUEST', '본인 계정은 지울 수 없습니다.');
  const acct = getAccount(id);
  if (!acct) return err('NOT_FOUND', '계정을 찾지 못했습니다: ' + id);
  if (String(acct.scope || '').trim() === '*') {
    return err('BAD_REQUEST', '전 매장 권한 계정은 여기서 지울 수 없습니다 — 관리자 시트의 「계정」 탭에서 정리하십시오.');
  }
  const ss = authSS();
  if (!ss) return err('SERVER_ERROR', '인증 시트를 열지 못했습니다.');
  const sh = ss.getSheetByName(AUTH_ACCOUNT_SHEET);
  if (!sh) return err('SERVER_ERROR', '계정 탭이 없습니다.');
  const fresh = readAccounts().filter(function (a) { return a.id === id; });
  if (fresh.length !== 1 || fresh[0].dup) {
    return err('CONFLICT', '같은 아이디 행이 둘 이상이라 지우지 않았습니다 — 시트에서 정리하십시오: ' + id);
  }
  sh.deleteRow(fresh[0].row);
  try { pwStashClear(id); } catch (e) { }
  dropAccountCache(id);
  auditLog(ctx, 'account.delete', '', '성공', '',
    '대상: ' + id + (acct.hash ? ' (비밀번호 있던 계정)' : ' (비밀번호 미설정)') +
    (acct.lastSeen ? ' · 최근접속 ' + acct.lastSeen : ''));
  return { ok: true, deleted: id };
}
function fnAccountRename(ctx, payload) {
  const p = payload || {};
  const from = normStore(p.from || '');
  const to = normStore(p.to || '');
  const apply = (p.apply === true);
  if (!from || !to) return err('BAD_REQUEST', '옛 이름과 새 이름을 둘 다 적어 주세요.');
  if (from === to) return err('BAD_REQUEST', '두 이름이 같습니다.');
  if (normId(from) === ctx.id) return err('BAD_REQUEST', '본인 계정의 이름은 여기서 바꿀 수 없습니다.');
  const src = getAccount(normId(from));
  if (!src) return err('NOT_FOUND', '옛 이름의 계정을 찾지 못했습니다: ' + from);
  const tgt = getAccount(normId(to));
  let tidy = '';
  if (tgt) {
    if (tgt.hash || tgt.lastSeen) {
      return err('CONFLICT', '새 이름의 계정이 이미 있고 비밀번호나 접속 기록이 있어 합칠 수 없습니다: ' + to +
        ' — 어느 쪽을 남길지 정한 뒤 다른 쪽을 [삭제]하고 다시 시도하십시오.');
    }
    tidy = to;
  }
  /* 개명 도구의 안전검사를 ★먼저 미리보기로★ 통과시킨다 — 빈 계정을 지운 뒤에 검사에서
     막히면 지운 것만 남는다. */
  const pre = fnRenameStore(ctx, { from: from, to: to, apply: false });
  if (!pre || !pre.ok) return pre || err('SERVER_ERROR', '개명 도구가 응답하지 않았습니다.');
  if (apply && tidy) {
    const ss = authSS();
    const sh = ss ? ss.getSheetByName(AUTH_ACCOUNT_SHEET) : null;
    if (!sh) return err('SERVER_ERROR', '계정 탭이 없습니다.');
    const rows = readAccounts().filter(function (a) { return a.id === normId(to); });
    if (rows.length !== 1 || rows[0].dup) {
      return err('CONFLICT', '새 이름의 계정 행이 하나가 아닙니다 — 시트에서 정리하십시오: ' + to);
    }
    sh.deleteRow(rows[0].row);
    dropAccountCache(normId(to));
    auditLog(ctx, 'account.delete', '', '성공', '', '대상: ' + to + ' (동기화가 만든 빈 계정 · 이름 변경 전 정리)');
  }
  const r = apply ? fnRenameStore(ctx, { from: from, to: to, apply: true }) : pre;
  if (!r || !r.ok) return r || err('SERVER_ERROR', '개명 도구가 응답하지 않았습니다.');
  r.정리한계정 = tidy;
  r.상태 = src.status;
  if (tidy) {
    r.말 = String(r.말 || '') + (apply
      ? ' 동기화가 만들어 둔 빈 계정 「' + tidy + '」은 먼저 지웠습니다.'
      : ' 동기화가 만들어 둔 빈 계정 「' + tidy + '」이 있어 실행 때 먼저 지웁니다.');
  }
  if (apply && src.status !== STATUS_ON) {
    r.말 = String(r.말 || '') + ' 이 계정은 지금 「' + src.status + '」 상태입니다 — 쓰려면 [사용]으로 켜 주십시오.';
  }
  return r;
}

// ══ 가짜 세계 ══════════════════════════════════════════
var LIVE = [];            // 통합시트 매장
var ACCTS = [];           // 계정 탭 행 객체 (readAccounts 가 주는 모양)
var APPENDED = [], DELETED = [], DROPPED = [], LOGGED = [], STASH_CLEARED = [], RENAMED = [];
var RENAME_FAIL = null;   // fnRenameStore 미리보기를 막고 싶을 때 오류 객체

function normId(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }
function normStore(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function validId(id) { return /^[^\s]/.test(id); }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function displayStores() { return LIVE.slice(); }
function ensureAuthSheets() {}
function safeRow(a) { return a; }
function readAccounts() { return ACCTS.map(function (a, i) { var o = {}; for (var k in a) o[k] = a[k]; o.row = 2 + i; return o; }); }
function getAccount(id) { var hit = readAccounts().filter(function (a) { return a.id === id; }); return (hit.length === 1 && !hit[0].dup) ? hit[0] : null; }
function dropAccountCache(id) { DROPPED.push(id); }
function pwStashClear(id) { STASH_CLEARED.push(id); }
function auditLog(ctx, a, t, r, c, m) { LOGGED.push(a + '|' + m); }
var SHEET = {
  appendRow: function (row) { APPENDED.push(row); ACCTS.push({ id: normId(row[0]), rawId: row[0], name: row[1], role: row[2], scope: row[3], status: row[4], hash: '', lastSeen: '', dup: false }); },
  deleteRow: function (r) { DELETED.push(r); ACCTS.splice(r - 2, 1); },
};
function authSS() { return { getSheetByName: function (n) { return n === AUTH_ACCOUNT_SHEET ? SHEET : null; } }; }
/* 개명 도구는 다른 시험(rename-store-test)이 맡는다 — 여기서는 부른 기록과 검사 결과만 흉내 낸다 */
function fnRenameStore(ctx, p) {
  if (RENAME_FAIL) return RENAME_FAIL;
  RENAMED.push((p.apply ? 'apply:' : 'preview:') + p.from + '>' + p.to);
  return { ok: true, 미리보기: !p.apply, 옛이름: p.from, 새이름: p.to, 합계: 3, 자리: [], 캐시: [], 말: p.apply ? '바꿨습니다.' : '아직 아무것도 바꾸지 않았습니다.' };
}

var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}
function acct(id, o) {
  o = o || {};
  return { id: normId(id), rawId: id, name: o.name || id, role: o.role || '매장담당자', scope: (o.scope === undefined) ? id : o.scope,
           status: o.status || '사용', hash: o.hash || '', lastSeen: o.lastSeen || '', dup: !!o.dup };
}
function reset(live, accts) {
  LIVE = live.slice(); ACCTS = accts; APPENDED = []; DELETED = []; DROPPED = []; LOGGED = []; STASH_CLEARED = []; RENAMED = []; RENAME_FAIL = null;
}
var CTX = { id: 'admin', role: '관리자' };

// ══ ① 동기화 미리보기는 쓰지 않는다 ══
reset(['금종제과', '이티에프 베이커리 투고'], [acct('admin', { scope: '*', role: '관리자', hash: 'h' }), acct('금종제과', { hash: 'h' }), acct('이티에프 투고', { hash: 'h', lastSeen: '2026-09-01', status: '중지' })]);
var r = fnAccountSync(CTX, { preview: true });
ok('미리보기 ok', r.ok, true);
ok('미리보기 preview 표시', r.preview, true);
ok('미리보기 — 추가될 것', r.added, ['이티에프 베이커리 투고']);
ok('미리보기 — 시트에 없는 계정 = 이티에프 투고 하나 (admin·금종제과 아님)', r.orphans.map(function (o) { return o.id; }), ['이티에프 투고']);
ok('미리보기 — 고아 정보(비밀번호·접속·상태)', [r.orphans[0].hasPw, r.orphans[0].lastSeen, r.orphans[0].status], [true, '2026-09-01', '중지']);
ok('미리보기 — 아무 행도 안 만듦', APPENDED.length, 0);
ok('미리보기 — 감사로그 없음', LOGGED.length, 0);

// ══ ② 실제 동기화는 추가만 한다 (고아는 보고만) ══
r = fnAccountSync(CTX, {});
ok('실행 — 한 행 추가', APPENDED.map(function (x) { return x[0]; }), ['이티에프 베이커리 투고']);
ok('실행 — 고아는 그대로 보고', r.orphans.map(function (o) { return o.id; }), ['이티에프 투고']);
ok('실행 — 고아는 안 지움', DELETED, []);
ok('실행 — 감사로그 한 줄', LOGGED.length, 1);
ok('실행 — 새 행은 비밀번호 없음·사용', [APPENDED[0][4], APPENDED[0][2]], [STATUS_ON, '매장담당자']);

// 매장범위가 쉼표 목록이면 하나라도 살아 있으면 고아가 아니다
reset(['금종제과'], [acct('지역담당', { scope: '금종제과, 없는매장' })]);
ok('쉼표 범위 — 하나라도 살아 있으면 고아 아님', fnAccountSync(CTX, { preview: true }).orphans, []);
reset(['금종제과'], [acct('지역담당', { scope: '없는매장1, 없는매장2' })]);
ok('쉼표 범위 — 전부 없으면 고아', fnAccountSync(CTX, { preview: true }).orphans.map(function (o) { return o.id; }), ['지역담당']);
reset(['금종제과'], [acct('겹침', { dup: true }), acct('겹침', { dup: true })]);
ok('아이디 겹치는 행은 고아 목록에서 뺀다', fnAccountSync(CTX, { preview: true }).orphans, []);

// ══ ③ 삭제 ══
reset(['금종제과'], [acct('admin', { scope: '*', role: '관리자', hash: 'h' }), acct('금종제과', { hash: 'h' }), acct('옛매장', { hash: 'h', lastSeen: '2026-08-01' })]);
ok('삭제 — 본인은 거절', fnAccountDelete(CTX, { id: 'admin' }).code, 'BAD_REQUEST');
ok('삭제 — 없는 계정', fnAccountDelete(CTX, { id: '유령' }).code, 'NOT_FOUND');
ok('삭제 — 전 매장 권한(*)은 거절', fnAccountDelete({ id: 'other', role: '관리자' }, { id: 'admin' }).code, 'BAD_REQUEST');
ok('삭제 전 아무것도 안 지움', DELETED, []);
r = fnAccountDelete(CTX, { id: '옛매장' });
ok('삭제 ok', [r.ok, r.deleted], [true, '옛매장']);
ok('삭제 — 시트 행 번호 = 4 (세 번째 행)', DELETED, [4]);
ok('삭제 — 남은 계정', ACCTS.map(function (a) { return a.id; }), ['admin', '금종제과']);
ok('삭제 — 비밀번호 보관값·캐시 정리', [STASH_CLEARED, DROPPED], [['옛매장'], ['옛매장']]);
ok('삭제 — 감사로그에 비밀번호 있던 계정 표시', /비밀번호 있던 계정/.test(LOGGED[0]), true);
reset(['금종제과'], [acct('겹침', { dup: true }), acct('겹침', { dup: true })]);
ok('삭제 — 겹치는 행은 getAccount 가 못 찾아 NOT_FOUND', fnAccountDelete(CTX, { id: '겹침' }).code, 'NOT_FOUND');
ok('삭제 — 겹치는 행은 안 지움', DELETED, []);

// ══ ④⑤⑥ 이름 변경 ══
function renameWorld(targetOpts) {
  var a = [acct('admin', { scope: '*', role: '관리자', hash: 'h' }), acct('이티에프 투고', { hash: 'h', lastSeen: '2026-09-01', status: '중지' })];
  if (targetOpts) a.push(acct('이티에프 베이커리 투고', targetOpts));
  reset(['금종제과', '이티에프 베이커리 투고'], a);
}
renameWorld(null);
ok('이름 변경 — 둘 다 적어야', fnAccountRename(CTX, { from: '이티에프 투고' }).code, 'BAD_REQUEST');
ok('이름 변경 — 옛 계정 없음', fnAccountRename(CTX, { from: '유령', to: '이티에프 베이커리 투고' }).code, 'NOT_FOUND');
ok('이름 변경 — 본인 거절', fnAccountRename({ id: normId('이티에프 투고') }, { from: '이티에프 투고', to: '이티에프 베이커리 투고' }).code, 'BAD_REQUEST');
r = fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고' });
ok('이름 변경 미리보기 — ok·미리보기', [r.ok, r.미리보기], [true, true]);
ok('이름 변경 미리보기 — 개명 도구는 미리보기로만', RENAMED, ['preview:이티에프 투고>이티에프 베이커리 투고']);
ok('이름 변경 미리보기 — 정리할 빈 계정 없음', r.정리한계정, '');
ok('이름 변경 미리보기 — 상태 전달', r.상태, '중지');
ok('이름 변경 미리보기 — 아무것도 안 지움', DELETED, []);
r = fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고', apply: true });
ok('이름 변경 실행 — 개명 도구 미리보기 뒤 실행', RENAMED, ['preview:이티에프 투고>이티에프 베이커리 투고', 'preview:이티에프 투고>이티에프 베이커리 투고', 'apply:이티에프 투고>이티에프 베이커리 투고']);
ok('이름 변경 실행 — 중지 상태 안내', /「중지」 상태/.test(r.말), true);

// 동기화가 먼저 만든 빈 계정이 새 이름을 차지하고 있다
renameWorld({ hash: '', lastSeen: '' });
r = fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고' });
ok('빈 계정 — 미리보기는 지우지 않는다', DELETED, []);
ok('빈 계정 — 미리보기가 정리 예정을 알린다', [r.정리한계정, /먼저 지웁니다/.test(r.말)], ['이티에프 베이커리 투고', true]);
r = fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고', apply: true });
ok('빈 계정 — 실행 때 그 행(3번째 = 시트 4행)을 먼저 지운다', DELETED, [4]);
ok('빈 계정 — 지운 뒤 개명 도구 실행', RENAMED[RENAMED.length - 1], 'apply:이티에프 투고>이티에프 베이커리 투고');
ok('빈 계정 — 응답에 정리 표시', [r.ok, r.정리한계정, /먼저 지웠습니다/.test(r.말)], [true, '이티에프 베이커리 투고', true]);
ok('빈 계정 — 정리 감사로그', /동기화가 만든 빈 계정/.test(LOGGED.join('|')), true);

// 새 이름 계정에 비밀번호·접속 기록이 있으면 합치지 않는다
renameWorld({ hash: 'h2', lastSeen: '' });
ok('진짜 계정 — CONFLICT', fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고', apply: true }).code, 'CONFLICT');
ok('진짜 계정 — 안 지움·개명 안 부름', [DELETED, RENAMED], [[], []]);
renameWorld({ hash: '', lastSeen: '2026-09-10' });
ok('접속 기록 있는 계정 — CONFLICT', fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고', apply: true }).code, 'CONFLICT');

// 개명 도구의 안전검사(새 이름이 통합시트에 없음)에 막히면 빈 계정도 건드리지 않는다
renameWorld({ hash: '', lastSeen: '' });
RENAME_FAIL = err('BAD_REQUEST', '새 이름이 통합시트에 없습니다');
r = fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고', apply: true });
ok('개명 검사 실패 — 그 오류 그대로', r.code, 'BAD_REQUEST');
ok('개명 검사 실패 — 빈 계정 안 지움', DELETED, []);

console.log('─────────────────────────────');
console.log(fail ? (pass + '개 통과 · ' + fail + '개 실패') : ('전부 통과  (통과 ' + pass + ')'));
process.exit(fail ? 1 : 0);
