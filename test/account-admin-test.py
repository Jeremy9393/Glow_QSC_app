# -*- coding: utf-8 -*-
"""계정 관리 — 동기화 미리보기 · 삭제 · 이름 변경 (2026-09-11 담당자 요청)

담당자: *"동기화 진행시 새로 생기기만 하잖아 … 시트에 맞게 변경, 삭제 추가 이렇게 셋 다 동기화"*
        *"매장이 사라지면 앱에서 안보이게 하는 경우도 있는데 삭제버튼도 있으면 좋을꺼같아"*

★Code.gs 의 진짜 syncStoreAccountsCore·fnAccountSync·fnAccountDelete·fnAccountRename 을 잘라내서 돌린다★

★이 시험이 막으려는 것★
  ① preview:true 인데 계정을 만들어 버리는 것
  ② 통합시트에 없는 계정(고아)을 못 찾거나, 관리자('*')·살아 있는 매장까지 고아로 모는 것
  ③ 본인·관리자('*') 계정을 지우는 것 · 아이디가 겹치는 행을 지우는 것 · 캐시된 행 번호로 엉뚱한 행을 지우는 것
  ④ 이름 변경에서 비밀번호·접속 기록이 있는 새 이름 계정을 조용히 덮는 것(합치기)
  ⑤ 동기화가 만든 빈 계정을 ★미리보기★에서 지워 버리는 것 · 개명 도구 검사에 막히는데 먼저 지우는 것
  ⑥ 실행 때 빈 계정을 안 지워 아이디가 겹치는 것
"""
import io, re, subprocess, sys
from pathlib import Path

SRC = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\qsc-app\backend\Code.gs')
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\_도구\node\node.exe')
OUT = Path(__file__).parent / 't_account_admin.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

lines = io.open(SRC, 'r', encoding='utf-8', newline='').read().split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cutconst(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('const %s ' % name))
    buf = []
    for j in range(st, len(lines)):
        buf.append(lines[j])
        if lines[j].split('//')[0].rstrip().endswith(';'):
            break
    return '\n'.join(buf)


body = '\n'.join([cutconst('STATUS_ON'), cutconst('STATUS_OFF'), cutconst('AUTH_ACCOUNT_SHEET'),
                  cut('syncStoreAccountsCore'), cut('fnAccountSync'), cut('fnAccountDelete'), cut('fnAccountRename')])
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ══════════════════════════════════════════
var LIVE = [];            // 통합시트 매장
var ACCTS = [];           // 계정 탭 행 객체 (readAccounts 가 주는 모양)
var APPENDED = [], DELETED = [], DROPPED = [], LOGGED = [], STASH_CLEARED = [], RENAMED = [];
var RENAME_FAIL = null;   // fnRenameStore 미리보기를 막고 싶을 때 오류 객체

function normId(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }
function normStore(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function validId(id) { return /^[^\s]/.test(id); }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
function displayStores() { return LIVE.slice(); }
function ensureAuthSheets() {}
function safeRow(a) { return a; }
function readAccounts() { return ACCTS.map(function (a, i) { var o = {}; for (var k in a) o[k] = a[k]; o.row = 2 + i; return o; }); }
function getAccount(id) { var hit = readAccounts().filter(function (a) { return a.id === id; }); return (hit.length === 1 && !hit[0].dup) ? hit[0] : null; }
function dropAccountCache(id) { DROPPED.push(id); }
function pwStashClear(id) { STASH_CLEARED.push(id); }
function auditLog(ctx, a, t, r, c, m) { LOGGED.push(a + '|' + m); }
var SHEET = {
  appendRow: function (row) { APPENDED.push(row); ACCTS.push({ id: normId(row[0]), rawId: row[0], name: row[1], role: row[2], scope: row[3], status: row[4], hash: '', lastSeen: '', dup: false }); },
  deleteRow: function (r) { DELETED.push(r); ACCTS.splice(r - 2, 1); },
};
function authSS() { return { getSheetByName: function (n) { return n === AUTH_ACCOUNT_SHEET ? SHEET : null; } }; }
/* 개명 도구는 다른 시험(rename-store-test)이 맡는다 — 여기서는 부른 기록과 검사 결과만 흉내 낸다 */
function fnRenameStore(ctx, p) {
  if (RENAME_FAIL) return RENAME_FAIL;
  RENAMED.push((p.apply ? 'apply:' : 'preview:') + p.from + '>' + p.to);
  return { ok: true, 미리보기: !p.apply, 옛이름: p.from, 새이름: p.to, 합계: 3, 자리: [], 캐시: [], 말: p.apply ? '바꿨습니다.' : '아직 아무것도 바꾸지 않았습니다.' };
}

var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('  ✗ ' + name + '\n      나온 값 ' + g + '\n      바란 값 ' + w); }
}
function acct(id, o) {
  o = o || {};
  return { id: normId(id), rawId: id, name: o.name || id, role: o.role || '매장담당자', scope: (o.scope === undefined) ? id : o.scope,
           status: o.status || '사용', hash: o.hash || '', lastSeen: o.lastSeen || '', dup: !!o.dup };
}
function reset(live, accts) {
  LIVE = live.slice(); ACCTS = accts; APPENDED = []; DELETED = []; DROPPED = []; LOGGED = []; STASH_CLEARED = []; RENAMED = []; RENAME_FAIL = null;
}
var CTX = { id: 'admin', role: '관리자' };

// ══ ① 동기화 미리보기는 쓰지 않는다 ══
reset(['금종제과', '이티에프 베이커리 투고'], [acct('admin', { scope: '*', role: '관리자', hash: 'h' }), acct('금종제과', { hash: 'h' }), acct('이티에프 투고', { hash: 'h', lastSeen: '2026-09-01', status: '중지' })]);
var r = fnAccountSync(CTX, { preview: true });
ok('미리보기 ok', r.ok, true);
ok('미리보기 preview 표시', r.preview, true);
ok('미리보기 — 추가될 것', r.added, ['이티에프 베이커리 투고']);
ok('미리보기 — 시트에 없는 계정 = 이티에프 투고 하나 (admin·금종제과 아님)', r.orphans.map(function (o) { return o.id; }), ['이티에프 투고']);
ok('미리보기 — 고아 정보(비밀번호·접속·상태)', [r.orphans[0].hasPw, r.orphans[0].lastSeen, r.orphans[0].status], [true, '2026-09-01', '중지']);
ok('미리보기 — 아무 행도 안 만듦', APPENDED.length, 0);
ok('미리보기 — 감사로그 없음', LOGGED.length, 0);

// ══ ② 실제 동기화는 추가만 한다 (고아는 보고만) ══
r = fnAccountSync(CTX, {});
ok('실행 — 한 행 추가', APPENDED.map(function (x) { return x[0]; }), ['이티에프 베이커리 투고']);
ok('실행 — 고아는 그대로 보고', r.orphans.map(function (o) { return o.id; }), ['이티에프 투고']);
ok('실행 — 고아는 안 지움', DELETED, []);
ok('실행 — 감사로그 한 줄', LOGGED.length, 1);
ok('실행 — 새 행은 비밀번호 없음·사용', [APPENDED[0][4], APPENDED[0][2]], [STATUS_ON, '매장담당자']);

// 매장범위가 쉼표 목록이면 하나라도 살아 있으면 고아가 아니다
reset(['금종제과'], [acct('지역담당', { scope: '금종제과, 없는매장' })]);
ok('쉼표 범위 — 하나라도 살아 있으면 고아 아님', fnAccountSync(CTX, { preview: true }).orphans, []);
reset(['금종제과'], [acct('지역담당', { scope: '없는매장1, 없는매장2' })]);
ok('쉼표 범위 — 전부 없으면 고아', fnAccountSync(CTX, { preview: true }).orphans.map(function (o) { return o.id; }), ['지역담당']);
reset(['금종제과'], [acct('겹침', { dup: true }), acct('겹침', { dup: true })]);
ok('아이디 겹치는 행은 고아 목록에서 뺀다', fnAccountSync(CTX, { preview: true }).orphans, []);

// ══ ③ 삭제 ══
reset(['금종제과'], [acct('admin', { scope: '*', role: '관리자', hash: 'h' }), acct('금종제과', { hash: 'h' }), acct('옛매장', { hash: 'h', lastSeen: '2026-08-01' })]);
ok('삭제 — 본인은 거절', fnAccountDelete(CTX, { id: 'admin' }).code, 'BAD_REQUEST');
ok('삭제 — 없는 계정', fnAccountDelete(CTX, { id: '유령' }).code, 'NOT_FOUND');
ok('삭제 — 전 매장 권한(*)은 거절', fnAccountDelete({ id: 'other', role: '관리자' }, { id: 'admin' }).code, 'BAD_REQUEST');
ok('삭제 전 아무것도 안 지움', DELETED, []);
r = fnAccountDelete(CTX, { id: '옛매장' });
ok('삭제 ok', [r.ok, r.deleted], [true, '옛매장']);
ok('삭제 — 시트 행 번호 = 4 (세 번째 행)', DELETED, [4]);
ok('삭제 — 남은 계정', ACCTS.map(function (a) { return a.id; }), ['admin', '금종제과']);
ok('삭제 — 비밀번호 보관값·캐시 정리', [STASH_CLEARED, DROPPED], [['옛매장'], ['옛매장']]);
ok('삭제 — 감사로그에 비밀번호 있던 계정 표시', /비밀번호 있던 계정/.test(LOGGED[0]), true);
reset(['금종제과'], [acct('겹침', { dup: true }), acct('겹침', { dup: true })]);
ok('삭제 — 겹치는 행은 getAccount 가 못 찾아 NOT_FOUND', fnAccountDelete(CTX, { id: '겹침' }).code, 'NOT_FOUND');
ok('삭제 — 겹치는 행은 안 지움', DELETED, []);

// ══ ④⑤⑥ 이름 변경 ══
function renameWorld(targetOpts) {
  var a = [acct('admin', { scope: '*', role: '관리자', hash: 'h' }), acct('이티에프 투고', { hash: 'h', lastSeen: '2026-09-01', status: '중지' })];
  if (targetOpts) a.push(acct('이티에프 베이커리 투고', targetOpts));
  reset(['금종제과', '이티에프 베이커리 투고'], a);
}
renameWorld(null);
ok('이름 변경 — 둘 다 적어야', fnAccountRename(CTX, { from: '이티에프 투고' }).code, 'BAD_REQUEST');
ok('이름 변경 — 옛 계정 없음', fnAccountRename(CTX, { from: '유령', to: '이티에프 베이커리 투고' }).code, 'NOT_FOUND');
ok('이름 변경 — 본인 거절', fnAccountRename({ id: normId('이티에프 투고') }, { from: '이티에프 투고', to: '이티에프 베이커리 투고' }).code, 'BAD_REQUEST');
r = fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고' });
ok('이름 변경 미리보기 — ok·미리보기', [r.ok, r.미리보기], [true, true]);
ok('이름 변경 미리보기 — 개명 도구는 미리보기로만', RENAMED, ['preview:이티에프 투고>이티에프 베이커리 투고']);
ok('이름 변경 미리보기 — 정리할 빈 계정 없음', r.정리한계정, '');
ok('이름 변경 미리보기 — 상태 전달', r.상태, '중지');
ok('이름 변경 미리보기 — 아무것도 안 지움', DELETED, []);
r = fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고', apply: true });
ok('이름 변경 실행 — 개명 도구 미리보기 뒤 실행', RENAMED, ['preview:이티에프 투고>이티에프 베이커리 투고', 'preview:이티에프 투고>이티에프 베이커리 투고', 'apply:이티에프 투고>이티에프 베이커리 투고']);
ok('이름 변경 실행 — 중지 상태 안내', /「중지」 상태/.test(r.말), true);

// 동기화가 먼저 만든 빈 계정이 새 이름을 차지하고 있다
renameWorld({ hash: '', lastSeen: '' });
r = fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고' });
ok('빈 계정 — 미리보기는 지우지 않는다', DELETED, []);
ok('빈 계정 — 미리보기가 정리 예정을 알린다', [r.정리한계정, /먼저 지웁니다/.test(r.말)], ['이티에프 베이커리 투고', true]);
r = fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고', apply: true });
ok('빈 계정 — 실행 때 그 행(3번째 = 시트 4행)을 먼저 지운다', DELETED, [4]);
ok('빈 계정 — 지운 뒤 개명 도구 실행', RENAMED[RENAMED.length - 1], 'apply:이티에프 투고>이티에프 베이커리 투고');
ok('빈 계정 — 응답에 정리 표시', [r.ok, r.정리한계정, /먼저 지웠습니다/.test(r.말)], [true, '이티에프 베이커리 투고', true]);
ok('빈 계정 — 정리 감사로그', /동기화가 만든 빈 계정/.test(LOGGED.join('|')), true);

// 새 이름 계정에 비밀번호·접속 기록이 있으면 합치지 않는다
renameWorld({ hash: 'h2', lastSeen: '' });
ok('진짜 계정 — CONFLICT', fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고', apply: true }).code, 'CONFLICT');
ok('진짜 계정 — 안 지움·개명 안 부름', [DELETED, RENAMED], [[], []]);
renameWorld({ hash: '', lastSeen: '2026-09-10' });
ok('접속 기록 있는 계정 — CONFLICT', fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고', apply: true }).code, 'CONFLICT');

// 개명 도구의 안전검사(새 이름이 통합시트에 없음)에 막히면 빈 계정도 건드리지 않는다
renameWorld({ hash: '', lastSeen: '' });
RENAME_FAIL = err('BAD_REQUEST', '새 이름이 통합시트에 없습니다');
r = fnAccountRename(CTX, { from: '이티에프 투고', to: '이티에프 베이커리 투고', apply: true });
ok('개명 검사 실패 — 그 오류 그대로', r.code, 'BAD_REQUEST');
ok('개명 검사 실패 — 빈 계정 안 지움', DELETED, []);

console.log('─────────────────────────────');
console.log(fail ? (pass + '개 통과 · ' + fail + '개 실패') : ('전부 통과  (통과 ' + pass + ')'));
process.exit(fail ? 1 : 0);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print(r.stderr)
sys.exit(r.returncode)
