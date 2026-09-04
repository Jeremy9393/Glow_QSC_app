# -*- coding: utf-8 -*-
"""쇼퍼 총평 — 옛 '영수증' 열 자리를 물려받는지 (2026-09-04)

★Code.gs 의 진짜 saveShopper 를 잘라내서 돌린다★ (사본 아님).

★왜 이 시험이 필요한가★ — `sheet()` 는 시트가 없을 때만 머리글을 쓴다. 이미 만들어진
`쇼퍼_응답` 시트에 열을 하나 더 보내면 열이 생기는 게 아니라 ★Q1부터 통째로 한 칸씩 밀린다★.
2026-08-20 영수증 열을 없앴을 때 실제로 그랬다. 그래서 총평은 새 열을 만들지 않고
남아 있는 '영수증' 열 자리를 이름만 바꿔 쓴다. 그 물려받기가 정말 되는지, 그리고
어떤 경우에도 답이 밀리지 않는지를 본다.
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_overall.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = cut('saveShopper')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var SHEETS = {};           // 이름 -> {head:[], rows:[[]]}
var DASHBOARD_ID = '';     // 통합시트·매장 파일 경로는 이 시험 밖이다

function safeRow(r) { return r; }
function round1(n) { return Math.round(n * 10) / 10; }
function appendRows(sh, rows) { rows.forEach(function (r) { sh.appendRow(r); }); }
function dropStoreCache() {}
function dropDashCache() {}
function shopperMonthAvg() { return null; }
function writeStoreShopper() { return { ok: true }; }
function dashRowFor() { return null; }
function nowIso() { return '2026-09-04T00:00:00Z'; }
function ssTz() { return 'Asia/Seoul'; }
function yymm(d) { return d.slice(2, 4) + d.slice(5, 7); }
var Utilities = { formatDate: function () { return '2026-09-04'; } };
var Logger = { log: function () {} };

function mkSheet(name, head) {
  var s = {
    _name: name, _head: head.slice(), _rows: [],
    getLastColumn: function () { return s._head.length; },
    getLastRow: function () { return s._rows.length + 1; },
    setFrozenRows: function () {},
    appendRow: function (r) { s._rows.push(r.slice()); },
    getRange: function (r, c, nr, nc) {
      return {
        getValues: function () {
          if (r === 1) return [s._head.slice(c - 1, c - 1 + (nc || s._head.length))];
          return [[]];
        },
        setValue: function (v) { if (r === 1) s._head[c - 1] = v; },
      };
    },
  };
  SHEETS[name] = s;
  return s;
}
function sheet(ss, name, headers) {          // ★진짜와 같은 규칙: 없을 때만 머리글을 쓴다★
  if (!SHEETS[name]) mkSheet(name, headers);
  return SHEETS[name];
}
var FAKE_SS = { getSheetByName: function (n) { return SHEETS[n] || null; } };

var OLD_HEAD = ['제출시각','방문날짜','방문시간','매장명','응대직원설명','주문내역',
                '작성자연령대성별','입력경로','점수','응답수','영수증'];
function qcols(n) { var a = []; for (var i = 1; i <= n; i++) a.push('Q' + i); return a; }
function mkPayload(overall, nQ) {
  var ans = [];
  for (var i = 1; i <= (nQ || 3); i++) ans.push({ no: i, text: i + '-1. 문항', answer: '예', memo: '' });
  return { submittedAt: 'T', date: '2026-09-03', time: '13:00', store: '금종제과',
           staff: '홀 직원', order: '아메리카노', demographic: '30대 여성',
           overall: overall, answers: ans, result: { score: 88, answered: ans.length } };
}

// ══ 시험틀 ═══════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      나온 것: ' + g + '\n      바란 것: ' + w); }
}
function run(sheetHead, overall, nQ) {
  SHEETS = {};
  if (sheetHead) mkSheet('쇼퍼_응답', sheetHead);
  saveShopper(FAKE_SS, mkPayload(overall, nQ), { id: 'u1' }, false);
  return SHEETS['쇼퍼_응답'];
}
function at(sh, col) { return sh._rows[0][sh._head.indexOf(col)]; }

// ── ① 옛 시트: '영수증' 자리를 물려받는다 ────────────────────
console.log('\n① 이미 있는 시트 — 영수증 열이 남아 있다');
var sh = run(OLD_HEAD.concat(qcols(3)), '전반적으로 친절했습니다', 3);
ok('머리글이 총평으로 바뀐다', sh._head[10], '총평');
ok('영수증이라는 이름은 사라진다', sh._head.indexOf('영수증'), -1);
ok('총평이 그 칸에 들어간다', at(sh, '총평'), '전반적으로 친절했습니다');
ok('★답이 밀리지 않는다★', [at(sh, 'Q1'), at(sh, 'Q2'), at(sh, 'Q3')], ['예', '예', '예']);
ok('앞쪽 칸도 그대로', [at(sh, '매장명'), at(sh, '점수')], ['금종제과', 88]);
ok('열 수와 값 수가 같다', sh._rows[0].length, sh._head.length);

// ── ② 두 번째 제출도 같은 자리 ──────────────────────────────
saveShopper(FAKE_SS, mkPayload('두 번째', 3), { id: 'u1' }, false);
ok('두 번째도 총평 칸에', SHEETS['쇼퍼_응답']._rows[1][10], '두 번째');
ok('두 번째도 안 밀린다', SHEETS['쇼퍼_응답']._rows[1].slice(11), ['예', '예', '예']);

// ── ③ 새로 만들어지는 시트 ──────────────────────────────────
console.log('\n② 시트가 아예 없을 때 — 새로 만든다');
sh = run(null, '새 시트 총평', 3);
ok('머리글에 총평이 있다', sh._head.indexOf('총평') >= 0, true);
ok('총평이 제자리에', at(sh, '총평'), '새 시트 총평');
ok('★답이 밀리지 않는다★', [at(sh, 'Q1'), at(sh, 'Q3')], ['예', '예']);

// ── ④ 이미 총평 열이 있는 시트 (두 번째 배포 이후) ───────────
console.log('\n③ 이미 총평 열이 있는 시트');
var NEW_HEAD = OLD_HEAD.slice(0, 10).concat(['총평']).concat(qcols(3));
sh = run(NEW_HEAD, '또 냈다', 3);
ok('이름을 다시 바꾸지 않는다', sh._head[10], '총평');
ok('총평이 그 칸에', at(sh, '총평'), '또 냈다');
ok('답 그대로', [at(sh, 'Q1'), at(sh, 'Q2')], ['예', '예']);

// ── ④-2 머리글이 비어 있을 때 (사람이 지운 경우) ─────────────
console.log('\n③-2 11번째 머리글이 비어 있을 때 — 이름을 스스로 채운다');
var BLANK_HEAD = OLD_HEAD.slice(0, 10).concat(['']).concat(qcols(3));
sh = run(BLANK_HEAD, '이름이 없어도', 3);
ok('★비어 있던 머리글에 총평을 적는다★', sh._head[10], '총평');
ok('총평이 그 칸에', at(sh, '총평'), '이름이 없어도');
ok('★답이 밀리지 않는다★', [at(sh, 'Q1'), at(sh, 'Q2'), at(sh, 'Q3')], ['예', '예', '예']);

// ── ⑤ 총평을 안 적었을 때 ───────────────────────────────────
console.log('\n④ 총평이 비었을 때 (선택 칸이라 흔하다)');
sh = run(OLD_HEAD.concat(qcols(3)), '', 3);
ok('빈칸이 들어간다', at(sh, '총평'), '');
ok('★그래도 안 밀린다★', [at(sh, 'Q1'), at(sh, 'Q2'), at(sh, 'Q3')], ['예', '예', '예']);

console.log('\n' + (fail ? '✗ ' + fail + '개 실패 · ' : '✓ 전부 통과 · ') + pass + '개 통과');
process.exit(fail ? 1 : 0);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:2500])
OUT.unlink(missing_ok=True)
sys.exit(r.returncode)
