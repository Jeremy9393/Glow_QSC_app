# -*- coding: utf-8 -*-
"""1단계 진단 (다시 짬) — Code.gs 를 기계적으로 세어 표를 만든다. ★코드는 고치지 않는다★

  중괄호를 세는 대신 ★들여쓰기★로 판정한다.
  이 파일은 최상위 함수를 전부 `function 이름(` 으로 맨 앞칸에 쓰고 들여쓰기가 일정하다.
  중괄호 세기는 정규식 리터럴(/^\\d{4}$/ · /'/ 같은 것) 하나만 어긋나도 파일 전체가 깨진다 —
  실제로 그렇게 깨져서 savePhotos 가 통째로 사라졌다.
"""
import io, re, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')
N = len(lines)

FNDEF = re.compile(r'^function\s+([A-Za-z_$][\w$]*)\s*\(')
LOOP = re.compile(r'\b(for|while)\s*\(|\.(forEach|map|filter|some|every|reduce)\s*\(')

KINDS = [
    ('드라이브', r'(DriveApp\.|\.createFile\s*\(|\.setSharing\s*\(|\.setTrashed\s*\(|\.getFolders\s*\(|\.getFiles\s*\(|\.createFolder\s*\(|\.getFileById\s*\(|\.makeCopy\s*\()'),
    ('시트쓰기', r'\.(setValues|setValue|setFormula|appendRow|deleteRow|deleteRows|insertRows|clearContent|deleteSheet|insertSheet|copyTo|protect|setNumberFormat|setBackground)\s*\('),
    ('시트읽기', r'\.(getValues|getValue|getLastRow|getLastColumn|getMaxRows|getMaxColumns|getDataRange|getFormula|getFormulas|getDisplayValues|getSheets)\s*\('),
    ('범위잡기', r'(\.getRange\s*\(|\bgrid\s*\()'),
    ('시트열기', r'(SpreadsheetApp\.openById\s*\(|\.getSheetByName\s*\(|\bsheet\s*\()'),
    ('캐시속성', r'(CacheService\.|PROPS\.|PropertiesService\.)'),
]


def indent(s):
    return len(s) - len(s.lstrip(' '))


def is_noise(s):
    t = s.strip()
    return (not t) or t.startswith('*') or t.startswith('//') or t.startswith('/*')


# ── 함수 경계: 맨 앞칸 function 부터 다음 맨 앞칸 function 앞까지 ────────
starts = [(i, FNDEF.match(l).group(1)) for i, l in enumerate(lines) if FNDEF.match(l)]
funcs = {}
for k, (i, name) in enumerate(starts):
    end = starts[k + 1][0] - 1 if k + 1 < len(starts) else N - 1
    funcs[name] = {'start': i + 1, 'end': end + 1, 'i0': i, 'i1': end,
                   'kinds': {}, 'inloop': [], 'calls': set()}


def loop_nest(i, i0):
    """i번 줄이 몇 겹의 반복문 안인가 — 위로 올라가며 들여쓰기가 줄어드는 줄만 본다."""
    nest = 0
    cur = indent(lines[i])
    # 자기 줄이 반복문을 여는 줄이면(한 줄짜리 forEach 등) 그것도 한 겹으로 친다
    if LOOP.search(lines[i]):
        nest += 1
    j = i - 1
    while j >= i0:
        if is_noise(lines[j]):
            j -= 1
            continue
        ind = indent(lines[j])
        if ind < cur:
            if LOOP.search(lines[j]):
                nest += 1
            cur = ind
            if ind == 0:
                break
        j -= 1
    return nest


for name, f in funcs.items():
    for i in range(f['i0'], f['i1'] + 1):
        l = lines[i]
        if is_noise(l):
            continue
        for kind, pat in KINDS:
            for mm in re.finditer(pat, l):
                f['kinds'][kind] = f['kinds'].get(kind, 0) + 1
                nest = loop_nest(i, f['i0'])
                if nest:
                    f['inloop'].append({'line': i + 1, 'kind': kind, 'nest': nest,
                                        'what': mm.group(0).strip('.( '), 'code': l.strip()[:100]})
        for mm in re.finditer(r'\b([A-Za-z_$][\w$]*)\s*\(', l):
            nm = mm.group(1)
            if nm not in ('function', 'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new'):
                f['calls'].add(nm)

# ── ACTIONS 등록표 ──────────────────────────────────────────────────────
acts = []
for i, l in enumerate(lines):
    m = re.match(r"\s*'([\w.*]+)':\s*\{(.+)\},?\s*$", l)
    if not m or 'fn:' not in m.group(2):
        continue
    body = m.group(2)
    fn = re.search(r'fn:\s*([\w$]+)', body)
    a = re.search(r"act:\s*'([^']*)'", body)
    mu = re.search(r"menu:\s*'([^']*)'", body)
    acts.append({'action': m.group(1), 'act': a.group(1) if a else '',
                 'menu': (mu.group(1) if mu else ('accounts(ADMIN)' if 'ADMIN_MENU' in body else '')),
                 'fn': fn.group(1) if fn else '', 'anon': 'anon: true' in body})


def total_of(name, seen=None, left=4):
    if seen is None:
        seen = set()
    if name in seen or name not in funcs or left <= 0:
        return {}
    seen.add(name)
    tot = dict(funcs[name]['kinds'])
    tot['_반복'] = len(funcs[name]['inloop'])
    for c in sorted(funcs[name]['calls']):
        if c in funcs and c != name:
            for k, v in total_of(c, seen, left - 1).items():
                tot[k] = tot.get(k, 0) + v
    return tot


K = ['시트열기', '범위잡기', '시트읽기', '시트쓰기', '드라이브']
R = []
R.append('# 1단계 진단 — `backend/Code.gs` (%d줄 · 함수 %d개)\n' % (N, len(funcs)))
R.append('★코드는 한 줄도 고치지 않았습니다. 세기만 했습니다.★')
R.append('함수 경계와 반복문 깊이는 ★들여쓰기★로 판정했습니다(중괄호 세기는 정규식 리터럴에서 깨집니다).')
R.append('`grid()`·`sheet()`는 이 저장소가 `getRange`·`getSheetByName` 을 감싼 것이라 함께 셉니다.\n')

R.append('\n## ① 반복문 안에서 시트·드라이브를 부르는 자리\n')
rows = []
for nm, f in funcs.items():
    for c in f['inloop']:
        rows.append((c['kind'], nm, c['line'], c['what'], c['nest'], c['code']))
order = {'드라이브': 0, '시트쓰기': 1, '시트읽기': 2, '범위잡기': 3, '시트열기': 4, '캐시속성': 5}
rows.sort(key=lambda r: (order.get(r[0], 9), -r[4], r[1], r[2]))
R.append('| 갈래 | 함수 | 줄 | 부르는 것 | 겹 | 코드 |')
R.append('|---|---|---|---|---|---|')
for r in rows:
    R.append('| %s | `%s` | %d | `%s` | %d | `%s` |' % (r[0], r[1], r[2], r[3], r[4], r[5].replace('|', '\\|')))
R.append('\n**%d곳 / 함수 %d개**\n' % (len(rows), len(set(r[1] for r in rows))))

R.append('\n## ② 앱 화면이 부르는 함수 (ACTIONS 등록표 %d개)\n' % len(acts))
R.append('| 액션 | 권한 | 메뉴 | 함수 | 시트열기 | 범위 | 읽기 | 쓰기 | 드라이브 | 반복문안 |')
R.append('|---|---|---|---|---|---|---|---|---|---|')
for a in sorted(acts, key=lambda x: (x['act'] != '읽기', x['action'])):
    t = total_of(a['fn']) if a['fn'] else {}
    R.append('| `%s` | %s | %s | `%s` | %s | %s | %s | %s | %s | %s |' % (
        a['action'], a['act'] or ('익명' if a['anon'] else '-'), a['menu'] or '-', a['fn'],
        t.get('시트열기', '') or '', t.get('범위잡기', '') or '', t.get('시트읽기', '') or '',
        t.get('시트쓰기', '') or '', t.get('드라이브', '') or '',
        (str(t.get('_반복')) + '곳') if t.get('_반복') else ''))
R.append('\n※ 숫자는 ★코드에 적힌 호출 지점의 수★이고, 호출 그래프를 4단계까지 따라가 합산했습니다.')
R.append('   반복문 안이면 실제 횟수는 이보다 훨씬 많습니다.\n')

R.append('\n## ③ 시트·드라이브를 가장 많이 만지는 함수 20개\n')
tot = []
for nm in funcs:
    t = total_of(nm)
    s = sum(t.get(k, 0) for k in K)
    if s:
        tot.append((s, nm, t))
tot.sort(key=lambda x: -x[0])
R.append('| 함수 | 합계 | 시트열기 | 범위 | 읽기 | 쓰기 | 드라이브 | 반복문안 |')
R.append('|---|---|---|---|---|---|---|---|')
for s, nm, t in tot[:20]:
    R.append('| `%s` | %d | %s | %s | %s | %s | %s | %s |' % (
        nm, s, t.get('시트열기', '') or '', t.get('범위잡기', '') or '', t.get('시트읽기', '') or '',
        t.get('시트쓰기', '') or '', t.get('드라이브', '') or '',
        (str(t.get('_반복')) + '곳') if t.get('_반복') else ''))

io.open(OUT / '1단계_진단.md', 'w', encoding='utf-8', newline='\n').write('\n'.join(R))
print('함수 %d개 · 반복문 안 호출 %d곳 · 액션 %d개' % (len(funcs), len(rows), len(acts)))
for n in ('savePhotos', 'fnUndoSubmit', 'writeStoreQscInto', 'buildDash'):
    f = funcs.get(n)
    print('  %-20s %s' % (n, '없음' if not f else ('줄 %d~%d · 반복문안 %d곳' % (f['start'], f['end'], len(f['inloop'])))))
