# -*- coding: utf-8 -*-
"""깨진 응답이면 조회만 한 번 더 묻는다 (2026-09-15 담당자 선택)

★js/api.js 를 통째로 node 에 올려 돌린다★ (사본 아님 · fetch·window·localStorage 만 가짜).

왜: 사무실 PC 에서 구글이 JSON 대신 안내 페이지(404)를 주는 일이 잦다 — 연결·암호화는 빠른데
답을 주는 단계에서 10~27초 기다리다 404가 온다(현재상황.md ㉑). 새로고침하면 대개 되므로
그 한 번을 앱이 대신한다. ★쓰기는 절대 다시 보내지 않는다★(제출이 두 벌이 된다).

보는 것:
  ① 조회(store.get)가 깨진 응답을 받으면 한 번 더 묻고, 두 번째가 성공이면 성공을 돌려준다
  ② 두 번 다 깨지면 종전과 같은 오류를 그대로 돌려준다 (요청은 두 번까지만)
  ③ 쓰기(qsc.submit·month.close)는 다시 묻지 않는다
  ④ 서버가 JSON 으로 보낸 오류는 다시 묻지 않는다 (응답을 읽은 것이므로)
  ⑤ 오프라인(fetch 예외)은 다시 묻지 않는다 — NETWORK 그대로
"""
import io, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
APP = HERE.parents[1]
SRC = APP / 'js' / 'api.js'
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_api_retry.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()

head = r'''
global.window = {};
let sent = [];
let queue = [];
global.fetch = async function (url, init) {
  sent.push(JSON.parse(init.body));
  const next = queue.shift();
  if (!next) throw new Error('보낼 답이 없습니다 — 요청이 예상보다 많습니다');
  if (next.offline) throw new Error('offline');
  return { text: async function () { return next.body; } };
};
global.localStorage = { getItem: function () { return null; }, setItem: function () { } };
const HTML = '<!DOCTYPE html><html><body>페이지를 찾을 수 없음</body></html>';
'''

tail = r'''

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); }
}

(async function () {
  // ① 조회 — 깨진 응답 뒤 한 번 더
  sent = []; queue = [{ body: HTML }, { body: '{"ok":true,"items":[]}' }];
  let r = await Api.call('store.get', { ym: '2610' });
  ok('① 조회: 깨진 응답이면 한 번 더 묻는다', sent.length === 2 && r.ok === true, { n: sent.length, r: r });
  ok('① 같은 요청 열쇠(reqId)로 다시 묻는다', sent[0].reqId === sent[1].reqId, sent.map(function (c) { return c.reqId; }));
  ok('① 같은 action·payload 그대로', sent[1].action === 'store.get' && sent[1].payload.ym === '2610', sent[1]);

  // ② 두 번 다 깨지면 종전 오류 그대로
  sent = []; queue = [{ body: HTML }, { body: HTML }];
  r = await Api.call('dashboard.get', { period: '2610' });
  ok('② 두 번 다 깨지면 요청은 두 번까지', sent.length === 2, sent.length);
  ok('② 종전과 같은 오류를 돌려준다', r.ok === false && r.code === 'SERVER_ERROR' && r.error.indexOf('서버 응답을 읽지 못했습니다') === 0, r);

  // ③ 쓰기는 다시 묻지 않는다
  sent = []; queue = [{ body: HTML }];
  r = await Api.call('qsc.submit', { store: '샘플매장' });
  ok('③ 제출은 다시 묻지 않는다', sent.length === 1 && r.code === 'SERVER_ERROR', { n: sent.length, r: r });
  sent = []; queue = [{ body: HTML }];
  r = await Api.call('month.close', { store: '샘플매장', ym: '2610', apply: true });
  ok('③ 월 채점 확정도 다시 묻지 않는다', sent.length === 1, sent.length);
  sent = []; queue = [{ body: HTML }];
  r = await Api.call('store.saveImprove', { no: 1 });
  ok('③ 개선요청 저장도 다시 묻지 않는다', sent.length === 1, sent.length);

  // ④ 서버가 JSON 으로 보낸 오류는 그대로
  sent = []; queue = [{ body: '{"ok":false,"code":"SERVER_ERROR","error":"시트를 읽지 못했습니다."}' }];
  r = await Api.call('store.get', { ym: '2610' });
  ok('④ JSON 오류는 다시 묻지 않는다', sent.length === 1 && r.error === '시트를 읽지 못했습니다.', { n: sent.length, r: r });

  // ⑤ 오프라인은 그대로
  sent = []; queue = [{ offline: true }];
  r = await Api.call('store.get', { ym: '2610' });
  ok('⑤ 오프라인은 다시 묻지 않는다 (NETWORK)', sent.length === 1 && r.code === 'NETWORK', { n: sent.length, r: r });

  console.log('JS ' + pass + ' 통과 · ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(head + src + tail)
r = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(r.stdout, end='')
if r.stderr:
    print(r.stderr)
sys.exit(r.returncode)
