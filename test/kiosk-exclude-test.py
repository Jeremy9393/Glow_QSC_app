# -*- coding: utf-8 -*-
"""매장 구조상 답할 수 없는 문항 빼기 — 조용히 깨지는 것을 막는다 (2026-09-08)

담당자 결정 —
  키오스크로만 주문하는 매장에는 「직원이 메뉴를 설명했나요」가 성립하지 않는다.
  손님이 「아니오」를 고르면 ★매장이 잘못한 것이 아닌데 감점★이 된다.
  ★손님에게 「해당 없음」 버튼은 주지 않는다★ — 우려 원문:
    *"업셀링을 안했다는건 안한건다 해당없음 같이 표시해버릴까봐"*
  그래서 본사가 data/store-types.json 에 미리 적고, 그 매장 손님에게는 문항이 아예 안 뜬다.
  「일부만 키오스크」 매장은 손님이 ★주문 방법★(사실)을 한 번 고르면 그 갈래만 뺀다.

★이 시험이 막으려는 것★ — 전부 「오류 없이 숫자만 틀리는」 종류다:
  ① 설정의 매장명이 통합시트와 어긋나 ★아무 매장에도 안 걸리는★ 설정이 되는 것
  ② 평가표에서 문항 번호가 바뀌어 ★엉뚱한 문항이 사라지는★ 것
     (2026-08-18 에 실제로 밀렸다 — 그래서 번호가 아니라 코드로 다룬다)
  ③ 화면·채점·제출 중 ★한 곳만★ allQs 로 되돌아가는 것
     → 진행률은 36인데 제출 검사는 38이면 손님이 ★영영 제출하지 못한다★.
       화면에 없는 문항을 채우라는 말을 듣고 원인을 찾을 방법이 없다 — 막다른 길이다
  ④ allQs 를 아예 걸러 버리는 것 → updaters[q.no] 가 없어져
     임시저장 복원 루프가 TypeError 로 죽는다 (그 손님은 화면이 그 자리에서 멈춘다)
  ⑤ applyExclusions 를 부르는 자리를 빠뜨려 ★가끔만 먹는★ 상태가 되는 것

★둘레 검색으로 판정하지 않는다★ (2026-09-08 교훈 — ms-defer-guard-test 가 그렇게 만들었다가
  옆줄의 다른 가드에 속아 진짜 구멍을 못 잡았다). 함수 본문을 잘라내 ★그 안에서만★ 본다.
"""
import io, json, re, sys
from pathlib import Path

ROOT = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

CORE = (ROOT / 'js' / 'shopper-core.js').read_text(encoding='utf-8')
MASTER = json.loads((ROOT / 'data' / 'master.json').read_text(encoding='utf-8'))
TYPES_RAW = json.loads((ROOT / 'data' / 'store-types.json').read_text(encoding='utf-8'))
EXTRACT = (ROOT / 'tools' / 'extract_master.py').read_text(encoding='utf-8')
GS = (ROOT / 'backend' / 'Code.gs').read_text(encoding='utf-8')

_p = _f = 0


def ok(name, got, want):
    global _p, _f
    if got == want:
        _p += 1
    else:
        _f += 1
        print('  ✗ %s\n      나온 값 %r\n      바란 값 %r' % (name, got, want))


def body_of(src, sig, end='\n  }'):
    """js 함수 본문을 잘라낸다 — ★그 안에서만★ 본다 (둘레에 속지 않으려고)"""
    i = src.find(sig)
    if i < 0:
        return None
    j = src.find(end, i)
    return src[i:j if j > 0 else len(src)]


print('── ① 설정이 실제 매장·문항과 맞물리는가 ──')
types = TYPES_RAW.get('types') or {}
excl = TYPES_RAW.get('kioskExcludes') or []
stores = MASTER.get('stores') or []
ok('[1-1] 설정 매장이 전부 통합시트에 있다',
   sorted(s for s in types if s not in stores), [])
ok('[1-2] 유형은 kiosk 또는 mixed 뿐',
   sorted({t for t in types.values() if t not in ('kiosk', 'mixed')}), [])

codes = []
for c in MASTER['shopper_categories']:
    for q in c['questions']:
        m = re.match(r'^(\d+-\d+)\.', str(q['text']))
        codes.append(m.group(1) if m else None)
ok('[1-3] 문항이 전부 코드로 시작한다 (코드로 빼므로 하나라도 없으면 못 뺀다)',
   [i for i, c in enumerate(codes) if not c], [])
ok('[1-4] ★뺄 문항이 평가표에 실제로 있다★', [c for c in excl if c not in codes], [])
# ★2026-09-10 에 7번(결제)이 통째로 빠졌다★ — 담당자:
#   *"키오스크로 결제하면 7-1이나 7-3이 매장 입장에선 실수한게 없는거 아니야?"*
#   *"7-1, 7-2는 그냥 키오스크에서 삭제하자"*
#   ⚠같은 날 오전에 「7-1·7-2 는 문구를 넓혀 살린다」로 적어 두었던 것을 ★담당자가 뒤집었다★.
#   ⚠이로써 키오스크 기기 문제(먹통·카드리더기·영수증 용지·잔돈)를 잡는 자리가
#     회사 전체에 없어졌다 — QSC 74문항에도 없다(2026-09-10 전수 확인). 담당자가 알고 골랐다.
# ★이 줄은 「모르는 사이에 늘어나는 것」을 막는 자물쇠다★ — 늘릴 때마다 여기도 함께 고칠 것.
ok('[1-5] 담당자가 정한 것은 3-1·3-2·7-1·7-2·7-3 다섯',
   sorted(excl), ['3-1', '3-2', '7-1', '7-2', '7-3'])
ok('[1-6] ★3-3 은 빼지 않는다★ (문구를 넓혀 살리기로 했다)', '3-3' in excl, False)
# ★7번 카테고리가 통째로 빈다★ — 앱이 제목 줄까지 감추는지는 [6-4] 에서 본다
_cat7 = [c for c in MASTER['shopper_categories'] if c['name'].startswith('7.')]
ok('[1-7] 7번 카테고리가 있다', len(_cat7), 1)
ok('[1-7] ★7번은 문항이 하나도 안 남는다★',
   [q['text'][:5] for q in _cat7[0]['questions']
    if re.match(r'^(\d+-\d+)\.', q['text']).group(1) not in excl], [])
ok('[1-8] 키오스크 방문은 33문항', sum(len(c['questions']) for c in MASTER['shopper_categories'])
   - len(excl), 33)

print('── ② master.json 에 실려 앱까지 가는가 ──')
ok('[2-1] store_types 가 실렸다', MASTER.get('store_types'), types)
ok('[2-2] kiosk_excludes 가 실렸다', MASTER.get('kiosk_excludes'), excl)
ok('[2-3] 키오스크 전용 2곳', sorted(s for s, t in types.items() if t == 'kiosk'),
   ['도넛정수', '우물집 판교'])
ok('[2-4] 일부만 키오스크 2곳', sorted(s for s, t in types.items() if t == 'mixed'),
   ['이티에프 베이커리 성수', '제주당'])

print('── ③ 화면·채점·제출이 ★모두★ activeQs 를 쓰는가 ──')
# 한 곳만 allQs 로 남으면 손님이 영영 제출하지 못한다 (막다른 길)
b = body_of(CORE, '  function answersInOrder() {')
ok('[3-1] answersInOrder — activeQs 를 쓴다', bool(b and 'activeQs()' in b), True)
ok('[3-2] answersInOrder — allQs 가 남아 있지 않다', bool(b and 'allQs' in b), False)

b = body_of(CORE, '  function recompute() {')
b = b[:b.find('if (!ADMIN) return;')] if b and 'if (!ADMIN) return;' in b else b
ok('[3-3] 진행률 — activeQs 를 쓴다', bool(b and 'activeQs()' in b), True)
ok('[3-4] 진행률 — allQs.length 로 나누지 않는다', bool(b and 'allQs' in b), False)

# 제출 게이트 — 「const act = activeQs()」 로 받아 그 act 로 센다 (allQs 로 세면 막다른 길)
# ★세는 줄에서 위로 거슬러 본다★ — recompute 에도 같은 이름의 act 가 있어서
#   앞에서부터 찾으면 엉뚱한 쪽을 집는다(실제로 한 번 그렇게 짚었다)
i = CORE.find('const answered = act.filter')
b = CORE[max(0, i - 200):i] if i >= 0 else None
ok('[3-5] 제출 게이트 — act 로 센다', i >= 0, True)
ok('[3-6] ★그 act 가 바로 위에서 activeQs() 로 왔다★',
   bool(b and 'const act = activeQs();' in b), True)
ok('[3-6b] 남은 개수도 act 로 센다', 'const missing = act.length - answered;' in CORE, True)
ok('[3-7] 이유 안 적은 문항도 act 에서 찾는다 (빠진 문항을 물으면 답할 수 없다)',
   'const noReason = act.filter(function (q) {' in CORE, True)

ok('[3-8] ★제출 payload — activeQs 를 쓴다★ (빠진 문항은 시트에 줄을 만들지 않는다)',
   'answers: activeQs().map(function (q) {' in CORE, True)
ok('[3-9] payload — allQs.map 이 아니다',
   'answers: allQs.map(function (q) {' in CORE, False)
ok('[3-10] payload 에 주문방법이 실린다',
   "way: ($('#way') && $('#way').value) || ''," in CORE, True)

print('── ④ allQs 자체는 그대로 38개인가 (TypeError 방지) ──')
# ★담는 줄 자체를 본다★ — 「어딘가에 allQs.push 가 있다」로는 못 잡는다.
#   `if (...) allQs.push(q)` 처럼 조건을 붙이면 그 문항의 updaters 가 아예 안 생겨,
#   임시저장을 되살리는 루프(updaters[q.no]())가 TypeError 로 죽는다.
#   (자기 검증에서 실제로 이 형태를 놓쳐서 규칙을 조였다 — 2026-09-08)
ok('[4-1a] allQs.push 는 한 곳뿐', CORE.count('allQs.push('), 1)
_i = CORE.find('allQs.push(')
_line = CORE[CORE.rfind('\n', 0, _i) + 1: CORE.find('\n', _i)] if _i >= 0 else ''
ok('[4-1b] ★조건 없이 전부 담는다★ — 거르면 updaters 가 비어 화면이 멈춘다',
   bool(_line) and ' if ' not in _line and 'if(' not in _line
   and 'filter' not in _line and '?' not in _line, True)
ok('[4-1c] 담는 줄에 제외 낱말이 없다',
   not any(w in _line for w in ('excluded', 'kiosk', 'KIOSK', 'activeQs')), True)
b = body_of(CORE, '  function activeQs() {')
ok('[4-2] activeQs 가 allQs 에서 걸러 낸다', bool(b and 'allQs.filter' in b), True)
ok('[4-3] 임시저장 복원은 여전히 allQs 전체를 돈다 (updaters 가 38개니까)',
   'allQs.forEach(function (q) { updaters[q.no](); });' in CORE, True)

print('── ⑤ applyExclusions 를 부르는 자리 ──')
# 하나라도 빠지면 「가끔만 먹는」 가장 잡기 나쁜 상태가 된다
ok('[5-1] 정의가 있다', CORE.count('function applyExclusions()'), 1)
ok('[5-2] ★매장이 정해지는 곳(fillStores 끝)에서 부른다★',
   bool(body_of(CORE, '  function fillStores(', '\n  }') and
        'applyExclusions()' in body_of(CORE, '  function fillStores(', '\n  }')), True)
ok('[5-3] 매장·주문방법 change 에서 부른다',
   'function onScopeChange() { applyExclusions(); recompute(); saveDraft(); }' in CORE, True)
ok('[5-4] store change 리스너가 걸려 있다',
   "$('#store').addEventListener('change', onScopeChange);" in CORE, True)
ok('[5-5] way change 리스너가 걸려 있다',
   "if ($('#way')) $('#way').addEventListener('change', onScopeChange);" in CORE, True)
ok('[5-6] ★초기화 끝(카드가 다 만들어진 뒤)에서 한 번 더★ — recompute 보다 먼저',
   re.search(r'applyExclusions\(\);\s*\n\s*recompute\(\);\s*\n\}', CORE) is not None, True)

print('── ⑥ 빠진 문항을 어떻게 다루는가 ──')
b = body_of(CORE, '  function applyExclusions() {')
# ★2026-09-08 뒤집은 규칙★ — 처음에는 지웠는데 그 전제가 틀렸다.
#   채점·집계·게이트·payload 가 이미 activeQs()/excluded 로 거르므로 숨긴 답은 새지 않는다.
#   지우면 잃는 것만 있었다: 손님이 카운터로 비고를 길게 적고 주문 방법을 잘못 눌렀다가
#   되돌리면 ★그 글이 되돌릴 수단 없이 사라졌다★(onScopeChange 가 곧바로 saveDraft 를 부른다).
ok('[6-1] ★답을 지우지 않는다★ — 되돌아오면 그대로 있어야 한다',
   bool(b) and 'delete state.answers' not in b, True)
ok('[6-2] ★비고도 지우지 않는다★', bool(b) and 'delete state.memos' not in b, True)
ok('[6-2b] 숨긴 답이 새지 않는 근거 — 채점이 activeQs 를 본다',
   'return activeQs().map(function (q) {' in CORE, True)
ok('[6-3] 카드를 여닫는다 (다시 그리지 않는다)', bool(b and 'card.hidden' in b), True)
ok('[6-4] 통째로 빈 카테고리는 섹션도 감춘다', bool(b and 'sec.hidden' in b), True)
ok('[6-5] mixed 가 아니면 주문방법 값도 비운다', bool(b and "waySel.value = ''" in b), True)
ok('[6-6] 코드로 판정한다 (번호가 아니라)', bool(b and 'codeOf(q)' in b), True)

print('── ⑦ 주문 방법 칸 ──')
ok('[7-1] 기본은 숨김', "{ id: 'way', label: '주문 방법 *', full: true, hide: true," in CORE, True)
ok('[7-2] 두 갈래뿐', sorted(re.findall(r'<option value="(카운터|키오스크)">', CORE)),
   ['카운터', '키오스크'])
ok('[7-3] mixed 에서만 필수',
   "{ id: 'way', label: '주문 방법', pick: true, when: function () "
   "{ return storeType() === 'mixed'; } }," in CORE, True)
ok('[7-4] 필수 검사가 when 을 본다 — 없는 칸을 요구하면 제출이 막힌다',
   'if (f.when && !f.when()) continue;' in CORE, True)
ok('[7-5] 임시저장에 담긴다', "way: $('#way') ? $('#way').value : ''," in CORE, True)
# ★2026-09-08 조인 규칙★ — 임시저장 열쇠는 매장별로 갈리지 않는다.
#   조건 없이 되살리면 mixed 매장 A 에서 고른 「키오스크」가 mixed 매장 B 로 따라와,
#   ★손님이 한 번도 고르지 않았는데 3-1·3-2 가 빠진 채 제출된다★ — 우려가 다른 문으로 들어온다.
ok('[7-6] ★같은 매장일 때만 되살린다★',
   "$('#way').value = (draft.store && draft.store === $('#store').value)" in CORE, True)
ok('[7-6b] 조건 없는 옛 복원이 남아 있지 않다',
   "if ($('#way')) $('#way').value = draft.way || '';" in CORE, False)
ok('[7-6c] 임시저장에 매장이 담긴다 — 비교할 대상이 있어야 한다',
   "store: $('#store').value," in CORE, True)

print('── ⑧ 시트 열 (백엔드) ──')
i = GS.find('const MS_COL = {')
b = GS[i:GS.find('};', i)] if i >= 0 else ''
ok('[8-1] MS_COL.way 는 17', 'way: 17,' in b, True)
i = GS.find('const MS_HEADER = [')
b = GS[i:GS.find('];', i)] if i >= 0 else ''
ok('[8-2] 머리글에 주문방법이 있다', "'주문방법'," in b, True)
b = body_of(GS, 'function saveShopper(', '\n}')
ok('[8-3] saveShopper 가 p.way 를 적는다', bool(b and "p.way || ''" in b), True)
ok('[8-4] ★옛 시트(16열)에 머리글을 채워 준다★ — 안 하면 이름 없는 칸이 남는다',
   'function msFixHeader(sh)' in GS and 'msFixHeader(sh);' in GS, True)

print('── ⑨ extract_master.py 가 어긋난 설정을 막는가 ──')
ok('[9-1] 매장명이 통합시트에 없으면 멈춘다',
   '★중단★ store-types.json 의 매장명이 통합시트에 없습니다' in EXTRACT, True)
ok('[9-2] 유형이 kiosk/mixed 가 아니면 멈춘다',
   "if t not in ('kiosk', 'mixed')" in EXTRACT, True)
ok('[9-3] ★뺄 문항이 평가표에 없으면 멈춘다★ — 번호가 밀려도 조용히 지나가지 않는다',
   'kioskExcludes 문항이 평가표에 없습니다' in EXTRACT, True)
ok('[9-4] 설정 파일이 없어도 죽지 않는다 (전 매장 38문항)',
   'if _ST.exists():' in EXTRACT, True)

print('\n' + ('★%d개 실패★' % _f if _f else '전부 통과') + '  (통과 %d)' % _p)
sys.exit(1 if _f else 0)
