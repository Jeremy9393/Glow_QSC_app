# -*- coding: utf-8 -*-
"""MS 지연 — ★새는 곳이 하나라도 있으면 장치 전체가 무의미하다★ (2026-09-04)

이 시험이 보는 것은 「한 함수가 맞게 도는가」가 아니라 ★빠뜨린 자리가 있는가★ 다.
2026-09-04에 실제로 그런 일이 있었다: 매장 파일만 늦추고 통합시트로는 그대로 내보내고 있었다.
주석에 「통합시트는 본사 것이라 매장이 못 본다」고 적혀 있었는데 그 전제가 틀렸다.

★처음 만든 판은 이 구멍을 못 잡았다★ — 「호출 둘레 14줄 안에 monthClosed 라는 글자가 있으면
통과」였는데, 가드를 빼도 바로 옆줄에 있는 ★다른★ 가드에 속았다. 자기 자신을 시험해 보고 알았다.
그래서 규칙을 바꿨다:

  ★MS 를 쓰는 자리를 미리 못 박아 두고, 자리마다 어떤 가드를 거쳐야 하는지 정한다★
  ★목록에 없는 자리에서 MS 를 쓰면 그 자체로 실패다★ — 새 코드가 몰래 쓰는 것을 잡는다

⚠QSC 는 늦추지 않는다 — QSC 쪽에 가드가 붙으면 그것도 잘못이다(즉시 보여야 한다).

이 시험 자신을 시험하려면 인자로 일부러 망가뜨린 사본을 준다:
    python ms-defer-guard-test.py <다른 Code.gs>
"""
import io, re, sys
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else \
    Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
src = io.open(SRC, 'r', encoding='utf-8', newline='').read()


def strip_comments(s):
    """주석을 지우되 ★줄 번호는 그대로 둔다★ (개행 수를 보존한다).
       주석에 적힌 설명글을 코드로 오해하면 거짓 경보가 난다 — 2026-09-04에 세 번 그랬다."""
    s = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), s, flags=re.S)
    s = re.sub(r'(?m)//.*$', '', s)
    return s


code = strip_comments(src)
lines = code.split('\n')
raw_lines = src.split('\n')

ok = fail = 0


def chk(name, cond, detail=''):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
        print('  ✗ %s%s' % (name, ('\n      ' + detail) if detail else ''))


def span_of(name):
    """function name(...) { … } 의 줄 범위 (주석 지운 code 기준, 0-based, 끝 포함)."""
    m = re.search(r'(?m)^function %s\s*\(' % re.escape(name), code)
    if not m:
        return None
    st = code.index('{', m.end() - 1)
    depth, i = 1, st + 1
    while i < len(code) and depth:
        if code[i] == '{':
            depth += 1
        elif code[i] == '}':
            depth -= 1
        i += 1
    return (code[:m.start()].count('\n'), code[:i].count('\n'))


def owner(lineno, spans):
    for nm, (a, b) in spans.items():
        if a <= lineno <= b:
            return nm
    return None


def passes(i, want):
    """i행의 MS 쓰기가 `want` 가드를 거쳤는가.

       ★쓰는 줄에 없으면 변수를 한 단계 따라간다★ — 되돌리기는 값을 먼저 만들어 넘긴다
         (const v = msAfterVisible(); … writeDashboard(store, date, v, 2)).
       ★함수 전체가 아니라 바로 위 몇 줄만 본다★ — 같은 이름(v)을 QSC 쪽에서도 쓰기 때문에
         함수 전체를 뒤지면 QSC 쪽 대입에 속아 통과시킨다."""
    line = lines[i]
    if want in line:
        return True
    m = (re.search(r'writeDashboard\s*\([^,]+,[^,]+,\s*([A-Za-z_$][\w$]*)\s*,', line)
         or re.search(r'setByLabelAny\s*\([^,]+,[^,]+,\s*([A-Za-z_$][\w$]*)\s*\)', line))
    if not m:
        return False
    var = m.group(1)
    above = '\n'.join(lines[max(0, i - 6): i])
    return re.search(r'(?<![\w$])%s\s*=[^;]*%s' % (re.escape(var), re.escape(want)), above) is not None


"""★MS 점수를 쓰는 자리는 여기가 전부다★ — 자리마다 어떤 가드를 거쳐야 하는지.

   None = 가드가 필요 없다. monthCloseRun 은 ★말일에 여는 함수 자체★라
          그 안에서는 가드 없이 쓰는 것이 맞다(그러라고 있는 함수다).
   글자  = 그 호출이 있는 줄에 이 글자가 있어야 한다. 값을 미리 가드해서 넘기는 경우
          (되돌리기)는 그 변수를 만든 줄이 아니라 ★쓰는 줄★에서 확인해야 속지 않는다 —
          그래서 되돌리기 쪽은 msAfterVisible 을 쓰는 줄 자체를 본다."""
SITES = {
    'saveShopper':   {'store': 'msOpen', 'dash': 'msOpen'},
    'monthCloseRun': {'store': None,     'dash': None},
    'fnUndoSubmit':  {'store': 'msAfterVisible', 'dash': 'msAfterVisible'},
}
spans = {}
for nm in SITES:
    sp = span_of(nm)
    chk('함수 %s 를 찾았다' % nm, sp is not None)
    if sp:
        spans[nm] = sp

print('── ① MS 를 매장 파일에 쓰는 자리 ──')
store_sites = [i for i, l in enumerate(lines)
               if 'writeStoreShopper(' in l and not l.strip().startswith('function')]
store_sites += [i for i, l in enumerate(lines) if 'setByLabelAny(sh2, L_MS' in l]
chk('매장 파일 MS 쓰기 자리를 찾았다', len(store_sites) >= 3, '줄: %s' % [i + 1 for i in store_sites])
for i in store_sites:
    who = owner(i, spans)
    chk('%d행 — 아는 자리인가 (%s)' % (i + 1, who or '★모르는 함수★'), who is not None,
        lines[i].strip()[:90])
    if not who:
        continue
    want = SITES[who]['store']
    if want is None:
        ok += 1
        continue
    chk('%d행 (%s) 매장 파일 MS 쓰기가 %s 를 거친다' % (i + 1, who, want),
        passes(i, want), lines[i].strip()[:90])

print('── ② MS 를 통합시트에 쓰는 자리 (offset 2) ──')
dash_all = [i for i, l in enumerate(lines)
            if re.search(r'writeDashboard\s*\(', l) and not l.strip().startswith('function')]
ms_dash = [i for i in dash_all if re.search(r',\s*2\s*\)', lines[i] + (lines[i + 1] if i + 1 < len(lines) else ''))]
qsc_dash = [i for i in dash_all if re.search(r',\s*0\s*\)', lines[i] + (lines[i + 1] if i + 1 < len(lines) else ''))]
chk('통합시트 MS 쓰기 자리를 찾았다', len(ms_dash) >= 2, '줄: %s' % [i + 1 for i in ms_dash])
chk('offset 을 못 읽은 writeDashboard 가 없다',
    len(ms_dash) + len(qsc_dash) == len(dash_all),
    '자리: %s' % [(i + 1, lines[i].strip()[:60]) for i in dash_all if i not in ms_dash and i not in qsc_dash])
for i in ms_dash:
    who = owner(i, spans)
    chk('%d행 — 아는 자리인가 (%s)' % (i + 1, who or '★모르는 함수★'), who is not None,
        lines[i].strip()[:90])
    if not who:
        continue
    want = SITES[who]['dash']
    if want is None:
        ok += 1
        continue
    chk('%d행 (%s) 통합시트 MS 쓰기가 %s 를 거친다' % (i + 1, who, want),
        passes(i, want), lines[i].strip()[:90])

print('── ③ QSC 는 늦추지 않는다 ──')
chk('통합시트 QSC 쓰기 자리를 찾았다', len(qsc_dash) >= 1, '줄: %s' % [i + 1 for i in qsc_dash])
for i in qsc_dash:
    l = lines[i]
    묶임 = ('msOpen' in l) or re.search(r'monthClosed\s*\(', l) or ('msAfterVisible' in l)
    chk('%d행 QSC 쓰기는 지연에 묶여 있지 않다' % (i + 1), not 묶임, l.strip()[:90])

print('── ④ 되돌리기 ──')
chk('옛 이름 msAfterForStore 가 남아 있지 않다', 'msAfterForStore' not in src)
chk('msAfterVisible 이 선언돼 있다', re.search(r'function\s+msAfterVisible\s*\(', code) is not None)
raw = [i for i, l in enumerate(lines)
       if re.search(r'(?<![\w.])msAfter\s*\(\s*\)', l) and not l.strip().startswith('function')]
밖 = [i for i in raw if 'msAfterVisible' not in lines[i]]
chk('msAfter() 를 직접 쓰는 곳은 msAfterVisible 안뿐이다', not 밖,
    '밖에서 부르는 줄: %s' % [(i + 1, lines[i].strip()[:70]) for i in 밖])

print('── ⑤ 늦추는 기준이 한 곳뿐인가 ──')
decl = [i for i, l in enumerate(lines) if re.match(r'\s*function\s+monthClosed\s*\(', l)]
chk('monthClosed 선언은 하나뿐이다', len(decl) == 1, '선언 줄: %s' % [i + 1 for i in decl])
chk('MS_DEFER_FROM 이 있다 (그 전 달은 늘 열린 달)', "const MS_DEFER_FROM = '2026-10'" in code)
chk('MONTH_OPEN_HOUR 가 23 이다', re.search(r'const MONTH_OPEN_HOUR\s*=\s*23\b', code) is not None)

print('── ⑥ 틀린 전제가 남아 있지 않은가 ──')
bad_lines = []
for i, l in enumerate(raw_lines):
    if ('본사 것이고 매장은 못 본다' not in l) and ('본사 것이라 매장이 못 본다' not in l):
        continue
    around = '\n'.join(raw_lines[max(0, i - 3): i + 4])
    if ('틀렸다' in around) or ('종전' in around):
        continue                      # 「그렇게 알았는데 틀렸다」는 기록이지 전제가 아니다
    bad_lines.append(i + 1)
chk('「통합시트는 본사 것이라 매장이 못 본다」가 전제로 남아 있지 않다', not bad_lines,
    '남은 줄: %s' % bad_lines)
chk('통합시트가 웹 공개라는 사실이 적혀 있다', '웹에 공개' in src)

print('── ⑦ 관리자 전용 잠정값이 매장에게 안 간다 ──')
m = re.search(r'function attachAdminLive\([^)]*\)\s*\{(.*?)\n\}', code, re.S)
chk('attachAdminLive 를 찾았다', m is not None)
if m:
    body = m.group(1)
    chk('관리자가 아니면 곧바로 돌아간다 (값을 안 싣는다)',
        re.search(r'if\s*\(!isAdmin\)\s*return', body) is not None)
    chk('admin 판정은 can(ctx.role, ADMIN_MENU) 으로 한다', 'can(ctx.role, ADMIN_MENU' in body)
    chk('그 달이 끝났으면 잠정값을 안 싣는다', 'monthClosed' in body)
    chk('예외가 나도 화면은 뜬다 (try/catch)', 'catch' in body)
    idx = code.index('attachAdminLive(out, ctx, store, ym)')
    seg = code[max(0, idx - 700): idx]
    chk('캐시(storeMonthBody) 밖에서 붙인다', 'markNewItems' in seg or 'readOnly' in seg)

print('\n' + ('★%d개 실패★' % fail if fail else '전부 통과') + '  (통과 %d)' % ok)
sys.exit(1 if fail else 0)
