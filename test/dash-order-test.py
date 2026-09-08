# -*- coding: utf-8 -*-
"""통합시트 화면 — 줄세우기를 하지 않는다 (2026-09-08 담당자)

담당자 원문:
  *"매장들 정렬을 점수대로하지말고 실제 시트에있는 순서대로(이름순일꺼야) 해줘..
    1등부터 꼴등까지 매기는건 별로 좋지 않아서"*
  *"위생, CS 점수 옆에 각 등급도 (우수) 이런식으로 살짝 글씨체 작게"*
  *"대상 점검 위생평균, CS평균(10월부턴 MS평균으로 바뀌겠지), 종합평균 으로 바꿔줘"*
  *"「점수는 본사 집계 후 반영됩니다.」 이것만 남기는건 어때? 이거 매장에서도 다 보는 내용이라서"*

★이 시험이 막으려는 것★ — 전부 「오류 없이 조용히 되돌아가는」 종류다:
  ① 서버가 다시 점수순으로 보내는 것 (ordered = scored.concat(unscored) 로 되돌아감)
  ② 앱이 다시 정렬하는 것 (rank 로 sort)
  ③ 평균이 종합 하나로 되돌아가는 것
  ④ 열 이름을 화면에 박아 10월에 「위생」이 그대로 남는 것
     — 서버가 cols.qsc/cols.ms 를 주는데 화면이 안 쓰면 표 머리글과 요약 줄이 서로 다른 말을 한다
  ⑤ 하단 문구가 「본사 통합시트 입력 기준 · N분 전」으로 되돌아가는 것
  ⑥ ★오프라인·갱신 중 꼬리표가 사라지는 것★ — 그러면 옛 숫자를 최신인 양 보여 준다
     (이 화면 최악의 사고라고 코드 주석이 못박아 둔 것)

★서버 쪽은 진짜 함수를 잘라내 node 로 돌린다★ (avgOf 는 dashboardGet 안에 있어
  통째로 잘라내기 어렵다 — 대신 그 자리의 코드를 자리별로 확인한다).
"""
import io, re, sys
from pathlib import Path

ROOT = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

APP = (ROOT / 'js' / 'dashboard-app.js').read_text(encoding='utf-8')
GS = (ROOT / 'backend' / 'Code.gs').read_text(encoding='utf-8')
CSS = (ROOT / 'css' / 'app.css').read_text(encoding='utf-8')
AUTH = (ROOT / 'js' / 'auth.js').read_text(encoding='utf-8')

_p = _f = 0


def ok(name, got, want):
    global _p, _f
    if got == want:
        _p += 1
    else:
        _f += 1
        print('  ✗ %s\n      나온 값 %r\n      바란 값 %r' % (name, got, want))


def nocomment(src):
    """주석을 걷어낸다 — ★주석에 적힌 낱말을 코드로 오해하면 시험이 거짓말을 한다★
       (이 시험 첫 판이 「r.rank」와 「아직 점수가 입력되지 않은」을 주석에서 찾아
        멀쩡한 코드를 실패로 판정했다. 이 폴더는 주석에 결정 이유를 길게 적는 습관이 있어
        문자열 검사에서 특히 잘 걸린다)"""
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    return re.sub(r'^\s*//.*$', '', src, flags=re.M)


def body(src, start, end='\n  }'):
    i = src.find(start)
    if i < 0:
        return ''
    j = src.find(end, i)
    return src[i:j if j > 0 else len(src)]


print('── ① 서버가 시트 순서로 보낸다 ──')
ok('[1-1] ★ordered 가 rows 그대로★ (점수순으로 재정렬하지 않는다)',
   'const ordered = rows;' in GS, True)
ok('[1-2] 옛 점수순 조립이 남아 있지 않다',
   'const ordered = scored.concat(unscored);' in GS, False)
# rank 는 계속 담는다 — 전월 대비 delta 를 내는 데 쓰인다
ok('[1-3] rank 계산은 그대로 (delta 가 쓴다)',
   'for (let i = 0; i < scored.length; i++) scored[i].rank = i + 1;' in GS, True)

print('── ② 앱이 다시 정렬하지 않는다 ──')
b = body(APP, '  function renderRows(data, hasHC) {', '\n    let mineRow')
ok('[2-1] rows 를 그대로 쓴다', 'const rows = (data.rows || []).slice();' in b, True)
ok('[2-2] ★sort 가 없다★', '.sort(' in b, False)
ok('[2-3] rank 로 줄을 세우지 않는다',
   'a.rank' in nocomment(b) or 'r.rank' in nocomment(b), False)

print('── ③ 평균 셋 ──')
ok('[3-1] 서버가 avgQsc 를 담는다', 'avgQsc: avgOf(' in GS, True)
ok('[3-2] 서버가 avgCs 를 담는다', 'avgCs: avgOf(' in GS, True)
ok('[3-3] 종합 평균은 그대로', 'avgTotal:' in GS, True)
# ★그 점수가 있는 매장만으로 나눈다★ — 없는 값을 0으로 치면 평균이 주저앉는다
_b = body(GS, '  function avgOf(pick) {', '\n  }')
ok('[3-4] ★숫자인 것만 세어 나눈다★ (빈 값을 0으로 치지 않는다)',
   "filter(function (x) { return typeof x === 'number'; })" in _b, True)

b = body(APP, '  function renderStats(data) {', '\n    setNote')
ok('[3-5] 화면이 다섯 칸을 그린다',
   [k for k in ["['대상'", "['점검'", "(cols.qsc", "(cols.ms", "['종합평균'"] if k not in b], [])
ok('[3-6] ★열 이름은 서버가 준 것을 쓴다★ — 10월에 QSC·MS 로 따라가야 한다',
   "(cols.qsc || '위생') + '평균'" in b and "(cols.ms || 'CS') + '평균'" in b, True)
ok('[3-7] 종합평균 칸이 있다', "['종합평균', fmt1(s.avgTotal)]" in b, True)

print('── ④ 점수 옆 등급 ──')
ok('[4-1] scoreTd 가 있다', 'function scoreTd(row, score, grade)' in APP, True)
ok('[4-2] 위생·CS 두 열이 scoreTd 를 쓴다',
   'scoreTd(tr, none ? null : r.qsc, none ? \'\' : r.qscGrade);' in APP
   and 'scoreTd(tr, none ? null : r.cs, none ? \'\' : r.csGrade);' in APP, True)
_b = body(APP, '  function scoreTd(row, score, grade) {', '\n  }')
ok('[4-3] 괄호로 감싼다', "'(' + grade + ')'" in _b, True)
ok('[4-4] ★서버 문자열은 textContent★ (등급 이름이 바뀌어도 화면이 안 깨진다)',
   'g.textContent =' in _b and 'innerHTML' not in _b, True)
ok('[4-5] 등급이 없으면 점수만', 'if (grade) {' in _b, True)
ok('[4-6] 점수가 없으면 —', "c.textContent = '—'" in _b, True)
ok('[4-7] 작은 글씨 CSS 가 있다', '.sumTable .gradeTag' in CSS, True)
_g = CSS[CSS.find('.sumTable .gradeTag'):CSS.find('\n', CSS.find('.sumTable .gradeTag'))]
ok('[4-8] 본문(13px)보다 작다', 'font-size: 10.5px' in _g, True)
# 열을 새로 만들지 않았다 — 표 머리글은 그대로 여섯 개
_h = body(APP, '  function renderHead(cols, hasHC) {', '\n    heads.forEach')
# 매장(초기값) + push 5개 = 위생·CS·개선·종합·등급 → 여섯 열. 등급을 점수 칸에 붙였을 뿐
# 열을 새로 만들지는 않았다
ok('[4-9] ★등급 열을 따로 만들지 않았다★ (폰에서 가로로 밀린다)',
   _h.count('heads.push') == 5 and "heads.push(['위생등급'" not in _h, True)

print('── ⑤ 하단 문구 ──')
ok('[5-1] ★「점수는 본사 집계 후 반영됩니다.」★',
   "$('#trust').textContent = '점수는 본사 집계 후 반영됩니다.'" in APP, True)
ok('[5-2] 옛 문구가 남아 있지 않다', "'본사 통합시트 입력 기준 · '" in APP, False)
ok('[5-3] ★오프라인 꼬리표는 남는다★ — 없으면 옛 숫자가 최신으로 읽힌다',
   "offline ? ' (저장된 화면)'" in APP, True)
ok('[5-4] ★갱신 중 꼬리표도 남는다★',
   "stale ? ' (지난번 받아둔 화면 · 갱신 중)'" in APP, True)
ok('[5-5] 「몇 분 전」은 상단에 그대로', "$('#freshInfo').textContent" in APP, True)
ok('[5-6] 「아직 점수가 입력되지 않은 매장이 N곳」 줄은 없앴다 (주석에 남은 설명은 뺀다)',
   '아직 점수가 입력되지 않은 매장이' in nocomment(APP), False)

print('── ⑥ 불러오는 중 표시 (빈 화면이면 덮개 · 볼 게 있으면 작은 표시) ──')
ok('[6-1] 캐시본이 있으면 작은 표시',
   "if (staleShown || (shownKey && key === shownKey)) Busy.tiny(true);" in APP, True)
ok('[6-2] 빈 화면이면 덮개', "else Busy.on('불러오는 중입니다…');" in APP, True)
ok('[6-3] ★끝나는 자리에서 둘 다 끈다★', APP.count('Busy.off(); Busy.tiny(false);') >= 2, True)

print('── ⑦ 버전 표기 (사람이 보는 이름) ──')
ok('[7-1] ★100으로 나눠 보여 준다★ — 112 → 1.12',
   "ver = (Number(m[1]) / 100).toFixed(2);" in AUTH, True)
ok('[7-2] 옛 표기(v112)가 남아 있지 않다', "ver = 'v' + m[1];" in AUTH, False)
ok('[7-3] ★내부 숫자는 그대로★ — ?v= 는 캐시 열쇠이고 배포 도구가 센다',
   "match(/[?&]v=(\\d+)/)" in AUTH, True)

# ★배포 도구가 찍는 버전도 1.xx 다★ (2026-09-08 담당자 — *"버전이름들 1.xx 이런식으로 다 바꿔줘"*)
REL = (ROOT / 'tools' / 'release.py').read_text(encoding='utf-8')
DEP = (ROOT / 'tools' / 'deploy_backend.py').read_text(encoding='utf-8')
ok('[7-4] release.py 에 vlabel 이 있다', 'def vlabel(n):' in REL, True)
ok('[7-5] deploy_backend.py 에도 있다', 'def vlabel(n):' in DEP, True)
ok('[7-6] 커밋 메시지도 1.xx', "'앱 %s — 배포 도구로 올림' % vlabel(VER)" in REL, True)
ok('[7-7] 배포 요약도 1.xx', "print('  캐시 버전   %s' % vlabel(VER))" in REL, True)
# ★기계가 대조하는 값은 손대지 않았다★ — 건드리면 배포 도구가 스스로 꼬인다
ok('[7-8] sw.js 의 VER 형식은 그대로', """const VER\\s*=\\s*'v(\\d+)'""" in REL, True)
ok('[7-9] ?v= 를 세는 자리도 그대로', '?v=%d' in REL, True)

print('\n' + ('★%d개 실패★' % _f if _f else '전부 통과') + '  (통과 %d)' % _p)
sys.exit(1 if _f else 0)
