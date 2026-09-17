# -*- coding: utf-8 -*-
"""매장현황 저장의 파일 ID 시험 경로 — 관리자만 (2026-09-15 · 보안 점검 ③)

★Code.gs 의 진짜 fnStoreSave 를 잘라내서 돌린다★ (사본 아님).
can · err · validYm · capText · storeFileId · SpreadsheetApp · LockService 는 가짜로 끼운다.

왜: store.saveImprove 의 등록 권한(menu:'store' 쓰기)은 매장도 가진다. 그런데 fnStoreSave 는
payload.fileId 가 오면 누가 보냈든 그 파일을 열고, 이름에 _연동테스트가 없으면 거절 문구에
★파일 이름을 적어 돌려줬다★ — 매장 계정이 아무 파일 ID로 이름을 캐낼 수 있었다.

보는 것:
  ① 매장 역할 + fileId — FORBIDDEN · 파일을 열지 않음 · 응답에 파일 이름 없음
  ② 역할 없는 ctx + fileId — FORBIDDEN · 파일을 열지 않음
  ③ 매장 역할 · fileId 없음 — 원래 길 그대로(storeFileId → 잠금 단계까지)
  ④ 관리자 + 이름에 _연동테스트 없는 파일 — 기존 이름 검사가 FORBIDDEN
  ⑤ 관리자 + _연동테스트 사본 — 잠금 단계까지 통과
  ⑥ (소스) 권한 검사가 openById(testId) 보다 앞
"""
import io, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = HERE.parents[1] / 'backend' / 'Code.gs'
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_store_testpath.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = src.split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


py_fail = 0
body = cut('fnStoreSave')
wblock = cut('storeWriteBlock')   # 2026-09-17 — 매장 계정 저장이 열리는 달 (store-writeblock-test.py 가 따로 본다)
gate = body.find("can(ctx && ctx.role, ADMIN_MENU, '쓰기')")
open_ = body.find('SpreadsheetApp.openById(testId)')
if gate >= 0 and open_ >= 0 and gate < open_:
    print('  ✓ ⑥ 권한 검사가 openById(testId) 보다 앞')
else:
    py_fail += 1
    print('  ✗ ⑥ 권한 검사가 openById(testId) 보다 앞 (gate=%d open=%d)' % (gate, open_))

js = r'''
const ADMIN_MENU = 'accounts';
const PERM = { '관리자': { '읽기': true, '쓰기': true }, '매장': {} };
function can(role, menu, act) { return { allow: !!(role && menu === ADMIN_MENU && PERM[role] && PERM[role][act]) }; }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function validYm(ym) { return /^\d{4}$/.test(ym); }
function capText(v) { return String(v == null ? '' : v); }
let opened = [], looked = [];
const FILES = { 'REALFILE_ID_0000000000': '제주당_QSC현황', 'TESTFILE_ID_0000000000': '제주당_QSC현황_연동테스트' };
function storeFileId(store) { looked.push(store); return 'REALFILE_ID_0000000000'; }
const SpreadsheetApp = {
  openById(id) {
    opened.push(id);
    if (!FILES[id]) throw new Error('no file');
    return { getName() { return FILES[id]; } };
  }
};
/* 잠금을 못 잡게 해서 「잠금 단계까지 왔다」를 CONFLICT 로 확인한다 — 그 뒤는 이 시험의 몫이 아니다 */
const LockService = { getScriptLock() { return { tryLock() { return false; }, releaseLock() { } }; } };
/* 「이번 달」을 10월로 고정한다 — 시험을 언제 돌려도 같게 */
function curYymm() { return '2610'; }
function ymLabel(ym) { return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월'; }
''' + wblock + '\n' + body + r'''

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
const store = { role: '매장', id: '제주당', auth: true }, admin = { role: '관리자', id: 'admin', auth: true };
const base = { ym: '2610', no: 1, doneNote: '완료' };
function reset() { opened = []; looked = []; }

reset();
let r = fnStoreSave(store, Object.assign({ fileId: 'REALFILE_ID_0000000000' }, base), '제주당');
ok('① 매장 + fileId — FORBIDDEN', r.ok === false && r.code === 'FORBIDDEN');
ok('① 매장 + fileId — 파일을 열지 않음', opened.length === 0);
ok('① 매장 + fileId — 응답에 파일 이름 없음', JSON.stringify(r).indexOf('QSC현황') < 0);

reset();
r = fnStoreSave({}, Object.assign({ fileId: 'TESTFILE_ID_0000000000' }, base), '제주당');
ok('② 역할 없음 + fileId — FORBIDDEN · 안 엶', r.code === 'FORBIDDEN' && opened.length === 0);

reset();
r = fnStoreSave(store, base, '제주당');
ok('③ 매장 · fileId 없음 — 원래 길(storeFileId → 잠금 단계)', r.code === 'CONFLICT' && looked.length === 1 && looked[0] === '제주당');

reset();
r = fnStoreSave(admin, Object.assign({ fileId: 'REALFILE_ID_0000000000' }, base), '제주당');
ok('④ 관리자 + 실매장 파일 — 이름 검사가 FORBIDDEN', r.code === 'FORBIDDEN' && opened.length === 1);

reset();
r = fnStoreSave(admin, Object.assign({ fileId: 'TESTFILE_ID_0000000000' }, base), '제주당');
ok('⑤ 관리자 + _연동테스트 사본 — 잠금 단계까지 통과', r.code === 'CONFLICT' && opened.length === 1 && looked.length === 0);

/* 2026-09-17 담당자 「앱에서 막기」 — 매장 계정은 9월까지의 달·아직 안 온 달에 저장하지 못한다 */
reset();
r = fnStoreSave(store, Object.assign({}, base, { ym: '2609' }), '제주당');
ok('⑦ 매장 · 9월 탭 — FORBIDDEN · 매장 파일을 찾지도 않음', r.code === 'FORBIDDEN' && looked.length === 0 && opened.length === 0);
ok('⑦ 매장 · 9월 탭 — 이유 문구', String(r.error).indexOf('9월까지의 기록은 앱에서 조회만 가능합니다') === 0);

reset();
r = fnStoreSave(store, Object.assign({}, base, { ym: '2611' }), '제주당');
ok('⑧ 매장 · 아직 안 온 달(이번 달 10월에 11월 탭) — FORBIDDEN · 안 찾음', r.code === 'FORBIDDEN' && looked.length === 0);
ok('⑧ 매장 · 아직 안 온 달 — 「2026년 11월 1일부터」', String(r.error).indexOf('2026년 11월 1일부터 입력할 수 있습니다') >= 0);

reset();
r = fnStoreSave(admin, Object.assign({}, base, { ym: '2609' }), '제주당');
ok('⑨ 관리자 · 9월 탭 — 막지 않음(잠금 단계까지)', r.code === 'CONFLICT' && looked.length === 1);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout, end='')
if r.stderr:
    print(r.stderr)
sys.exit(1 if (py_fail or r.returncode) else 0)
