# -*- coding: utf-8 -*-
"""백엔드(앱스 스크립트) 배포 — clasp 로 올리고 ★있는 배포를 수정★한다.

  python tools/deploy_backend.py "v3.16-17 설명"
  python tools/deploy_backend.py --if-changed "설명"   ← 안 바뀌었으면 그냥 넘어간다
  (또는 백엔드배포.bat 을 더블클릭)

  --if-changed 는 배포.bat 이 쓴다. 화면만 고친 날 백엔드 버전이 쓸데없이 하나씩
  늘어나지 않게, Code.gs 가 지난번 배포 때와 같으면 아무 일도 하지 않는다.
  판단 근거는 backend/.deployed.json 에 적어 둔 지난 배포의 파일 지문(sha256)이다.

────────────────────────────────────────────────────────────────────
왜 이 스크립트가 있는가
────────────────────────────────────────────────────────────────────
종전에는 편집기에 코드를 손으로 붙여넣고 [배포 관리 → 수정 → 새 버전]을 눌렀다.
2026-08-24 하루에만 이런 일이 있었다:

  · 붙여넣는 사이 클립보드가 덮어써져 Code.gs 가 39자·72자·1자로 줄었다 (세 번)
  · 창 배율이 흔들려(1396↔1426↔1745) 공유 대화상자를 잘못 열었다
  · '편집기 = 로컬'인지 눈으로 못 봐 매번 해시를 계산해야 했다

★그 화면에는 '새 배포' 버튼이 '수정' 바로 옆에 있다.★
그걸 누르면 /exec 주소가 바뀌고 매장 26곳이 그 자리에서 멈춘다.

이 스크립트에는 '새 배포'라는 길이 없다. 주소는 ★앱이 실제로 부르는 곳★에서
읽어 오므로 엉뚱한 배포를 건드릴 수도 없다.

────────────────────────────────────────────────────────────────────
무엇을 하는가
────────────────────────────────────────────────────────────────────
① js/api.js 의 APPS_SCRIPT_URL 에서 배포 ID를 뽑는다  ← ★단일 출처★
② clasp 가 아는 배포 목록에 그 ID가 있는지 확인한다   ← 오타·엉뚱한 값 차단
③ ping 응답의 버전 라벨을 새 버전 번호로 맞춘다       ← ★ping 하나로 확인이 끝나게★
④ clasp push      — backend/ 의 Code.gs·appsscript.json 을 올린다
⑤ clasp deploy --deploymentId <그 ID>  — 새 버전을 만들어 ★그 배포에 끼운다★
⑥ 실서버에 물어 정말 ★그 버전★을 주는지 확인한다
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, 'backend')
STAMP = os.path.join(BACKEND, '.deployed.json')   # 지난 배포의 파일 지문
ARGS = sys.argv[1:]
IF_CHANGED = '--if-changed' in ARGS
if IF_CHANGED:
    ARGS = [a for a in ARGS if a != '--if-changed']
NODE = os.path.abspath(os.path.join(ROOT, '..', '_도구', 'node'))
CLASP = os.path.abspath(os.path.join(ROOT, '..', '_도구', 'node_modules', '.bin', 'clasp.cmd'))

FAILED = []


def ok(m):
    print('\u2713 ' + m)


def warn(m):
    print('\u26a0 ' + m)


def fail(m):
    print('\u2717 ' + m)
    FAILED.append(m)


def line(title, n=40):
    print('\n\u2501\u2501 ' + title + ' ' + '\u2501' * n)


def run(args, quiet=False):
    """clasp 를 부른다. node 를 PATH 앞에 끼워 준다(설치본이 아니라 압축본이라서)."""
    env = dict(os.environ)
    env['PATH'] = NODE + os.pathsep + env.get('PATH', '')
    p = subprocess.run([CLASP] + args, cwd=BACKEND, env=env,
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = (p.stdout or '') + (p.stderr or '')
    if not quiet:
        for ln in out.splitlines():
            if ln.strip():
                print('   ' + ln)
    return p.returncode, out


# ── 0. 도구가 있는가 ────────────────────────────────────────────
def gs_sha():
    with open(os.path.join(BACKEND, 'Code.gs'), 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


# ── -1. 바뀐 게 없으면 아무 일도 하지 않는다 ────────────────────
#
#  배포.bat 이 화면·백엔드를 한 번에 다루면서, 화면만 고친 날에도 여기까지 들어온다.
#  그때마다 배포하면 백엔드 버전만 쓸데없이 늘고, 나중에 이력을 볼 때
#  '이 버전에서 뭐가 바뀌었나'를 알 수 없게 된다. 그래서 지문을 대조하고 넘어간다.
if IF_CHANGED:
    line('백엔드가 바뀌었나')
    try:
        old = json.load(open(STAMP, encoding='utf-8'))
    except Exception:
        old = {}
    if old.get('sha256') == gs_sha():
        ok('Code.gs 가 지난 배포(버전 %s) 때와 같습니다 — 백엔드는 넘어갑니다' % old.get('version', '?'))
        sys.exit(0)
    print('   Code.gs 가 바뀌었습니다 — 배포합니다'
          + ('' if old else ' (지난 배포 기록이 없어 처음으로 봅니다)'))


line('0. 도구 확인')
for path, what in [(os.path.join(NODE, 'node.exe'), 'Node.js'), (CLASP, 'clasp')]:
    if os.path.isfile(path):
        ok('%s \u2014 %s' % (what, path))
    else:
        fail('%s 가 없습니다: %s' % (what, path))
if FAILED:
    print('\n_도구 폴더가 통째로 없어졌을 수 있습니다. 설치부터 다시 하십시오.')
    sys.exit(1)

if not os.path.isfile(os.path.expanduser('~/.clasprc.json')):
    fail('clasp 로그인이 안 되어 있습니다 \u2014 `clasp login` 을 먼저 하십시오')
    sys.exit(1)
ok('clasp 로그인 자격증명 있음')


# ── 1. 앱이 실제로 부르는 주소에서 배포 ID를 뽑는다 ──────────────
line('1. 배포 대상')
api = open(os.path.join(ROOT, 'js', 'api.js'), encoding='utf-8').read()
m = re.search(r"APPS_SCRIPT_URL\s*:\s*'https://script\.google\.com/macros/s/([A-Za-z0-9_-]+)/exec'", api)
if not m:
    fail('js/api.js 에서 APPS_SCRIPT_URL 을 못 읽었습니다')
    sys.exit(1)
DEPLOY_ID = m.group(1)
ok('앱이 부르는 배포: ...%s' % DEPLOY_ID[-16:])

code, out = run(['list-deployments'], quiet=True)
if code != 0:
    fail('배포 목록을 못 읽었습니다\n' + out)
    sys.exit(1)
if DEPLOY_ID not in out:
    fail('그 배포 ID가 목록에 없습니다 \u2014 js/api.js 와 실제 프로젝트가 어긋났습니다')
    print(out)
    sys.exit(1)
for ln in out.splitlines():
    if DEPLOY_ID in ln:
        ok('목록에서 확인:' + ln.split(DEPLOY_ID)[-1].rstrip())


# ── 2. 새 버전 번호를 코드에 새긴다 ─────────────────────────────
#
#  Code.gs 의 ping 응답에 `v: 'vNN'` 라벨이 있다. 손으로 적던 것이라
#  ★배포 버전과 어긋나 있었다★(배포는 34인데 라벨은 v33). 그러면 사람이
#  "실서버가 새것인가"를 그 값으로 판단할 수 없다 — 오히려 속는다.
#  이제 배포할 때마다 여기서 맞춘다. 그래서 ★ping 하나로 확인이 끝난다★.
#
#  번호는 '지금 있는 최고 버전 + 1'로 미리 짐작한다(우리 말고 배포하는 사람이 없다).
#  어긋나면 4·5단계가 잡아내 알려 준다 — 조용히 넘어가지 않는다.
line('2. 버전 라벨 맞추기')
code, out = run(['list-versions'], quiet=True)
vers = [int(x) for x in re.findall(r'^\s*(\d+)', out, re.M)] if code == 0 else []
NEXT = (max(vers) + 1) if vers else None
GS = os.path.join(BACKEND, 'Code.gs')
src = open(GS, encoding='utf-8').read()
cur = re.search(r"v:\s*'v(\d+)'", src)
if NEXT is None:
    warn('버전 목록을 못 읽어 라벨은 그대로 둡니다')
elif not cur:
    warn("Code.gs 에서 v: 'vNN' 라벨을 못 찾아 그대로 둡니다")
elif cur.group(1) == str(NEXT):
    ok('라벨이 이미 v%d 입니다' % NEXT)
else:
    open(GS, 'w', encoding='utf-8', newline='').write(
        src[:cur.start()] + ("v: 'v%d'" % NEXT) + src[cur.end():])
    ok('라벨 v%s \u2192 v%d' % (cur.group(1), NEXT))


# ── 3. 올린다 ───────────────────────────────────────────────────
line('3. 코드 올리기 (clasp push)', 27)
code, out = run(['push', '--force'])
if code != 0:
    fail('push 실패')
    sys.exit(1)
ok('올렸습니다')


# ── 4. 새 버전을 만들어 그 배포에 끼운다 ────────────────────────
desc = ' '.join(ARGS).strip() or time.strftime('%Y-%m-%d %H:%M 배포')
line('4. 새 버전 + 배포 수정', 32)
print('   설명: ' + desc)
code, out = run(['deploy', '--deploymentId', DEPLOY_ID, '--description', desc])
if code != 0:
    fail('배포 실패 \u2014 실서버는 이전 버전 그대로입니다')
    sys.exit(1)
mv = re.search(r'@(\d+)', out)
LIVE = int(mv.group(1)) if mv else None
if LIVE is None:
    warn('배포는 됐는데 버전 번호를 못 읽었습니다')
else:
    ok('배포했습니다 \u2014 버전 %d' % LIVE)
    if NEXT is not None and LIVE != NEXT:
        fail('\u2605버전 라벨이 어긋났습니다\u2605 \u2014 코드에는 v%d 라고 새겼는데 실제 버전은 %d 입니다. '
             '이 스크립트를 한 번 더 돌리면 맞춰집니다' % (NEXT, LIVE))


# ── 5. 실서버가 정말 ★새것★을 주는가 ───────────────────────────
line('5. 실서버 확인', 38)
url = 'https://script.google.com/macros/s/%s/exec' % DEPLOY_ID
try:
    r = urllib.request.urlopen(url + '?action=ping', timeout=90).read().decode('utf-8')
    j = json.loads(r)
    if not j.get('ok'):
        fail('실서버가 ok=false 를 돌려줍니다: ' + r[:200])
    else:
        label = str(j.get('v') or '')
        ok('실서버 응답 정상 \u2014 service=%s' % j.get('service'))
        if LIVE is None:
            warn('버전 번호를 몰라 라벨 대조는 건너뜁니다 (라벨: %s)' % (label or '없음'))
        elif label == ('v%d' % LIVE):
            ok('\u2605실서버가 새 코드를 주고 있습니다\u2605 \u2014 ping 이 %s 라고 답합니다' % label)
        else:
            fail('실서버가 아직 %s 를 주고 있습니다 (기대: v%d) \u2014 잠시 뒤 ping 을 다시 보십시오'
                 % (label or '(라벨 없음)', LIVE))
except Exception as e:
    fail('실서버에 닿지 못했습니다: %s' % e)


# \u2500\u2500 6. \ubb34\uc5c7\uc744 \ubc30\ud3ec\ud588\ub294\uc9c0 \uc9c0\ubb38\uc73c\ub85c \ub0a8\uae34\ub2e4 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#     \ub2e4\uc74c\ubc88 --if-changed \uac00 \uc774\uac78 \ubcf4\uace0 '\ub118\uc5b4\uac08\uc9c0'\ub97c \uc815\ud55c\ub2e4.
if not FAILED:
    json.dump({'sha256': gs_sha(), 'version': LIVE, 'when': time.strftime('%Y-%m-%d %H:%M:%S'),
               'description': desc},
              open(STAMP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


print('\n' + '\u2550' * 60)
if FAILED:
    print('끝났지만 확인할 것이 %d 건 있습니다:' % len(FAILED))
    for x in FAILED:
        print('  \u2717 ' + x)
else:
    print('배포 완료 \u2014 주소는 그대로입니다')
    print('  배포 ID  ...%s' % DEPLOY_ID[-16:])
    print('  버전     %s' % (LIVE if LIVE is not None else '?'))
    print('  설명     %s' % desc)
print('\u2550' * 60)
sys.exit(1 if FAILED else 0)
