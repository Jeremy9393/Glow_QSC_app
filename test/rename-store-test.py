# -*- coding: utf-8 -*-
"""매장 이름 갈아 끼우기 — admin.renameStore (2026-09-08)

★Code.gs 의 진짜 renameCell·fnRenameStore 를 잘라내서 돌린다★ (사본 아님).

담당자: *"1,2,3 먼저 연동시켜"*
  통합시트에서 「이티에프 투고」 → 「이티에프 베이커리 투고」 로 바꿨는데
  ①계정 ②지난 기록 ③제출 코드가 옛 이름 그대로였다.

★이 시험이 막으려는 것★ — 실기록을 고치는 도구라 잘못 돌면 되돌리기 어렵다:
  ① 미리보기인데 실제로 써 버리는 것 (apply 없이 setValues)
  ② 두 매장이 다 살아 있는데 합쳐 버리는 것
  ③ 새 이름이 통합시트에 없는데 바꿔 버리는 것 (오타 한 번에 26곳이 어긋난다)
  ④ 매장범위(쉼표 목록)에서 ★한 항목만★ 바꿔야 하는데 통째로 덮는 것
  ⑤ '*'(전 매장) 을 매장명으로 오해해 지우는 것
  ⑥ 부분 일치로 엉뚱한 매장을 바꾸는 것 — 「이티에프 투고」와 「이티에프 베이커리 투고」는
     앞부분이 같다. 통합시트에 둘 다 있던 적이 있으므로 ★이 실수가 실제로 가능하다★
  ⑦ 캐시를 안 버려 「고쳤는데 그대로」로 보이는 것
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_rename.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cutconst(name):
    """const NAME = … ; 를 통째로.
       ★줄 끝 주석을 걷어내고 본다★ — `const STORE_MAP_SHEET = '매장파일맵'; // 인증 시트 …`
       처럼 세미콜론 뒤에 주석이 붙으면 「안 끝났다」로 보고 다음 상수까지 삼켜,
       node 가 「already been declared」로 죽는다(실제로 그렇게 한 번 죽었다)."""
    st = next(i for i, l in enumerate(lines) if l.startswith('const %s ' % name))
    buf = []
    for j in range(st, len(lines)):
        buf.append(lines[j])
        if lines[j].split('//')[0].rstrip().endswith(';'):
            break
    return '\n'.join(buf)


# ★RENAME_SPOTS 가 탭 이름 상수를 쓴다★ — 그것들이 ★먼저★ 선언돼 있어야 한다.
#   harness 뒤쪽에 var 로 두었더니 호이스팅으로 undefined 가 들어가, 제출 코드·계정 탭을
#   「탭이 없습니다」로 건너뛰었다. 시험이 아니라 시험틀이 틀렸던 자리다.
body = '\n'.join([cutconst('MS_DETAIL'), cutconst('MS_COL'), cutconst('CODE_SHEET'),
                  cutconst('AUTH_ACCOUNT_SHEET'), cutconst('STORE_MAP_SHEET'),
                  cutconst('ACCT_COL'),
                  cutconst('RENAME_SPOTS'), cut('renameCell'), cut('fnRenameStore')])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var SPREADSHEET_ID = 'main';
var LIVE = ['금종제과', '이티에프 베이커리 투고'];      // 통합시트에 살아 있는 매장
var WROTE = [];                                        // 실제로 쓴 기록
var DROPPED = [];                                      // 버린 캐시
var LOGGED = [];

function normStore(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function displayStores() { return LIVE.slice(); }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function dropNaCache() { DROPPED.push('na'); }
function dropDashCache() { DROPPED.push('dash'); }
function dropStoreCache(s) { DROPPED.push('store:' + s); }
function dropAccountCache(s) { DROPPED.push('acct:' + s); }
function auditLog(ctx, a, t, r, c, m) { LOGGED.push(a + '|' + t + '|' + m); }

/* 탭 하나 — ★열마다 따로 담는다★ { 열번호: [값…] }
   계정 탭은 한 탭을 ★두 열★(아이디·매장범위)로 두 번 훑는다. 열을 구분하지 않으면
   같은 배열을 두 번 세어 「9줄」처럼 부풀고, 매장범위의 쉼표 처리도 시험되지 않는다. */
function mkTab(cols) {
  var n = 0;
  for (var k in cols) n = Math.max(n, cols[k].length);
  return {
    _c: cols,
    _n: n,
    getLastRow: function () { return this._n + 1; },
    getRange: function (r, c, nr, nc) {
      var me = this;
      if (!me._c[c]) me._c[c] = [];
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < nr; i++) out.push([me._c[c][r - 2 + i]]);
          return out;
        },
        setValues: function (vals) {
          WROTE.push({ col: c, n: vals.length });
          for (var i = 0; i < vals.length; i++) me._c[c][r - 2 + i] = vals[i][0];
        },
      };
    },
  };
}
function col(tab, c) { return (TABS[tab] && TABS[tab]._c[c]) || []; }
var TABS = {};
function mkSS(kind) {
  return { getSheetByName: function (nm) { return TABS[kind + '|' + nm] || null; } };
}
var SpreadsheetApp = { openById: function () { return mkSS('main'); } };
function authSS() { return mkSS('auth'); }

var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}
function setup(o) {
  TABS = {}; WROTE = []; DROPPED = []; LOGGED = [];
  o = o || {};
  var c = {};
  c['main|QSC_회차'] = {}; c['main|QSC_회차'][4] = o.round || ['이티에프 투고', '금종제과', '이티에프 투고'];
  c['main|QSC_상세'] = {}; c['main|QSC_상세'][3] = o.detail || ['이티에프 투고'];
  c['main|' + MS_DETAIL] = {}; c['main|' + MS_DETAIL][MS_COL.store] = o.ms || ['이티에프 투고', '이티에프 투고'];
  c['main|쇼퍼_코드'] = {}; c['main|쇼퍼_코드'][2] = o.code || ['이티에프 투고'];
  c['main|NA프리셋'] = {}; c['main|NA프리셋'][1] = o.na || [];
  /* 계정 — ★한 탭에 두 열★. 아이디(1)와 매장범위(4)를 따로 둔다 */
  c['auth|계정'] = {};
  c['auth|계정'][ACCT_COL.id] = o.acctId || ['이티에프 투고', 'admin'];
  c['auth|계정'][ACCT_COL.scope] = o.acctScope || ['이티에프 투고', '*'];
  c['auth|매장파일맵'] = {}; c['auth|매장파일맵'][1] = o.map || ['이티에프 투고'];
  for (var k in c) TABS[k] = mkTab(c[k]);
}
function run(p) { return fnRenameStore({}, p); }
function spot(r, tab, what) {
  return (r.자리 || []).filter(function (x) {
    return x.탭 === tab && (!what || x.칸.indexOf(what) >= 0);
  })[0] || {};
}
var OLD = '이티에프 투고', NEW = '이티에프 베이커리 투고';

console.log('── 미리보기는 아무것도 쓰지 않는다 ──');
setup();
var r = run({ from: OLD, to: NEW });
ok('[1-1] ok', r.ok, true);
ok('[1-2] ★미리보기 표시★', r.미리보기, true);
ok('[1-3] ★쓴 것이 없다★', WROTE.length, 0);
ok('[1-4] 캐시도 안 버린다', DROPPED.length, 0);
ok('[1-5] 감사로그도 안 남긴다', LOGGED.length, 0);
// 회차2 + 상세1 + MS2 + 코드1 + 계정 아이디1 + 계정 매장범위1 + 매장파일맵1 = 9
ok('[1-6] 걸린 줄을 센다', r.합계, 9);
ok('[1-7] 탭마다 줄 수', spot(r, 'QSC_회차').걸린줄, 2);
ok('[1-8] 줄 번호를 알려 준다', spot(r, 'QSC_회차').줄번호, [2, 4]);

console.log('── apply 면 실제로 바꾼다 ──');
setup();
r = run({ from: OLD, to: NEW, apply: true });
ok('[2-1] 미리보기 아님', r.미리보기, false);
ok('[2-2] ★걸린 자리만 쓴다★ (NA프리셋은 0줄이라 안 쓴다)', WROTE.length, 7);
ok('[2-3] QSC_회차가 새 이름으로', col('main|QSC_회차', 4), [NEW, '금종제과', NEW]);
ok('[2-4] MS_상세도', col('main|' + MS_DETAIL, MS_COL.store), [NEW, NEW]);
ok('[2-5] 제출 코드도', col('main|쇼퍼_코드', 2), [NEW]);
ok('[2-6] 계정 아이디도', col('auth|계정', ACCT_COL.id), [NEW, 'admin']);
ok('[2-6b] ★계정 매장범위도★ — '*' 은 그대로 둔다',
   col('auth|계정', ACCT_COL.scope), [NEW, '*']);
ok('[2-6c] 매장파일맵도', col('auth|매장파일맵', 1), [NEW]);
/* ★종류별로 본다★ — 길이만 세면 하나를 빠뜨려도 통과한다(자기 검증에서 실제로 놓쳤다).
   하나라도 안 버리면 최대 10분 동안 「고쳤는데 그대로」로 보인다. */
ok('[2-7] ★캐시를 종류별로 버린다★',
   ['na', 'dash', 'store:' + OLD, 'store:' + NEW, 'acct:' + OLD, 'acct:' + NEW]
     .filter(function (k) { return DROPPED.indexOf(k) < 0; }), []);
ok('[2-8] 감사로그를 남긴다', LOGGED.length, 1);

console.log('── ★안전 검사★ ──');
setup();
r = run({ from: OLD, to: '없는매장', apply: true });
ok('[3-1] 새 이름이 통합시트에 없으면 막는다', r.code, 'BAD_REQUEST');
ok('[3-2] 그때는 아무것도 안 쓴다', WROTE.length, 0);

setup();
LIVE = ['금종제과', OLD, NEW];          // 둘 다 살아 있다 = 서로 다른 매장
r = run({ from: OLD, to: NEW, apply: true });
ok('[3-3] ★둘 다 살아 있으면 합치지 않는다★', r.code, 'CONFLICT');
ok('[3-4] 아무것도 안 쓴다', WROTE.length, 0);
LIVE = ['금종제과', NEW];

ok('[3-5] 같은 이름이면 막는다', run({ from: NEW, to: NEW }).code, 'BAD_REQUEST');
ok('[3-6] 빈 이름도 막는다', run({ from: '', to: NEW }).code, 'BAD_REQUEST');

console.log('── 매장범위(쉼표 목록) ──');
ok('[4-1] 한 항목만 바꾼다',
   renameCell('금종제과, 이티에프 투고, 도넛정수', OLD, NEW, true),
   '금종제과, ' + NEW + ', 도넛정수');
ok('[4-2] 없으면 null (안 건드린다)',
   renameCell('금종제과, 도넛정수', OLD, NEW, true), null);
ok('[4-3] ★"*" 은 전 매장이라 손대지 않는다★', renameCell('*', OLD, NEW, true), null);
ok('[4-4] 목록 하나짜리', renameCell('이티에프 투고', OLD, NEW, true), NEW);
ok('[4-5] 띄어쓰기가 흐트러져도 잡는다',
   renameCell(' 이티에프  투고 ,금종제과', OLD, NEW, true), NEW + ', 금종제과');

console.log('── ★부분 일치로 엉뚱한 매장을 바꾸지 않는다★ ──');
/* 「이티에프 투고」와 「이티에프 베이커리 투고」는 앞부분이 같다.
   통합시트에 둘 다 있던 적이 있으므로 이 실수가 실제로 가능하다 */
ok('[5-1] 새 이름은 안 건드린다 (이미 바뀐 줄)', renameCell(NEW, OLD, NEW, false), null);
ok('[5-2] 비슷한 다른 이름도 안 건드린다',
   renameCell('이티에프 베이커리 성수', OLD, NEW, false), null);
ok('[5-3] 정확히 같을 때만', renameCell(OLD, OLD, NEW, false), NEW);
/* ★여기가 진짜 함정이다★ — 옛 이름으로 ★시작하는★ 다른 매장.
   indexOf(from) === 0 같은 느슨한 비교로 바꾸면 이 줄이 걸려 남의 매장이 사라진다.
   (자기 검증에서 이 사례가 없어 그 변형을 놓쳤다 — 2026-09-08) */
ok('[5-6] ★옛 이름으로 시작하는 다른 매장은 안 건드린다★',
   renameCell('이티에프 투고 2호점', OLD, NEW, false), null);
ok('[5-7] 목록 안에서도 마찬가지',
   renameCell('이티에프 투고 2호점, 금종제과', OLD, NEW, true), null);
ok('[5-8] 옛 이름을 뒤에 품은 이름도 안 건드린다',
   renameCell('신관 이티에프 투고', OLD, NEW, false), null);
ok('[5-4] 빈 칸은 건너뛴다', renameCell('', OLD, NEW, false), null);
ok('[5-5] 공백만 있어도 건너뛴다', renameCell('   ', OLD, NEW, false), null);

console.log('── 두 번 돌려도 같은 결과 ──');
setup();
run({ from: OLD, to: NEW, apply: true });
var before = JSON.stringify(col('main|QSC_회차', 4));
WROTE = [];
r = run({ from: OLD, to: NEW, apply: true });
ok('[6-1] 두 번째는 걸리는 줄이 없다', r.합계, 0);
ok('[6-2] 값도 그대로', JSON.stringify(col('main|QSC_회차', 4)), before);

console.log('── 탭이 없거나 비어도 죽지 않는다 ──');
setup({ na: [] });
delete TABS['main|NA프리셋'];
r = run({ from: OLD, to: NEW });
ok('[7-1] 없는 탭은 말만 남긴다', spot(r, 'NA프리셋').말, '탭이 없습니다');
ok('[7-2] 나머지는 그대로 센다', r.합계 > 0, true);

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
