# -*- coding: utf-8 -*-
"""점검 모드 상태등 — 등록은 「읽기」 · 켜기/끄기는 쓰기 권한 (2026-09-15)

★Code.gs 의 진짜 fnAdminMaint 를 잘라내서 돌린다★ (사본 아님).
PROPS · can · auditLog · maintInfo 는 가짜로 끼운다.

왜: 관리 화면 상태등이 20초마다 admin.maint {} 로 상태만 묻는데, 등록이 「쓰기」라
doPost 가 그때마다 감사로그에 한 줄을 적었다(1주 109줄). 등록을 「읽기」로 내리면서
켜기·끄기가 읽기 권한만으로 열리지 않게 함수 안에서 쓰기 권한을 따로 본다.

보는 것:
  ① 등록표 admin.maint 가 「읽기」
  ② 상태만({}) — 읽기만 가진 역할도 ok · 감사로그 안 늘어남
  ③ 읽기만 가진 역할의 켜기/끄기 — FORBIDDEN · 속성 그대로 · 「거부」 줄
  ④ 쓰기 가진 역할의 켜기 — MAINT 설정 · 「점검 시작」 / 끄기 — MAINT 삭제 · 「점검 해제」
"""
import io, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve()
SRC = HERE.parents[1] / 'backend' / 'Code.gs'
NODE = HERE.parents[2] / '_도구' / 'node' / 'node.exe'
OUT = HERE.parent / 't_maint_read.js'
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src = io.open(SRC, 'r', encoding='utf-8', newline='').read()
lines = src.split('\n')


def cut(name):
    st = next((i for i, l in enumerate(lines) if l.startswith('function %s(' % name)), None)
    if st is None:
        raise SystemExit('function %s 를 Code.gs 에서 못 찾음' % name)
    for j in range(st + 1, len(lines)):
        if lines[j] == '}':
            return '\n'.join(lines[st:j + 1])
    raise SystemExit('%s 끝 못 찾음' % name)


py_fail = 0
reg = re.search(r"'admin\.maint':\s*\{[^}]*\}", src)
if reg and "act: '읽기'" in reg.group(0):
    print('  ✓ ① 등록표 admin.maint 가 「읽기」')
else:
    py_fail += 1
    print('  ✗ ① 등록표 admin.maint 가 「읽기」')

js = r'''
const ADMIN_MENU = 'accounts';
const MAINT_DEFAULT_MSG = '기본 안내';
let props = {};
const PROPS = {
  setProperty(k, v) { props[k] = String(v); },
  deleteProperty(k) { delete props[k]; },
  getProperty(k) { return props[k] || null; },
};
const logs = [];
function auditLog(ctx, action, store, result, reason, note) { logs.push([action, result, reason, note]); }
function err(code, msg) { return { ok: false, code: code, error: msg }; }
const PERM = { '관리자': { '읽기': true, '쓰기': true }, '열람': { '읽기': true } };
function can(role, menu, act) { return { allow: !!(menu === ADMIN_MENU && PERM[role] && PERM[role][act]) }; }
function maintInfo() {
  return { on: !!props.MAINT, msg: props.MAINT || '', at: props.MAINT_AT || '', min: props.MAINT_MIN ? Number(props.MAINT_MIN) : 0 };
}
''' + cut('fnAdminMaint') + r'''

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }
const viewer = { role: '열람', id: 'v' }, admin = { role: '관리자', id: 'admin' };

let r = fnAdminMaint(viewer, {});
ok('② 상태만 — 읽기 역할도 ok · 꺼짐', r.ok === true && r.on === false);
ok('② 상태만 — 감사로그 0줄', logs.length === 0);

r = fnAdminMaint(viewer, { on: true, msg: '시험' });
ok('③ 읽기 역할 켜기 — FORBIDDEN', r.ok === false && r.code === 'FORBIDDEN');
ok('③ 읽기 역할 켜기 — 속성 그대로', !('MAINT' in props));
ok('③ 읽기 역할 켜기 — 거부 1줄', logs.length === 1 && logs[0][1] === '거부');

r = fnAdminMaint(admin, { on: true, msg: '공사중', min: 10 });
ok('④ 관리자 켜기 — 켜짐 · 문구 · 분', r.ok === true && r.on === true && props.MAINT === '공사중' && props.MAINT_MIN === '10');
ok('④ 관리자 켜기 — 「점검 시작」 1줄', logs.length === 2 && logs[1][1] === '성공' && String(logs[1][3]).indexOf('점검 시작') === 0);

r = fnAdminMaint(viewer, { off: true });
ok('③ 읽기 역할 끄기 — FORBIDDEN · 켜진 채', r.code === 'FORBIDDEN' && props.MAINT === '공사중');

r = fnAdminMaint(viewer, {});
ok('② 켜진 상태에서 상태만 — on · 로그 안 늘어남', r.ok === true && r.on === true && logs.length === 3);

r = fnAdminMaint(admin, { off: true });
ok('④ 관리자 끄기 — 꺼짐 · MAINT 삭제', r.ok === true && r.on === false && !('MAINT' in props));
ok('④ 관리자 끄기 — 「점검 해제」 1줄', logs.length === 4 && logs[3][3] === '점검 해제');

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
'''

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
res = subprocess.run([str(NODE), str(OUT)], capture_output=True, text=True, encoding='utf-8')
print(res.stdout.rstrip())
if res.stderr.strip():
    print(res.stderr.strip())
if py_fail or res.returncode != 0:
    sys.exit(1)
