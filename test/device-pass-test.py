# -*- coding: utf-8 -*-
"""기기 통행증 — 남이 만든 로그인 잠금에 진짜 주인이 막히지 않게 (2026-09-15 · 보안 점검 ②)

★Code.gs 의 진짜 로그인 함수들을 잘라내서 돌린다★ (사본 아님).
PROPS · CacheService · Utilities · 계정 조회 · 해시 · 감사로그 · 토큰 서명은 가짜로 끼운다.

왜: 잠금(LK:·lf:)과 아이디별 해시 예산(hb:)이 아이디에 걸려서, 누구든 토큰 없이 아이디 admin 으로
틀린 비밀번호를 10번 보내면 진짜 관리자도 15분(시간당 12번이면 60분) 못 들어왔다.
로그인했던 기기는 통행증을 들고 와서 잠금·예산을 통행증 몫으로 따로 센다.

보는 것:
  ⓪ 로그인 성공 응답에 통행증 · 그 아이디에서만 맞다
  ① 남이 10번 틀리면 잠금 · 통행증 없는 기기는 종전 그대로 막힘
  ② 통행증 기기는 남의 잠금을 지나 로그인
  ③ 아이디 몫 시간당 예산이 소진돼도 통행증 기기는 통과
  ④ 남의 통행증 · 가짜 · 형식 틀린 통행증은 소용없다
  ⑤ 통행증 기기에서도 10번 틀리면 그 통행증이 잠긴다
  ⑥ 다른 통행증 기기는 ⑤와 무관
  ⑦ 감사로그 아이디 칸은 계정 아이디(통행증 키 아님)
  ⑧ TOKEN_KEY 없음 — 통행증 안 줌·검사 안 함   ⑨ 키 바꾸면 옛 통행증 무효
  ⑩ sessionBody(auth.session 경로)도 통행증을 싣는다   ⑪ normId 기준
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
# QSC_SRC=<고치기 전 사본> 으로 돌리면 대조군 (2026-09-25 검수 — ⑫~⑮ 가 실패해야 한다)
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_device_pass.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = src.split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    head = lines[st].rstrip()
    if head.endswith('}') and head.count('{') == head.count('}'):
        return head   # 한 줄짜리 함수
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


# 옛 사본(대조군)에 없는 함수는 종전 동작 그대로의 대역으로
OLD_STUB = {'lkKey': "function lkKey(id) { return 'LK:' + id; }", 'sweepLocks': 'function sweepLocks() { return 0; }',
            # 2026-09-25 검수 · security-2 — 옛 사본에는 없다(대조군은 우산 판정을 직접 셈)
            'umbrellaFull': "function umbrellaFull(o) { return Number(CacheService.getScriptCache().get(hbIdKey('all:' + o)) || 0) >= 60; }"}


def cut_or(name):
    try:
        return cut(name)
    except SystemExit:
        if name in OLD_STUB:
            return OLD_STUB[name]
        raise


REAL = ['normId', 'ctEq', 'validId', 'hourKey', 'bumpHourly', 'hourlyCount', 'sweepLocks', 'hbIdKey', 'umbrellaFull',
        'hashBudgetOk', 'hashBudgetUse', 'lkKey', 'lockCheck', 'lockFail', 'lockClear', 'globalBlocked',
        'globalFail', 'devicePass', 'devicePassKey', 'fnLogin', 'loginByPassword', 'loginFail',
        'loginSuccess', 'sessionBody']

js = r'''
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
''' + '\n'.join(cut_or(n) for n in REAL) + r'''

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
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout, end='')
if r.stderr:
    print(r.stderr)
sys.exit(1 if r.returncode else 0)
