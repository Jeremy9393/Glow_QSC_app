# -*- coding: utf-8 -*-
"""2026-09-17 최종검수 반영 — 글자로 확인할 것들 (주석 정정 #32 · 소소 #33 · #16 · #30 · 배선)

★실행이 아니라 원문 대조★ — 동작 시험이 따로 있는 것은 그 시험이 보고, 여기서는 「주석·문구가 사실과 맞는가」와
「고친 자리가 그대로 있는가」를 글자로 본다(주석은 실행으로 못 잡는다).

보는 것:
  #16  testStoreCopy — 매장 파일 ID 가 코드에 없다 · 속성 TEST_COPY_SRC_ID
  #30  clearMonthBody 라벨 목록에 '개선율'
  #32  주석 정정 — [★] A-05 · 앞 5열 · 되묻기 없음 · 통합시트 종합 새 수식 · extract_master.py 중대 차감 · 읽어주세요.md 코드 발급
  #33  tabSourceFor 가 TPL_TAB_RE 를 쓴다 · impGeo 옛 서식 last:16
  #17·#18·#19 되돌리기 문구
  배선 — 등록표 admin.fixGrade · doPost 0.6 · ssOpen 뜨거운 5곳 · LEDGER_SCAN 2곳 · mslive 캐시 키 · MONTH_CLOSED 3곳 · 락 · CRLF 없음
"""
import io, os, re, sys
from pathlib import Path

HERE = Path(__file__).resolve()
APP = HERE.parents[1]
SRC = Path(os.environ.get('QSC_SRC') or (APP / 'backend' / 'Code.gs'))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = src.split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        return ''
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    return ''


fails = 0


def ok(name, cond):
    global fails
    print(('  ✓ ' if cond else '  ✗ ') + name)
    if not cond:
        fails += 1


print('#16 testStoreCopy')
tsc = cut('testStoreCopy')
ok('매장 파일 ID 하드코딩 없음', '1mUSyz0ItpTa5HsUKVHWqxhD3wTobdP9xJO4NdNQ0InE' not in src)
ok("속성 TEST_COPY_SRC_ID 로 읽고 없으면 멈춘다", "prop('TEST_COPY_SRC_ID', '')" in tsc and '★중단★ 원본 파일 ID 가 없습니다' in tsc)

print('#30 clearMonthBody')
ok("라벨 목록에 '개선율'", "'개선율'].forEach" in cut('clearMonthBody'))

print('#32 주석·문서 정정')
ok('[★★] A-05 → [★ 중대] A-05', '[★★] A-05' not in src and '[★ 중대] A-05' in src)
ok('「앞 14열 … 같다」 두 곳 → 「앞 5열」', '앞 14열은 QSC_상세와' not in src and src.count('앞 5열') >= 2)
ok('「관리자 입력은 같은 달 두 번째면 덮어쓰기를 되묻지만」 없음 · 되묻기 없음이 적혀 있다',
   '관리자 입력은 같은 달 두 번째면' not in src and '★되묻기가 없고★' in src)
ok('통합시트 종합 새 수식이 세 자리(saveShopper · rateProbe · fnUndoSubmit)에 적혀 있다',
   src.count('IF(NOT(ISNUMBER(BV)),"",BV*0.6+IF(ISNUMBER(BX),BX,0)*0.3+IF(ISNUMBER(BZ),BZ,1)*0.1)') >= 3)
ok('「해당 월 평균」 없음 · 「평균 아님」', '"해당 월 평균"' not in src and '평균 아님' in cut('saveShopper'))
ok('fnMsMigrate/월말 반영 주석 「쇼퍼 평균」 → 「가장 최근 제출 1건」', '그 달 쇼퍼 평균을 매장 파일 MS점수에' not in src)
em = io.open(APP / 'tools' / 'extract_master.py', 'r', encoding='utf-8').read()
ok('extract_master.py — QSC = MAX(0, 100 − 일반 감점 − 중대 차감)', '100 − 일반 감점 − 중대 차감' in em)
rd = APP.parent.parent / '4. 스프레드시트' / '읽어주세요.md'
rdt = io.open(rd, 'r', encoding='utf-8').read() if rd.exists() else ''
ok('읽어주세요.md — 코드 발급 때 막힌다(백엔드 1.44) · 「2장 쓰면 되묻기 없이」 없음',
   '코드 발급 때 그 달 MS 가 이미 있으면 발급이 막힙니다' in rdt and '2장 쓰면 되묻기 없이' not in rdt)

print('#33 소소')
ok('tabSourceFor 가 TPL_TAB_RE 로 판정 · indexOf 없음', 'TPL_TAB_RE.test(n)' in cut('tabSourceFor') and "indexOf('원본')" not in cut('tabSourceFor'))
ok('impGeo 옛 서식 폴백 last: 16', 'last: 16,' in cut('impGeo') and 'last: 15,' not in cut('impGeo'))

print('#17·#18·#19 되돌리기 문구')
undo = cut('fnUndoSubmit')
ok("#19 「줄건」 없음", "'건 · NA프리셋" not in undo and "' · NA프리셋 '" in undo)
ok('#17 쇼퍼 남은 건수는 monthLeftSubmits', "'건 · 쇼퍼 ' +\n          (shop.monthLeftSubmits == null ? shop.monthLeft : shop.monthLeftSubmits)" in undo)
ok('#18 「건 평균)」 없음 · 「건 중 가장 최근 1건)」', '건 평균)' not in undo and '건 중 가장 최근 1건)' in undo)

print('배선')
ok("등록표 admin.fixGrade", bool(re.search(r"'admin\.fixGrade':\s*\{[^}]*fn: fnFixGrade", src)) and cut('fnFixGrade') != '')
dp = cut('doPost')
ok('doPost 0.6 — 64KB · 끝 2KB · tokenSigOk · AUTH_REQUIRED', 'raw.length > 64 * 1024' in dp and 'raw.slice(-2048)' in dp and 'tokenSigOk(tm[1])' in dp)
ok('verifyToken 도 tokenSigOk 를 쓴다(서명 검사 한 곳)', 'if (!tokenSigOk(t)) return bad;' in cut('verifyToken'))
ok('ssOpen 뜨거운 5곳(authSS · fnQscSubmit · attachAdminLive · qscRounds · roundTicketCountsRaw)',
   all('ssOpen(' in cut(f) for f in ['authSS', 'fnQscSubmit', 'attachAdminLive', 'qscRounds', 'roundTicketCountsRaw']))
ok('LEDGER_SCAN — prevSubmitsOf · roundTicketCountsRaw', 'LEDGER_SCAN' in cut('prevSubmitsOf') and 'LEDGER_SCAN' in cut('roundTicketCountsRaw') and 'const LEDGER_SCAN = 3000;' in src)
ok("mslive 캐시 키 — attachAdminLive 가 쓰고 dropStoreCache 가 버린다", "'mslive:v'" in cut('attachAdminLive') and "'mslive:v'" in cut('dropStoreCache'))
ok('MONTH_CLOSED — qscMonthClosed · writeStoreQscInto · fnUndoSubmit', all("'MONTH_CLOSED'" in cut(f) for f in ['qscMonthClosed', 'writeStoreQscInto', 'fnUndoSubmit']))
ok('fnUndoSubmit 락 — tryLock(20000) · finally releaseLock', 'lock.tryLock(20000)' in undo and 'finally {\n    try { lock.releaseLock(); }' in undo)
ok('fnImproveAudit 확정월 가드', "채점이 확정되어 검수할 수 없습니다" in cut('fnImproveAudit'))
ok('recountSummary prog 에 재제출기한 지남 없음', "jd.state === '진행중' || jd.state === '반려') prog++" in cut('recountSummary'))
# 2026-09-25 검수 · critic-attacker-1 — 전체 합산 60 → 150 (익명 한 사람이 60번으로 전 매장을 막던 것)
ok('codeFail — 매장별 + 전체(CODE_FAIL_ALL 150)', 'const CODE_FAIL_ALL = 150;' in src and "'codefail:*:'" in cut('codeFailKeys'))
ok('fnCodesIssue — msMonthPick 으로 그 달 MS 판정', 'msMonthPick(msSh, store, ym, tz).n > 0' in cut('fnCodesIssue'))
ok("sheet() 새 탭 감사로그 'sheet.new'", "'sheet.new'" in cut('sheet'))
ok('grid 메모 — gridSize/gridForget · 늘리는 곳에서 무효화', 'gridForget(sh)' in cut('appendRows') and 'gridForget(sh)' in cut('prependRows') and 'gridForget(sh)' in cut('delRows') and 'gridForget(sh)' in cut('msPrepend'))
ok('PROPS 덮개(실행 단위 메모)', 'const PROPS = (function (raw) {' in src)
ok('CRLF 없음', '\r' not in src)
ok('ping 버전 문자열은 배포 도구 몫 — v 숫자가 있다', bool(re.search(r"v: 'v\d+'", src)))

print('\n' + ('실패 %d개' % fails if fails else '전부 통과'))
sys.exit(1 if fails else 0)
