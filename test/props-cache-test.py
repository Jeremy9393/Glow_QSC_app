# -*- coding: utf-8 -*-
"""스크립트 속성 — 실행과 실행 사이 CacheService 60초 층 (2026-09-25 검수 · authn-1)

★Code.gs 의 진짜 PROPS 덮개(블록 통째)를 잘라내서 돌린다★ (사본 아님). 「실행」 하나 = 덮개를 새로 만드는 것(메모가 빈다),
캐시는 실행 사이에 이어진다(구글 스크립트 캐시와 같다).

왜: ping 1건 = 속성 읽기 4번(전역 상수 3 + MAINT), 틀린 로그인 1건 = 속성 읽기·쓰기 약 19번이었다. 소비자 계정 일일 할당량(5만)이
    바닥나면 맨 위 전역 상수 줄에서 먼저 터져 스크립트가 올라오지도 못한다 → 전 매장 「서버 응답을 읽지 못했습니다」.

보는 것:
  ① ping 100번(실행 100개 · 전역 상수 3 + MAINT) — 속성 읽기가 첫 실행 4번뿐 (종전 400번)
  ② 없는 속성(null)도 캐시에 담긴다 — MAINT 가 비어 있는 평소 상태
  ③ 쓰기는 속성 먼저 → 캐시도 같은 값 · 다른 실행이 곧바로 새 값을 본다(속성을 다시 안 읽고) · 지우기도 같다
  ④ ★실패 안전★ — CacheService 가 통째로 예외 · get 만 예외 · put 만 예외 → 지금처럼 속성을 읽고 값이 맞다
  ⑤ 속성 쓰기가 예외면 캐시·메모 모두 옛 값 그대로(예외는 그대로 나간다)
  ⑥ 200자 넘는 키는 캐시에 안 담는다(캐시 키 상한 250자) · TTL 은 60초
  ⑦ 편집기에서 손으로 바꾼 값은 캐시가 살아 있는 동안(최대 60초) 옛 값 — 주석에 적은 대로 · 캐시가 지나면 새 값
  ⑧ setProperties · deleteAllProperties 는 그 키들의 캐시를 비운다
  ⑨ 대조군: QSC_SRC=<고치기 전 사본> 이면 ①②③⑥이 실패해야 한다
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_props_cache.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')
st = next(i for i, l in enumerate(lines) if l.startswith('const PROPS = (function (raw) {'))
en = next(j for j in range(st, len(lines)) if lines[j].startswith('})(PropertiesService.getScriptProperties());'))
block = '\n'.join(lines[st:en + 1]).replace('const PROPS = (function (raw) {', 'PROPS = (function (raw) {', 1)

js = r'''
/* ── 가짜 세계 ── */
let RAW = {}, READS = 0, WRITES = 0, RAW_THROW = false;
const PropertiesService = { getScriptProperties: function () { return {
  getProperty: function (k) { READS++; return Object.prototype.hasOwnProperty.call(RAW, k) ? RAW[k] : null; },
  setProperty: function (k, v) { if (RAW_THROW) throw new Error('쓰기 실패'); WRITES++; RAW[k] = String(v); },
  deleteProperty: function (k) { WRITES++; delete RAW[k]; },
  getProperties: function () { return Object.assign({}, RAW); },
  getKeys: function () { return Object.keys(RAW); },
  setProperties: function (o, del) { if (del) RAW = {}; Object.keys(o).forEach(function (k) { RAW[k] = String(o[k]); }); },
  deleteAllProperties: function () { RAW = {}; },
}; } };
let CACHE = {}, TTLS = {}, CACHE_MODE = 'ok';   // ok | dead(getScriptCache 예외) | getThrows | putThrows
const CacheService = { getScriptCache: function () {
  if (CACHE_MODE === 'dead') throw new Error('캐시 서비스 없음');
  return {
    get: function (k) { if (CACHE_MODE === 'getThrows') throw new Error('get 실패'); return Object.prototype.hasOwnProperty.call(CACHE, k) ? CACHE[k] : null; },
    put: function (k, v, ttl) { if (CACHE_MODE === 'putThrows') throw new Error('put 실패'); if (String(k).length > 250) throw new Error('키가 깁니다'); CACHE[k] = String(v); TTLS[k] = ttl; },
    remove: function (k) { delete CACHE[k]; },
    removeAll: function (ks) { ks.forEach(function (k) { delete CACHE[k]; }); },
  };
} };
let PROPS;
function newExec() {
''' + block + r'''
}

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
function fresh() { RAW = {}; READS = 0; WRITES = 0; RAW_THROW = false; CACHE = {}; TTLS = {}; CACHE_MODE = 'ok'; }

console.log('① ping 100번 — 전역 상수 3개 + MAINT');
fresh(); RAW = { SPREADSHEET_ID: 'S1', PHOTO_FOLDER_ID: 'P1', DASHBOARD_ID: 'D1' };
let sid = '';
for (let i = 0; i < 100; i++) {
  newExec();
  sid = PROPS.getProperty('SPREADSHEET_ID') || ''; PROPS.getProperty('PHOTO_FOLDER_ID'); PROPS.getProperty('DASHBOARD_ID');
  PROPS.getProperty('MAINT');
}
ok('속성 읽기는 첫 실행 4번뿐 (종전 400번)', READS === 4, READS);
ok('값은 맞다', sid === 'S1');

console.log('② 없는 속성도 담는다');
fresh(); newExec();
ok('첫 실행: MAINT 없음 → null', PROPS.getProperty('MAINT') === null);
newExec();
ok('다음 실행: 여전히 null · 속성을 다시 안 읽는다', PROPS.getProperty('MAINT') === null && READS === 1, READS);

console.log('③ 쓰기 → 다른 실행이 곧바로 새 값');
fresh(); newExec(); PROPS.getProperty('MAINT');                       // 캐시에 「없음」
newExec(); PROPS.setProperty('MAINT', '점검 중입니다');                // fnAdminMaint 가 켠다
const r0 = READS;
newExec();
ok('다른 실행이 새 값을 본다(캐시의 「없음」이 남지 않는다)', PROPS.getProperty('MAINT') === '점검 중입니다', PROPS.getProperty('MAINT'));
ok('그때 속성을 다시 안 읽는다', READS === r0, READS - r0);
newExec(); PROPS.deleteProperty('MAINT');
newExec();
ok('지운 뒤 다른 실행은 null · 속성 안 읽음', PROPS.getProperty('MAINT') === null && READS === r0, READS - r0);
ok('같은 실행 안에서는 쓴 값이 바로 보인다(메모)', (function () { newExec(); PROPS.setProperty('X', 7); return PROPS.getProperty('X') === '7'; })());
ok('캐시 TTL 은 60초', TTLS['pc:MAINT'] === 60, TTLS['pc:MAINT']);

console.log('④ 실패 안전 — 캐시가 고장 나도 지금처럼 속성을 읽는다');
['dead', 'getThrows', 'putThrows'].forEach(function (mode) {
  fresh(); RAW = { TOKEN_KEY: 'k1' }; CACHE_MODE = mode;
  let good = true;
  for (let i = 0; i < 3; i++) { newExec(); if (PROPS.getProperty('TOKEN_KEY') !== 'k1') good = false; }
  ok(mode + ' — 값이 맞다', good);
  ok(mode + ' — 실행마다 속성을 읽는다(3번)', READS === 3, READS);
  newExec(); PROPS.setProperty('TOKEN_KEY', 'k2');
  ok(mode + ' — 쓰기도 된다', RAW.TOKEN_KEY === 'k2');
  CACHE_MODE = 'ok'; newExec();
  ok(mode + ' — 캐시가 돌아와도 낡은 값을 주지 않는다', PROPS.getProperty('TOKEN_KEY') === 'k2', PROPS.getProperty('TOKEN_KEY'));
});

console.log('⑤ 속성 쓰기가 예외면 옛 값 그대로');
fresh(); RAW = { C: 'old' }; newExec(); PROPS.getProperty('C');
RAW_THROW = true;
let boom = false; try { PROPS.setProperty('C', 'new'); } catch (e) { boom = true; }
RAW_THROW = false;
ok('예외가 그대로 나간다', boom);
ok('같은 실행의 메모도 옛 값', PROPS.getProperty('C') === 'old');
newExec();
ok('다른 실행(캐시)도 옛 값', PROPS.getProperty('C') === 'old');

console.log('⑥ 긴 키 · 캐시 키 모양');
fresh(); const longK = 'L'.repeat(230); RAW[longK] = 'v';
newExec(); PROPS.getProperty(longK); newExec(); PROPS.getProperty(longK);
ok('200자 넘는 키는 캐시에 안 담는다(실행마다 속성)', READS === 2 && !Object.keys(CACHE).some(function (k) { return k.length > 250; }), READS);
fresh(); RAW = { A: '1' }; newExec(); PROPS.getProperty('A');
ok('캐시 키는 pc:+속성 키', CACHE['pc:A'] === '1', Object.keys(CACHE));

console.log('⑦ 편집기에서 손으로 바꾼 값 — 최대 60초 늦게');
fresh(); RAW = { AUTH_ENFORCE: 'on' }; newExec(); PROPS.getProperty('AUTH_ENFORCE');
RAW.AUTH_ENFORCE = 'off';                                              // 편집기 속성 화면(이 문을 안 지남)
newExec();
ok('캐시가 살아 있는 동안은 옛 값(주석에 적은 대로)', PROPS.getProperty('AUTH_ENFORCE') === 'on');
delete CACHE['pc:AUTH_ENFORCE'];                                        // 60초가 지났다
newExec();
ok('캐시가 지나면 새 값', PROPS.getProperty('AUTH_ENFORCE') === 'off');

console.log('⑧ setProperties · deleteAllProperties');
fresh(); RAW = { A: '1', B: '2' }; newExec(); PROPS.getProperty('A'); PROPS.getProperty('B');
newExec(); PROPS.setProperties({ A: '9' }, true);                       // B 는 지워진다
newExec();
ok('setProperties(…, true) 뒤 — A 새 값 · B 없음', PROPS.getProperty('A') === '9' && PROPS.getProperty('B') === null, [PROPS.getProperty('A'), PROPS.getProperty('B')]);
newExec(); PROPS.deleteAllProperties();
newExec();
ok('deleteAllProperties 뒤 — A 없음', PROPS.getProperty('A') === null);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
sys.exit(1 if res.returncode != 0 else 0)
