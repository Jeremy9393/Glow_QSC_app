# -*- coding: utf-8 -*-
"""매장 계정 저장이 열리는 달 (storeWriteBlock) 시험 (2026-09-17)

★Code.gs 의 진짜 storeWriteBlock · ymLabel 을 잘라내서 돌린다★ (사본 아님).
can · curYymm 은 가짜로 끼운다(「이번 달」을 바꿔 가며 본다).

담당자 (2026-09-17, 선택 「앱에서 막기」):
  *"매장 계정은 10월1일부터 작성 가능한걸로 설정할까?.. 어차피 9월은 스프레드시트에서
    불러오기만 하는 내용이니까 매장에서 수정을 하면 안되거든"*

보는 것:
  · 9월까지의 달(2610 전)은 ★이번 달이 언제든★ 매장 계정에 막힌다 — 날짜로만 막으면 10/1 뒤에 다시 열린다
  · 이번 달보다 뒤의 달은 막히고, 그 달이 오면 열린다 (해가 바뀌어도 · 2612 → 2701)
  · 관리자(계정관리 쓰기)는 막지 않는다 · F&B 등 다른 역할·역할 없음은 매장과 같다
  · 불러오기(fnStoreGet)는 FORBIDDEN 이 아니라 readOnly + readOnlyWhy 로만 알린다 — FORBIDDEN 이면 화면이 홈으로 보낸다
  · 저장(fnStoreSave)은 매장 파일을 찾기 전에 거절한다 · 배지(fnNotifyBadge)는 막힌 달을 세지 않는다
  · 화면(store-app.js)이 readOnlyWhy 를 띄운다 · 판정 함수에 역할 이름 비교가 없다
"""
import io, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE.parent / 'backend' / 'Code.gs'
APP = HERE.parent / 'js' / 'store-app.js'
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\_도구\node\node.exe')
OUT = HERE / 't_writeblock.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

text = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = text.split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


WB = cut('storeWriteBlock')
body = WB + '\n' + cut('ymLabel')
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ══════════════════════════════════════════════════
var ADMIN_MENU = 'accounts';
var PERM = { '관리자': { accounts: { '쓰기': true, '읽기': true }, store: { '쓰기': true } },
             '매장담당자': { store: { '쓰기': true, '읽기': true } },
             'F&B팀': { store: { '읽기': true } } };
function can(role, menu, act) { return { allow: !!(role && PERM[role] && PERM[role][menu] && PERM[role][menu][act]) }; }
var NOW = '2609';
function curYymm() { return NOW; }

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
var STORE = { id: '제주당', role: '매장담당자' }, ADMIN = { id: 'admin', role: '관리자' }, FNB = { id: 'fnb', role: 'F&B팀' };
var open = function (ctx, ym) { return storeWriteBlock(ctx, ym) === ''; };

console.log('── ① 오늘이 9월(2609) — 매장은 저장되는 달이 없다 ──');
NOW = '2609';
ok('9월 탭 막힘', open(STORE, '2609'), false);
has('9월 탭 이유', storeWriteBlock(STORE, '2609'), '9월까지의 기록은 앱에서 조회만 가능합니다.');
ok('8월 탭 막힘', open(STORE, '2608'), false);
ok('10월 탭(아직 안 옴) 막힘', open(STORE, '2610'), false);
has('10월 탭 이유 — 「2026년 10월 1일부터」', storeWriteBlock(STORE, '2610'), '2026년 10월 1일부터 입력할 수 있습니다');
ok('12월 베타 탭 막힘', open(STORE, '2612'), false);
has('12월 탭 이유 — 「2026년 12월 1일부터」', storeWriteBlock(STORE, '2612'), '2026년 12월 1일부터');

console.log('── ② 오늘이 10월(2610) ──');
NOW = '2610';
ok('10월 탭 열림', open(STORE, '2610'), true);
ok('★9월 탭은 10월이 돼도 막힘★', open(STORE, '2609'), false);
ok('11월 탭 막힘', open(STORE, '2611'), false);
ok('12월 베타 탭 막힘', open(STORE, '2612'), false);

console.log('── ③ 오늘이 11월(2611) — 지난달(10월) 기한 뒤 저장은 열려 있어야 한다 ──');
NOW = '2611';
ok('10월 탭 열림', open(STORE, '2610'), true);
ok('11월 탭 열림', open(STORE, '2611'), true);
ok('12월 탭 막힘', open(STORE, '2612'), false);

console.log('── ④ 해가 바뀔 때 (2612 → 2701) ──');
NOW = '2612';
ok('12월(2612) 열림', open(STORE, '2612'), true);
ok('다음 해 1월(2701) 막힘', open(STORE, '2701'), false);
has('2701 이유 — 「2027년 1월 1일부터」', storeWriteBlock(STORE, '2701'), '2027년 1월 1일부터');
NOW = '2701';
ok('2701 열림', open(STORE, '2701'), true);
ok('지난해 12월(2612) 열림', open(STORE, '2612'), true);
ok('★2609 는 해가 바뀌어도 막힘★', open(STORE, '2609'), false);

console.log('── ⑤ 역할 ──');
NOW = '2609';
ok('관리자 — 9월 탭 열림', open(ADMIN, '2609'), true);
ok('관리자 — 12월 베타 탭 열림', open(ADMIN, '2612'), true);
ok('F&B팀 — 9월 탭 막힘(관리자가 아니면 매장과 같다)', open(FNB, '2609'), false);
ok('역할 없음 — 막힘', open({}, '2609'), false);
ok('ctx 없음 — 막힘(안전한 쪽)', open(null, '2609'), false);
ok('ym 빈칸 — 막힘', open(STORE, ''), false);

console.log('\n통과 ' + pass + ' · 실패 ' + fail);
if (fail) process.exit(1);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout or '')
if r.stderr:
    print(r.stderr)

# ── 소스 자체를 보는 검사 ──────────────────────────────────────────
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
GET = cut('fnStoreGet')
src_ok('불러오기: readOnly = 권한 없음 || 막힌 달', "out.readOnly = !can(ctx.role, 'store', '쓰기').allow || !!writeWhy;" in GET)
src_ok('불러오기: 막힌 이유를 readOnlyWhy 로 보낸다', 'out.readOnlyWhy = writeWhy' in GET)
src_ok('★불러오기는 막힌 달에 FORBIDDEN 을 돌려주지 않는다★ (화면이 홈으로 보낸다)',
       re.search(r"writeWhy\)\s*return err\('FORBIDDEN'", GET) is None)
i_cache = GET.find('storeMonthBody(')
i_wb = GET.find('storeWriteBlock(ctx, ym)')
src_ok('불러오기: 캐시(storeMonthBody) 밖에서 붙인다 — 계정마다 다르다', 0 <= i_cache < i_wb)

SAVE = cut('fnStoreSave')
i_save = SAVE.find("const writeWhy = storeWriteBlock(ctx, ym);")
i_ret = SAVE.find("if (writeWhy) return err('FORBIDDEN', writeWhy);")
i_find = SAVE.find('storeFileId(')
i_valid = SAVE.find('if (!validYm(ym))')
src_ok('저장: 막힌 달이면 FORBIDDEN + 이유', 0 <= i_save < i_ret)
src_ok('★저장: 매장 파일을 찾기(storeFileId) 전에 거절★', 0 <= i_ret < i_find)
src_ok('저장: 월 형식 검사 뒤에 판정한다', 0 <= i_valid < i_save)

BADGE = cut('fnNotifyBadge')
i_bw = BADGE.find('if (storeWriteBlock(ctx, ym)) return { ok: true, ym: ym };')
i_bm = BADGE.find('storeMonthBody(')
src_ok('배지: 막힌 달은 매장 파일을 열기 전에 숫자 없이 돌아간다', 0 <= i_bw < i_bm)

src_ok('★판정 함수에 역할 이름 비교가 없다★ (ADMIN_MENU 주석)', '관리자' not in WB.split('\n', 1)[1] and "can(ctx && ctx.role, ADMIN_MENU, '쓰기')" in WB)
src_ok("등록표: store.saveImprove 는 그대로 매장 쓰기", "'store.saveImprove':  { menu: 'store', act: '쓰기'" in text)

sapp = io.open(APP, 'r', encoding='utf-8', newline='').read()
src_ok('화면: readOnly 면 서버 이유(readOnlyWhy)를 띄우고, 없으면 종전 문구',
       "if (data.readOnly) showState(str(data.readOnlyWhy) || '지금은 조회만 가능합니다. 개선보고 입력은 준비되는 대로 열립니다.');" in sapp)
src_ok('화면: 저장 단계 FORBIDDEN 은 홈으로 보내지 않고 문구를 띄운다(종전 그대로)',
       "noteEl.textContent = str(res.error) || '저장되지 않았습니다. 잠시 후 다시 시도해 주세요.';" in sapp)

print('\n소스 검사 통과 %d · 실패 %d' % (sp, sf))
try:
    OUT.unlink()
except OSError:
    pass
sys.exit(1 if (r.returncode or sf) else 0)
