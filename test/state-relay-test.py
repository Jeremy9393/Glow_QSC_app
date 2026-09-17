# -*- coding: utf-8 -*-
"""상태 칸 수식만 다시 깔기 (store.upgrade {formulaOnly:true}) 시험 (2026-09-17)

★Code.gs 의 진짜 relayStateFormulas · impStateFormula · colLetter 를 잘라내서 돌린다★ (사본 아님).
impCols·monthClosedAt 은 가짜로 끼운다(각자 쓰임새가 따로 확인돼 있다).

왜 만들었나 —
  12월(2612) 베타 탭 13곳 + 호우주의보 이태원 2610 은 ★기록이 든 탭★인데 상태 수식이 옛 판이다.
  기록에 적혀 있던 방법(store.upgrade apply)은 빈 탭용 upgradeMonthTab 을 타서
  감점제외 칸에 insertCheckboxes() 를 다시 부른다 — 구글 문서상 ★칸 값을 전부 false 로★ 만든다.

보는 것:
  · ★상태 칸 말고는 한 칸도 안 바뀌는가★ (감점제외 TRUE · 기한 · 개선요청 글 그대로)
  · 미리보기가 아무것도 안 쓰는가 · 이미 새 판이면 쓰지 않는가(두 번 돌려도 같다)
  · 채점 확정 달 · 옛 서식 · 새 칸이 덜 붙은 탭 · 수식 아닌 글자가 든 줄 → 멈추고 안 쓰는가
  · ★쓴 뒤 다시 읽어★ 어긋나면 성공이라 하지 않는가 · 띄어쓰기만 다른 수식은 같다고 보는가
  · 새 수식이 이월(T) 칸을 보는가 — 「기한 후 완료」·「재제출기한 지남」이 들어 있는가
"""
import io, re, sys, subprocess
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_staterelay.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

text = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = text.split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


RELAY = cut('relayStateFormulas')
body = '\n'.join([RELAY, cut('impStateFormula'), cut('colLetter')])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ══════════════════════════════════════════════════
var CLOSED = {};                     // ym → '2026-12-31' 이면 채점 확정
function monthClosedAt(ss, ym) { return CLOSED[ym] || ''; }
function ymLabel(ym) { return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2)) + '월'; }
var SpreadsheetApp = { flush: function () {} };

// 10월 서식 그대로: B 기한 · C 상태 · J 개선요청 · M 진행 · N 완료 · P 비고 · Q 검수 · R 재제출기한 · S 감점제외 · T 이월
var COLS = { ok: true, hr: 11, row0: 12, endRow: 47, due: 2, state: 3, body: 10, plan: 13, done: 14,
             dept: 11, memo: 16, audit: 17, redo: 18, waive: 19, roll: 20, isNew: true };
var colsNow = null;
function impCols(sh) { return colsNow; }

function key(r, c) { return r + ',' + c; }
function mkSheet() {
  var sh = { _cells: {}, _writes: 0, _reads: 0, _dropWrite: false, _spaced: false };
  sh.getRange = function (r, c, nr, nc) {
    return {
      getFormulas: function () {
        sh._reads++;
        var out = [];
        for (var i = 0; i < nr; i++) {
          var row = [];
          for (var j = 0; j < nc; j++) {
            var v = sh._cells[key(r + i, c + j)];
            var f = (typeof v === 'string' && v.charAt(0) === '=') ? v : '';
            if (f && sh._spaced) f = f.replace(/,/g, ', ');      // 시트가 띄어쓰기를 다듬어 돌려주는 경우
            row.push(f);
          }
          out.push(row);
        }
        return out;
      },
      getValues: function () {
        sh._reads++;
        var out = [];
        for (var i = 0; i < nr; i++) {
          var row = [];
          for (var j = 0; j < nc; j++) {
            var v = sh._cells[key(r + i, c + j)];
            row.push((typeof v === 'string' && v.charAt(0) === '=') ? '미착수' : (v == null ? '' : v));
          }
          out.push(row);
        }
        return out;
      },
      setFormulas: function (fs) {
        sh._writes++;
        if (sh._dropWrite) return;                               // 조용히 안 먹는 경우(보호·권한)
        for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) sh._cells[key(r + i, c + j)] = fs[i][j];
      },
    };
  };
  return sh;
}

// 기록이 든 탭: 옛 상태 수식 36줄 + 기한·글·감점제외(TRUE)·이월 날짜
function filled() {
  var sh = mkSheet();
  for (var r = 12; r <= 47; r++) sh._cells[key(r, 3)] = '=IF($J' + r + '="","",IF($Q' + r + '="재반려","미조치","옛판"))';
  sh._cells[key(12, 2)] = new Date(2026, 11, 10);
  sh._cells[key(12, 10)] = '냉장고 문 고무 패킹 곰팡이';
  sh._cells[key(12, 14)] = '교체했습니다';
  sh._cells[key(12, 19)] = true;                                   // ★점수 제외 체크★
  sh._cells[key(13, 19)] = true;
  sh._cells[key(12, 20)] = new Date(2026, 11, 3);
  return sh;
}
function snapshotExceptState(sh) {
  var o = {};
  Object.keys(sh._cells).forEach(function (k) { if (k.split(',')[1] !== '3') o[k] = String(sh._cells[k]); });
  return JSON.stringify(o);
}

var pass = 0, fail = 0;
function ok(what, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + what); }
  else { fail++; console.log('  ✗ ' + what + '\n      받음: ' + g + '\n      기대: ' + w); }
}
function has(what, s, frag) {
  if (String(s).indexOf(frag) >= 0) { pass++; console.log('  ✓ ' + what); }
  else { fail++; console.log('  ✗ ' + what + '\n      «' + frag + '» 가 없음\n      받음: ' + JSON.stringify(s)); }
}

console.log('── ① 미리보기 — 아무것도 안 쓴다 ──');
colsNow = JSON.parse(JSON.stringify(COLS));
var sh = filled(), before = JSON.stringify(sh._cells);
var r = relayStateFormulas({}, sh, '2612', false);
ok('성공으로 답한다', r.ok, true);
ok('미리보기라고 적는다', r.dry, true);
ok('바꿀 줄 수 = 36', r.change, 36);
ok('범위 = C12:C47', r.range, 'C12:C47');
ok('★한 번도 안 썼다★', sh._writes, 0);
ok('시트 그대로', JSON.stringify(sh._cells), before);

console.log('── ② 실행 — 상태 칸만 바뀐다 ──');
var other = snapshotExceptState(sh);
r = relayStateFormulas({}, sh, '2612', true);
ok('성공', r.ok, true);
ok('실행이라고 적는다', r.dry, false);
ok('다시 읽어 36칸 확인', r.verified, 36);
ok('쓰기는 한 번(한 덩어리)', sh._writes, 1);
ok('★상태 칸 밖은 한 칸도 안 바뀌었다★', snapshotExceptState(sh), other);
ok('★감점제외 체크 TRUE 그대로★ (12행)', sh._cells[key(12, 19)], true);
ok('★감점제외 체크 TRUE 그대로★ (13행)', sh._cells[key(13, 19)], true);
has('12행 새 수식이 이월(T12) 칸을 본다', sh._cells[key(12, 3)], 'ISNUMBER($T12)');
has('새 수식에 「기한 후 완료」', sh._cells[key(12, 3)], '"기한 후 완료"');
has('새 수식에 「재제출기한 지남」', sh._cells[key(12, 3)], '"재제출기한 지남"');
has('47행 수식은 47행을 본다', sh._cells[key(47, 3)], '$J47="",""');
ok('48행(표 밖)은 안 건드린다', sh._cells[key(48, 3)], undefined);

console.log('── ③ 두 번째 실행 — 이미 새 판이면 안 쓴다 ──');
sh._writes = 0;
r = relayStateFormulas({}, sh, '2612', true);
ok('성공', r.ok, true);
ok('바꿀 줄 0', r.change, 0);
ok('안 썼다', sh._writes, 0);

console.log('── ④ 띄어쓰기만 다르게 돌려주는 시트 ──');
sh._spaced = true; sh._writes = 0;
r = relayStateFormulas({}, sh, '2612', true);
ok('같은 수식으로 본다 (바꿀 줄 0)', r.change, 0);
ok('안 썼다', sh._writes, 0);

console.log('── ⑤ 채점 확정 달 — 멈춘다 ──');
CLOSED['2612'] = '2026-12-31';
sh = filled(); before = JSON.stringify(sh._cells);
r = relayStateFormulas({}, sh, '2612', true);
ok('실패로 답한다', r.ok, false);
has('확정이라 멈췄다고 말한다', r.why, '채점이 확정된');
ok('시트를 읽지도 않았다', sh._reads, 0);
ok('시트 그대로', JSON.stringify(sh._cells), before);
delete CLOSED['2612'];

console.log('── ⑥ 옛 서식 · 새 칸이 덜 붙은 탭 — 멈춘다 ──');
colsNow = JSON.parse(JSON.stringify(COLS)); colsNow.isNew = false;
sh = filled(); r = relayStateFormulas({}, sh, '2609', true);
ok('옛 서식 → 실패', r.ok, false);
has('새 서식이 아니라고 말한다', r.why, '새 서식(2610~) 탭이 아닙니다');
ok('옛 서식 → 안 썼다', sh._writes, 0);
colsNow = JSON.parse(JSON.stringify(COLS)); colsNow.roll = 0;
sh = filled(); r = relayStateFormulas({}, sh, '2612', true);
ok('이월 칸 없음 → 실패', r.ok, false);
ok('이월 칸 없음 → 안 썼다', sh._writes, 0);
colsNow = { ok: false, why: '머리글에서 \'예정일\'을(를) 못 찾았습니다' };
sh = filled(); r = relayStateFormulas({}, sh, '2612', true);
ok('머리글을 못 찾으면 그 까닭을 그대로 돌려준다', r.why, colsNow.why);
colsNow = JSON.parse(JSON.stringify(COLS)); colsNow.endRow = 11;
sh = filled(); r = relayStateFormulas({}, sh, '2612', true);
ok('본문이 없으면 실패', r.ok, false);
ok('본문이 없으면 안 썼다', sh._writes, 0);

console.log('── ⑦ 상태 칸에 수식 아닌 글자 — 멈춘다 ──');
colsNow = JSON.parse(JSON.stringify(COLS));
sh = filled(); sh._cells[key(20, 3)] = '미조치'; sh._cells[key(21, 3)] = '확정';
before = JSON.stringify(sh._cells);
r = relayStateFormulas({}, sh, '2612', true);
ok('실패', r.ok, false);
has('어느 줄인지 적는다', r.why, '20·21행');
ok('안 썼다', sh._writes, 0);
ok('시트 그대로', JSON.stringify(sh._cells), before);
sh = filled(); delete sh._cells[key(30, 3)];                       // 빈 칸(수식도 글자도 없음)은 멈출 까닭이 아니다
r = relayStateFormulas({}, sh, '2612', true);
ok('빈 칸은 그냥 새 수식을 깐다', r.ok, true);
has('빈 칸이었던 30행에도 수식', sh._cells[key(30, 3)], '$J30');

console.log('── ⑧ 썼다는데 안 먹은 경우 — 성공이라 하지 않는다 ──');
sh = filled(); sh._dropWrite = true;
r = relayStateFormulas({}, sh, '2612', true);
ok('실패로 답한다', r.ok, false);
has('다시 읽어 어긋난 칸 수를 말한다', r.why, '다시 읽으니 36칸');

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
UP = cut('fnStoreUpgrade')
i_fo = UP.find('if (p.formulaOnly === true)')
i_call = UP.find('relayStateFormulas(ss, sh, ym, p.apply === true)')
i_up = UP.find('upgradeMonthTab(sh, p.apply !== true)')
src_ok('store.upgrade 가 formulaOnly 면 relayStateFormulas 로 간다', 0 <= i_fo < i_call)
src_ok('★그 갈림길이 upgradeMonthTab 보다 먼저다★', 0 <= i_call < i_up)
src_ok('실행은 apply:true 를 명시할 때만 (기본 미리보기)', 'p.apply === true' in UP[i_fo:i_up])
bad = [w for w in ('insertCheckboxes', 'setValues', 'setValue(', 'merge(', 'clearContent', 'copyTo',
                   'setNumberFormat', 'setDataValidation', 'hideColumns', 'insertColumns', 'deleteRow')
       if w in RELAY]
src_ok('relayStateFormulas 는 수식 말고는 아무것도 안 쓴다 (%s)' % ('없음' if not bad else ', '.join(bad)), not bad)
src_ok('등록표 store.upgrade 는 그대로 관리자 쓰기',
       re.search(r"'store\.upgrade':\s*\{ menu: ADMIN_MENU, act: '쓰기'.*fn: fnStoreUpgrade", text) is not None)
src_ok('monthClosedAt 을 가장 먼저 본다 (확정 달은 읽지도 않는다)',
       RELAY.find('monthClosedAt(') < RELAY.find('impCols(') < RELAY.find('getRange('))

print('\n소스 검사 통과 %d · 실패 %d' % (sp, sf))
try:
    OUT.unlink()
except OSError:
    pass
sys.exit(1 if (r.returncode or sf) else 0)
