# -*- coding: utf-8 -*-
"""원본 탭 통일 (admin.tplTidy) 시험 (2026-09-16)

★Code.gs 의 진짜 tplTidyIn · TPL_END_ROW 를 잘라내서 돌린다★ (사본 아님).
이미 따로 시험이 있는 helper(goalBoxIn·dropGoalBox·upgradeMonthTab·impCols·tableEndRow)는
가짜로 끼우고, ★이번에 새로 쓴 판단만★ 본다.

보는 것:
  · D2 제목에서 달만 떼는가 («8월 QSC 현황» → «월 QSC 현황») · 달이 없으면 안 건드리는가
  · 표 끝을 가리키는 수식만 갈아 끼우는가 — 시작 행(12)·무관한 숫자는 그대로인가
  · ★줄이지 않는가★ (이미 47 이상이면 손대지 않는다 — 기록을 잃지 않기 위한 핵심 규칙)
  · 떠 있는 사진을 ★머리글 행부터★ 지우는가 (그 위 로고는 남기는가) · 닻을 못 읽으면 건너뛰는가
  · 옛 원본 탭은 ★지우지 않고★ 이름만 «(구) » 를 붙이는가 · 두 번 돌려도 안 겹치는가
  · 지금 쓰는 원본 탭(TPL_NEW)은 이름을 안 바꾸는가
  · ★미리보기가 아무것도 안 바꾸는가★
"""
import io, re, sys, subprocess
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_tpltidy.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

text = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = text.split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


body = cut('tplTidyIn')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 — helper 는 이미 각자 시험이 있다. 여기서는 tplTidyIn 의 판단만 본다 ══
var TPL_NEW = '0QSC현황(원본_2610~)';
var TPL_TAB_RE = /원본|개편안/;
var TPL_END_ROW = 47;
var SpreadsheetApp = { flush: function () {} };

function colLetter(n) { var s = ''; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

function mkSheet(o) {
  var sh = {
    _name: o.name, _title: o.title, _cells: o.cells || {}, _imgs: o.imgs || [],
    _end: o.end, _renamed: null, _goalGone: false, _upCalled: 0,
    getName: function () { return sh._name; },
    setName: function (n) { sh._renamed = n; sh._name = n; },
    getMaxColumns: function () { return 20; },
    getRange: function (r, c, nr, nc) { return mkRange(sh, r, c, nr, nc); },
    getImages: function () { return sh._imgs; },
  };
  return sh;
}
function key(r, c) { return r + ',' + c; }
function mkRange(sh, r, c, nr, nc) {
  return {
    getValue: function () { return (r === 2 && c === 4) ? sh._title : (sh._cells[key(r, c)] || ''); },
    setValue: function (v) { if (r === 2 && c === 4) sh._title = v; else sh._cells[key(r, c)] = v; },
    setFormula: function (f) { sh._cells[key(r, c)] = f; },
    getFormulas: function () {
      var out = [];
      for (var i = 0; i < nr; i++) {
        var row = [];
        for (var j = 0; j < nc; j++) {
          var v = sh._cells[key(r + i, c + j)] || '';
          row.push(String(v).charAt(0) === '=' ? v : '');
        }
        out.push(row);
      }
      return out;
    },
  };
}
function grid(sh, r, c, nr, nc) { return mkRange(sh, r, c, nr, nc); }
function impCols(sh) { return { ok: true, hr: 11, row0: 12 }; }
function tableEndRow(sh) {
  var f = sh._cells[key(5, 8)] || '';
  var m = String(f).match(/COUNTA\s*\(\s*[A-Z]+\d+\s*:\s*[A-Z]+(\d+)\s*\)/);
  return m ? Number(m[1]) : 0;
}
function goalBoxIn(sh) { return sh._goalGone ? null : { row: 2, col: 12, shown: sh._goalShown || ['2행: 차기 월 목표 | ', '3행: 위생 | '] }; }
function dropGoalBox(sh) { sh._goalGone = true; return { hit: true, a1: 'L2:M7' }; }
function upgradeMonthTab(sh) { sh._upCalled += 1; return { ok: true }; }

function mkSS(sheets) {
  return { getSheets: function () { return sheets; },
           getSheetByName: function (n) { for (var i = 0; i < sheets.length; i++) if (sheets[i].getName() === n) return sheets[i]; return null; } };
}

// ══ 채점 ═══════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(what, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + what); }
  else { fail++; console.log('  ✗ ' + what + '\n      받음: ' + g + '\n      기대: ' + w); }
}
function has(what, arr, frag) {
  var hit = arr.some(function (l) { return String(l).indexOf(frag) >= 0; });
  if (hit) { pass++; console.log('  ✓ ' + what); }
  else { fail++; console.log('  ✗ ' + what + '\n      «' + frag + '» 가 없음\n      받음: ' + JSON.stringify(arr)); }
}
function none(what, arr, frag) {
  var hit = arr.some(function (l) { return String(l).indexOf(frag) >= 0; });
  if (!hit) { pass++; console.log('  ✓ ' + what); }
  else { fail++; console.log('  ✗ ' + what + ' — «' + frag + '» 가 있으면 안 된다\n      받음: ' + JSON.stringify(arr)); }
}

function build(opt) {
  opt = opt || {};
  var end = opt.end == null ? 34 : opt.end;
  var cells = {};
  cells[key(5, 8)] = '=COUNTA(J12:J' + end + ')';
  cells[key(6, 8)] = '=COUNTIFS(M12:M' + end + ', "<>", N12:N' + end + ', "")';
  cells[key(7, 8)] = '=COUNTA(N12:N' + end + ')';
  cells[key(8, 8)] = '=H5-H6-H7';
  cells[key(9, 8)] = '=IFERROR(H7/H5, "")';
  var tpl = mkSheet({ name: TPL_NEW, title: opt.title == null ? '8월 QSC 현황' : opt.title,
                      cells: cells, imgs: opt.imgs || [] });
  var old1 = mkSheet({ name: 'QSC현황(원본)' });
  var old2 = mkSheet({ name: '개편안' });
  var mon  = mkSheet({ name: '2610' });
  var sum  = mkSheet({ name: '월별 QSC현황표' });
  return { ss: mkSS([sum, old1, old2, tpl, mon]), tpl: tpl, old1: old1, old2: old2, mon: mon, sum: sum };
}
function img(r, c, bad) {
  return { _r: r, _gone: false,
    getAnchorCell: function () { if (bad) throw new Error('못 읽음'); return { getRow: function () { return r; }, getColumn: function () { return c; } }; },
    remove: function () { this._gone = true; } };
}

console.log('── ① D2 제목 ──');
var w = build();
var L = tplTidyIn(w.ss, false);
has('미리보기가 «8월 QSC 현황» → «월 QSC 현황» 을 예고한다', L, '「8월 QSC 현황」 → 「월 QSC 현황」');
ok('★미리보기는 제목을 안 바꾼다★', w.tpl._title, '8월 QSC 현황');
w = build(); tplTidyIn(w.ss, true);
ok('적용하면 달만 떨어진다', w.tpl._title, '월 QSC 현황');
w = build({ title: '월 QSC 현황' }); tplTidyIn(w.ss, true);
ok('이미 깨끗하면 그대로', w.tpl._title, '월 QSC 현황');
w = build({ title: 'QSC 현황표' }); tplTidyIn(w.ss, true);
ok('달이 안 박힌 다른 제목은 안 건드린다', w.tpl._title, 'QSC 현황표');

console.log('── ② 표 길이 ──');
w = build({ end: 34 });
L = tplTidyIn(w.ss, false);
has('미리보기가 34 → 47 을 예고한다', L, '표 끝 34행 → 47행');
has('본문 줄 수도 함께 알린다', L, '본문 23줄 → 36줄');
ok('★미리보기는 수식을 안 바꾼다★', w.tpl._cells[key(5, 8)], '=COUNTA(J12:J34)');
w = build({ end: 34 }); tplTidyIn(w.ss, true);
ok('COUNTA 끝만 바뀐다 (시작 12 는 그대로)', w.tpl._cells[key(5, 8)], '=COUNTA(J12:J47)');
ok('COUNTIFS 는 끝이 둘 다 바뀐다', w.tpl._cells[key(6, 8)], '=COUNTIFS(M12:M47, "<>", N12:N47, "")');
ok('개선완료 칸도 바뀐다', w.tpl._cells[key(7, 8)], '=COUNTA(N12:N47)');
ok('★행 번호가 안 든 수식은 안 건드린다★', w.tpl._cells[key(8, 8)], '=H5-H6-H7');
ok('★IFERROR 도 그대로★', w.tpl._cells[key(9, 8)], '=IFERROR(H7/H5, "")');
ok('서식을 폈다 (upgradeMonthTab 1회)', w.tpl._upCalled, 1);
w = build({ end: 47 }); L = tplTidyIn(w.ss, true);
has('이미 47이면 그냥 넘어간다', L, '이미 맞습니다');
ok('그때는 서식을 다시 펴지 않는다', w.tpl._upCalled, 0);
w = build({ end: 60 }); L = tplTidyIn(w.ss, true);
has('★47보다 길면 줄이지 않는다★', L, '줄이지 않습니다');
ok('60짜리 수식은 손대지 않는다', w.tpl._cells[key(5, 8)], '=COUNTA(J12:J60)');

console.log('── ③ 떠 있는 사진 ──');
var top = img(3, 1), hdr = img(11, 15), bodyI = img(14, 15), bad = img(20, 15, true);
w = build({ imgs: [top, hdr, bodyI, bad] });
L = tplTidyIn(w.ss, false);
has('미리보기가 지울 사진 자리를 보여 준다', L, 'O11, O14');
ok('★미리보기는 안 지운다★', [top._gone, hdr._gone, bodyI._gone], [false, false, false]);
top = img(3, 1); hdr = img(11, 15); bodyI = img(14, 15); bad = img(20, 15, true);
w = build({ imgs: [top, hdr, bodyI, bad] }); tplTidyIn(w.ss, true);
ok('★머리글 위 그림(3행)은 남긴다★', top._gone, false);
ok('머리글 행(11)에 닻을 내린 사진도 지운다', hdr._gone, true);
ok('본문 사진도 지운다', bodyI._gone, true);
ok('★닻을 못 읽는 그림은 건드리지 않는다★', bad._gone, false);
w = build({ imgs: [] }); L = tplTidyIn(w.ss, true);
has('사진이 없으면 그렇게 적는다', L, '떠 있는 사진 없음');

console.log('── ④ 차기 월 목표 ──');
w = build(); L = tplTidyIn(w.ss, false);
ok('★미리보기는 안 지운다★', w.tpl._goalGone, false);
w = build(); w.tpl._goalShown = ['2행: 차기 월 목표 | ', '3행: 위생 | 소비기한 관리'];
L = tplTidyIn(w.ss, false);
has('안에 글이 있으면 그 사실을 크게 알린다', L, '안에 적힌 글 1줄이 함께 지워집니다');
w = build(); tplTidyIn(w.ss, true);
ok('적용하면 걷어낸다', w.tpl._goalGone, true);

console.log('── ⑤ 옛 원본 탭 이름 ──');
w = build(); L = tplTidyIn(w.ss, false);
has('미리보기가 옛 탭 이름 바꾸기를 예고한다', L, '「QSC현황(원본)」 → 「(구) QSC현황(원본)」');
has('개편안도 대상이다', L, '「개편안」 → 「(구) 개편안」');
ok('★미리보기는 이름을 안 바꾼다★', [w.old1.getName(), w.old2.getName()], ['QSC현황(원본)', '개편안']);
w = build(); tplTidyIn(w.ss, true);
ok('적용하면 (구) 가 붙는다', [w.old1.getName(), w.old2.getName()], ['(구) QSC현황(원본)', '(구) 개편안']);
ok('★지금 쓰는 원본은 이름이 그대로★', w.tpl.getName(), TPL_NEW);
ok('★월 탭·요약 탭은 안 건드린다★', [w.mon._renamed, w.sum._renamed], [null, null]);
var again = tplTidyIn(w.ss, true);
none('★두 번 돌려도 (구) 가 겹치지 않는다★', again, '(구) (구)');

console.log('── ⑥ 원본 탭이 없을 때 ──');
var only = mkSheet({ name: 'QSC현황(원본)' });
L = tplTidyIn(mkSS([only]), false);
has('원본이 없으면 그렇게 알린다', L, '탭이 없습니다');
has('그래도 옛 탭 이름은 예고한다', L, '「QSC현황(원본)」 → 「(구) QSC현황(원본)」');

console.log('\n통과 ' + pass + ' · 실패 ' + fail);
if (fail) process.exit(1);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout or '')
if r.stderr:
    print(r.stderr)

# ── 소스 자체를 보는 검사 (가짜 세계가 못 잡는 것) ──────────────────────
sp, sf = 0, 0


def src_ok(what, cond):
    global sp, sf
    if cond:
        sp += 1
        print('  ✓ %s' % what)
    else:
        sf += 1
        print('  ✗ %s' % what)


print('── 소스 검사 ──')
src_ok('표 끝은 47행(본문 36줄) 하나로만 정해져 있다', 'const TPL_END_ROW = 47;' in text)
src_ok('등록표에 admin.tplTidy 가 쓰기로 올라 있다',
       "'admin.tplTidy':" in text and "fn: fnTplTidy" in text)
src_ok('등록표에 admin.tplProbe 가 ★읽기★ 로 올라 있다',
       bool(re.search(r"'admin\.tplProbe':\s*\{ menu: ADMIN_MENU, act: '읽기'", text)))
src_ok('기본이 미리보기다 (apply === true 일 때만 바꾼다)',
       "const apply = p.apply === true;" in text.split('function fnTplTidy')[1][:400])
src_ok('적용했을 때만 감사로그를 남긴다',
       "if (apply) auditLog(ctx, 'admin.tplTidy'" in text)
src_ok('★범위째 setFormulas() 를 쓰지 않는다★ (수식 없는 칸이 지워진다 · 주석은 세지 않는다)',
       'setFormulas(' not in text.split('function tplTidyIn')[1].split('\nfunction ')[0])
src_ok('차기 월 목표는 dropGoalBox 하나만 부른다 (두 벌로 만들지 않았다)',
       text.split('function tplTidyIn')[1].split('\nfunction ')[0].count('dropGoalBox(') == 1)

print('\n소스 검사 통과 %d · 실패 %d' % (sp, sf))
try:
    OUT.unlink()
except OSError:
    pass
sys.exit(1 if (r.returncode or sf) else 0)
