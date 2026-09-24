# -*- coding: utf-8 -*-
"""사진 하루 상한 — 남은 몫까지는 받고, 못 쓴 몫은 돌려준다 (2026-09-25 검수 · field-7 · critic-day1-4)

★Code.gs 의 진짜 photoQuotaOk · photoQuotaKey · photoQuotaRefund · savePhotos · validPhoto 를 잘라내서 돌린다★ (사본 아님).

왜: 상한(기본 200)이 「전부 아니면 전무」라 남은 몫이 39장이어도 40장 제출은 한 장도 안 올라갔고, 예약이 선불이라
    덮어쓰기 재제출·저장 실패 재시도마다 또 나가 돌려받지 못했다. 한 점검자가 하루 5곳(40장씩)이면 6번째 매장부터 사진 0장.

보는 것:
  ① 기본 상한 600 — 40장 × 15곳 = 600장 전부 저장 · 16번째는 0장 + 이유 「하루 상한을 넘었습니다 40장」
  ② ★남은 몫까지는 받는다★ — 상한 50에서 40장 두 번 → 40 + 10장 저장 · 나머지 30장은 이유와 함께 건너뜀
  ③ ★못 쓴 몫은 돌려준다★ — 형식이 틀린 사진 5장이 섞이면 예약 40 중 35만 남는다
  ④ ★드라이브 저장이 중간에 터져도★ 만든 장 수만 남는다(예외는 그대로 나간다 — 화면은 종전처럼 오류)
  ⑤ 매장 개선 사진(1장) 자리 — `if (!photoQuotaOk(ctx, 1, store))` 가 그대로 맞다(꽉 차면 0)
  ⑥ 익명 버킷(캐시)도 같은 규칙 · 스크립트 속성 PHOTO_DAY_MAX 로 바꾸는 것은 그대로
  ⑦ 대조군: QSC_SRC=<고치기 전 사본> 이면 ①②③④가 실패해야 한다
"""
import io, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = Path(os.environ.get('QSC_SRC') or (HERE.parents[1] / 'backend' / 'Code.gs'))
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_photo_quota.js'
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


def cut_opt(name, stub):
    try:
        return cut(name)
    except SystemExit:
        return stub


js = r'''
/* ── 가짜 세계 ── */
const crypto = require('crypto');
let RAW = {}, CACHE = {};
const PROPS = {
  getProperty: function (k) { return Object.prototype.hasOwnProperty.call(RAW, k) ? RAW[k] : null; },
  setProperty: function (k, v) { RAW[k] = String(v); },
  deleteProperty: function (k) { delete RAW[k]; },
};
function prop(key, def) { const v = PROPS.getProperty(key); return (v === null || v === undefined || v === '') ? def : v; }
function propN(key, def) { const n = Number(prop(key, def)); return isNaN(n) ? def : n; }
const CacheService = { getScriptCache: function () { return {
  get: function (k) { return Object.prototype.hasOwnProperty.call(CACHE, k) ? CACHE[k] : null; },
  put: function (k, v) { CACHE[k] = String(v); },
}; } };
const Session = { getScriptTimeZone: function () { return 'Asia/Seoul'; } };
const Utilities = {
  formatDate: function (d, tz, f) { const p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); },
  newBlob: function (b, t, name) { return { name: name }; },
  base64Decode: function (s) { return s; },
};
const DriveApp = { Access: {}, Permission: {} };
function sha256Hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function normStore(s) { return String(s == null ? '' : s).trim(); }
function fileSafe(s) { return String(s); }
const PHOTO_FOLDER_ID = 'root', PHOTO_EMBED = false;
let CREATED = 0, THROW_AT = 0;
function yearFolder() { return {}; }
function subFolder() { return { setSharing: function () {}, createFile: function (b) {
  if (THROW_AT && CREATED + 1 === THROW_AT) throw new Error('드라이브 저장 실패');
  CREATED++; return { getUrl: function () { return 'u' + CREATED; }, getId: function () { return 'f' + CREATED; }, setSharing: function () {} };
} }; }
const Logger = { log: function () {} };
''' + '\n'.join([
    cut('validPhoto'), cut('photoQuotaOk'),
    cut_opt('photoQuotaKey', '/* photoQuotaKey 없음 (옛 사본) */'),
    cut_opt('photoQuotaRefund', '/* photoQuotaRefund 없음 (옛 사본) */'),
    cut('savePhotos'),
]) + r'''

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }
const GOOD = 'data:image/jpeg;base64,AAAA', BAD = 'data:text/plain;base64,AAAA';
function payload(n, bad) {
  const photos = [];
  for (let i = 0; i < n; i++) photos.push(i < (bad || 0) ? BAD : GOOD);
  return { store: '금종제과', date: '2026-10-05', items: [{ no: 1, photos: photos }] };
}
function savedCount(out) { let n = 0; Object.keys(out).forEach(function (k) { if (k.indexOf('__') !== 0) n += out[k].length; }); return n; }
const ctx = { auth: true, id: 'admin' };
function dayKey() { return Object.keys(RAW).filter(function (k) { return k.indexOf('PD:admin:') === 0; })[0]; }
function reset() { RAW = {}; CACHE = {}; CREATED = 0; THROW_AT = 0; }

console.log('① 기본 상한 600');
reset();
let savedAll = 0;
for (let i = 0; i < 15; i++) savedAll += savedCount(savePhotos(payload(40), ctx));
ok('40장 × 15곳 = 600장 전부 저장 (종전 기본 200이면 5곳에서 끝)', savedAll === 600, savedAll);
let o = savePhotos(payload(40), ctx);
ok('16번째는 0장', savedCount(o) === 0, savedCount(o));
ok('건너뛴 40장 · 이유 「하루 상한을 넘었습니다 40장」', o.__skipped === 40 && o.__why === '하루 상한을 넘었습니다 40장', [o.__skipped, o.__why]);

console.log('② 남은 몫까지는 받는다');
reset(); RAW.PHOTO_DAY_MAX = '50';
ok('첫 제출 40장 저장', savedCount(savePhotos(payload(40), ctx)) === 40);
o = savePhotos(payload(40), ctx);
ok('★두 번째 제출 — 남은 10장은 저장된다★ (종전: 0장)', savedCount(o) === 10, savedCount(o));
ok('나머지 30장은 이유와 함께 건너뜀', o.__skipped === 30 && /하루 상한을 넘었습니다 30장/.test(o.__why || ''), [o.__skipped, o.__why]);
ok('그날 카운터 50', RAW[dayKey()] === '50', RAW[dayKey()]);

console.log('③ 못 쓴 몫은 돌려준다 — 형식이 틀린 사진');
reset(); RAW.PHOTO_DAY_MAX = '100';
o = savePhotos(payload(40, 5), ctx);
ok('35장 저장 · 5장은 형식 이유로 건너뜀', savedCount(o) === 35 && o.__skipped === 5, [savedCount(o), o.__skipped, o.__why]);
ok('★카운터는 35 (예약 40 중 5장 돌려받음)★', RAW[dayKey()] === '35', RAW[dayKey()]);

console.log('④ 드라이브 저장이 중간에 터져도');
reset(); RAW.PHOTO_DAY_MAX = '100'; THROW_AT = 3;
let threw = false;
try { savePhotos(payload(10), ctx); } catch (e) { threw = true; }
ok('예외는 그대로 나간다(화면은 종전처럼 오류)', threw);
ok('★카운터는 실제로 만든 2장뿐★', RAW[dayKey()] === '2', RAW[dayKey()]);

console.log('⑤ 매장 개선 사진 1장 자리 — if (!photoQuotaOk(ctx, 1, store))');
reset(); RAW.PHOTO_DAY_MAX = '1';
ok('남아 있으면 참(1)', !!photoQuotaOk({ auth: true, id: '매장A' }, 1, '매장A'));
ok('꽉 차면 거짓(0)', !photoQuotaOk({ auth: true, id: '매장A' }, 1, '매장A'));

console.log('⑥ 익명 버킷(캐시)도 같은 규칙');
reset(); RAW.PHOTO_DAY_MAX = '30';
o = savePhotos(payload(40), { auth: false });
ok('익명 — 남은 30장까지 저장', savedCount(o) === 30 && o.__skipped === 10, [savedCount(o), o.__skipped]);
ok('익명 — 속성은 안 쓴다(캐시 버킷)', !Object.keys(RAW).some(function (k) { return k.indexOf('PD:') === 0; }));

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip()[:1500])
sys.exit(1 if res.returncode != 0 else 0)
