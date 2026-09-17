# -*- coding: utf-8 -*-
"""MS_상세 — 쇼퍼_응답 + 쇼퍼_비고 를 한 시트로 합쳤다 (2026-09-08)

★Code.gs 의 진짜 함수를 잘라내서 돌린다★ (사본 아님).

담당자 결정: *"쇼퍼_비고랑 쇼퍼_응답을 합쳐서 구조도 QSC_상세처럼 바꾸라는 소리"*

무엇을 막으려고 만들었나 —
  합치면 ★한 제출이 38줄★이 된다. 그래서 「회차를 세는 곳」이 전부 38배로 틀어질 수 있다.
  그중 shopperMonthAvg 는 ★MS 점수★를 내는 함수이고 그 점수는 종합점수의 30%다.
  오류 없이 숫자만 틀리는 종류라 시험으로 굳혀 둔다.

보는 것:
  · 한 제출이 38줄이어도 ★한 건으로★ 세는가 (제출시각으로 묶기)
  · 제출이 둘이면 ★가장 최근 제출(제출시각) 1건★의 점수인가 — 2026-09-17 담당자 결정으로 평균에서 바뀜
    (시트 순서가 뒤집혀 있어도 제출시각으로 고르는가 · 같은 시각이면 위쪽 줄 · 제출시각 없는 옛 줄보다 있는 줄)
  · ★앞에서부터★ 읽는가 — MS_상세는 최신이 맨 위다. 뒤에서 읽으면 옛 자료를 본다
  · 다른 매장·다른 달이 섞이지 않는가
  · 문항 환산 규칙이 앱(scoring.js)과 같은가 — 예=1 · 아니오=0 · 1~5→(n-1)/4
  · 코드(1-1)를 문항 텍스트에서 바르게 뽑는가
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_msdetail.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cutconst(name):
    """const NAME = ... ; 를 통째로 (여러 줄 허용)"""
    st = next(i for i, l in enumerate(lines) if l.startswith('const %s ' % name))
    buf = []
    for j in range(st, len(lines)):
        buf.append(lines[j])
        if lines[j].rstrip().endswith(';'):
            break
    return '\n'.join(buf)


def cutcall(mark):
    """호출문 한 덩어리를 잘라낸다 — 세미콜론까지만 (뒤의 catch 를 물면 문법이 깨진다)"""
    st = next(i for i, l in enumerate(lines) if mark in l)
    buf = []
    for j in range(st, len(lines)):
        buf.append(lines[j])
        if lines[j].rstrip().endswith(';'):
            return '\n'.join(buf)
    raise SystemExit('%s 끝 못 찾음' % mark)


body = '\n'.join([cutconst('MS_DETAIL'), cutconst('MS_HEADER'), cutconst('MS_COL'),
                  cut('msCodeOf'), cut('msConvert'), cut('msKindOf'),
                  cut('msMonthPick'), cut('shopperMonthAvg'), cut('submittedStores'), cut('stampOf')])
# status.month 가 MS_상세를 부르는 자리 — 인자를 그대로 시험에 넘긴다
CALLSITE = cutcall('shopperSet = submittedStores(')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
function normStore(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function ymOfCell(v, tz) { return String(v == null ? '' : v).slice(0, 7); }
if (typeof dateOfCell !== 'function') { globalThis.dateOfCell = function (v) { return String(v == null ? '' : v).slice(0, 10); }; }
if (typeof timeKeyOf !== 'function') { globalThis.timeKeyOf = function (v) { return String(v == null ? '' : v).trim(); }; }
function grid(sh, r, c, nr, nc) {
  if (nr <= 0) return null;
  return {
    getValues: function () { return sh._rows.slice(r - 2, r - 2 + nr); },
    getNumColumns: function () { return nc; },
    _from: r,                       // 시험이 「어디서부터 읽었나」를 본다
  };
}
function mkSheet(rows) {
  return { _rows: rows, getLastRow: function () { return rows.length + 1; } };
}
/* MS_상세 한 줄 만들기 — 자리는 MS_COL 을 따른다 */
function row(o) {
  const a = new Array(MS_COL.order).fill('');
  a[MS_COL.date - 1] = o.date;
  a[MS_COL.time - 1] = o.time || '';
  a[MS_COL.store - 1] = o.store;
  a[MS_COL.no - 1] = o.no;
  a[MS_COL.answer - 1] = o.answer == null ? '' : o.answer;
  a[MS_COL.at - 1] = o.at;
  a[MS_COL.total - 1] = o.total;
  return a;
}
/* 한 제출 = 38줄 */
function submit(o) {
  const out = [];
  for (let i = 1; i <= 38; i++) out.push(row({ date: o.date, time: o.time, store: o.store,
    no: i, answer: '예', at: o.at, total: o.total }));
  return out;
}

var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}
function near(name, got, want) {
  if (typeof got === 'number' && Math.abs(got - want) < 1e-9) pass++;
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + got + '\n      바란 값 ' + want); }
}

console.log('── 한 제출이 38줄이어도 한 건이다 ──');
var sh = mkSheet(submit({ date: '2026-10-05', store: '금종제과', at: '2026-10-05 10:00', total: 90 }));
near('[1-1] 38줄짜리 제출 하나 → 90점', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 90);

console.log('── 제출이 둘이면 가장 최근 제출 1건 (2026-09-17 담당자 결정 — 평균 아님) ──');
// 실제 시트처럼 최신이 맨 위
sh = mkSheet(submit({ date: '2026-10-20', store: '금종제과', at: '2026-10-20 15:00', total: 70 })
  .concat(submit({ date: '2026-10-05', store: '금종제과', at: '2026-10-05 10:00', total: 90 })));
near('[2-1] 10-05 90 · 10-20 70 → 최근 것 70 (평균 80 아님)', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 70);
ok('[2-2] ★줄 수(76)에 끌려가지 않는다★', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul') === 70, true);
// 시트 순서가 뒤집혀 있어도(옛 것이 위) 제출시각으로 고른다
sh = mkSheet(submit({ date: '2026-10-05', store: '금종제과', at: '2026-10-05 10:00', total: 90 })
  .concat(submit({ date: '2026-10-20', store: '금종제과', at: '2026-10-20 15:00', total: 70 })));
near('[2-3] ★시트 순서가 뒤집혀도 제출시각이 늦은 70★', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 70);
// 방문날짜보다 제출시각 — 늦게 제출한 쪽이 최신이다
sh = mkSheet(submit({ date: '2026-10-25', store: '금종제과', at: '2026-10-26 09:00', total: 60 })
  .concat(submit({ date: '2026-10-10', store: '금종제과', at: '2026-10-28 09:00', total: 95 })));
near('[2-4] 방문은 10-10 이어도 10-28 에 제출했으면 그것이 최근 → 95', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 95);
// 고객 설문 2건(12월 베타 부산역·신라당 경주와 같은 모양) — 경로를 가리지 않는다
sh = mkSheet(submit({ date: '2026-12-01', store: '신라당 경주', at: '2026-09-16T06:30:00', total: 86.2 })
  .concat(submit({ date: '2026-12-01', store: '신라당 경주', at: '2026-09-16T05:10:00', total: 89.5 })));
near('[2-5] 같은 날 두 건 — 제출시각이 늦은 86.2', shopperMonthAvg(sh, '신라당 경주', '2026-12-01', 'Asia/Seoul'), 86.2);

console.log('── 같은 시각·제출시각 없는 옛 줄 ──');
sh = mkSheet(submit({ date: '2026-10-25', store: '금종제과', at: '2026-10-25 10:00', total: 100 })
  .concat(submit({ date: '2026-10-25', store: '금종제과', at: '2026-10-25 10:00', total: 60 })));
near('[3-1] 제출시각이 같으면 위쪽(나중에 들어온) 줄 → 100', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 100);
sh = mkSheet(submit({ date: '2026-10-25', store: '금종제과', at: '', total: 55 })
  .concat(submit({ date: '2026-10-02', store: '금종제과', at: '2026-10-02 09:00', total: 88 })));
near('[3-2] 제출시각 없는 옛 줄보다 제출시각 있는 줄 → 88', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 88);

console.log('── 남의 매장·다른 달은 안 센다 ──');
sh = mkSheet(submit({ date: '2026-10-05', store: '금종제과', at: '2026-10-05 10:00', total: 90 })
  .concat(submit({ date: '2026-10-05', store: '도넛정수', at: '2026-10-29 10:00', total: 10 }))
  .concat(submit({ date: '2026-09-30', store: '금종제과', at: '2026-10-30 10:00', total: 10 })));
near('[4-1] 내 매장·그 달만 → 90', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 90);
near('[4-2] 다른 매장도 제 것만 → 10', shopperMonthAvg(sh, '도넛정수', '2026-10-01', 'Asia/Seoul'), 10);
near('[4-3] 지난 달 → 10', shopperMonthAvg(sh, '금종제과', '2026-09-01', 'Asia/Seoul'), 10);

console.log('── 자료가 없으면 0 ──');
ok('[5-1] 빈 시트', shopperMonthAvg(mkSheet([]), '금종제과', '2026-10-01', 'Asia/Seoul'), 0);
ok('[5-2] 그 달에 없음', shopperMonthAvg(
  mkSheet(submit({ date: '2026-08-05', store: '금종제과', at: 'A', total: 90 })),
  '금종제과', '2026-10-01', 'Asia/Seoul'), 0);

console.log('── 점수가 숫자가 아닌 줄은 건너뛴다 ──');
sh = mkSheet(submit({ date: '2026-10-05', store: '금종제과', at: 'A', total: '' })
  .concat(submit({ date: '2026-10-06', store: '금종제과', at: 'B', total: 80 })));
near('[6-1] 빈 점수는 빼고 80', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 80);

console.log('── 제출시각이 둘 다 비면(옛 줄) 위쪽 줄 ──');
sh = mkSheet(submit({ date: '2026-10-05', time: '11:00', store: '금종제과', at: '', total: 90 })
  .concat(submit({ date: '2026-10-05', time: '15:00', store: '금종제과', at: '', total: 70 })));
near('[7-1] 제출시각이 없으면 시트 위쪽(나중에 들어온) 줄 90 — 평균(80) 아님', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 90);

console.log('── 문항 환산 (앱 scoring.js 와 같은 규칙) ──');
ok('[8-1] 예 = 1', msConvert('예'), 1);
ok('[8-2] 아니오 = 0', msConvert('아니오'), 0);
ok('[8-3] 1점 = 0', msConvert(1), 0);
ok('[8-4] 3점 = 0.5', msConvert(3), 0.5);
ok('[8-5] 5점 = 1', msConvert(5), 1);
ok('[8-6] 무응답 = null', msConvert(''), null);
ok('[8-7] 범위 밖 = null', msConvert(9), null);

console.log('── 코드 뽑기 (QSC 의 A-01 자리) ──');
ok('[9-1] 1-1', msCodeOf('1-1. 매장 입장시 직원이 인사말을 건넸나요?'), '1-1');
ok('[9-2] 13-2', msCodeOf('13-2. 재방문 의향이 있나요?'), '13-2');
ok('[9-3] 공백이 있어도', msCodeOf(' 2 - 3 . 어쩌고'), '2-3');
ok('[9-4] 없으면 빈칸', msCodeOf('코드가 없는 문항'), '');
ok('[9-5] 빈 값', msCodeOf(''), '');

console.log('── 유형 이름 ──');
ok('[10-1] yn', msKindOf('yn'), '예/아니오');
ok('[10-2] 척도', msKindOf('1-5'), '5점 척도');
ok('[10-3] 없으면 빈칸', msKindOf(''), '');

console.log('── 열 자리가 QSC_상세와 맞는가 ──');
ok('[11-1] 1 방문날짜', MS_COL.date, 1);
ok('[11-2] 3 매장명', MS_COL.store, 3);
ok('[11-3] 4 코드', MS_COL.code, 4);
ok('[11-4] 5 문항번호', MS_COL.no, 5);
ok('[11-5] 6 문항', MS_COL.text, 6);
ok('[11-6] 7 응답 · 8 점수 · 9 비고', [MS_COL.answer, MS_COL.score, MS_COL.memo], [7, 8, 9]);
ok('[11-7] 머리글 17개', MS_HEADER.length, 17);
/* ★2026-09-08 추가한 열★ — 「일부만 키오스크」 매장에서 손님이 고른 주문 방법.
   그 매장은 이 값에 따라 3-1·3-2 를 빼므로, 시트에 남아 있어야 한 매장의
   키오스크 비율이 이상할 때 담당자가 눈으로 잡을 수 있다. */
ok('[11-10] 17열이 주문방법', [MS_COL.way, MS_HEADER[MS_COL.way - 1]], [17, '주문방법']);
/* ★2026-09-08 담당자 지시로 뺀 열★ — 구분·유형·상태, 그리고 늘 빈 칸이던 사진·NA사유.
   다시 넣자는 말이 나오면 「빈 칸이 많다」는 지적이 있었다는 것을 먼저 떠올릴 것. */
ok('[11-8] 없앤 열이 머리글에 없다',
   MS_HEADER.filter(function (h) {
     return ['구분', '유형', '상태', '사진', 'NA사유'].indexOf(h) >= 0;
   }), []);
ok('[11-9] 제출 단위는 10열부터', MS_COL.at, 10);

console.log('── ★submittedStores — 「그 달에 MS 를 냈는가」★ ──');
/* ★2026-09-08 전수검사에서 잡은 진짜 버그★
   MS_COL 은 1부터인데 submittedStores 는 0부터 센다. -1 을 빼먹어서
   ★날짜 자리에서 「11:00」을, 매장 자리에서 「1-1」을★ 읽었고, 그래서 언제나 빈 집합이었다.
   즉 「그 달에 MS 를 안 낸 매장」이 늘 26곳 전부로 나왔다 — 오류 없이 답만 틀리는 종류다.
   그리고 MS_상세는 msPrepend 로 ★최신이 맨 위★라 끝에서 읽으면 옛 자료를 본다. */
var msSh = mkSheet(submit({ date: '2026-10-05', time: '11:00', store: '금종제과', at: 'A', total: 90 })
  .concat(submit({ date: '2026-10-06', time: '15:00', store: '도넛정수', at: 'B', total: 80 }))
  .concat(submit({ date: '2026-09-20', time: '09:00', store: '제주당', at: 'C', total: 70 })));
var got = callSite(msSh, 'Asia/Seoul', '2026-10');
ok('[12-1] ★그 달에 낸 매장이 잡힌다★ (종전에는 언제나 빈 집합이었다)',
   Object.keys(got).sort(), ['금종제과', '도넛정수']);
ok('[12-2] 지난 달 제출은 안 잡는다', got['제주당'] === undefined, true);
ok('[12-3] 9월로 물으면 9월 것만',
   Object.keys(callSite(msSh, 'Asia/Seoul', '2026-09')), ['제주당']);
ok('[12-4] 그 달에 아무도 안 냈으면 빈 집합',
   Object.keys(callSite(msSh, 'Asia/Seoul', '2026-12')), []);

/* ★최신이 맨 위★ — 앞에서부터 읽어야 새 제출이 잡힌다.
   시트를 크게 만들어(스캔 한도 밖) 뒤에서 읽으면 못 찾게 해 둔다. */
var big = submit({ date: '2026-10-25', time: '11:00', store: '신라당 경주', at: 'NEW', total: 95 });
for (var b = 0; b < 90; b++) {
  big = big.concat(submit({ date: '2026-01-05', time: '11:00', store: '옛매장' + b, at: 'OLD' + b, total: 50 }));
}
ok('[12-5] ★맨 위의 새 제출이 잡힌다★ (뒤에서 읽으면 옛 자료만 본다)',
   callSite(mkSheet(big), 'Asia/Seoul', '2026-10')['신라당 경주'], true);

ok('[12-6] 빈 시트', Object.keys(callSite(mkSheet([]), 'Asia/Seoul', '2026-10')), []);

console.log('\n' + (fail ? '★' + fail + '개 실패★' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

# ★진짜 호출문을 그대로 끼운다★ — 인자를 시험이 다시 쓰면 「시험만 맞는」 상태가 된다
HARNESS = HARNESS.replace(
    "console.log('── ★submittedStores",
    '''/* Code.gs 의 진짜 호출문을 그대로 쓴다 — 인자를 시험이 베껴 쓰면
   본체가 틀려도 시험은 통과하는 「시험만 맞는」 상태가 된다 */
function callSite(sheetObj, tz, wantYm) {
  var ss = { getSheetByName: function () { return sheetObj; } };
  var shopperSet;
%s
  return shopperSet;
}
console.log('── ★submittedStores''' % CALLSITE.replace('\\', '\\\\'))

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(body + '\n' + HARNESS)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout or '', end='')
if r.stderr:
    print(r.stderr)
OUT.unlink(missing_ok=True)
sys.exit(r.returncode)
