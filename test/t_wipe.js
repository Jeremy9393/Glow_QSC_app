
// ── 가짜 시트 ───────────────────────────────────────────────
// 열: 1=A 2=B(기한) 3=C(상태) 4=D(개선전사진) ... 10=J(개선요청) 11~15=K~O(매장몫)
//     16=P(비고) 17=Q(검수) 18=R(재제출기한) 19=S(감점제외) 20=T(이월)
var CLEARED = [];
function mkSheet(rows) {
  return {
    _v: rows,
    getMaxRows: function () { return rows.length; },
    getLastRow: function () { return rows.length; },
  };
}
function grid(sh, r, c, nr, nc) {
  if (nr <= 0 || nc <= 0) return null;
  return {
    getValues: function () {
      var o = [];
      for (var i = 0; i < nr; i++) {
        var row = [];
        for (var j = 0; j < nc; j++) {
          var rr = sh._v[r - 1 + i] || [];
          row.push(rr[c - 1 + j] === undefined ? '' : rr[c - 1 + j]);
        }
        o.push(row);
      }
      return o;
    },
    clearContent: function () {
      for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) {
        var rr = sh._v[r - 1 + i]; if (!rr) continue;
        if (String(rr[c - 1 + j] || '') !== '') CLEARED.push((r + i) + ',' + (c + j));
        rr[c - 1 + j] = '';
      }
    },
  };
}
function tableEndRow(sh) { return sh._v.length; }
var IC_NEW = { ok: true, row0: 2, due: 2, state: 3, body: 10, isNew: true,
               audit: 17, redo: 18, waive: 19, roll: 20 };
var IC_OLD = { ok: true, row0: 2, due: 2, state: 3, body: 10, isNew: false,
               audit: 0, redo: 0, waive: 0, roll: 0 };
var IC_MODE = IC_NEW;
function impCols(sh) { return IC_MODE; }

function improveScan(sh) {
  const IC = impCols(sh);
  const newFmt = !!(IC.ok && IC.isNew && IC.audit);
  let headRow = -1;
  if (IC.ok) headRow = IC.row0 - 1;
  else {
    const colB = (grid(sh, 1, 2, 60, 1) || { getValues: function () { return []; } }).getValues();
    for (let i = 0; i < colB.length; i++) {
      const v = String(colB[i][0]).trim();
      if (v.toUpperCase().indexOf('NO') === 0 || v === '기한') { headRow = i + 1; break; }
    }
  }
  if (headRow < 0) return { ok: false, filled: 0, touched: 0, why: '개선요청 표 머리글을 못 찾았습니다' };

  const lastRow = tableEndRow(sh) || sh.getMaxRows();
  const bodyN = Math.max(0, lastRow - headRow);
  const out = { ok: true, headRow: headRow, newFmt: newFmt, IC: IC, filled: 0, touched: 0 };
  if (!bodyN) return out;
  const bodyR = grid(sh, headRow + 1, 2, bodyN, 14);   // B~O
  const body = bodyR ? bodyR.getValues() : [];
  for (let i = 0; i < body.length; i++) {
    if (String(body[i][8] == null ? '' : body[i][8]).trim() === '') continue;   // J열(본문)이 비면 빈 줄
    out.filled = i + 1;
    for (let c = 9; c <= 13; c++) {                                             // K~O(매장 몫)
      if (String(body[i][c] == null ? '' : body[i][c]).trim() !== '') { out.touched++; break; }
    }
  }
  return out;
}

function wipeImprove(sh) {
  const s = improveScan(sh);
  if (!s.ok) return { ok: false, n: 0, touched: 0, why: s.why };
  if (!s.filled) return { ok: true, n: 0, touched: 0 };

  /* ★매장이 적은 답도 함께 지운다★ (2026-08-27 담당자 결정)

       "내가 되돌리기를 했다는건 내용을 다시 써야한다는 건데
        매장이 작성한 내용을 남길 필요가있나? 그냥 매장것도 리셋되고
        내가 매장에 다시 써달라고 요청하면 되는거 아닌가"

     종전에는 매장이 한 글자라도 적었으면 ★아무것도 안 지우고 멈췄다★(ok:false).
     그런데 화면 안내는 이미 「덮어쓰면 그 내용도 함께 지워집니다」로 바뀌어 있었다.
     ★사람이 그 문장을 읽고 [덮어씁니다]를 눌러도 서버가 거절하는 어긋난 상태★였다.
     되돌리기는 「그 회차를 없던 일로」 하는 것이므로 매장 몫도 함께 지운다.
     ⚠지우기 전에 반드시 사람에게 보여 준다 — improveBlocked 가 그 몫이고,
       되묻기 창(api.js askOverwrite)과 미리보기가 '매장이 적은 N건도 함께 지워집니다'를 편다. */
  const bcW = grid(sh, s.headRow + 1, s.newFmt ? s.IC.due : 2, s.filled, s.newFmt ? 1 : 2);
  const dW = grid(sh, s.headRow + 1, 4, s.filled, 1);
  const jW = grid(sh, s.headRow + 1, 10, s.filled, 1);
  /* K~O = 매장 몫(예정일·완료일·개선 후 사진 등). improveScan 이 '매장이 손댔는가'를
     판정할 때 보는 칸과 ★같은 범위★여야 한다(그 함수의 9~13번 자리 = K~O). */
  const koW = grid(sh, s.headRow + 1, 11, s.filled, 5);
  if (bcW) bcW.clearContent();
  if (dW) dW.clearContent();
  if (jW) jW.clearContent();
  if (koW) koW.clearContent();

  /* 비고 뒤 검수·재제출기한·감점제외·이월 — 10월 서식에만 있는 칸이다.
     남겨 두면 다음 회차의 ★엉뚱한 줄★에 옛 검수 흔적이 붙는다(같은 자리에 다시 채워지므로).
     열 번호를 세지 않고 impCols 가 머리글에서 찾아 준 것을 쓴다. */
  let extra = 0;
  [s.IC && s.IC.audit, s.IC && s.IC.redo, s.IC && s.IC.waive, s.IC && s.IC.roll].forEach(function (c) {
    if (!c) return;
    const r = grid(sh, s.headRow + 1, c, s.filled, 1);
    if (r) { r.clearContent(); extra++; }
  });

  return { ok: true, n: s.filled, touched: s.touched, extra: extra };
}

// ── 시험 ────────────────────────────────────────────────────
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  ✗    ' + name + (extra ? '   ' + extra : '')); }
}
function row(vals) { var r = new Array(21).fill(''); vals.forEach(function (p) { r[p[0] - 1] = p[1]; }); return r; }

// 머리글(1행) + 본문 2줄
function build(storeWrote, auditMark) {
  var head = row([[2, '기한'], [3, '상태'], [10, '개선요청사항'], [16, '비고']]);
  var r1 = row([[2, '10/10'], [4, '사진A'], [10, '냉장고 온도 기록 누락']]);
  var r2 = row([[2, '10/12'], [4, '사진B'], [10, '바닥 배수구 청소']]);
  if (storeWrote) { r1[10] = '2026-10-08'; r1[13] = '완료사진'; }   // K열·N열 = 매장 몫
  if (auditMark) { r1[16] = '확정'; r1[18] = 'Y'; }                 // Q열(검수) · S열(감점제외)
  return mkSheet([head, r1, r2]);
}

console.log('\n[1] 매장이 아무것도 안 적은 경우 — 종전과 같이 지운다');
CLEARED = [];
var sh = build(false, false);
var w = wipeImprove(sh);
ok('ok=true', w.ok === true, JSON.stringify(w));
ok('2줄 지움', w.n === 2, 'n=' + w.n);
ok('J열(개선요청) 비었다', sh._v[1][9] === '' && sh._v[2][9] === '');
ok('D열(사진) 비었다', sh._v[1][3] === '' && sh._v[2][3] === '');

console.log('\n[2] ★매장이 답을 적은 경우 — 멈추지 않고 그것도 지운다★ (2026-08-27 결정)');
CLEARED = [];
sh = build(true, false);
w = wipeImprove(sh);
ok('★ok=true (종전에는 false 였다)★', w.ok === true, JSON.stringify(w));
ok('매장이 적은 줄 수를 알려준다', w.touched === 1, 'touched=' + w.touched);
ok('★K열(매장 예정일) 지워졌다★', sh._v[1][10] === '', '남음: ' + JSON.stringify(sh._v[1][10]));
ok('★N열(매장 완료사진) 지워졌다★', sh._v[1][13] === '', '남음: ' + JSON.stringify(sh._v[1][13]));
ok('J열도 지워졌다', sh._v[1][9] === '');

console.log('\n[3] 검수 칸(10월 서식) — Q·S 도 지운다');
CLEARED = [];
sh = build(false, true);
w = wipeImprove(sh);
ok('★Q열(검수) 지워졌다★', sh._v[1][16] === '', '남음: ' + JSON.stringify(sh._v[1][16]));
ok('★S열(감점제외) 지워졌다★', sh._v[1][18] === '', '남음: ' + JSON.stringify(sh._v[1][18]));
ok('네 칸을 훑었다', w.extra === 4, 'extra=' + w.extra);

console.log('\n[4] 옛 서식(검수 칸 없음) — 건드리지 않는다');
IC_MODE = IC_OLD;
CLEARED = [];
sh = build(true, false);
sh._v[1][16] = '남아야함';          // 옛 서식에서는 Q가 검수가 아니다
w = wipeImprove(sh);
ok('ok=true', w.ok === true);
ok('매장 몫은 지웠다', sh._v[1][10] === '');
ok('★검수 칸을 모른다면 안 건드린다★', sh._v[1][16] === '남아야함', '값: ' + JSON.stringify(sh._v[1][16]));
ok('extra=0', w.extra === 0, 'extra=' + w.extra);
IC_MODE = IC_NEW;

console.log('\n[5] 비고(P)는 건드리지 않는다 — 누구 칸인지 확인 안 됨');
CLEARED = [];
sh = build(true, true);
sh._v[1][15] = '본사 메모';
w = wipeImprove(sh);
ok('P열 그대로', sh._v[1][15] === '본사 메모', '값: ' + JSON.stringify(sh._v[1][15]));

console.log('\n[6] 개선요청이 원래 없으면 조용히 끝난다');
CLEARED = [];
sh = mkSheet([row([[2, '기한'], [10, '개선요청사항']])]);
w = wipeImprove(sh);
ok('ok=true · n=0', w.ok === true && w.n === 0, JSON.stringify(w));
ok('아무것도 안 지웠다', CLEARED.length === 0, JSON.stringify(CLEARED));

console.log('\n' + (fail ? '★ 실패 ' + fail + '건 ★' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
