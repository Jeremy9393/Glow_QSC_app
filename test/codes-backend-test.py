# -*- coding: utf-8 -*-
"""제출 코드 백엔드 자가 점검 — Code.gs 원문에서 그 부분만 잘라내 node로 돌린다.

    python test/codes-backend-test.py     생성
    _도구/node/node.exe test/codes_test.js   실행

복사본이 아니라 실제로 쓰는 코드를 잘라 오므로, Code.gs 를 고치면 이 점검도 따라 바뀐다.
앱스 스크립트 대역(시트·락·캐시)만 가짜다.
"""
import io, os, sys
from pathlib import Path
# QSC_SRC 환경변수로 다른 Code.gs(예: 고치기 전 사본)를 가리키면 대조군 실행이 된다 (2026-09-17)
SRC = Path(os.environ.get('QSC_SRC') or r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\qsc-app\backend\Code.gs')
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent) / 'codes_test.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

s = io.open(SRC, 'r', encoding='utf-8', newline='').read()
a = s.index("const CODE_SHEET = '쇼퍼_코드';")
b = s.index('function fnSurveySubmit(ctx, payload)')
body = s[a:b].rstrip()


def cut_fn(name):
    """function name( 으로 시작하는 줄부터 첫 '}' 줄까지 (없으면 대역 주석 — 대조군용)"""
    ls = s.split('\n')
    st = next((i for i, l in enumerate(ls) if l.startswith('function %s(' % name)), None)
    if st is None:
        return '/* %s 없음 (옛 사본) */' % name
    for j in range(st, len(ls)):
        one_line = j == st and '{' in ls[j] and ls[j].count('{') == ls[j].count('}')
        if ls[j] == '}' or one_line:
            return '\n'.join(ls[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


# 2026-09-25 검수 · dates-4 — submitWithCode 가 부르는 날짜 문(submitDateGate)과 그 부품도 원문에서 잘라 온다
extra = '\n'.join([cut_fn('submitDateGate'), cut_fn('validYm'), cut_fn('yymm')])
if 'function submitDateGate(' not in extra:   # 옛 사본(대조군) — 문이 없으니 늘 통과
    extra += '\nfunction submitDateGate() { return null; }'
body = extra + '\n' + body
print('잘라낸 길이 %d자' % len(body))

harness = r"""// 자동 생성 — Code.gs 원문에서 잘라낸 제출코드 로직을 그대로 돌린다
// ── 앱스 스크립트 대역 ────────────────────────────────────────
const SPREADSHEET_ID = 'fake';
const Logger = { log: function () {} };
const CacheService = (function () {
  const m = {};
  return { getScriptCache: function () { return {
    get: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    put: function (k, v) { m[k] = String(v); },
  }; } };
})();
const LockService = { getScriptLock: function () {
  return { waitLock: function () {}, releaseLock: function () {} };
} };
const NODE_CRYPTO = require('crypto');
let HMAC_CALLS = 0;
const Utilities = { formatDate: function (d, tz, f) {
  const p = function (n) { return String(n).padStart(2, '0'); };
  if (f === 'yyyy-MM-dd') return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  if (f === 'yyyy-MM') return d.getFullYear() + '-' + p(d.getMonth() + 1);
  if (f === 'yyMM') return String(d.getFullYear()).slice(2) + p(d.getMonth() + 1);
  return String(d);
},
  /* 2026-09-25 검수 · authn-5 — newCode 가 randomCode 와 같은 HMAC 바이트를 쓴다. 자바처럼 부호 있는 바이트(-128~127)로 돌려준다 */
  getUuid: function () { return NODE_CRYPTO.randomUUID(); },
  computeHmacSha256Signature: function (v, k) {
    HMAC_CALLS++;
    return Array.from(NODE_CRYPTO.createHmac('sha256', String(k)).update(String(v)).digest()).map(function (b) { return b > 127 ? b - 256 : b; });
  },
};
let AUDIT = [];
function auditLog() { AUDIT.push(Array.prototype.slice.call(arguments)); }
function anonCtx() { return { id: '(무인증)', role: '' }; }
/* 제출 날짜 기본값 — 10/1 전(미래 달 허용)에도, 10월 이후(지난 달 허용)에도 통과하는 2610 안의 날 */
const OK_DATE = '2026-10-15';

// ── 가짜 시트 ────────────────────────────────────────────────
let ROWS = [];      // 헤더 제외한 데이터 행들
/* 2026-09-17 ②-2 — 그 달 MS 가 있으면 발급 거부. MS_상세 대역: MS_HAS[매장 + '|' + 'YYYY-MM'] = 건수 */
const MS_DETAIL = 'MS_상세';
let MS_HAS = {};
let PICKED = [];    // msMonthPick 이 어떤 (매장·달)로 불렸나
function msMonthPick(sh, store, ym, tz) {
  PICKED.push(store + '|' + ym);
  const n = MS_HAS[store + '|' + ym] || 0;
  return { score: n ? 90 : null, at: n ? '2026-10-05 10:00' : '', n: n };
}
function ymLabel(ym) { return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월'; }
function gridForget() {}
const SS = {
  getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; },
  getSheetByName: function (n) { return n === MS_DETAIL ? { fake: n } : null; },
};
const SpreadsheetApp = { openById: function () { return SS; } };
function sheet() {
  return {
    getLastRow: function () { return ROWS.length + 1; },
    appendRow: function (r) { ROWS.push(r.slice()); },
  };
}
function grid(sh, row, col, nr, nc) {
  return {
    getValues: function () {
      const out = [];
      for (let i = 0; i < nr; i++) {
        const src = ROWS[row - 2 + i] || [];
        const line = [];
        for (let j = 0; j < nc; j++) line.push(src[col - 1 + j]);
        out.push(line);
      }
      return out;
    },
    setValues: function (v) {
      for (let i = 0; i < v.length; i++) {
        const t = ROWS[row - 2 + i] || (ROWS[row - 2 + i] = []);
        for (let j = 0; j < v[i].length; j++) t[col - 1 + j] = v[i][j];
      }
    },
  };
}
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function safe(v) { return v; }
function safeRow(r) { return r; }
function normStore(v) { return String(v == null ? '' : v).trim(); }
function curYymm() { const d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0'); }
function nowIso() { return new Date().toISOString(); }
let SAVED = [];
let SAVE_OK = true;
function saveShopper(ss, p) {
  if (!SAVE_OK) return err('SERVER_ERROR', '저장 실패(시험)');
  SAVED.push(p); return { ok: true };
}

%s

// ── 시험 ──────────────────────────────────────────────────────
let pass = 0, fail = 0;
function is(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n       got  ' + g + '\n       want ' + w); }
}
function head(t) { console.log('\n' + t); }
const CTX = { id: 'moon' };
function issue(store, ttl) { return fnCodesIssue(CTX, { store: store, ttl: ttl || '3h' }); }
function submit(store, code, date) { return submitWithCode(SS, { store: store, code: code, date: date === undefined ? OK_DATE : date }, CTX); }
function liveCodes() { return fnCodesList(CTX, {}).live.map(function (r) { return r.store + ':' + r.code; }).sort(); }

head('[1] 발급');
const a1 = issue('금종제과');
is('발급된다', a1.ok, true);
is('6자리', /^[1-9]\d{5}$/.test(a1.rec.code), true);
is('매장이 함께 온다', a1.rec.store, '금종제과');
is('시트에 1줄', ROWS.length, 1);
is('회차 칸은 이번 달(기록용)', ROWS[0][0], curYymm());
is('상태 미사용', ROWS[0][5], '미사용');

head('[2] ★같은 매장에 또 내도 막지 않는다★ (예전엔 CONFLICT)');
const a2 = issue('금종제과', '15d');
is('두 번째도 발급된다', a2.ok, true);
is('번호가 다르다', a1.rec.code !== a2.rec.code, true);
is('둘 다 살아 있다', liveCodes().length, 2);

head('[3] 다른 매장');
const b1 = issue('다른매장');
is('발급된다', b1.ok, true);
is('살아 있는 코드 3장', liveCodes().length, 3);

head('[4] 제출 — 코드 번호로 찾는다');
is('없는 코드는 거절', submit('금종제과', '999999').code, 'BAD_REQUEST');
is('★다른 매장 코드는 거절★', submit('다른매장', a1.rec.code).code, 'BAD_REQUEST');
is('맞는 코드는 통과', submit('금종제과', a1.rec.code).ok, true);
is('응답이 저장됐다', SAVED.length, 1);
is('★소진됐다★', ROWS[0][5], '사용됨');
is('한 번 더는 안 된다', submit('금종제과', a1.rec.code).code, 'CONFLICT');
is('살아 있는 코드 2장으로 줄었다', liveCodes().length, 2);

head('[5] ★같은 매장이 같은 달에 또 낼 수 있다★ (예전엔 이 달엔 끝이었다)');
is('두 번째 코드로 또 제출', submit('금종제과', a2.rec.code).ok, true);
is('응답 2건', SAVED.length, 2);

head('[6] ★방문 날짜가 발급한 달과 달라도 된다★ (예전엔 회차가 안 맞아 튕겼다)');
const c1 = issue('금종제과');
/* 2026-09-25 검수 · dates-4 — 2610 보다 이른 달은 이제 날짜 문이 막는다(약속 ②). 코드와 날짜가 무관하다는 이 시험의 뜻은
   「발급한 달과 다른 달(2610 이상)」로 본다 */
is('2610 보다 이른 날짜(작년)는 날짜 문이 막는다', submit('금종제과', c1.rec.code, '2025-01-15').code, 'BAD_REQUEST');
is('발급한 달과 다른 달 날짜로 내도 통과', submit('금종제과', c1.rec.code, OK_DATE).ok, true);

head('[7] 취소 — 코드 번호로');
const d1 = issue('금종제과');
is('취소된다', fnCodesRevoke(CTX, { code: d1.rec.code }).ok, true);
is('취소된 코드는 못 쓴다', submit('금종제과', d1.rec.code).code, 'BAD_REQUEST');
is('없는 코드 취소는 NOT_FOUND', fnCodesRevoke(CTX, { code: '111111' }).code, 'NOT_FOUND');
is('코드 없이 부르면 BAD_REQUEST', fnCodesRevoke(CTX, {}).code, 'BAD_REQUEST');
const e1 = issue('금종제과');
submit('금종제과', e1.rec.code);
is('이미 쓴 코드는 취소 못 한다', fnCodesRevoke(CTX, { code: e1.rec.code }).code, 'CONFLICT');

head('[8] 만료');
const f1 = issue('금종제과', '3h');
const rowF = ROWS.length - 1;
ROWS[rowF][4] = new Date(Date.now() - 60000);           // 1분 전에 만료된 것으로
is('기한 지난 코드는 거절', submit('금종제과', f1.rec.code).error.indexOf('기한이 지난') >= 0, true);
is('목록에서 사라진다', liveCodes().indexOf('금종제과:' + f1.rec.code), -1);

head('[9] 유효시간');
is('3h 는 3시간 뒤', Math.round((issue('금종제과', '3h').rec.expiresAt - Date.now()) / 3600e3), 3);
is('15d 는 15일 뒤', Math.round((issue('금종제과', '15d').rec.expiresAt - Date.now()) / 86400e3), 15);
is('없는 유효시간은 거절', issue('금종제과', '99y').code, 'BAD_REQUEST');
is('매장 없이 발급 거절', fnCodesIssue(CTX, { ttl: '3h' }).code, 'BAD_REQUEST');
is('매장 없이 제출 거절', submit('', '123456').code, 'BAD_REQUEST');

head('[10] ★번호가 겹치지 않는다★');
const before = ROWS.length;
const seen = {};
let dup = 0;
for (let i = 0; i < 60; i++) {
  const r = issue('금종제과', '15d');
  if (!r.ok) { dup = -1; break; }
  if (seen[r.rec.code]) dup++;
  seen[r.rec.code] = true;
}
is('60장을 내도 살아 있는 번호가 안 겹친다', dup, 0);
is('60줄이 쌓였다', ROWS.length - before, 60);

head('[11] 저장이 실패하면 코드를 소진하지 않는다');
const g1 = issue('금종제과');
SAVE_OK = false;
const bad = submit('금종제과', g1.rec.code);
SAVE_OK = true;
is('저장 실패가 그대로 온다', bad.ok, false);
is('★코드는 아직 살아 있다★', submit('금종제과', g1.rec.code).ok, true);

head('[12] 무작위 대입 방어');
for (let i = 0; i < 20; i++) submit('금종제과', '000001');
is('실패가 쌓이면 잠긴다', submit('금종제과', '000002').code, 'RATE_LIMITED');

head('[13] ★실패 카운터는 매장별★ (2026-09-17 담당자 ②-3c) — 한 매장이 잠겨도 다른 매장 고객은 낸다');
const m1 = issue('다른매장');
is('금종제과가 잠긴 동안 다른 매장 제출은 통과', submit('다른매장', m1.rec.code).ok, true);
is('다른 매장의 오타 1회는 아직 안 잠긴다', submit('다른매장', '000003').code, 'BAD_REQUEST');
/* 전체 합산 CODE_FAIL_ALL회 — 매장 이름을 바꿔 가며 두드리는 것을 막는다(2026-09-25 검수 · critic-attacker-1 60 → 150).
   지금까지 센 실패: 금종제과 15(16번째부터는 잠긴 채라 세지 않는다) + 다른매장 1 = 16 */
is('전체 합산 상한은 150 (critic-attacker-1)', CODE_FAIL_ALL, 150);
for (let i = 0; i < 44; i++) submit('매장' + i, '000004');     // 합산 60 — 종전 상한
const m60 = issue('예순매장');
is('★합산 60회로는 아직 전 매장이 잠기지 않는다★ (critic-attacker-1)', submit('예순매장', m60.rec.code).ok, true);
for (let i = 44; i < CODE_FAIL_ALL - 16; i++) submit('매장' + i, '000004');     // 매장마다 1회씩 → 합산 CODE_FAIL_ALL
is('합산 상한을 채우면 매장이 달라도 잠긴다', submit('새매장', '000005').code, 'RATE_LIMITED');
const m2 = issue('세번째매장');
is('★그때는 맞는 코드도 막힌다★ (전체 잠금)', submit('세번째매장', m2.rec.code).code, 'RATE_LIMITED');
is('전체 잠금 경보는 감사로그에 한 줄만 (두 번 막혀도)', AUDIT.filter(function (a) { return a[4] === 'CODE_FAIL_ALL'; }).length, 1);

head('[14] ★그 달 MS 가 이미 있으면 발급하지 않는다★ (2026-09-17 담당자 ②-2)');
const thisYm = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM');
MS_HAS = {}; MS_HAS['금종제과|' + thisYm] = 1; PICKED = [];
const n1 = issue('금종제과');
is('이번 달 MS 가 있으면 CONFLICT', n1.code, 'CONFLICT');
is('문구에 매장·달·되돌리기 안내', /금종제과 20\d\d년 \d+월은 MS 가 이미 제출되어 코드를 발급할 수 없습니다\. 잘못 낸 것이면 제출 관리에서 되돌린 뒤 발급하세요\./.test(n1.error), true);
is('판정은 발급 시점의 달로 물었다', PICKED[0], '금종제과|' + thisYm);
is('시트에 줄이 늘지 않았다', ROWS.filter(function (r) { return r[1] === '금종제과' && r[5] === '미사용' && r[7].indexOf('발급') === 0; }).length,
   ROWS.filter(function (r) { return r[1] === '금종제과' && r[5] === '미사용'; }).length);
is('다른 매장은 발급된다', issue('다른매장').ok, true);
is('ym 을 주면 그 달로 본다 — 2610 에는 없으니 발급', fnCodesIssue(CTX, { store: '금종제과', ttl: '3h', ym: '2610' }).ok, true);
is('그때 물은 달은 2026-10', PICKED[PICKED.length - 1], '금종제과|2026-10');
MS_HAS['금종제과|2026-10'] = 2;
is('ym:"2026-10" 모양도 받는다 — 있으면 거부', fnCodesIssue(CTX, { store: '금종제과', ttl: '3h', ym: '2026-10' }).code, 'CONFLICT');
MS_HAS = {};
is('★되돌리기로 지우면(자료가 없어지면) 다시 발급된다★', issue('금종제과').ok, true);

head('[15] ★방문 날짜 문★ (2026-09-25 검수 · dates-4) — 코드를 보기 전에 막고, 코드는 살아 있고, 실패 카운터도 안 오른다');
(function () {   // 위 시험과 이름이 겹치지 않게 따로 감싼다
CacheService.getScriptCache().put(codeFailKeys('날짜매장').all, '0');   // [13] 의 전체 잠금을 푼다(10분이 지난 셈)
const d1 = issue('날짜매장');
const failKeyOf = function () { return Number(CacheService.getScriptCache().get(codeFailKeys('날짜매장').one) || 0); };
const f0 = failKeyOf();
const e1 = submit('날짜매장', d1.rec.code, '');
is('빈 날짜 → BAD_REQUEST', e1.code, 'BAD_REQUEST');
is('문구는 「방문 날짜를 선택해 주세요.」', e1.error, '방문 날짜를 선택해 주세요.');
is('형식이 틀린 날짜(2026/10/15)도 같다', submit('날짜매장', d1.rec.code, '2026/10/15').error, '방문 날짜를 선택해 주세요.');
is('없는 달(2026-13-01)도 같다', submit('날짜매장', d1.rec.code, '2026-13-01').error, '방문 날짜를 선택해 주세요.');
const e2 = submit('날짜매장', d1.rec.code, '2026-09-30');
is('9월 → 앱으로 제출할 수 없다', e2.error, '9월은 앱으로 제출할 수 없습니다 — 방문 날짜를 확인해 주세요.');
is('실패 카운터는 그대로', failKeyOf(), f0);
is('저장도 안 했다', SAVED.filter(function (p) { return p.store === '날짜매장'; }).length, 0);
/* 미래 달 — curYymm() 가 2610 이상일 때만 막는다. 이 시험은 오늘 날짜로 돈다 */
const cur0 = curYymm();
const nextYm = (function () { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 2); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01'; })();
const e3 = submit('날짜매장', d1.rec.code, nextYm);
if (cur0 >= '2610') is('두 달 뒤 → 아직 오지 않은 달', e3.error, '아직 오지 않은 달입니다 — 방문 날짜를 확인해 주세요.');
else is('10/1 전에는 미래 달을 막지 않는다(12월 시험 같은 것)', e3.ok, true);
const d2 = issue('날짜매장');
is('맞는 날짜면 그 코드로 낸다(코드가 살아 있었다)', submit('날짜매장', d2.rec.code, OK_DATE).ok, true);
})();

head('[16] ★코드 번호는 HMAC 바이트로 뽑는다★ (2026-09-25 검수 · authn-5) — Math.random 을 쓰지 않는다');
const realRandom = Math.random;
let randomUsed = 0;
Math.random = function () { randomUsed++; return realRandom(); };
const h0 = HMAC_CALLS;
const many = [];
for (let i = 0; i < 3000; i++) many.push(newCode());
Math.random = realRandom;
is('Math.random 을 한 번도 안 불렀다', randomUsed, 0);
is('HMAC 재료를 썼다', HMAC_CALLS > h0, true);
is('전부 6자리 · 앞자리 1~9', many.every(function (c) { return /^[1-9]\d{5}$/.test(c); }), true);
const firstDigits = {};
many.forEach(function (c) { firstDigits[c.charAt(0)] = (firstDigits[c.charAt(0)] || 0) + 1; });
is('앞자리 1~9 가 모두 나온다(3000장)', Object.keys(firstDigits).sort().join(''), '123456789');
is('겹침이 거의 없다(3000장 중 같은 번호 30장 미만)', 3000 - new Set(many).size < 30, true);

console.log('\n─────────────────────────────');
console.log(pass + '개 통과 · ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
""" % body

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(harness)
print('생성: %s' % OUT)
