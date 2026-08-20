/* 제출 코드 관리 (관리자) — 설계: 1. QSC\쇼퍼_제출코드_설계.md
   규칙: 매장 1곳 = 코드 1개 = 월 1회(회차 YYMM) · 6자리 숫자 · 1회성 소진
   유효시간: 3시간 / 당일(23:59) / 15일

   ★2026-08-20부터 실제로 동작한다★ — 발급·취소는 서버(`codes.issue`/`codes.revoke`)가 하고,
     원장은 구글시트 `쇼퍼_코드` 탭이다. 이 화면은 그 시트를 보여 주는 창일 뿐이다.
     ★판정과 소진은 100% 서버에서 한다★ — 여기 보이는 상태는 표시용이고, 제출 순간의 진짜 판정은
     `submitWithCode`가 LockService 안에서 한다. 화면 값을 고쳐도 제출은 통과되지 않는다. */
(async function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const BASE = 'https://jeremy9393.github.io/Glow_QSC_app/';
  const TTL = { '3h': '3시간', 'today': '당일', '15d': '15일' };
  let ttl = '3h';

  function cycle(d) {
    d = d || new Date();
    return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0');
  }
  /* 만료 시각은 ★서버가 정한다★ — 화면 시계로 계산하면 기기 시간을 바꾸는 것만으로 늘릴 수 있다. */
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

  /* ---------- 저장소 — 서버가 원장이다 ----------
     화면은 서버가 준 map을 그대로 들고 그린다. 무엇을 바꾸든 ★서버에 먼저 시키고 다시 받아온다★ —
     화면에서 먼저 고치고 나중에 맞추면, 실패했을 때 화면만 바뀐 채로 남는다. */
  let curMap = {};
  const Store = { cur: function () { return curMap; } };

  async function reload(quiet) {
    const r = await Api.call('codes.list', {}).catch(function () { return null; });
    if (!(r && r.ok)) {
      if (!quiet) alert('코드 현황을 불러오지 못했습니다.\n' + ((r && r.error) || '잠시 후 다시 시도해 주세요.'));
      return false;
    }
    curMap = r.map || {};
    render();
    return true;
  }
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


  // ---------- 유효시간 선택 ----------
  $('#ttl').querySelectorAll('button').forEach(function (b) {
    b.onclick = function () {
      ttl = b.dataset.v;
      $('#ttl').querySelectorAll('button').forEach(function (x) { x.className = x === b ? 'on' : ''; });
    };
  });
  $('#ttl').querySelector('button').className = 'on';

  // ---------- 발급 ----------
  /* 코드는 ★서버가 만든다★ — 화면이 만들면 두 사람이 같은 코드를 받을 수 있고,
     무엇보다 서버가 모르는 코드는 제출 때 통과되지 않는다. */
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

  $('#issueBtn').onclick = async function () {
    const store = $('#store').value;
    if (!store) { alert('매장을 선택해 주세요.'); return; }
    const map = Store.cur();
    /* 아래 두 검사는 ★서버도 똑같이 한다★ — 여기서는 왕복 한 번을 아끼려고 미리 볼 뿐이다 */
    if (stateOf(map[store]) === 'unused') {
      alert(store + '\n이번 회차에 아직 쓰지 않은 코드가 있습니다 (' + map[store].code +
        ').\n다시 발급하려면 기존 코드를 먼저 취소해 주세요.');
      return;
    }
    if (stateOf(map[store]) === 'used') {
      alert(store + '\n이번 회차 설문이 이미 제출되었습니다.\n\n' +
        '다시 조사하시려면 그 제출분을 먼저 지워야 합니다 — 아직 만들지 않은 기능입니다.');
      return;
    }
    const btn = this;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '발급 중…';
    const r = await Api.call('codes.issue', { store: store, ttl: ttl }).catch(function () { return null; });
    btn.disabled = false; btn.textContent = label;
    if (!(r && r.ok)) { alert('발급하지 못했습니다.\n' + ((r && r.error) || '잠시 후 다시 시도해 주세요.')); return; }
    await reload(true);
    const rec = Store.cur()[store] || r.rec;
    showIssued(store, Object.assign({ ttl: ttl }, rec));
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
            /* 제출분 삭제(설계 §5-2)는 아직 서버에 없다 — 응답·비고 행을 지우고 CS를 다시 계산하는 일이다.
               ★화면에서만 지운 척하지 않는다★ — 그러면 시트에는 남은 채 담당자만 지웠다고 믿는다. */
            alert(store + '\n\n제출분 삭제는 아직 만들지 않은 기능입니다.\n' +
              '지금은 구글시트 「쇼퍼_응답」·「쇼퍼_비고」에서 그 줄을 직접 지워 주세요.\n' +
              'CS 평균은 시트를 다시 읽어 계산하므로 곧 반영됩니다.');
            return;
          }
          if (a === 'cancel') {
            if (!confirm(store + ' 코드 ' + m[store].code + '\n지금 무효로 만들까요?')) return;
            b.disabled = true;
            Api.call('codes.revoke', { store: store }).then(function (r) {
              b.disabled = false;
              if (!(r && r.ok)) { alert('취소하지 못했습니다.\n' + ((r && r.error) || '')); return; }
              reload(true);
            }).catch(function () { b.disabled = false; alert('취소하지 못했습니다.'); });
            return;
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

  /* ★첫 화면은 서버에서 받아 그린다★ — render()만 부르면 빈 map을 그려 '전부 미발급'으로 보인다.
     30초마다 다시 그리는 것은 남은 시간·만료 표시를 위한 것이고, 서버를 다시 부르지는 않는다
     (부르면 화면을 열어 둔 동안 계속 왕복한다 — 갱신은 [발급]·[취소] 때 알아서 일어난다). */
  await reload();
  setInterval(render, 30000); // 남은 시간·만료 표시만 자동 갱신
})();
