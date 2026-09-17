# -*- coding: utf-8 -*-
"""관리자 알림(종) · 매장 배지 기준 (2026-09-15)

★Code.gs 의 진짜 함수를 잘라내서 돌린다★ (사본 아님).
구글 API 는 가짜로 갈아 끼우고, 매장 월 탭과 관리자 시트 「알림」 탭을 2차원 배열로 흉내 낸다.

보는 것:
  ① 빈 완료 칸을 채워 저장하면 검수대기 1줄
  ② 채운 것을 다시 저장해도 줄이 늘지 않는다
  ③ 보완 요청(반려) 뒤 완료 글·사진을 바꿔 저장하면 재제출 · 안 바꾸면 아무것도 안 적는다
  ④ 완료 칸을 비우면 열린 알림을 처리(매장이 완료 취소)
  ⑤ 검수(개선확정·보완 요청·점수 제외)면 처리 · 검수 취소는 닫지 않는다
  ⑥ 9월(2609) 탭은 알림이 없다
  ⑦ 알림 쓰기가 터져도 저장·검수 결과는 ok
  ⑧ 사본 시험 경로(fileId)는 알림이 없다
  ⑨ notify.admin 은 열린 것만 · 최신이 먼저 · 50개까지 · 등록표 한 줄
  ⑩ 매장 배지 todo 가 보완 요청을 센다 · 확정/검수 대기/점수 제외/다시 올린 건은 안 센다
  ⑪ 40일 지난 「처리」 줄만 하루 한 번 정리한다 (열린 줄은 남긴다)
  ⑫ (2026-09-17 J1·J9·J16) 완료 제출일(옛 이월 칸 T) — 저장이 적고·지우고·보완 요청이 비운다 ·
     저장 응답에 상태 · 보완본은 「완료(검수 전)」 · 기한 뒤 완료는 「기한 후 완료」 · 보완 요청은 한 번만 ·
     미조치 처리는 보완 요청한 건에만 · 기한 뒤 완료엔 보완 요청 안 됨 · 확정해도 재제출기한 유지
"""
import io, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = HERE.parents[1] / 'backend' / 'Code.gs'
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_notify_admin.js'
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


def const(name):
    for l in lines:
        if l.startswith('const %s ' % name):
            return l
    raise SystemExit('const %s 를 Code.gs 에서 못 찾음' % name)


FUNCS = ['fnStoreSave', 'fnImproveAudit', 'fnNotifyBadge', 'fnNotifyAdmin', 'badgeTodo',
         'notifyOnSave', 'notifyAdd', 'notifyResolve', 'notifyOpenAll',
         'notifyScan', 'notifySheet', 'notifyTouched', 'maybeTidyNotify', 'tidyNotify',
         'notifyKey', 'notifyCacheKey', 'capText', 'validYm', 'normStore', 'auditTxt',
         'auditCut', 'stampFull', 'safe', 'safeRow', 'delRows', 'cell', 'err', 'grid',
         'sheet', 'impJudge', 'impSubOnSave', 'impOverdue', 'ymLabel', 'storeWriteBlock']
CONSTS = ['PHOTO_EMBED', 'AUTH_NOTIFY_SHEET', 'NOTIFY_HEADER', 'NOTIFY_COLS', 'NOTIFY_FROM_YM',
          'NOTIFY_KEEP_DAYS', 'NOTIFY_SCAN', 'NOTIFY_LIST_MAX', 'BADGE_MAX_STORES', 'IMP_REDO_DAYS']
body = '\n'.join(const(c) for c in CONSTS) + '\n\n' + '\n\n'.join(cut(f) for f in FUNCS)
print('잘라낸 함수 %d개 · 상수 %d개 · %d줄' % (len(FUNCS), len(CONSTS), len(body.split('\n'))))

# ── 등록표·화면은 글자로 본다 (실행은 check_backend.py 가 한다) ──────────
py_pass, py_fail = 0, 0


def pok(name, cond):
    global py_pass, py_fail
    if cond:
        py_pass += 1
        print('  ✓ ' + name)
    else:
        py_fail += 1
        print('  ✗ ' + name)


print('\n⓪ 등록표 · 홈 화면')
reg = re.search(r"'notify\.admin':\s*\{([^}]*)\}", src)
reg = reg.group(1) if reg else ''
pok("notify.admin 등록 — menu: ADMIN_MENU · act: '읽기' · scope: 'none' · fn: fnNotifyAdmin",
    all(s in reg for s in ("menu: ADMIN_MENU", "act: '읽기'", "scope: 'none'", "fn: fnNotifyAdmin")))
home = io.open(HERE.parents[1] / 'index.html', 'r', encoding='utf-8', newline='').read()
btn = re.search(r'<button[^>]*id="bellBtn"[^>]*>', home)
btn = btn.group(0) if btn else ''
pok('종 버튼은 기본 숨김(hidden) · aria-label · aria-expanded', all(s in btn for s in ('hidden', 'aria-label=', 'aria-expanded="false"')))
pok("홈이 notify.admin 을 부르고 빈 상태 문구가 있다",
    "Api.call('notify.admin'" in home and '확인할 알림이 없습니다' in home)

print('\n⓪-2 매장현황 화면 글자 (2026-09-17 J13·J16·J9)')
sapp = io.open(HERE.parents[1] / 'js' / 'store-app.js', 'r', encoding='utf-8', newline='').read()
pok("J16 「다시 보완 요청」 버튼·안내가 없다", '다시 보완 요청' not in sapp and '두 번째 요청부터' not in sapp)
pok("J16 「다음 점검에서 확인」 안내가 없다", '다음 점검에서 확인' not in sapp)
pok("J16 반려 건에 「미조치 처리」 버튼 → verdict '미조치'",
    "btn('미조치 처리', 'warn', function () { audit('미조치'); })" in sapp)
pok("J9 검수 화면이 보완본(it.resub)을 알린다", "a === '반려' && it.resub" in sapp and '보완본이 올라왔습니다' in sapp)
pok("J1 「기한 후 완료」 말·색이 있다", "'기한 후 완료': '기한 후 완료'" in sapp and "'기한 후 완료': ''" in sapp)
pok("J13 오프라인 안내 문구 (담당자 글 그대로)",
    "오프라인 — 인터넷 연결이 됐을 당시 마지막으로 받아둔 화면입니다. 저장은 인터넷이 연결되는 곳에서 해 주세요." in sapp)
pok("J12 Code.gs 매장 안내에 옛말이 없다 (재제출한 뒤에도 · 26/10 채점)",
    '재제출한 뒤에도' not in src and "ym.slice(0, 2) + '/' + ym.slice(2)" not in src)

HARNESS = r'''
// ══ 가짜 세계 ═══════════════════════════════════════════════
var LOGS = [];
var Logger = { log: function (m) { LOGS.push(String(m)); } };
var PROPSTORE = {};
var PROPS = { getProperty: function (k) { return PROPSTORE[k] || null; },
              setProperty: function (k, v) { PROPSTORE[k] = String(v); } };
var CACHE = {};
var CacheService = { getScriptCache: function () { return {
  get: function (k) { return CACHE[k] || null; },
  put: function (k, v) { CACHE[k] = v; },
  remove: function (k) { delete CACHE[k]; },
  removeAll: function (ks) { ks.forEach(function (k) { delete CACHE[k]; }); } }; } };
var LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
var DriveApp = { getFileById: function () { return { setTrashed: function () {} }; } };
/* grid() 실행 단위 메모(2026-09-17 ③) — 이 시험은 메모 없이 바로 묻는 대역으로 · sheet() 의 새 탭 감사로그 플래그 */
function gridSize(sh) { return { rows: sh.getMaxRows(), cols: sh.getMaxColumns() }; }
function gridForget() {}
var SHEET_NEW_LOGGING = false;
function pad(n) { return (n < 10 ? '0' : '') + n; }
var Utilities = { formatDate: function (d, tz, fmt) {
  var m = { yyyy: d.getUTCFullYear(), yy: String(d.getUTCFullYear()).slice(2), MM: pad(d.getUTCMonth() + 1),
            dd: pad(d.getUTCDate()), HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()) };
  return fmt.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, function (t) { return String(m[t]); });
} };
function epoch() { return '1'; }
function fileTz() { return 'Asia/Seoul'; }
/* fnStoreSave 의 fileId 시험 경로가 관리자 권한을 본다 (2026-09-15 · store-testpath-test.py) */
var ADMIN_MENU = 'accounts';
function can(role, menu, act) { return { allow: role === '관리자' && menu === ADMIN_MENU }; }

// 시트 한 장 = 행 배열 (1행이 머리글)
function mkSheet(name) {
  var sh = {
    _rows: [],
    getName: function () { return name; },
    _get: function (r, c) { var row = sh._rows[r - 1]; var v = row ? row[c - 1] : undefined; return (v === undefined || v === null) ? '' : v; },
    _set: function (r, c, v) { while (sh._rows.length < r) sh._rows.push([]); sh._rows[r - 1][c - 1] = v; },
    getLastRow: function () {
      for (var i = sh._rows.length; i >= 1; i--) {
        var row = sh._rows[i - 1] || [];
        for (var j = 0; j < row.length; j++) if (row[j] !== '' && row[j] !== undefined && row[j] !== null) return i;
      }
      return 0;
    },
    getMaxRows: function () { return Math.max(1000, sh._rows.length + 10); },
    getMaxColumns: function () { return 30; },
    getRange: function (r, c, nr, nc) { return {
      getValues: function () { var o = []; for (var i = 0; i < nr; i++) { var x = []; for (var j = 0; j < nc; j++) x.push(sh._get(r + i, c + j)); o.push(x); } return o; },
      getFormulas: function () { var o = []; for (var i = 0; i < nr; i++) { var x = []; for (var j = 0; j < nc; j++) x.push(''); o.push(x); } return o; },
      getValue: function () { return sh._get(r, c); },
      setValue: function (v) { sh._set(r, c, v); },
      setValues: function (v) { for (var i = 0; i < v.length; i++) for (var j = 0; j < v[i].length; j++) sh._set(r + i, c + j, v[i][j]); },
      getNumColumns: function () { return nc; },
    }; },
    appendRow: function (arr) { var at = sh.getLastRow() + 1; for (var j = 0; j < arr.length; j++) sh._set(at, j + 1, arr[j]); },
    deleteRows: function (at, n) { sh._rows.splice(at - 1, n); },
    setFrozenRows: function () {},
  };
  return sh;
}

// 관리자 시트
var AUTH_BROKEN = false;
var AUTH_TABS = {};
var AUTH_SS = {
  getSheetByName: function (n) { return AUTH_TABS[n] || null; },
  insertSheet: function (n) { AUTH_TABS[n] = mkSheet(n); return AUTH_TABS[n]; },
  getSpreadsheetTimeZone: function () { return 'Asia/Seoul'; },
};
function authSS() { if (AUTH_BROKEN) throw new Error('관리자 시트가 터졌다(시험)'); return AUTH_SS; }
function NT() { return AUTH_TABS['알림']; }
function dataRows() { var t = NT(); return t ? t._rows.slice(1).filter(function (r) { return r && r.length && r[0] !== undefined && r[0] !== ''; }) : []; }
function openRows() { return dataRows().filter(function (r) { return r[6] === '열림'; }); }
function rowOf(no) { var rs = dataRows().filter(function (r) { return Number(r[4]) === no; }); return rs[rs.length - 1] || []; }

// 매장 파일 — 새 서식 월 탭 (12행부터 5건)
var ROW0 = 12;
var G = { isNew: true, row0: ROW0, endRow: 40, due: 2, state: 3, before: 4, body: 10, dept: 11, owner: 12,
          plan: 13, done: 14, after: 15, memo: 16, audit: 17, redo: 18, waive: 19, roll: 20, last: 20 };
var STORE_TABS = {};
function mkStoreTab(ym) {
  var sh = mkSheet(ym);
  /* 기한은 먼 날 — 시험을 언제 돌려도 「기한 안」이게 (기한 뒤 완료는 ⑫에서 따로 과거 날짜를 넣는다) */
  for (var no = 1; no <= 6; no++) { sh._set(ROW0 + no - 1, 10, '개선요청 ' + no); sh._set(ROW0 + no - 1, 2, '2099-12-31'); }
  STORE_TABS[ym] = sh;
}
var STORE_SS = { getName: function () { return '금종제과'; }, getSheetByName: function (n) { return STORE_TABS[n] || null; } };
var TEST_SS = { getName: function () { return '금종제과_연동테스트'; }, getSheetByName: function (n) { return STORE_TABS[n] || null; } };
var SpreadsheetApp = { openById: function (id) { return id === 'TEST1' ? TEST_SS : STORE_SS; }, flush: function () {} };
function storeFileId() { return 'FILE1'; }
function impGeo() { return G; }
function impFindRow(sh, g, no) { return { ok: true, row: ROW0 + no - 1 }; }
function monthClosedAt() { return ''; }
function revOf() { return 'R'; }
function itemOf(no, v) { var n = String(v[4] == null ? '' : v[4]).trim(); return { no: no, doneNote: n, state: n ? '완료' : '미조치' }; }
function recountSummary() { return {}; }
function dropStoreCache() {}
var PHOTO_N = 0;
function saveImprovePhoto() { PHOTO_N++; return { ok: true, id: 'P' + PHOTO_N, url: 'U' + PHOTO_N }; }
function cellImageOf(id) { return 'IMG:' + id; }
function photoIdsOf() { return []; }
function dateOfCell(v) { return v ? String(v) : ''; }
function dueDateOf() { return ''; }
function impPlusDays() { return '2099-12-31'; }   // 보완 기한 — 시험을 언제 돌려도 기한 안이게 먼 날로
function auditLog() {}

// 매장 배지 쪽
var BADGE_ITEMS = [];
function curYymm() { return '2610'; }
function storeMonthBody() { return { ok: true, items: JSON.parse(JSON.stringify(BADGE_ITEMS)) }; }
function markNewItems() {}
function seenBaseline() { return null; }

function reset() {
  AUTH_BROKEN = false; AUTH_TABS = {}; CACHE = {}; PROPSTORE = {}; LOGS = []; STORE_TABS = {};
  mkStoreTab('2610'); mkStoreTab('2609');
}
function save(ym, no, doneNote, extra) {
  var p = { ym: ym, no: no, rev: 'R', dept: '주방', owner: '김', plan: '10/15', doneNote: doneNote };
  for (var k in (extra || {})) p[k] = extra[k];
  return fnStoreSave({ id: '금종제과' }, p, '금종제과');
}
function audit(no, verdict, extra) {
  var p = { store: '금종제과', ym: '2610', no: no, verdict: verdict };
  for (var k in (extra || {})) p[k] = extra[k];
  return fnImproveAudit({ id: 'admin' }, p);
}

// ══ 시험틀 ═══════════════════════════════════════════════════
var pass = 0, fail = 0;
function ok(name, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n      나온 것: ' + g + '\n      바란 것: ' + w); }
}

// ── ① 처음 완료 ────────────────────────────────────────────
console.log('\n① 빈 완료 칸을 채워 저장');
reset();
var r = save('2610', 1, '교체 완료');
ok('저장은 ok', r.ok, true);
ok('「알림」 탭이 머리글과 함께 생긴다', NT() ? NT()._rows[0] : null, NOTIFY_HEADER);
ok('열린 알림 1줄', openRows().length, 1);
var row = openRows()[0] || [];
ok('종류 = 검수대기', row[1], '검수대기');
ok('매장 · 월 · 번호', [row[2], String(row[3]), row[4]], ['금종제과', '2610', 1]);
ok('문구', row[5], '10월 1번 개선요청을 완료로 제출했습니다');
ok('시각은 yyyy-MM-dd HH:mm:ss', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row[0]), true);

// ── ② 다시 저장 ────────────────────────────────────────────
console.log('\n② 채운 것을 다시 저장');
save('2610', 1, '교체 완료 — 사진도 올립니다');
save('2610', 1, '교체 완료 — 사진도 올립니다', { photo: { dataUrl: 'data:x' } });
ok('줄이 늘지 않는다 (전체 1줄)', dataRows().length, 1);

// ── ③ 보완 요청 뒤 다시 올림 ────────────────────────────────
console.log('\n③ 보완 요청(반려) 뒤 다시 올림');
r = audit(1, '반려');
ok('검수 ok', r.ok, true);
ok('검수대기 줄이 처리 · 사유 = 보완 요청', [rowOf(1)[6], rowOf(1)[8]], ['처리', '보완 요청']);
ok('처리시각이 적힌다', /^\d{4}-\d{2}-\d{2} /.test(String(rowOf(1)[7])), true);
save('2610', 1, '다시 교체했습니다');
ok('글을 바꾸면 재제출 1줄', openRows().map(function (x) { return x[1]; }), ['재제출']);
ok('재제출 문구', (openRows()[0] || [])[5], '10월 1번 개선요청을 보완해 다시 제출했습니다');
r = audit(1, '반려');
ok('★두 번째 보완 요청은 거절 (보완 요청은 한 번만)★ · 알림은 열린 채', [r.ok, r.code, /한 번만/.test(r.error), openRows().length], [false, 'CONFLICT', true, 1]);
r = audit(1, '미조치');
ok('미조치 처리 → 검수 칸 재반려 · 사유 = 미조치 처리', [r.audit, rowOf(1)[8]], ['재반려', '미조치 처리']);
save('2610', 1, '다시 교체했습니다', { photo: { dataUrl: 'data:y' } });
ok('★글은 같고 사진만 바꿔도★ 재제출', openRows().map(function (x) { return x[1]; }), ['재제출']);
audit(1, '확정');
save('2610', 2, '끝');
audit(2, '반려');
save('2610', 2, '끝');
ok('반려 뒤 글·사진을 안 바꾸고 저장하면 아무것도 안 적는다', openRows().length, 0);
save('2610', 2, '');
save('2610', 2, '새로 했습니다');
ok('반려 뒤 비웠다 다시 채우면 검수대기가 아니라 재제출', (openRows()[0] || [])[1], '재제출');

// ── ④ 완료 취소 ────────────────────────────────────────────
console.log('\n④ 완료 칸을 비움');
reset();
save('2610', 3, '끝');
ok('열린 알림 1줄', openRows().length, 1);
r = save('2610', 3, '');
ok('저장 ok', r.ok, true);
ok('열린 알림 0 · 사유 = 매장이 완료 취소', [openRows().length, rowOf(3)[6], rowOf(3)[8]], [0, '처리', '매장이 완료 취소']);

// ── ⑤ 검수로 처리 ──────────────────────────────────────────
console.log('\n⑤ 검수로 처리');
reset();
save('2610', 4, '끝'); save('2610', 5, '끝'); save('2610', 6, '끝');
audit(4, '확정');
ok('개선확정 → 처리', [rowOf(4)[6], rowOf(4)[8]], ['처리', '개선확정']);
audit(5, '');
ok('검수 취소는 닫지 않는다', rowOf(5)[6], '열림');
r = audit(5, '', { waive: true });
ok('점수 제외 ok', r.waive, true);
ok('점수 제외 → 처리', [rowOf(5)[6], rowOf(5)[8]], ['처리', '점수 제외']);
audit(6, '', { waive: false });
ok('점수 제외 해제는 닫지 않는다', rowOf(6)[6], '열림');
audit(6, '반려');
ok('보완 요청 → 처리', [rowOf(6)[6], rowOf(6)[8]], ['처리', '보완 요청']);

// ── ⑥ 9월 탭 ───────────────────────────────────────────────
/* 2026-09-17 담당자 「앱에서 막기」 — 매장 계정은 9월까지의 달에 저장하지 못한다(storeWriteBlock).
   종전 이 자리는 「저장 ok · 알림 없음 · 시트에는 쓰였다」였다 — ★일부러 바꾼 동작이다★ */
console.log('\n⑥ 2609 탭 — 매장 저장 거절');
reset();
var before2609 = STORE_TABS['2609']._get(ROW0, 14);
r = save('2609', 1, '끝');
ok('저장 거절 FORBIDDEN · 이유 문구', [r.ok, r.code, String(r.error).indexOf('9월까지의 기록은') === 0], [false, 'FORBIDDEN', true]);
ok('알림 없음', dataRows().length, 0);
ok('시트에는 안 쓰였다', STORE_TABS['2609']._get(ROW0, 14), before2609);

// ── ⑦ 알림이 터져도 ────────────────────────────────────────
console.log('\n⑦ 알림 쓰기가 예외를 던져도');
reset();
AUTH_BROKEN = true;
r = save('2610', 2, '새 글');
ok('★저장 결과는 ok★', r.ok, true);
ok('완료 칸은 그대로 쓰였다', STORE_TABS['2610']._get(ROW0 + 1, 14), '새 글');
ok('실행 로그에만 남긴다', LOGS.some(function (m) { return /알림 기록 실패/.test(m); }), true);
r = audit(2, '확정');
ok('★검수 결과도 ok★', [r.ok, r.audit], [true, '확정']);
r = audit(2, '', { waive: true });
ok('점수 제외도 ok', r.ok, true);

// ── ⑧ 사본 시험 경로 ───────────────────────────────────────
console.log('\n⑧ fileId 시험 경로');
reset();
// fileId 경로는 관리자만 (2026-09-15) — 그래서 여기만 save() 대신 관리자 ctx 로 직접 부른다
r = fnStoreSave({ id: 'admin', role: '관리자' },
  { ym: '2610', no: 1, rev: 'R', dept: '주방', owner: '김', plan: '10/15', doneNote: '끝', fileId: 'TEST1' }, '금종제과');
ok('저장 ok', r.ok, true);
ok('알림 없음', dataRows().length, 0);

// ── ⑨ notify.admin ─────────────────────────────────────────
console.log('\n⑨ notify.admin');
reset();
save('2610', 1, '끝'); save('2610', 2, '끝'); save('2610', 3, '끝');
audit(2, '확정');
r = fnNotifyAdmin({ id: 'admin' });
ok('ok · 열린 것만 2건', [r.ok, r.count], [true, 2]);
ok('★최신이 먼저★', r.items.map(function (x) { return x.no; }), [3, 1]);
ok('항목 모양', Object.keys(r.items[0]).sort(), ['at', 'kind', 'no', 'store', 'text', 'ym']);
ok('월은 글자', r.items[0].ym, '2610');
save('2610', 4, '끝');
ok('적으면 캐시를 지운다 (바로 3건)', fnNotifyAdmin({}).count, 3);
audit(4, '확정');
ok('처리해도 캐시를 지운다 (바로 2건)', fnNotifyAdmin({}).count, 2);
for (var i = 0; i < 55; i++) NT().appendRow(['2026-10-01 09:00:00', '검수대기', '매장' + i, '2610', 1, 'x', '열림', '', '']);
CACHE = {};
r = fnNotifyAdmin({});
ok('count 는 전체 · items 는 50개까지', [r.count, r.items.length], [57, 50]);
ok('맨 위는 가장 나중 줄', r.items[0].store, '매장54');
AUTH_BROKEN = true; CACHE = {};
r = fnNotifyAdmin({});
ok('실패는 조용히 ok:false (던지지 않는다)', r.ok, false);

// ── ⑩ 매장 배지 ────────────────────────────────────────────
console.log('\n⑩ 매장 배지 todo');
reset();
var ME = { id: '금종제과', stores: { all: false, list: ['금종제과'] } };
BADGE_ITEMS = [
  { no: 1, status: '반려', state: '완료' },                    // 보완 요청 → 센다
  { no: 2, status: '확정', state: '완료' },                    // 안 센다
  { no: 3, status: '완료(검수 전)', state: '완료' },           // 검수 대기 → 안 센다
  { no: 4, status: '진행중', state: '진행' },                  // 종전 그대로 → 센다
  { no: 5, status: '기한 지남', state: '미조치', waive: true }, // 점수 제외 → 안 센다
  { no: 6, status: '재제출기한 지남', state: '완료' },         // 센다
  { no: 7, status: '완료(검수 전)', state: '완료', resub: true }, // 이미 다시 올림(보완본) → 안 센다 (J9 — 상태가 말한다)
  { no: 8, status: '확정', state: '미조치' },                  // 확정은 완료 칸이 비어도 안 센다
  { no: 9, status: '기한 후 완료', state: '완료' },            // 기한 뒤에 올린 완료 → 할 일 아님
];
r = fnNotifyBadge(ME);
ok('★보완 요청을 센다★ — 1·4·6번 = 3', r.store && r.store.todo, 3);
CACHE = {};
BADGE_ITEMS = [{ no: 1, status: '반려', state: '완료' }, { no: 7, status: '반려', state: '완료' }];
AUTH_BROKEN = true;
r = fnNotifyBadge(ME);
ok('★배지는 알림 원장을 안 본다★ — 원장이 터져도 반려 2건을 센다 (배지는 ok)', [r.ok, r.store && r.store.todo], [true, 2]);
AUTH_BROKEN = false; CACHE = {};
BADGE_ITEMS = [{ no: 1, status: null, state: '완료' }, { no: 2, status: null, state: '진행' }, { no: 3, status: null, state: '미조치' }];
r = fnNotifyBadge(ME);
ok('옛 서식은 종전 그대로 (완료 아닌 것 2)', r.store && r.store.todo, 2);
CACHE = {};
r = fnNotifyBadge({ id: 'admin', stores: { all: true, list: [] } });
ok('관리자에게는 store 를 안 담는다', [r.ok, r.store === undefined], [true, true]);

// ── ⑪ 정리 ─────────────────────────────────────────────────
console.log('\n⑪ 40일 지난 「처리」 줄 정리');
reset();
var nt = notifySheet(AUTH_SS, true);
var recent = Utilities.formatDate(new Date(), 'x', 'yyyy-MM-dd HH:mm:ss');
nt.appendRow(['2020-01-01 09:00:00', '검수대기', '갑매장', '2610', 1, '오래된 처리', '처리', '2020-01-02 09:00:00', '개선확정']);
nt.appendRow(['2020-01-01 09:00:00', '검수대기', '을매장', '2610', 1, '오래된 열림', '열림', '', '']);
nt.appendRow(['2020-01-01 09:00:00', '재제출', '병매장', '2610', 1, '최근 처리', '처리', recent, '보완 요청']);
save('2610', 1, '끝');
ok('오래된 처리만 지우고 · 열린 줄 · 최근 처리 · 새 줄은 남긴다',
   dataRows().map(function (x) { return x[5]; }), ['오래된 열림', '최근 처리', '10월 1번 개선요청을 완료로 제출했습니다']);
ok('오늘 날짜를 찍는다', !!PROPSTORE.NOTIFY_TIDY_DAY, true);
nt.appendRow(['2020-01-01 09:00:00', '검수대기', '정매장', '2610', 1, '또 오래된 처리', '처리', '2020-01-02 09:00:00', '개선확정']);
save('2610', 2, '끝');
ok('★하루 한 번★ — 같은 날 두 번째는 안 지운다', dataRows().some(function (x) { return x[5] === '또 오래된 처리'; }), true);

// ── ⑫ 완료 제출일 · 보완본 · 보완 요청 한 번만 (2026-09-17 J1·J9·J16) ─────────
console.log('\n⑫ 완료 제출일 (옛 이월 칸 T) · 보완본 · 보완 요청 한 번만');
reset();
var TAB = function () { return STORE_TABS['2610']; };
var SUB = function (no) { return TAB()._get(ROW0 + no - 1, 20); };
var TODAY = Utilities.formatDate(new Date(), 'x', 'yyyy-MM-dd');
r = save('2610', 1, '');
ok('빈 완료로 저장 → 제출일 안 적음', SUB(1), '');
r = save('2610', 1, '교체 완료');
ok('처음 완료 → 제출일 = 오늘', SUB(1), TODAY);
ok('★저장 응답에 상태가 실린다★ — 완료(검수 전) · overdue 아님 · resub 아님',
   [r.item.status, r.item.overdue, r.item.resub], ['완료(검수 전)', false, false]);
TAB()._set(ROW0, 20, '2026-10-01');            // 처음 올린 날이 따로 있었다고 치고
save('2610', 1, '교체 완료 — 문구만 고침');
ok('완료 문구만 고쳐 저장 → 제출일 그대로 (처음 올린 날)', SUB(1), '2026-10-01');
save('2610', 1, '');
ok('완료를 비움 → 제출일도 비움', SUB(1), '');

console.log('  · 규칙 전에 올린 완료(제출일 없음)');
TAB()._set(ROW0 + 1, 14, '예전에 올린 완료');
save('2610', 2, '예전에 올린 완료 — 고침');
ok('고쳐 저장해도 제출일을 새로 박지 않는다', SUB(2), '');

console.log('  · 보완 요청 → 보완본');
save('2610', 3, '청소함');
ok('3번 제출일 = 오늘', SUB(3), TODAY);
r = audit(3, '반려');
ok('보완 요청 ok · 재제출기한 적힘', [r.ok, r.audit, r.redo], [true, '반려', '2099-12-31']);
ok('★보완 요청이 제출일을 비운다★', SUB(3), '');
ok('보완본 전 상태 = 반려 · resub 아님', [r.status, r.resub], ['반려', false]);
r = save('2610', 3, '청소함');
ok('글·사진을 안 바꾸고 저장 → 제출일 그대로 빈칸 · 상태 반려', [SUB(3), r.item.status], ['', '반려']);
r = save('2610', 3, '다시 꼼꼼히 청소함');
ok('보완본 → 제출일 = 오늘', SUB(3), TODAY);
ok('★보완본은 「완료(검수 전)」 · resub★', [r.item.status, r.item.resub, r.item.overdue], ['완료(검수 전)', true, false]);
TAB()._set(ROW0 + 2, 20, '2026-10-05');
save('2610', 3, '다시 꼼꼼히 청소함 — 사진 추가', { photo: { dataUrl: 'data:z' } });
ok('보완본을 또 고쳐도 제출일 그대로 (보완본 처음 올린 날)', SUB(3), '2026-10-05');
r = audit(3, '반려');
ok('★두 번째 보완 요청 거절★', [r.ok, r.code], [false, 'CONFLICT']);
ok('거절이면 아무것도 안 바꾼다 (검수 칸 반려 · 제출일 그대로)', [TAB()._get(ROW0 + 2, 17), SUB(3)], ['반려', '2026-10-05']);
r = audit(3, '확정');
ok('보완본 개선확정 → 확정 · ★재제출기한은 남긴다★', [r.status, TAB()._get(ROW0 + 2, 18)], ['확정', '2099-12-31']);
r = audit(3, '반려');
ok('★확정을 거쳐도 두 번째 보완 요청은 거절★', [r.ok, r.code, TAB()._get(ROW0 + 2, 17)], [false, 'CONFLICT', '확정']);
r = audit(3, '');
ok('보완본이 온 뒤 검수 취소 → 재제출기한 남김 · 보완본은 여전히 기한 안', [TAB()._get(ROW0 + 2, 18), r.status], ['2099-12-31', '완료(검수 전)']);
r = audit(3, '반려');
ok('★검수 취소를 거쳐도 두 번째 보완 요청은 거절★', [r.ok, r.code], [false, 'CONFLICT']);

console.log('  · 잘못 누른 보완 요청 되돌리기 (보완본 전 검수 취소)');
save('2610', 6, '끝냄');
audit(6, '반려');
r = audit(6, '');
ok('보완본 전 검수 취소 → 재제출기한도 지움 · 완료(검수 전)', [r.ok, TAB()._get(ROW0 + 5, 18), r.redo, r.status], [true, '', null, '완료(검수 전)']);
r = audit(6, '반려');
ok('그 뒤 보완 요청은 다시 된다 (거둔 요청은 센 적 없음)', [r.ok, r.audit], [true, '반려']);

console.log('  · 미조치 처리');
r = audit(4, '미조치');
ok('보완 요청 안 한 건에는 미조치 처리 거절', [r.ok, r.code], [false, 'CONFLICT']);
save('2610', 4, '함');
audit(4, '반려');
r = audit(4, '미조치');
ok('보완 요청한 건 → 미조치 처리 = 재반려 · 미조치 · 새 문구',
   [r.audit, r.status, r.statusWhy], ['재반려', '미조치', '보완 요청 뒤 미조치로 처리되었습니다']);
r = audit(4, '반려');
ok('미조치 처리한 건에 보완 요청도 거절', [r.ok, r.code], [false, 'CONFLICT']);
r = audit(4, '');
ok('검수 취소는 된다 · 재제출기한은 남는다(미조치 처리 뒤라 거둔 요청이 아님)', [r.ok, r.audit, TAB()._get(ROW0 + 3, 18)], [true, '', '2099-12-31']);
r = audit(4, '반려');
ok('미조치 처리 → 검수 취소를 거쳐도 보완 요청 거절', [r.ok, r.code], [false, 'CONFLICT']);

console.log('  · 기한 뒤에 올린 완료');
TAB()._set(ROW0 + 4, 2, '2000-01-01');          // 5번 조치기한을 먼 과거로
r = save('2610', 5, '늦게 했습니다');
ok('기한 뒤 완료 → 기한 후 완료 · overdue 아님', [r.item.status, r.item.overdue], ['기한 후 완료', false]);
ok('why = 조치기한 … 이 지난 뒤 완료했습니다', r.item.statusWhy, '조치기한 2000-01-01 이 지난 뒤 완료했습니다 — 개선율에는 넣지 않습니다');
r = audit(5, '반려');
ok('★기한 뒤 완료에는 보완 요청 거절★ · 검수 칸 그대로', [r.ok, r.code, TAB()._get(ROW0 + 4, 17)], [false, 'CONFLICT', '']);
r = audit(5, '확정');
ok('개선확정은 된다 · 상태는 여전히 기한 후 완료', [r.ok, r.status], [true, '기한 후 완료']);

console.log('  · 보완본을 보완 기한 뒤에 올림');
TAB()._set(ROW0 + 5, 18, '2000-01-01');         // 6번(위에서 다시 보완 요청함) 보완 기한을 먼 과거로
r = save('2610', 6, '늦은 보완본');
ok('보완 기한 뒤 보완본 → 기한 후 완료 · resub · why 는 보완 기한',
   [r.item.status, r.item.resub, r.item.statusWhy.indexOf('보완 기한 2000-01-01') === 0], ['기한 후 완료', true, true]);

console.log('  · 사본 시험 경로(fileId)도 제출일을 적는다');
reset();
r = fnStoreSave({ id: 'admin', role: '관리자' },
  { ym: '2610', no: 2, rev: 'R', dept: '주방', owner: '김', plan: '', doneNote: '끝', fileId: 'TEST1' }, '금종제과');
ok('사본 저장 ok · 제출일 = 오늘 · 알림 없음', [r.ok, SUB(2), dataRows().length], [true, TODAY, 0]);

console.log('\n' + (fail ? '✗ ' + fail + '개 실패 · ' : '✓ 전부 통과 · ') + pass + '개 통과');
process.exit(fail ? 1 : 0);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
if not NODE.is_file():
    raise SystemExit('node 를 못 찾음: %s' % NODE)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:3000])
OUT.unlink(missing_ok=True)
print('글자 점검 %d개 통과 · %d개 실패' % (py_pass, py_fail))
sys.exit(1 if (r.returncode or py_fail) else 0)
