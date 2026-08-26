# -*- coding: utf-8 -*-
"""제출 코드 백엔드 자가 점검 — Code.gs 원문에서 그 부분만 잘라내 node로 돌린다.

    python test/codes-backend-test.py     생성
    _도구/node/node.exe test/codes_test.js   실행

복사본이 아니라 실제로 쓰는 코드를 잘라 오므로, Code.gs 를 고치면 이 점검도 따라 바뀐다.
앱스 스크립트 대역(시트·락·캐시)만 가짜다.
"""
import io, sys
from pathlib import Path
SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent) / 'codes_test.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

s = io.open(SRC, 'r', encoding='utf-8', newline='').read()
a = s.index("const CODE_SHEET = '쇼퍼_코드';")
b = s.index('function fnSurveySubmit(ctx, payload)')
body = s[a:b].rstrip()
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
const Utilities = { formatDate: function (d, tz, f) {
  const p = function (n) { return String(n).padStart(2, '0'); };
  if (f === 'yyyy-MM-dd') return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  return String(d);
} };

// ── 가짜 시트 ────────────────────────────────────────────────
let ROWS = [];      // 헤더 제외한 데이터 행들
const SS = {
  getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; },
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
function submit(store, code, date) { return submitWithCode(SS, { store: store, code: code, date: date }, CTX); }
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
is('작년 날짜로 내도 통과', submit('금종제과', c1.rec.code, '2025-01-15').ok, true);

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

console.log('\n─────────────────────────────');
console.log(pass + '개 통과 · ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
""" % body

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(harness)
print('생성: %s' % OUT)
