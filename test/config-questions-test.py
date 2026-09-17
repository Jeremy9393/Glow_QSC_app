# -*- coding: utf-8 -*-
"""config.questions — QSC 74문항은 ★로그인 + qsc 권한★ 이 있는 요청에만 (2026-09-18 담당자 ②-1)

★Code.gs 의 진짜 fnConfigQuestions · questionsConst · QUESTIONS 블록을 잘라내서 돌린다★ (사본 아님).
can · err 는 가짜로 끼운다. ④는 Code.gs 전체를 가짜 구글 API 위에서 ★실제 doPost★ 로 돌린다(등록표·게이트까지).

왜: 공개 파일 data/master.json 에 문항·심각도가 실려 로그인 없이 평가표 전부를 읽을 수 있었다.
    "매장사람들도 ms평가표는 못봐야해" — 문항은 서버가 열쇠를 확인한 뒤에만 내려준다.

보는 것:
  ① 등록표 config.questions = menu 'qsc' · act '' · anon/legacy 아님 · 1KB
  ② ctx.auth=false → AUTH_REQUIRED · qsc 권한 없는 역할 → FORBIDDEN
  ③ qsc 읽기만 있어도 74문항 · 6그룹 · ★★4/★12 · texts 2키 · ★쇼퍼 문항·kiosk_excludes 없음★ · version/source_sha
  ④ doPost 로 토큰 없이 부르면 AUTH_REQUIRED · 엉터리 토큰이면 AUTH_INVALID (게이트 5단계 — 기능층까지 안 간다)
"""
import io, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = HERE.parents[1] / 'backend' / 'Code.gs'
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_config_questions.js'
OUT_FULL = HERE.parent / 't_config_questions_full.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = src.split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def block():
    i, j = src.find('/* @@QUESTIONS_BEGIN */'), src.find('/* @@QUESTIONS_END */')
    if not (0 <= i < j):
        raise SystemExit('Code.gs 에 QUESTIONS 블록이 없음 — python tools/extract_master.py')
    return src[i:j]


py_fail = 0


def src_ok(name, cond):
    global py_fail
    if cond:
        print('  ✓ ' + name)
    else:
        py_fail += 1
        print('  ✗ ' + name)


print('── ① 등록표 ──')
reg = re.search(r"'config\.questions':\s*\{[^}]*\}", src)
src_ok("config.questions = menu 'qsc' · act '' · scope none · 1KB · fn fnConfigQuestions",
       bool(reg) and "menu: 'qsc'" in reg.group(0) and "act: ''" in reg.group(0)
       and "scope: 'none'" in reg.group(0) and 'max: 1 * KB' in reg.group(0) and 'fn: fnConfigQuestions' in reg.group(0))
src_ok('anon · legacy · optAuth 가 아니다 (토큰 없이는 못 닿는다)',
       bool(reg) and 'anon' not in reg.group(0) and 'legacy' not in reg.group(0) and 'optAuth' not in reg.group(0))
src_ok('QUESTIONS 블록이 한 쌍 있다', src.count('/* @@QUESTIONS_BEGIN */') == 1 and src.count('/* @@QUESTIONS_END */') == 1)
src_ok('const QUESTIONS 는 한 번만 선언된다', src.count('const QUESTIONS = ') == 1)
src_ok('api.js READ_ACTIONS 에 config.questions 가 있다 (깨진 응답이면 한 번 더 묻는다)',
       "'config.questions': 1" in (HERE.parents[1] / 'js' / 'api.js').read_text(encoding='utf-8'))

js = r'''
const ADMIN_MENU = 'accounts';
function err(code, msg) { return { ok: false, code: code, error: msg }; }
/* 역할표 대역 — can() 은 문자열 조인만 한다(진짜와 같은 규칙: act '' 이면 읽기 또는 쓰기) */
const PERM = {
  '관리자': { qsc: { read: true, write: true }, accounts: { read: true, write: true } },
  '점검자': { qsc: { read: true, write: false } },
  '매장담당자': { store: { read: true, write: true } },
};
function can(role, menu, act) {
  const m = PERM[role] && PERM[role][menu];
  if (!m) return { allow: false };
  if (act === '쓰기') return { allow: !!m.write };
  if (act === '읽기') return { allow: !!m.read };
  return { allow: !!(m.read || m.write) };
}
''' + block() + '\n' + cut('questionsConst') + '\n' + cut('fnConfigQuestions') + r'''

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
const anon = { auth: false, id: '(무인증)', role: '' };
const store = { auth: true, id: 'store1', role: '매장담당자' };
const insp = { auth: true, id: 'insp', role: '점검자' };
const admin = { auth: true, id: 'admin', role: '관리자' };

console.log('── ② 열쇠 ──');
let r = fnConfigQuestions(anon);
ok('토큰 없음(ctx.auth=false) → AUTH_REQUIRED', r.ok === false && r.code === 'AUTH_REQUIRED');
ok('  문항이 실리지 않는다', !r.qsc_groups);
r = fnConfigQuestions(store);
ok('매장 계정(qsc 권한 없음) → FORBIDDEN', r.ok === false && r.code === 'FORBIDDEN');
ok('  문항이 실리지 않는다', !r.qsc_groups);

console.log('── ③ 문항 ──');
r = fnConfigQuestions(insp);
ok('qsc 읽기만 있어도 ok', r.ok === true);
const items = [];
(r.qsc_groups || []).forEach(function (g) { (g.items || []).forEach(function (it) { items.push(it); }); });
ok('74문항', items.length === 74);
ok('6그룹', (r.qsc_groups || []).length === 6);
ok('★★ 4 · ★ 12', items.filter(function (i) { return i.severity === 'S1'; }).length === 4 &&
   items.filter(function (i) { return i.severity === 'S2'; }).length === 12);
ok('문항마다 no·code·text·severity 가 있다', items.every(function (i) { return i.no && i.code && i.text && 'severity' in i; }));
ok('texts 는 criteria·principles 두 키', r.texts && Object.keys(r.texts).sort().join(',') === 'criteria,principles' && r.texts.criteria.length > 10);
ok('★쇼퍼 문항·kiosk_excludes·store_types 는 싣지 않는다★', !('shopper_categories' in r) && !('kiosk_excludes' in r) && !('store_types' in r));
ok('version · source_sha 가 있다', /^\d{4}-\d{2}-\d{2}$/.test(String(r.version)) && /^[0-9a-f]{12}$/.test(String(r.source_sha)));
const r2 = fnConfigQuestions(admin);
ok('관리자도 같은 문항', JSON.stringify(r2.qsc_groups) === JSON.stringify(r.qsc_groups));

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip())

# ── ④ 실제 doPost — 가짜 구글 API 위에서 (tools/check_backend.py 와 같은 대역) ──
print('── ④ doPost 게이트 ──')
full = r'''
const S = () => new Proxy(function () { }, {
  get: (t, k) => (k === Symbol.toPrimitive ? (() => 0) : S()), apply: () => S(), construct: () => S() });
const store = {};
globalThis.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => store[k] || null, setProperty: (k, v) => { store[k] = v; },
  deleteProperty: k => { delete store[k]; }, getKeys: () => Object.keys(store) }) };
globalThis.CacheService = { getScriptCache: () => ({ get: () => null, put: () => { }, remove: () => { }, removeAll: () => { } }) };
globalThis.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { } }) };
globalThis.Utilities = { formatDate: () => '2026-01-01 00:00:00', getUuid: () => 'u', sleep: () => { },
  base64Encode: () => 'b64', base64Decode: () => [], base64EncodeWebSafe: () => 'b64', newBlob: () => S(),
  computeHmacSha256Signature: () => [1, 2], computeDigest: () => [1, 2],
  DigestAlgorithm: { SHA_256: 1 }, MacAlgorithm: { HMAC_SHA_256: 1 }, Charset: { UTF_8: 1 } };
globalThis.SpreadsheetApp = S(); globalThis.DriveApp = S(); globalThis.Logger = { log: () => { } };
globalThis.ContentService = { createTextOutput: t => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } };
globalThis.HtmlService = S(); globalThis.Session = S(); globalThis.ScriptApp = S(); globalThis.UrlFetchApp = S();
globalThis.MailApp = S(); globalThis.CalendarApp = S();
require(process.argv[2]);
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
function post(body) { return JSON.parse(String(doPost({ postData: { contents: JSON.stringify(body) } }))); }
let r = post({ action: 'config.questions', payload: {} });
ok('토큰 없이 → AUTH_REQUIRED (기능층까지 안 간다)', r.ok === false && r.code === 'AUTH_REQUIRED' && !r.qsc_groups);
r = post({ action: 'config.questions', payload: {}, token: 'v1.abc.def' });
ok('엉터리 토큰 → AUTH_INVALID', r.ok === false && r.code === 'AUTH_INVALID' && !r.qsc_groups);
r = post({ type: 'config', payload: {} });
ok('옛 봉투(type)로는 닿지 않는다 — BAD_REQUEST', r.ok === false && r.code === 'BAD_REQUEST');
console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''
tmp_gs = HERE.parent / 't_config_questions_code.js'
io.open(tmp_gs, 'w', encoding='utf-8', newline='').write(src + '\nglobalThis.doPost = doPost;\n')
io.open(OUT_FULL, 'w', encoding='utf-8', newline='\n').write(full)
res2 = subprocess.run([str(NODE), str(OUT_FULL), str(tmp_gs)], capture_output=True, text=True, encoding='utf-8')
print(res2.stdout.rstrip())
if res2.stderr.strip():
    print(res2.stderr.strip())
for f in (tmp_gs, OUT_FULL):
    try:
        os.remove(f)
    except OSError:
        pass

# 공개 파일에 문항이 없는가 — 서버가 열쇠를 보는 의미가 있으려면
import json
pub = json.loads((HERE.parents[1] / 'data' / 'master.json').read_text(encoding='utf-8'))
src_ok('★공개 data/master.json 에 qsc_groups·shopper_categories·texts·kiosk_excludes 가 없다★',
       not any(k in pub for k in ('qsc_groups', 'shopper_categories', 'texts', 'kiosk_excludes')))

if py_fail or res.returncode != 0 or res2.returncode != 0:
    print('\n★실패★ (파이썬 %d · 기능층 rc=%d · doPost rc=%d)' % (py_fail, res.returncode, res2.returncode))
    sys.exit(1)
print('\n전부 통과')
