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
  · 제출이 둘이면 두 점수의 ★단순 평균★인가 (줄 수에 끌려가지 않는가)
  · ★앞에서부터★ 읽는가 — MS_상세는 최신이 맨 위다. 뒤에서 읽으면 옛 자료를 본다
  · 다른 매장·다른 달이 섞이지 않는가
  · 문항 환산 규칙이 앱(scoring.js)과 같은가 — 예=1 · 아니오=0 · 1~5→(n-1)/4
  · 코드(1-1)를 문항 텍스트에서 바르게 뽑는가
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
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


body = '\n'.join([cutconst('MS_DETAIL'), cutconst('MS_HEADER'), cutconst('MS_COL'),
                  cut('msCodeOf'), cut('msConvert'), cut('msKindOf'),
                  cut('shopperMonthAvg')])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
function normStore(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function ymOfCell(v, tz) { return String(v == null ? '' : v).slice(0, 7); }
function grid(sh, r, c, nr, nc) {
  if (nr <= 0) return null;
  return { getValues: function () { return sh._rows.slice(r - 2, r - 2 + nr); } };
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
var sh = mkSheet(submit({ date: '2026-10-05', store: '금종제과', at: 'A', total: 90 }));
near('[1-1] 38줄짜리 제출 하나 → 90점', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 90);

console.log('── 제출이 둘이면 두 점수의 평균 ──');
sh = mkSheet(submit({ date: '2026-10-05', store: '금종제과', at: 'A', total: 90 })
  .concat(submit({ date: '2026-10-20', store: '금종제과', at: 'B', total: 70 })));
near('[2-1] 90 과 70 의 평균은 80', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 80);
ok('[2-2] ★줄 수(76)에 끌려가지 않는다★', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul') === 80, true);

console.log('── 최신이 맨 위 — 앞에서부터 읽는다 ──');
// 새 제출(위) + 옛 제출(아래). 뒤에서 읽으면 옛 것만 보게 된다
sh = mkSheet(submit({ date: '2026-10-25', store: '금종제과', at: 'NEW', total: 100 })
  .concat(submit({ date: '2026-10-01', store: '금종제과', at: 'OLD', total: 60 })));
near('[3-1] 둘 다 세어 80', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 80);

console.log('── 남의 매장·다른 달은 안 센다 ──');
sh = mkSheet(submit({ date: '2026-10-05', store: '금종제과', at: 'A', total: 90 })
  .concat(submit({ date: '2026-10-05', store: '도넛정수', at: 'B', total: 10 }))
  .concat(submit({ date: '2026-09-30', store: '금종제과', at: 'C', total: 10 })));
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

console.log('── 제출시각이 비어도 뭉개지지 않는다 ──');
sh = mkSheet(submit({ date: '2026-10-05', time: '11:00', store: '금종제과', at: '', total: 90 })
  .concat(submit({ date: '2026-10-05', time: '15:00', store: '금종제과', at: '', total: 70 })));
near('[7-1] 시각·점수로 갈라 평균 80', shopperMonthAvg(sh, '금종제과', '2026-10-01', 'Asia/Seoul'), 80);

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

console.log('\n' + (fail ? '★' + fail + '개 실패★' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(body + '\n' + HARNESS)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout or '', end='')
if r.stderr:
    print(r.stderr)
OUT.unlink(missing_ok=True)
sys.exit(r.returncode)
