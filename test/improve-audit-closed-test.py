# -*- coding: utf-8 -*-
"""검수(improve.audit) — 확정된 달은 서버가 거부한다 (2026-09-17 #27)

★Code.gs 의 진짜 fnImproveAudit 를 잘라내서 돌린다★ (사본 아님).

왜: 확정된 달의 검수·감점제외를 서버가 그대로 받았다 — 막는 것은 화면의 closedAt() 하나뿐이었다
    (store-app.js 주석이 스스로 인정). 같은 자리 fnStoreSave 에는 가드가 있었다.

보는 것:
  ① 확정된 달 → FORBIDDEN · 문구 「2026년 10월 채점이 확정되어 검수할 수 없습니다.」 · 락도 안 잡고 행도 안 찾는다
  ② 감점제외(waive)도 같은 판정
  ③ 확정 안 된 달은 종전대로 락을 잡고 행을 찾는다
  ④ 순서: impGeo 검사(새 서식 아님 → CONFLICT)가 확정 판정보다 앞
  ⑤ 대조군: QSC_SRC=<고치기 전 사본> 으로 돌리면 ①②가 실패해야 한다
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_improve_audit_closed.js'
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


js = r'''
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function validYm(ym) { return /^\d{4}$/.test(ym); }
function normStore(s) { return String(s || '').trim(); }
function storeFileId() { return 'FILE1'; }
function fileTz() { return 'Asia/Seoul'; }
function ymLabel(ym) { return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월'; }
const Utilities = { formatDate: function () { return '2026-10-20'; } };
const sh = {};
const ss = { getSheetByName: function () { return sh; }, getId: function () { return 'FILE1'; }, getName: function () { return '샘플' } };
const SpreadsheetApp = { openById: function () { return ss; } };
let IS_NEW = true, CLOSED_AT = '', LOCK_GOT = 0, LOCK_REL = 0, FIND = 0;
function impGeo() { return { isNew: IS_NEW, row0: 12, endRow: 15, audit: 17, redo: 18, waive: 19, roll: 20 }; }
function monthClosedAt() { return CLOSED_AT; }
const LockService = { getScriptLock: function () { return { tryLock: function () { LOCK_GOT++; return true; }, releaseLock: function () { LOCK_REL++; } }; } };
/* 행 찾기에서 멈춘다 — 이 시험은 「거기까지 가는가」만 본다 */
function impFindRow() { FIND++; return { ok: false, code: 'NOT_FOUND', error: '(시험) 행 없음' }; }
function grid() { return { getValues: function () { return [['']]; }, setValue: function () {} }; }
''' + cut('fnImproveAudit') + r'''

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
const ctx = { id: 'admin', role: '관리자' };
function call(p) { LOCK_GOT = 0; LOCK_REL = 0; FIND = 0; return fnImproveAudit(ctx, Object.assign({ store: '금종제과', ym: '2610', no: 1 }, p)); }

console.log('① 확정된 달');
CLOSED_AT = '2026-11-02';
let r = call({ verdict: '확정' });
ok('FORBIDDEN', r.ok === false && r.code === 'FORBIDDEN', r);
ok('문구 「2026년 10월 채점이 확정되어 검수할 수 없습니다.」', r.error === '2026년 10월 채점이 확정되어 검수할 수 없습니다.', r.error);
ok('락을 안 잡고 행도 안 찾는다', LOCK_GOT === 0 && FIND === 0, [LOCK_GOT, FIND]);

console.log('② 감점제외도 같다');
r = call({ waive: true });
ok('FORBIDDEN · 락 없음', r.code === 'FORBIDDEN' && LOCK_GOT === 0, r);

console.log('③ 확정 안 된 달');
CLOSED_AT = '';
r = call({ verdict: '확정' });
ok('락을 잡고(1) 놓고(1) 행을 찾으러 간다(1)', LOCK_GOT === 1 && LOCK_REL === 1 && FIND === 1, [LOCK_GOT, LOCK_REL, FIND]);
ok('행이 없다는 답이 그대로 온다(NOT_FOUND)', r.code === 'NOT_FOUND', r);

console.log('④ 순서 — 새 서식 검사가 먼저');
IS_NEW = false; CLOSED_AT = '2026-11-02';
r = call({ verdict: '확정' });
ok('옛 서식이면 CONFLICT (확정 판정보다 앞)', r.code === 'CONFLICT', r);
IS_NEW = true;

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
sys.exit(1 if res.returncode != 0 else 0)
