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
import io, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = HERE.parents[1] / 'backend' / 'Code.gs'
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


REAL = ['normId', 'ctEq', 'validId', 'hourKey', 'bumpHourly', 'hourlyCount', 'hbIdKey',
        'hashBudgetOk', 'hashBudgetUse', 'lockCheck', 'lockFail', 'lockClear', 'globalBlocked',
        'globalFail', 'devicePass', 'devicePassKey', 'fnLogin', 'loginByPassword', 'loginFail',
        'loginSuccess', 'sessionBody']

js = r'''
const crypto = require('crypto');
let props = {};
const PROPS = {
  getProperty(k) { return k in props ? props[k] : null; },
  setProperty(k, v) { props[k] = String(v); },
  deleteProperty(k) { delete props[k]; },
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
''' + '\n'.join(cut(n) for n in REAL) + r'''

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

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout, end='')
if r.stderr:
    print(r.stderr)
sys.exit(1 if r.returncode else 0)
