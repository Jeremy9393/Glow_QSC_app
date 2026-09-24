
/* ── 가짜 세계 ── */
let RAW = {};
function prop(key, def) { const v = Object.prototype.hasOwnProperty.call(RAW, key) ? RAW[key] : null; return (v === null || v === undefined || v === '') ? def : v; }
function epoch() { return '1'; }
let CACHE = {};
const CacheService = { getScriptCache: function () { return {
  get: function (k) { return Object.prototype.hasOwnProperty.call(CACHE, k) ? CACHE[k] : null; },
  put: function (k, v) { CACHE[k] = String(v); },
}; } };
let OPENS = 0, SSOPENS = {}, TABS = {};
function mkFile(id) { return { _id: id, getId: function () { return id; }, getSheetByName: function (n) { return TABS[n] ? { _tab: n } : null; } }; }
const SpreadsheetApp = { openById: function (id) { OPENS++; return mkFile(id); } };
const _memo = {};
function ssOpen(id) { if (!_memo[id]) { _memo[id] = SpreadsheetApp.openById(id); } SSOPENS[id] = (SSOPENS[id] || 0) + 1; return _memo[id]; }
function storeFileId() { return 'FILE1'; }
function monthTabs() { return ['2610']; }
function readStoreTab() { return { ok: true, exists: true }; }
let CUR = '2611';
function curYymm() { return CUR; }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function yymm(d) { return d.slice(2, 4) + d.slice(5, 7); }
const STORE_MAP_SHEET = '매장목록';
let INTO = [];
function writeStoreQscInto(ss, p, photoMap, tab) { INTO.push([ss._id, tab]); return { ok: true }; }
function improveScan() { return { ok: true, touched: 0, filled: 0 }; }
let SRC_PICKS = 0;
function tabSourceFor() { SRC_PICKS++; return { sh: null, why: '원본 없음' }; }
/* 메일 */
const ADMIN_MENU = 'accounts';
let MAILS = [], CAN_THROWS = false;
function can(role, menu, act) { if (CAN_THROWS) throw new Error('역할 탭을 못 읽음'); return { allow: role === '관리자' && menu === 'accounts' }; }
const Session = { getEffectiveUser: function () { return { getEmail: function () { return 'owner@example.com'; } }; } };
const MailApp = { sendEmail: function (to, subj, body) { MAILS.push({ to: to, subj: subj, body: body }); } };
function validYm(ym) {
  if (!/^\d{4}$/.test(String(ym))) return false;
  const m = Number(String(ym).slice(2, 4));
  return m >= 1 && m <= 12;
}
function storeMonthBody(store, ym) {
  const ck = 'store:v' + epoch() + ':' + store + ':' + ym;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }

  const id = storeFileId(store);
  if (!id) return err('NOT_FOUND', '매장 파일을 찾지 못했습니다. 담당자에게 문의해 주세요.');
  let ss;
  try { ss = SpreadsheetApp.openById(id); }
  catch (e) { return err('NOT_FOUND', '매장 파일을 열 수 없습니다. 담당자에게 문의해 주세요.'); }
  const sh = ss.getSheetByName(ym);
  if (!sh) {
    /* 탭이 아직 없는 것은 오류가 아니다(본사가 안 만들었을 뿐). 캐시하지 않는다 —
       만드는 즉시 보여야 하고, 이 경로는 이미 시트를 연 뒤라 캐시 이득도 없다.
       items를 빈 배열로 함께 내려 배지가 조건문 없이 셀 수 있게 한다. */
    /* 2026-09-25 검수 · critic-day1-1 — 탭이 없는 것은 「아직 이번 달 점검 전」이라는 정상 상태다(탭은 첫 제출 때 생긴다).
       종전 「본사 담당자에게 문의해 주세요」는 10/1부터 점검 전 매장 전부가 보고 전화하게 만드는 문구였다(약속 ③).
       지난 달을 골랐는데 탭이 없으면(그 달 점검이 없었음) 「이번 달」이 틀린 말이라 그 경우만 담담하게 알린다. */
    /* 2026-09-25 검수 · contract-2 — 「이번 달」은 ym 이 정말 이번 달일 때만. 다음 달(예: 10월 중 2611 · 10/1 전 2610)은
       「이번 달」 없는 문구로(앱 notYetMsg 와 같은 갈래 · 앱은 서버 문구에 '문의'가 없으면 그대로 쓴다). */
    let cy = '';
    try { cy = String(curYymm()); } catch (e) { cy = ''; }
    const tail = ' 점검이 끝나면 이곳에 개선요청사항이 나타납니다.';
    return { ok: true, store: store, ym: ym, exists: false, items: [], months: monthTabs(ss),
      error: (cy && String(ym) < cy) ? '이 달에는 점검 기록이 없습니다.'
        : (cy && String(ym) > cy) ? '아직 점검 기록이 없습니다.' + tail
        : '아직 이번 달 점검 전입니다.' + tail };
  }
  const body = readStoreTab(ss, sh, store, ym);
  const packed = JSON.stringify(body);
  /* CacheService.put()은 100KB를 넘으면 예외 없이 조용히 아무것도 저장하지 않는다.
     그러면 그 매장만 매 요청이 시트를 열어 응답이 3~5초로 늘어진다. */
  if (packed.length <= 90000) cache.put(ck, packed, 60);
  else Logger.log('store 캐시 건너뜀: ' + store + ' ' + ym + ' (' + packed.length + 'B)');
  return body;
}
function notifyPasswordChanged(acct, how) {
  try {
    let admin = true;
    try { admin = can(acct.role, ADMIN_MENU, '읽기').allow; } catch (e) { admin = true; }
    if (!admin && how === '본인 변경') return;
    const to = Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail(to, '[QSC] 비밀번호가 변경되었습니다',
      '계정: ' + acct.id + '\n방식: ' + how +
      '\n시각: ' + new Date() +
      '\n\n본인(또는 담당자)이 바꾼 것이라면 따로 하실 일은 없습니다.' +
      '\n바꾼 적이 없다면 QSC관리자 시트의 계정 탭에서 이 계정의 E열을 「중지」로 바꿔 주십시오.' +
      '\n관리자 계정이 모르게 바뀐 경우라면 TOKEN_KEY 교체(전원 다시 로그인)까지 검토해 주십시오.');
  } catch (e) { /* 메일 실패가 비밀번호 변경을 되돌릴 이유는 없다 */ }
}
function enforceOn() {
  /* 2026-09-25 검수 · authz-1 — 속성이 없거나 비면 ★켜짐★(종전 'off' 는 비는 순간 옛 무인증 봉투가 열리는 fail-open 이었다).
     실서버는 이미 'on' 이라 동작은 같다. 끄려면(롤백) 속성에 off·false·0·no 를 ★적는다★. */
  /* 2026-09-25 검수 · backend-3/contract-4 — 공백만 든 값(' ')도 「빈 값 = 켜짐」으로 본다(종전 trim 뒤 '' 가 꺼짐으로 새어 fail-open). */
  const v = String(prop('AUTH_ENFORCE', 'on')).trim().toLowerCase();
  return !(v === 'off' || v === 'false' || v === '0' || v === 'no');
}
function makeMonthTabIn(ss, ym) {
  /* 2026-09-25 검수 · dates-4 — 탭 이름이 yyMM 네 자리가 아니면 copyTo 전에 끊는다. 종전에는 빈 날짜('')면 copyTo 뒤 setName('') 예외로
     「…의 사본」 탭이 남았다(아래 try 는 setName 다음부터라 그 탭을 못 치운다). */
  if (!validYm(ym)) return { mark: '✗', msg: '달 형식 오류 (' + ym + ')' };
  if (ss.getSheetByName(ym)) return { mark: '·', msg: '이미 있음' };
  const pick = tabSourceFor(ss, ym);
  return { mark: 'GO', msg: '원본 복사로 넘어감' };
}
function writeStoreQsc(p, photoMap) {
  const id = storeFileId(p.store);
  if (!id) return { ok: false, error: STORE_MAP_SHEET + '에 매장 없음: ' + p.store };
  /* 2026-09-25 검수 · perf-server-3 — ssOpen: 같은 요청에서 qscMonthClosed 가 이미 연 같은 파일을 다시 열지 않는다(수백 ms) */
  return writeStoreQscInto(ssOpen(id), p, photoMap, yymm(p.date));
}
function improveBlocked(store, dateStr) {
  try {
    const id = storeFileId(store);
    if (!id) return null;
    const sh2 = ssOpen(id).getSheetByName(yymm(dateStr));   // 2026-09-25 검수 · perf-server-3 — 덮어쓰기 길의 같은 파일 재열기 대신 실행 메모
    if (!sh2) return null;
    const s = improveScan(sh2);
    if (s.ok && s.touched) return { filled: s.filled, touched: s.touched };
    return null;
  } catch (e) { return null; }
}
function fnShopperSubmit(ctx, payload) {
  const badDate = submitDateGate(payload && payload.date);   // 2026-09-25 검수 · dates-4
  if (badDate) return badDate;
  /* 2026-09-25 검수 · contract-1 — 확정 달은 되묻기(guardResubmit) 앞에서 끝낸다(QSC 와 같은 순서).
     종전에는 그 달 MS 가 이미 있으면 덮어쓰기 창 → 되돌리기 거절 → 「…에서 멈췄습니다」가 떴다.
     saveShopper 안의 같은 검사는 고객 설문(submitWithCode) 경로용으로 그대로 둔다. */
  const closed = qscMonthClosed(payload && payload.store, payload && payload.date);
  if (closed) return closed;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const undone = [];
  const stop = guardResubmit(ss, 'shopper', payload, ctx, undone);
  if (stop) return stop;
  const out = saveShopper(ss, payload, ctx, false);
  if (out && out.ok && undone.length) out.undone = undone;
  return out;
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
/* fnShopperSubmit(관리자 MS · 옛 길)의 나머지 부품 */
const SPREADSHEET_ID = 'RESP';
let MS_SAVES = 0, MS_GUARDS = 0, MS_CLOSED = null;
function guardResubmit() { MS_GUARDS++; return null; }
function qscMonthClosed() { return MS_CLOSED; }   // contract-1 — fnShopperSubmit 이 되묻기 앞에서 본다
function saveShopper() { MS_SAVES++; return { ok: true }; }

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }

console.log('① critic-day1-1 — 탭이 없을 때 문구');
TABS = {}; CUR = '2610'; CACHE = {};
let r = storeMonthBody('금종제과', '2610');
ok('이번 달 → 「아직 이번 달 점검 전입니다. 점검이 끝나면 이곳에 개선요청사항이 나타납니다.」',
   r.ok === true && r.exists === false && r.error === '아직 이번 달 점검 전입니다. 점검이 끝나면 이곳에 개선요청사항이 나타납니다.', r.error);
ok('「문의」·「탭」 같은 말이 없다', !/문의|탭/.test(r.error));
ok('items 빈 배열 · months 그대로(배지·달 목록)', Array.isArray(r.items) && r.items.length === 0 && r.months.length === 1);
ok('캐시하지 않는다(탭이 생기면 곧바로 보여야 한다)', Object.keys(CACHE).length === 0, Object.keys(CACHE));
CUR = '2611';
r = storeMonthBody('금종제과', '2610');
ok('지난 달에 탭이 없으면 「이 달에는 점검 기록이 없습니다.」', r.error === '이 달에는 점검 기록이 없습니다.', r.error);
/* contract-2 — 다음 달(10월 중 2611 · 10/1 전 2610)에 「이번 달」이라고 하지 않는다 */
CUR = '2610';
r = storeMonthBody('금종제과', '2611');
ok('다음 달에 탭이 없으면 「아직 점검 기록이 없습니다. 점검이 끝나면…」(「이번 달」 없음)',
   r.ok === true && r.exists === false && r.error === '아직 점검 기록이 없습니다. 점검이 끝나면 이곳에 개선요청사항이 나타납니다.', r.error);
ok('다음 달 문구에도 「문의」·「탭」 없음(앱이 서버 문구를 그대로 쓴다)', !/문의|탭/.test(r.error));
CUR = '2609';
r = storeMonthBody('금종제과', '2610');
ok('10/1 전(서버 달 2609)에 2610 → 「이번 달」 없음', !/이번 달/.test(r.error) && r.exists === false, r.error);

console.log('② critic-day1-2 — 비밀번호 변경 메일');
MAILS = [];
notifyPasswordChanged({ id: '금종제과', role: '매장' }, '본인 변경');
ok('매장 계정이 자기 비밀번호를 바꾸면 메일 없음', MAILS.length === 0, MAILS.length);
notifyPasswordChanged({ id: 'admin', role: '관리자' }, '본인 변경');
ok('관리자 계정이 바꾸면 메일', MAILS.length === 1 && MAILS[0].to === 'owner@example.com', MAILS.length);
ok('본문 — 「바꾼 적이 없다면」 · 「중지」 안내', /바꾼 적이 없다면/.test(MAILS[0] ? MAILS[0].body : '') && /「중지」/.test(MAILS[0] ? MAILS[0].body : ''));
ok('본문 — 본인이 바꾼 것이면 할 일 없음을 먼저 말한다', /바꾼 것이라면 따로 하실 일은 없습니다/.test(MAILS[0] ? MAILS[0].body : ''));
ok('본문 — 옛 이름 「QSC 인증 시트」를 쓰지 않는다', !/QSC 인증 시트/.test(MAILS[0] ? MAILS[0].body : ''));
MAILS = [];
notifyPasswordChanged({ id: '금종제과', role: '매장' }, '관리자 설정 (admin)');
ok('관리자가 매장 비밀번호를 정해 주면 메일(종전대로)', MAILS.length === 1);
MAILS = []; CAN_THROWS = true;
notifyPasswordChanged({ id: '금종제과', role: '매장' }, '본인 변경');
CAN_THROWS = false;
ok('권한 판정이 터지면 보내는 쪽(알림을 놓치지 않는다)', MAILS.length === 1);

console.log('③ authz-1 — AUTH_ENFORCE 기본 켜짐');
RAW = {};
ok('속성 없음 → 켜짐', enforceOn() === true);
RAW.AUTH_ENFORCE = '';
ok('빈 문자열 → 켜짐', enforceOn() === true);
/* backend-3/contract-4 — 공백만 든 값도 「빈 값 = 켜짐」 */
[' ', '  ', ' \t', '\n'].forEach(function (v) { RAW.AUTH_ENFORCE = v; ok(JSON.stringify(v) + '(공백만) → 켜짐', enforceOn() === true); });
['off', 'OFF', ' off ', 'false', '0', 'no'].forEach(function (v) { RAW.AUTH_ENFORCE = v; ok(JSON.stringify(v) + ' → 꺼짐(롤백 수단은 그대로)', enforceOn() === false); });
['on', 'ON', 'On', '1', 'true', 'yes'].forEach(function (v) { RAW.AUTH_ENFORCE = v; ok(JSON.stringify(v) + ' → 켜짐', enforceOn() === true); });

console.log('④ dates-4 — makeMonthTabIn 은 복사 전에 달 형식을 본다');
TABS = {}; SRC_PICKS = 0;
['', 'undefined', '26-10', '2613', '261', 'abcd'].forEach(function (ym) {
  const m = makeMonthTabIn(mkFile('F'), ym);
  ok(JSON.stringify(ym) + ' → ✗ 달 형식 오류', m.mark === '✗' && /달 형식 오류/.test(m.msg), m);
});
ok('그동안 원본을 한 번도 고르지(복사하지) 않았다', SRC_PICKS === 0, SRC_PICKS);
ok('맞는 달(2610)은 원본 고르기로 넘어간다', makeMonthTabIn(mkFile('F'), '2610').mark === 'GO' && SRC_PICKS === 1);
TABS = { '2610': true };
ok('이미 있으면 종전대로 「이미 있음」', makeMonthTabIn(mkFile('F'), '2610').msg === '이미 있음');

console.log('⑤ perf-server-3 — 같은 요청에서 매장 파일을 한 번만 연다');
OPENS = 0; SSOPENS = {}; INTO = []; TABS = { '2610': true };
ssOpen('FILE1');                                 // qscMonthClosed 가 먼저 연다
improveBlocked('금종제과', '2026-10-05');         // 덮어쓰기 길
writeStoreQsc({ store: '금종제과', date: '2026-10-05' }, {});
ok('openById 는 한 번뿐 (종전: 2~3번)', OPENS === 1, OPENS);
ok('writeStoreQscInto 는 그 파일·그 달로', INTO.length === 1 && INTO[0][0] === 'FILE1' && INTO[0][1] === '2610', INTO);

console.log('⑥ dates-4 — MS 관리자 제출(fnShopperSubmit)도 같은 점검일자 문');
CUR = '2610'; MS_SAVES = 0; MS_GUARDS = 0;
r = fnShopperSubmit({ auth: true, id: 'admin' }, { store: '금종제과', date: '' });
ok('빈 날짜 → 「점검일자를 선택해 주세요.」 · 되묻기·저장 안 함', r.code === 'BAD_REQUEST' && r.error === '점검일자를 선택해 주세요.' && MS_SAVES === 0 && MS_GUARDS === 0, [r, MS_SAVES, MS_GUARDS]);
ok('9월 → 「9월은 앱으로 제출할 수 없습니다 — 점검일자를 확인해 주세요.」', fnShopperSubmit({}, { date: '2026-09-30' }).error === '9월은 앱으로 제출할 수 없습니다 — 점검일자를 확인해 주세요.');
ok('다음 달 → 「아직 오지 않은 달입니다 — 점검일자를 확인해 주세요.」', fnShopperSubmit({}, { date: '2026-11-01' }).error === '아직 오지 않은 달입니다 — 점검일자를 확인해 주세요.');
ok('이번 달 → 저장까지 간다', fnShopperSubmit({}, { date: '2026-10-05' }).ok === true && MS_SAVES === 1);
/* backend-2/security-1 — 앞뒤 공백·탭이 붙은 날짜는 문에서 끊는다(뒤따르는 확정 검사·yymm 이 원래 값을 쓰므로) */
MS_SAVES = 0; MS_GUARDS = 0;
[' 2026-10-05', '2026-10-05 ', '\t2026-10-05', '2026-10-05\n'].forEach(function (d) {
  const g = fnShopperSubmit({}, { store: '금종제과', date: d });
  ok(JSON.stringify(d) + ' → 「점검일자를 선택해 주세요.」', g.code === 'BAD_REQUEST' && g.error === '점검일자를 선택해 주세요.', g);
});
ok('공백 날짜는 되묻기·저장까지 가지 않았다', MS_SAVES === 0 && MS_GUARDS === 0, [MS_SAVES, MS_GUARDS]);
ok('고객 설문 문(방문 날짜)도 같다', submitDateGate(' 2026-10-05', '방문 날짜').error === '방문 날짜를 선택해 주세요.');
ok('정상 날짜는 그대로 통과', submitDateGate('2026-10-05') === null);
/* contract-1 — 확정 달이면 되묻기(guardResubmit) 앞에서 MONTH_CLOSED */
MS_SAVES = 0; MS_GUARDS = 0;
MS_CLOSED = { ok: false, code: 'MONTH_CLOSED', error: '2026년 10월 채점이 확정되어 제출할 수 없습니다.' };
r = fnShopperSubmit({ auth: true, id: 'admin' }, { store: '금종제과', date: '2026-10-05' });
MS_CLOSED = null;
ok('확정 달 → MONTH_CLOSED · 되묻기·저장 안 함', r.code === 'MONTH_CLOSED' && MS_GUARDS === 0 && MS_SAVES === 0, [r, MS_GUARDS, MS_SAVES]);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
