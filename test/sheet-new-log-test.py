# -*- coding: utf-8 -*-
"""sheet() — 없는 탭을 새로 만들면 감사로그 한 줄 (2026-09-17 담당자 ②-5f)

★Code.gs 의 진짜 sheet() 를 잘라내서 돌린다★ (사본 아님).

왜: 관리자 시트 탭 이름이 바뀌면 sheet() 가 빈 탭을 조용히 만들고 그 뒤 제출이 전부 빈 탭에 쌓인다 — 오류 하나 없이.
    만든 사실을 감사로그에 남겨 사람이 탭 이름을 되돌릴 수 있게 한다.

보는 것:
  ① 있는 탭 → 그대로 · 로그 없음
  ② 없는 탭 → 만들고 머리글·고정행 · 감사로그 1줄('sheet.new' · 경고 · 탭 이름)
  ③ 로그가 터져도 탭은 돌려준다 · 플래그가 풀려 다음 탭도 기록된다
  ④ 대조군: QSC_SRC=<고치기 전 사본> 으로 돌리면 ②가 실패해야 한다
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_sheet_new.js'
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


flag = next((l for l in lines if l.startswith('let SHEET_NEW_LOGGING')), 'let SHEET_NEW_LOGGING = false;   /* 옛 사본 */')

js = r'''
let LOGS = [], LOG_THROW = false;
function auditLog(ctx, action, store, result, reason, note) { if (LOG_THROW) throw new Error('로그 실패'); LOGS.push({ id: ctx && ctx.id, action: action, result: result, reason: reason, note: note }); }
function mkSS(names) {
  const tabs = {};
  names.forEach(function (n) { tabs[n] = { _n: n, rows: [], frozen: 0, appendRow: function (r) { this.rows.push(r); }, setFrozenRows: function (n) { this.frozen = n; } }; });
  return { tabs: tabs, made: [],
    getSheetByName: function (n) { return tabs[n] || null; },
    insertSheet: function (n) { this.made.push(n); tabs[n] = { _n: n, rows: [], frozen: 0, appendRow: function (r) { this.rows.push(r); }, setFrozenRows: function (k) { this.frozen = k; } }; return tabs[n]; } };
}
''' + flag + '\n' + cut('sheet') + r'''

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }

console.log('① 있는 탭');
let ss = mkSS(['QSC_상세']);
let sh = sheet(ss, 'QSC_상세', ['a', 'b']);
ok('그대로 돌려준다 · 안 만든다 · 로그 없음', sh === ss.tabs['QSC_상세'] && ss.made.length === 0 && LOGS.length === 0);

console.log('② 없는 탭');
sh = sheet(ss, 'QSC_회차', ['제출시각', '점검일자']);
ok('만들었다 · 머리글 1줄 · 고정 1행', ss.made.join() === 'QSC_회차' && sh.rows.length === 1 && sh.rows[0][0] === '제출시각' && sh.frozen === 1, [ss.made, sh.rows, sh.frozen]);
ok('감사로그 1줄 — sheet.new · 경고 · SHEET_NEW', LOGS.length === 1 && LOGS[0].action === 'sheet.new' && LOGS[0].result === '경고' && LOGS[0].reason === 'SHEET_NEW', LOGS);
ok('탭 이름과 되돌리라는 말이 들어 있다', /「QSC_회차」/.test(LOGS[0].note) && /되돌려/.test(LOGS[0].note), LOGS[0] && LOGS[0].note);
ok('누가 = (시스템)', LOGS[0].id === '(시스템)', LOGS[0]);

console.log('③ 로그가 터져도');
LOGS = []; LOG_THROW = true;
sh = sheet(ss, 'NA프리셋', ['매장명']);
ok('탭은 만들어 돌려준다', sh === ss.tabs['NA프리셋'] && ss.made.indexOf('NA프리셋') >= 0);
LOG_THROW = false;
sheet(ss, '월말반영', ['실행시각']);
ok('플래그가 풀려 다음 탭은 기록된다', LOGS.length === 1 && /「월말반영」/.test(LOGS[0].note), LOGS);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
sys.exit(1 if res.returncode != 0 else 0)
