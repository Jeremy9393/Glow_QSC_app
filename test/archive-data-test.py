# -*- coding: utf-8 -*-
"""NAS 아카이빙 자료 (admin.archiveData · fnArchiveData) 시험 (2026-09-17)

★Code.gs 의 진짜 fnArchiveData · archiveSplitDemo · dateOfCell · timeKeyOf · stampOf · normStore · validYm ·
  err · round1 과 상수(MS_COL·ARCHIVE_*)를 잘라내서 돌린다★ (사본 아님). 시트·매장 파일·확정 기록은 가짜로 끼운다.

담당자 (2026-09-17): *"QSC,MS평가표를 직접 매번 입력하려니 좀 싫어서 너가 관리자 시트에 올라온 답을
  그대로 갖다붙여넣기 해달라는거야"* · *"평가표는 원본은 유지하고 월별로 계속 붙여넣기 하면서 작성해야돼"*
  · 시기 「월말 채점 확정 뒤 한 번」

보는 것:
  ① 정상 — QSC 74칸(건수·비고·NA 사유)·머리글·앱 점수 / MS 38칸·연령대/성별 나누기·주문내역·총평·앱 점수 / 확정 시각
  ② ★짐작하지 않는다★ — 같은 달 QSC 2건 · 빠진 문항 · 같은 번호 두 줄 · 매장 파일 못 찾음 → problems 만, 칸은 안 준다
     ★MS 2건은 가장 최근 제출 1건 + msNote★ (2026-09-17 담당자 결정 — 앱 점수 shopperMonthAvg 와 같은 규칙)
  ③ 키오스크 — ★3-1·3-2·7-1·7-2·7-3 이 빠졌을 때만★ NA 로 채운다 · 다른 번호가 빠지면 problems
  ④ 다른 달·다른 매장은 섞이지 않는다 · 같은 날·시각이어도 제출시각이 다르면 섞이지 않는다 · 매장명 띄어쓰기는 앱 매장명으로
  ⑤ 읽기만 한다(쓰기 호출 없음) · 등록표는 「읽기」 · 키오스크 번호가 master.json 과 같다
"""
import io, json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / 'backend' / 'Code.gs'
MASTER = HERE.parent / 'data' / 'master.json'
ARCHIVE = HERE.parent.parent.parent / '4. 스프레드시트' / 'tools' / 'archive.py'
NODE = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\1. 앱\_도구\node\node.exe')
OUT = HERE / 't_archive_data.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

text = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = text.split('\n')


def cut(name):
    st = next(i for i, l in enumerate(lines) if l.startswith('function %s(' % name))
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


def cutconst(prefix):
    st = next(i for i, l in enumerate(lines) if l.startswith(prefix))
    if re.search(r';\s*(//.*)?$', lines[st].rstrip()):       # 한 줄짜리(뒤에 주석이 붙어도)
        return lines[st]
    for j in range(st + 1, len(lines)):
        if lines[j].startswith('};'):
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % prefix)


FNS = ['fnArchiveData', 'archiveSplitDemo', 'dateOfCell', 'timeKeyOf', 'stampOf', 'normStore', 'validYm', 'err', 'round1']
CONSTS = ['const MS_DETAIL ', 'const MS_COL ', 'const ARCHIVE_QSC_N ', 'const ARCHIVE_MS_N ', 'const ARCHIVE_KIOSK_NOS ']
body = '\n'.join(cut(n) for n in FNS) + '\n' + '\n'.join(cutconst(c) for c in CONSTS)
print('잘라낸 줄 수: %d' % len(body.split('\n')))

HARNESS = r'''
// ══ 가짜 세계 ══════════════════════════════════════════════════
var SPREADSHEET_ID = 'resp';
var SHEETS = {};
function fakeSheet(rows) { return { rows: rows, getLastRow: function () { return rows.length + 1; } }; }
var SpreadsheetApp = { openById: function () { return { getSheetByName: function (n) { return SHEETS[n] || null; } }; } };
function grid(sh, row, col, nRows, nCols) {
  if (nRows < 1) return null;
  return { getValues: function () { return sh.rows.slice(row - 2, row - 2 + nRows).map(function (r) {
    var o = r.slice(col - 1, col - 1 + nCols); while (o.length < nCols) o.push(''); return o; }); } };
}
function ssTz() { return 'Asia/Seoul'; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
var Utilities = { formatDate: function (d, tz, fmt) {
  var k = new Date(d.getTime() + 9 * 3600 * 1000);   // KST
  var s = { yyyy: k.getUTCFullYear(), MM: pad(k.getUTCMonth() + 1), dd: pad(k.getUTCDate()), HH: pad(k.getUTCHours()), mm: pad(k.getUTCMinutes()) };
  return fmt.replace('yyyy', s.yyyy).replace('MM', s.MM).replace('dd', s.dd).replace('HH', s.HH).replace('mm', s.mm);
} };
var DISPLAY = ['제주당', '카페 라', '도넛정수', '호우주의보 이태원', '우물집 판교', '청수당 애월', '신라당 경주', '온천집 대전', '청수당 신록'];
function displayStores() { return DISPLAY.slice(); }
var FILES = { '제주당': 'f-jeju', '카페 라': 'f-cafe', '도넛정수': 'f-donut', '호우주의보 이태원': 'f-hou', '우물집 판교': 'f-woo',
  '청수당 애월': 'f-chae', '신라당 경주': 'f-shilla', '청수당 신록': 'f-chsin' };   // 온천집 대전은 파일 없음
function storeFileId(store) { return FILES[store] || null; }
var CLOSED = { 'f-jeju:2612': '2027-01-02 10:00', 'f-chsin:2612': '2027-01-02 11:00' };
function monthClosedAt(id, ym) { return CLOSED[id + ':' + ym] || ''; }
function nowIso() { return '2027-01-03T09:00:00+09:00'; }

// ── 자료 만들기 ──
var R = [], D = [], M = [];      // QSC_회차 · QSC_상세 · MS_상세
function qsc(store, date, time, at, score, opt) {
  opt = opt || {};
  R.push([at, date, time, store, opt.inspector || '신문수', score]);
  for (var no = 1; no <= 74; no++) {
    if (opt.drop && opt.drop.indexOf(no) >= 0) continue;
    var v = (opt.vals && opt.vals[no] !== undefined) ? opt.vals[no] : '0';
    var memo = (opt.memos && opt.memos[no]) || '';
    var why = (opt.why && opt.why[no]) || '';
    D.push([date, time, store, 'X-' + no, no, 'G', '문항' + no, '', v, '', '', memo, '', why, at]);
    if (opt.dupNo === no) D.push([date, time, store, 'X-' + no, no, 'G', '문항' + no, '', v, '', '', memo, '', why, at]);
  }
}
function ms(store, date, time, at, total, opt) {
  opt = opt || {};
  for (var no = 1; no <= 38; no++) {
    if (opt.drop && opt.drop.indexOf(no) >= 0) continue;
    var a = (opt.ans && opt.ans[no] !== undefined) ? opt.ans[no] : (no >= 32 ? '5' : '예');
    M.push([date, time, store, '', no, '질문' + no, a, '', (opt.memos && opt.memos[no]) || '', at, opt.route || '관리자 입력',
      total, 38, opt.overall || '', opt.demo || '', opt.order || '', '']);
  }
}
// ① 제주당 — 정상 · 확정됨
qsc('제주당', '2026-12-01', '14:30', '2026-12-01T05:40:00.000Z', 70, {
  vals: { 3: '2', 10: 'NA', 11: 'NA' }, memos: { 3: '온도계 없음', 11: '공사중' }, why: { 10: '본사 대기', 11: '해당 없음' } });
ms('제주당', '2026-12-05', '12:10', '2026-12-05T03:20:00.000Z', 91.3, {
  ans: { 2: '아니오', 33: '4' }, memos: { 2: '인사 없음' }, demo: '30대 여성', order: '아메리카노 2', overall: '좋았어요' });
// ② 카페 라 — 시트에 띄어쓰기 두 칸 · 키오스크(5문항 없음) · 확정 전 · QSC 없음
ms('카페  라', '2026-12-09', '15:00', '2026-12-09T06:05:00.000Z', 88.2, { drop: [7, 8, 19, 20, 21], demo: '20대 초반 남성 2인' });
// ③ 도넛정수 — 같은 달 QSC 2건
qsc('도넛정수', '2026-12-01', '10:00', '2026-12-01T01:10:00.000Z', 80);
qsc('도넛정수', '2026-12-15', '11:00', '2026-12-15T02:10:00.000Z', 85);
// ④ 호우주의보 이태원 — 같은 달 MS 2건
ms('호우주의보 이태원', '2026-12-02', '13:00', '2026-12-02T04:00:00.000Z', 90);
ms('호우주의보 이태원', '2026-12-20', '13:00', '2026-12-20T04:00:00.000Z', 92);
// ⑤ 우물집 판교 — QSC 74번 빠짐 · 청수당 애월 — 5번 두 줄
qsc('우물집 판교', '2026-12-03', '09:00', '2026-12-03T00:10:00.000Z', 90, { drop: [74] });
qsc('청수당 애월', '2026-12-04', '09:00', '2026-12-04T00:10:00.000Z', 90, { dupNo: 5 });
// ⑥ 신라당 경주 — MS 12번 빠짐(키오스크 번호 아님)
ms('신라당 경주', '2026-12-06', '16:00', '2026-12-06T07:00:00.000Z', 80, { drop: [12] });
// ⑦ 온천집 대전 — 매장 파일 없음
qsc('온천집 대전', '2026-12-07', '10:00', '2026-12-07T01:00:00.000Z', 99);
// ⑧ 청수당 신록 — 같은 날·같은 시각에 제출시각이 다른 옛 상세 한 벌이 남아 있다
qsc('청수당 신록', '2026-12-08', '14:00', '2026-12-08T05:00:00.000Z', 95, { vals: { 1: '1' } });
R.pop();                                                     // 옛 벌의 회차 줄은 없다(되돌리기로 지워진 경우)
qsc('청수당 신록', '2026-12-08', '14:00', '2026-12-08T05:30:00.000Z', 96, { vals: { 1: '0' } });
// 다른 달(11월) — 섞이면 안 된다
qsc('제주당', '2026-11-03', '14:30', '2026-11-03T05:40:00.000Z', 50, { vals: { 3: '9' } });
ms('제주당', '2026-11-05', '12:10', '2026-11-05T03:20:00.000Z', 10, { ans: { 2: '예' } });

SHEETS['QSC_회차'] = fakeSheet(R);
SHEETS['QSC_상세'] = fakeSheet(D);
SHEETS['MS_상세'] = fakeSheet(M);

var pass = 0, fail = 0;
function ok(what, got, want) {
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + what); }
  else { fail++; console.log('  ✗ ' + what + '\n      받음: ' + g + '\n      기대: ' + w); }
}
function has(what, arr, frag) {
  var s = JSON.stringify(arr || []);
  if (s.indexOf(frag) >= 0) { pass++; console.log('  ✓ ' + what); }
  else { fail++; console.log('  ✗ ' + what + '\n      «' + frag + '» 없음 · 받음: ' + s); }
}

var res = fnArchiveData({ auth: true, id: 'admin' }, { ym: '2612' });
var S = res.stores || {};
console.log('── ① 제주당 — 정상 ──');
var j = S['제주당'];
ok('ok · ym · month', [res.ok, res.ym, res.month], [true, '2612', '2026-12']);
ok('problems 없음', j.problems, []);
ok('QSC 머리글', [j.qsc.date, j.qsc.time, j.qsc.inspector], ['2026-12-01', '14:30', '신문수']);
ok('QSC 74칸', [j.qsc.counts.length, j.qsc.memos.length], [74, 74]);
ok('건수는 숫자 · NA 는 NA', [j.qsc.counts[0], j.qsc.counts[2], j.qsc.counts[9], j.qsc.counts[10]], [0, 2, 'NA', 'NA']);
ok('비고 · NA 사유를 비고 뒤에', [j.qsc.memos[2], j.qsc.memos[9], j.qsc.memos[10]], ['온도계 없음', 'NA 사유: 본사 대기', '공사중 · NA 사유: 해당 없음']);
ok('★11월 값(9)이 섞이지 않음★', j.qsc.counts.indexOf(9), -1);
ok('앱 QSC 점수', j.qscScore, 70);
ok('MS 머리글', [j.ms.date, j.ms.time, j.ms.order, j.ms.age, j.ms.sex, j.ms.staff, j.ms.overall], ['2026-12-05', '12:10', '아메리카노 2', '30대', '여성', '', '좋았어요']);
ok('MS 38칸 · 답 · 비고', [j.ms.answers.length, j.ms.answers[1], j.ms.answers[32], j.ms.memos[1]], [38, '아니오', '4', '인사 없음']);
ok('앱 MS 점수 · 입력경로', [j.msScore, j.msRoute], [91.3, '관리자 입력']);
ok('확정 시각', j.closedAt, '2027-01-02 10:00');
ok('키오스크 NA 채움 없음', j.msNaFilled === undefined, true);

console.log('── ② 카페 라 — 키오스크 · 확정 전 · 띄어쓰기 ──');
var c = S['카페 라'];
ok('★시트의 「카페  라」가 앱 매장명 「카페 라」로★', [!!c, S['카페  라'] === undefined], [true, true]);
ok('QSC 없음 · problems 없음', [c.qsc === undefined, c.problems], [true, []]);
ok('★빠진 키오스크 문항만 NA★', [c.ms.answers[6], c.ms.answers[7], c.ms.answers[18], c.ms.answers[19], c.ms.answers[20], c.ms.answers[5]], ['NA', 'NA', 'NA', 'NA', 'NA', '예']);
ok('msNaFilled', c.msNaFilled, [7, 8, 19, 20, 21]);
ok('연령대 「20대 초반」 → 20대초반 · 나머지 → 성별/인원', [c.ms.age, c.ms.sex], ['20대초반', '남성 2인']);
ok('확정 전 → closedAt 빈칸', c.closedAt, '');

console.log('── ③ 짐작하지 않는다 ──');
has('도넛정수 — QSC 2건', S['도넛정수'].problems, 'QSC 제출이 2건');
ok('도넛정수 — QSC 칸 안 줌', S['도넛정수'].qsc === undefined, true);
var h2 = S['호우주의보 이태원'];   // ★2026-09-17 담당자 결정 — MS 2건이면 가장 최근 제출 1건(앱 점수와 같은 규칙)★
ok('★호우주의보 이태원 — MS 2건이면 가장 최근(12-20·92점) 1건 · problems 없음★', [h2.problems, h2.ms && h2.ms.date, h2.msScore], [[], '2026-12-20', 92]);
has('호우주의보 이태원 — msNote 로 알린다', [h2.msNote], '같은 달 MS 2건 — 가장 최근 제출(2026-12-20 13:00)');
has('우물집 판교 — 빠진 문항', S['우물집 판교'].problems, '비어 있는 문항이 1개');
ok('우물집 판교 — QSC 칸 안 줌', S['우물집 판교'].qsc === undefined, true);
has('청수당 애월 — 같은 번호 두 줄', S['청수당 애월'].problems, '같은 문항 번호가 1줄 더');
has('신라당 경주 — 키오스크 번호 아닌 12번 빠짐', S['신라당 경주'].problems, '없는 문항 번호가 있습니다: 12');
ok('신라당 경주 — MS 칸 안 줌', S['신라당 경주'].ms === undefined, true);
has('온천집 대전 — 매장 파일 못 찾음', S['온천집 대전'].problems, '매장 파일을 찾지 못했습니다');

console.log('── ④ 같은 날·같은 시각의 옛 상세 한 벌 ──');
var t = S['청수당 신록'];
ok('★제출시각이 맞는 벌만 쓴다 — 중복으로 오판하지 않음★', [t.problems, t.qsc && t.qsc.counts[0], t.qscScore], [[], 0, 96]);

console.log('── ⑤ 입력 · 연령대 나누기 ──');
ok('ym 형식 틀림 → BAD_REQUEST', fnArchiveData({}, { ym: '202612' }).code, 'BAD_REQUEST');
ok('ym 없음 → BAD_REQUEST', fnArchiveData({}, null).code, 'BAD_REQUEST');
ok('11월 자료 — 제주당만(12월 매장 안 섞임)', Object.keys(fnArchiveData({}, { ym: '2611' }).stores), ['제주당']);
ok('나누기: 「30대 여성」', archiveSplitDemo('30대 여성'), { age: '30대', sex: '여성' });
ok('나누기: 「30대, 여」', archiveSplitDemo('30대, 여'), { age: '30대', sex: '여' });
ok('나누기: 「40대」', archiveSplitDemo('40대'), { age: '40대', sex: '' });
ok('★안 나뉘면 원문 전체를 연령대 칸에★ 「여성 30대」', archiveSplitDemo('여성 30대'), { age: '여성 30대', sex: '' });
ok('나누기: 빈칸', archiveSplitDemo(''), { age: '', sex: '' });

console.log('\n통과 ' + pass + ' · 실패 ' + fail);
if (fail) process.exit(1);
'''

OUT.write_text(body + '\n' + HARNESS, encoding='utf-8')
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout or '')
if r.stderr:
    print(r.stderr)

# ── 소스 자체를 보는 검사 ──────────────────────────────────────────
sp, sf = 0, 0


def src_ok(what, cond):
    global sp, sf
    if cond:
        sp += 1
        print('  ✓ %s' % what)
    else:
        sf += 1
        print('  ✗ %s' % what)


print('── 소스 검사 ──')
FN = cut('fnArchiveData')
src_ok("등록표: admin.archiveData = 계정관리 ★읽기★",
       "'admin.archiveData':  { menu: ADMIN_MENU, act: '읽기', scope: 'none', max: 1 * KB, fn: fnArchiveData }" in text)
src_ok('★읽기만 한다★ — 쓰기 호출이 없다',
       re.search(r'\.(setValue|setValues|appendRow|insertRow|deleteRow|clear|setProperty|deleteProperty)\(|prependRows|msPrepend|delRows', FN) is None)
m = json.load(io.open(MASTER, encoding='utf-8'))
qs = [q for c in m['shopper_categories'] for q in c['questions']]
kiosk = [q['no'] for q in qs if re.match(r'^(3-1|3-2|7-1|7-2|7-3)\.', str(q.get('text', '')))]
src_ok('키오스크 번호가 master.json(3-1·3-2·7-1·7-2·7-3)과 같다 %s' % kiosk,
       'const ARCHIVE_KIOSK_NOS = [%s];' % ', '.join(str(x) for x in kiosk) in text)
src_ok('키오스크 문항은 전부 예/아니오 척도 (NA 가 척도 검사를 통과한다)',
       all(q.get('scale') == 'yn' for q in qs if q['no'] in kiosk))
sarc = io.open(ARCHIVE, 'r', encoding='utf-8', newline='').read()
src_ok("archive.py: problems 가 있으면 채우지 않는다", "probs = d.get('problems') or []" in sarc and '채우지 않았습니다' in sarc)
src_ok("archive.py: MS 2건 알림(msNote)을 보여 준다", "if d.get('msNote'):" in sarc)
src_ok("archive.py: 확정 전(closedAt 빈칸)은 건너뛴다 · --include-open 은 시험용",
       "if 'closedAt' in stores[s] and not stores[s].get('closedAt') and not a.include_open:" in sarc)
src_ok("archive.py: 채운 점수를 앱 점수와 대조(QSC D89 · MS V63) · 다르면 저장 안 함",
       "(('QSC', d.get('qscScore'), 'D89', q), ('MS', d.get('msScore'), 'V63', m))" in sarc
       and 0 <= sarc.find("저장하지 않았습니다'") < sarc.find('        wb.Save()'))

print('\n소스 검사 통과 %d · 실패 %d' % (sp, sf))
try:
    OUT.unlink()
except OSError:
    pass
sys.exit(1 if (r.returncode or sf) else 0)
