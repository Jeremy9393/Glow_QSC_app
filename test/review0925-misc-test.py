# -*- coding: utf-8 -*-
"""2026-09-25 검수 — 작은 항목 다섯 (critic-day1-1 · critic-day1-2 · authz-1 · dates-4 makeMonthTabIn · perf-server-3)

★Code.gs 의 진짜 storeMonthBody · notifyPasswordChanged · enforceOn · makeMonthTabIn(첫 문) · writeStoreQsc · improveBlocked 를
잘라내서 돌린다★ (사본 아님).

보는 것:
  ① critic-day1-1 — 이번 달 탭이 없으면 「아직 이번 달 점검 전입니다. 점검이 끝나면 이곳에 개선요청사항이 나타납니다.」
     (「본사 담당자에게 문의」 없음 · 약속 ③) · 지난 달에 탭이 없으면 「이 달에는 점검 기록이 없습니다.」 · 캐시하지 않는다
  ② critic-day1-2 — 매장 계정이 ★자기★ 비밀번호를 바꾸면 메일 없음 · 관리자 계정은 메일 · 관리자가 매장 비밀번호를 정해 주면 메일 ·
     권한 판정이 터지면 보내는 쪽 · 본문에 「본인이 바꾼 것이 아니면」 뜻 · 「중지」 안내는 그대로
  ③ authz-1 — AUTH_ENFORCE 가 없거나 비면 켜짐 · off/false/0/no 를 적어야 꺼짐 · 오타(ON·On·1)는 켜짐
  ④ dates-4 — makeMonthTabIn 은 yyMM 네 자리가 아니면 원본을 복사하기 전에 ✗ (「…의 사본」 탭이 남지 않는다)
  ⑤ perf-server-3 — writeStoreQsc·improveBlocked 가 같은 요청에서 매장 파일을 다시 열지 않는다(ssOpen 메모)
  ⑥ 대조군: QSC_SRC=<고치기 전 사본> 이면 ①②③④⑤가 실패해야 한다
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_review0925_misc.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def first_gate(name):
    """makeMonthTabIn 은 길다 — 첫 줄부터 'const pick = tabSourceFor(' 줄까지만 잘라 원본 복사 직전에서 멈춘다"""
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    en = next(j for j in range(st, len(lines)) if 'tabSourceFor(' in lines[j])
    return '\n'.join(lines[st:en + 1]) + "\n  return { mark: 'GO', msg: '원본 복사로 넘어감' };\n}"


js = r'''
/* ── 가짜 세계 ── */
let RAW = {};
function prop(key, def) { const v = Object.prototype.hasOwnProperty.call(RAW, key) ? RAW[key] : null; return (v === null || v === undefined || v === '') ? def : v; }
function epoch() { return '1'; }
let CACHE = {};
const CacheService = { getScriptCache: function () { return {
  get: function (k) { return Object.prototype.hasOwnProperty.call(CACHE, k) ? CACHE[k] : null; },
  put: function (k, v) { CACHE[k] = String(v); },
}; } };
let OPENS = 0, SSOPENS = {}, TABS = {};
function mkFile(id) { return { _id: id, getId: function () { return id; }, getSheetByName: function (n) { return TABS[n] ? { _tab: n } : null; } }; }
const SpreadsheetApp = { openById: function (id) { OPENS++; return mkFile(id); } };
const _memo = {};
function ssOpen(id) { if (!_memo[id]) { _memo[id] = SpreadsheetApp.openById(id); } SSOPENS[id] = (SSOPENS[id] || 0) + 1; return _memo[id]; }
function storeFileId() { return 'FILE1'; }
function monthTabs() { return ['2610']; }
function readStoreTab() { return { ok: true, exists: true }; }
let CUR = '2611';
function curYymm() { return CUR; }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function yymm(d) { return d.slice(2, 4) + d.slice(5, 7); }
const STORE_MAP_SHEET = '매장목록';
let INTO = [];
function writeStoreQscInto(ss, p, photoMap, tab) { INTO.push([ss._id, tab]); return { ok: true }; }
function improveScan() { return { ok: true, touched: 0, filled: 0 }; }
let SRC_PICKS = 0;
function tabSourceFor() { SRC_PICKS++; return { sh: null, why: '원본 없음' }; }
/* 메일 */
const ADMIN_MENU = 'accounts';
let MAILS = [], CAN_THROWS = false;
function can(role, menu, act) { if (CAN_THROWS) throw new Error('역할 탭을 못 읽음'); return { allow: role === '관리자' && menu === 'accounts' }; }
const Session = { getEffectiveUser: function () { return { getEmail: function () { return 'owner@example.com'; } }; } };
const MailApp = { sendEmail: function (to, subj, body) { MAILS.push({ to: to, subj: subj, body: body }); } };
''' + '\n'.join([cut('validYm'), cut('storeMonthBody'), cut('notifyPasswordChanged'), cut('enforceOn'),
                 first_gate('makeMonthTabIn'), cut('writeStoreQsc'), cut('improveBlocked'),
                 cut('fnShopperSubmit')]) + '\n' + (cut('submitDateGate') if any(l.startswith('function submitDateGate(') for l in lines)
                                                     else 'function submitDateGate() { return null; }') + r'''
/* fnShopperSubmit(관리자 MS · 옛 길)의 나머지 부품 */
const SPREADSHEET_ID = 'RESP';
let MS_SAVES = 0, MS_GUARDS = 0, MS_CLOSED = null;
function guardResubmit() { MS_GUARDS++; return null; }
function qscMonthClosed() { return MS_CLOSED; }   // contract-1 — fnShopperSubmit 이 되묻기 앞에서 본다
function saveShopper() { MS_SAVES++; return { ok: true }; }

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }

console.log('① critic-day1-1 — 탭이 없을 때 문구');
TABS = {}; CUR = '2610'; CACHE = {};
let r = storeMonthBody('금종제과', '2610');
ok('이번 달 → 「아직 이번 달 점검 전입니다. 점검이 끝나면 이곳에 개선요청사항이 나타납니다.」',
   r.ok === true && r.exists === false && r.error === '아직 이번 달 점검 전입니다. 점검이 끝나면 이곳에 개선요청사항이 나타납니다.', r.error);
ok('「문의」·「탭」 같은 말이 없다', !/문의|탭/.test(r.error));
ok('items 빈 배열 · months 그대로(배지·달 목록)', Array.isArray(r.items) && r.items.length === 0 && r.months.length === 1);
ok('캐시하지 않는다(탭이 생기면 곧바로 보여야 한다)', Object.keys(CACHE).length === 0, Object.keys(CACHE));
CUR = '2611';
r = storeMonthBody('금종제과', '2610');
ok('지난 달에 탭이 없으면 「이 달에는 점검 기록이 없습니다.」', r.error === '이 달에는 점검 기록이 없습니다.', r.error);
/* contract-2 — 다음 달(10월 중 2611 · 10/1 전 2610)에 「이번 달」이라고 하지 않는다 */
CUR = '2610';
r = storeMonthBody('금종제과', '2611');
ok('다음 달에 탭이 없으면 「아직 점검 기록이 없습니다. 점검이 끝나면…」(「이번 달」 없음)',
   r.ok === true && r.exists === false && r.error === '아직 점검 기록이 없습니다. 점검이 끝나면 이곳에 개선요청사항이 나타납니다.', r.error);
ok('다음 달 문구에도 「문의」·「탭」 없음(앱이 서버 문구를 그대로 쓴다)', !/문의|탭/.test(r.error));
CUR = '2609';
r = storeMonthBody('금종제과', '2610');
ok('10/1 전(서버 달 2609)에 2610 → 「이번 달」 없음', !/이번 달/.test(r.error) && r.exists === false, r.error);

console.log('② critic-day1-2 — 비밀번호 변경 메일');
MAILS = [];
notifyPasswordChanged({ id: '금종제과', role: '매장' }, '본인 변경');
ok('매장 계정이 자기 비밀번호를 바꾸면 메일 없음', MAILS.length === 0, MAILS.length);
notifyPasswordChanged({ id: 'admin', role: '관리자' }, '본인 변경');
ok('관리자 계정이 바꾸면 메일', MAILS.length === 1 && MAILS[0].to === 'owner@example.com', MAILS.length);
ok('본문 — 「바꾼 적이 없다면」 · 「중지」 안내', /바꾼 적이 없다면/.test(MAILS[0] ? MAILS[0].body : '') && /「중지」/.test(MAILS[0] ? MAILS[0].body : ''));
ok('본문 — 본인이 바꾼 것이면 할 일 없음을 먼저 말한다', /바꾼 것이라면 따로 하실 일은 없습니다/.test(MAILS[0] ? MAILS[0].body : ''));
ok('본문 — 옛 이름 「QSC 인증 시트」를 쓰지 않는다', !/QSC 인증 시트/.test(MAILS[0] ? MAILS[0].body : ''));
MAILS = [];
notifyPasswordChanged({ id: '금종제과', role: '매장' }, '관리자 설정 (admin)');
ok('관리자가 매장 비밀번호를 정해 주면 메일(종전대로)', MAILS.length === 1);
MAILS = []; CAN_THROWS = true;
notifyPasswordChanged({ id: '금종제과', role: '매장' }, '본인 변경');
CAN_THROWS = false;
ok('권한 판정이 터지면 보내는 쪽(알림을 놓치지 않는다)', MAILS.length === 1);

console.log('③ authz-1 — AUTH_ENFORCE 기본 켜짐');
RAW = {};
ok('속성 없음 → 켜짐', enforceOn() === true);
RAW.AUTH_ENFORCE = '';
ok('빈 문자열 → 켜짐', enforceOn() === true);
/* backend-3/contract-4 — 공백만 든 값도 「빈 값 = 켜짐」 */
[' ', '  ', ' \t', '\n'].forEach(function (v) { RAW.AUTH_ENFORCE = v; ok(JSON.stringify(v) + '(공백만) → 켜짐', enforceOn() === true); });
['off', 'OFF', ' off ', 'false', '0', 'no'].forEach(function (v) { RAW.AUTH_ENFORCE = v; ok(JSON.stringify(v) + ' → 꺼짐(롤백 수단은 그대로)', enforceOn() === false); });
['on', 'ON', 'On', '1', 'true', 'yes'].forEach(function (v) { RAW.AUTH_ENFORCE = v; ok(JSON.stringify(v) + ' → 켜짐', enforceOn() === true); });

console.log('④ dates-4 — makeMonthTabIn 은 복사 전에 달 형식을 본다');
TABS = {}; SRC_PICKS = 0;
['', 'undefined', '26-10', '2613', '261', 'abcd'].forEach(function (ym) {
  const m = makeMonthTabIn(mkFile('F'), ym);
  ok(JSON.stringify(ym) + ' → ✗ 달 형식 오류', m.mark === '✗' && /달 형식 오류/.test(m.msg), m);
});
ok('그동안 원본을 한 번도 고르지(복사하지) 않았다', SRC_PICKS === 0, SRC_PICKS);
ok('맞는 달(2610)은 원본 고르기로 넘어간다', makeMonthTabIn(mkFile('F'), '2610').mark === 'GO' && SRC_PICKS === 1);
TABS = { '2610': true };
ok('이미 있으면 종전대로 「이미 있음」', makeMonthTabIn(mkFile('F'), '2610').msg === '이미 있음');

console.log('⑤ perf-server-3 — 같은 요청에서 매장 파일을 한 번만 연다');
OPENS = 0; SSOPENS = {}; INTO = []; TABS = { '2610': true };
ssOpen('FILE1');                                 // qscMonthClosed 가 먼저 연다
improveBlocked('금종제과', '2026-10-05');         // 덮어쓰기 길
writeStoreQsc({ store: '금종제과', date: '2026-10-05' }, {});
ok('openById 는 한 번뿐 (종전: 2~3번)', OPENS === 1, OPENS);
ok('writeStoreQscInto 는 그 파일·그 달로', INTO.length === 1 && INTO[0][0] === 'FILE1' && INTO[0][1] === '2610', INTO);

console.log('⑥ dates-4 — MS 관리자 제출(fnShopperSubmit)도 같은 점검일자 문');
CUR = '2610'; MS_SAVES = 0; MS_GUARDS = 0;
r = fnShopperSubmit({ auth: true, id: 'admin' }, { store: '금종제과', date: '' });
ok('빈 날짜 → 「점검일자를 선택해 주세요.」 · 되묻기·저장 안 함', r.code === 'BAD_REQUEST' && r.error === '점검일자를 선택해 주세요.' && MS_SAVES === 0 && MS_GUARDS === 0, [r, MS_SAVES, MS_GUARDS]);
ok('9월 → 「9월은 앱으로 제출할 수 없습니다 — 점검일자를 확인해 주세요.」', fnShopperSubmit({}, { date: '2026-09-30' }).error === '9월은 앱으로 제출할 수 없습니다 — 점검일자를 확인해 주세요.');
ok('다음 달 → 「아직 오지 않은 달입니다 — 점검일자를 확인해 주세요.」', fnShopperSubmit({}, { date: '2026-11-01' }).error === '아직 오지 않은 달입니다 — 점검일자를 확인해 주세요.');
ok('이번 달 → 저장까지 간다', fnShopperSubmit({}, { date: '2026-10-05' }).ok === true && MS_SAVES === 1);
/* backend-2/security-1 — 앞뒤 공백·탭이 붙은 날짜는 문에서 끊는다(뒤따르는 확정 검사·yymm 이 원래 값을 쓰므로) */
MS_SAVES = 0; MS_GUARDS = 0;
[' 2026-10-05', '2026-10-05 ', '\t2026-10-05', '2026-10-05\n'].forEach(function (d) {
  const g = fnShopperSubmit({}, { store: '금종제과', date: d });
  ok(JSON.stringify(d) + ' → 「점검일자를 선택해 주세요.」', g.code === 'BAD_REQUEST' && g.error === '점검일자를 선택해 주세요.', g);
});
ok('공백 날짜는 되묻기·저장까지 가지 않았다', MS_SAVES === 0 && MS_GUARDS === 0, [MS_SAVES, MS_GUARDS]);
ok('고객 설문 문(방문 날짜)도 같다', submitDateGate(' 2026-10-05', '방문 날짜').error === '방문 날짜를 선택해 주세요.');
ok('정상 날짜는 그대로 통과', submitDateGate('2026-10-05') === null);
/* contract-1 — 확정 달이면 되묻기(guardResubmit) 앞에서 MONTH_CLOSED */
MS_SAVES = 0; MS_GUARDS = 0;
MS_CLOSED = { ok: false, code: 'MONTH_CLOSED', error: '2026년 10월 채점이 확정되어 제출할 수 없습니다.' };
r = fnShopperSubmit({ auth: true, id: 'admin' }, { store: '금종제과', date: '2026-10-05' });
MS_CLOSED = null;
ok('확정 달 → MONTH_CLOSED · 되묻기·저장 안 함', r.code === 'MONTH_CLOSED' && MS_GUARDS === 0 && MS_SAVES === 0, [r, MS_GUARDS, MS_SAVES]);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
sys.exit(1 if res.returncode != 0 else 0)
