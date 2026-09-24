# -*- coding: utf-8 -*-
"""survey.questions — MS 38문항은 ★살아 있는 제출 코드★ 를 낸 요청에만 (2026-09-18 담당자 ②-1)

★Code.gs 원문에서 제출코드 로직(const CODE_SHEET ~ fnSurveySubmit 앞)과 fnSurveyQuestions · questionsConst · QUESTIONS 블록을
잘라내서 node 로 돌린다★ — 대역(시트·락·캐시)은 test/codes-backend-test.py 와 같다.

담당자: "매장사람들도 ms평가표는 못봐야해, ms평가표는 신뢰가는사람들만 하는 경우가 많아서 문항 자체를 유출하진 않을꺼야"
      → 고객 설문은 코드를 먼저 넣어야 문항이 뜬다. 코드는 ★검사만 하고 소진하지 않는다★(소진은 제출 때).

보는 것:
  ① 등록표 survey.questions = anon · 1KB · fn fnSurveyQuestions · fnSurveySubmit 은 그대로 submitWithCode
  ② 코드 없음 → BAD_REQUEST · 틀림/다른 매장 → NOT_FOUND(문구는 제출 때와 같다) + ★매장별 실패 카운터 증가★
  ③ 맞음 → ok · 38문항 13카테고리 · kiosk_excludes 5 · texts 3키 · ★QSC 문항 없음★ · ★소진 안 됨★(다시 열어도 ok · 제출도 된다)
  ④ 사용됨 → CONFLICT · 만료 → 「기한이 지난」 · 취소 → 「사용할 수 없는」 · store 비우면 코드의 매장을 준다
  ⑤ 키오스크 매장 → storeType 'kiosk' · 일부 키오스크 → 'mixed' · 그 밖 ''
  ⑥ 15회 틀리면 RATE_LIMITED — 그 매장은 맞는 코드도 막히고, 다른 매장은 통과
  ⑦ 제출 경로(submitWithCode)의 판정·문구는 종전 그대로 (codeVerify 를 같이 쓴다)
  ⑧ 화면: shopper-core.js 에 prompt() 가 없다 · survey.questions 를 부른다 · check_backend 가 이 경로를 돈다
"""
import io, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT = HERE.parents[1]
SRC = ROOT / 'backend' / 'Code.gs'
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_survey_questions.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()
# 2026-09-25 문항 분리 — QUESTIONS 는 backend/Questions.gs(저장소 제외)에 있다. 앱스 스크립트처럼 두 파일을 이어 붙여 읽는다.
_code_only = src
src = src + '\n' + io.open(SRC.parent / 'Questions.gs', 'r', encoding='utf-8', newline='').read()
if '@@QUESTIONS_BEGIN' in _code_only or 'const QUESTIONS = ' in _code_only:
    raise SystemExit('Code.gs 에 QUESTIONS 가 남아 있음 — 문항은 Questions.gs 에만 (두 번 선언되면 서버 전체가 멈춘다)')
lines = src.split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


a = src.index("const CODE_SHEET = '쇼퍼_코드';")
b = src.index('function fnSurveySubmit(ctx, payload)')
codes_block = src[a:b].rstrip()
# 2026-09-25 검수 · dates-4 — submitWithCode 가 부르는 날짜 문과 그 부품(한 줄짜리 yymm 은 대역)
codes_block = '\n'.join([cut('submitDateGate'), cut('validYm'),
                         'function yymm(d) { return d.slice(2, 4) + d.slice(5, 7); }', codes_block])
i, j = src.find('/* @@QUESTIONS_BEGIN */'), src.find('/* @@QUESTIONS_END */')
if not (0 <= i < j):
    raise SystemExit('Code.gs 에 QUESTIONS 블록이 없음 — python tools/extract_master.py')
q_block = src[i:j]

py_fail = 0


def src_ok(name, cond):
    global py_fail
    if cond:
        print('  ✓ ' + name)
    else:
        py_fail += 1
        print('  ✗ ' + name)


print('── ① 등록표·화면 ──')
reg = re.search(r"'survey\.questions':\s*\{[^}]*\}", src)
src_ok("survey.questions = anon · scope none · 1KB · fn fnSurveyQuestions",
       bool(reg) and 'anon: true' in reg.group(0) and "scope: 'none'" in reg.group(0)
       and 'max: 1 * KB' in reg.group(0) and 'fn: fnSurveyQuestions' in reg.group(0))
src_ok('idem 이 아니다 (읽기 — 멱등키를 안 쓴다)', bool(reg) and 'idem' not in reg.group(0))
src_ok('fnSurveySubmit 은 그대로 submitWithCode 를 부른다',
       'return submitWithCode(SpreadsheetApp.openById(SPREADSHEET_ID), payload, ctx);' in cut('fnSurveySubmit'))
src_ok('submitWithCode 가 codeVerify 를 쓴다 (판정이 한 곳)', "codeVerify(ss, code, store, 'BAD_REQUEST')" in cut('submitWithCode'))
src_ok("fnSurveyQuestions 는 NOT_FOUND 로 판정한다", "'NOT_FOUND')" in cut('fnSurveyQuestions'))
core = (ROOT / 'js' / 'shopper-core.js').read_text(encoding='utf-8')
src_ok('shopper-core.js — 제출 때 prompt() 로 코드를 묻지 않는다 (주석 말고 호출)', re.search(r"=\s*\(?\s*prompt\(", core) is None)
src_ok('shopper-core.js — survey.questions 로 문항을 연다', "Api.call('survey.questions', { code: code, store: store })" in core)
src_ok('shopper-core.js — 확인된 코드를 그대로 제출에 쓴다', 'code = openCode;' in core)
src_ok('shopper-core.js — 임시저장에 코드를 넣지 않는다', 'code:' not in core[core.find('function saveDraft()'):core.find('function loadDraft()')])
src_ok('shopper-core.js — 임시저장 복원은 코드 확인 뒤(openQuestions 안)',
       core.find('const draft = loadDraft();') > core.find('async function openQuestions()') > 0)
src_ok('check_backend.py 가 survey.questions 경로를 돈다',
       "action: 'survey.questions'" in (ROOT / 'tools' / 'check_backend.py').read_text(encoding='utf-8'))
src_ok('api.js READ_ACTIONS 에 survey.questions 가 있다', "'survey.questions': 1" in (ROOT / 'js' / 'api.js').read_text(encoding='utf-8'))

harness = r'''// 자동 생성 — Code.gs 원문에서 잘라낸 제출코드 로직 + 문항 내려주기를 그대로 돌린다
// ── 앱스 스크립트 대역 (test/codes-backend-test.py 와 같다 · 캐시는 들여다볼 수 있게 CACHE_M) ──
const SPREADSHEET_ID = 'fake';
const Logger = { log: function () {} };
const CACHE_M = {};
const CacheService = { getScriptCache: function () { return {
  get: function (k) { return Object.prototype.hasOwnProperty.call(CACHE_M, k) ? CACHE_M[k] : null; },
  put: function (k, v) { CACHE_M[k] = String(v); },
}; } };
const LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
const Utilities = { formatDate: function (d, tz, f) {
  const p = function (n) { return String(n).padStart(2, '0'); };
  if (f === 'yyyy-MM-dd') return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  if (f === 'yyyy-MM') return d.getFullYear() + '-' + p(d.getMonth() + 1);
  if (f === 'yyMM') return String(d.getFullYear()).slice(2) + p(d.getMonth() + 1);
  return String(d);
},
  /* 2026-09-25 검수 · authn-5 — newCode 가 HMAC 바이트를 쓴다(부호 있는 바이트) */
  getUuid: function () { return require('crypto').randomUUID(); },
  computeHmacSha256Signature: function (v, k) {
    return Array.from(require('crypto').createHmac('sha256', String(k)).update(String(v)).digest()).map(function (b) { return b > 127 ? b - 256 : b; });
  },
};
function auditLog() {}
function anonCtx() { return { id: '(무인증)', role: '' }; }
let ROWS = [];
const MS_DETAIL = 'MS_상세';
function msMonthPick() { return { score: null, at: '', n: 0 }; }
function ymLabel(ym) { return ym; }
function gridForget() {}
const SS = {
  getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; },
  getSheetByName: function (n) { return n === MS_DETAIL ? { fake: n } : null; },
};
const SpreadsheetApp = { openById: function () { return SS; } };
function sheet() {
  return { getLastRow: function () { return ROWS.length + 1; }, appendRow: function (r) { ROWS.push(r.slice()); } };
}
function grid(sh, row, col, nr, nc) {
  return {
    getValues: function () {
      const out = [];
      for (let i = 0; i < nr; i++) {
        const s = ROWS[row - 2 + i] || []; const line = [];
        for (let j = 0; j < nc; j++) line.push(s[col - 1 + j]);
        out.push(line);
      }
      return out;
    },
    setValues: function (v) {
      for (let i = 0; i < v.length; i++) {
        const t = ROWS[row - 2 + i] || (ROWS[row - 2 + i] = []);
        for (let j = 0; j < v[i].length; j++) t[col - 1 + j] = v[i][j];
      }
    },
  };
}
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function safe(v) { return v; }
function safeRow(r) { return r; }
function normStore(v) { return String(v == null ? '' : v).trim(); }
function curYymm() { const d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0'); }
function nowIso() { return new Date().toISOString(); }
let SAVED = [];
function saveShopper(ss, p) { SAVED.push(p); return { ok: true }; }

%(codes)s

%(qblock)s
%(qconst)s
%(fn)s

// ── 시험 ──────────────────────────────────────────────────────
let pass = 0, fail = 0;
function is(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n       got  ' + g + '\n       want ' + w); }
}
function head(t) { console.log('\n' + t); }
const CTX = { id: 'moon' };
const ANON = { auth: false, id: '(무인증)', role: '' };
function issue(store, ttl) { return fnCodesIssue(CTX, { store: store, ttl: ttl || '3h' }); }
function ask(code, store) { return fnSurveyQuestions(ANON, { code: code, store: store }); }
function submit(store, code) { return submitWithCode(SS, { store: store, code: code, date: '2026-10-05' }, CTX); }
function bucket() { return Math.floor(Date.now() / (10 * 60000)); }
function fails(store) { return Number(CACHE_M['codefail:' + store + ':' + bucket()] || 0); }
function failsAll() { return Number(CACHE_M['codefail:*:' + bucket()] || 0); }
function rowOf(code) { return ROWS.filter(function (r) { return r[2] === code; })[0]; }

head('[1] 코드 없음');
is('빈 코드 → BAD_REQUEST', ask('', '금종제과').code, 'BAD_REQUEST');
is('문구', ask('', '금종제과').error, '제출 코드를 입력해 주세요.');
is('실패 카운터는 안 오른다', fails('금종제과'), 0);

head('[2] 틀린 코드 → NOT_FOUND + 매장별 카운터');
let r = ask('999999', '금종제과');
is('NOT_FOUND', r.code, 'NOT_FOUND');
is('★문구는 제출 때와 같다★', r.error, '제출 코드가 맞지 않습니다.');
is('문항이 실리지 않는다', 'shopper_categories' in r, false);
is('금종제과 카운터 1', fails('금종제과'), 1);
is('전체 카운터 1', failsAll(), 1);
const a1 = issue('금종제과');
is('발급된다', a1.ok, true);
r = ask(a1.rec.code, '다른매장');
is('★다른 매장 이름으로 열면 NOT_FOUND★ (없는 코드와 구분하지 않는다)', r.code, 'NOT_FOUND');
is('다른매장 카운터 1', fails('다른매장'), 1);
is('금종제과 카운터는 그대로 1', fails('금종제과'), 1);
is('공백·하이픈이 섞여도 숫자만 본다', ask(' ' + a1.rec.code.slice(0, 3) + '-' + a1.rec.code.slice(3) + ' ', '금종제과').ok, true);

head('[3] 맞는 코드 → 문항 · ★소진 안 됨★');
r = ask(a1.rec.code, '금종제과');
is('ok', r.ok, true);
is('store = 코드의 매장', r.store, '금종제과');
is('storeType 은 빈 값 (보통 매장)', r.storeType, '');
const qs = []; (r.shopper_categories || []).forEach(function (c) { c.questions.forEach(function (q) { qs.push(q); }); });
is('38문항', qs.length, 38);
is('13카테고리', r.shopper_categories.length, 13);
is('문항마다 no·row·text·scale', qs.every(function (q) { return q.no && q.row && q.text && (q.scale === 'yn' || q.scale === 'likert'); }), true);
is('kiosk_excludes 5개', r.kiosk_excludes, ['3-1', '3-2', '7-1', '7-2', '7-3']);
is('texts 3키', Object.keys(r.texts || {}).sort(), ['shopper_criteria', 'shopper_grade_note', 'shopper_principles']);
is('★QSC 문항은 없다★', 'qsc_groups' in r, false);
is('version · source_sha', /^\d{4}-\d{2}-\d{2}$/.test(r.version) && /^[0-9a-f]{12}$/.test(r.source_sha), true);
is('★시트의 상태는 미사용 그대로★', rowOf(a1.rec.code)[5], '미사용');
is('다시 열어도 ok', ask(a1.rec.code, '금종제과').ok, true);
is('카운터도 그대로', fails('금종제과'), 1);
is('★그 코드로 제출도 된다★', submit('금종제과', a1.rec.code).ok, true);
is('제출이 소진한다', rowOf(a1.rec.code)[5], '사용됨');

head('[4] 사용됨 · 만료 · 취소 · store 비움');
r = ask(a1.rec.code, '금종제과');
is('사용된 코드 → CONFLICT', r.code, 'CONFLICT');
is('문구', r.error, '이미 사용된 코드입니다.');
is('사용된 코드는 카운터를 안 올린다', fails('금종제과'), 1);
const b1 = issue('금종제과', '3h');
rowOf(b1.rec.code)[4] = new Date(Date.now() - 60000);
r = ask(b1.rec.code, '금종제과');
is('만료 → BAD_REQUEST 「기한이 지난」', r.code === 'BAD_REQUEST' && r.error.indexOf('기한이 지난') === 0, true);
const c1 = issue('금종제과');
fnCodesRevoke(CTX, { code: c1.rec.code });
r = ask(c1.rec.code, '금종제과');
is('취소 → BAD_REQUEST 「사용할 수 없는 코드입니다.」', r.code === 'BAD_REQUEST' && r.error === '사용할 수 없는 코드입니다.', true);
const d1 = issue('금종제과');
r = ask(d1.rec.code, '');
is('store 를 비우면 ok — 코드의 매장을 준다', r.ok === true && r.store === '금종제과', true);
is('  그래도 소진 안 됨', rowOf(d1.rec.code)[5], '미사용');

head('[5] 매장 유형');
const k1 = issue('도넛정수');
is('키오스크 전용 → storeType kiosk', ask(k1.rec.code, '도넛정수').storeType, 'kiosk');
const m1 = issue('제주당');
is('일부 키오스크 → storeType mixed', ask(m1.rec.code, '제주당').storeType, 'mixed');
is('보통 매장 → 빈 값', ask(d1.rec.code, '금종제과').storeType, '');

head('[6] 무작위 대입 방어 — 매장별 15회');
const L = '잠금매장';
const l1 = issue(L);
for (let i = 0; i < 15; i++) ask('000001', L);
is('15회 틀린 뒤 카운터 15', fails(L), 15);
r = ask(l1.rec.code, L);
is('★맞는 코드도 막힌다★ RATE_LIMITED', r.code, 'RATE_LIMITED');
is('문구는 제출 때와 같다', r.error, '코드 확인이 잠시 막혀 있습니다. 10분 뒤에 다시 시도해 주세요.');
is('잠긴 동안은 카운터가 더 안 오른다', fails(L), 15);
is('다른 매장은 통과', ask(d1.rec.code, '금종제과').ok, true);
is('제출 경로도 같은 잠금', submit(L, l1.rec.code).code, 'RATE_LIMITED');

head('[7] 제출 경로의 판정·문구는 종전 그대로');
r = submit('금종제과', '999998');
is('없는 코드 → BAD_REQUEST (NOT_FOUND 가 아니다)', r.code, 'BAD_REQUEST');
is('문구', r.error, '제출 코드가 맞지 않습니다.');
is('매장 없이 제출 → 「매장을 선택해 주세요.」', submit('', d1.rec.code).error, '매장을 선택해 주세요.');
is('코드 없이 제출 → 「제출 코드를 입력해 주세요.」', submit('금종제과', '').error, '제출 코드를 입력해 주세요.');
r = submit('금종제과', d1.rec.code);
is('맞는 코드 제출 → ok', r.ok, true);
is('응답이 저장됐다', SAVED.length, 2);

console.log('\n─────────────────────────────');
console.log(pass + '개 통과 · ' + fail + '개 실패');
process.exit(fail ? 1 : 0);
''' % {'codes': codes_block, 'qblock': q_block, 'qconst': cut('questionsConst'), 'fn': cut('fnSurveyQuestions')}

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(harness)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip())
if py_fail or res.returncode != 0:
    print('\n★실패★ (소스 검사 %d · node rc=%d)' % (py_fail, res.returncode))
    sys.exit(1)
print('\n전부 통과')
