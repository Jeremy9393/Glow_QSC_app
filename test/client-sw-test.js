/* 서비스 워커(sw.js) 시험 — 2026-09-25 검수 · perf-client-3 · field-4
   돌리는 법: node test/client-sw-test.js   (node 는 ..\_도구\node\node.exe)
   ★sw.js 원문을 그대로 vm 에 올린다★ (caches·fetch·self 만 가짜) — 기다림 한도(NET_WAIT_MS 4000)만 시험용으로 60ms 로 바꾼다
   ① 화면(html)·데이터(json): 네트워크가 매달리면 한도 뒤 ★사본이 있을 때만★ 사본을 준다
   ② 사본이 없으면 끝까지 네트워크를 기다린다(첫 방문)
   ③ 응답은 왔는데 실패(5xx·404)면 사본이 있을 때 사본을, 없으면 그 응답을 준다
   ④ 한도 뒤 늦게 온 성공 응답은 캐시에 담긴다(waitUntil) · 빨리 온 성공은 그대로 주고 담는다
   ⑤ 바뀌지 않은 것 — js?v= 캐시 우선 · 오프라인이면 사본 → 화면 이동은 index.html · 버전 없는 기타 파일의 5xx 는 그대로 · POST 는 손대지 않음
   ⑥ 대조군 — HEAD 의 옛 sw.js 는 ①(매달림)·③(5xx) 에서 사본을 주지 않아야 한다(이 시험이 잡는지) */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var ORIGIN = 'https://app.test';
var WAIT = 60;

var pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; }
  else { fail++; console.log('✗ ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function resp(status, tag) {
  return {
    ok: status >= 200 && status < 300, status: status, tag: tag,
    clone: function () { return resp(status, tag); },
  };
}

/* sw.js 하나를 올린다. net[url] = 'hang' | 'reject' | 숫자(상태) · 'hang' 은 release(url, status) 로 푼다 */
function load(src) {
  var handlers = {};
  var cache = {};           // url → 응답
  var puts = [];
  var fetched = [];
  var net = {};
  var hanging = {};
  function key(req) { return typeof req === 'string' ? ORIGIN + '/' + req.replace(/^\//, '') : req.url; }
  var cacheObj = {
    put: function (req, res) { cache[key(req)] = res; puts.push(key(req)); return Promise.resolve(); },
    addAll: function () { return Promise.resolve(); },
  };
  var ctx = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise, URL: URL,
    location: { origin: ORIGIN },
    Response: { error: function () { return { type: 'error', ok: false, status: 0, tag: 'error' }; } },
    caches: {
      match: function (req) { return Promise.resolve(cache[key(req)] || undefined); },
      open: function () { return Promise.resolve(cacheObj); },
      keys: function () { return Promise.resolve([]); },
      delete: function () { return Promise.resolve(true); },
    },
    fetch: function (req) {
      var u = typeof req === 'string' ? req : req.url;
      fetched.push(u);
      var how = net[u];
      if (how === 'reject') return Promise.reject(new TypeError('Failed to fetch'));
      if (how === 'hang') return new Promise(function (resolve) { hanging[u] = resolve; });
      return Promise.resolve(resp(how || 200, 'net'));
    },
  };
  ctx.self = {
    addEventListener: function (t, fn) { handlers[t] = fn; },
    skipWaiting: function () { return Promise.resolve(); },
    clients: { claim: function () { return Promise.resolve(); } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'sw.js' });

  function fire(p, opts) {
    opts = opts || {};
    var ev = {
      request: { method: opts.method || 'GET', url: ORIGIN + '/' + p, mode: opts.mode || 'no-cors' },
      responded: null, waits: [],
      respondWith: function (x) { this.responded = x; },
      waitUntil: function (x) { this.waits.push(x); },
    };
    handlers.fetch(ev);
    return ev;
  }
  /* 약속이 ms 안에 풀리는지 — 풀리면 값, 아니면 PENDING */
  function within(p, ms) {
    var PENDING = { pending: true };
    return Promise.race([p, sleep(ms).then(function () { return PENDING; })]);
  }
  return {
    fire: fire, within: within, cache: cache, puts: puts, fetched: fetched, net: net,
    seed: function (p, tag) { cache[ORIGIN + '/' + p] = resp(200, tag || 'cache'); },
    release: function (p, status) { var f = hanging[ORIGIN + '/' + p]; if (f) f(resp(status || 200, 'late')); },
  };
}

function withWait(src) {
  var n = 0;
  var out = src.replace(/const NET_WAIT_MS = \d+;/, function () { n++; return 'const NET_WAIT_MS = ' + WAIT + ';'; });
  return { src: out, hit: n };
}

async function main() {
  var cur = withWait(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').replace(/^﻿/, ''));
  ok('준비 — sw.js 에 NET_WAIT_MS 한 곳', cur.hit === 1, cur.hit);

  // ① 매달림 + 사본 있음 → 사본
  {
    var s = load(cur.src);
    s.seed('qsc.html', 'cache-qsc');
    s.net[ORIGIN + '/qsc.html'] = 'hang';
    var ev = s.fire('qsc.html', { mode: 'navigate' });
    var r = await s.within(ev.responded, WAIT + 200);
    ok('① html 매달림 + 사본 → 한도 뒤 사본', r && r.tag === 'cache-qsc', r);
    // 즉시(한도 전)에는 아직 안 풀린다
    var s1 = load(cur.src);
    s1.seed('data/master.json', 'cache-master');
    s1.net[ORIGIN + '/data/master.json'] = 'hang';
    var ev1 = s1.fire('data/master.json');
    var early = await s1.within(ev1.responded, WAIT / 3);
    ok('① 한도 전에는 네트워크를 기다린다', early && early.pending === true, early);
    var late = await s1.within(ev1.responded, WAIT + 200);
    ok('① json 매달림 + 사본 → 한도 뒤 사본', late && late.tag === 'cache-master', late);
    // ④ 늦게 온 성공 응답은 캐시에 담긴다
    s1.release('data/master.json', 200);
    await Promise.all(ev1.waits);
    ok('④ 늦게 온 성공 응답이 캐시에 담겼다', s1.cache[ORIGIN + '/data/master.json'] && s1.cache[ORIGIN + '/data/master.json'].tag === 'late', s1.puts);
  }

  // ② 매달림 + 사본 없음 → 끝까지 네트워크
  {
    var s2 = load(cur.src);
    s2.net[ORIGIN + '/store.html'] = 'hang';
    var ev2 = s2.fire('store.html', { mode: 'navigate' });
    var p2 = await s2.within(ev2.responded, WAIT + 150);
    ok('② 사본이 없으면 한도가 지나도 기다린다', p2 && p2.pending === true, p2);
    s2.release('store.html', 200);
    var r2 = await s2.within(ev2.responded, 200);
    ok('② 네트워크가 오면 그것을 준다', r2 && r2.tag === 'late', r2);
  }

  // ③ 5xx·404
  {
    var s3 = load(cur.src);
    s3.seed('data/master.json', 'cache-master');
    s3.net[ORIGIN + '/data/master.json'] = 503;
    var r3 = await s3.within(s3.fire('data/master.json').responded, 200);
    ok('③ json 503 + 사본 → 사본', r3 && r3.tag === 'cache-master', r3);
    ok('③ 503 은 캐시에 담지 않는다', s3.puts.length === 0, s3.puts);

    var s3b = load(cur.src);
    s3b.net[ORIGIN + '/data/master.json'] = 503;
    var r3b = await s3b.within(s3b.fire('data/master.json').responded, 200);
    ok('③ json 503 + 사본 없음 → 그 응답(503)', r3b && r3b.status === 503, r3b);

    var s3c = load(cur.src);
    s3c.seed('index.html', 'cache-index');
    s3c.net[ORIGIN + '/index.html'] = 404;
    var r3c = await s3c.within(s3c.fire('index.html', { mode: 'navigate' }).responded, 200);
    ok('③ html 404(배포 틈) + 사본 → 사본', r3c && r3c.tag === 'cache-index', r3c);
  }

  // ④ 빨리 온 성공
  {
    var s4 = load(cur.src);
    s4.seed('qsc.html', 'cache-qsc');
    var ev4 = s4.fire('qsc.html', { mode: 'navigate' });
    var r4 = await s4.within(ev4.responded, 100);
    ok('④ 빨리 온 성공은 네트워크 응답', r4 && r4.tag === 'net', r4);
    await Promise.all(ev4.waits);
    ok('④ 그리고 캐시를 갈아 둔다', s4.cache[ORIGIN + '/qsc.html'].tag === 'net');
  }

  // ⑤ 바뀌지 않은 것
  {
    var s5 = load(cur.src);
    s5.seed('js/qsc-app.js?v=137', 'cache-js');
    var r5 = await s5.within(s5.fire('js/qsc-app.js?v=137').responded, 100);
    ok('⑤ js?v= 는 캐시 우선(네트워크 안 감)', r5 && r5.tag === 'cache-js' && s5.fetched.length === 0, { r: r5, f: s5.fetched });

    var s5b = load(cur.src);
    s5b.seed('index.html', 'cache-index');
    s5b.net[ORIGIN + '/codes.html'] = 'reject';
    var r5b = await s5b.within(s5b.fire('codes.html', { mode: 'navigate' }).responded, 100);
    ok('⑤ 오프라인 + 그 화면 사본 없음 → index.html', r5b && r5b.tag === 'cache-index', r5b);

    var s5c = load(cur.src);
    s5c.net[ORIGIN + '/js/x.js?v=137'] = 'reject';
    var r5c = await s5c.within(s5c.fire('js/x.js?v=137').responded, 100);
    ok('⑤ 오프라인 + 스크립트 사본 없음 → Response.error (index.html 아님)', r5c && r5c.type === 'error', r5c);

    var s5d = load(cur.src);
    s5d.seed('manifest.webmanifest', 'cache-man');
    s5d.net[ORIGIN + '/manifest.webmanifest'] = 503;
    var r5d = await s5d.within(s5d.fire('manifest.webmanifest').responded, 100);
    ok('⑤ 화면·데이터가 아닌 파일의 5xx 는 그대로(사본으로 바꾸지 않음)', r5d && r5d.status === 503, r5d);

    var s5e = load(cur.src);
    var ev5e = s5e.fire('qsc.html', { method: 'POST' });
    ok('⑤ POST 는 손대지 않는다', ev5e.responded === null);
  }

  // ⑥ 대조군 — HEAD 의 옛 sw.js
  {
    var old = null;
    try { old = cp.execSync('git show HEAD:sw.js', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { old = null; }
    if (!old) console.log('  (대조군 건너뜀 — git HEAD 를 읽지 못했습니다)');
    else if (old.indexOf('NET_WAIT_MS') >= 0) console.log('  (대조군 건너뜀 — HEAD 에 이미 이 수정이 들어 있습니다)');
    else {
      old = old.replace(/^﻿/, '');
      var o1 = load(old);
      o1.seed('qsc.html', 'cache-qsc');
      o1.net[ORIGIN + '/qsc.html'] = 'hang';
      var ro1 = await o1.within(o1.fire('qsc.html', { mode: 'navigate' }).responded, WAIT + 200);
      ok('⑥ 대조군(옛 sw.js) — 매달리면 사본이 있어도 기다린다(시험이 잡는 증상)', ro1 && ro1.pending === true, ro1);
      var o3 = load(old);
      o3.seed('data/master.json', 'cache-master');
      o3.net[ORIGIN + '/data/master.json'] = 503;
      var ro3 = await o3.within(o3.fire('data/master.json').responded, 200);
      ok('⑥ 대조군(옛 sw.js) — 503 이면 사본이 있어도 오류 응답(시험이 잡는 증상)', ro3 && ro3.status === 503, ro3);
    }
  }

  console.log('client-sw-test: ' + pass + ' 통과 · ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
}
main().catch(function (e) { console.log('시험 자체 오류', e); process.exit(2); });
