# -*- coding: utf-8 -*-
"""배포 — 점검하고, 올리고, 정말 올라갔는지 확인한다.

    python tools/release.py          점검 → 올림 → 실서버 확인
    python tools/release.py check    점검만 (아무것도 올리지 않는다)

★왜 이 파일이 있는가★
2026-08-18에 문항을 고치고 master.json 재생성·캐시 버전 인상·폴더 동기화까지 다 해 놓고
GitHub에 올리는 단계를 빠뜨린 채 "반영 완료"라고 보고했다. 매장 폰에는 옛 화면이 그대로였다.
로컬만 보고 다 됐다고 판단한 것이 원인이다. 그래서 이 스크립트의 마지막 단계는
★실서버를 직접 받아 대조하는 것★이다. 그 전까지는 무엇도 '완료'가 아니다.

사람이 기억해야 하는 것을 하나씩 없앤다:
 - 엑셀을 고쳤는데 추출을 안 돌림      → 항상 먼저 다시 뽑는다
 - 매장이 바뀌었는데 QR을 안 만듦      → 매장 목록이 달라지면 다시 만든다
 - 파일은 고쳤는데 캐시 버전을 안 올림 → 바뀐 게 있으면 알아서 올린다
 - 새 파일을 sw.js 목록에 안 넣음      → 빠진 것을 찾아 알려준다
 - 커밋만 하고 push를 안 함            → 올린 뒤 원격과 대조한다
 - 올렸는데 반영이 안 됨               → 실서버를 받아 확인할 때까지 안 끝난다
"""
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = Path(__file__).resolve().parents[1]
LIVE = 'https://jeremy9393.github.io/Glow_QSC_app'
XLSX = ROOT.parent / 'QSC·MS 평가표.xlsx'

CHECK_ONLY = len(sys.argv) > 1 and sys.argv[1] in ('check', '점검', '-c')

problems = []   # 배포를 막는 것
warnings = []   # 알려는 주되 막지는 않는 것


def say(mark, text):
    print('%s %s' % (mark, text))


def fail(text):
    problems.append(text)
    say('✗', text)


def warn(text):
    warnings.append(text)
    say('!', text)


def ok(text):
    say('✓', text)


def git(*args, check=True):
    r = subprocess.run(('git', '-C', str(ROOT)) + args,
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and r.returncode != 0:
        raise RuntimeError('git %s 실패:\n%s' % (' '.join(args), (r.stderr or '').strip()))
    return (r.stdout or '').strip()


def run_tool(name):
    r = subprocess.run([sys.executable, str(ROOT / 'tools' / name)],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise RuntimeError('%s 실패:\n%s' % (name, (r.stderr or r.stdout or '').strip()))
    return (r.stdout or '').strip()


def fetch(path, tries=1):
    """실서버에서 받는다. 캐시를 타지 않도록 무작위 꼬리를 붙인다."""
    last = None
    for i in range(tries):
        try:
            url = '%s/%s?_=%d' % (LIVE, path, int(time.time() * 1000) + i)
            req = urllib.request.Request(url, headers={
                'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'User-Agent': 'qsc-release'})
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode('utf-8')
        except Exception as e:      # noqa: BLE001 — 무엇이 나든 재시도 대상이다
            last = e
            if i + 1 < tries:
                time.sleep(20)
    raise RuntimeError('%s 를 받지 못했습니다: %s' % (path, last))


# ══════════════════════════════════════════════════════════════
print('\n━━ 1. 엑셀에서 다시 뽑기 ' + '━' * 34)

if not XLSX.exists():
    fail('평가표 엑셀을 찾지 못했습니다: %s' % XLSX)
else:
    # ★엉뚱한 엑셀을 고치지 않았는가★ (2026-08-25)
    #   2026-08-25에 시트를 합치면서 새 파일(QSC·MS 평가표.xlsx)로 옮겼는데,
    #   옛 파일(참고용자료_QSC 평가 체계 개편_v3.xlsx)도 지우지 않고 그대로 뒀다(사용자 요청).
    #   ★앱이 읽는 것은 새 파일 하나뿐이다.★ 옛 파일을 고치면 아무 일도 일어나지 않고,
    #   고친 사람은 고쳤다고 믿는다 — 이 저장소가 겪은 사고가 늘 그런 모양이었다
    #   (낡은 통합시트 사본 때문에 옛 매장명이 열흘간 배포된 적이 있다).
    #   그래서 옛 파일이 더 최신이면 알린다. 막지는 않는다 — 그냥 열어만 봐도
    #   수정시각이 바뀌기 때문이다(옛 파일에만 있는 '채점기준' 시트를 볼 일이 있다).
    #   2026-08-26: 그 옛 파일을 작업 폴더에서 치웠다(담당자 요청) —
    #   `_보관/지난자료/(안 씀) …` 로 옮겨 두어 나란히 놓고 헷갈릴 일이 없게 했다.
    #   그래도 감시는 남긴다: 옮긴 자리에서 열어 고치는 경우가 있을 수 있다.
    _old = ROOT.parent / '_보관' / '지난자료' / '(안 씀) 참고용자료_QSC 평가 체계 개편_v3.xlsx'
    if not _old.exists():
        _old = ROOT.parent / '참고용자료_QSC 평가 체계 개편_v3.xlsx'   # 되돌려 놓은 경우
    if _old.exists() and _old.stat().st_mtime > XLSX.stat().st_mtime + 1:
        warn('★옛 엑셀이 더 최신입니다★ — 혹시 이쪽을 고치셨나요?\n'
             '        앱이 읽는 것은  %s\n'
             '        방금 만진 것은  %s\n'
             '        옛 파일을 고쳐도 앱에는 반영되지 않습니다.' % (XLSX.name, _old.name))

    before = (ROOT / 'data' / 'master.json').read_bytes() if (ROOT / 'data' / 'master.json').exists() else b''
    out = run_tool('extract_master.py')
    for line in out.split('\n'):
        if line.strip():
            print('   ' + line.strip())
    after = (ROOT / 'data' / 'master.json').read_bytes()
    if before != after:
        ok('master.json 을 새로 뽑았습니다 (엑셀이 더 최신이었습니다)')
    else:
        ok('master.json 은 이미 엑셀과 같았습니다')

    # 매장 목록이 달라졌으면 QR도 다시 만든다 — 순서를 어기면 옛 매장의 QR이 남는다
    master = json.loads((ROOT / 'data' / 'master.json').read_text(encoding='utf-8'))
    qrf = ROOT / 'data' / 'qr.json'
    qr_stores = []
    if qrf.exists():
        q = json.loads(qrf.read_text(encoding='utf-8'))
        items = q if isinstance(q, list) else (q.get('stores') or q.get('items') or [])
        qr_stores = [x if isinstance(x, str) else (x.get('store') or x.get('name') or '') for x in items]
    if sorted(qr_stores) != sorted(master.get('stores') or []):
        try:
            run_tool('make_qr.py')
            ok('매장 목록이 달라져 qr.json 을 다시 만들었습니다')
        except Exception as e:      # noqa: BLE001
            warn('qr.json 을 다시 만들지 못했습니다 — %s' % str(e).split('\n')[0])
    else:
        ok('qr.json 의 매장 목록이 master.json 과 같습니다')


# ══════════════════════════════════════════════════════════════
print('\n━━ 2. 캐시 버전이 어긋나지 않는가 ' + '━' * 26)

sw_text = (ROOT / 'sw.js').read_text(encoding='utf-8')
m = re.search(r"const VER\s*=\s*'v(\d+)'", sw_text)
if not m:
    fail('sw.js 에서 VER 을 찾지 못했습니다')
    VER = None
else:
    VER = int(m.group(1))
    ok('sw.js 버전 = v%d' % VER)

    seen = {}
    for f in sorted(list(ROOT.glob('*.html')) + list(ROOT.glob('js/*.js')) + list(ROOT.glob('css/*.css'))):
        for n in re.findall(r'\?v=(\d+)', f.read_text(encoding='utf-8')):
            seen.setdefault(int(n), []).append(f.name)
    if not seen:
        warn('?v= 표기를 하나도 찾지 못했습니다')
    elif set(seen) != {VER}:
        for n, files in sorted(seen.items()):
            if n != VER:
                fail('?v=%d 가 남아 있습니다 (sw.js 는 v%d) — %s'
                     % (n, VER, ', '.join(sorted(set(files))[:6])))
    else:
        ok('모든 화면이 ?v=%d 로 맞춰져 있습니다 (%d개 파일)'
           % (VER, len({f for fs in seen.values() for f in fs})))


# ══════════════════════════════════════════════════════════════
print('\n━━ 3. sw.js 목록에 빠진 파일이 없는가 ' + '━' * 22)

# 목록에 없는 파일은 오프라인에서 통째로 안 뜨고, 목록에 있는데 없는 파일은
# install 이 실패해 서비스 워커가 아예 안 깔린다. 둘 다 조용히 일어난다.
block = sw_text.split('const ASSETS')[1].split('.map(v))')[0] if 'const ASSETS' in sw_text else ''
listed = set(re.findall(r"'([^']+)'", block))
listed = {p for p in listed if '/' in p or p.endswith(('.html', '.json', '.js', '.css'))}

missing_on_disk = sorted(p for p in listed if not (ROOT / p).exists())
if missing_on_disk:
    for p in missing_on_disk:
        fail('sw.js 목록에 있는데 파일이 없습니다: %s (서비스 워커 설치가 통째로 실패합니다)' % p)
else:
    ok('sw.js 목록의 %d개 파일이 모두 있습니다' % len(listed))

on_disk = ({f.name for f in ROOT.glob('*.html')}
           | {'js/' + f.name for f in ROOT.glob('js/*.js')}
           | {'css/' + f.name for f in ROOT.glob('css/*.css')})
not_listed = sorted(on_disk - listed)
if not_listed:
    for p in not_listed:
        warn('sw.js 목록에 없습니다: %s (오프라인에서 안 열립니다)' % p)
else:
    ok('화면·스크립트가 모두 목록에 들어 있습니다')


# ══════════════════════════════════════════════════════════════
print('\n━━ 3-2. 문항과 예시가 맞물리는가 ' + '━' * 26)

# 쇼퍼 화면은 문항마다 '예: …' 힌트를 붙인다. 종전에는 그 힌트를 1~40 일련번호로
# 묶어 두어, 문항이 둘 줄자 번호가 밀려 엉뚱한 예시가 붙었다(2026-08-18).
# 화면에는 멀쩡한 문장이 떠서 아무도 못 알아챈다 — 그래서 기계가 대조한다.
try:
    core = (ROOT / 'js' / 'shopper-core.js').read_text(encoding='utf-8')
    ex_block = core.split('const EX = {')[1].split('};')[0]
    ex_keys = set(re.findall(r"'(\d+-\d+)'\s*:", ex_block))

    mj = json.loads((ROOT / 'data' / 'master.json').read_text(encoding='utf-8'))
    q_codes, no_code = set(), []
    for c in mj['shopper_categories']:
        for q in c['questions']:
            mm = re.match(r'^(\d+-\d+)\.', q['text'])
            if mm:
                q_codes.add(mm.group(1))
            else:
                no_code.append(q['text'][:30])

    if no_code:
        warn('문항 코드(예: 13-1)로 시작하지 않는 문항이 있습니다 — %s' % ', '.join(no_code[:3]))
    miss = sorted(q_codes - ex_keys)
    orph = sorted(ex_keys - q_codes)
    if miss:
        warn('예시가 없는 문항: %s (힌트 없이 뜹니다)' % ', '.join(miss))
    if orph:
        warn('없어진 문항의 예시가 남아 있습니다: %s' % ', '.join(orph))
    if not miss and not orph:
        ok('%d개 문항이 모두 제 예시와 맞물려 있습니다' % len(q_codes))
except Exception as e:      # noqa: BLE001
    warn('문항·예시 대조를 못 했습니다 — %s' % str(e).split('\n')[0])


# ══════════════════════════════════════════════════════════════
print('\n━━ 3-3. 매장 목록이 실물 시트와 같은가 ' + '━' * 21)

# ★로컬 통합시트 사본은 낡을 수 있다★ — extract_master.py 는 그 사본을 읽는다.
# 2026-08-20에 '창창 창신'이 사본에만 옛 이름('창창족발 (창창 창신)')으로 남아 있었고,
# 앱에 동봉된 목록과 서버가 내려주는 목록이 달랐다. 이름이 어긋난 매장은
# 로그인·설문에서 조용히 막히므로, 실물 시트에 직접 물어 대조한다.
try:
    api = (ROOT / 'js' / 'api.js').read_text(encoding='utf-8')
    mu = re.search(r"APPS_SCRIPT_URL:\s*'([^']+)'", api)
    if not mu:
        warn('js/api.js 에서 서버 주소를 못 찾아 실물 시트와 대조하지 못했습니다')
    else:
        body = json.dumps({'action': 'config.stores'}).encode('utf-8')
        req = urllib.request.Request(mu.group(1), data=body,
                                     headers={'Content-Type': 'text/plain;charset=utf-8'})
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read().decode('utf-8'))
        live_stores = (resp.get('data') or {}).get('stores') or resp.get('stores') or []
        mine = json.loads((ROOT / 'data' / 'master.json').read_text(encoding='utf-8')).get('stores') or []
        only_live = sorted(set(live_stores) - set(mine))
        only_mine = sorted(set(mine) - set(live_stores))
        if not live_stores:
            warn('서버가 매장 목록을 주지 않아 대조하지 못했습니다')
        elif only_live or only_mine:
            if only_mine:
                fail('앱에만 있는 매장: %s — 실물 시트에 없는 이름입니다' % ', '.join(only_mine))
            if only_live:
                fail('실물 시트에만 있는 매장: %s — 통합시트 사본을 새로 받으십시오' % ', '.join(only_live))
        else:
            ok('%d곳이 실물 시트와 정확히 같습니다' % len(mine))
except Exception as e:      # noqa: BLE001 — 인터넷이 끊겨도 배포는 막지 않는다
    warn('실물 시트와 대조하지 못했습니다 (%s) — 인터넷 상태를 확인하십시오'
         % str(e).split('\n')[0][:60])


# ══════════════════════════════════════════════════════════════
print('\n━━ 4. 올리면 안 되는 것이 섞였는가 ' + '━' * 25)

tracked = set(git('ls-files').split('\n'))
banned = [t for t in tracked if '연동_설정값' in t or t.endswith(('.secret', '.local'))]
if banned:
    for b in banned:
        fail('저장소에 들어가면 안 되는 파일입니다: %s' % b)
else:
    ok('설정값 파일은 저장소에 없습니다')

# 스크립트 속성에 있어야 할 값이 코드에 박혀 있지 않은지 — 형태로 찾는다
leak = []
for f in list(ROOT.glob('js/*.js')) + list(ROOT.glob('*.html')) + [ROOT / 'backend' / 'Code.gs']:
    if not f.exists():
        continue
    t = f.read_text(encoding='utf-8', errors='replace')
    for pat, what in ((r'PW_PEPPER\s*[=:]\s*[\'"][0-9a-f-]{20,}', '비밀번호 페퍼'),
                      (r'TOKEN_KEY\s*[=:]\s*[\'"][0-9a-f-]{20,}', '토큰 키')):
        if re.search(pat, t):
            leak.append('%s 에 %s 가 박혀 있습니다' % (f.name, what))
if leak:
    for x in leak:
        fail(x)
else:
    ok('비밀값이 코드에 박혀 있지 않습니다')


# ══════════════════════════════════════════════════════════════
print('\n━━ 5. 캐시 버전을 올려야 하는가 ' + '━' * 27)

git('fetch', '--quiet', 'origin', 'main')
changed = set(git('diff', '--name-only', 'origin/main').split('\n')) | \
          set(git('diff', '--name-only', '--cached').split('\n')) | \
          set(git('diff', '--name-only', 'origin/main', 'HEAD').split('\n'))
changed = {c for c in changed if c}
app_changed = sorted(c for c in changed
                     if c.endswith(('.html', '.js', '.css', '.json'))
                     and not c.startswith(('tools/', 'test/', 'backend/')))

if not app_changed:
    ok('매장 화면에 나가는 파일은 바뀌지 않았습니다')
else:
    remote_sw = git('show', 'origin/main:sw.js')
    rm = re.search(r"const VER\s*=\s*'v(\d+)'", remote_sw)
    remote_ver = int(rm.group(1)) if rm else -1
    print('   바뀐 파일: ' + ', '.join(app_changed[:8]) + (' 외 %d개' % (len(app_changed) - 8) if len(app_changed) > 8 else ''))
    if VER is None:
        pass
    elif VER > remote_ver:
        ok('버전이 이미 올라가 있습니다 (실서버 v%d → 올릴 것 v%d)' % (remote_ver, VER))
    elif CHECK_ONLY:
        fail('파일은 바뀌었는데 캐시 버전이 그대로입니다 (v%d) — 매장 폰이 옛 화면을 붙듭니다' % VER)
    else:
        new = VER + 1
        n = 0
        for f in sorted(list(ROOT.glob('*.html')) + list(ROOT.glob('js/*.js')) + list(ROOT.glob('css/*.css'))):
            t = f.read_text(encoding='utf-8')
            if '?v=%d' % VER in t:
                f.write_text(t.replace('?v=%d' % VER, '?v=%d' % new), encoding='utf-8', newline='')
                n += 1
        sw2 = sw_text.replace("const VER = 'v%d'" % VER, "const VER = 'v%d'" % new)
        (ROOT / 'sw.js').write_text(sw2, encoding='utf-8', newline='')
        VER = new
        ok('캐시 버전을 v%d 로 올렸습니다 (%d개 파일 + sw.js)' % (new, n))

        # ★올린 뒤 스스로 다시 센다★ — 바꿔 놓고 "바꿨다"고 믿는 것이 오늘 사고의 형태다.
        left = {}
        for f in sorted(list(ROOT.glob('*.html')) + list(ROOT.glob('js/*.js')) + list(ROOT.glob('css/*.css'))):
            for x in re.findall(r'\?v=(\d+)', f.read_text(encoding='utf-8')):
                if int(x) != new:
                    left.setdefault(int(x), []).append(f.name)
        if left:
            for x, fs in sorted(left.items()):
                fail('버전을 올렸는데 ?v=%d 가 남았습니다 — %s' % (x, ', '.join(sorted(set(fs)))))
        else:
            ok('올린 뒤 다시 세어 보니 전부 v%d 입니다' % new)


# ══════════════════════════════════════════════════════════════
if problems:
    print('\n' + '═' * 60)
    print('배포를 멈춥니다 — 먼저 아래를 해결해 주세요\n')
    for p in problems:
        print('  ✗ ' + p)
    print('═' * 60 + '\n')
    sys.exit(1)

if CHECK_ONLY:
    print('\n' + '═' * 60)
    print('점검만 했습니다. 막는 문제는 없습니다.' + ('  (경고 %d건)' % len(warnings) if warnings else ''))
    print('올리려면:  python tools/release.py')
    print('═' * 60 + '\n')
    sys.exit(0)


# ══════════════════════════════════════════════════════════════
print('\n━━ 6. 올리기 ' + '━' * 46)

if git('status', '--porcelain'):
    print('   커밋할 변경이 있습니다:')
    for line in git('status', '--short').split('\n'):
        print('     ' + line)
    msg = os.environ.get('QSC_MSG') or ('앱 v%d — 배포 도구로 올림' % VER)
    git('add', '-A')
    git('commit', '-m', msg)
    ok('커밋했습니다: %s' % msg)
else:
    ok('커밋할 변경은 없습니다')

ahead = git('rev-list', '--count', 'origin/main..HEAD')
if ahead == '0':
    ok('원격과 이미 같습니다 — 올릴 것이 없습니다')
else:
    print('   올릴 커밋 %s개' % ahead)
    git('push', 'origin', 'main')
    git('fetch', '--quiet', 'origin', 'main')
    if git('rev-parse', 'HEAD') != git('rev-parse', 'origin/main'):
        print('\n✗ push 했는데 원격이 따라오지 않았습니다. 다시 시도해 주세요.\n')
        sys.exit(1)
    ok('올렸습니다 (%s)' % git('rev-parse', '--short', 'HEAD'))


# ══════════════════════════════════════════════════════════════
print('\n━━ 7. 실서버가 정말 새 것을 주는가 ' + '━' * 25)
print('   GitHub Pages 빌드를 기다립니다. 보통 1~2분입니다.')

want_master = json.loads((ROOT / 'data' / 'master.json').read_text(encoding='utf-8'))
want_shopper = sum(len(c['questions']) for c in want_master['shopper_categories'])
want_qsc = sum(len(g['items']) for g in want_master['qsc_groups'])

for attempt in range(1, 13):
    try:
        live_sw = fetch('sw.js')
        lm = re.search(r"const VER\s*=\s*'v(\d+)'", live_sw)
        live_ver = int(lm.group(1)) if lm else -1

        live_master = json.loads(fetch('data/master.json'))
        live_shopper = sum(len(c['questions']) for c in live_master['shopper_categories'])
        live_qsc = sum(len(g['items']) for g in live_master['qsc_groups'])

        live_index = fetch('index.html')
        live_qs = sorted({int(x) for x in re.findall(r'\?v=(\d+)', live_index)})

        # ★source_sha 를 함께 본다★ — version은 날짜뿐이라 같은 날 두 번 고치면 구별이 안 된다.
        #   sha는 엑셀 내용이 한 글자만 달라도 바뀌므로 '올렸는데 안 바뀐' 경우를 잡아낸다.
        same = (live_ver == VER
                and live_master.get('version') == want_master.get('version')
                and live_master.get('source_sha') == want_master.get('source_sha')
                and live_shopper == want_shopper and live_qsc == want_qsc
                and live_qs == [VER])
        print('   [%2d] 실서버 v%s · 평가표 %s(%s) · 쇼퍼 %d · QSC %d'
              % (attempt, live_ver, live_master.get('version'),
                 str(live_master.get('source_sha'))[:6], live_shopper, live_qsc))
        if same:
            print('\n' + '═' * 60)
            print('배포 완료 — 실서버가 새 버전을 주고 있습니다')
            print('  캐시 버전   v%d' % VER)
            print('  평가표      %s (%s)' % (want_master.get('version'), want_master.get('source_sha')))
            print('  문항        QSC %d · 미스터리쇼퍼 %d' % (want_qsc, want_shopper))
            print('  매장        %d곳' % len(want_master.get('stores') or []))
            if warnings:
                print('\n  경고 %d건 (막지는 않았습니다):' % len(warnings))
                for w in warnings:
                    print('   ! ' + w)
            print('''
  ▶ 매장 폰에서 보이게 하려면
     앱을 완전히 닫았다가 다시 열면 됩니다. 그래도 옛 화면이면 한 번 더 새로고침.
     서비스 워커는 새 sw.js 를 받은 다음 실행부터 갈아탑니다.''')
            print('═' * 60 + '\n')
            sys.exit(0)
    except Exception as e:      # noqa: BLE001
        print('   [%2d] 아직 못 받았습니다 (%s)' % (attempt, str(e).split('\n')[0][:60]))
    time.sleep(20)

print('\n' + '═' * 60)
print('올리기는 끝났는데 실서버가 4분 안에 새 것을 주지 않았습니다.')
print('GitHub Pages 빌드가 늦거나 실패했을 수 있습니다. 저장소의 Actions 탭을 확인해 주세요.')
print('  https://github.com/Jeremy9393/Glow_QSC_app/actions')
print('═' * 60 + '\n')
sys.exit(1)
