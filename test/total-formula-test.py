# -*- coding: utf-8 -*-
"""종합점수 — 「채워진 것부터 더해 간다」 (2026-09-16 담당자 결정)

★Code.gs 의 진짜 setTotalFormula·rateShown·impRate 를 잘라내서 돌린다★ (사본 아님).

무엇을 지키려고 만들었나 —
  종합 = QSC×0.6 + MS×0.3 + 개선율×0.1 인데, ★칸마다 대접이 다르다★:
      QSC 가 없으면   → 종합도 빈칸 (점검을 안 한 달)
      MS 가 없으면    → 0 으로 (아직 안 들어온 몫)
      개선율이 없으면  → 1 로 (지적이 없었던 매장 · 0으로 치면 잘한 매장이 손해)
  이 셋이 어긋나면 ①점검도 안 한 매장에 종합 10점이 뜨거나 ②지적 없던 매장이 10%를
  통째로 잃는다. 둘 다 실제로 밟을 뻔한 함정이다.

  ★2026-09-04 에는 정반대 규칙이었다★ — QSC·MS 둘 다 있어야 종합이 떴다(COUNT<2).
  그때 「사고」로 본 숫자(QSC 90점에 종합 54점)를 이제는 일부러 띄운다. 달라진 것은
  ①등급을 안 붙이고 ②매장이 배점을 안다는 것이다. ★COUNT 판정으로 되돌리지 말 것★.

★수식을 글자로 비교하지 않는다★ — 만들어진 수식을 실제로 ★계산해 본다★.
  글자 대조는 `IF(ISNUMBER(MS),MS,0)` 을 `IF(ISNUMBER(MS),0,MS)` 로 뒤집어 놔도 통과한다.
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / 'backend' / 'Code.gs'
NODE = Path(__file__).resolve().parents[2] / '_도구' / 'node' / 'node.exe'
OUT = Path(__file__).parent / 't_totalf.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

text = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = text.split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = '\n'.join([cut('setTotalFormula'), cut('rateShown'), cut('impRate'), cut('fixDashTotalRun')])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var L_QSC = ['QSC점수', '위생점수', '위생'];
var L_MS = ['MS점수', 'CS점수', 'CS'];
var L_TOT = ['종합점수', '종합'];
var L_RATE = ['개선율'];

/* 칸마다 다른 이름을 돌려주어, 만들어진 수식이 그대로 ★JS 식★이 되게 한다 */
var COLOF = { 'QSC점수': 1, 'MS점수': 2, '종합점수': 3, '개선율': 4 };
var NAMEOF = { 1: 'QSC', 2: 'MS', 3: 'TOT', 4: 'RATE' };

function labelMap(sh) { return sh; }
function labelValue(lm, names) {
  var key = names[0];
  var col = COLOF[key];
  return { found: col !== undefined, row: 1, col: col, v: lm[key], name: key };
}
function grid(sh, row, col) {
  return {
    getA1Notation: function () { return NAMEOF[col]; },
    setFormula: function (f) { sh.__f = f; },
  };
}

// ── 시트 함수를 JS 로 ──
function IF(c, a, b) { return c ? a : b; }
function NOT(x) { return !x; }
function ISNUMBER(x) { return typeof x === 'number'; }

/* 빈칸은 '' 로 담는다 — 시트의 빈 셀이 그렇게 읽힌다 */
function mk(o) {
  return {
    'QSC점수': (o.qsc === undefined) ? '' : o.qsc,
    'MS점수': (o.ms === undefined) ? '' : o.ms,
    '종합점수': '',
    '개선율': (o.rate === undefined) ? '' : o.rate,
  };
}
function calc(o) {
  var sh = mk(o);
  if (setTotalFormula(sh) !== true) return '★수식을 못 만들었다★';
  var f = String(sh.__f).replace(/^=/, '');
  var fn = new Function('QSC', 'MS', 'TOT', 'RATE', 'IF', 'NOT', 'ISNUMBER',
    'return (' + f + ');');
  var v = fn(sh['QSC점수'], sh['MS점수'], sh['종합점수'], sh['개선율'], IF, NOT, ISNUMBER);
  return (typeof v === 'number') ? Math.round(v * 10000) / 10000 : v;
}

// ══ 통합시트 쪽 가짜 세계 (fixDashTotalRun) ═══════════════════
var MONTH_COL = { 1: 5, 2: 12, 3: 19, 4: 28, 5: 35, 6: 42, 7: 51, 8: 58, 9: 65, 10: 74, 11: 81, 12: 88 };
var DASHBOARD_ID = 'FAKE', DASHBOARD_SHEET = '데이터';
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function colX(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
var CELLS = {};   // 시트에 지금 들어 있는 수식
var WROTE = {};   // 이번에 쓴 수식
var FAKESHEET = {
  getRange: function (row, col, nrow) {
    nrow = nrow || 1;
    return {
      getFormulas: function () {
        var out = [];
        for (var i = 0; i < nrow; i++) out.push([CELLS[colX(col) + (row + i)] || '']);
        return out;
      },
      setFormulas: function (vals) {
        for (var i = 0; i < nrow; i++) {
          var a = colX(col) + (row + i);
          CELLS[a] = vals[i][0]; WROTE[a] = vals[i][0];
        }
      },
    };
  },
};
var SpreadsheetApp = {
  openById: function () { return { getSheetByName: function () { return FAKESHEET; } }; },
  flush: function () { },
};
/* 통합시트 수식을 ★계산해 본다★ — 매장 파일 수식과 뜻이 같은지 대조하기 위해서다 */
function calcDash(a1, names, o) {
  var f = String(WROTE[a1]).replace(/^=/, '');
  var fn = new Function(names[0], names[1], names[2], 'IF', 'NOT', 'ISNUMBER', 'return (' + f + ');');
  var v = fn(o.qsc === undefined ? '' : o.qsc, o.ms === undefined ? '' : o.ms,
    o.rate === undefined ? '' : o.rate, IF, NOT, ISNUMBER);
  return (typeof v === 'number') ? Math.round(v * 10000) / 10000 : v;
}

var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}

console.log('── ★월중: QSC 만 들어왔다★ ──');
ok('[1-1] QSC 90 · MS 없음 · 개선율 100% → 64점', calc({ qsc: 0.9, rate: 1 }), 0.64);
ok('[1-2] 개선율 0% 면 54점 (아직 아무것도 개선 안 함)', calc({ qsc: 0.9, rate: 0 }), 0.54);
ok('[1-3] 개선 85% 면 62.5점', calc({ qsc: 0.9, rate: 0.85 }), 0.625);
ok('[1-4] ★개선율 칸이 비어도 만점으로 친다 (안전망)★', calc({ qsc: 0.9 }), 0.64);

console.log('── 말일 뒤: MS 까지 들어왔다 ──');
ok('[2-1] QSC 90 · MS 60 · 개선율 100% → 82점', calc({ qsc: 0.9, ms: 0.6, rate: 1 }), 0.82);
ok('[2-2] ★숫자는 올라가기만 한다★ 64 → 82', calc({ qsc: 0.9, ms: 0.6, rate: 1 }) > calc({ qsc: 0.9, rate: 1 }), true);
ok('[2-3] 셋 다 만점 → 100점', calc({ qsc: 1, ms: 1, rate: 1 }), 1);

console.log('── ★QSC 가 없으면 종합도 빈칸★ ──');
ok('[3-1] 아무것도 없다', calc({}), '');
ok('[3-2] ★점검 전인데 개선율이 비어도 10점이 붙지 않는다★', calc({ rate: undefined }), '');
ok('[3-3] MS 만 먼저 와도 빈칸 (점검을 안 했다)', calc({ ms: 0.9 }), '');

console.log('── 0점도 점수다 ──');
ok('[4-1] 셋 다 0 → 0점 (빈칸이 아니다)', calc({ qsc: 0, ms: 0, rate: 0 }), 0);
ok('[4-2] QSC 0 · MS 없음 · 개선율 100% → 10점', calc({ qsc: 0, rate: 1 }), 0.1);

console.log('── ★MS 를 0 으로, 개선율을 1 로 — 뒤바뀌지 않았는가★ ──');
/* 둘을 맞바꾼 수식이면 [5-1] 은 0.55(=0.54+0+0.01×…) 꼴로 어긋난다 */
ok('[5-1] MS 만 빠졌을 때와 개선율만 빠졌을 때가 다르다',
   calc({ qsc: 1, rate: 1 }) !== calc({ qsc: 1, ms: 1 }), true);
ok('[5-2] MS 만 빠지면 70점 (30점이 빈다)', calc({ qsc: 1, rate: 1 }), 0.7);
ok('[5-3] 개선율만 빠지면 100점 (10점을 만점으로 친다)', calc({ qsc: 1, ms: 1 }), 1);

console.log('── rateShown — 개선율 빈칸의 두 가지 뜻 ──');
function rs(o, rate) { return rateShown(mk(o), null, rate); }
ok('[6-1] 값이 있으면 그대로', rs({ qsc: 0.9 }, 0.85), 0.85);
ok('[6-2] ★0% 는 값이다 — 1 로 바꾸지 않는다★', rs({ qsc: 0.9 }, 0), 0);
ok('[6-3] 0건 + QSC 있음 → 100% (점검했고 지적이 없었다)', rs({ qsc: 0.9 }, null), 1);
ok('[6-4] ★0건 + QSC 없음 → 빈칸 (아직 점검 안 한 달)★', rs({}, null), null);
ok('[6-5] QSC 가 0점이어도 점검은 한 것이다', rs({ qsc: 0 }, null), 1);

console.log('── impRate — 분모는 발행 − 감점제외 ──');
function ir(recs) { return impRate(recs); }
var a = ir([{ state: '확정' }, { state: '완료(검수 전)' }, { state: '미조치' }, { state: '진행중', waive: true }]);
ok('[7-1] 발행 4 · 제외 1 · 분모 3 · 완료 2', [a.issued, a.waived, a.denom, a.done], [4, 1, 3, 2]);
ok('[7-2] 개선율 67%', a.rate, 0.67);
ok('[7-3] 발행 0건이면 null (rateShown 이 가른다)', ir([]).rate, null);
ok('[7-4] 전부 감점제외면 만점', ir([{ state: '미조치', waive: true }]).rate, 1);

console.log('── 통합시트 CA·CH·CO — ★열을 잘못 짚으면 조용히 틀린다★ ──');
var pv = fixDashTotalRun(false);
ok('[8-1] 미리보기는 ★아무것도 안 쓴다★', Object.keys(WROTE).length, 0);
ok('[8-2] 고칠 칸 102 (34행 × 3달)', pv.changed, 102);
var ap = fixDashTotalRun(true);
ok('[8-3] 쓴 칸 102 · 어긋난 칸 0 (다시 읽어 전수 대조)', [ap.wrote, ap.mismatch], [102, 0]);
ok('[8-4] 10월 종합은 ★CA★ 열 · 6~39행', [!!WROTE['CA6'], !!WROTE['CA39'], !!WROTE['CA40']], [true, true, false]);
ok('[8-5] 11월은 CH · 12월은 CO', [!!WROTE['CH6'], !!WROTE['CO6']], [true, true]);
ok('[8-6] ★10월이 보는 칸은 BV(QSC)·BX(MS)·BZ(개선)★',
   WROTE['CA6'], '=IF(NOT(ISNUMBER(BV6)),"",BV6*0.6+IF(ISNUMBER(BX6),BX6,0)*0.3+IF(ISNUMBER(BZ6),BZ6,1)*0.1)');
ok('[8-7] 11월은 CC·CE·CG', WROTE['CH6'].indexOf('CC6') > 0 && WROTE['CH6'].indexOf('CE6') > 0 && WROTE['CH6'].indexOf('CG6') > 0, true);
ok('[8-8] 12월은 CJ·CL·CN', WROTE['CO6'].indexOf('CJ6') > 0 && WROTE['CO6'].indexOf('CL6') > 0 && WROTE['CO6'].indexOf('CN6') > 0, true);
ok('[8-9] 39행은 행 번호가 따라간다', WROTE['CA39'].indexOf('BV39') > 0, true);
ok('[8-10] ★이미 맞는 칸은 다시 안 센다★ (두 번째 미리보기는 고칠 칸 0)', fixDashTotalRun(false).changed, 0);
ok('[8-11] 1~9월은 손대지 않는다', [!!WROTE['J6'], !!WROTE['AY6'], !!WROTE['BQ6']], [false, false, false]);

console.log('── ★세 곳이 갈라지지 않는가 — 매장 파일 수식과 통합시트 수식의 뜻이 같은가★ ──');
var CASES = [
  { qsc: 0.9, rate: 1 }, { qsc: 0.9, ms: 0.6, rate: 1 }, { qsc: 0.9, rate: 0 },
  { qsc: 1, ms: 1, rate: 1 }, { qsc: 0, ms: 0, rate: 0 }, { qsc: 0.9 }, {}, { ms: 0.9 },
];
var gaps = [];
for (var i = 0; i < CASES.length; i++) {
  var a = calc(CASES[i]);
  var b = calcDash('CA6', ['BV6', 'BX6', 'BZ6'], CASES[i]);
  if (JSON.stringify(a) !== JSON.stringify(b)) gaps.push(JSON.stringify(CASES[i]) + ' 매장 ' + a + ' ≠ 시트 ' + b);
}
ok('[9-1] ★8가지 경우 모두 같은 값★', gaps, []);

console.log('\n' + (fail ? '★' + fail + '개 실패★' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8', newline='\n')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout, end='')
if r.stderr:
    print(r.stderr, end='')
js_fail = r.returncode

# ── 소스 검사 — node 로는 볼 수 없는 것 ────────────────────────
print('── 소스 검사 ──')
src_fail = 0


def src_ok(name, cond):
    global src_fail
    if cond:
        print('  · %s' % name)
    else:
        src_fail += 1
        print('  ✗ %s' % name)


tot = cut('setTotalFormula')
src_ok('setTotalFormula 에 COUNT( 가 없다 (옛 규칙으로 되돌아가지 않았다)', 'COUNT(' not in tot)
fline = tot[tot.index('const f ='):]   # 주석을 빼고 ★수식을 짓는 줄만★ 본다
src_ok('setTotalFormula 가 ISNUMBER 로 칸마다 따로 본다 (QSC·MS·개선율)', fline.count('ISNUMBER') == 3)
src_ok('store.get 이 QSC·MS 둘 다 있을 때만 종합등급을 내보낸다',
       re.search(r"totalGrade:\s*\(typeof vHyg\.v === 'number' && typeof vCs\.v === 'number'\)", text) is not None)
src_ok('fillPeriod 의 partial 판정이 QSC·MS 유무를 본다',
       "else if (!(hasQ && hasC)) row.status = 'partial';" in text)
src_ok('partial 일 때 종합점수는 안 지우고 등급만 지운다',
       re.search(r"else if \(row\.status === 'partial'\) \{\s*\n\s*row\.grade = null;\s*\n\s*\}", text) is not None)
src_ok('rateShown 을 세 곳에서 쓴다 (시트 기록·화면·월 확정)', text.count('rateShown(') == 4)

try:
    OUT.unlink()
except OSError:
    pass

print('\n' + ('★소스 검사 %d개 실패★' % src_fail if src_fail else '소스 검사 통과'))
sys.exit(1 if (js_fail or src_fail) else 0)
