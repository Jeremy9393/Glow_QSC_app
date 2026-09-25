# -*- coding: utf-8 -*-
"""개선요청 기한 계산(impPlusDays) — 매장 파일 시간대와 무관하게 같은 날짜가 나오는가 (2026-09-25 검수 · dates-8)

★Code.gs 의 진짜 impPlusDays 를 잘라 node 로 돌린다★. 종전 식(서울 시각으로 만든 날짜를 파일 시간대로 찍기)은
파일 시간대가 서울보다 서쪽이면 하루 짧게 나왔다 — 대조군으로 그 사고를 재현해 이 시험이 잡는지도 본다.
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
NODE = ROOT.parent / '_도구' / 'node' / 'node.exe'
src = io.open(ROOT / 'backend' / 'Code.gs', 'r', encoding='utf-8', newline='').read()
i, j = src.find('function impPlusDays('), src.find('function impDueOf(')
if not (0 <= i < j):
    raise SystemExit('impPlusDays 를 Code.gs 에서 못 찾음')
body = src[i:j]

HARNESS = r'''
// 자동 생성 — Code.gs 의 impPlusDays 를 가짜 Utilities 위에서 돌린다
function tzOffsetMin(tz) { return { 'Asia/Seoul': 540, 'UTC': 0, 'America/Los_Angeles': -420 }[tz]; }
const Utilities = { formatDate: function (d, tz, f) {
  const off = tzOffsetMin(tz); if (off === undefined) throw new Error('tz ' + tz);
  return new Date(d.getTime() + off * 60000).toISOString().slice(0, 10); } };
function dateOfCell(s) { return String(s || '').slice(0, 10); }
%s
const cases = [['2026-10-01', 15, '2026-10-16'], ['2026-10-20', 15, '2026-11-04'], ['2026-12-25', 15, '2027-01-09'],
               ['2026-02-20', 15, '2026-03-07'], ['2028-02-20', 10, '2028-03-01'], ['2026-10-31', 7, '2026-11-07'], ['', 15, ''], ['xx', 3, '']];
let bad = 0, n = 0;
['Asia/Seoul', 'UTC', 'America/Los_Angeles'].forEach(function (tz) {
  cases.forEach(function (c) { n++; const got = impPlusDays(c[0], c[1], tz); if (got !== c[2]) { bad++; console.log('X', tz, c[0], '+' + c[1], got, '≠', c[2]); } });
});
console.log(bad ? 'FAIL ' + bad + '/' + n : 'OK ' + n);
'''

# 옛 식(대조군) — 서울 시각(로컬 Date)으로 만들고 파일 시간대로 찍는다. 로컬 시간대를 서울로 고정해 돌린다.
OLD = '''function impPlusDays(dateStr, days, tz) {
  try { const d = dateOfCell(dateStr, tz); if (!d) return ''; const p = String(d).split('-'); if (p.length !== 3) return '';
    const dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); if (isNaN(dt.getTime())) return '';
    dt.setDate(dt.getDate() + days); return Utilities.formatDate(dt, tz || 'Asia/Seoul', 'yyyy-MM-dd'); } catch (e) { return ''; } }
'''

def run(code, name):
    p = HERE / ('t_%s.js' % name)
    io.open(p, 'w', encoding='utf-8', newline='').write(HARNESS % code)
    env = dict(os.environ, TZ='Asia/Seoul')
    r = subprocess.run([str(NODE) if NODE.exists() else 'node', str(p)], capture_output=True, text=True, encoding='utf-8', env=env)
    return (r.stdout or '') + (r.stderr or '')

out = run(body, 'imp_days')
print(out.strip())
ctl = run(OLD, 'imp_days_old')
caught = 'FAIL' in ctl
print('대조군(옛 식) —', '서쪽 시간대에서 하루 짧게 나오는 것을 잡음' if caught else '★못 잡음★')
sys.exit(0 if out.strip().endswith(('OK 24',)) and caught else 1)
