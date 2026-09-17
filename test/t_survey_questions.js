// 자동 생성 — Code.gs 원문에서 잘라낸 제출코드 로직 + 문항 내려주기를 그대로 돌린다
// ── 앱스 스크립트 대역 (test/codes-backend-test.py 와 같다 · 캐시는 들여다볼 수 있게 CACHE_M) ──
const SPREADSHEET_ID = 'fake';
const Logger = { log: function () {} };
const CACHE_M = {};
const CacheService = { getScriptCache: function () { return {
  get: function (k) { return Object.prototype.hasOwnProperty.call(CACHE_M, k) ? CACHE_M[k] : null; },
  put: function (k, v) { CACHE_M[k] = String(v); },
}; } };
const LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
const Utilities = { formatDate: function (d, tz, f) {
  const p = function (n) { return String(n).padStart(2, '0'); };
  if (f === 'yyyy-MM-dd') return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  if (f === 'yyyy-MM') return d.getFullYear() + '-' + p(d.getMonth() + 1);
  return String(d);
} };
let ROWS = [];
const MS_DETAIL = 'MS_상세';
function msMonthPick() { return { score: null, at: '', n: 0 }; }
function ymLabel(ym) { return ym; }
function gridForget() {}
const SS = {
  getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; },
  getSheetByName: function (n) { return n === MS_DETAIL ? { fake: n } : null; },
};
const SpreadsheetApp = { openById: function () { return SS; } };
function sheet() {
  return { getLastRow: function () { return ROWS.length + 1; }, appendRow: function (r) { ROWS.push(r.slice()); } };
}
function grid(sh, row, col, nr, nc) {
  return {
    getValues: function () {
      const out = [];
      for (let i = 0; i < nr; i++) {
        const s = ROWS[row - 2 + i] || []; const line = [];
        for (let j = 0; j < nc; j++) line.push(s[col - 1 + j]);
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
function saveShopper(ss, p) { SAVED.push(p); return { ok: true }; }

const CODE_SHEET = '쇼퍼_코드';
const CODE_HEADER = ['회차', '매장', '코드', '발급시각', '만료시각', '상태', '사용시각', '메모'];
const CODE_TTL = { '3h': 3 * 3600e3, 'today': -1, '15d': 15 * 86400e3 };   // -1 = 그날 23:59:59
const CODE_FAIL_MAX = 15;      // 한 매장 · 10분 안에 이만큼 틀리면 그 매장을 잠근다
const CODE_FAIL_ALL = 60;      // 전 매장 합산 · 10분 (매장 이름을 바꿔 가며 두드리는 것을 막는다 · 2026-09-17 ②-3c)
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
    if (Number(c.get(k.all) || 0) >= CODE_FAIL_ALL) return false;
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
  if (!codeFailOk(store)) {   // 매장별 15회 + 전체 60회 (②-3c)
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
  if (!codeFailOk(store)) {   // 매장별 15회 + 전체 60회 (②-3c) — 잠겨 있으면 락을 기다리지도 않는다
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

/* @@QUESTIONS_BEGIN */
/* 평가표 문항 — tools/extract_master.py 가 갈아 끼운다. ★손으로 고치지 말 것★ (엑셀 → extract_master.py → 여기).
   config.questions(QSC · 로그인+qsc 권한) · survey.questions(MS · 살아 있는 제출 코드) 가 이 상수를 내려준다. */
const QUESTIONS = {"version":"2026-09-17","source_sha":"15428203049a","source":"QSC·MS 평가표.xlsx","qsc_groups":[{"name":"관리 (서류·기록)","count":7,"items":[{"no":1,"code":"A-01","row":10,"text":"인허가·교육·검사 증빙 미비치 (사업자등록증·영업신고증·영업신고별 위생교육 수료증 / 즉석판매제조·가공업은 자가품질검사 성적서 포함)","severity":"S2","critical":true},{"no":2,"code":"A-02","row":11,"text":"건강진단 결과서(구 보건증) 만료·미소지 (식품위생 분야 종사자 — 근무 인원 대조)","severity":"S2","critical":true},{"no":3,"code":"A-03","row":12,"text":"MSDS 관리대상 제품 자료 미비치 (대상 여부는 제조사·공급업체 확인 — 경고표시 미게시·취급자 미교육 포함)","severity":"S2","critical":true},{"no":4,"code":"A-04","row":13,"text":"거래명세서 미보관 · 입고 검수 누락","severity":"S2","critical":true},{"no":5,"code":"A-05","row":14,"text":"원산지 표시, 알레르기 표시 미게시 (고객이 잘 보이는 위치, 게시물·메뉴판 등 · 포장 판매 제품의 표시사항 누락 포함)","severity":"S2","critical":true},{"no":6,"code":"A-06","row":15,"text":"원산지 표시와 실제 사용 원료 불일치","severity":"S1","critical":true},{"no":7,"code":"A-07","row":16,"text":"자체 테이스팅 미실시·기준 미달 (메인 메뉴 월 1회 / 일반 메뉴 분기 1회 · 실사 사진 · 노트 기록 확인)","severity":"","critical":false}]},{"name":"개인 위생","count":11,"items":[{"no":8,"code":"B-01","row":17,"text":"두발·수염 정리 불량 (모자·헤어캡 안으로 정리 — 착용 여부는 B-07)","severity":"","critical":false},{"no":9,"code":"B-02","row":18,"text":"손톱 관리 불량 (길이, 매니큐어·인조손톱 등)","severity":"","critical":false},{"no":10,"code":"B-03","row":19,"text":"장신구 착용 (반지·팔찌 등)","severity":"","critical":false},{"no":11,"code":"B-04","row":20,"text":"근무 중 비위생 행위 (흡연·취식·침 뱉기 등)","severity":"S2","critical":true},{"no":12,"code":"B-05","row":21,"text":"노출된 외상 (상처·화상 등 — 방수밴드+장갑 미처치)","severity":"","critical":false},{"no":13,"code":"B-06","row":22,"text":"유증상자 조치 미이행 (발열·구토·설사·기침 등 — 증상에 맞는 배제·재배치·보고를 안 함)","severity":"S1","critical":true},{"no":14,"code":"B-07","row":23,"text":"위생 복장 미착용 (모자·마스크 등 — 조리용 장갑은 B-10 · 두발 정리는 B-01)","severity":"S2","critical":true},{"no":15,"code":"B-08","row":24,"text":"지정 유니폼·앞치마 미착용 또는 상태 불량","severity":"","critical":false},{"no":16,"code":"B-09","row":25,"text":"응대 직원 명찰 미착용","severity":"","critical":false},{"no":17,"code":"B-10","row":26,"text":"일회용품 용도 외 사용 · 미교체 (조리용 장갑 등)","severity":"","critical":false},{"no":18,"code":"B-11","row":27,"text":"손 위생 설비·소모품 미구비 (개수대·핸드워시·손소독제 등)","severity":"S2","critical":true}]},{"name":"매장 위생 (표시·보관)","count":13,"items":[{"no":19,"code":"C-01","row":28,"text":"내부 관리 라벨 미부착 (매장 내 소분·개봉·제조 재료)","severity":"","critical":false},{"no":20,"code":"C-02","row":29,"text":"내부 관리 라벨 기재 오류·누락","severity":"","critical":false},{"no":21,"code":"C-03","row":30,"text":"소비기한 경과 (조리 사용·판매목적 보관 모두 해당)","severity":"S1","critical":true},{"no":22,"code":"C-04","row":31,"text":"식자재 관리표 미부착·미최신화 (원재료팩 리스트 대조 불일치)","severity":"","critical":false},{"no":23,"code":"C-05","row":32,"text":"선입선출(FIFO) 미준수","severity":"","critical":false},{"no":24,"code":"C-06","row":33,"text":"식자재 지정 장소 외 보관 (오염원과 섞어 둔 경우 — 이격 거리는 C-13 · 온도 이탈은 C-10·C-11 · 소독제·세제 등 화학물질과 섞어 둔 것은 D-06)","severity":"","critical":false},{"no":25,"code":"C-07","row":34,"text":"주방 냉장·냉동 설비 오염 (냉장고·냉동고·워크인 — 내부·겉면 모두 · 성에·서리 포함 · 홀 쇼케이스는 F-06)","severity":"","critical":false},{"no":26,"code":"C-08","row":35,"text":"해동 관리 미흡 ('해동 중' 표시 미부착, 규정 외 해동 방법 — 온도·소요시간은 레시피북 기준)","severity":"","critical":false},{"no":27,"code":"C-09","row":36,"text":"개봉 식자재 밀봉·덮개 미조치","severity":"","critical":false},{"no":28,"code":"C-10","row":37,"text":"냉장·냉동 필요 식자재 실온 방치","severity":"S2","critical":true},{"no":29,"code":"C-11","row":38,"text":"냉장·냉동 설비 온도 이탈 (냉장 0~10℃ / 냉동 -18℃ 이하)","severity":"S2","critical":true},{"no":30,"code":"C-12","row":39,"text":"작업장·실온 구역 온도 이탈 (글로우서울 기준: 주방 25℃ 이하)","severity":"","critical":false},{"no":31,"code":"C-13","row":40,"text":"식자재 이격 보관 미준수 (바닥 10cm·벽 5cm 이상)","severity":"","critical":false}]},{"name":"매장 위생 (도구·설비)","count":15,"items":[{"no":32,"code":"D-01","row":41,"text":"고위험 도구 안전·이격 보관 미흡 (칼꽂이·지정보관대 등)","severity":"","critical":false},{"no":33,"code":"D-02","row":42,"text":"청소도구 관리 불량 (이격·세척·건조·지정 장소 보관)","severity":"","critical":false},{"no":34,"code":"D-03","row":43,"text":"조리도구 오염·파손 (집게·주걱·볼 등 — 손으로 옮겨 쓰는 주방 전용 도구 · 붙박이 설비는 D-15)","severity":"","critical":false},{"no":35,"code":"D-04","row":44,"text":"손님 제공용 식기·포장용기 위생 불량 (세척 상태·오염·보관)","severity":"","critical":false},{"no":36,"code":"D-05","row":45,"text":"비식품용 기구·용기 사용","severity":"S1","critical":true},{"no":37,"code":"D-06","row":46,"text":"소독제·화학물질 식품구역 미분리 보관 (원래 용기·라벨 미유지 포함 · MSDS 비치는 A-03에서 확인)","severity":"","critical":false},{"no":38,"code":"D-07","row":47,"text":"교차오염 (칼·도마 등 용도 미구분, 원재료/완제품 혼용 · 행주·수세미 등 소모품 혼용은 E-08 · 냉장고 칸 배치 등 보관 위치는 C-06)","severity":"S2","critical":true},{"no":39,"code":"D-08","row":48,"text":"조리·작업대 오염 (작업 중 오염물 방치)","severity":"","critical":false},{"no":40,"code":"D-09","row":49,"text":"가열·조리 설비 오염 (화구·튀김기·오븐·인덕션 등 — 기름때·탄화물 · 튀김유 산가 3.0 초과)","severity":"","critical":false},{"no":41,"code":"D-10","row":50,"text":"전처리·가공 설비 오염 (믹서·블렌더·슬라이서 등 — 식품 접촉면)","severity":"","critical":false},{"no":42,"code":"D-11","row":51,"text":"음용수·얼음 설비 위생 불량 (제빙기·정수기·음료머신 등 — 물때·곰팡이, 스쿱 보관, 필터 교체일 기록)","severity":"","critical":false},{"no":43,"code":"D-12","row":52,"text":"세척·살균 설비 불량 (식기세척기·UV살균기 등 — 미작동·파손·오염 · 헹굼 온도이탈)","severity":"","critical":false},{"no":44,"code":"D-13","row":53,"text":"배기 설비 오염 (후드·덕트 등)","severity":"","critical":false},{"no":45,"code":"D-14","row":54,"text":"배수 설비 오염 (배수구·트렌치·그리스트랩 등)","severity":"","critical":false},{"no":46,"code":"D-15","row":55,"text":"주방 설비·집기 파손·부식 (작업대·선반·싱크대·냉장·냉동고 등 붙박이 — 녹·코팅 벗겨짐·깨진 부품·경첩 고장 · 손도구는 D-03 · 냉장고 오염은 C-07)","severity":"","critical":false}]},{"name":"매장 위생 (공간·환경)","count":10,"items":[{"no":47,"code":"E-01","row":56,"text":"개인용품·사복 조리구역 반입 (분리 보관 미준수 — 취식 행위는 B-04)","severity":"","critical":false},{"no":48,"code":"E-02","row":57,"text":"미사용 물품·서류 방치·적치 — 주방·창고 등 후방 구역","severity":"","critical":false},{"no":49,"code":"E-03","row":58,"text":"쓰레기통 관리 불량 — 주방·창고 등 후방 구역 (뚜껑·과적·주변 오염·분리수거·조리구역 이격 · 홀 셀프바 쓰레기통은 F-10)","severity":"","critical":false},{"no":50,"code":"E-04","row":59,"text":"폐기물·폐유 보관·처리 불량 (폐유통 미밀폐·방치 · 조리 부산물 등 일반 폐기물 방치)","severity":"","critical":false},{"no":51,"code":"E-05","row":60,"text":"천장·벽 오염 — 주방·창고 등 후방 구역 (곰팡이·거미줄 등 · 홀은 F-05)","severity":"","critical":false},{"no":52,"code":"E-06","row":61,"text":"바닥 오염 — 주방·창고 등 후방 구역 (물고임·기름때 등 · 홀은 F-05 · 배수구 자체 막힘·오염은 D-14)","severity":"","critical":false},{"no":53,"code":"E-07","row":62,"text":"조명 점등 불량·작업 밝기 부족 — 주방·창고 등 후방 구역 (깜빡임·덮개 파손·먼지 등 · 조도 수치 기준은 없음 · 홀은 F-13)","severity":"","critical":false},{"no":54,"code":"E-08","row":63,"text":"용도별 소모품 혼용 또는 상태 불량 (홀/주방/청소 — 행주·크린콜·수세미 등)","severity":"","critical":false},{"no":55,"code":"E-09","row":64,"text":"방충·방서 조치 미실시 (포충기·문틈 차단 등)","severity":"","critical":false},{"no":56,"code":"E-10","row":65,"text":"해충 흔적 (날벌레·바퀴·설치류의 사체·배설물 등)","severity":"S2","critical":true}]},{"name":"매장 관리","count":18,"items":[{"no":57,"code":"F-01","row":66,"text":"조경·수경 시설 작동 불량 (수조·분수·펌프 등 — 누수·녹조·악취)","severity":"","critical":false},{"no":58,"code":"F-02","row":67,"text":"조경 생물 관리 불량 (물주기·시든 잎, 폐사체·식물 해충 피해 방치 — 날벌레 등 해충 흔적은 E-10)","severity":"","critical":false},{"no":59,"code":"F-03","row":68,"text":"인테리어 소품 파손·오염 (조형물·액자·포토존 등)","severity":"","critical":false},{"no":60,"code":"F-04","row":69,"text":"매장 외부·입구 상태 불량 (마당·파사드·간판 등 — 파손·오염·탈색·조명)","severity":"","critical":false},{"no":61,"code":"F-05","row":70,"text":"홀 내부 구조물 파손·오염 (천장·벽·바닥 — 객석·대기 공간·계단·복도 등 고객 동선 · 미끄럼은 F-11 · 화장실은 F-16~18 · 외부·파사드는 F-04 · 주방·창고 천장·벽은 E-05 · 바닥은 E-06)","severity":"","critical":false},{"no":62,"code":"F-06","row":71,"text":"홀 진열 기물 파손·오염 (쇼케이스·냉장고 등 — 내부·겉면 모두 · 주방 냉장·냉동 설비 오염은 C-07 · 파손은 D-15)","severity":"","critical":false},{"no":63,"code":"F-07","row":72,"text":"오프라인 안내물 미최신화·정돈 불량 (영업시간·메뉴판·가격표·키오스크 화면 등)","severity":"","critical":false},{"no":64,"code":"F-08","row":73,"text":"온라인 매장 정보 불일치 (지도앱 영업시간·휴무·메뉴 등)","severity":"","critical":false},{"no":65,"code":"F-09","row":74,"text":"홀 가구 파손·흔들림·오염 (식탁·의자 등)","severity":"","critical":false},{"no":66,"code":"F-10","row":75,"text":"손님용 비치물 관리 불량 (트레이·셀프바·셀프바 쓰레기통·냅킨·수저통 등 — 오염·미보충·넘침)","severity":"","critical":false},{"no":67,"code":"F-11","row":76,"text":"바닥 미끄럼 방치 — 홀·입구 (물기·기름기 미제거, 주의 표지 없음)","severity":"","critical":false},{"no":68,"code":"F-12","row":77,"text":"고객·직원 동선 장애물 — 홀 (박스·재고·집기 등 적치)","severity":"","critical":false},{"no":69,"code":"F-13","row":78,"text":"홀 조명 불량 (점등 불량·깜빡임 등 — 주방은 E-07)","severity":"","critical":false},{"no":70,"code":"F-14","row":79,"text":"음악·음향 이상 (BGM 미재생·부적정 음량)","severity":"","critical":false},{"no":71,"code":"F-15","row":80,"text":"홀 체류 쾌적성 저해 (하수구·기름 냄새, 환기 · 냉난방 온도 — 여름 22~25℃ / 겨울 21~24℃)","severity":"","critical":false},{"no":72,"code":"F-16","row":81,"text":"화장실 오염 (변기·세면대·바닥·거울 등)","severity":"","critical":false},{"no":73,"code":"F-17","row":82,"text":"화장실 용품 미구비 (핸드워시·핸드타월·휴지 등 · 주방 세면대 겸용 시 손 위생 설비는 B-11)","severity":"","critical":false},{"no":74,"code":"F-18","row":83,"text":"화장실 시설 작동 불량 (변기·수도·환풍기·배수 등 — 막힘·역류로 오염까지 동반해도 이 항목만 · 단순 오염은 F-16)","severity":"","critical":false}]}],"shopper_categories":[{"name":"1. 입·퇴점 응대","questions":[{"no":1,"row":11,"text":"1-1. 매장 입장 시 혹은 계산대·픽업대에 들어섰을 때 직원이 인사말을 건넸나요?","scale":"yn"},{"no":2,"row":12,"text":"1-2. 응대(인사, 주문, 전달 등) 중 직원이 고객 쪽을 바라보았나요?","scale":"yn"},{"no":3,"row":13,"text":"1-3. 퇴점하는 손님에게 인사 혹은 다른 안내가 있었나요?","scale":"yn"}]},{"name":"2. 요청·질문 응대(필수 요청사항 1회 이상 진행 부탁드립니다)","questions":[{"no":4,"row":14,"text":"2-1. 질문이나 요청에 직원이 바로 반응했나요?","scale":"yn"},{"no":5,"row":15,"text":"2-2. 답변 내용을 한 번에 이해할 수 있었나요?","scale":"yn"},{"no":6,"row":16,"text":"2-3. 요청한 내용이 실제로 반영되었나요?","scale":"yn"}]},{"name":"3. 메뉴 안내·추천(업셀링)","questions":[{"no":7,"row":17,"text":"3-1. 직원이 메뉴의 특징이나 맛을 설명해주었나요?","scale":"yn"},{"no":8,"row":18,"text":"3-2. 직원이 메뉴 추천이나 추가 제안을 했나요?","scale":"yn"},{"no":9,"row":19,"text":"3-3. 메뉴의 섭취방법이나 보관방법에 대한 안내를 받았나요? (주문할 때 · 제품을 받을 때 모두 포함)","scale":"yn"}]},{"name":"4. 친절·공손","questions":[{"no":10,"row":20,"text":"4-1. 응대하는 동안 직원의 표정이 호의적으로 느껴졌나요?","scale":"yn"},{"no":11,"row":21,"text":"4-2. 직원이 끝까지 존댓말을 사용했나요?","scale":"yn"},{"no":12,"row":22,"text":"4-3. 방문하는 동안 직원의 태도가 친절하고 일관되었나요?","scale":"yn"}]},{"name":"5. 서비스 포지션","questions":[{"no":13,"row":23,"text":"5-1. 직원들이 근무 중 위생적인 태도를 지켰나요? (취식·침 뱉기 등 없음)","scale":"yn"},{"no":14,"row":24,"text":"5-2. 응대 가능한 직원이 자리에 있거나 불렀을 때 바로 반응했나요?","scale":"yn"},{"no":15,"row":25,"text":"5-3. 직원들이 손님 응대에 집중했나요? (직원 간 사적인 대화·불필요한 행동이 없었음)","scale":"yn"}]},{"name":"6. 웨이팅·주문 수령 과정","questions":[{"no":16,"row":26,"text":"6-1. 주문 후 제품을 받기까지 안내가 있었나요? (예: \"바로 나옵니다\" · \"준비되면 불러 드릴게요\" · 진동벨 · 번호 안내)","scale":"yn"},{"no":17,"row":27,"text":"6-2. 주문할 때(카운터·키오스크 등) 어려움 없이 주문할 수 있었나요?","scale":"yn"},{"no":18,"row":28,"text":"6-3. 제품 제공 시 호출이나 메뉴 전달이 잘 이루어졌나요?","scale":"yn"}]},{"name":"7. 결제","questions":[{"no":19,"row":29,"text":"7-1. 결제과정이 매끄럽게 진행되었나요?","scale":"yn"},{"no":20,"row":30,"text":"7-2. 결제 후 영수증 발급 방법 또는 진행 중인 이벤트 안내를 받았나요?","scale":"yn"},{"no":21,"row":31,"text":"7-3. 결제 내역(메뉴, 금액)이 주문한 내용과 정확히 일치했나요?","scale":"yn"}]},{"name":"8. 플레이팅·진열","questions":[{"no":22,"row":32,"text":"8-1. 제공된 제품이 (본인이 생각한) 사진·메뉴판과 비슷한 모습이었나요?","scale":"yn"},{"no":23,"row":33,"text":"8-2. 제공된 제품의 그릇, 식기류나 포장 상태가 깨끗했나요?","scale":"yn"},{"no":24,"row":34,"text":"8-3. 제공된 제품(또는 매장에 진열된 제품)이 잘 정돈된 상태였나요?","scale":"yn"}]},{"name":"9. 신선함·이취","questions":[{"no":25,"row":35,"text":"9-1. 제품의 냄새가 정상이었나요? (쉰내·군내·잡내 등 이상 없음)","scale":"yn"},{"no":26,"row":36,"text":"9-2. 제품의 겉모습이 정상이었나요? (변색·마름 등 이상 없음)","scale":"yn"},{"no":27,"row":37,"text":"9-3. 제품의 맛이 정상이었나요? (시큼함·쉰맛 등 이상 없음)","scale":"yn"}]},{"name":"10. 익힘·추출 상태","questions":[{"no":28,"row":38,"text":"10-1. 뜨거운 메뉴 혹은 차가운 메뉴는 알맞은 온도로 제공되었나요?","scale":"yn"},{"no":29,"row":39,"text":"10-2. 제품이 알맞게 완성되어 나왔나요? (덜 익음·탄 부분 · 음료의 농도·얼음량 · 크림·거품 상태 등)","scale":"yn"},{"no":30,"row":40,"text":"10-3. 제품의 식감이 정상이었나요? (질김·눅눅함 등 이상 없음)","scale":"yn"}]},{"name":"11. 간·풍미","questions":[{"no":31,"row":41,"text":"11-1. 제품의 간(짠맛·단맛 등)이 적당했나요?","scale":"likert"},{"no":32,"row":42,"text":"11-2. 재료의 맛이 조화롭게 어우러졌나요?","scale":"likert"},{"no":33,"row":43,"text":"11-3. 섭취 전 기대한 맛과 실제 맛이 일치했나요?","scale":"likert"}]},{"name":"12. 양·퀄리티","questions":[{"no":34,"row":44,"text":"12-1. 가격을 고려했을 때 양이 적절했나요?","scale":"likert"},{"no":35,"row":45,"text":"12-2. 다 먹을 때까지 퀄리티가 유지되었나요?","scale":"likert"},{"no":36,"row":46,"text":"12-3. 제공된 제품이 전체적으로 만족스러우셨나요?","scale":"likert"}]},{"name":"13. 종합 만족도","questions":[{"no":37,"row":47,"text":"13-1. 매장에 다시 방문할 의사 혹은 지인에게 추천할 의사가 있나요?","scale":"likert"},{"no":38,"row":48,"text":"13-2. 오늘 방문 경험에 전반적으로 만족하셨나요?","scale":"likert"}]}],"texts":{"criteria":"입력 : 각 문항의 '개선 필요 건수' 칸에 0 이상의 정수를 입력합니다  (이상 없음 = 0 / 점수에서 빼려면 NA)\nNA 사유 : ① 해당 없음 — 그 매장에 시설·업무가 없음   ② 본사 대기 — 매장 권한 밖, 본사에 요청해 둔 것   ③ 확인 불가 — 증빙·상황이 없어 확인 못 함\n            셋 다 점수에서 똑같이 빠집니다. 사유는 기록에만 남습니다(다음 회차 자동 제안은 ①만).\n감점 : 일반 문항 1건 −1점  ·  ★ 문항당 −8, 같은 문항 추가 건당 −2 (합계 상한 −45)  ·  ★★ 문항당 −12, 같은 문항 추가 건당 −4 (합계 상한 −48)\n※ QSC 점수 = 100 − 일반 문항 감점 − 중대 차감 (하한 0).  ★·★★도 이 자리에서 바로 빠집니다\n※ 종합점수 = QSC 60% + 미스터리쇼퍼 30% + 개선현황 10% (하한 0) — 산출과 등급 판정은 통합시트(대시보드)에서 진행","principles":"① 감점은 매장이 즉시 처리 가능한 일(청소·정돈·보충·보고)에만 적용 — 발견하고도 보고 없이 방치한 경우 포함\n② 매장 권한 밖(불가항력)·시설 결함은 본사 보고 이력 확인 시 NA처리, 보고 없이 방치 시 감점 — 식품 안전 직결 사안은 임시조치(식자재 이동, 대체 소독 등) 병행 확인\n③ 매장에 존재하지 않는 항목(공용 화장실, 조경·취식 공간 없음 등)은 상시 NA","shopper_criteria":"관찰 문항(1~10 카테고리, 30문항) : 예 1점 / 아니오 0점 / NA 평가 제외\n만족도 문항(11·12·13 카테고리, 8문항) : 5점 척도 — 1점 0 · 2점 0.25 · 3점 0.5 · 4점 0.75 · 5점 1로 환산  ※ 방문하면 모두 응답 가능한 문항이므로 NA 사용 불가\n※ 점수 = 환산 점수 합계 ÷ 응답 문항 수 × 100점 만점   ※ 본 평가 30% + QSC담당자 60% + 개선현황 10% = 종합점수\n※ 키오스크 전용 매장은 3-1·3-2·7-1·7-2·7-3 을 제외한 33문항으로 평가(앱이 자동 적용) · 카운터·키오스크 병행 매장은 키오스크 주문 방문에서만 제외","shopper_principles":"[평가 전 안내 — 설문 응답자 공통]  ★필수★ 요청사항 — 꼭 진행해 주세요: 직원에게 간단한 요청이나 질문을 1회 이상 부탁드립니다 (화장실 위치, 메뉴 추천, 물티슈 요청 등) ※ 이 요청을 하지 않으면 2번 항목(요청·질문 응대) 세 문항에 답할 수 없습니다 / 본 평가는 철저하게 익명이 보장됩니다. 보고 느끼신 그대로 편하게 남겨 주세요. / 1~10번 카테고리는 예·아니오 중 하나, 11~13번 카테고리(맛·양·만족도)는 1~5점 중 하나를 선택 / 아니오 혹은 낮은 점수를 고른 문항은 비고에 이유를 간단히 적어 주세요 / 기억이 안 나거나 판단이 어려운 예·아니오 문항도 비고에 상황을 적어 주세요 / 연령대·성별은 응대 직원이 아니라 설문을 작성하시는 본인 기준으로 적어 주세요 / 방문 시간은 매장에 들어선 시각 기준으로 선택해 주세요\n[채점원칙 — 관리자]  종이 설문(인쇄용)의 응답을 그대로 옮겨 입력 / 미기재·판단 불가 관찰 문항은 NA (앱에서는 비고만 적으면 같은 처리) / 만족도 문항(11·12·13)은 NA 없이 1~5 중 반드시 선택 — 미응답 칸은 회색으로 표시됨 / 특이사항은 비고에 기록, 하단 응답 수(n/38)로 누락 확인","shopper_grade_note":"등급 : 우수 93점 이상 / 양호 85점 이상 / 보통 76점 이상 / 미흡 66점 이상 / 주의 55점 이상 / 부적합 55점 미만\n응답 원칙 : 관찰 문항은 예 · 아니오 · 비고 중 최소 한 칸 입력, 만족도 문항(11·12·13)은 1~5 중 선택. 판단이 어려우면 비고에 상황을 적어 주세요.\n비고만 적은 관찰 문항은 NA와 같이 집계 분모에서 빠집니다."},"kiosk_excludes":["3-1","3-2","7-1","7-2","7-3"],"store_types":{"도넛정수":"kiosk","우물집 판교":"kiosk","이티에프 베이커리 성수":"mixed","제주당":"mixed"}};

function questionsConst() {
  try {
    if (typeof QUESTIONS === 'object' && QUESTIONS && QUESTIONS.qsc_groups && QUESTIONS.shopper_categories) return QUESTIONS;
  } catch (e) { /* 아래에서 알린다 */ }
  return null;
}
function fnSurveyQuestions(ctx, payload) {
  const p = payload || {};
  const v = codeVerify(SpreadsheetApp.openById(SPREADSHEET_ID), p.code, p.store, 'NOT_FOUND');
  if (!v.ok) return v;
  const q = questionsConst();
  if (!q) return err('SERVER_ERROR', '문항이 서버에 실려 있지 않습니다. 담당자에게 알려 주세요 (백엔드 재배포 필요).');
  const t = q.texts || {};
  return {
    ok: true, version: q.version, source_sha: q.source_sha,
    store: v.store,
    storeType: String((q.store_types || {})[v.store] || ''),
    kiosk_excludes: (q.kiosk_excludes || []).slice(0),
    shopper_categories: q.shopper_categories,
    texts: {
      shopper_criteria: t.shopper_criteria || '', shopper_principles: t.shopper_principles || '',
      shopper_grade_note: t.shopper_grade_note || '',
    },
  };
}

// ── 시험 ──────────────────────────────────────────────────────
let pass = 0, fail = 0;
function is(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n       got  ' + g + '\n       want ' + w); }
}
function head(t) { console.log('\n' + t); }
const CTX = { id: 'moon' };
const ANON = { auth: false, id: '(무인증)', role: '' };
function issue(store, ttl) { return fnCodesIssue(CTX, { store: store, ttl: ttl || '3h' }); }
function ask(code, store) { return fnSurveyQuestions(ANON, { code: code, store: store }); }
function submit(store, code) { return submitWithCode(SS, { store: store, code: code, date: '2026-10-05' }, CTX); }
function bucket() { return Math.floor(Date.now() / (10 * 60000)); }
function fails(store) { return Number(CACHE_M['codefail:' + store + ':' + bucket()] || 0); }
function failsAll() { return Number(CACHE_M['codefail:*:' + bucket()] || 0); }
function rowOf(code) { return ROWS.filter(function (r) { return r[2] === code; })[0]; }

head('[1] 코드 없음');
is('빈 코드 → BAD_REQUEST', ask('', '금종제과').code, 'BAD_REQUEST');
is('문구', ask('', '금종제과').error, '제출 코드를 입력해 주세요.');
is('실패 카운터는 안 오른다', fails('금종제과'), 0);

head('[2] 틀린 코드 → NOT_FOUND + 매장별 카운터');
let r = ask('999999', '금종제과');
is('NOT_FOUND', r.code, 'NOT_FOUND');
is('★문구는 제출 때와 같다★', r.error, '제출 코드가 맞지 않습니다.');
is('문항이 실리지 않는다', 'shopper_categories' in r, false);
is('금종제과 카운터 1', fails('금종제과'), 1);
is('전체 카운터 1', failsAll(), 1);
const a1 = issue('금종제과');
is('발급된다', a1.ok, true);
r = ask(a1.rec.code, '다른매장');
is('★다른 매장 이름으로 열면 NOT_FOUND★ (없는 코드와 구분하지 않는다)', r.code, 'NOT_FOUND');
is('다른매장 카운터 1', fails('다른매장'), 1);
is('금종제과 카운터는 그대로 1', fails('금종제과'), 1);
is('공백·하이픈이 섞여도 숫자만 본다', ask(' ' + a1.rec.code.slice(0, 3) + '-' + a1.rec.code.slice(3) + ' ', '금종제과').ok, true);

head('[3] 맞는 코드 → 문항 · ★소진 안 됨★');
r = ask(a1.rec.code, '금종제과');
is('ok', r.ok, true);
is('store = 코드의 매장', r.store, '금종제과');
is('storeType 은 빈 값 (보통 매장)', r.storeType, '');
const qs = []; (r.shopper_categories || []).forEach(function (c) { c.questions.forEach(function (q) { qs.push(q); }); });
is('38문항', qs.length, 38);
is('13카테고리', r.shopper_categories.length, 13);
is('문항마다 no·row·text·scale', qs.every(function (q) { return q.no && q.row && q.text && (q.scale === 'yn' || q.scale === 'likert'); }), true);
is('kiosk_excludes 5개', r.kiosk_excludes, ['3-1', '3-2', '7-1', '7-2', '7-3']);
is('texts 3키', Object.keys(r.texts || {}).sort(), ['shopper_criteria', 'shopper_grade_note', 'shopper_principles']);
is('★QSC 문항은 없다★', 'qsc_groups' in r, false);
is('version · source_sha', /^\d{4}-\d{2}-\d{2}$/.test(r.version) && /^[0-9a-f]{12}$/.test(r.source_sha), true);
is('★시트의 상태는 미사용 그대로★', rowOf(a1.rec.code)[5], '미사용');
is('다시 열어도 ok', ask(a1.rec.code, '금종제과').ok, true);
is('카운터도 그대로', fails('금종제과'), 1);
is('★그 코드로 제출도 된다★', submit('금종제과', a1.rec.code).ok, true);
is('제출이 소진한다', rowOf(a1.rec.code)[5], '사용됨');

head('[4] 사용됨 · 만료 · 취소 · store 비움');
r = ask(a1.rec.code, '금종제과');
is('사용된 코드 → CONFLICT', r.code, 'CONFLICT');
is('문구', r.error, '이미 사용된 코드입니다.');
is('사용된 코드는 카운터를 안 올린다', fails('금종제과'), 1);
const b1 = issue('금종제과', '3h');
rowOf(b1.rec.code)[4] = new Date(Date.now() - 60000);
r = ask(b1.rec.code, '금종제과');
is('만료 → BAD_REQUEST 「기한이 지난」', r.code === 'BAD_REQUEST' && r.error.indexOf('기한이 지난') === 0, true);
const c1 = issue('금종제과');
fnCodesRevoke(CTX, { code: c1.rec.code });
r = ask(c1.rec.code, '금종제과');
is('취소 → BAD_REQUEST 「사용할 수 없는 코드입니다.」', r.code === 'BAD_REQUEST' && r.error === '사용할 수 없는 코드입니다.', true);
const d1 = issue('금종제과');
r = ask(d1.rec.code, '');
is('store 를 비우면 ok — 코드의 매장을 준다', r.ok === true && r.store === '금종제과', true);
is('  그래도 소진 안 됨', rowOf(d1.rec.code)[5], '미사용');

head('[5] 매장 유형');
const k1 = issue('도넛정수');
is('키오스크 전용 → storeType kiosk', ask(k1.rec.code, '도넛정수').storeType, 'kiosk');
const m1 = issue('제주당');
is('일부 키오스크 → storeType mixed', ask(m1.rec.code, '제주당').storeType, 'mixed');
is('보통 매장 → 빈 값', ask(d1.rec.code, '금종제과').storeType, '');

head('[6] 무작위 대입 방어 — 매장별 15회');
const L = '잠금매장';
const l1 = issue(L);
for (let i = 0; i < 15; i++) ask('000001', L);
is('15회 틀린 뒤 카운터 15', fails(L), 15);
r = ask(l1.rec.code, L);
is('★맞는 코드도 막힌다★ RATE_LIMITED', r.code, 'RATE_LIMITED');
is('문구는 제출 때와 같다', r.error, '코드 확인이 잠시 막혀 있습니다. 10분 뒤에 다시 시도해 주세요.');
is('잠긴 동안은 카운터가 더 안 오른다', fails(L), 15);
is('다른 매장은 통과', ask(d1.rec.code, '금종제과').ok, true);
is('제출 경로도 같은 잠금', submit(L, l1.rec.code).code, 'RATE_LIMITED');

head('[7] 제출 경로의 판정·문구는 종전 그대로');
r = submit('금종제과', '999998');
is('없는 코드 → BAD_REQUEST (NOT_FOUND 가 아니다)', r.code, 'BAD_REQUEST');
is('문구', r.error, '제출 코드가 맞지 않습니다.');
is('매장 없이 제출 → 「매장을 선택해 주세요.」', submit('', d1.rec.code).error, '매장을 선택해 주세요.');
is('코드 없이 제출 → 「제출 코드를 입력해 주세요.」', submit('금종제과', '').error, '제출 코드를 입력해 주세요.');
r = submit('금종제과', d1.rec.code);
is('맞는 코드 제출 → ok', r.ok, true);
is('응답이 저장됐다', SAVED.length, 2);

console.log('\n─────────────────────────────');
console.log(pass + '개 통과 · ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
