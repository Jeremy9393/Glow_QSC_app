/* 제출 코드 관리 (관리자) — 설계: 1. QSC\쇼퍼_제출코드_설계.md
   규칙: 매장 1곳 = 코드 1개 = 월 1회(회차 YYMM) · 6자리 숫자 · 1회성 소진
   유효시간: 3시간 / 당일(23:59) / 15일

   ※ 지금은 미리보기(모의) — 발급·상태가 이 기기 localStorage에만 쌓인다.
     구글 연동 후 아래 Store 객체만 Apps Script 호출로 바꾸면 화면은 그대로 쓴다.
     실제 판정(유효·소진)은 반드시 서버에서 한다 — 화면 상태는 표시용일 뿐. */
(async function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const KEY = 'qsc-codes-mock';
  const BASE = 'https://jeremy9393.github.io/Glow_QSC_app/';
  const TTL = { '3h': '3시간', 'today': '당일', '15d': '15일' };
  let ttl = '3h';

  function cycle(d) {
    d = d || new Date();
    return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0');
  }
  function expiryOf(kind, from) {
    const d = new Date(from);
    if (kind === '3h') return d.getTime() + 3 * 3600 * 1000;
    if (kind === 'today') { d.setHours(23, 59, 59, 0); return d.getTime(); }
    return d.getTime() + 15 * 86400 * 1000;
  }
  function fmt(ts) {
    const d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function left(ts) {
    const ms = ts - Date.now();
    if (ms <= 0) return null;
    const m = Math.floor(ms / 60000);
    if (m < 60) return m + '분 남음';
    const h = Math.floor(m / 60);
    if (h < 48) return h + '시간 ' + (m % 60) + '분 남음';
    return Math.floor(h / 24) + '일 남음';
  }

  // ---------- 저장소 (연동 후 이 부분만 서버 호출로 교체) ----------
  const Store = {
    all: function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } },
    cur: function () { return this.all()[cycle()] || {}; },
    put: function (map) {
      const a = this.all();
      a[cycle()] = map;
      localStorage.setItem(KEY, JSON.stringify(a));
    },
  };
  function stateOf(rec) {
    if (!rec) return 'none';
    if (rec.state === 'used') return 'used';
    // 삭제 = 응답이 실제로 사라진 상태 → 그 매장은 '아직 조사 안 함'이 맞다
    if (rec.state === 'deleted' || rec.state === 'cancelled') return 'none';
    return rec.expiresAt <= Date.now() ? 'expired' : 'unused';
  }

  // ---------- 매장 목록 · QR ----------
  const master = await (await fetch('data/master.json', { cache: 'no-store' })).json();
  // 매장별 설문 QR(tools/make_qr.py로 미리 생성) — 링크만 담고 제출 코드는 담지 않는다
  const qr = await (await fetch('data/qr.json', { cache: 'no-store' })).json().catch(function () { return { stores: {}, urls: {} }; });

  function showQr(store, code) {
    const src = qr.stores && qr.stores[store];
    if (!src) { alert(store + '\nQR이 아직 만들어지지 않았습니다.\n(매장이 새로 추가된 경우 — 안내 메시지 복사로 링크를 보내주세요)'); return; }
    $('#qfStore').textContent = store;
    $('#qfImg').src = src;
    $('#qfCode').textContent = code ? code.slice(0, 3) + ' ' + code.slice(3) : '';
    $('#qrFull').style.display = 'flex';
  }
  $('#qfClose').onclick = function () { $('#qrFull').style.display = 'none'; };
  const live = await Api.getConfig();
  const stores = (live && live.stores && live.stores.length) ? live.stores : (master.stores || []);
  stores.forEach(function (s) {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    $('#store').appendChild(o);
  });
  $('#cycleInfo').textContent = cycle() + ' 회차';

  // 미리보기 첫 실행 — 네 가지 상태가 한눈에 보이도록 예시를 깔아둔다
  if (!Object.keys(Store.cur()).length && stores.length >= 3) {
    const now = Date.now();
    const seed = {};
    seed[stores[0]] = { code: '504118', issuedAt: now - 2 * 86400000, expiresAt: now + 13 * 86400000, state: 'used', usedAt: now - 86400000, ttl: '15d' };
    seed[stores[1]] = { code: '382917', issuedAt: now - 3600000, expiresAt: now + 2 * 3600000 + 47 * 60000, state: 'unused', ttl: '3h' };
    seed[stores[2]] = { code: '996031', issuedAt: now - 5 * 3600000, expiresAt: now - 2 * 3600000, state: 'unused', ttl: '3h' };
    Store.put(seed);
  }

  // ---------- 유효시간 선택 ----------
  $('#ttl').querySelectorAll('button').forEach(function (b) {
    b.onclick = function () {
      ttl = b.dataset.v;
      $('#ttl').querySelectorAll('button').forEach(function (x) { x.className = x === b ? 'on' : ''; });
    };
  });
  $('#ttl').querySelector('button').className = 'on';

  // ---------- 발급 ----------
  function gen6(map) {
    const used = {};
    Object.keys(map).forEach(function (k) { used[map[k].code] = 1; });
    for (let i = 0; i < 200; i++) {
      const c = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
      if (!used[c]) return c;
    }
    return String(Date.now()).slice(-6);
  }
  function msgFor(store, rec) {
    return '[GLOW SEOUL 미스터리쇼퍼]\n' + store + ' 방문 후 아래 링크에서 설문을 작성해 주세요.\n' +
      BASE + 'survey.html?store=' + encodeURIComponent(store) +
      '\n\n제출 코드 : ' + rec.code + '\n(' + fmt(rec.expiresAt) + ' 까지)';
  }
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const t = document.createElement('textarea');
      t.value = text; document.body.appendChild(t); t.select();
      document.execCommand('copy'); t.remove();
    }
    const old = btn.textContent;
    btn.textContent = '복사됨';
    setTimeout(function () { btn.textContent = old; }, 1200);
  }

  $('#issueBtn').onclick = function () {
    const store = $('#store').value;
    if (!store) { alert('매장을 선택해 주세요.'); return; }
    const map = Store.cur();
    if (stateOf(map[store]) === 'unused') {
      alert(store + '\n이번 회차에 아직 쓰지 않은 코드가 있습니다 (' + map[store].code + ').\n다시 발급하려면 기존 코드를 먼저 취소해 주세요.');
      return;
    }
    if (stateOf(map[store]) === 'used') {
      if (!confirm(store + '\n이번 회차 설문이 이미 제출되었습니다.\n\n다시 조사하시려면 새 코드를 발급합니다.\n(이미 들어온 응답은 지워지지 않습니다 — 지우려면 쇼퍼_응답 시트에서)\n\n계속할까요?')) return;
    }
    const now = Date.now();
    map[store] = { code: gen6(map), issuedAt: now, expiresAt: expiryOf(ttl, now), state: 'unused', ttl: ttl };
    Store.put(map);
    showIssued(store, map[store]);
    render();
  };

  function showIssued(store, rec) {
    const box = $('#issued');
    box.innerHTML =
      '<div class="bigCodeBox"><div class="bcStore"></div>' +
      '<div class="bigCode">' + rec.code.slice(0, 3) + ' ' + rec.code.slice(3) + '</div>' +
      '<div class="bcExp">' + fmt(rec.expiresAt) + ' 까지 · ' + TTL[rec.ttl] + '</div>' +
      (qr.stores && qr.stores[store]
        ? '<img class="qrImg" id="bcQr" src="' + qr.stores[store] + '" alt="설문 QR">' +
          '<div class="qrCap">현장에서는 이 QR을 찍게 하고, 코드를 불러주세요</div>' : '') +
      '<div class="bcAct"><button class="miniBtn" id="bigQr">QR 크게</button>' +
      '<button class="miniBtn" id="cpMsg">안내 메시지 복사</button>' +
      '<button class="miniBtn" id="cpCode">코드만 복사</button></div></div>';
    $('.bcStore', box).textContent = store;
    $('#cpMsg').onclick = function () { copy(msgFor(store, rec), this); };
    $('#cpCode').onclick = function () { copy(rec.code, this); };
    $('#bigQr').onclick = function () { showQr(store, rec.code); };
    if ($('#bcQr')) $('#bcQr').onclick = function () { showQr(store, rec.code); };
  }

  // ---------- 현황판 (매장 목록이 곧 현황판) ----------
  const LABEL = {
    used: ['✅', 'used'], unused: ['⬜', 'unused'],
    expired: ['⛔', 'expired'], none: ['⚪', 'none'],
  };
  function render() {
    const map = Store.cur();
    const list = $('#list');
    list.innerHTML = '';
    let n = { used: 0, unused: 0, expired: 0, none: 0 };
    stores.forEach(function (store) {
      const rec = map[store];
      const st = stateOf(rec);
      n[st]++;
      const row = document.createElement('div');
      row.className = 'codeRow ' + LABEL[st][1];
      let info = '', act = '';
      if (st === 'used') {
        info = fmt(rec.usedAt) + ' 제출 완료';
        // 오염된 응답을 지우고 다시 받기 위한 버튼 — 응답·비고를 실제로 삭제하고 점수를 다시 계산한다
        act = '<button class="miniBtn warn" data-a="del">삭제</button>';
      } else if (st === 'unused') {
        info = '<b class="cd">' + rec.code + '</b> · <span class="rem">' + (left(rec.expiresAt) || '') + '</span>';
        act = '<button class="miniBtn" data-a="qr">QR</button><button class="miniBtn" data-a="copy">복사</button>' +
          '<button class="miniBtn warn" data-a="cancel">취소</button>';
      } else if (st === 'expired') {
        info = '만료됨 (' + rec.code + ')';
        act = '<button class="miniBtn" data-a="issue">재발급</button>';
      } else {
        info = '미발급' + (rec && rec.deleteReason
          ? ' <span class="dim">· ' + fmt(rec.deletedFrom) + ' 제출분 삭제됨 (' + rec.deleteReason + ')</span>' : '');
        act = '<button class="miniBtn" data-a="issue">발급</button>';
      }
      row.innerHTML = '<span class="st">' + LABEL[st][0] + '</span><span class="nm"></span>' +
        '<span class="info">' + info + '</span><span class="act">' + act + '</span>';
      $('.nm', row).textContent = store;
      row.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          const a = b.dataset.a;
          const m = Store.cur();
          if (a === 'qr') { showQr(store, m[store].code); return; }
          if (a === 'copy') { copy(msgFor(store, m[store]), b); return; }
          if (a === 'del') {
            const why = prompt(store + ' — ' + fmt(m[store].usedAt) + ' 제출분을 삭제합니다.\n\n' +
              '· 응답과 비고가 시트에서 지워집니다\n' +
              '· 이 달 CS 점수에서 빠지고 통합시트가 다시 계산됩니다\n' +
              '· 삭제 후 이 매장에 코드를 다시 발급할 수 있습니다\n\n삭제 사유를 적어 주세요', '');
            if (why === null) return;
            if (!confirm(store + ' — ' + fmt(m[store].usedAt) + ' 제출분\n\n정말 삭제할까요? 되돌릴 수 없습니다.')) return;
            m[store] = {
              state: 'deleted', deletedFrom: m[store].usedAt, deletedAt: Date.now(),
              deleteReason: (why || '').trim() || '사유 미기재', code: m[store].code,
            };
            Store.put(m); render(); return;
          }
          if (a === 'cancel') {
            if (!confirm(store + ' 코드 ' + m[store].code + '\n지금 무효로 만들까요?')) return;
            m[store].state = 'cancelled';
            Store.put(m); render(); return;
          }
          if (a === 'issue') { $('#store').value = store; $('#issueBtn').click(); }
        };
      });
      list.appendChild(row);
    });
    $('#sum').innerHTML =
      '<span>미발급 <b>' + n.none + '</b></span><span>미제출 <b class="hot">' + n.unused + '</b></span>' +
      '<span>제출 <b class="ok">' + n.used + '</b></span><span>만료 <b>' + n.expired + '</b></span>' +
      '';
  }

  render();
  setInterval(render, 30000); // 남은 시간·만료 자동 갱신
})();
