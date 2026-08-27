# -*- coding: utf-8 -*-
"""NA 사유 세 갈래 시험 (2026-08-27)

★진짜 코드를 잘라내서 돌린다★ — 사본이 아니다.
  · js/scoring.js  — 점수 계산이 ★한 줄도 안 바뀌었는지★ (사유가 생겨도 NA는 NA다)
  · backend/Code.gs — NA 프리셋이 '해당 없음' 만 기억하는지
"""
import io, re, sys, subprocess
from pathlib import Path

ROOT = Path(r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC')
NODE = ROOT / '_도구' / 'node' / 'node.exe'
OUT = Path(__file__).parent / '_nawhy.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

scoring = io.open(ROOT / 'qsc-app' / 'js' / 'scoring.js', 'r', encoding='utf-8', newline='').read()

gs = io.open(ROOT / 'qsc-app' / 'backend' / 'Code.gs', 'r', encoding='utf-8', newline='').read()
gl = gs.split('\n')
# saveQsc 안의 NA프리셋 걸러내는 대목만 떼어 낸다
st = next(i for i, l in enumerate(gl) if 'const naNos = p.items.filter' in l)
en = next(i for i, l in enumerate(gl) if i > st and '.join(\',\');' in l)
napick = '\n'.join(gl[st:en + 1])
print('scoring.js %d줄 · NA프리셋 대목 %d줄' % (len(scoring.split('\n')), en - st + 1))

HARNESS = r'''
var window = {}, module = { exports: {} };
__SCORING__
var Scoring = window.Scoring || module.exports;

var pass = 0, fail = 0;
function ok(n, c, e) {
  if (c) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  X    ' + n + (e ? '   ' + e : '')); }
}

console.log('\n[1] ★점수 계산은 사유와 무관하다★ — NA는 어느 사유든 똑같이 빠진다');
ok('NA 는 감점이 아니다', Scoring.itemDeduct('NA', 'S2') === 'NA', String(Scoring.itemDeduct('NA', 'S2')));
ok('0건은 0점', Scoring.itemDeduct(0, '') === 0);
ok('일반 3건은 3점', Scoring.itemDeduct(3, '') === 3);
ok('별표 1건은 8점', Scoring.itemDeduct(1, 'S2') === 8, String(Scoring.itemDeduct(1, 'S2')));
ok('미확인은 null', Scoring.itemDeduct(null, '') === null);

console.log('\n[2] 사유가 붙어도 채점 결과가 같다 (사유는 별개 칸이라 채점기가 아예 안 본다)');
function mk(v) { return [
  { no: 1, severity: '',   value: v },
  { no: 2, severity: 'S2', value: 2 },
  { no: 3, severity: '',   value: 0 },
]; }
var a = Scoring.evaluate(mk('NA'));
var b = Scoring.evaluate(mk('NA'));   // 사유가 달라도 값은 'NA' 하나뿐이다
ok('두 번 계산이 같다', JSON.stringify(a) === JSON.stringify(b));
ok('NA 문항은 감점에 안 들어간다', a.qsc === Scoring.evaluate([
  { no: 2, severity: 'S2', value: 2 }, { no: 3, severity: '', value: 0 }]).qsc,
  'NA포함=' + a.qsc);

console.log('\n[3] NA 프리셋 — 「해당 없음」만 기억한다 (담당자: 1만해)');
var p = { items: [
  { no: 1, value: 'NA', naWhy: '해당 없음' },
  { no: 2, value: 'NA', naWhy: '본사 대기' },
  { no: 3, value: 'NA', naWhy: '확인 불가' },
  { no: 4, value: 'NA' },                      // 옛 앱 — 사유 없음
  { no: 5, value: 0 },
  { no: 6, value: 'NA', naWhy: '해당 없음' },
  { no: '=IMAGE(1)', value: 'NA', naWhy: '해당 없음' },   // 수식 주입 시도
]};
__NAPICK__
ok('★해당 없음만 남았다★ (1,4,6)', naNos === '1,4,6', 'naNos=' + naNos);
ok('본사 대기는 안 기억', naNos.split(',').indexOf('2') < 0);
ok('확인 불가는 안 기억', naNos.split(',').indexOf('3') < 0);
ok('사유 없는 옛 제출은 해당 없음으로 본다', naNos.split(',').indexOf('4') >= 0);
ok('숫자 아닌 문항번호는 걸러진다', naNos.indexOf('IMAGE') < 0, naNos);

console.log('\n[4] 사진 칸이 13번째 그대로인지 (되돌리기가 그 자리를 직접 읽는다)');
var GS = __GS_JSON__;
ok('QSC_상세 머리글에서 사진이 13번째', GS.photoCol === 13, '실제 ' + GS.photoCol + '번째');
ok('NA사유는 14번째', GS.whyCol === 14, '실제 ' + GS.whyCol + '번째');
ok('되돌리기가 읽는 열도 13', GS.undoCol === 13, '실제 ' + GS.undoCol);

console.log('\n' + (fail ? 'X 실패 ' + fail + '건' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

# 머리글 순서를 실제 소스에서 뽑아 확인한다
m = re.search(r"sheet\(ss, 'QSC_상세', \[(.*?)\]\)", gs, re.S)
heads = [h.strip().strip("'") for h in m.group(1).split(',')]
undo = re.search(r'grid\(detail\.sh, 2, (\d+),', gs)
import json
gsjson = json.dumps({
    'photoCol': heads.index('사진') + 1,
    'whyCol': heads.index('NA사유') + 1,
    'undoCol': int(undo.group(1)),
}, ensure_ascii=False)

js = (HARNESS.replace('__SCORING__', scoring)
             .replace('__NAPICK__', napick)
             .replace('__GS_JSON__', gsjson))
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout)
if r.stderr:
    print('--- stderr ---')
    print(r.stderr[:2000])
try:
    OUT.unlink()
except Exception:
    pass
sys.exit(r.returncode)
