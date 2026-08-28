# -*- coding: utf-8 -*-
"""배포 전 Code.gs 실행 점검 — ★없는 함수를 가리키는 것★을 잡는다.

★왜 필요한가 (2026-08-28 실제 사고)★
쓰기 스위치를 지우면서 바로 위에 붙어 있던 `fnTidyLog` 까지 함께 지웠다.
ACTIONS 등록표는 그 함수를 계속 가리키고 있었고, 등록표를 만드는 순간 터지므로
★로그인·매장목록·제출 — 요청이 무엇이든 전부 죽었다.★ 26곳이 앱을 못 썼다.

그때 왜 못 잡았나:
  · `node --check` 는 ★문법만★ 본다. '없는 이름을 부른다'는 실행할 때 나는 오류다.
  · 시험 93개는 함수를 하나씩 떼어내 돌리는 방식이라 등록표를 아예 안 본다.
  · 배포 도구는 지문(sha)만 비교했다.

그래서 이 파일이 하는 일 두 가지:
  ① ACTIONS 등록표의 `fn:` 이 가리키는 함수가 실제로 있는지 (글자 대조)
  ② 구글 API 를 가짜로 끼우고 ★실제로 doPost 를 한 번 돌려★ 본다 (실행 대조)
     — ①이 못 잡는 다른 이름(도우미 함수·상수)까지 여기서 걸린다.

혼자 돌릴 수도 있다:  python tools/check_backend.py
"""
import io
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GS = os.path.join(ROOT, 'backend', 'Code.gs')
NODE = os.path.join(os.path.dirname(ROOT), '_도구', 'node', 'node.exe')

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# 구글 API 를 가짜로 끼운다. ★조용히 아무거나 돌려주는 Proxy★ 라
# 시트·드라이브를 안 건드리고도 코드가 끝까지 흘러간다.
HARNESS = r'''
const S = () => new Proxy(function () { }, { get: () => S(), apply: () => S(), construct: () => S() });
const store = {};
globalThis.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => store[k] || null, setProperty: (k, v) => { store[k] = v; },
  deleteProperty: k => { delete store[k]; }, getKeys: () => Object.keys(store) }) };
globalThis.CacheService = { getScriptCache: () => ({ get: () => null, put: () => { }, remove: () => { }, removeAll: () => { } }) };
globalThis.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { } }) };
globalThis.Utilities = { formatDate: () => '2026-01-01 00:00:00', getUuid: () => 'u', sleep: () => { },
  base64Encode: () => 'b64', base64Decode: () => [], newBlob: () => S(),
  computeHmacSha256Signature: () => [1, 2], computeDigest: () => [1, 2],
  DigestAlgorithm: { SHA_256: 1 }, MacAlgorithm: { HMAC_SHA_256: 1 } };
globalThis.SpreadsheetApp = S(); globalThis.DriveApp = S(); globalThis.Logger = { log: () => { } };
globalThis.ContentService = { createTextOutput: t => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } };
globalThis.HtmlService = S(); globalThis.Session = S(); globalThis.ScriptApp = S(); globalThis.UrlFetchApp = S();
globalThis.MailApp = S(); globalThis.CalendarApp = S();

let REAL = null;
require(process.argv[2]);
/* ★진짜 오류를 가로챈다★ — doPost 는 무엇이 터져도 SERVER_ERROR 한 줄로 덮어 버린다.
   그 덮개 때문에 이 사고가 배포까지 나갔다. 여기서는 원문을 봐야 한다. */
const _err = globalThis.err;
globalThis.err = function (code, msg) {
  if (code === 'SERVER_ERROR' && !REAL) REAL = new Error('doPost 가 SERVER_ERROR 로 덮었다: ' + msg);
  return _err.apply(null, arguments);
};
try {
  const out = String(doPost({ postData: { contents: JSON.stringify({ action: 'config.stores', payload: {} }) } }));
  if (out.indexOf('SERVER_ERROR') >= 0) { console.log('FAIL\t' + (REAL ? REAL.message : out.slice(0, 200))); process.exit(1); }
  console.log('OK');
} catch (e) {
  console.log('FAIL\t' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
  process.exit(1);
}
'''


def check(printer=None):
    """문제가 있으면 사람이 읽을 문장 목록을, 없으면 빈 목록을 돌려준다."""
    say = printer or (lambda m: None)
    bad = []
    src = io.open(GS, 'r', encoding='utf-8', newline='').read()

    # ── ① 등록표가 가리키는 함수가 실제로 있는가 ──────────────
    defined = set(re.findall(r'^function\s+([A-Za-z_$][\w$]*)', src, re.M))
    refs = sorted(set(re.findall(r'fn:\s*([A-Za-z_$][\w$]*)', src)))
    missing = [r for r in refs if r not in defined]
    if missing:
        bad.append('★ACTIONS 등록표가 없는 함수를 가리킵니다★: ' + ' · '.join(missing)
                   + '\n     → 그 함수를 지우셨거나 이름이 바뀌었습니다. 등록표를 읽는 순간 터지므로'
                     '\n       ★로그인·매장목록·제출이 전부 죽습니다★ (2026-08-28에 실제로 났습니다)')
    else:
        say('등록표가 가리키는 함수 %d개 — 전부 있습니다' % len(refs))

    # ── ② 실제로 doPost 를 한 번 돌려 본다 ────────────────────
    if not os.path.isfile(NODE):
        bad.append('node 를 못 찾아 실행 점검을 건너뛰었습니다: %s' % NODE)
        return bad

    tmp_js = os.path.join(HERE, '_check_code.js')
    tmp_h = os.path.join(HERE, '_check_run.js')
    try:
        io.open(tmp_js, 'w', encoding='utf-8', newline='').write(src + '\nglobalThis.doPost = doPost;\n')
        io.open(tmp_h, 'w', encoding='utf-8', newline='').write(HARNESS)
        r = subprocess.run([NODE, tmp_h, tmp_js], capture_output=True, text=True,
                           encoding='utf-8', errors='replace', timeout=120)
        out = (r.stdout or '').strip()
        if r.returncode != 0 or not out.startswith('OK'):
            why = out.split('\t', 1)[1] if '\t' in out else (out or (r.stderr or '')[:300])
            bad.append('★가짜 서버로 요청을 한 번 보내 봤더니 죽었습니다★\n     ' + why
                       + '\n     → 이 상태로 배포하면 앱이 통째로 멈춥니다.')
        else:
            say('가짜 서버로 요청을 보내 봤습니다 — 정상 응답')
    except Exception as e:  # noqa: BLE001
        bad.append('실행 점검을 돌리지 못했습니다: %s' % e)
    finally:
        for f in (tmp_js, tmp_h):
            try:
                os.remove(f)
            except OSError:
                pass
    return bad


if __name__ == '__main__':
    problems = check(printer=lambda m: print('  ✓ ' + m))
    if problems:
        print('\n✗ ' + '\n✗ '.join(problems))
        sys.exit(1)
    print('\n이상 없습니다 — 배포해도 됩니다.')
