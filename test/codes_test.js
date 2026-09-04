// 자동 생성 — Code.gs 원문에서 잘라낸 제출코드 로직을 그대로 돌린다
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

const CODE_SHEET = '쇼퍼_코드';
const CODE_HEADER = ['회차', '매장', '코드', '발급시각', '만료시각', '상태', '사용시각', '메모'];
const CODE_TTL = { '3h': 3 * 3600e3, 'today': -1, '15d': 15 * 86400e3 };   // -1 = 그날 23:59:59
const CODE_FAIL_MAX = 15;      // 10분 안에 이만큼 틀리면 잠근다
const CODE_FAIL_MIN = 10;

function codeSheet(ss) {
  return sheet(ss, CODE_SHEET, CODE_HEADER);
}

/* 시트 뒷부분을 그대로 읽어 온다(접지 않는다).
   발급은 행 추가, 사용·취소는 그 행 수정이라 ★코드 하나 = 행 하나★다. */
function codeRows(ss) {
  const sh = codeSheet(ss);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const n = Math.min(4000, last - 1);
  const rng = grid(sh, last - n + 1, 1, n, CODE_HEADER.length);
  const vals = rng ? rng.getValues() : [];
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const code = String(vals[i][2] || '').trim();
    if (!code) continue;
    out.push({
      cycle: String(vals[i][0] || '').trim(),      // 발급한 달 — 기록용
      store: String(vals[i][1] || '').trim(),
      code: code,
      issuedAt: msOf(vals[i][3]),
      expiresAt: msOf(vals[i][4]),
      state: String(vals[i][5] || '').trim() || '미사용',
      usedAt: msOf(vals[i][6]),
      note: String(vals[i][7] || '').trim(),
      row: last - n + 1 + i,
    });
  }
  return out;
}

/* 지금 쓸 수 있는 코드인가. ★만료 판정은 읽는 시점에 한다★ — 시트에 '만료'를 적어 두지 않는다.
   적어 두면 그 줄을 누가 언제 갱신하느냐는 문제가 새로 생긴다. */
function codeAlive(r) {
  if (!r) return false;
  if (r.state === '사용됨' || r.state === '취소됨' || r.state === '삭제됨') return false;
  return !(r.expiresAt && r.expiresAt <= Date.now());
}

/* 코드 번호로 찾는다. 같은 번호가 여러 줄이면 ★마지막 줄이 이긴다★(방어적 — 보통 한 줄이다). */
function codeFind(ss, code) {
  const rows = codeRows(ss);
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].code === code) return rows[i];
  return null;
}

function msOf(v) {
  try {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number' && v > 0) return v;
    const t = String(v || '').trim();
    if (!t) return null;
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d.getTime();
  } catch (e) { return null; }
}

function newCode() {
  /* 6자리. 앞자리 0을 피한다 — 복사·구두 전달에서 자꾸 사라진다 */
  return String(100000 + Math.floor(Math.random() * 900000));
}

function codeExpiry(ttl, tz) {
  const now = Date.now();
  if (ttl === 'today') {
    const end = Utilities.formatDate(new Date(now), tz, 'yyyy-MM-dd') + ' 23:59:59';
    const d = new Date(end.replace(/-/g, '/'));
    return isNaN(d.getTime()) ? now + 12 * 3600e3 : d.getTime();
  }
  const ms = CODE_TTL[ttl];
  return now + (typeof ms === 'number' && ms > 0 ? ms : CODE_TTL['3h']);
}

/* ---------- 화면용 액션 (전부 관리자 인증) ---------- */

/* ★살아 있는 것만 돌려준다★ — 쓰인 코드·취소된 코드·지난 코드는 화면에서 사라진다.
   이력은 시트에 전부 남아 있으므로 굳이 화면이 이고 다닐 이유가 없다(그것이 격자의 시작이었다). */
function fnCodesList(ctx, payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const live = codeRows(ss).filter(codeAlive).map(function (r) {
    return { code: r.code, store: r.store, issuedAt: r.issuedAt, expiresAt: r.expiresAt };
  });
  live.sort(function (a, b) { return (b.issuedAt || 0) - (a.issuedAt || 0); });   // 최근 발급 순
  return { ok: true, live: live, fetchedAt: nowIso() };
}

function fnCodesIssue(ctx, payload) {
  const store = normStore(payload && payload.store);
  const ttl = String((payload && payload.ttl) || '3h');
  if (!store) return err('BAD_REQUEST', '매장을 선택해 주세요.');
  if (!CODE_TTL.hasOwnProperty(ttl)) return err('BAD_REQUEST', '유효시간이 올바르지 않습니다.');

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();

  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return err('BUSY', '잠시 후 다시 시도해 주세요.'); }
  try {
    /* ★발급을 막지 않는다★ (2026-08-26) — 예전에는 '이 매장에 살아 있는 코드가 있다' ·
       '이번 회차 제출이 끝났다' 두 가지로 거절했다. 한 매장에 여러 장이 돌아다녀도 이제는
       어느 것이 유효한지 서버가 코드 번호로 정확히 가른다(각각 1회용이고 각각 따로 죽는다).
       ★단 하나 지킬 것은 번호가 겹치지 않는 것★ — 이제 코드 번호가 열쇠라, 살아 있는 두 장이
       같은 번호면 어느 매장 것인지 서버도 못 가른다. */
    const taken = {};
    codeRows(ss).forEach(function (r) { if (codeAlive(r)) taken[r.code] = true; });
    let code = '';
    for (let i = 0; i < 50; i++) { const c = newCode(); if (!taken[c]) { code = c; break; } }
    if (!code) {
      return err('SERVER_ERROR', '새 코드를 만들지 못했습니다. 살아 있는 코드를 정리한 뒤 다시 시도해 주세요.');
    }
    const now = new Date();
    const exp = new Date(codeExpiry(ttl, tz));
    codeSheet(ss).appendRow(safeRow([curYymm(), store, code, now, exp, '미사용', '',
      '발급: ' + (ctx ? ctx.id : '')]));
    return {
      ok: true, store: store,
      rec: { code: code, store: store, issuedAt: now.getTime(), expiresAt: exp.getTime() },
    };
  } finally { try { lock.releaseLock(); } catch (e) { } }
}

/* ★코드 번호로 취소한다★ — 한 매장에 여러 장이 살 수 있게 되었으므로 매장 이름으로는
   어느 장을 죽여야 할지 정할 수 없다. */
function fnCodesRevoke(ctx, payload) {
  const code = String((payload && payload.code) || '').replace(/\D/g, '');
  if (!code) return err('BAD_REQUEST', '취소할 코드를 지정해 주세요.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return err('BUSY', '잠시 후 다시 시도해 주세요.'); }
  try {
    const rec = codeFind(ss, code);
    if (!rec || !rec.row) return err('NOT_FOUND', '그 코드를 찾지 못했습니다.');
    if (rec.state === '사용됨') return err('CONFLICT', '이미 제출에 사용된 코드입니다.');
    const sh = codeSheet(ss);
    const c = grid(sh, rec.row, 6, 1, 3);   // 상태 · 사용시각 · 메모
    if (!c) return err('SERVER_ERROR', '코드 시트 칸을 찾지 못했습니다.');
    c.setValues([['취소됨', '', safe('취소: ' + (ctx ? ctx.id : ''))]]);
    return { ok: true, code: code, store: rec.store };
  } finally { try { lock.releaseLock(); } catch (e) { } }
}

/* ---------- 제출 검표 ---------- */

/* ★전역 실패 카운터★ — IP를 못 보므로 이것이 유일한 무작위 대입 방어다.
   정상 사용자의 오타는 1~2회라 걸릴 일이 없다(10분에 15회). */
function codeFailOk() {
  try {
    const k = 'codefail:' + Math.floor(Date.now() / (CODE_FAIL_MIN * 60000));
    return Number(CacheService.getScriptCache().get(k) || 0) < CODE_FAIL_MAX;
  } catch (e) { return true; }
}
function codeFailBump() {
  try {
    const c = CacheService.getScriptCache();
    const k = 'codefail:' + Math.floor(Date.now() / (CODE_FAIL_MIN * 60000));
    c.put(k, String(Number(c.get(k) || 0) + 1), CODE_FAIL_MIN * 60 + 60);
  } catch (e) { }
}

/* 검사 → 소진 → 저장을 한 덩어리로 (설계 §5-2).
   ★저장이 끝난 뒤에 소진 표시를 한다★ — 순서를 뒤집으면 저장이 실패했을 때
   쇼퍼는 코드를 잃고 응답도 잃는다. 반대로 두면 최악이 '코드가 한 번 더 쓰일 수 있음'이다. */
function submitWithCode(ss, p, ctx) {
  const code = String((p && p.code) || '').replace(/\D/g, '');
  if (!code) return err('BAD_REQUEST', '제출 코드를 입력해 주세요.');
  if (!codeFailOk()) {
    return err('RATE_LIMITED', '코드 확인이 잠시 막혀 있습니다. 10분 뒤에 다시 시도해 주세요.');
  }
  const store = normStore(p && p.store);
  if (!store) return err('BAD_REQUEST', '매장을 선택해 주세요.');

  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { return err('BUSY', '잠시 후 다시 시도해 주세요.'); }
  try {
    /* ★코드 번호로 찾는다★ (2026-08-26) — 예전에는 (회차·매장)으로 찾았고, 그래서 방문날짜가
       발급한 달과 다르면 멀쩡한 코드가 '맞지 않는다'로 튕겼다. 이제 날짜는 아무 상관이 없다. */
    const rec = codeFind(ss, code);
    /* ★실패 사유를 구분해 안내한다★ (설계 §2) — "안 됩니다"만으로는 쇼퍼가 할 수 있는 일이 없다.
       다만 '없는 코드'와 '다른 매장 코드'는 구분하지 않는다 — 구분하면 대입에 단서가 된다. */
    if (!rec || normStore(rec.store) !== store) { codeFailBump(); return err('BAD_REQUEST', '제출 코드가 맞지 않습니다.'); }
    if (rec.state === '사용됨') return err('CONFLICT', '이미 사용된 코드입니다.');
    if (rec.state === '취소됨' || rec.state === '삭제됨') return err('BAD_REQUEST', '사용할 수 없는 코드입니다.');
    if (rec.expiresAt && rec.expiresAt <= Date.now()) return err('BAD_REQUEST', '기한이 지난 코드입니다. 담당자에게 새 코드를 요청해 주세요.');

    const saved = saveShopper(ss, p, ctx, true);
    if (!saved || saved.ok !== true) return saved;

    try {
      const c = grid(codeSheet(ss), rec.row, 6, 1, 2);   // 상태 · 사용시각
      if (c) c.setValues([['사용됨', new Date()]]);
    } catch (e) {
      /* 소진 표시만 실패했다. 응답은 이미 저장됐으므로 되돌리지 않는다 —
         최악이 '그 코드가 한 번 더 쓰일 수 있음'이고, 그건 담당자가 시트에서 닫으면 된다. */
      Logger.log('코드 소진 표시 실패(응답은 저장됨): ' + String(e));
    }
    return { ok: true };
  } finally { try { lock.releaseLock(); } catch (e) { } }
}

/* ★익명 경로도 이제 같은 일을 한다★ (2026-08-20 사용자 결정 — 본사가 채운 것과 고객이 낸 것은
   같은 미스터리쇼퍼다). 그래서 점수에서 두 경로를 구별하지 않는다.
   서버가 여전히 다르게 하는 것은 하나뿐이다: 시트 '입력경로' 칸을 '고객 직접'으로 ★강제★한다
   (클라이언트가 보낸 source는 읽지도 않는다). 그 칸은 이제 ★기록용★이지 판정용이 아니다.

   ⚠그래서 익명 제출 한 건이 그 매장의 그 달 CS 평균을 바꾸고, 매장 파일 CS 칸까지 덮어쓴다.
     survey.html은 누구나 열 수 있으므로 ★제출 코드가 생기기 전까지는 그것이 열려 있다★
     (설계: `_보관/설계/쇼퍼_제출코드_설계.md`). 그때까지는 담당자가 `쇼퍼_응답` 시트를 보고
     이상한 건을 지우거나 고친다 — 평균은 시트를 다시 읽어 계산하므로 그 편집이 곧 반영된다. */

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
