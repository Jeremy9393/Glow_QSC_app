
const crypto = require('crypto');
let props = {};
let PROP_OPS = 0;   // 2026-09-25 검수 · authn-1 — 속성 읽기·쓰기 횟수(시간당 카운터가 속성을 안 쓰는지 본다)
const PROPS = {
  getProperty(k) { PROP_OPS++; return k in props ? props[k] : null; },
  setProperty(k, v) { PROP_OPS++; props[k] = String(v); },
  deleteProperty(k) { PROP_OPS++; delete props[k]; },
  getProperties() { return Object.assign({}, props); },
};
function prop(key, def) { const v = PROPS.getProperty(key); return (v === null || v === undefined || v === '') ? def : v; }
function propN(key, def) { const n = Number(prop(key, def)); return isNaN(n) ? def : n; }
let cache = {};
const CacheService = { getScriptCache() { return {
  get(k) { return k in cache ? cache[k] : null; },
  put(k, v) { if (String(k).length > 250) throw new Error('cache key too long'); cache[k] = String(v); },
  remove(k) { delete cache[k]; },
}; } };
const Utilities = { formatDate(d) { return d.toISOString().slice(0, 13); }, getUuid() { return crypto.randomUUID(); } };
const Session = { getScriptTimeZone() { return 'Asia/Seoul'; } };
function hmacB64(msg, key) { return crypto.createHmac('sha256', String(key)).update(String(msg)).digest('base64url'); }
const ID_MAX = 40, DUMMY_SALT = '0', STATUS_ON = '사용';
const logs = [];
function auditLog(ctx, action, store, result, reason, note) { logs.push({ id: ctx.id, action: action, result: result, reason: reason, note: note }); }
function anonCtx() { return { auth: false, id: '(무인증)', role: '' }; }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function sha256Hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function pwHash(salt, pw) { return 'H:' + salt + ':' + pw; }
const ACCTS = {
  'admin': { id: 'admin', role: '관리자', status: STATUS_ON, salt: 's1', hash: 'H:s1:right-pw', iter: 10000, pepperV: '1' },
  '제주당': { id: '제주당', role: '매장', status: STATUS_ON, salt: 's2', hash: 'H:s2:store-pw', iter: 10000, pepperV: '1' },
};
function getAccount(id) { return ACCTS[id] || null; }
function checkSetupCode() { return false; }
function writeCredential() { }
function writeLastSeen() { }
function dropAccountCache() { }
function signToken(acct) { return { token: 'tk-' + acct.id, exp: 1 }; }
function scopeOf() { return { all: true, list: [] }; }
function menusOf() { return []; }
function maintMsg() { return ''; }
function withNotice(r) { return r; }
function normId(s) {
  return String(s == null ? '' : s).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}
function ctEq(a, b) {
  const x = String(a == null ? '' : a);
  const y = String(b == null ? '' : b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= (x.charCodeAt(i) ^ y.charCodeAt(i));
  return d === 0;
}
function validId(id) {
  if (!id || id.length > ID_MAX) return false;
  /* 정규식에 제어문자를 직접 적으면 이 소스 파일이 바이너리로 취급되어 diff·검색이 막힌다.
     그래서 코드로 검사한다 — 하는 일은 제어문자(0~31·127) 배제와 같다. */
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    if (c < 32 || c === 127) return false;
  }
  return true;
}
function hourKey(prefix) {
  return prefix + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHH');
}
function bumpHourly(prefix) {
  const k = hourKey(prefix);
  const cache = CacheService.getScriptCache();
  const cur = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(cur), 3700);
  if (cur === 1) sweepLocks();
  return cur;
}
function hourlyCount(prefix) { return Number(CacheService.getScriptCache().get(hourKey(prefix)) || 0); }
function sweepLocks() {
  try {
    const cache = CacheService.getScriptCache();
    const mark = hourKey('lksweep:');
    if (cache.get(mark)) return 0;
    cache.put(mark, '1', 3700);
    const all = PROPS.getProperties() || {};
    const now = Date.now();
    let n = 0;
    for (const k in all) {
      if (!Object.prototype.hasOwnProperty.call(all, k)) continue;
      const lk = k.indexOf('LK:') === 0 && !(Number(all[k]) > now);
      const oldHour = /^(AL|AN|HB|GF):\d{10}$/.test(k);
      if (!lk && !oldHour) continue;
      try { PROPS.deleteProperty(k); n++; } catch (e) { }
    }
    return n;
  } catch (e) { return 0; }
}
function hbIdKey(id) {
  return 'hb:' + String(id || '?').slice(0, 60) + ':' + Math.floor(Date.now() / 3600000);
}
function umbrellaFull(owner) {
  if (!owner) return false;
  try {
    return Number(CacheService.getScriptCache().get(hbIdKey('all:' + owner)) || 0) >= propN('HASH_BUDGET_ID_ALL', 60);
  } catch (e) { return false; }
}
function hashBudgetOk(id, owner) {
  const cache = CacheService.getScriptCache();
  if (id) {
    const per = Number(cache.get(hbIdKey(id)) || 0);
    if (per >= propN('HASH_BUDGET_ID', 12)) return false;
  }
  if (owner && String(id || '').indexOf('dp:') === 0) {
    if (umbrellaFull(owner)) return false;
  }
  if (hourlyCount('HB:') < propN('HASH_BUDGET', 300)) return true;
  /* 전역 소진 — 최근 실패가 없는 아이디만 통과시킨다(공격자의 아이디는 lf: 카운터가 올라 있다) */
  if (!id) return false;
  try { return Number(cache.get('lf:' + id) || 0) === 0; } catch (e) { return false; }
}
function hashBudgetUse(id, owner) {
  bumpHourly('HB:');
  if (!id) return;
  try {
    const cache = CacheService.getScriptCache();
    const k = hbIdKey(id);
    cache.put(k, String(Number(cache.get(k) || 0) + 1), 3700);
    if (owner && String(id).indexOf('dp:') === 0) {   // 통행증 몫 아이디 우산 (authn-7)
      const ka = hbIdKey('all:' + owner);
      cache.put(ka, String(Number(cache.get(ka) || 0) + 1), 3700);
    }
  } catch (e) { }
}
function lkKey(id) { return 'LK:' + sha256Hex(String(id)).slice(0, 16); }
function lockCheck(id) {
  const until = Number(PROPS.getProperty(lkKey(id)) || 0);
  if (until > Date.now()) {
    return { locked: true, retryAfterMin: Math.max(1, Math.ceil((until - Date.now()) / 60000)) };
  }
  return { locked: false };
}
function lockFail(id) {
  const cache = CacheService.getScriptCache();
  const k = 'lf:' + id;
  /* LockService를 쓰지 않는다 — read-modify-write라 몇 회 누락될 수 있지만, 무차별 대입은
     수천 회 시도이므로 10회가 13회로 새는 것은 무의미하고 정상 로그인을 느리게 만들 이유가 없다. */
  const n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), 600);
  if (n >= propN('LOGIN_FAIL_MAX', 10)) {
    PROPS.setProperty(lkKey(id), String(Date.now() + 15 * 60000));
    cache.remove(k);
    return true;
  }
  return false;
}
function lockClear(id) {
  try { PROPS.deleteProperty(lkKey(id)); } catch (e) { }
  try { CacheService.getScriptCache().remove('lf:' + id); } catch (e) { }
}
function globalBlocked() {
  const until = Number(PROPS.getProperty('GBLK') || 0);
  if (until > Date.now()) return Math.max(1, Math.ceil((until - Date.now()) / 60000));
  return 0;
}
function globalFail() {
  const n = bumpHourly('GF:');
  if (n >= propN('GLOBAL_FAIL_MAX', 40)) {
    const wasBlocked = globalBlocked() > 0;
    PROPS.setProperty('GBLK', String(Date.now() + 30 * 60000));
    if (!wasBlocked) {
      auditLog(anonCtx(), 'auth.login', '', '경보', 'GLOBAL_THROTTLE', '시간당 로그인 실패 상한 초과');
    }
  }
}
function devicePass(id) {
  const key = prop('TOKEN_KEY', '');
  if (!key || !id) return '';
  try {
    const n = Utilities.getUuid().replace(/-/g, '').toLowerCase().slice(0, 16);
    return n + '.' + hmacB64('dp:' + normId(id) + ':' + n, key).slice(0, 32);
  } catch (e) { return ''; }   // 통행증 때문에 로그인·세션 응답이 깨지면 안 된다
}
function devicePassKey(id, dp) {
  const key = prop('TOKEN_KEY', '');
  const s = String(dp || '');
  if (!key || !id || s.length !== 49) return '';
  const n = s.slice(0, 16);
  if (s.charAt(16) !== '.' || !/^[0-9a-f]{16}$/.test(n)) return '';
  if (!ctEq(s.slice(17), hmacB64('dp:' + normId(id) + ':' + n, key).slice(0, 32))) return '';
  return 'dp:' + n;
}
function fnLogin(ctx, payload) {
  if (!prop('TOKEN_KEY', '')) return err('SERVER_ERROR', '서버 설정이 끝나지 않았습니다. 담당자에게 문의해 주세요.');
  return loginByPassword(
    String(payload && payload.id ? payload.id : ''),
    String(payload && payload.pw ? payload.pw : ''),
    String(payload && payload.dp ? payload.dp : ''));
}
function loginByPassword(rawId, pw, dp) {
  const id = normId(rawId);
  if (!id || !pw) return err('AUTH_INVALID', '아이디 또는 비밀번호가 올바르지 않습니다.');
  /* 형식이 틀린 아이디는 '없는 계정'과 완전히 같은 경로를 탄다 — 더미 해시까지 동일하게 돌려
     응답 시간으로 구분되지 않게 하고, 잠금 키만 고정 문자열로 바꿔 키 폭증을 막는다. */
  const idOk = validId(id);
  const lockId = idOk ? id : '(형식오류)';
  /* ★잠금·예산은 lockKey 로 센다★ — 맞는 기기 통행증을 들고 왔으면 통행증 몫, 아니면 종전대로 아이디 몫.
     감사로그에 적는 이름은 계속 lockId 다(loginFail 첫 인자). devicePass 설명 참조 */
  let lockKey = (idOk && devicePassKey(id, dp)) || lockId;
  /* 2026-09-25 검수 · security-2 — 그 아이디의 통행증 우산이 찼으면(남이 모은 통행증들로) LOCKED 로 끊지 않고
     통행증이 없는 것과 같이 아이디 몫으로 센다. 통행증 소지자가 통행증 없는 사람보다 불리해지지 않는다. */
  if (lockKey !== lockId && umbrellaFull(id)) lockKey = lockId;

  // ★잠금·예산 확인이 게이트의 가장 앞이다. 잠금 중이면 해시 계산 자체를 하지 않는다★
  const lk = lockCheck(lockKey);
  if (lk.locked) {
    return { ok: false, code: 'LOCKED', retryAfterMin: lk.retryAfterMin, error: '로그인 시도가 많아 잠겼습니다. ' + lk.retryAfterMin + '분 후 다시 시도해 주세요.' };
  }
  /* ★예산은 아이디별로 본다★ — 인자를 빼면 남이 태운 전역 예산 때문에 이 사람이 못 들어간다 */
  if (!hashBudgetOk(lockKey, id)) {   // 두 번째 인자 = 통행증 몫 아이디 우산 (2026-09-25 검수 · authn-7)
    auditLog(anonCtx(), 'auth.login', '', '거부', 'HASH_BUDGET', '');
    return { ok: false, code: 'LOCKED', retryAfterMin: 60, error: '로그인이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.' };
  }
  if (!prop('PW_PEPPER', '')) return err('SERVER_ERROR', '서버 설정이 끝나지 않았습니다. 담당자에게 문의해 주세요.');

  const iter = Math.max(1, propN('PW_ITER', 10000));
  const acct = idOk ? getAccount(id) : null;

  /* 존재하지 않는 아이디도 동일하게 카운트하고, 고정 더미 솔트로 동일한 N회 해시를 돌린 뒤
     실패를 반환한다. 빼면 응답 시간으로 유효 아이디를 뽑아낼 수 있다. */
  if (!acct || acct.status !== STATUS_ON) {
    hashBudgetUse(lockKey, id);
    pwHash(DUMMY_SALT, pw, iter);
    /* ★없는 아이디의 원문은 감사로그에 남기지 않는다★ (loginFail 세 번째 인자) */
    return loginFail(lockId, acct ? 'ACCOUNT_DISABLED' : (idOk ? 'NO_ACCOUNT' : 'BAD_ID'), !!acct, lockKey);
  }

  /* 해시가 비어 있어도 같은 시간을 쓴다 — 여기서 빨리 돌아가면 응답 시간만으로
     "존재하지만 비밀번호가 없는 계정"을 알아낼 수 있다. */
  hashBudgetUse(lockKey, id);
  if (!acct.hash) {
    pwHash(acct.salt || DUMMY_SALT, pw, iter);
  } else {
    const h = pwHash(acct.salt, pw, acct.iter || iter);
    if (ctEq(h, acct.hash)) {
      /* 반복수가 현행 PW_ITER보다 낮으면 그 자리에서 재해시해 덮어쓴다 —
         원문을 아는 유일한 순간이고, 사용자는 아무것도 하지 않는다. */
      if ((acct.iter || 0) < iter || acct.pepperV !== prop('PW_PEPPER_V', '1')) {
        try { writeCredential(acct, pw, iter); } catch (e) { /* 승급 실패가 로그인을 막으면 안 된다 */ }
      }
      return loginSuccess(getAccount(id) || acct, '비밀번호', lockKey);
    }
  }

  /* 설정코드 분기 — ★관리자 계정 부트스트랩·복구 전용이다★
     매장에는 설정코드를 발급하지 않는다(확정사항 3: 비밀번호는 관리자가 정해서 알려 준다).
     남겨 두는 이유는 하나뿐이다: 관리자 본인이 비밀번호를 잊으면 accounts.html에 들어갈 수
     없고, 그러면 앱 전체를 아무도 복구할 수 없다. 그때 편집기에서 issueAdminSetupCode()를
     돌리는 것이 유일한 탈출구다.
     ★아이디가 실제로 존재할 때만 SET_PW를 준다★ — 없는 아이디에 주면 계정 열거 오라클이 된다. */
  if (checkSetupCode(pw, acct.id)) {
    auditLog({ id: acct.id, role: acct.role }, 'auth.login', '', '성공', 'SET_PW', '설정코드 확인');
    return { ok: false, code: 'SET_PW', error: '최초 로그인입니다. 새 비밀번호를 정해 주세요.' };
  }
  return loginFail(lockId, 'BAD_PASSWORD', true, lockKey);
}
function loginFail(id, reason, known, lockKey) {
  globalFail();
  const locked = lockFail(lockKey || id);   // 통행증 기기면 통행증 몫으로 센다 · 감사로그 이름은 id 그대로
  const logId = known ? id : ('(미상:' + sha256Hex(String(id)).slice(0, 8) + ')');
  auditLog({ id: logId, role: '' }, 'auth.login', '', '실패', reason, locked ? '잠금 발동' : '');
  if (locked) {
    return { ok: false, code: 'LOCKED', retryAfterMin: 15, error: '로그인 시도가 많아 잠겼습니다. 15분 후 다시 시도해 주세요.' };
  }
  // 전역 차단은 '실패한 시도'에만 알린다 (정상 자격증명은 이 함수에 도달하지 않는다)
  const gb = globalBlocked();
  if (gb) return { ok: false, code: 'LOCKED', retryAfterMin: gb, error: '로그인 시도가 많아 잠시 제한되었습니다. ' + gb + '분 후 다시 시도해 주세요.' };
  return err('AUTH_INVALID', '아이디 또는 비밀번호가 올바르지 않습니다.');
}
function loginSuccess(acct, how, lockKey) {
  lockClear(acct.id);
  if (lockKey && lockKey !== acct.id) lockClear(lockKey);   // 통행증 몫 실패 카운터도 함께 비운다
  writeLastSeen(acct);
  dropAccountCache(acct.id);
  const fresh = getAccount(acct.id) || acct;
  const tk = signToken(fresh);
  if (!tk) return err('SERVER_ERROR', '서버 설정이 끝나지 않았습니다. 담당자에게 문의해 주세요.');
  auditLog({ id: fresh.id, role: fresh.role }, 'auth.login', '', '성공', '', how);
  const s = sessionBody(fresh);
  s.token = tk.token;
  s.exp = tk.exp;
  return s;
}
function sessionBody(acct) {
  const st = scopeOf(acct);
  return withNotice({
    ok: true,
    serverTime: Math.floor(Date.now() / 1000),
    user: { id: acct.id, name: acct.name, role: acct.role },
    stores: { all: st.all, list: st.list },
    menus: menusOf(acct.role),
    maint: maintMsg(),
    device: devicePass(acct.id)   // 기기 통행증 — 로그인·세션·비밀번호 설정 응답이 모두 여기를 지난다
  });
}

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
props = { TOKEN_KEY: 'k', PW_PEPPER: 'p' };
function login(id, pw, dp) { return fnLogin({}, { id: id, pw: pw, dp: dp }); }

let r = login('admin', 'right-pw');
ok('⓪ 로그인 성공 · 통행증 49자', r.ok === true && typeof r.device === 'string' && r.device.length === 49);
const passA = r.device;
ok('⓪ 통행증은 그 아이디에서만 맞다', devicePassKey('admin', passA) !== '' && devicePassKey('제주당', passA) === '');
const passS = login('제주당', 'store-pw').device;

for (let i = 0; i < 10; i++) r = login('admin', 'wrong' + i);
ok('① 남이 10번 틀리면 admin 잠금(15분)', r.code === 'LOCKED' && r.retryAfterMin === 15);
ok('① 통행증 없는 기기(새 기기)는 종전 그대로 막힘', login('admin', 'right-pw').code === 'LOCKED');

r = login('admin', 'right-pw', passA);
ok('② 통행증 기기는 남의 잠금을 지나 로그인', r.ok === true && r.token === 'tk-admin');

for (let i = 0; i < 3; i++) r = login('admin', 'again' + i);
ok('③ 아이디 몫 시간당 예산 소진(60분)', r.code === 'LOCKED' && r.retryAfterMin === 60);
ok('③ 통행증 기기는 예산 소진에도 통과', login('admin', 'right-pw', passA).ok === true);

ok('④ 제주당 통행증으로 admin — 아이디 몫(막힘)', login('admin', 'right-pw', passS).code === 'LOCKED');
ok('④ 가짜 통행증 — 아이디 몫(막힘)', login('admin', 'right-pw', '0123456789abcdef.' + 'A'.repeat(32)).code === 'LOCKED');
ok('④ 형식 틀린 통행증 — 아이디 몫(막힘)', login('admin', 'right-pw', 'garbage').code === 'LOCKED');

for (let i = 0; i < 10; i++) r = login('admin', 'guess' + i, passA);
ok('⑤ 통행증 기기에서 10번 틀리면 그 통행증이 잠김', r.code === 'LOCKED' && r.retryAfterMin === 15);
ok('⑤ 잠긴 통행증은 맞는 비밀번호도 막힘', login('admin', 'right-pw', passA).code === 'LOCKED');

const passB = devicePass('admin');
ok('⑥ 다른 통행증 기기는 따로 — 로그인', login('admin', 'right-pw', passB).ok === true);

ok('⑦ 감사로그 아이디 칸에 dp: 키가 없다', logs.every(function (l) { return String(l.id).indexOf('dp:') < 0; }));
ok('⑦ 통행증 기기의 실패도 admin 으로 남는다', logs.some(function (l) { return l.id === 'admin' && l.reason === 'BAD_PASSWORD'; }));

const saved = props.TOKEN_KEY;
delete props.TOKEN_KEY;
ok('⑧ 키 없음 — 통행증 안 줌 · 검사 안 함', devicePass('admin') === '' && devicePassKey('admin', passB) === '');
props.TOKEN_KEY = 'k2';
ok('⑨ 키 바꾸면 옛 통행증 무효', devicePassKey('admin', passB) === '');
props.TOKEN_KEY = saved;

ok('⑩ sessionBody 가 통행증을 싣는다(이미 로그인된 기기용)', devicePassKey('제주당', sessionBody(ACCTS['제주당']).device) !== '');
ok('⑪ normId 기준 — 대소문자·앞뒤 공백 무관', devicePassKey(' ADMIN ', passB) !== '');

/* ── 2026-09-25 검수 ── */
const keysNow = Object.keys(props);
ok('⑫ authn-3 잠금 키에 아이디 원문이 없다(LK:admin 없음)', keysNow.indexOf('LK:admin') < 0 && lkKey('admin') !== 'LK:admin');
ok('⑫ authn-3 잠금 키는 LK:+해시 16자', keysNow.some(function (k) { return /^LK:[0-9a-f]{16}$/.test(k); }) &&
   keysNow.filter(function (k) { return k.indexOf('LK:') === 0; }).every(function (k) { return /^LK:[0-9a-f]{16}$/.test(k); }));
ok('⑬ authn-1 시간당 카운터(AL·AN·HB·GF)가 속성에 없다', !keysNow.some(function (k) { return /^(AL|AN|HB|GF):/.test(k); }));
ok('⑬ authn-1 대신 캐시에 있다(HB·GF)', Object.keys(cache).some(function (k) { return k.indexOf('HB:') === 0; }) &&
   Object.keys(cache).some(function (k) { return k.indexOf('GF:') === 0; }));

/* ⑭ authn-3 만료 잠금 정리 — 시간 첫 카운터가 한 번 돈다 · 옛 원문 키도 · 옛 시간 카운터 찌꺼기도 */
const past = String(Date.now() - 60000), future = String(Date.now() + 10 * 60000);
props['LK:옛원문아이디'] = past; props['LK:0123456789abcdef'] = past; props['LK:fedcba9876543210'] = future;
props['AL:2026092510'] = '5'; props['HB:2026092509'] = '9'; props['MC:file:2610'] = '2026-11-05';
cache = {};                                   // 새 시간(캐시가 빈 상태) — 첫 bumpHourly 가 정리를 부른다
bumpHourly('HB:');
ok('⑭ 만료된 LK:(옛 원문·해시) 둘 다 지워진다', !('LK:옛원문아이디' in props) && !('LK:0123456789abcdef' in props));
ok('⑭ 아직 살아 있는 잠금은 남는다', props['LK:fedcba9876543210'] === future);
ok('⑭ 옛 시간 카운터 찌꺼기도 지워진다 · 다른 속성(MC:)은 그대로', !('AL:2026092510' in props) && !('HB:2026092509' in props) && props['MC:file:2610'] === '2026-11-05');
props['LK:또옛키'] = past;
bumpHourly('AL:');                            // 같은 시간 두 번째 카운터 — 정리는 시간에 한 번뿐
ok('⑭ 같은 시간에는 한 번만 돈다', props['LK:또옛키'] === past);

/* ⑮ authn-7 통행증 몫 아이디 우산 — 통행증을 여러 장 모아도 그 아이디의 통행증 몫 합계는 시간당 60(HASH_BUDGET_ID_ALL) */
cache = {}; props = { TOKEN_KEY: 'k', PW_PEPPER: 'p' };
const many = [];
for (let i = 0; i < 7; i++) many.push(devicePass('제주당'));
for (let p = 0; p < 6; p++) for (let i = 0; i < 10; i++) login('제주당', 'x' + p + '-' + i, many[p]);   // 6장 × 10번 = 60
ok('⑮ 우산이 찼다(통행증 몫 합계 60)', umbrellaFull('제주당') === true);
/* 2026-09-25 검수 · security-2 — 우산이 차면 LOCKED 가 아니라 아이디 몫(12)으로 떨어진다 */
const idBefore = Number(cache[hbIdKey('제주당')] || 0);
r = login('제주당', 'store-pw', many[6]);
ok('⑮ 다른 통행증들이 우산을 채운 뒤에도 주인 기기 통행증 + 맞는 비밀번호는 LOCKED 가 아니다(아이디 몫으로)', r.ok === true && r.code !== 'LOCKED', r);
ok('⑮ 그때 해시 예산은 아이디 몫으로 셌다', Number(cache[hbIdKey('제주당')] || 0) === idBefore + 1, [idBefore, cache[hbIdKey('제주당')]]);
/* 우산이 찬 뒤 통행증으로 계속 두드려도 아이디 몫(12)에 묶인다 — 통행증 몫이 다시 늘지 않는다 */
cache = {}; props = { TOKEN_KEY: 'k', PW_PEPPER: 'p' };
for (let p = 0; p < 6; p++) for (let i = 0; i < 10; i++) login('제주당', 'y' + p + '-' + i, many[p]);
let got = 0;
for (let i = 0; i < 30; i++) { const rr = login('제주당', 'z' + i, many[i % 6]); if (rr.code !== 'LOCKED') got++; }
ok('⑮ 우산이 찬 뒤 통행증 대입은 아이디 몫 안(12 이하)으로 묶인다', got <= 12, got);
ok('⑮ 우산 카운터는 60에서 더 오르지 않는다', Number(cache[hbIdKey('all:제주당')] || 0) === 60, cache[hbIdKey('all:제주당')]);
ok('⑮ 다른 아이디(admin) 통행증은 영향 없음', login('admin', 'right-pw', devicePass('admin')).ok === true);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
