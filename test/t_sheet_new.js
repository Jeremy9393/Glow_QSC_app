
let LOGS = [], LOG_THROW = false;
function auditLog(ctx, action, store, result, reason, note) { if (LOG_THROW) throw new Error('로그 실패'); LOGS.push({ id: ctx && ctx.id, action: action, result: result, reason: reason, note: note }); }
function mkSS(names) {
  const tabs = {};
  names.forEach(function (n) { tabs[n] = { _n: n, rows: [], frozen: 0, appendRow: function (r) { this.rows.push(r); }, setFrozenRows: function (n) { this.frozen = n; } }; });
  return { tabs: tabs, made: [],
    getSheetByName: function (n) { return tabs[n] || null; },
    insertSheet: function (n) { this.made.push(n); tabs[n] = { _n: n, rows: [], frozen: 0, appendRow: function (r) { this.rows.push(r); }, setFrozenRows: function (k) { this.frozen = k; } }; return tabs[n]; } };
}
let SHEET_NEW_LOGGING = false;
function sheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1);
    if (!SHEET_NEW_LOGGING) {
      SHEET_NEW_LOGGING = true;
      try {
        auditLog({ id: '(시스템)', role: '' }, 'sheet.new', '', '경고', 'SHEET_NEW',
          '탭 「' + name + '」 이 없어 새로 만들었습니다 — 탭 이름이 바뀐 것이면 되돌려 주십시오');
      } catch (e) { }
      SHEET_NEW_LOGGING = false;
    }
  }
  return sh;
}

let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info !== undefined ? '  ← ' + JSON.stringify(info) : '')); } }

console.log('① 있는 탭');
let ss = mkSS(['QSC_상세']);
let sh = sheet(ss, 'QSC_상세', ['a', 'b']);
ok('그대로 돌려준다 · 안 만든다 · 로그 없음', sh === ss.tabs['QSC_상세'] && ss.made.length === 0 && LOGS.length === 0);

console.log('② 없는 탭');
sh = sheet(ss, 'QSC_회차', ['제출시각', '점검일자']);
ok('만들었다 · 머리글 1줄 · 고정 1행', ss.made.join() === 'QSC_회차' && sh.rows.length === 1 && sh.rows[0][0] === '제출시각' && sh.frozen === 1, [ss.made, sh.rows, sh.frozen]);
ok('감사로그 1줄 — sheet.new · 경고 · SHEET_NEW', LOGS.length === 1 && LOGS[0].action === 'sheet.new' && LOGS[0].result === '경고' && LOGS[0].reason === 'SHEET_NEW', LOGS);
ok('탭 이름과 되돌리라는 말이 들어 있다', /「QSC_회차」/.test(LOGS[0].note) && /되돌려/.test(LOGS[0].note), LOGS[0] && LOGS[0].note);
ok('누가 = (시스템)', LOGS[0].id === '(시스템)', LOGS[0]);

console.log('③ 로그가 터져도');
LOGS = []; LOG_THROW = true;
sh = sheet(ss, 'NA프리셋', ['매장명']);
ok('탭은 만들어 돌려준다', sh === ss.tabs['NA프리셋'] && ss.made.indexOf('NA프리셋') >= 0);
LOG_THROW = false;
sheet(ss, '월말반영', ['실행시각']);
ok('플래그가 풀려 다음 탭은 기록된다', LOGS.length === 1 && /「월말반영」/.test(LOGS[0].note), LOGS);

console.log('\n' + (fail ? '실패 ' + fail + '개' : '전부 통과') + '  (통과 ' + pass + ')');
process.exit(fail ? 1 : 0);
