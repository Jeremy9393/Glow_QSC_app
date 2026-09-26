# -*- coding: utf-8 -*-
"""월 확정 표식(MC:<파일>:<YYMM>) — 그 달이 시작하기 전 날짜로 찍힌 것은 무효·정리 (2026-09-26)

사고: 8/25 시험 때 금종제과 실제 매장 파일에 「2610 확정 = 2026-08-25」 표식이 남았다(스크립트 속성).
그대로였으면 10/1 부터 금종제과의 10월 QSC·MS 제출이 MONTH_CLOSED 로 막혔다.
★Code.gs 의 진짜 monthClosedAt · ymFirstDay · validYm · sweepLocks 를 잘라 node 로 돌린다★ + 옛 식 대조군.
"""
import io, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
NODE = ROOT.parent / '_도구' / 'node' / 'node.exe'
src = io.open(ROOT / 'backend' / 'Code.gs', 'r', encoding='utf-8', newline='').read()

def cut(name):
    m = re.search(r'^function ' + re.escape(name) + r'\(.*?^\}', src, re.S | re.M)
    if not m:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    return m.group(0)

HARNESS = r'''
// 자동 생성 — Code.gs 원문에서 잘라낸 함수를 가짜 속성·캐시 위에서 돌린다
const MC_PREFIX = 'MC:';
let store = {};
const PROPS = {
  getProperty: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  getProperties: function () { return Object.assign({}, store); },
  deleteProperty: function (k) { delete store[k]; },
};
function prop(k, d) { const v = PROPS.getProperty(k); return (v === null || v === undefined || v === '') ? d : v; }
let cacheMap = {};
const CacheService = { getScriptCache: function () { return {
  get: function (k) { return cacheMap[k] || null; }, put: function (k, v) { cacheMap[k] = v; } }; } };
function hourKey(p) { return p + 'H'; }
%s
let pass = 0, fail = 0;
function ok(name, cond, got) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + '  → ' + JSON.stringify(got)); } }
store = { 'MC:GUMJONG:2610': '2026-08-25', 'MC:FILEB:2610': '2026-10-31', 'MC:FILEC:2609': '2026-09-30', 'MC:FILED:2612': '2026-09-20',
          'MC:금종제과_익산_QSC현황_연동테스트:2610': '2026-08-24', 'PWS:매장': 'x', 'LK:abc': String(Date.now() + 600000) };
ok('① 달 시작 전 날짜 표식(2610 · 08-25)은 무효', monthClosedAt('GUMJONG', '2610') === '', monthClosedAt('GUMJONG', '2610'));
ok('② 정상 표식(2610 · 10-31)은 그대로', monthClosedAt('FILEB', '2610') === '2026-10-31', monthClosedAt('FILEB', '2610'));
ok('③ 정상 표식(2609 · 09-30)은 그대로', monthClosedAt('FILEC', '2609') === '2026-09-30', monthClosedAt('FILEC', '2609'));
ok('④ 12월 베타 흔적(2612 · 09-20)도 무효', monthClosedAt('FILED', '2612') === '', monthClosedAt('FILED', '2612'));
ok('⑤ 표식 없음은 빈칸', monthClosedAt('NONE', '2610') === '', monthClosedAt('NONE', '2610'));
ok('⑥ 달 첫날에 찍힌 표식(10-01)은 정상', (function () { store['MC:FILEE:2610'] = '2026-10-01'; return monthClosedAt('FILEE', '2610') === '2026-10-01'; })(), store['MC:FILEE:2610']);
const n = sweepLocks();
ok('⑦ 매시간 정리가 무효 표식 3개(금종제과·12월·사본)를 지운다', !('MC:GUMJONG:2610' in store) && !('MC:FILED:2612' in store)
   && !('MC:금종제과_익산_QSC현황_연동테스트:2610' in store) && n === 3, { n: n, keys: Object.keys(store) });
ok('⑧ 정상 표식·다른 속성·살아 있는 잠금은 남긴다', store['MC:FILEB:2610'] === '2026-10-31' && store['MC:FILEC:2609'] === '2026-09-30'
   && store['MC:FILEE:2610'] === '2026-10-01' && store['PWS:매장'] === 'x' && ('LK:abc' in store), Object.keys(store));
console.log(fail ? 'FAIL ' + fail : 'OK ' + pass);
'''

OLD_MC = '''function monthClosedAt(ss, ym) {
  try { const id = (ss && typeof ss === 'object' && ss.getId) ? ss.getId() : String(ss || ''); if (!id) return '';
    return prop(MC_PREFIX + id + ':' + ym, ''); } catch (e) { return ''; } }'''

def run(code, name):
    p = HERE / ('t_%s.js' % name)
    io.open(p, 'w', encoding='utf-8', newline='').write(HARNESS % code)
    r = subprocess.run([str(NODE) if NODE.exists() else 'node', str(p)], capture_output=True, text=True, encoding='utf-8')
    return (r.stdout or '') + (r.stderr or '')

fns = '\n'.join(cut(n) for n in ('validYm', 'ymFirstDay', 'monthClosedAt', 'sweepLocks'))
out = run(fns, 'mc_bogus')
print(out.strip())
ctl = run('\n'.join([cut('validYm'), cut('ymFirstDay'), OLD_MC, cut('sweepLocks')]), 'mc_bogus_old')
caught = '✗ ① 달 시작 전 날짜 표식' in ctl
print('대조군(옛 monthClosedAt) —', '08-25 표식을 확정으로 읽는 사고를 잡음' if caught else '★못 잡음★')
sys.exit(0 if out.strip().endswith('OK 8') and caught else 1)
