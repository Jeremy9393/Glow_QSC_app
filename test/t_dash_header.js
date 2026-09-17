
const DASHBOARD_ID = 'dash', DASHBOARD_SHEET = '데이터', STORE_NAME_COL = 4;
const MONTH_COL = { 1: 5, 2: 12, 3: 19, 4: 28, 5: 35, 6: 42, 7: 51, 8: 58, 9: 65, 10: 74, 11: 81, 12: 88 };
function curYm() { return '2026-10'; }
function normStore(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }
function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - 1 - m) / 26; } return s; }
let HEAD = {}, HEAD4 = {}, FORMULA = {}, WROTE = [];
const NAMES = ['금종제과', '도넛정수', '제주당'];
function headAt(rr, c) { return rr === 5 ? (HEAD[c] === undefined ? '' : HEAD[c]) : (rr === 4 ? (HEAD4[c] === undefined ? '' : HEAD4[c]) : ''); }
const sheet = {
  getLastRow: function () { return 5 + NAMES.length; },
  getRange: function (r, c, nr, nc) { return {
    getValue: function () { return headAt(r, c); },
    /* 3~5행 머리글 읽기(2026-09-18 실물: 4행 「QSC」/「MS」 · 5행 「점수」) — writeDashboard 가 이어 붙여 본다 */
    getValues: function () { const out = []; for (let i = 0; i < (nr || 1); i++) out.push([headAt(r + i, c)]); return out; },
    getFormula: function () { return FORMULA[r + ',' + c] || ''; },
    getA1Notation: function () { return colLetter(c) + r; },
    setValue: function (v) { WROTE.push([colLetter(c) + r, v]); },
  }; },
};
function grid(sh, r, c, nr, nc) { return { getValues: function () { return NAMES.map(function (n) { return [n]; }); } }; }
const SpreadsheetApp = { openById: function () { return { getSheetByName: function () { return sheet; } }; } };
function writeDashboard(store, dateStr, frac, offset) {
  /* ① 올해 자료인가. 통합시트는 ★한 해짜리 파일★이다(기간 목록도 올해만 준다 — dashPeriods).
        지난해 날짜를 그대로 쓰면 올해 그 달 칸에 조용히 들어가 앉는다. 오류 하나 없이 틀린다. */
  const y = String(dateStr).slice(0, 4);
  if (y !== curYm().slice(0, 4)) {
    return { ok: false, error: '올해 통합시트가 아닙니다 (' + y + '년 자료) — 점수는 직접 입력해 주십시오' };
  }
  const sh = SpreadsheetApp.openById(DASHBOARD_ID).getSheetByName(DASHBOARD_SHEET);
  const month = parseInt(dateStr.slice(5, 7), 10);
  const col = MONTH_COL[month] + offset;
  /* ② ★그 열의 5행 머리글을 먼저 본다★ (2026-09-17 #25) — 통합시트에 열이 하나라도 끼어들면 MONTH_COL 상수가
        엉뚱한 칸을 가리키고, 점수는 오류 하나 없이 옆 칸에 들어간다. QSC 쪽은 「QSC점수」(옛 「위생점수」) ·
        MS 쪽은 「MS점수」(옛 「CS점수」)여야 쓴다. ★쓰지 않고 알린다★ — 부르는 쪽(saveQsc·saveShopper·되돌리기·월말 반영)이
        이 실패를 화면·기록에 그대로 올린다(제출 자체는 응답 시트에 저장된 뒤다). */
  const headCell = sh.getRange(5, col);
  /* ★머리글이 두 줄이다★ (2026-09-18 실물: 5행은 「점수」·「등급」뿐이고 「QSC」「MS」는 그 윗줄) — 3~5행을 이어 붙여 본다.
     v144 는 5행만 봐서 「점수」≠「QSC점수」로 모든 점수 쓰기가 막힐 뻔했다(배포 직후 rateProbe 로 잡아 v145 에서 고침). */
  const head = sh.getRange(3, col, 3, 1).getValues().map(function (r) { return r[0] == null ? '' : String(r[0]); }).join('').replace(/\s+/g, '');
  const want = (offset === 2) ? ['MS점수', 'CS점수'] : ['QSC점수', '위생점수'];
  /* 「포함」으로 본다 — 머리글에 「(10월)」 같은 장식이 붙어 있어도 열이 맞으면 쓴다. 막으려는 것은 「끼어든 열」(전혀 다른 말)이다. */
  if (!want.some(function (w) { return head.indexOf(w) >= 0; })) {
    return { ok: false, error: '열 머리글 불일치: ' + headCell.getA1Notation() + ' = 「' + head + '」 (기대 ' + want.join('·') +
      ') — 통합시트 열이 바뀐 것 같습니다. 점수는 직접 입력해 주십시오' };
  }
  const last = sh.getLastRow();
  const rng = grid(sh, 6, STORE_NAME_COL, last - 5, 1); // D6부터 매장명 (숨김 행도 그대로 온다)
  const names = rng ? rng.getValues() : [];
  const key = normStore(store);
  for (let i = 0; i < names.length; i++) {
    if (normStore(names[i][0]) === key) {
      const row = 6 + i;
      const cell = sh.getRange(row, col);
      /* ③ 그 칸이 수식이면 손대지 않는다. 점수 칸은 사람이 넣는 값 칸이라 수식이 있을 리 없다 —
            있다면 열을 잘못 짚었거나(칸 뜻이 또 바뀌었거나) 담당자가 뭔가 걸어 둔 것이다.
            setValue는 수식을 되돌릴 수 없이 지운다. 덮어쓰기 전에 멈추는 편이 낫다. */
      if (String(cell.getFormula() || '') !== '') {
        return { ok: false, error: '그 칸에 수식이 있어 쓰지 않았습니다: ' + cell.getA1Notation() };
      }
      cell.setValue(frac);
      return { ok: true, cell: cell.getA1Notation() };
    }
  }
  return { ok: false, error: '통합시트에 매장 행 없음: ' + store };
}

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
function set(h, h4) { HEAD = h; HEAD4 = h4 || {}; FORMULA = {}; WROTE = []; }
/* 10월 블록 — BV(74) QSC점수 · BW 등급 · BX(76) MS점수 */
const OKHEAD = { 74: 'QSC점수', 75: 'QSC등급', 76: 'MS점수', 77: 'MS등급' };

console.log('① 머리글이 맞으면 쓴다');
set(OKHEAD);
let r = writeDashboard('도넛정수', '2026-10-05', 0.9, 0);
ok('QSC → BV7 에 0.9', r.ok && r.cell === 'BV7' && WROTE.length === 1 && WROTE[0][0] === 'BV7' && WROTE[0][1] === 0.9, [r, WROTE]);
set(OKHEAD);
r = writeDashboard('제주당', '2026-10-05', 0.8, 2);
ok('MS → BX8 에 0.8', r.ok && r.cell === 'BX8' && WROTE[0][0] === 'BX8', [r, WROTE]);
set({ 74: '위생 점수', 76: 'CS 점수' });
ok('옛 이름(위생점수·CS점수)·띄어쓰기도 받는다', writeDashboard('금종제과', '2026-10-05', 0.7, 0).ok && writeDashboard('금종제과', '2026-10-05', 0.7, 2).ok && WROTE.length === 2, WROTE);
set({ 74: '점수', 75: '등급', 76: '점수', 77: '등급' }, { 74: 'QSC', 76: 'MS' });
ok('두 줄 머리글(4행 QSC·MS / 5행 점수)도 받는다 — 2026-09-18 통합시트 실물', writeDashboard('금종제과', '2026-10-05', 0.7, 0).ok && writeDashboard('금종제과', '2026-10-05', 0.7, 2).ok && WROTE.length === 2, WROTE);
set({ 74: '점수', 76: '점수' }, { 74: '개선', 76: '종합' });
ok('4행이 다른 말이면(끼어든 열) 5행이 「점수」여도 막힌다', !writeDashboard('금종제과', '2026-10-05', 0.7, 0).ok && WROTE.length === 0, WROTE);

console.log('② 열이 밀렸다');
set({ 73: 'QSC점수', 74: 'QSC등급', 75: 'MS점수' });       // 한 칸 왼쪽으로 밀린 시트
r = writeDashboard('도넛정수', '2026-10-05', 0.9, 0);
ok('★안 쓴다★ · 「열 머리글 불일치」', r.ok === false && r.error.indexOf('열 머리글 불일치: BV5') === 0 && WROTE.length === 0, [r, WROTE]);
ok('안내에 지금 머리글과 기대 이름이 있다', /「QSC등급」/.test(r.error) && /QSC점수·위생점수/.test(r.error), r.error);
r = writeDashboard('도넛정수', '2026-10-05', 0.9, 2);
ok('MS 쪽도 막힌다(BX5 = MS등급 아님 · 빈칸)', r.ok === false && /열 머리글 불일치: BX5/.test(r.error) && WROTE.length === 0, r);

console.log('③ 오프셋 착오');
set(OKHEAD);
ok('QSC 열에 MS(offset 2 기대) 머리글이면 막힌다', (function () { HEAD = { 74: 'MS점수', 76: 'QSC점수' }; const x = writeDashboard('도넛정수', '2026-10-05', 0.9, 0); return x.ok === false && WROTE.length === 0; })());

console.log('④ 검사 순서');
set({ 73: 'QSC점수' });
r = writeDashboard('도넛정수', '2025-10-05', 0.9, 0);
ok('올해가 아니면 머리글보다 먼저 멈춘다', r.ok === false && /올해 통합시트가 아닙니다/.test(r.error), r);
set(OKHEAD); FORMULA['7,74'] = '=1';
r = writeDashboard('도넛정수', '2026-10-05', 0.9, 0);
ok('머리글은 맞고 그 칸이 수식이면 「수식이 있어」로 멈춘다', r.ok === false && /수식이 있어/.test(r.error) && WROTE.length === 0, r);
set(OKHEAD);
r = writeDashboard('없는매장', '2026-10-05', 0.9, 0);
ok('매장 행이 없으면 종전 안내', r.ok === false && /매장 행 없음/.test(r.error), r);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
