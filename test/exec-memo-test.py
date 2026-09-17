# -*- coding: utf-8 -*-
"""실행 단위 메모 셋 — grid() 행·열 수 · PROPS 속성 · ssOpen 파일 열기 (2026-09-17 ③ 속도 · find_S4 §1)

★Code.gs 의 진짜 gridSize · gridForget · grid · appendRows · prependRows · delRows · PROPS 덮개 · ssOpen 을 잘라내서 돌린다★ (사본 아님).

왜: 제출 한 건이 grid() 로 getMaxRows/getMaxColumns 덤 RPC 26회, 속성 읽기 10~12회, 같은 파일 열기 2~3회였다.
    메모는 빠르게 하지만 ★낡으면 조용히 틀린다★ — 그래서 무효화가 시험의 절반이다.

보는 것:
  ① grid — 같은 시트 객체면 getMaxRows/Cols 를 한 번만 묻는다 · 다른 객체는 따로 묻는다
  ② ★무효화★ — appendRows·prependRows·delRows·gridForget 뒤에는 다시 묻고, 줄어든 행 수를 넘겨 잡지 않는다(예외 방지)
  ③ PROPS — 같은 키 두 번 → 원본 한 번 · setProperty 뒤 getProperty 는 새 값(원본 안 읽음) · deleteProperty → null ·
     쓰기가 예외면 메모는 옛 값 그대로
  ④ ssOpen — 같은 ID 는 한 번만 연다 · 다른 ID 는 따로 · 빈 ID 는 예외
  ⑤ 대조군: QSC_SRC=<고치기 전 사본> 으로 돌리면 ①이 실패해야 한다(종전 grid 는 매번 묻는다)
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_exec_memo.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cut_opt(name):
    try:
        return cut(name)
    except SystemExit:
        return '/* %s 없음 (옛 사본) */' % name


def block(start, end):
    """start 로 시작하는 줄부터 end 로 시작하는 줄까지 (없으면 대역)"""
    st = next((i for i, l in enumerate(lines) if l.startswith(start)), None)
    if st is None:
        return None
    for j in range(st, len(lines)):
        if lines[j].startswith(end):
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % start)


props = block('const PROPS = (function (raw) {', '})(PropertiesService.getScriptProperties());') \
    or 'const PROPS = PropertiesService.getScriptProperties();   /* 옛 사본 — 덮개 없음 */'
gridmemo = block('const _gridMemo ', 'const _gridMemo ') or '/* _gridMemo 없음 (옛 사본) */'
ssmemo = block('const _ssMemo ', 'const _ssMemo ') or '/* _ssMemo 없음 (옛 사본) */'

js = r'''
/* ── 가짜 세계 ── */
let RAW = {}, RAW_READS = 0, RAW_THROW = false;
const PropertiesService = { getScriptProperties: function () { return {
  getProperty: function (k) { RAW_READS++; return Object.prototype.hasOwnProperty.call(RAW, k) ? RAW[k] : null; },
  setProperty: function (k, v) { if (RAW_THROW) throw new Error('쓰기 실패'); RAW[k] = String(v); },
  deleteProperty: function (k) { delete RAW[k]; },
  getProperties: function () { return Object.assign({}, RAW); }, getKeys: function () { return Object.keys(RAW); } }; } };
let OPENS = [];
const SpreadsheetApp = { openById: function (id) { OPENS.push(id); return { _id: id }; } };
function mkSheet(rows, cols) {
  const S = { _rows: rows, _cols: cols, asked: 0, ranges: [],
    getMaxRows: function () { S.asked++; return S._rows; },
    getMaxColumns: function () { S.asked++; return S._cols; },
    getLastRow: function () { return S._rows; },
    getRange: function (r, c, nr, nc) { if (r + nr - 1 > S._rows || c + nc - 1 > S._cols) throw new Error('그리드 밖 ' + [r, c, nr, nc].join(',')); S.ranges.push([r, c, nr, nc]); return { setValues: function () {} }; },
    insertRowsAfter: function (at, n) { S._rows += n; },
    insertRowsBefore: function (at, n) { S._rows += n; },
    insertColumnsAfter: function (at, n) { S._cols += n; },
    deleteRows: function (at, n) { S._rows -= n; },
  };
  return S;
}
''' + '\n'.join([props, gridmemo, cut_opt('gridSize'), cut_opt('gridForget'), cut('grid'), cut('appendRows'), cut('prependRows'), cut('delRows'),
                 ssmemo, cut_opt('ssOpen')]) + r'''

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }

console.log('① grid 메모');
let sh = mkSheet(100, 10);
grid(sh, 2, 1, 50, 5); grid(sh, 2, 1, 50, 5); grid(sh, 1, 1, 200, 20);
ok('세 번 불러도 행·열은 한 번씩만 묻는다(2)', sh.asked === 2, sh.asked);
ok('세 번째는 100×10 으로 잘라 준다', JSON.stringify(sh.ranges[2]) === '[1,1,100,10]', sh.ranges[2]);
let sh2 = mkSheet(30, 3);
grid(sh2, 1, 1, 5, 5);
ok('다른 시트 객체는 따로 묻는다', sh2.asked === 2 && sh.asked === 2);

console.log('② 무효화');
sh = mkSheet(100, 10); grid(sh, 1, 1, 5, 5);
delRows(sh, [2, 3, 4, 10]);                                     // 100 → 96
let threw = false;
try { grid(sh, 1, 1, 200, 5); } catch (e) { threw = true; }
ok('delRows 뒤 — 다시 묻고(4) 줄어든 96행으로 잘라 예외가 없다', !threw && sh.asked === 4 && JSON.stringify(sh.ranges[sh.ranges.length - 1]) === '[1,1,96,5]', [threw, sh.asked, sh.ranges[sh.ranges.length - 1]]);
sh = mkSheet(10, 3); grid(sh, 1, 1, 5, 3);
appendRows(sh, [[1, 2, 3, 4], [1, 2, 3, 4]]);                   // 행 12 · 열 4
grid(sh, 1, 1, 100, 100);
ok('appendRows 뒤 — 늘어난 12×4 를 본다', JSON.stringify(sh.ranges[sh.ranges.length - 1]) === '[1,1,12,4]', sh.ranges[sh.ranges.length - 1]);
sh = mkSheet(10, 3); grid(sh, 1, 1, 5, 3);
prependRows(sh, [[1, 2, 3], [1, 2, 3], [1, 2, 3]]);            // 행 13
grid(sh, 1, 1, 100, 100);
ok('prependRows 뒤 — 늘어난 13행을 본다', JSON.stringify(sh.ranges[sh.ranges.length - 1]) === '[1,1,13,3]', sh.ranges[sh.ranges.length - 1]);
sh = mkSheet(10, 3); grid(sh, 1, 1, 5, 3);
sh._rows = 7; gridForget(sh); grid(sh, 1, 1, 100, 100);
ok('gridForget 뒤 — 다시 묻는다(7행)', JSON.stringify(sh.ranges[sh.ranges.length - 1]) === '[1,1,7,3]', sh.ranges[sh.ranges.length - 1]);
ok('gridForget 에 이상한 값을 줘도 안 터진다', (function () { try { gridForget(null); gridForget(3); return true; } catch (e) { return false; } })());

console.log('③ PROPS 메모');
RAW = { A: '1' }; RAW_READS = 0;
ok('같은 키 두 번 → 원본 한 번', PROPS.getProperty('A') === '1' && PROPS.getProperty('A') === '1' && RAW_READS === 1, RAW_READS);
ok('없는 키는 null · 그것도 한 번만', PROPS.getProperty('B') === null && PROPS.getProperty('B') === null && RAW_READS === 2, RAW_READS);
PROPS.setProperty('A', '2');
ok('쓴 뒤 읽으면 새 값 · 원본 안 읽음', PROPS.getProperty('A') === '2' && RAW_READS === 2 && RAW.A === '2', [PROPS.getProperty('A'), RAW_READS]);
PROPS.setProperty('B', 7);
ok('숫자를 써도 문자열로 돌아온다(구글과 같다)', PROPS.getProperty('B') === '7');
PROPS.deleteProperty('A');
ok('지운 뒤는 null · 원본도 없다', PROPS.getProperty('A') === null && !('A' in RAW));
RAW = { C: 'old' }; RAW_READS = 0; PROPS.getProperty('C'); RAW_THROW = true;
let boom = false; try { PROPS.setProperty('C', 'new'); } catch (e) { boom = true; }
RAW_THROW = false;
ok('쓰기가 예외면 예외가 그대로 나가고 메모는 옛 값', boom && PROPS.getProperty('C') === 'old' && RAW.C === 'old');
ok('getProperties/getKeys 는 원본 그대로', PROPS.getKeys().indexOf('C') >= 0 && PROPS.getProperties().C === 'old');

console.log('④ ssOpen 메모');
OPENS = [];
const a = ssOpen('X'), b = ssOpen('X'), c = ssOpen('Y');
ok('같은 ID 는 같은 객체 · 한 번만 열었다', a === b && OPENS.length === 2 && OPENS.join() === 'X,Y', OPENS);
ok('다른 ID 는 다른 객체', c !== a && c._id === 'Y');
ok('빈 ID 는 예외', (function () { try { ssOpen(''); return false; } catch (e) { return true; } })());

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
sys.exit(1 if res.returncode != 0 else 0)
