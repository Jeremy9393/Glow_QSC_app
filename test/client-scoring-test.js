/* 앱 채점 엔진(js/scoring.js) — MS 점수 반올림 경계 시험 (2026-09-25 검수 · quality-2)
   돌리는 법: node test/client-scoring-test.js   (node 는 ..\_도구\node\node.exe)
   ★사본이 아니라 js/scoring.js 를 그대로 require 한다★
   ① 응답 수 1~38 × 환산합 0~n(0.25 단위) 전부 — shopperScore → round1 이 참값(정수 계산)의 반올림과 같은지
   ② 대조군 — 옛 식 (sum / n) * 100 은 같은 전수에서 어긋나는 경우가 있어야 한다(시험이 잡는 힘이 있는지)
   ③ 발견에 적힌 세 경우(n=20 · 5.75 / 10.25 / 12.75 → 28.8 / 51.3 / 63.8)
   ④ round1 은 딱 반(x.x5)을 엑셀처럼 올린다 */
var path = require('path');
var Scoring = require(path.join(__dirname, '..', 'js', 'scoring.js'));

var pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; }
  else { fail++; console.log('✗ ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
}

/* 환산합 m/4 가 되는 응답 n 개를 만든다 — 5점(=1) k 개 · 나머지 하나(r/4) · 1점(=0) 나머지 */
function answersFor(n, m) {
  var full = Math.floor(m / 4), r = m % 4, out = [];
  for (var i = 0; i < full; i++) out.push(5);
  if (r) out.push(r + 1);
  while (out.length < n) out.push(1);
  return out;
}
/* 참값의 소수 첫째 자리 반올림(정수로만 계산) — 점수 = m/4 × 100 / n = 25m/n · 10배 = 250m/n */
function exactTenth(n, m) {
  var num = 250 * m;                         // 10배 점수 = num / n
  return Math.floor((2 * num + n) / (2 * n)) / 10;   // half-up
}

/* 보정 없는 반올림 — 서버 옛 round1(Math.round(n * 10) / 10). 앱 점수는 서버가 이 값으로 다시 반올림해 기록했다 */
function plainRound1(x) { return Math.round(x * 10) / 10; }

var total = 0, bad = [], badPlain = [], oldBad = [];
for (var n = 1; n <= 38; n++) {
  for (var m = 0; m <= 4 * n; m++) {
    var ans = answersFor(n, m);
    var res = Scoring.shopperScore(ans);
    var want = exactTenth(n, m);
    total++;
    if (Scoring.round1(res.score) !== want) bad.push([n, m / 4, Scoring.round1(res.score), want]);
    // 새 식은 보정 없는 반올림(옛 서버)을 거쳐도 참값과 같아야 한다 — 곱을 먼저 하면 딱 반이 정확히 표현된다
    if (plainRound1(res.score) !== want) badPlain.push([n, m / 4, plainRound1(res.score), want]);
    var sum = m / 4;
    var oldScore = (sum / n) * 100;           // 옛 식(대조군)
    if (plainRound1(oldScore) !== want) oldBad.push([n, sum]);
  }
}
ok('① 전수 ' + total + '경우 — 새 식 + 앱 round1 어긋남 0', bad.length === 0, bad.slice(0, 5));
ok('① 전수 ' + total + '경우 — 새 식 + 보정 없는 반올림도 어긋남 0', badPlain.length === 0, badPlain.slice(0, 5));
ok('② 대조군 — 옛 식 (sum / n) * 100 + 보정 없는 반올림은 어긋나는 경우가 있다(시험이 잡는다)', oldBad.length > 0, oldBad.length);
ok('② 대조군 — 발견의 n=20·5.75 가 옛 식 어긋남에 들어 있다',
  oldBad.some(function (x) { return x[0] === 20 && x[1] === 5.75; }), oldBad.slice(0, 5));

[[5.75, 28.8], [10.25, 51.3], [12.75, 63.8]].forEach(function (c) {
  var res = Scoring.shopperScore(answersFor(20, c[0] * 4));
  ok('③ n=20 · 환산합 ' + c[0] + ' → ' + c[1], Scoring.round1(res.score) === c[1], res.score);
  ok('③ n=20 · 환산합 ' + c[0] + ' — 화면 표시(toFixed(1))도 ' + c[1], res.score.toFixed(1) === String(c[1]), res.score.toFixed(1));
});

ok('④ round1(23.75) = 23.8 (딱 반은 올린다)', Scoring.round1(23.75) === 23.8);
ok('④ round1(28.749999999999996) = 28.8 (+1e-9 보정)', Scoring.round1(28.749999999999996) === 28.8);
ok('④ round1(28.74) = 28.7 (반이 아니면 뒤집히지 않는다)', Scoring.round1(28.74) === 28.7);
ok('④ 응답 없음 → score null', Scoring.shopperScore([null, 'NA']).score === null);

console.log('client-scoring-test: ' + pass + ' 통과 · ' + fail + ' 실패 (전수 ' + total + ' · 옛 식 어긋남 ' + oldBad.length + ')');
process.exit(fail ? 1 : 0);
