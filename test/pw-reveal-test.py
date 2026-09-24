# -*- coding: utf-8 -*-
"""계정 관리 「비밀번호 보기」 — 관리자 비밀번호 한 번 더 (account.revealPw) 시험 (2026-09-17)

★Code.gs 의 진짜 accountRow · fnAccountList · fnAccountRevealPw · lockCheck · lockFail · lockClear · ctEq · err · koCmp
  를 잘라내서 돌린다★ (사본 아님). 계정·보관값·해시·속성·캐시는 가짜로 끼운다.

담당자 (2026-09-17 질문 「관리자 폰」 → 선택 「비밀번호 볼 때 한 번 더 확인 (추천)」):
  관리자 로그인은 무기한(확정사항 4)이라 관리자 폰을 잃어버리면 주운 사람이 「계정 관리」에서
  모든 계정의 비밀번호를 볼 수 있었다 → 비밀번호를 볼 때 관리자 비밀번호를 다시 묻는다.

보는 것:
  ① 목록(account.list)에 원문이 한 글자도 없다 · pwKnown 이 보관값 유무와 맞다 · 칸 이름이 ACCOUNT_PUBLIC 과 같다
  ② 비밀번호가 맞을 때만 원문을 준다 · ★확인하는 것은 로그인한 본인(ctx.id)의 비밀번호★ (payload.id 무시)
  ③ ★틀리면 로그인과 같은 잠금으로 센다★ — LOGIN_FAIL_MAX 번째에 LOCKED · 잠긴 동안은 맞는 비밀번호도 해시 없이 거절
  ④ ★오류 코드에 AUTH_* 가 없다★ — api.js 가 AUTH_* 를 가로채 재로그인·로그인 화면으로 보낸다
  ⑤ 해시 예산이 바닥이면 해시 없이 거절 · 설정 미완 · 중지·없는 계정 · 빈 입력
  ⑥ 화면(accounts-app.js)이 받은 값을 메모리에만 두고 5분 뒤·화면을 떠날 때 다시 가린다 · 입력칸은 password

쓰는 법:  python pw-reveal-test.py                (실제 Code.gs · js)
          python pw-reveal-test.py <Code.gs 경로>   (일부러 망가뜨린 사본이 잡히는지 볼 때)
"""
import io, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / 'backend' / 'Code.gs'
APP = HERE.parent / 'js' / 'accounts-app.js'
API = HERE.parent / 'js' / 'api.js'
PAGE = HERE.parent / 'accounts.html'
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\_도구\node\node.exe')
OUT = HERE / 't_pw_reveal.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

text = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = text.split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cutline(prefix):
    return next(l for l in lines if l.startswith(prefix))


# 2026-09-25 검수 · authn-3 — 잠금 키가 lkKey(해시)로 바뀌어 함께 잘라 온다
NAMES = ['accountRow', 'fnAccountList', 'fnAccountRevealPw', 'lkKey', 'lockCheck', 'lockFail', 'lockClear', 'ctEq', 'err', 'koCmp']
body = '\n'.join(cut(n) for n in NAMES) + '\n' + cutline('const ACCOUNT_PUBLIC ') + '\n' + cutline('const STATUS_ON ')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ══════════════════════════════════════════════════
var PSTORE = {};
function sha256Hex(s) { return require('crypto').createHash('sha256').update(String(s)).digest('hex'); }
var PROPS = {
  getProperty: function (k) { return Object.prototype.hasOwnProperty.call(PSTORE, k) ? PSTORE[k] : null; },
  setProperty: function (k, v) { PSTORE[k] = String(v); },
  deleteProperty: function (k) { delete PSTORE[k]; },
  getProperties: function () { return Object.assign({}, PSTORE); }
};
var CSTORE = {};
var CacheService = { getScriptCache: function () { return {
  get: function (k) { return Object.prototype.hasOwnProperty.call(CSTORE, k) ? CSTORE[k] : null; },
  put: function (k, v) { CSTORE[k] = String(v); },
  remove: function (k) { delete CSTORE[k]; }
}; } };
var PV = { TOKEN_KEY: 'tk', PW_PEPPER: 'pp' };
function prop(k, d) { return Object.prototype.hasOwnProperty.call(PV, k) ? PV[k] : d; }
function propN(k, d) { return Object.prototype.hasOwnProperty.call(PV, k) ? Number(PV[k]) : d; }
var HASHES = 0;
function pwHash(salt, plain, iter) { HASHES++; return 'H(' + salt + '|' + plain + ')'; }
var BUDGET = 1000;
function hashBudgetOk(id) { return BUDGET > 0; }
function hashBudgetUse(id) { BUDGET--; }
var ACCTS = [
  { id: 'admin', rawId: 'admin', role: '관리자', status: '사용', scope: '*', salt: 's1', hash: 'H(s1|Admin-Secret-2026)', iter: 10000, pwAt: '2026-09-01', lastSeen: '' },
  { id: '제주당', rawId: '제주당', role: '매장담당자', status: '사용', scope: '제주당', salt: 's2', hash: 'H(s2|jeju-pass-11)', iter: 10000, pwAt: '', lastSeen: '' },
  { id: '카페 라', rawId: '카페 라', role: '매장담당자', status: '사용', scope: '카페 라', salt: 's3', hash: 'H(s3|cafe-pass-22)', iter: 10000, pwAt: '', lastSeen: '' },
  { id: '옛매장', rawId: '옛매장', role: '매장담당자', status: '사용', scope: '옛매장', salt: 's4', hash: 'H(s4|old-pass-33)', iter: 10000, pwAt: '', lastSeen: '' },
  { id: '미설정', rawId: '미설정', role: '매장담당자', status: '사용', scope: '미설정', salt: '', hash: '', iter: 0, pwAt: '', lastSeen: '' },
  { id: '중지매장', rawId: '중지매장', role: '매장담당자', status: '중지', scope: '중지매장', salt: 's6', hash: 'H(s6|stop-pass-44)', iter: 10000, pwAt: '', lastSeen: '' },
  { id: 'fnb', rawId: 'fnb', role: 'F&B팀', status: '중지', scope: '*', salt: 's7', hash: 'H(s7|fnb-pass-55)', iter: 10000, pwAt: '', lastSeen: '' }
];
// 보관값 — 옛매장은 보관 기능 전에 정해 보관값이 없다 · 미설정은 해시가 없다
var STASH = { 'admin': 'Admin-Secret-2026', '제주당': 'jeju-pass-11', '카페 라': 'cafe-pass-22', '중지매장': 'stop-pass-44', 'fnb': 'fnb-pass-55' };
function readAccounts() { return ACCTS.map(function (a) { return Object.assign({}, a); }); }
function getAccount(id) { for (var i = 0; i < ACCTS.length; i++) if (ACCTS[i].id === id) return Object.assign({}, ACCTS[i]); return null; }
function pwStashAll() { return {}; }
function pwStashRead(id, hash, props) { return hash ? (STASH[id] || '') : ''; }
function nowIso() { return '2026-09-17T13:00:00+09:00'; }
function roleNames() { return ['관리자', '매장담당자', 'F&B팀']; }
function missingStoreAccounts(all) { return []; }
function maintMsg() { return ''; }

var pass = 0, fail = 0;
function ok(what, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + what); }
  else { fail++; console.log('  ✗ ' + what + '\n      받음: ' + g + '\n      기대: ' + w); }
}
var CODES = [];
function reveal(ctx, payload) { var r = fnAccountRevealPw(ctx, payload); if (r && r.code) CODES.push(r.code); return r; }
function reset() { PSTORE = {}; CSTORE = {}; HASHES = 0; BUDGET = 1000; PV = { TOKEN_KEY: 'tk', PW_PEPPER: 'pp' }; }
var ADMIN = { auth: true, id: 'admin', role: '관리자' };
var RIGHT = 'Admin-Secret-2026';
var SECRETS = ['Admin-Secret-2026', 'jeju-pass-11', 'cafe-pass-22', 'old-pass-33', 'stop-pass-44', 'fnb-pass-55'];

console.log('── ① 목록(account.list)에는 원문이 없다 ──');
reset();
var L = fnAccountList(ADMIN);
var LJ = JSON.stringify(L);
ok('목록 응답 ok', L.ok, true);
ok('★목록 응답 어디에도 비밀번호 원문이 없다★', SECRETS.filter(function (s) { return LJ.indexOf(s) >= 0; }), []);
ok('줄마다 pw 칸이 없다', L.rows.filter(function (r) { return Object.prototype.hasOwnProperty.call(r, 'pw'); }).map(function (r) { return r.id; }), []);
var known = {}; L.rows.forEach(function (r) { known[r.id] = [r.hasPw, r.pwKnown]; });
ok('admin — 설정·보관 있음', known['admin'], [true, true]);
ok('옛매장 — 설정됐지만 보관값 없음(화면 「확인 불가」)', known['옛매장'], [true, false]);
ok('미설정 — 설정 안 됨', known['미설정'], [false, false]);
ok('중지매장 — 설정·보관 있음(중지여도 목록에는 뜬다)', known['중지매장'], [true, true]);
ok('칸 이름 = ACCOUNT_PUBLIC (문서와 실제가 같다)', Object.keys(accountRow(ACCTS[0], {})).sort(), ACCOUNT_PUBLIC.slice().sort());
ok('목록을 불러도 해시 계산 0', HASHES, 0);

console.log('── ② 맞는 비밀번호 → 원문을 준다 ──');
reset();
var R = reveal(ADMIN, { pw: RIGHT });
ok('ok', R.ok, true);
ok('보관값이 있는 계정 전부(중지 포함) · 옛매장·미설정 없음', Object.keys(R.pws).sort(), ['admin', 'fnb', '제주당', '중지매장', '카페 라'].sort());
ok('값이 보관값 그대로', [R.pws['제주당'], R.pws['카페 라']], ['jeju-pass-11', 'cafe-pass-22']);
ok('해시 1번', HASHES, 1);

console.log('── ③ 틀린 비밀번호 · 남의 비밀번호 · payload.id ──');
reset();
var W = reveal(ADMIN, { pw: 'wrong-guess' });
ok('틀림 → PW_WRONG', W.code, 'PW_WRONG');
ok('틀림 → 원문 없음', W.pws === undefined && JSON.stringify(W).indexOf('jeju-pass-11') < 0, true);
ok('틀림 → 실패 카운터 1', CSTORE['lf:admin'], '1');
reset();
ok('★매장 비밀번호를 넣어도 안 된다(본인 것만 확인)★', reveal(ADMIN, { pw: 'jeju-pass-11' }).code, 'PW_WRONG');
reset();
ok('★payload.id 로 남의 계정을 대신 확인시키지 못한다★', reveal(ADMIN, { pw: 'jeju-pass-11', id: '제주당' }).code, 'PW_WRONG');

console.log('── ④ 잠금 — 로그인과 같은 규칙 ──');
reset();
var codes = [];
for (var i = 0; i < 10; i++) codes.push(reveal(ADMIN, { pw: 'guess-' + i }).code);
ok('1~9번째 PW_WRONG · 10번째 LOCKED (LOGIN_FAIL_MAX 기본 10)', codes, ['PW_WRONG','PW_WRONG','PW_WRONG','PW_WRONG','PW_WRONG','PW_WRONG','PW_WRONG','PW_WRONG','PW_WRONG','LOCKED']);
ok('잠금이 속성(lkKey(admin) — 해시 키)에 남는다', !!PSTORE[lkKey('admin')], true);
ok('속성 키에 아이디 원문이 없다 (2026-09-25 검수 · authn-3)', PSTORE['LK:admin'] === undefined, true);
var h0 = HASHES;
var LR = reveal(ADMIN, { pw: RIGHT });
ok('★잠긴 동안은 맞는 비밀번호도 LOCKED★', LR.code, 'LOCKED');
ok('★잠긴 동안은 원문 없음★', LR.pws === undefined, true);
ok('★잠긴 동안은 해시를 계산하지 않는다★', HASHES - h0, 0);
PSTORE[lkKey('admin')] = String(Date.now() - 1000);   // 잠금 시간이 지났다
var AR = reveal(ADMIN, { pw: RIGHT });
ok('잠금이 풀리면 맞는 비밀번호로 열린다', AR.ok, true);
ok('성공하면 잠금·카운터를 비운다', [PSTORE[lkKey('admin')] === undefined, CSTORE['lf:admin'] === undefined], [true, true]);
reset();
PV.LOGIN_FAIL_MAX = '3';
var c3 = []; for (var j = 0; j < 3; j++) c3.push(reveal(ADMIN, { pw: 'x' + j }).code);
ok('LOGIN_FAIL_MAX 속성을 따른다 (3)', c3, ['PW_WRONG', 'PW_WRONG', 'LOCKED']);

console.log('── ⑤ 해시 예산 · 설정 · 계정 상태 · 빈 입력 ──');
reset();
BUDGET = 0;
var B = reveal(ADMIN, { pw: RIGHT });
ok('예산 바닥 → LOCKED(60분) · 해시 없음 · 원문 없음', [B.code, B.retryAfterMin, HASHES, B.pws === undefined], ['LOCKED', 60, 0, true]);
reset(); PV = { PW_PEPPER: 'pp' };
ok('TOKEN_KEY 없음 → SERVER_ERROR', reveal(ADMIN, { pw: RIGHT }).code, 'SERVER_ERROR');
reset();
ok('빈 입력 → BAD_REQUEST · 해시 없음', [reveal(ADMIN, { pw: '' }).code, HASHES], ['BAD_REQUEST', 0]);
ok('입력 없음(payload 없음) → BAD_REQUEST', reveal(ADMIN, null).code, 'BAD_REQUEST');
ok('로그인 안 됨(ctx.auth 없음) → FORBIDDEN', reveal({ id: 'admin' }, { pw: RIGHT }).code, 'FORBIDDEN');
ok('없는 계정 → FORBIDDEN', reveal({ auth: true, id: '유령' }, { pw: RIGHT }).code, 'FORBIDDEN');
ok('중지된 계정 → FORBIDDEN', reveal({ auth: true, id: 'fnb' }, { pw: 'fnb-pass-55' }).code, 'FORBIDDEN');
ok('비밀번호 미설정 계정 → FORBIDDEN', reveal({ auth: true, id: '미설정' }, { pw: 'anything-1' }).code, 'FORBIDDEN');
ok('거절들에서 해시 0', HASHES, 0);

console.log('── ⑥ ★어떤 경우에도 AUTH_* 코드를 내지 않는다★ ──');
ok('나온 코드에 AUTH_ 없음', CODES.filter(function (c) { return /^AUTH_/.test(c); }), []);

console.log('\n통과 ' + pass + ' · 실패 ' + fail);
if (fail) process.exit(1);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout or '')
if r.stderr:
    print(r.stderr)

# ── 소스 자체를 보는 검사 ──────────────────────────────────────────
sp, sf = 0, 0


def src_ok(what, cond):
    global sp, sf
    if cond:
        sp += 1
        print('  ✓ %s' % what)
    else:
        sf += 1
        print('  ✗ %s' % what)


print('── 소스 검사 ──')
REV = cut('fnAccountRevealPw')
src_ok("등록표: account.revealPw = 계정관리 ★쓰기★ (감사로그가 남는다)",
       "'account.revealPw':    { menu: ADMIN_MENU, act: '쓰기', scope: 'none', max: 1 * KB, fn: fnAccountRevealPw }" in text)
src_ok('서버: 잠금 확인(lockCheck)이 해시 계산보다 앞', 0 <= REV.find('lockCheck(acct.id)') < REV.find('pwHash('))
src_ok('서버: 확인 대상은 ctx.id — payload.id 를 읽지 않는다', 'getAccount(ctx.id)' in REV and 'payload.id' not in REV)
src_ok('서버: AUTH_* 코드를 쓰지 않는다', 'AUTH_' not in REV)
src_ok('서버: 목록 줄(accountRow)에 원문 칸이 없다', 'pw: pwStashRead' not in cut('accountRow'))

sapi = io.open(API, 'r', encoding='utf-8', newline='').read()
m = re.search(r'const READ_ACTIONS = \{(.*?)\};', sapi, re.S)
src_ok('api.js: account.revealPw 는 「조용히 다시 묻기」 목록(READ_ACTIONS)에 없다', bool(m) and 'account.revealPw' not in m.group(1))

sapp = io.open(APP, 'r', encoding='utf-8', newline='').read()
src_ok("화면: account.revealPw 로 관리자 비밀번호를 보낸다", "Api.call('account.revealPw', { pw: pw })" in sapp)
src_ok('화면: 입력칸 type=password · autocomplete=current-password',
       '<input type="password" id="rvPw" name="qsc-admin-pw" autocomplete="current-password" ' in sapp)
src_ok('화면: 보여 주는 시간 5분 · 지나면 다시 가린다',
       'const REVEAL_MS = 5 * 60 * 1000;' in sapp and 'revealTimer = setTimeout(relock, REVEAL_MS);' in sapp)
src_ok('화면: 화면을 떠날 때(pagehide) 다시 가린다', "window.addEventListener('pagehide', function () { if (revealed) relock(); });" in sapp)
src_ok('화면: 보낸 뒤 입력칸을 비운다', sapp.find("input.value = '';") > sapp.find("Api.call('account.revealPw'") > 0)
store_lines = [l for l in sapp.split('\n') if re.search(r'(localStorage|sessionStorage)\.setItem', l)]
src_ok('★화면: 받은 값(revealed)을 저장소에 넣지 않는다★', not any('revealed' in l or 'pws' in l for l in store_lines))
src_ok('화면: 옛 [숨기기] 선택(pwShow)이 남아 있지 않다', 'pwShow' not in sapp)
src_ok("화면: 감사로그 이름표에 account.revealPw", "'account.revealPw': '비밀번호 보기(관리자 확인)'," in sapp)
spage = io.open(PAGE, 'r', encoding='utf-8', newline='').read()
src_ok('화면: 버튼 첫 문구 「비밀번호 보기」', '<button class="miniBtn" id="pwEyeBtn" type="button">비밀번호 보기</button>' in spage)
src_ok('★화면: 도움말에 옛 안내(「목록에 그대로 보입니다」·[비밀번호 숨기기])가 남아 있지 않다★',
       '목록에 그대로 보입니다' not in spage and '비밀번호 숨기기' not in spage and "'비밀번호 숨기기'" not in sapp)

print('\n소스 검사 통과 %d · 실패 %d' % (sp, sf))
try:
    OUT.unlink()
except OSError:
    pass
sys.exit(1 if (r.returncode or sf) else 0)
