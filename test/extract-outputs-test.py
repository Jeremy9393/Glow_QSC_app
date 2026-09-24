# -*- coding: utf-8 -*-
"""extract_master.py 산출물 세 갈래가 맞물리는가 (2026-09-18 담당자 ②-1)

  data/master.json            공개 — ★문항 없음★ (매장·유형·채점 상수·버전)
  data/questions.local.json   문항 전부 — 도구·시험용 · ★저장소 제외★
  backend/Code.gs             QUESTIONS 블록 — 서버가 열쇠를 보고 내려주는 원본

★이 시험이 막으려는 것★ — 전부 「오류 없이 조용히 새는」 종류다:
  ① 공개 파일에 문항이 다시 실리는 것 (extract 를 손댔거나 옛 판을 되살렸을 때)
  ② 세 갈래의 내용·버전이 서로 어긋나는 것 (한쪽만 새로 뽑았을 때)
  ③ questions.local.json 이 저장소에 올라가는 것 (.gitignore 가 풀렸을 때)
  ④ 도구(archive.py)·배포 도구(release.py)가 옛 자리(master.json)에서 문항을 찾는 것
"""
import io, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
_p = _f = 0


def ok(name, got, want=True):
    global _p, _f
    if got == want:
        _p += 1
        print('  ✓ ' + name)
    else:
        _f += 1
        print('  ✗ %s\n      나온 값 %r\n      바란 값 %r' % (name, got, want))


QKEYS = ('qsc_groups', 'shopper_categories', 'texts', 'kiosk_excludes')
pub_text = (ROOT / 'data' / 'master.json').read_text(encoding='utf-8')
pub = json.loads(pub_text)
ql = json.loads((ROOT / 'data' / 'questions.local.json').read_text(encoding='utf-8'))
gs = io.open(ROOT / 'backend' / 'Questions.gs', 'r', encoding='utf-8', newline='').read()   # 2026-09-25 문항 분리 — 블록은 Questions.gs 에
_code_gs = io.open(ROOT / 'backend' / 'Code.gs', 'r', encoding='utf-8', newline='').read()
ok('Code.gs 에는 QUESTIONS 블록이 없다 (문항 분리 · 두 번 선언 방지)', ('@@QUESTIONS_BEGIN' in _code_gs, 'const QUESTIONS = ' in _code_gs), (False, False))

print('── ① 공개 master.json ──')
ok('문항 키가 없다', [k for k in QKEYS if k in pub], [])
ok('매장·유형·채점·버전은 있다', sorted(pub), ['final_weights', 'grades', 'scoring', 'source', 'source_sha', 'store_types', 'stores', 'version'])
ok('매장 26곳', len(pub['stores']), 26)
first_q = ql['qsc_groups'][0]['items'][0]['text']
first_s = ql['shopper_categories'][0]['questions'][0]['text']
ok('★QSC 첫 문항 글이 공개 파일 원문에 없다★', first_q in pub_text, False)
ok('★쇼퍼 첫 문항 글이 공개 파일 원문에 없다★', first_s in pub_text, False)
ok('심각도 표식(S1/S2)이 공개 파일 원문에 없다', '"severity"' in pub_text, False)

print('── ② questions.local.json ──')
ok('키', sorted(ql), ['kiosk_excludes', 'qsc_groups', 'shopper_categories', 'source', 'source_sha', 'store_types', 'texts', 'version'])
ok('QSC 74문항', sum(len(g['items']) for g in ql['qsc_groups']), 74)
ok('QSC 6그룹', len(ql['qsc_groups']), 6)
ok('쇼퍼 38문항', sum(len(c['questions']) for c in ql['shopper_categories']), 38)
ok('쇼퍼 13카테고리', len(ql['shopper_categories']), 13)
ok('키오스크 제외 5', ql['kiosk_excludes'], ['3-1', '3-2', '7-1', '7-2', '7-3'])
ok('texts 5키', sorted(ql['texts']), ['criteria', 'principles', 'shopper_criteria', 'shopper_grade_note', 'shopper_principles'])
ok('store_types 는 공개 파일과 같다', ql['store_types'], pub['store_types'])
ok('version 이 공개 파일과 같다', ql['version'], pub['version'])
ok('source_sha 가 공개 파일과 같다', ql['source_sha'], pub['source_sha'])

print('── ③ Code.gs QUESTIONS 블록 ──')
i, j = gs.find('/* @@QUESTIONS_BEGIN */'), gs.find('/* @@QUESTIONS_END */')
ok('표식 한 쌍', (gs.count('/* @@QUESTIONS_BEGIN */'), gs.count('/* @@QUESTIONS_END */'), 0 <= i < j), (1, 1, True))
blk = gs[i:j]
k = blk.find('const QUESTIONS = ')
ok('const QUESTIONS 한 줄', blk.count('const QUESTIONS = '), 1)
line = blk[k + len('const QUESTIONS = '):blk.rfind(';')]
ok('한 줄 JSON 이다 (줄바꿈 없음)', '\n' in line, False)
gq = json.loads(line)
ok('★블록 내용 = questions.local.json★', gq, ql)
ok('블록 뒤에는 END 표식과 개행뿐 (파일 끝)', gs[j + len('/* @@QUESTIONS_END */'):].strip(), '')
ok('CRLF 없음', '\r' in gs, False)
ok('fnConfigQuestions · fnSurveyQuestions · questionsConst 가 있다 (Code.gs)',
   all(('function %s(' % n) in _code_gs for n in ('fnConfigQuestions', 'fnSurveyQuestions', 'questionsConst')))

print('── ④ 저장소·배포에서 빠지는가 ──')
r = subprocess.run(['git', '-C', str(ROOT), 'check-ignore', 'data/questions.local.json'], capture_output=True, text=True)
ok('★git 이 questions.local.json 을 무시한다★', r.returncode, 0)
r = subprocess.run(['git', '-C', str(ROOT), 'ls-files', 'data/questions.local.json'], capture_output=True, text=True)
ok('저장소에 올라가 있지 않다', (r.stdout or '').strip(), '')
sw = (ROOT / 'sw.js').read_text(encoding='utf-8')
ok('sw.js 캐시 목록에 없다', 'questions.local' in sw, False)
ok('.gitignore 에 *.local.* 이 있다', '*.local.*' in (ROOT / '.gitignore').read_text(encoding='utf-8'))

print('── ⑤ 도구가 새 자리를 읽는가 ──')
ex = (ROOT / 'tools' / 'extract_master.py').read_text(encoding='utf-8')
ok('extract_master.py — 세 갈래를 쓴다', all(s in ex for s in ("QOUT = ROOT / 'data' / 'questions.local.json'", 'QUESTION_KEYS', 'Q_BEGIN', 'Q_END')))
ok("extract_master.py — Questions.gs 를 newline='' 로 쓰고 Code.gs 에 블록이 남으면 멈춘다 (2026-09-25 문항 분리 · CRLF 금지)",
   "QGS.write_text(_qgs_new, encoding='utf-8', newline='')" in ex and "GS.read_text(encoding='utf-8', newline='')" in ex
   and "raise SystemExit('★중단★ backend/Code.gs 에 QUESTIONS 블록" in ex)
rl = (ROOT / 'tools' / 'release.py').read_text(encoding='utf-8')
ok('release.py — questions.local.json 으로 센다 · 공개 파일 문항 유출을 막는다 · 백엔드 배포 알림',
   all(s in rl for s in ("QLOCAL = ROOT / 'data' / 'questions.local.json'", 'def backend_notice():', "want_q = json.loads(QLOCAL", 'live_leak')))
ok('release.py — 실서버 대조에서 master.json 의 문항 수를 더는 세지 않는다', "live_master['shopper_categories']" in rl, False)
arc = (ROOT.parents[1] / '4. 스프레드시트' / 'tools' / 'archive.py').read_text(encoding='utf-8')
ok('archive.py scales() — questions.local.json 을 읽는다', "'data', 'questions.local.json')" in arc)
cb = (ROOT / 'tools' / 'check_backend.py').read_text(encoding='utf-8')
ok('check_backend.py — survey.questions 를 실제로 돌린다', "action: 'survey.questions'" in cb and 'NOT_FOUND' in cb)

print('\n' + ('★%d개 실패★' % _f if _f else '전부 통과') + '  (통과 %d)' % _p)
sys.exit(1 if _f else 0)
