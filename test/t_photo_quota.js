
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
function validPhoto(dataUrl) {
  const s = String(dataUrl || '');
  if (!/^data:image\/(jpeg|jpg|png);base64,/.test(s)) return '형식이 올바르지 않은 사진입니다.';
  /* ★dataURL 기준이다★ — base64 라 실제 바이트의 약 1.33배다.
     앱은 800px·품질 0.4 까지 낮춰 한 장 180KB(실바이트)를 목표로 하므로 보통 240KB 안이다.
     그래도 사진에 따라 넘길 수 있어 여유를 둔다 — 제출 한도가 12MB 라 이 정도는 문제없다.
     ★버릴 때는 반드시 사람에게 이유를 말한다★ (savePhotos 의 why). */
  if (s.length > 700 * 1024) return '사진 한 장이 너무 큽니다(줄여도 700KB 초과).';
  return '';
}
function photoQuotaOk(ctx, n, store) {
  const tz = Session.getScriptTimeZone();
  const day = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  const max = propN('PHOTO_DAY_MAX', 600);
  const want = Math.max(0, Math.floor(Number(n) || 0));

  if (!(ctx && ctx.auth && ctx.id)) {
    try {
      const cache = CacheService.getScriptCache();
      const k = photoQuotaKey(ctx, store, day);
      const cur = Number(cache.get(k) || 0);
      const got = Math.max(0, Math.min(want, max - cur));
      if (!got) return 0;
      cache.put(k, String(cur + got), 21600);   // 6시간 (캐시 상한). 날짜가 바뀌면 키 자체가 바뀐다
      return got;
    } catch (e) { return want; }   // 카운터 고장이 현장 제출을 막을 이유는 없다
  }

  const k = photoQuotaKey(ctx, store, day);
  const cur = Number(PROPS.getProperty(k) || 0);
  const got = Math.max(0, Math.min(want, max - cur));
  if (!got) return 0;
  PROPS.setProperty(k, String(cur + got));
  if (cur === 0) {
    const y = Utilities.formatDate(new Date(Date.now() - 86400000), tz, 'yyyyMMdd');
    try { PROPS.deleteProperty('PD:' + ctx.id + ':' + y); } catch (e) { }
  }
  return got;
}
function photoQuotaKey(ctx, store, day) {
  if (ctx && ctx.auth && ctx.id) return 'PD:' + ctx.id + ':' + day;
  return 'pdq:' + sha256Hex(normStore(store) || '(매장없음)').slice(0, 8) + ':' + day;
}
function photoQuotaRefund(ctx, n, store, day) {
  const back = Math.max(0, Math.floor(Number(n) || 0));
  if (!back) return;
  try {
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    if (day && day !== today) return;
    const k = photoQuotaKey(ctx, store, today);
    if (ctx && ctx.auth && ctx.id) {
      const cur = Number(PROPS.getProperty(k) || 0);
      PROPS.setProperty(k, String(Math.max(0, cur - back)));
    } else {
      const cache = CacheService.getScriptCache();
      const cur = Number(cache.get(k) || 0);
      cache.put(k, String(Math.max(0, cur - back)), 21600);
    }
  } catch (e) { }
}
function savePhotos(p, ctx) {
  const out = {};
  let skipped = 0;
  /* ★왜 버렸는지도 함께 돌려준다★ (2026-09-07) — 개수만 알려주면 사람이 손쓸 수가 없다 */
  const why = {};
  if (!PHOTO_FOLDER_ID) return out;
  let dayFolder = null;
  let folderShared = false;   // 그날 폴더에 공유를 이미 걸었는가 (한 번만 건다)
  const safeName = fileSafe(p.store);
  // 하루 상한을 한 번에 예약한다 (QSC 40장 상한도 여기서 함께 건다)
  let budget = 0;
  p.items.forEach(function (it) { budget += Math.min(40, (it.photos || []).length); });
  budget = Math.min(budget, 40);
  /* 2026-09-25 검수 · field-7 · critic-day1-4 — 남은 몫까지는 받는다(photoQuotaOk 가 예약한 장 수를 돌려준다).
     하나도 못 받으면 이유(하루 상한)를 함께 돌려준다 — 종전에는 이유가 비어 감사로그가 「용량·형식」으로 잘못 남았다. */
  const quotaDay = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const granted = budget > 0 ? photoQuotaOk(ctx, budget, p.store) : 0;
  if (budget > 0 && !granted) {
    out.__skipped = budget;
    out.__why = '하루 상한을 넘었습니다 ' + budget + '장';
    return out;
  }
  budget = granted;
  let used = 0;
  let savedN = 0;   // 드라이브에 실제로 만든 장 수 — 예약(granted)과의 차이를 끝에서 돌려준다
  try {
  p.items.forEach(function (it) {
    const list = (it.photos || []).slice(0, 40);
    /* ★사진이 몇 번째 「건」의 것인지 함께 가져온다★ (2026-09-04)
       개선요청이 건마다 한 줄이 되면서, 사진도 그 줄에 맞춰 들어가야 한다.
       옛 앱은 photoSlots 를 안 보내므로 그때는 순서를 그대로 건 번호로 본다. */
    const slots = it.photoSlots || null;
    list.forEach(function (dataUrl, i) {
      if (!dataUrl) return;                      // 빈 자리는 조용히 건너뛴다 (경고 대상이 아니다)
      if (used >= budget) { skipped++; why['하루 상한을 넘었습니다'] = (why['하루 상한을 넘었습니다'] || 0) + 1; return; }
      const bad = validPhoto(dataUrl);
      if (bad) { skipped++; why[bad] = (why[bad] || 0) + 1; return; }
      used++;
      if (!dayFolder) {
        dayFolder = subFolder(subFolder(yearFolder(p.date, 'QSC점검'), safeName), fileSafe(p.date));
        /* ★공유는 폴더에 한 번만 건다★ (2026-08-27) — 종전에는 사진 1장마다 setSharing 을 불렀다.
           드라이브 왕복은 한 번에 0.2~0.5초라, 8장이면 그것만으로 2~4초를 서서 기다렸다.
           ★추측으로 바꾸지 않고 실제로 해 봤다★ — 폴더에만 공유를 걸고 만든 파일을,
             ★로그아웃 상태 브라우저★에서 매장 파일이 쓰는 주소(photoUrl → lh3)로 열어
             640x480 그림이 그대로 나오는 것을 확인했다. '파일에도 건' 사진을 대조군으로
             나란히 놓고 비교했고, 그 브라우저가 정말 로그아웃인지도 드라이브로 확인했다.
           ⚠열리는 단위가 '파일 하나' 에서 '그날 그 매장 폴더' 로 커진다.
             폴더 주소는 시트 어디에도 안 적히고, 파일 주소로 상위 폴더에 닿을 수도 없다.
           실패하면 파일마다 거는 예전 방식으로 돌아간다 — 느린 편이 안 보이는 것보다 낫다. */
        if (PHOTO_EMBED) {
          try {
            dayFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            folderShared = true;
          } catch (e) {
            folderShared = false;
            Logger.log('폴더 공유 실패 — 파일마다 겁니다: ' + String(e).slice(0, 120));
          }
        }
      }
      const base64 = dataUrl.split(',')[1];
      const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg',
        fileSafe(p.date) + '_' + safeName + '_문항' + it.no + '_' + (i + 1) + '.jpg');
      const f = dayFolder.createFile(blob);
      savedN++;
      if (PHOTO_EMBED && !folderShared) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      (out[it.no] = out[it.no] || []).push({
        url: f.getUrl(), id: f.getId(),
        slot: (slots && slots[i] != null) ? Number(slots[i]) : i,
      });
    });
  });
  } finally {
    /* 예약했지만 못 만든 몫(형식이 틀린 사진·드라이브 예외로 중간에 끊김)은 돌려준다 (2026-09-25 검수 · critic-day1-4) */
    if (granted > savedN) photoQuotaRefund(ctx, granted - savedN, p.store, quotaDay);
  }
  if (skipped) {
    out.__skipped = skipped;
    out.__why = Object.keys(why).map(function (k) { return k + ' ' + why[k] + '장'; }).join(' · ');
  }
  return out;
}

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
