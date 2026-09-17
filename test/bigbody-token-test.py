# -*- coding: utf-8 -*-
"""doPost 0.6단계 — 64KB 넘는 본문은 토큰 서명부터 본다 (2026-09-17 담당자 ②-3f)

★Code.gs 전체를 가짜 구글 API 위에 올려 진짜 doPost 를 돌린다★ (check_backend.py 와 같은 방식 · 사본 아님).

왜: 무인증 12MB 본문이 토큰 검증 ★전에★ JSON.parse 를 탔다 — 스로틀도 없어서 동시 30 병렬이면 몇 분에
    하루 실행시간(90분)을 태울 수 있었다. 64KB 를 넘는 본문은 끝 2KB 에서 토큰만 뽑아 형식·서명(HMAC)만
    먼저 보고, 아니면 AUTH_REQUIRED 로 끊는다(시트는 열지 않는다).

보는 것:
  ① 70KB · 토큰 없음 → AUTH_REQUIRED · ★JSON.parse 를 부르지 않았다★
  ② 70KB · 서명 틀린 토큰 → AUTH_REQUIRED · parse 안 함
  ③ 70KB · 서명 맞는 토큰(봉투는 js/api.js 순서 {reqId, payload, action, token}) → 관문을 지나 파싱된다
     (그 다음 단계에서 「알 수 없는 요청」 BAD_REQUEST — 관문을 지났다는 증거)
  ④ 64KB 이하 · 토큰 없음 → 관문과 무관(종전대로 파싱 → BAD_REQUEST)
  ⑤ 토큰 서명 검사(tokenSigOk)는 시트를 열지 않는다(openById 0회)
  ⑥ 대조군: QSC_SRC=<고치기 전 사본> 으로 돌리면 ①②가 실패해야 한다
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT_CODE = HERE.parent / 't_bigbody_code.js'
OUT = HERE.parent / 't_bigbody.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()
io.open(OUT_CODE, 'w', encoding='utf-8', newline='\n').write(src + '\nglobalThis.doPost = doPost; globalThis.hmacB64 = hmacB64;\n')

js = r'''
/* 가짜 구글 API — check_backend.py 의 것에 base64EncodeWebSafe 를 더했다(토큰 서명에 쓴다) */
const S = () => new Proxy(function () { }, { get: () => S(), apply: () => S(), construct: () => S() });
const store = { TOKEN_KEY: 'k', AUTH_SHEET_ID: 'auth' };
globalThis.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => store[k] || null, setProperty: (k, v) => { store[k] = v; },
  deleteProperty: k => { delete store[k]; }, getKeys: () => Object.keys(store) }) };
globalThis.CacheService = { getScriptCache: () => ({ get: () => null, put: () => { }, remove: () => { }, removeAll: () => { } }) };
globalThis.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { } }) };
globalThis.Utilities = { formatDate: () => '2026-01-01 00:00:00', getUuid: () => 'u', sleep: () => { },
  base64Encode: () => 'b64', base64EncodeWebSafe: (b) => 'B64' + (b && b.length ? b.length : 0), base64Decode: () => [], base64DecodeWebSafe: () => [],
  newBlob: () => ({ getDataAsString: () => '{}' }),
  computeHmacSha256Signature: () => [1, 2], computeDigest: () => [1, 2],
  DigestAlgorithm: { SHA_256: 1 }, MacAlgorithm: { HMAC_SHA_256: 1 }, Charset: { UTF_8: 1 } };
let OPENS = 0;
globalThis.SpreadsheetApp = new Proxy(function () { }, { get: (t, k) => { if (k === 'openById') return () => { OPENS++; return S(); }; return S(); }, apply: () => S() });
globalThis.DriveApp = S(); globalThis.Logger = { log: () => { } };
globalThis.ContentService = { createTextOutput: t => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } };
globalThis.HtmlService = S(); globalThis.Session = S(); globalThis.ScriptApp = S(); globalThis.UrlFetchApp = S();
globalThis.MailApp = S(); globalThis.CalendarApp = S();
require(process.argv[2]);

const realParse = JSON.parse;
let PARSES = 0;
JSON.parse = function () { PARSES++; return realParse.apply(JSON, arguments); };
function post(body) { PARSES = 0; OPENS = 0; return realParse(String(doPost({ postData: { contents: body } }))); }
/* 봉투는 js/api.js call() 의 순서 그대로 — token 이 맨 끝에 온다 */
function envelope(token, big) {
  const o = { reqId: 'r1', payload: { blob: 'x'.repeat(big ? 70 * 1024 : 100) }, action: 'nope.nope' };
  if (token) o.token = token;
  return JSON.stringify(o);
}
const good = 'v1.B64x.' + hmacB64('v1.B64x', 'k');      // 서명이 맞는 토큰(가짜 HMAC 이라 값은 일정)
const badTok = 'v1.B64x.WRONG';

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }

console.log('① 70KB · 토큰 없음');
let r = post(envelope('', true));
ok('AUTH_REQUIRED', r.code === 'AUTH_REQUIRED', r);
ok('★JSON.parse 0회★', PARSES === 0, PARSES);
ok('시트 0회', OPENS === 0, OPENS);

console.log('② 70KB · 서명 틀린 토큰');
r = post(envelope(badTok, true));
ok('AUTH_REQUIRED · parse 0회', r.code === 'AUTH_REQUIRED' && PARSES === 0, [r.code, PARSES]);

console.log('③ 70KB · 서명 맞는 토큰 → 관문을 지난다');
r = post(envelope(good, true));
ok('파싱됐다(1회 이상)', PARSES >= 1, PARSES);
ok('그 다음 단계의 답(알 수 없는 요청 BAD_REQUEST) — AUTH_REQUIRED 아님', r.code === 'BAD_REQUEST' && /알 수 없는 요청/.test(r.error), r);

console.log('④ 작은 본문은 관문과 무관');
r = post(envelope('', false));
ok('토큰 없어도 종전대로 파싱 → BAD_REQUEST', r.code === 'BAD_REQUEST' && PARSES >= 1, [r.code, PARSES]);

console.log('⑤ 관문은 시트를 열지 않는다');
post(envelope(good, true));
ok('openById 0회 (그 다음 단계도 등록표에서 끝난다)', OPENS === 0, OPENS);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT), str(OUT_CODE)], capture_output=True, text=True, encoding='utf-8', errors='replace')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
try:
    OUT_CODE.unlink()
except OSError:
    pass
sys.exit(1 if res.returncode != 0 else 0)
