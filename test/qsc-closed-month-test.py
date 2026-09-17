# -*- coding: utf-8 -*-
"""QSC 제출 — 확정된 달은 사진을 올리기 전에 끊는다 (2026-09-17 담당자 ②-3h)

★Code.gs 의 진짜 qscMonthClosed · saveQsc · fnQscSubmit 를 잘라내서 돌린다★ (사본 아님).

왜: 확정한 달에 QSC 를 다시 제출하면 그 달 탭이 덮어써졌다(시트 보호는 스크립트 계정을 못 막는다) —
    상태·개선율은 굳은 값, 점수·표는 새것. 되묻기·사진·응답 시트 어디에도 닿기 전에 서버가 거부한다.

보는 것:
  ① 확정된 달 → fnQscSubmit 이 MONTH_CLOSED · 문구 「2026년 10월 채점이 확정되어 제출할 수 없습니다.」
     ★사진을 올리지 않았다 · 응답 시트에 한 줄도 안 썼다 · 되묻기(guardResubmit)에도 안 갔다★
  ② saveQsc 를 바로 불러도(사본 시험 경로) 같은 판정 — 사진 전에
  ③ 확정 안 된 달은 종전대로(사진 1회 · 회차·상세 2번 prepend)
  ④ 매장 파일을 못 찾으면 막지 않는다(writeStoreQsc 가 알린다) · 열다 터져도 막지 않는다
  ⑤ 대조군: QSC_SRC=<고치기 전 사본> 으로 돌리면 ①②가 실패해야 한다
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_qsc_closed.js'
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


def cut_opt(name):
    try:
        return cut(name)
    except SystemExit:
        return '/* %s 없음 (옛 사본) */' % name


js = r'''
const SPREADSHEET_ID = 'resp', DASHBOARD_ID = '';
const QSC_DETAIL_HEADER = ['점검일자', '방문시간', '매장명', '코드', '문항번호', '구분', '문항', '등급구분', '개선필요건수', '상태', '감점', '비고', '사진', 'NA사유', '제출시각', '제출점수'];
let FILE_ID = 'FILE1', CLOSED = {}, OPEN_THROWS = false;
let PHOTOS = 0, PREPENDS = 0, GUARDS = 0;
function storeFileId() { return FILE_ID; }
function monthClosedAt(ss, tab) { return CLOSED[ss.getId() + ':' + tab] || ''; }
function ssOpen(id) { if (OPEN_THROWS && id !== SPREADSHEET_ID) throw new Error('열기 실패'); return { getId: function () { return id; } }; }   // 매장 파일만 터진다
const SpreadsheetApp = { openById: ssOpen };
function yymm(d) { return d.slice(2, 4) + d.slice(5, 7); }
function ymLabel(ym) { return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월'; }
function savePhotos() { PHOTOS++; return {}; }
function sheet(ss, name) { return { _n: name, getDataRange: function () { return { getValues: function () { return [['매장명', 'NA문항', '갱신일']]; } }; },
  appendRow: function () {}, getRange: function () { return { setValues: function () {} }; } }; }
function qscFixHeader() {}
function prependRows() { PREPENDS++; }
function gridForget() {}
function safeRow(r) { return r; }
function round1(n) { return Math.round(n * 10) / 10; }
function normStore(s) { return String(s || '').trim(); }
function dropNaCache() {} function dropDashCache() {} function dropStoreCache() {}
function writeDashboard() { return { ok: true }; }
function writeStoreQsc() { return { ok: true, tickets: 0 }; }
function guardResubmit() { GUARDS++; return null; }
function auditLog() {}
function anonCtx() { return { auth: false }; }
function opErr(w, e) { return w + ': ' + e; }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
''' + '\n'.join([cut_opt('qscMonthClosed'), cut('saveQsc'), cut('fnQscSubmit')]) + r'''

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
function payload() {
  return { store: '금종제과', date: '2026-10-05', time: '10:00', submittedAt: '2026-10-05T01:00:00Z', inspector: '신문수',
    items: [{ no: 1, code: 'A-01', text: '문항', value: '0' }, { no: 2, code: 'A-02', text: '문항', value: 'NA', naWhy: '해당 없음' }],
    result: { qsc: 99, grade: '우수', final: 99, genDeduct: 1 } };
}
function reset() { PHOTOS = 0; PREPENDS = 0; GUARDS = 0; CLOSED = {}; FILE_ID = 'FILE1'; OPEN_THROWS = false; }
const ctx = { auth: true, id: 'admin', role: '관리자' };

console.log('① 확정된 달 — fnQscSubmit');
reset(); CLOSED['FILE1:2610'] = '2026-11-02';
let r = fnQscSubmit(ctx, payload());
ok('MONTH_CLOSED', r.ok === false && r.code === 'MONTH_CLOSED', r);
ok('문구 「2026년 10월 채점이 확정되어 제출할 수 없습니다.」', r.error === '2026년 10월 채점이 확정되어 제출할 수 없습니다.', r.error);
ok('★사진을 올리지 않았다★', PHOTOS === 0, PHOTOS);
ok('★응답 시트에 한 줄도 안 썼다★', PREPENDS === 0, PREPENDS);
ok('되묻기에도 안 갔다', GUARDS === 0, GUARDS);

console.log('② saveQsc 를 바로 불러도 사진 전에 끊는다');
reset(); CLOSED['FILE1:2610'] = '2026-11-02';
r = saveQsc({}, payload(), ctx);
ok('MONTH_CLOSED · 사진 0 · prepend 0', r.code === 'MONTH_CLOSED' && PHOTOS === 0 && PREPENDS === 0, [r.code, PHOTOS, PREPENDS]);

console.log('③ 확정 안 된 달');
reset();
r = fnQscSubmit(ctx, payload());
ok('저장된다', r.ok === true && r.saved === 2, r);
ok('사진 1회 · 회차+상세 prepend 2회 · 되묻기 1회', PHOTOS === 1 && PREPENDS === 2 && GUARDS === 1, [PHOTOS, PREPENDS, GUARDS]);
reset(); CLOSED['FILE1:2611'] = '2026-12-02';     // 다른 달만 확정
r = fnQscSubmit(ctx, payload());
ok('다른 달 확정은 무관', r.ok === true, r);

console.log('④ 판정할 수 없으면 막지 않는다');
reset(); FILE_ID = null; CLOSED['FILE1:2610'] = '2026-11-02';
ok('매장 파일 없음 → 저장(writeStoreQsc 가 알린다)', fnQscSubmit(ctx, payload()).ok === true);
reset(); OPEN_THROWS = true; CLOSED['FILE1:2610'] = '2026-11-02';
ok('매장 파일 열기 실패 → 저장', fnQscSubmit(ctx, payload()).ok === true);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
sys.exit(1 if res.returncode != 0 else 0)
