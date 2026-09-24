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

function submitDateGate(dateStr, word) {
  const w = word || '점검일자';
  /* 2026-09-25 검수 · backend-2/security-1 — trim 하지 않는다. 뒤따르는 qscMonthClosed·yymm·저장은 원래 값을 쓰므로
     ' 2026-10-20' 이 문을 지나면 탭 '02-1' 을 보아 확정 달 검사를 비켜 갔다. 앱 date 입력은 공백이 없다. */
  const d = String(dateStr == null ? '' : dateStr);
  const ym = /^\d{4}-\d{2}-\d{2}$/.test(d) ? yymm(d) : '';
  const day = Number(d.slice(8, 10));
  if (!ym || !validYm(ym) || !(day >= 1 && day <= 31)) return err('BAD_REQUEST', w + '를 선택해 주세요.');
  if (ym < '2610') return err('BAD_REQUEST', Number(ym.slice(2, 4)) + '월은 앱으로 제출할 수 없습니다 — ' + w + '를 확인해 주세요.');
  const cur = curYymm();
  if (cur >= '2610' && ym > cur) return err('BAD_REQUEST', '아직 오지 않은 달입니다 — ' + w + '를 확인해 주세요.');
  return null;
}
function validYm(ym) {
  if (!/^\d{4}$/.test(String(ym))) return false;
  const m = Number(String(ym).slice(2, 4));
  return m >= 1 && m <= 12;
}
function yymm(dateStr) { return dateStr.slice(2, 4) + dateStr.slice(5, 7); } // '2026-08-10' → '2608'
const CODE_SHEET = '쇼퍼_코드';
const CODE_HEADER = ['회차', '매장', '코드', '발급시각', '만료시각', '상태', '사용시각', '메모'];
const CODE_TTL = { '3h': 3 * 3600e3, 'today': -1, '15d': 15 * 86400e3 };   // -1 = 그날 23:59:59
const CODE_FAIL_MAX = 15;      // 한 매장 · 10분 안에 이만큼 틀리면 그 매장을 잠근다
/* 전 매장 합산 · 10분 (매장 이름을 바꿔 가며 두드리는 것을 막는다 · 2026-09-17 ②-3c)
   2026-09-25 검수 · critic-attacker-1 — 60 → 150. 60이면 익명 한 사람이 틀린 코드 60번으로 ★전 매장★ 코드 확인을 10분씩 되풀이해 막을 수 있었다.
   대입 횟수 자체는 익명 버킷(anonThrottle 'anon' · 분 40·시간 200)이 이미 묶으므로, 이 값은 「매장 이름 바꿔 가며 두드리기」만 잡으면 된다.
   150 이면 한 번 잠그는 데 시간당 익명 상한의 4분의 3을 써야 한다. 매장별 15 는 그대로. */
const CODE_FAIL_ALL = 150;
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
  /* 6자리. 앞자리 0을 피한다 — 복사·구두 전달에서 자꾸 사라진다
     ★재료는 randomCode 와 같은 HMAC 바이트★ (2026-09-25 검수 · authn-5 — 종전 Math.random 은 randomCode 주석이 스스로
     「자격증명 생성에 쓰면 안 된다」고 적은 것이었다). 모듈로 편향 없이: 첫 자리는 252 미만만 받아 1~9, 나머지는 250 미만만 받아 0~9.
     ★자릿수(6)는 그대로★ — 8자리로 늘리면 앱 입력 안내(「6자리」)도 함께 바꿔야 해서 이번에는 뽑는 방법만 바꾼다. */
  let out = '';
  while (out.length < 6) {
    const b = Utilities.computeHmacSha256Signature(Utilities.getUuid(), Utilities.getUuid());
    for (let i = 0; i < b.length && out.length < 6; i++) {
      const v = (b[i] + 256) % 256;
      if (!out) { if (v < 252) out += String(1 + v % 9); }
      else if (v < 250) out += String(v % 10);
    }
  }
  return out;
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

  /* ★그 달 MS 가 이미 있으면 발급하지 않는다★ (2026-09-17 담당자 ②-2)
     MS 는 한 달 한 매장 1회다. 그런데 관리자 제출도 고객 경로(survey.submit · 제출 코드)로 가므로 같은 달 두 번째
     제출을 되묻는 장치(guardResubmit)가 MS 에는 하나도 안 걸렸다 — 12월 베타의 「부산역·신라당 MS 2건」이 이 길로 생겼다.
     막는 자리는 ★코드 발급★이다(제출 순간에 막으면 손님이 헛걸음한다). 2026-08-26 「한 매장 몇 장이든」은 이걸로 바뀐다.
     · 판정 자료는 「가장 최근 1건」 점수가 읽는 것과 같다(msMonthPick — MS_상세 · 앞 6,000줄)
     · 달은 발급 시점의 달, ym 을 주면 그 달('2610' 또는 '2026-10')
     · 되돌리기(admin.undoSubmit)로 지우면 그 줄이 없어지므로 다시 발급된다 */
  const ymIn = String((payload && payload.ym) || '').trim();
  const ym = /^\d{4}$/.test(ymIn) ? ('20' + ymIn.slice(0, 2) + '-' + ymIn.slice(2, 4))
    : (/^\d{4}-\d{2}$/.test(ymIn) ? ymIn : Utilities.formatDate(new Date(), tz, 'yyyy-MM'));
  const msSh = ss.getSheetByName(MS_DETAIL);
  if (msSh && msMonthPick(msSh, store, ym, tz).n > 0) {
    return err('CONFLICT', store + ' ' + ymLabel(ym.slice(2, 4) + ym.slice(5, 7)) +
      '은 MS 가 이미 제출되어 코드를 발급할 수 없습니다. 잘못 낸 것이면 제출 관리에서 되돌린 뒤 발급하세요.');
  }

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
    const csh = codeSheet(ss);
    csh.appendRow(safeRow([curYymm(), store, code, now, exp, '미사용', '',
      '발급: ' + (ctx ? ctx.id : '')]));
    gridForget(csh);
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

/* ★실패 카운터 — 매장별 + 전체 합산★ (2026-09-17 담당자 ②-3c) — IP를 못 보므로 이것이 유일한 무작위 대입 방어다.
   종전에는 전역 카운터 하나(10분 15회)였다 — 누구나 survey 주소에 틀린 코드 15개면 ★전 매장★ 고객 제출이 10분 멈췄다.
   이제 매장별 `codefail:<매장>:<10분 버킷>` 15회로 가르고, 매장 이름을 바꿔 가며 두드리는 것은
   전체 합산 `codefail:*:<버킷>` 60회가 막는다. 둘 다 본다. 정상 사용자의 오타는 1~2회라 걸릴 일이 없다. */
function codeFailKeys(store) {
  const b = Math.floor(Date.now() / (CODE_FAIL_MIN * 60000));
  return { all: 'codefail:*:' + b, one: 'codefail:' + normStore(store).slice(0, 100) + ':' + b };
}
function codeFailOk(store) {
  try {
    const c = CacheService.getScriptCache();
    const k = codeFailKeys(store);
    if (Number(c.get(k.all) || 0) >= CODE_FAIL_ALL) {
      /* 2026-09-25 검수 · critic-attacker-1 — 전 매장 잠금이 걸렸다는 것을 담당자가 나중에라도 알 수 있게 버킷마다 한 줄만 남긴다 */
      try {
        const lg = k.all + ':logged';
        if (!c.get(lg)) {
          c.put(lg, '1', CODE_FAIL_MIN * 60 + 60);
          auditLog(anonCtx(), 'survey.code', '', '경보', 'CODE_FAIL_ALL',
            '제출 코드 실패가 ' + CODE_FAIL_MIN + '분에 ' + CODE_FAIL_ALL + '회를 넘어 코드 확인을 잠시 막았습니다');
        }
      } catch (e2) { }
      return false;
    }
    return Number(c.get(k.one) || 0) < CODE_FAIL_MAX;
  } catch (e) { return true; }
}
function codeFailBump(store) {
  try {
    const c = CacheService.getScriptCache();
    const k = codeFailKeys(store);
    [k.all, k.one].forEach(function (key) {
      c.put(key, String(Number(c.get(key) || 0) + 1), CODE_FAIL_MIN * 60 + 60);
    });
  } catch (e) { }
}

/* ★검사만 한다 — 소진하지 않는다★ (2026-09-18 ②-1) — 제출(submitWithCode)과 문항 열기(fnSurveyQuestions)가
   ★같은 판정★을 쓴다. 판정 순서·문구는 종전 submitWithCode 그대로 옮겨 왔다(두 곳이 다르면 "열리는데 안 내지는" 코드가 생긴다).
   · store 를 주면 코드에 적힌 매장과 같아야 한다. 비우면 코드의 매장을 그대로 받는다(문항 열기 전용 — 제출은 반드시 준다).
   · missCode = 「없는 코드·다른 매장 코드」일 때의 오류 코드 — 제출은 BAD_REQUEST(종전 그대로), 문항 열기는 NOT_FOUND. 문구는 같다.
   · 실패 카운터(codeFailBump · 매장별 15 + 전체 60 · ②-3c)는 여기서 올린다. 잠겨 있으면 시트도 읽지 않는다.
   ★코드 번호로 찾는다★ (2026-08-26) — 예전에는 (회차·매장)으로 찾았고, 그래서 방문날짜가 발급한 달과 다르면
   멀쩡한 코드가 '맞지 않는다'로 튕겼다. 이제 날짜는 아무 상관이 없다.
   ★실패 사유를 구분해 안내한다★ (설계 §2) — "안 됩니다"만으로는 쇼퍼가 할 수 있는 일이 없다.
   다만 '없는 코드'와 '다른 매장 코드'는 구분하지 않는다 — 구분하면 대입에 단서가 된다. */
function codeVerify(ss, code, store, missCode) {
  code = String(code || '').replace(/\D/g, '');
  if (!code) return err('BAD_REQUEST', '제출 코드를 입력해 주세요.');
  store = normStore(store);
  if (!codeFailOk(store)) {   // 매장별 15회 + 전체 CODE_FAIL_ALL회 (②-3c)
    return err('RATE_LIMITED', '코드 확인이 잠시 막혀 있습니다. 10분 뒤에 다시 시도해 주세요.');
  }
  const rec = codeFind(ss, code);
  if (!rec || (store && normStore(rec.store) !== store)) {
    codeFailBump(store);
    return err(missCode || 'BAD_REQUEST', '제출 코드가 맞지 않습니다.');
  }
  if (rec.state === '사용됨') return err('CONFLICT', '이미 사용된 코드입니다.');
  if (rec.state === '취소됨' || rec.state === '삭제됨') return err('BAD_REQUEST', '사용할 수 없는 코드입니다.');
  if (rec.expiresAt && rec.expiresAt <= Date.now()) return err('BAD_REQUEST', '기한이 지난 코드입니다. 담당자에게 새 코드를 요청해 주세요.');
  return { ok: true, rec: rec, code: code, store: normStore(rec.store) };
}

/* 검사 → 소진 → 저장을 한 덩어리로 (설계 §5-2).
   ★저장이 끝난 뒤에 소진 표시를 한다★ — 순서를 뒤집으면 저장이 실패했을 때
   쇼퍼는 코드를 잃고 응답도 잃는다. 반대로 두면 최악이 '코드가 한 번 더 쓰일 수 있음'이다. */
function submitWithCode(ss, p, ctx) {
  const code = String((p && p.code) || '').replace(/\D/g, '');
  if (!code) return err('BAD_REQUEST', '제출 코드를 입력해 주세요.');
  const store = normStore(p && p.store);
  if (!store) return err('BAD_REQUEST', '매장을 선택해 주세요.');
  /* 2026-09-25 검수 · dates-4 — 코드를 보기 전에 날짜부터(날짜가 틀리면 실패 카운터도 안 올리고 코드도 살아 있다) */
  const badDate = submitDateGate(p && p.date, '방문 날짜');
  if (badDate) return badDate;
  if (!codeFailOk(store)) {   // 매장별 15회 + 전체 CODE_FAIL_ALL회 (②-3c) — 잠겨 있으면 락을 기다리지도 않는다
    return err('RATE_LIMITED', '코드 확인이 잠시 막혀 있습니다. 10분 뒤에 다시 시도해 주세요.');
  }

  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { return err('BUSY', '잠시 후 다시 시도해 주세요.'); }
  try {
    /* 판정은 codeVerify 한 곳 (2026-09-18) — 문항 열기(survey.questions)와 같은 규칙·같은 문구 */
    const v = codeVerify(ss, code, store, 'BAD_REQUEST');
    if (!v.ok) return v;
    const rec = v.rec;

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
