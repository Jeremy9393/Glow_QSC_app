/* 앱 서버 창구(js/api.js) 시험 — 2026-09-25 검수 · resilience-4 · resilience-5 · resilience-7
   돌리는 법: node test/client-api-test.js   (node 는 ..\_도구\node\node.exe)
   ★js/api.js 를 통째로 vm 에 올려 돌린다★ (fetch·window·localStorage·Auth 만 가짜)
   ① 인터넷이 끊기면 submit 이 한국어 안내를 실은 Error(code NETWORK)를 던진다 — 「Failed to fetch」가 화면에 가지 않는다
   ② 서버가 토큰을 거절한 뒤 다시 [제출]하면 옛 익명 봉투(type)로 보내지 않는다 — 요청 자체가 나가지 않고 로그인 안내
   ③ 처음부터 로그인 전(토큰 없음)이면 종전대로 옛 봉투로 보낸다(바뀌지 않았는지)
   ④ 다시 로그인하면(토큰이 생기면) 토큰을 붙여 보낸다 · 고객 설문(survey)은 익명 그대로
   ⑤ 대조군 — 저장소 HEAD 의 옛 api.js 로 ② 를 돌리면 옛 봉투가 나가야 한다(이 시험이 그 사고를 잡는지) */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var SRC = fs.readFileSync(path.join(ROOT, 'js', 'api.js'), 'utf8');

var pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; }
  else { fail++; console.log('✗ ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
}

/* 가짜 브라우저 하나 — reply(body) 가 돌려주는 값이 서버 응답이 된다(throw 면 fetch 실패) */
function makeEnv(src, reply, auth) {
  var sent = [];
  var store = {};
  var ctx = {
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise, JSON: JSON,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
    },
    fetch: function (url, opt) {
      var body = JSON.parse(opt.body);
      sent.push(body);
      return new Promise(function (resolve, reject) {
        var out;
        try { out = reply(body); } catch (e) { reject(e); return; }
        resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(out)); } });
      });
    },
  };
  ctx.window = ctx;
  if (auth) ctx.Auth = auth;
  vm.createContext(ctx);
  vm.runInContext(src + '\n;this.__Api = Api;', ctx, { filename: 'api.js' });
  return { Api: ctx.__Api, sent: sent };
}

/* 토큰을 들고 있다가 relogin() 에서 버리는 Auth (auth.js 의 relogin 과 같은 동작) */
function makeAuth(tok) {
  var state = { t: tok };
  return {
    state: state,
    token: function () { return state.t; },
    relogin: function () { state.t = null; return Promise.resolve(false); },
  };
}

async function main() {
  // ① NETWORK
  {
    var e1 = makeEnv(SRC, function () { throw new TypeError('Failed to fetch'); }, makeAuth('T1'));
    var thrown = null;
    try { await e1.Api.submit('qsc', { store: '샘플' }); } catch (e) { thrown = e; }
    ok('① 끊기면 던진다', !!thrown);
    ok('① code 는 NETWORK', thrown && thrown.code === 'NETWORK', thrown && thrown.code);
    ok('① 문구는 한국어 안내 — 인터넷 연결 확인 · 작성 내용 남음',
      thrown && /인터넷 연결을 확인/.test(thrown.message) && /그대로 남아/.test(thrown.message), thrown && thrown.message);
    ok('① 「Failed to fetch」가 문구에 없다', thrown && thrown.message.indexOf('Failed to fetch') < 0);
    ok('① 원래 오류는 cause 에 남는다', thrown && thrown.cause && thrown.cause.message === 'Failed to fetch');
    var r1 = await e1.Api.call('config.get', {});
    ok('① 조회(call)는 종전대로 던지지 않고 NETWORK 객체', r1 && r1.code === 'NETWORK' && r1.ok === false, r1);
  }

  // ② 토큰 거절 뒤 재제출
  {
    var auth = makeAuth('DEAD');
    var e2 = makeEnv(SRC, function () { return { ok: false, code: 'AUTH_INVALID', error: '로그인이 필요합니다.' }; }, auth);
    var a = await e2.Api.submit('qsc', { store: '샘플' });
    ok('② 첫 제출은 토큰을 붙여 나간다', e2.sent.length === 1 && e2.sent[0].token === 'DEAD' && e2.sent[0].action === 'qsc.submit', e2.sent);
    ok('② 첫 제출 결과는 AUTH 코드 그대로', a && a.ok === false && a.code === 'AUTH_INVALID', a);
    ok('② 첫 제출 문구는 「로그인이 풀렸습니다 … 남아 있습니다」', a && /로그인이 풀렸습니다/.test(a.error) && /남아 있습니다/.test(a.error), a && a.error);
    ok('② authLost 가 참', e2.Api.authLost(a) === true);
    ok('② relogin 이 세션을 버렸다(토큰 없음)', auth.state.t === null);
    var b = await e2.Api.submit('qsc', { store: '샘플' });
    ok('② 두 번째 제출은 요청이 나가지 않는다(옛 익명 봉투 없음)', e2.sent.length === 1, e2.sent);
    ok('② 두 번째 결과는 AUTH_REQUIRED + 로그인 안내', b && b.ok === false && b.code === 'AUTH_REQUIRED' && /로그인이 풀렸습니다/.test(b.error), b);
    ok('② 어디에도 type(옛 봉투)이 없다', e2.sent.every(function (x) { return !x.type; }), e2.sent);
    // 고객 설문은 원래 익명 경로 — 막히면 안 된다
    await e2.Api.submit('survey', { code: '123456', store: '샘플', source: 'customer' });
    ok('④ 고객 설문(survey)은 그대로 나간다(익명 action)', e2.sent.length === 2 && e2.sent[1].action === 'survey.submit' && !e2.sent[1].token, e2.sent[1]);
    // 다시 로그인
    auth.state.t = 'NEW';
    await e2.Api.submit('qsc', { store: '샘플' });
    ok('④ 다시 로그인하면 토큰을 붙여 나간다', e2.sent.length === 3 && e2.sent[2].token === 'NEW' && e2.sent[2].action === 'qsc.submit', e2.sent[2]);
  }

  // ③ 처음부터 토큰 없음 — 종전 옛 봉투 경로 유지
  {
    var e3 = makeEnv(SRC, function () { return { ok: true }; }, makeAuth(null));
    var c = await e3.Api.submit('qsc', { store: '샘플' });
    ok('③ 로그인 전이면 종전대로 옛 봉투(type:qsc)로 보낸다', e3.sent.length === 1 && e3.sent[0].type === 'qsc' && !e3.sent[0].token, e3.sent);
    ok('③ 결과 그대로', c && c.ok === true);
    var e3b = makeEnv(SRC, function () { return { ok: true }; }, null);   // auth.js 없는 화면(survey.html)
    await e3b.Api.submit('shopper', { store: '샘플', source: 'customer' });
    ok('③ auth.js 없는 화면의 고객 설문은 survey.submit 익명', e3b.sent.length === 1 && e3b.sent[0].action === 'survey.submit', e3b.sent);
  }

  // ⑤ 대조군 — HEAD 의 api.js
  {
    var old = null;
    try { old = cp.execSync('git show HEAD:js/api.js', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { old = null; }
    if (!old) { console.log('  (대조군 건너뜀 — git HEAD 를 읽지 못했습니다)'); }
    else if (old.indexOf('tokenLost') >= 0) { console.log('  (대조군 건너뜀 — HEAD 에 이미 이 수정이 들어 있습니다)'); }
    else {
      var authO = makeAuth('DEAD');
      var e5 = makeEnv(old, function () { return { ok: false, code: 'AUTH_INVALID', error: '로그인이 필요합니다.' }; }, authO);
      await e5.Api.submit('qsc', { store: '샘플' });
      await e5.Api.submit('qsc', { store: '샘플' });
      ok('⑤ 대조군(옛 api.js) — 두 번째 제출이 옛 익명 봉투로 나간다(시험이 잡는 사고)',
        e5.sent.length === 2 && e5.sent[1].type === 'qsc' && !e5.sent[1].token, e5.sent);
      var e5n = makeEnv(old, function () { throw new TypeError('Failed to fetch'); }, makeAuth('T'));
      var th = null;
      try { await e5n.Api.submit('qsc', {}); } catch (e) { th = e; }
      ok('⑤ 대조군(옛 api.js) — 「Failed to fetch」가 그대로 던져진다', th && th.message === 'Failed to fetch', th && th.message);
    }
  }

  console.log('client-api-test: ' + pass + ' 통과 · ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
}
main().catch(function (e) { console.log('시험 자체 오류', e); process.exit(2); });
