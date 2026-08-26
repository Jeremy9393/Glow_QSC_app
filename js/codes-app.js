/* 제출 코드 관리 (관리자) — 설계: 1. QSC\_보관\설계\쇼퍼_제출코드_설계.md
   규칙(2026-08-26 단순화): 코드 1장 = 매장 1곳 = 1회용 · 6자리 숫자
   유효시간: 3시간 / 당일(23:59) / 15일 — 쓰이거나, 시간이 지나거나, 취소하면 죽는다.

   ★'이번 달 한 장' 규칙을 없앴다★ (2026-08-26) — 예전에는 코드가 (회차 YYMM · 매장) 한 칸에
     묶여 있어, 한 매장에 이번 달 한 장만 살 수 있고 한 번 제출하면 그 달엔 더 못 냈다.
     그 두 규칙 때문에 이 화면이 26개 매장 × 이번 달 격자, 곧 조사 진척 관리표가 되어 있었다.
     조사 진척은 대시보드의 MS 점수가 보여 주는 일이지 코드 발급 화면이 할 일이 아니다.
     지금 이 화면이 보여 주는 것은 딱 하나 — ★지금 살아 있는 코드★.
     쓰인 코드·취소된 코드·지난 코드는 목록에서 사라진다(이력은 시트에 전부 남는다).

   ★판정과 소진은 100% 서버에서 한다★ — 여기 보이는 것은 표시용이고, 제출 순간의 진짜 판정은
     `submitWithCode`가 LockService 안에서 한다. 화면 값을 고쳐도 제출은 통과되지 않는다.
     원장은 구글시트 `쇼퍼_코드` 탭이고, 이 화면은 그 시트를 보여 주는 창일 뿐이다. */
(async function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const BASE = 'https://jeremy9393.github.io/Glow_QSC_app/';
  const TTL = { '3h': '3시간', 'today': '당일', '15d': '15일' };
  let ttl = '3h';

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
     화면은 서버가 준 목록을 그대로 들고 그린다. 무엇을 바꾸든 ★서버에 먼저 시키고 다시 받아온다★ —
     화면에서 먼저 고치고 나중에 맞추면, 실패했을 때 화면만 바뀐 채로 남는다. */
  let liveList = [];

  async function reload(quiet) {
    const r = await Api.call('codes.list', {}).catch(function () { return null; });
    if (!(r && r.ok)) {
      if (!quiet) alert('코드 현황을 불러오지 못했습니다.\n' + ((r && r.error) || '잠시 후 다시 시도해 주세요.'));
      return false;
    }
    liveList = r.live || [];
    render();
    return true;
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
     무엇보다 서버가 모르는 코드는 제출 때 통과되지 않는다.
     ★미리 막지 않는다★ (2026-08-26) — 예전에는 '살아 있는 코드가 있다'·'이번 회차 제출이 끝났다'로
       여기서 먼저 거절했다. 이제 몇 장이든 낼 수 있으므로 그 검사가 없다. */
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
    const btn = this;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '발급 중…';
    const r = await Api.call('codes.issue', { store: store, ttl: ttl }).catch(function () { return null; });
    btn.disabled = false; btn.textContent = label;
    if (!(r && r.ok)) { alert('발급하지 못했습니다.\n' + ((r && r.error) || '잠시 후 다시 시도해 주세요.')); return; }
    showIssued(store, Object.assign({ ttl: ttl }, r.rec));
    reload(true);   // 목록 갱신은 배경에서 — 방금 받은 코드를 보여주는 일을 늦추지 않는다
  };

  function showIssued(store, rec) {
    const box = $('#issued');
    box.innerHTML =
      '<div class="bigCodeBox"><div class="bcStore"></div>' +
      '<div class="bigCode">' + rec.code.slice(0, 3) + ' ' + rec.code.slice(3) + '</div>' +
      '<div class="bcExp">' + fmt(rec.expiresAt) + ' 까지 · ' + (TTL[rec.ttl] || '') + '</div>' +
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

  // ---------- 살아 있는 코드 ----------
  /* ★만료는 화면에서도 한 번 더 거른다★ — 서버가 보내 줄 때는 살아 있었어도, 이 화면을 열어 둔 채
     30초마다 다시 그리는 동안 시간이 지날 수 있다. 지난 코드가 '쓸 수 있는 것'처럼 남으면
     담당자가 그 번호를 불러 주게 된다. */
  function render() {
    const list = $('#list');
    list.innerHTML = '';
    const alive = liveList.filter(function (r) { return !r.expiresAt || r.expiresAt > Date.now(); });

    if (!alive.length) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = '지금 살아 있는 코드가 없습니다. 위에서 매장을 고르고 발급해 주세요.';
      list.appendChild(p);
    }

    alive.forEach(function (rec) {
      const row = document.createElement('div');
      row.className = 'codeRow unused';
      row.innerHTML = '<span class="st">⬜</span><span class="nm"></span>' +
        '<span class="info"><b class="cd">' + rec.code + '</b> · <span class="rem">' +
        (left(rec.expiresAt) || '') + '</span> <span class="dim">(' + fmt(rec.expiresAt) + ' 까지)</span></span>' +
        '<span class="act"><button class="miniBtn" data-a="qr">QR</button>' +
        '<button class="miniBtn" data-a="copy">복사</button>' +
        '<button class="miniBtn warn" data-a="cancel">취소</button></span>';
      $('.nm', row).textContent = rec.store;   // 매장명은 서버 문자열 — 반드시 textContent
      row.querySelectorAll('button').forEach(function (b) {
        b.onclick = function () {
          const a = b.dataset.a;
          if (a === 'qr') { showQr(rec.store, rec.code); return; }
          if (a === 'copy') { copy(msgFor(rec.store, rec), b); return; }
          if (a === 'cancel') {
            if (!confirm(rec.store + ' 코드 ' + rec.code + '\n지금 무효로 만들까요?')) return;
            b.disabled = true;
            /* ★코드 번호로 취소한다★ — 한 매장에 여러 장이 살 수 있으므로 매장 이름으로는
               어느 장을 죽여야 할지 정할 수 없다. */
            Api.call('codes.revoke', { code: rec.code }).then(function (r) {
              b.disabled = false;
              if (!(r && r.ok)) { alert('취소하지 못했습니다.\n' + ((r && r.error) || '')); return; }
              reload(true);
            }).catch(function () { b.disabled = false; alert('취소하지 못했습니다.'); });
          }
        };
      });
      list.appendChild(row);
    });

    const nStore = {};
    alive.forEach(function (r) { nStore[r.store] = true; });
    $('#sum').innerHTML = '<span>살아 있는 코드 <b class="hot">' + alive.length + '</b></span>' +
      '<span>매장 <b>' + Object.keys(nStore).length + '</b>곳</span>';
  }

  /* ★첫 화면은 서버에서 받아 그린다★ — render()만 부르면 빈 목록을 그려 '아무것도 없음'으로 보인다.
     30초마다 다시 그리는 것은 남은 시간·만료 표시를 위한 것이고, 서버를 다시 부르지는 않는다
     (부르면 화면을 열어 둔 동안 계속 왕복한다 — 갱신은 [발급]·[취소] 때 알아서 일어난다). */
  await reload();
  setInterval(render, 30000);
})();
