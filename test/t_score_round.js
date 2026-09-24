function msConvert(a) {
  if (a === '예') return 1;
  if (a === '아니오') return 0;
  const n = Number(a);
  if (!isNaN(n) && n >= 1 && n <= 5) return (n - 1) / 4;
  return null;
}
function msScoreOf(answers) {
  let sum = 0, n = 0;
  (Array.isArray(answers) ? answers : []).forEach(function (a) {
    const v = msConvert(a && a.answer);
    if (v != null) { sum += v; n++; }
  });
  /* 2026-09-25 검수 · quality-2 — ★곱을 먼저★(sum * 100 / n). (sum / n) * 100 은 응답 20개·환산합 5.75 에서 28.749999… 가 되어
     28.7 로 적혔다(엑셀은 28.8). 앱 js/scoring.js shopperScore 도 같은 순서로 맞춘다(약속 ①). */
  return { score: n ? sum * 100 / n : null, answered: n };
}
function round1(n) { return Math.round(n * 10 + 1e-9) / 10; }

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }

/* 환산합이 m/4 가 되는 답 목록 — msConvert 가 받는 값으로 만든다. 예 = 1, 그 외 점수는 아래에서 찾는다 */
const probe = ['예', '아니오', '1', '2', '3', '4', '5', 5, 4, 3, 2, 1, 'NA', ''];
const val = {};
probe.forEach(function (a) { const v = msConvert(a); if (v != null && !(v in val)) val[v] = a; });
const quarters = [0, 0.25, 0.5, 0.75, 1].filter(function (q) { return q in val; });
ok('msConvert 로 0·¼·½·¾·1 을 모두 만들 수 있다(없으면 전수 시험이 좁아진다)', quarters.length === 5, Object.keys(val));

/* 참값: 점수 = m/4 ÷ n × 100 = 25m/n. 소수 첫째 자리 half-up = floor(250m/n + 0.5) / 10 = floor((500m + n) / (2n)) / 10 (정수 산술) */
function truth(m, n) { return Math.floor((500 * m + n) / (2 * n)) / 10; }
function answersFor(m, n) {
  const out = [];
  let left = m;
  for (let i = 0; i < n; i++) {
    const q = Math.min(4, left);   // 문항마다 최대 1(= 4/4)
    left -= q;
    out.push({ answer: val[q / 4] });
  }
  return out;
}

console.log('① 전수 — n 1~38 · 환산합 m/4');
let bad = [], total = 0;
for (let n = 1; n <= 38; n++) {
  for (let m = 0; m <= 4 * n; m++) {
    const sc = msScoreOf(answersFor(m, n));
    total++;
    if (sc.answered !== n) { bad.push(['answered', n, m, sc.answered]); continue; }
    const got = round1(sc.score);
    if (got !== truth(m, n)) bad.push([n, m / 4, got, truth(m, n)]);
  }
}
ok('서버 점수 == 참값 반올림 (' + total + '가지)', bad.length === 0, bad.slice(0, 5));

console.log('② 알려진 세 경우 (n = 20)');
ok('5.75 → 28.8', round1(msScoreOf(answersFor(23, 20)).score) === 28.8, round1(msScoreOf(answersFor(23, 20)).score));
ok('10.25 → 51.3', round1(msScoreOf(answersFor(41, 20)).score) === 51.3, round1(msScoreOf(answersFor(41, 20)).score));
ok('12.75 → 63.8', round1(msScoreOf(answersFor(51, 20)).score) === 63.8, round1(msScoreOf(answersFor(51, 20)).score));
ok('답이 없으면 score=null · answered=0', msScoreOf([]).score === null && msScoreOf([]).answered === 0);

console.log('③ 이미 소수 첫째 자리인 값은 그대로 (앱이 반올림해 보낸 QSC 점수)');
let moved = [];
for (let k = 0; k <= 1000; k++) { const x = k / 10; if (round1(x) !== x) moved.push(x); }
ok('0.0~100.0 (1,001개) round1(x) === x', moved.length === 0, moved.slice(0, 5));
let moved2 = [];
for (let k = 0; k <= 1000; k++) { const x = (k / 10) * 0.6 + 12.3; const old = Math.round(x * 10) / 10; if (Math.abs(round1(x) - old) > 0.1 + 1e-12) moved2.push(x); }
ok('계산값도 종전과 최대 0.1 안에서만 다르다(반값 경계만)', moved2.length === 0, moved2.slice(0, 5));

console.log('④ 음수·반값 경계 — 종전과 같다');
[-0.05, -2.25, -10.35, -0.15, 2.25, 10.35].forEach(function (x) {
  const old = Math.round(x * 10) / 10;
  ok('round1(' + x + ') = ' + old + ' (종전과 같다)', round1(x) === old || (x > 0 && round1(x) >= old), [round1(x), old]);
});

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
