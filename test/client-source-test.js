/* 앱 화면 소스 점검 — 2026-09-25 검수 (dates-4 · dates-1 · critic-day1-1 · resilience-10 · perf-client-2·6·10 · 문법 수준)
   돌리는 법: node test/client-source-test.js   (node 는 ..\_도구\node\node.exe)
   화면 스크립트는 즉시 실행 함수 안에 있어 통째로 돌리기 어렵다 — 순수 함수는 잘라 돌리고, 나머지는 약속한 자리가 있는지 본다.
   ① 오래된 매장 폰 WebView 대비 — js/*.js·sw.js 에 화살표 함수·?.·?? 가 없다(주석 제외)
   ② 점검일자(dates-4) — QSC·MS 제출 전에 형식 검사 · 확인창 첫 줄 · 이번 달 아니면 되묻기 · 서버와 같은 문구
   ③ 통합시트 기록 실패 안내(dates-1 ②) — r.dashboard.ok === false 를 읽는다
   ④ 매장현황 「탭 없음」 문구(critic-day1-1) — notYetMsg 를 잘라 돌린다 · 옛 서버 문구(문의)는 앱 문구로 바꾼다
   ⑤ master.json 을 첫 줄에서 맨몸으로 기다리지 않는다(perf-client-2·10 · resilience-10 · field-4)
   ⑥ 글꼴 preload(perf-client-6) — 11개 화면 · 주소가 css/app.css @font-face 와 같다 · crossorigin */
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; }
  else { fail++; console.log('✗ ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
}

// ① 문법 수준
var jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(function (f) { return /\.js$/.test(f); })
  .map(function (f) { return 'js/' + f; }).concat(['sw.js']);
jsFiles.forEach(function (f) {
  var code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(function (l) {
    return l.replace(/(^|[^:'"])\/\/.*$/, '$1');     // 줄 주석(주소 안의 // 는 남긴다)
  }).join('\n');
  var hits = [];
  code.split('\n').forEach(function (l, i) { if (/=>|\?\.(?!\d)|\?\?/.test(l)) hits.push((i + 1) + ': ' + l.trim().slice(0, 80)); });
  ok('① ' + f + ' — 화살표 함수·?.·?? 없음', hits.length === 0, hits.slice(0, 3));
});

// ② 점검일자
var qsc = read('js/qsc-app.js');
var core = read('js/shopper-core.js');
ok('② qsc — 형식 검사(YYYY-MM-DD)와 서버와 같은 문구',
  qsc.indexOf("if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateVal)) { alert('점검일자를 선택해 주세요.');") >= 0);
ok('② qsc — 확인창 첫 줄에 점검일자', qsc.indexOf("let msg = '점검일자 ' + dateVal +") >= 0);
ok('② qsc — 이번 달이 아니면 되묻기', qsc.indexOf("if (dateVal.slice(0, 7) !== todayStr().slice(0, 7)) {") >= 0 &&
  qsc.indexOf("'점검일자가 이번 달이 아닙니다(' + Number(dateVal.slice(5, 7)) + '월). 이대로 제출할까요?") >= 0);
ok('② qsc — 날짜 칸 max 를 두지 않는다', !/\$\('#date'\)\.max\s*=/.test(qsc) && !/id="date"[^>]*max=/.test(read('qsc.html')));
ok('② MS — 손님 문구는 「방문 날짜」 · 관리자는 「점검일자」', core.indexOf("const DATE_LABEL = ADMIN ? '점검일자' : '방문 날짜';") >= 0);
ok('② MS — 제출·문항 열기 두 곳에서 형식 검사',
  (core.match(/if \(!validDate\(\$\('#date'\)\.value\)\) \{ alert\(DATE_LABEL \+ '를 선택해 주세요\.'\);/g) || []).length === 2);
ok('② MS — 필수 칸 목록의 날짜가 같은 이름·「선택해」', core.indexOf("{ id: 'date', label: DATE_LABEL, pick: true },") >= 0);
ok('② MS — 이번 달이 아니면 되묻기', core.indexOf("if (dateVal.slice(0, 7) !== todayStr().slice(0, 7)) {") >= 0);
ok('② MS — 관리자 확인창 첫 줄에 점검일자', core.indexOf("!confirm('점검일자 ' + dateVal + '\\n응답 '") >= 0);
// 2026-09-25 검수 · contract-3 — 화면 칸 이름도 같은 낱말(관리자 「점검일자 *」 · 손님 「방문 날짜 *」)
ok('② MS — 날짜 칸 이름이 DATE_LABEL', core.indexOf("{ id: 'date', label: DATE_LABEL + ' *', control: '<input type=\"date\" id=\"date\">' },") >= 0 &&
  core.indexOf("'방문날짜 *'") < 0);

// 2026-09-25 검수 · client-1 — 고객 설문 재시도: IN_FLIGHT 에도 제출시각을 붙잡는다.
// 소스의 조건 줄을 그대로 잘라 가짜 멱등 서버(doPost 8단계 · 익명 = 10분 칸 + payload 해시)에 돌린다.
var keepLine = (core.match(/if \(!\(r && [^\n]*\)\) pendingAt = '';/) || [])[0];
ok('client-1 제출시각 조건 줄을 찾았다', !!keepLine, keepLine);
function simulate(line) {
  // 반환: 세 번째 누름까지의 결과 목록 · 서버 캐시는 열쇠 → 'busy'|'done' · 코드 1회용
  var clear = new Function('r', 'st', line.replace(/pendingAt = ''/, "st.pendingAt = ''"));
  var cache = {}, codeUsed = false, st = { pendingAt: '' }, t = 0, results = [];
  function press(serverFinishesFirst, network) {
    var at = st.pendingAt || (st.pendingAt = 'T' + (++t));
    var key = 'k|' + at;                         // 같은 10분 칸 안이라고 둔다
    var r;
    if (cache[key] === 'done') r = { ok: true, duplicate: true };
    else if (cache[key] === 'busy') r = { ok: false, code: 'IN_FLIGHT' };
    else if (codeUsed) r = { ok: false, code: 'CONFLICT' };
    else { cache[key] = 'busy'; codeUsed = true; if (serverFinishesFirst) cache[key] = 'done'; r = network ? null : { ok: true }; }
    if (r === null) { results.push('NETWORK'); return key; }   // catch 길 — 조건 줄을 타지 않는다
    clear(r, st);
    results.push(r.ok ? (r.duplicate ? 'thanks(dup)' : 'thanks') : r.code);
    return key;
  }
  var k1 = press(false, true);          // 1) 끊김 — 서버는 아직 저장 중
  press(false, false);                  // 2) 곧바로 다시 — IN_FLIGHT
  cache[k1] = 'done';                   //    그 사이 첫 제출이 끝남
  press(false, false);                  // 3) 잠시 뒤 다시
  return results;
}
var oldRes = simulate("if (!(r && r._unparsed)) pendingAt = '';");
ok('client-1 대조군(옛 조건)은 세 번째가 CONFLICT 로 끝난다', oldRes[2] === 'CONFLICT', oldRes);
var newRes = keepLine ? simulate(keepLine) : [];
ok('client-1 지금 조건 — 끊김 → IN_FLIGHT → 감사 화면(이미 받음)', newRes.join(',') === 'NETWORK,IN_FLIGHT,thanks(dup)', newRes);
ok('client-1 고객 IN_FLIGHT 안내 — 잠시 뒤 다시 누르기', core.indexOf("} else if (!ADMIN && r.code === 'IN_FLIGHT') {") >= 0 &&
  core.indexOf('잠시 뒤 [제출]을 다시 눌러 주세요.') >= 0);

// withEulReul 과 같은 규칙으로 조사 확인 — 두 이름 모두 받침이 없어 「를」
function eulReul(word) { var ch = word.charCodeAt(word.length - 1); return (ch - 0xAC00) % 28 === 0 ? '를' : '을'; }
ok('② 조사 — 「점검일자를」·「방문 날짜를」', eulReul('점검일자') === '를' && eulReul('방문 날짜') === '를');

// ③ 통합시트 실패
ok('③ qsc — 통합시트 기록 실패를 알린다', qsc.indexOf("} else if (r.dashboard && r.dashboard.ok === false) {") >= 0 &&
  qsc.indexOf('⚠ 통합시트에는 기록하지 못했습니다') >= 0);

// ④ 매장현황 「탭 없음」
var sapp = read('js/store-app.js');
function cut(src, name) {
  var i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  var depth = 0, j = src.indexOf('{', i);
  for (var k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return '';
}
var fns = ['cycle', 'ymLabel', 'notYetMsg'].map(function (n) { return cut(sapp, n); });
ok('④ cycle·ymLabel·notYetMsg 를 잘라냈다', fns.every(function (s) { return s.length > 0; }));
var mod = new Function(fns.join('\n') + '\nreturn { cycle: cycle, notYetMsg: notYetMsg };')();
var now = mod.cycle();
var thisMsg = mod.notYetMsg(now);
ok('④ 이번 달 — 「아직 이번 달 점검 전입니다. 점검이 끝나면 이곳에 개선요청사항이 나타납니다.」',
  thisMsg === '아직 이번 달 점검 전입니다. 점검이 끝나면 이곳에 개선요청사항이 나타납니다.', thisMsg);
var otherMsg = mod.notYetMsg(now === '2611' ? '2612' : '2611');
ok('④ 다른 달 — 달 이름 + 같은 꼬리 · 문의 권유 없음', /^20\d\d년 \d{1,2}월은 아직 점검 기록이 없습니다\. 점검이 끝나면/.test(otherMsg) && otherMsg.indexOf('문의') < 0, otherMsg);
ok('④ 옛 서버 문구(…문의해 주세요)는 앱 문구로 바꾼다', sapp.indexOf("showState((srvMsg && srvMsg.indexOf('문의') < 0) ? srvMsg : notYetMsg(curYm));") >= 0);
ok('④ 「탭이 아직 만들어지지 않았습니다. 본사 담당자에게 문의」 폴백이 남아 있지 않다', sapp.indexOf('탭이 아직 만들어지지 않았습니다. 본사 담당자에게 문의해 주세요.') < 0);

// ⑤ master.json 맨몸 대기
['js/qsc-app.js', 'js/shopper-core.js', 'js/codes-app.js', 'js/submits-app.js'].forEach(function (f) {
  ok('⑤ ' + f + ' — master.json 을 try 없이 await 하지 않는다',
    read(f).indexOf("await (await fetch('data/master.json'") < 0);
});
ok('⑤ qsc — master.json 은 기다리지 않고 도착하면 목록을 채운다', qsc.indexOf('masterP.then(function () {') >= 0);
ok('⑤ codes — 네 요청을 한꺼번에', read('js/codes-app.js').indexOf('const first = await Promise.all([') >= 0 &&
  read('js/codes-app.js').indexOf('await reload(false, listP);') >= 0);
ok('⑤ submits — master·config 를 나란히', read('js/submits-app.js').indexOf('const first = await Promise.all([') >= 0);

// ⑥ 글꼴 preload
var css = read('css/app.css');
var cssFonts = (css.match(/url\('\.\.\/(fonts\/[^']+)'\)/g) || []).map(function (s) { return s.replace(/^url\('\.\.\//, '').replace(/'\)$/, ''); });
ok('⑥ css 가 부르는 글꼴 주소를 읽었다(R·B 포함)', cssFonts.indexOf('fonts/NanumSquareR.woff2') >= 0 && cssFonts.indexOf('fonts/NanumSquareB.woff2') >= 0, cssFonts);
var pages = fs.readdirSync(ROOT).filter(function (f) { return /\.html$/.test(f); });
ok('⑥ 화면 11개', pages.length === 11, pages);
pages.forEach(function (p) {
  var h = read(p);
  var pre = h.match(/<link rel="preload"[^>]*>/g) || [];
  var hrefs = pre.map(function (t) { return (t.match(/href="([^"]+)"/) || [])[1]; });
  ok('⑥ ' + p + ' — R·B preload 두 줄', hrefs.length === 2 && hrefs.indexOf('fonts/NanumSquareR.woff2') >= 0 && hrefs.indexOf('fonts/NanumSquareB.woff2') >= 0, hrefs);
  ok('⑥ ' + p + ' — preload 주소가 css 와 같다(?v 없음) · as=font · crossorigin',
    pre.every(function (t) { return cssFonts.indexOf((t.match(/href="([^"]+)"/) || [])[1]) >= 0 && / as="font"/.test(t) && / crossorigin/.test(t) && t.indexOf('?v') < 0; }), pre);
  ok('⑥ ' + p + ' — preload 가 stylesheet 보다 앞', h.indexOf('rel="preload"') < h.indexOf('rel="stylesheet"'));
});

// 2026-09-25 검수 · security-3 — 로그인이 풀려도(계정 중지·강제 로그아웃 포함) 문항 사본은 지운다 (화면 흐름은 client-qsc-harness.html ?mode=authlost)
var hideQ = cut(qsc, 'hideQuestions');
ok('security-3 hideQuestions 가 dropQ() 를 조건 없이 부른다', /\n    dropQ\(\);\n/.test(hideQ) && hideQ.indexOf('if (!lost) dropQ();') < 0, hideQ.slice(0, 80));

console.log('client-source-test: ' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
