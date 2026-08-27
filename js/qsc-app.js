/* QSC 점검 앱 화면 로직 (담당자용) — v3.7 절대 감점제
   입력: 이상 없음 0 / 개선 필요 건수 / 해당 없음 NA
   ★(S2)·★★(S1)는 QSC 점수에서 바로 차감한다 (2026-08-18 변경 · 하한 0) */
(async function () {
  // cache:'no-store' — 데이터 파일은 항상 서버 최신본 (오프라인이면 SW 캐시 폴백)
  const master = await (await fetch('data/master.json', { cache: 'no-store' })).json();
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const DRAFT_KEY = 'qsc-draft-v2';
  /* ★NA 사유★ (2026-08-27 담당자 결정) — NA 로 뺀 이유를 함께 남긴다.
     점수는 셋 다 똑같이 빠지지만, 몇 달 뒤에 「본사가 안 고쳐준 것」과 「원래 없는 시설」을
     구별할 수 있어야 한다. 종전에는 둘 다 그냥 'NA' 라 영영 가릴 수 없었다.
     기본값은 '해당 없음' 이다 — 지금까지 쓰던 대로 NA 만 눌러도 동작이 같다. */
  const NA_WHY = ['해당 없음', '본사 대기', '확인 불가'];
  const NA_WHY_TIP = {
    '해당 없음': '그 매장에 시설·업무가 없습니다',
    '본사 대기': '매장 권한 밖입니다 — 본사에 요청해 둔 것입니다',
    '확인 불가': '증빙·상황이 없어 확인하지 못했습니다',
  };
  const state = { values: {}, memos: {}, photos: {}, naWhy: {} };
  const allItems = [];
  master.qsc_groups.forEach(function (g) { g.items.forEach(function (it) { it.group = shortName(g.name); allItems.push(it); }); });
  // 안전장치: 심각도 정보가 없으면 구버전 데이터가 캐시된 것 — 잘못된 감점(중대 −1점)을 막는다
  if (!allItems.some(function (it) { return it.severity; })) {
    alert('평가표 데이터가 구버전입니다.\n인터넷이 연결된 상태에서 앱을 완전히 닫았다가 다시 열어 주세요.');
  }
  // 감점식: 전 문항 0건(이상 없음)에서 시작 — 개선 필요한 것만 입력하면 됨
  allItems.forEach(function (it) { state.values[it.no] = 0; });
  const updaters = {};
  const cardEls = {};
  let photoTarget = null;
  /* 사진 임시저장(IndexedDB)이 이 기기에서 살아 있는가.
     사생활 보호 모드·용량 초과처럼 못 쓰는 기기가 있어, 되는 곳에서만 켠다.
     qsc.html의 뒤로가기 확인창도 이 값을 보고 문구를 고른다(window.QscPhotoDraft). */
  let photoDraftOn = false;
  window.QscPhotoDraft = { on: false };
  function setPhotoDraft(on) { photoDraftOn = on; window.QscPhotoDraft.on = on; }

  function sevLabel(sev) { return sev === 'S1' ? '★★' : sev === 'S2' ? '★' : ''; }

  $('#resetBtn').onclick = function () {
    if (!confirm('모든 입력(건수·사진·비고)을 지우고 새 점검을 시작할까요?')) return;
    localStorage.removeItem(DRAFT_KEY);
    /* 사진도 지운다. ★다만 붙잡고 기다리지 않는다★ — reload가 트랜잭션을 끊어도
       다음 실행의 초기화 블록이 '임시저장이 없으면 사진도 비운다'로 마무리해 준다.
       기다리게 만들면 IndexedDB가 막힌 기기에서 [초기화]가 영영 안 되는 쪽이 더 나쁘다. */
    PhotoDraft.clear().catch(function () { /* 아래 초기화 블록이 마무리한다 */ });
    location.reload();
  };

  $('#verInfo').textContent = '평가표 ' + master.version + ' 기준';
  if ($('#wLine')) {
    const R = Scoring.RULES;
    $('#wLine').textContent = '감점: 일반 1건 −' + R.general.per +
      ' · ★ 문항당 −' + R.S2.first + '(추가 −' + R.S2.more + ', 상한 ' + R.S2.cap + ')' +
      ' · ★★ 문항당 −' + R.S1.first + '(추가 −' + R.S1.more + ', 상한 ' + R.S1.cap + ') / ';
  }
  // 방문 시간(시·분) 드롭다운 — 쇼퍼 화면과 같은 부품(js/ui-time.js)
  $('#timeBox').innerHTML = TimePick.html('time');

  /* 매장 목록: 연동 후엔 통합시트 실시간(숨김 제외) > 오프라인 캐시 > master.json 저장본 순.
     ★서버를 기다리지 않는다★ (2026-08-26) — 종전에는 여기서 await 하는 바람에 74문항 렌더도
     임시저장 복원도 전부 그 뒤로 밀렸다. 앱스 스크립트 왕복이 2초, 콜드 스타트면 11초라
     화면을 열 때마다 그만큼 빈 화면을 보고 있어야 했다.
     api.js가 마지막 성공본을 'qsc-live-config'에 넣어 두므로 그걸로 즉시 다 그려 놓고,
     서버 응답은 배경에서 받아 목록만 갈아 끼운다(같은 키를 읽는다 — api.js와 짝). */
  let live = null;
  try { live = JSON.parse(localStorage.getItem('qsc-live-config') || 'null'); } catch (e) { live = null; }
  // 임시저장에서 되살린 매장이 캐시 목록엔 없고 서버 목록에만 있을 때(신규 매장 + 낡은 캐시)를 위한 자리
  let pendingStore = '';
  const storeSel = $('#store');
  const storeHead = storeSel.firstElementChild; // '매장 선택' 안내 옵션 — 재구성해도 이 줄은 살려 둔다
  function storeList(cfg) {
    return (cfg && cfg.stores && cfg.stores.length) ? cfg.stores : (master.stores || []);
  }
  /* 갱신은 ★전면 재구성 + 선택값 재적용★ 으로만 한다.
     append로 덧붙이면 캐시본과 서버본이 겹쳐 같은 매장이 두 번 보이고,
     선택값을 되돌려 놓지 않으면 select가 ''로 리셋된 채 아무 입력이나 일어나는 순간
     saveDraft가 draft.store를 빈 값으로 덮어쓴다 — 작성 중인 점검이 매장 없이 남는 사고다. */
  function renderStores() {
    const keep = storeSel.value || pendingStore;
    storeSel.innerHTML = '';
    if (storeHead) storeSel.appendChild(storeHead);
    storeList(live).forEach(function (s) {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      storeSel.appendChild(o);
    });
    if (keep) storeSel.value = keep; // 목록에 없으면 ''이 된다(= 아직 못 찾음)
    /* 제자리를 찾았으면 구조용 값은 버리고, ★못 찾았으면 계속 들고 간다★.
       되살린 매장뿐 아니라 '이미 골라 둔 매장이 서버 목록에서 빠진' 경우(통합시트에서 숨김
       처리된 매장)에도 select가 ''로 비는데, 그때 이름을 놓아 버리면 바로 다음 saveDraft가
       draft.store를 빈 값으로 덮어쓴다 — 작성 중이던 점검이 매장 없이 남는 그 사고다. */
    pendingStore = storeSel.value ? '' : keep;
  }
  renderStores();
  // 배경 갱신 — 이 응답이 도착할 때는 문항 렌더도 임시저장 복원도 이미 끝나 있다
  Api.getConfig().then(function (cfg) {
    // 서버 주소가 없거나(연동 전) 서버·캐시 어느 쪽도 못 읽은 경우 — 지금 그려 둔 목록을 그대로 둔다
    if (!cfg) return;
    const before = JSON.stringify(storeList(live));
    live = cfg; // naPresetFor는 부를 때마다 live를 보므로 NA 프리셋도 이걸로 최신이 된다
    // 목록이 그대로면 손대지 않는다 — 마침 드롭다운을 열어 놓고 고르는 중일 수 있다
    if (JSON.stringify(storeList(live)) !== before) renderStores();
  }).catch(function (e) {
    /* getConfig는 실패해도 캐시본을 돌려주게 돼 있어 여기까지 오는 것은 예외적이다.
       그래도 경고창은 띄우지 않는다 — 매장 목록은 캐시본이 살아 있어 점검 작성에 지장이 없고,
       작성 중에 뜨는 팝업은 점장이 할 수 있는 조치가 없으면서 입력만 끊는다.
       (진짜 못 쓰는 상황이면 제출 단계에서 서버 문구로 드러난다) */
    console.warn('[qsc] 매장 목록 갱신 실패 — 캐시 목록으로 계속합니다', e);
  });

  // 매장별 NA 자동 기억: 서버(지난 회차, 연동 후) > 이 기기 기억 순으로 제안
  const NA_KEY = 'qsc-na-preset';
  function localNaPresets() {
    try { return JSON.parse(localStorage.getItem(NA_KEY) || '{}'); } catch (e) { return {}; }
  }
  function naPresetFor(store) {
    const fromLive = live && live.naPresets && live.naPresets[store];
    if (fromLive && fromLive.length) return fromLive;
    return localNaPresets()[store] || [];
  }
  $('#store').addEventListener('change', function () {
    const store = $('#store').value;
    if (!store) return;
    const preset = naPresetFor(store).filter(function (no) { return updaters[no] && state.values[no] !== 'NA'; });
    if (!preset.length) return;
    if (confirm(store + '\n지난 회차에 NA(해당 없음)였던 ' + preset.length + '개 문항을 이번에도 NA로 적용할까요?\n문항 번호: ' + preset.join(', '))) {
      /* ★프리셋은 '해당 없음' 만 기억한다★ (2026-08-27 담당자: "1만해")
         '본사 대기' 는 본사가 고치면 없어지고, '확인 불가' 는 그때뿐이다.
         자동으로 다시 제안하면 「본사가 아직인가?」를 안 보고 넘기게 된다. */
      preset.forEach(function (no) {
        state.values[no] = 'NA';
        state.naWhy[no] = NA_WHY[0];
        updaters[no]();
      });
      recompute();
      saveDraft();
    }
  });

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function shortName(name) {
    const m = name.match(/\(([^)]+)\)/);
    if (name.indexOf('매장 위생') === 0 && m) return m[1];
    return name.replace(/\s*\([^)]*\)/, '');
  }

  // ---------- 임시저장 ----------
  function saveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      /* store에 pendingStore를 겹쳐 두는 이유 (2026-08-26): 서버 목록이 도착하기 전에는
         되살린 매장이 드롭다운에 없어 select가 ''일 수 있다. 그 몇 초 사이에 비고 한 글자만
         쳐도 이 함수가 돌면서 저장해 둔 매장명을 빈 값으로 지워 버린다 — 되살릴 값을 잃는 것이
         가장 비싼 사고이므로, 아직 못 찾은 매장명은 그대로 들고 간다. */
      store: $('#store').value || pendingStore, date: $('#date').value, time: TimePick.get('time'),
      inspector: $('#inspector').value,
      values: state.values, memos: state.memos, naWhy: state.naWhy, t: Date.now(),
    }));
    $('#saveNote').textContent = '이 기기에 자동 임시저장됨 ' +
      (photoDraftOn ? '(사진 포함)' : '(사진 제외)') + ' · ' + new Date().toLocaleTimeString('ko-KR');
  }
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
  }

  /* ---------- 사진 임시저장 (IndexedDB) ---------- (2026-08-26 추가)
     ★사진만 임시저장에서 빠져 있었다★ — 장당 약 180KB(js/ui-photo.js)라 localStorage 5MB로는
       몇 장도 담을 수 없었다. 그래서 화면을 떠나거나, iOS가 메모리 압박으로 탭을 되살리거나
       (카메라 앱을 오갈 때 흔하다), 실수로 뒤로가기를 통과하면 문항 답과 비고는 남는데
       그날 찍은 사진만 통째로 사라졌다. IndexedDB에는 그 용량 한도가 없어 사진만 여기로 옮긴다.

     ★그래도 정본은 localStorage 임시저장이다★ — 비우는 타이밍 때문이다.
       [초기화]와 제출 후 초기화는 localStorage를 지우고 곧바로 location.reload()를 부르는데,
       비동기 IndexedDB 삭제를 reload 직전에 던지면 트랜잭션이 중간에 끊겨 사진이 살아남을 수 있다.
       그러면 지난 회차 사진이 다음 점검에 되살아나 그대로 제출되는, 되돌릴 수 없는 사고가 된다.
       그래서 지우기를 붙잡고 기다리는 대신 ★들어올 때 판정한다★ — 이 파일 맨 아래 초기화 블록의
       '임시저장이 없으면 IndexedDB도 비운다'가 마지막 관문이다.

     모든 작업은 한 줄(queue)로 세운다 — 들어오자마자 던진 비우기가 그 뒤에 찍은 사진을
     지워 버리는 순서 사고를 없앤다. */
  const PhotoDraft = (function () {
    const DB_NAME = 'qsc-photo-draft';
    const STORE = 'qsc';        // 화면별로 스토어를 나눠 둔다(매장 개선보고가 들어와도 섞이지 않게)
    let dbp = null;
    let queue = Promise.resolve();

    function usable() {
      try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (e) { return false; }
    }
    function open() {
      if (dbp) return dbp;
      const p = new Promise(function (resolve, reject) {
        let req;
        try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return reject(e); }
        req.onupgradeneeded = function () {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('IndexedDB 열기 실패')); };
        req.onblocked = function () { reject(new Error('IndexedDB 잠김')); };
      });
      /* 한 번 실패한 약속을 계속 물려주면 그 뒤 시도가 전부 같은 이유로 죽는다 — 다음엔 다시 연다. */
      p.catch(function () { if (dbp === p) dbp = null; });
      dbp = p;
      return p;
    }
    function work(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          let t;
          try { t = db.transaction(STORE, mode); } catch (e) { return reject(e); }
          let out = null;
          t.oncomplete = function () { resolve(out); };
          t.onerror = function () { reject(t.error || new Error('IndexedDB 오류')); };
          t.onabort = function () { reject(t.error || new Error('IndexedDB 중단')); };
          // 두 번째 인자로 받은 함수에 결과를 넘기면 oncomplete가 그것을 돌려준다
          try { fn(t.objectStore(STORE), function (v) { out = v; }); } catch (e) { reject(e); }
        });
      });
    }
    function enq(fn) {
      const run = queue.then(fn, fn);
      queue = run.catch(function () { return null; });   // 한 번 실패해도 줄은 이어진다
      return run;
    }

    return {
      usable: usable,
      // 한 문항의 사진 전부를 그 자리에 맞춰 둔다 (빈 배열이면 그 자리를 지운다)
      put: function (no, list) {
        return enq(function () {
          return work('readwrite', function (s) {
            if (list && list.length) s.put(list.slice(), String(no));
            else s.delete(String(no));
          });
        });
      },
      // { 문항번호: [dataURL, …] }
      all: function () {
        return enq(function () {
          return work('readonly', function (s, done) {
            const out = {};
            const req = s.openCursor();
            req.onsuccess = function () {
              const c = req.result;
              if (!c) { done(out); return; }
              if (Array.isArray(c.value) && c.value.length) out[String(c.key)] = c.value.slice();
              c.continue();
            };
          });
        });
      },
      clear: function () {
        return enq(function () { return work('readwrite', function (s) { s.clear(); }); });
      },
    };
  })();

  /* 사진이 바뀔 때마다 그 문항 자리만 다시 써 둔다.
     실패하면 ★약속을 거둔다★ — '사진 포함'이라고 적어 둔 채 실제로는 저장이 안 되고 있는 것이
     가장 나쁘다. 대신 경고창은 띄우지 않는다(입력 중에 뜨는 팝업은 할 수 있는 조치가 없으면서
     입력만 끊는다 — 이 파일의 매장 목록 갱신 실패 처리와 같은 규칙). */
  function photoSave(no) {
    if (!photoDraftOn) return;
    PhotoDraft.put(no, state.photos[no]).catch(function (e) {
      setPhotoDraft(false);
      console.warn('[qsc] 사진 임시저장 실패 — 이번 회차는 사진이 저장되지 않습니다', e);
      $('#saveNote').textContent = '이 기기에 자동 임시저장됨 (사진은 저장하지 못했습니다) · ' +
        new Date().toLocaleTimeString('ko-KR');
    });
  }

  // ---------- 사진 ---------- (줄이기는 js/ui-photo.js의 공통 부품 — 매장 개선보고와 같은 규격)
  $('#photoInput').addEventListener('change', async function (e) {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (photoTarget == null || !files.length) return;
    /* 줄이기(shrink)는 await이라, 그 사이에 다른 문항의 [사진]을 누르면 photoTarget이 바뀐다.
       지금 값을 붙잡아 두지 않으면 사진이 엉뚱한 문항에 붙는다. */
    const no = photoTarget;
    for (const f of files) {
      const url = await PhotoPick.shrink(f);
      (state.photos[no] = state.photos[no] || []).push(url);
    }
    updaters[no]();
    photoSave(no);
    /* 사진만 붙이고 나가도 임시저장(정본)이 남게 한다 — 정본이 없으면 다음 실행에서
       사진도 함께 비워지므로, 사진이 있는데 정본이 없는 상태를 만들면 안 된다. */
    saveDraft();
  });

  // ---------- 문항 카드 ----------
  function buildItem(it) {
    const card = document.createElement('div');
    const sevCls = it.severity ? ' crit ' + it.severity.toLowerCase() : '';
    card.className = 'item' + sevCls;
    card.innerHTML =
      '<div class="q"><span class="no">' + (it.code || it.no) + '</span><span class="txt"></span>' +
      (it.severity ? '<span class="badge-crit ' + it.severity.toLowerCase() + '">' + sevLabel(it.severity) +
        (it.severity === 'S1' ? ' 즉시위해' : ' 중대운영') + '</span>' : '') + '</div>' +
      '<div class="controls">' +
      '<div class="seg"><button data-v="0">이상 없음</button><button data-v="NA">NA</button></div>' +
      '<div class="counter"><button class="minus">−</button><span class="cnt empty">–</span><button class="plus">＋</button><span class="cl">건</span></div>' +
      '</div>' +
      /* NA 사유 — NA 일 때만 보인다. 점수와는 무관하고 기록에만 남는다. */
      '<div class="naWhy" style="display:none"><div class="seg">' +
      NA_WHY.map(function (w) {
        return '<button data-w="' + w + '" title="' + NA_WHY_TIP[w] + '">' + w + '</button>';
      }).join('') + '</div></div>' +
      /* ★이 칸이 매장에 전달되는 유일한 글이다★ (2026-08-20) — 문항 본문·코드·심각도·건수는
         매장 시트에 가지 않는다. 그래서 이름이 '비고'가 아니라 '개선요청 내용'이다.
         건수를 1 이상 넣으면 제출 전에 반드시 채워야 한다(아래 submit 검사). */
      '<div class="meta-row"><span class="score-chip">미확인</span><input type="text" class="memo" placeholder="개선요청 내용 — 매장에 이 글만 전달됩니다"><button class="photoBtn">사진</button></div>' +
      '<div class="thumbs"></div>';
    $('.q .txt', card).textContent = it.text;

    function setValue(v) {
      state.values[it.no] = v;
      /* NA 로 들어가면 기본 사유를 넣고, NA 에서 나오면 지운다.
         ★기본값을 넣는 이유★ — 사유를 고르지 않으면 제출을 막는 방식은 74문항 화면에서
         너무 성가시다(NA 가 20개 넘는 매장도 있다). 흔한 경우를 기본으로 두고
         다른 경우에만 바꾸게 한다. */
      if (v === 'NA') { if (!state.naWhy[it.no]) state.naWhy[it.no] = NA_WHY[0]; }
      else if (state.naWhy[it.no]) delete state.naWhy[it.no];
      update();
      recompute();
      saveDraft();
    }
    card.querySelectorAll('.seg button').forEach(function (b) {
      b.onclick = function () {
        const cur = state.values[it.no];
        const v = b.dataset.v === 'NA' ? 'NA' : 0;
        // 켜져 있는 버튼을 다시 누르면 입력 해제(미확인), 아니면 해당 상태로 입력
        setValue(cur === v ? null : v);
      };
    });
    card.querySelectorAll('.naWhy button').forEach(function (b) {
      b.onclick = function () {
        state.naWhy[it.no] = b.dataset.w;
        update();
        saveDraft();
      };
    });
    $('.plus', card).onclick = function () {
      const v = state.values[it.no];
      setValue(typeof v === 'number' ? v + 1 : 1);
    };
    $('.minus', card).onclick = function () {
      const v = state.values[it.no];
      if (typeof v === 'number') { if (v > 0) setValue(v - 1); }
      else setValue(0); // NA·미확인에서 −를 누르면 기본 상태(0건)로 복귀
    };
    $('.cnt', card).onclick = function () {
      const cur = state.values[it.no];
      const inp = prompt('개선 필요 건수를 입력하세요', typeof cur === 'number' ? String(cur) : '0');
      if (inp == null) return;
      const n = parseInt(inp, 10);
      if (!isNaN(n) && n >= 0) setValue(n);
    };
    $('.photoBtn', card).onclick = function () {
      photoTarget = it.no;
      $('#photoInput').click();
    };
    $('.memo', card).addEventListener('input', function (e) {
      state.memos[it.no] = e.target.value;
      saveDraft();
    });

    function update() {
      const v = state.values[it.no] == null ? null : state.values[it.no];
      card.querySelectorAll('.seg button').forEach(function (b) {
        const on = (b.dataset.v === 'NA' && v === 'NA') || (b.dataset.v === '0' && v === 0);
        b.className = on ? (b.dataset.v === 'NA' ? 'on-na' : 'on-o') : '';
      });
      /* 사유 줄은 NA 일 때만 보인다 */
      const whyBox = $('.naWhy', card);
      if (whyBox) {
        whyBox.style.display = (v === 'NA') ? '' : 'none';
        const w = state.naWhy[it.no] || NA_WHY[0];
        card.querySelectorAll('.naWhy button').forEach(function (b) {
          b.className = (b.dataset.w === w) ? 'on-na' : '';
        });
      }
      const cnt = $('.cnt', card);
      if (typeof v === 'number') { cnt.textContent = v; cnt.className = v > 0 ? 'cnt hot' : 'cnt'; }
      else { cnt.textContent = '–'; cnt.className = 'cnt empty'; }
      const chip = $('.score-chip', card);
      const d = Scoring.itemDeduct(v, it.severity);
      if (d === null) { chip.textContent = '미확인'; chip.className = 'score-chip'; }
      else if (d === 'NA') { chip.textContent = 'NA 제외'; chip.className = 'score-chip s-na'; }
      else if (d === 0) { chip.textContent = '이상 없음'; chip.className = 'score-chip s-o'; }
      else {
        chip.textContent = (it.severity ? sevLabel(it.severity) + ' ' : '') + '−' + d + '점';
        chip.className = 'score-chip ' + (it.severity ? 's-x' : 's-d');
      }
      const memo = $('.memo', card);
      if (memo.value !== (state.memos[it.no] || '')) memo.value = state.memos[it.no] || '';
      const ph = state.photos[it.no] || [];
      const pbtn = $('.photoBtn', card);
      pbtn.textContent = ph.length ? '사진 ' + ph.length : '사진';
      // 개선 필요(1건 이상)인데 사진이 없으면 빨간 테두리로 촬영 유도 (추적성)
      /* 빨간 테두리 두 방향 (2026-08-26)
         ㆍ개선 필요인데 사진이 없다      → 촬영을 유도한다(추적성)
         ㆍ사진은 있는데 개선 필요가 아니다 → ★그 사진은 매장에 안 간다★. 제출도 막힌다.
           둘 다 '지금 이 칸이 어긋나 있다'는 같은 뜻이라 같은 표시를 쓴다. */
      const orphanPhoto = ph.length > 0 && !(typeof v === 'number' && v > 0);
      pbtn.className = 'photoBtn' + (ph.length ? ' has' : '') +
        ((typeof v === 'number' && v > 0 && !ph.length) || orphanPhoto ? ' need' : '');
      pbtn.title = orphanPhoto
        ? '개선 필요 건수가 없어 이 사진은 매장에 전달되지 않습니다 — 건수를 올리시거나 사진을 지워 주세요'
        : '';
      const thumbs = $('.thumbs', card);
      thumbs.innerHTML = '';
      ph.forEach(function (url, i) {
        const im = document.createElement('img');
        im.src = url;
        im.onclick = function () {
          if (!confirm('이 사진을 삭제할까요?')) return;
          ph.splice(i, 1);
          update();
          photoSave(it.no);   // 지운 것도 임시저장에 반영한다(안 하면 다시 들어올 때 되살아난다)
          saveDraft();
        };
        thumbs.appendChild(im);
      });
    }
    updaters[it.no] = update;
    update();
    return card;
  }

  // ---------- 그룹 렌더 ----------
  const gnav = $('#gnav');
  const groupsEl = $('#groups');
  master.qsc_groups.forEach(function (g, gi) {
    const a = document.createElement('a');
    a.href = '#g' + gi;
    a.id = 'nav' + gi;
    a.innerHTML = shortName(g.name) + ' <span class="n">0건</span>';
    gnav.appendChild(a);

    const sec = document.createElement('section');
    sec.className = 'group';
    sec.id = 'g' + gi;
    const head = document.createElement('div');
    head.className = 'ghead';
    head.innerHTML = '<h2>' + g.name + '</h2><span class="gstat" id="gstat' + gi + '">개선 필요 0건</span>';
    sec.appendChild(head);
    g.items.forEach(function (it) {
      const el = buildItem(it);
      cardEls[it.no] = el;
      sec.appendChild(el);
    });
    groupsEl.appendChild(sec);
  });
  const aSum = document.createElement('a');
  aSum.href = '#summary';
  aSum.textContent = '집계';
  gnav.appendChild(aSum);

  // ---------- 집계 ----------
  function evalNow() {
    return Scoring.evaluate(allItems.map(function (it) {
      return { severity: it.severity || '', value: state.values[it.no] == null ? null : state.values[it.no] };
    }));
  }
  function groupStats(items) {
    let cases = 0, deduct = 0, issue = 0;
    items.forEach(function (it) {
      const v = state.values[it.no];
      const d = Scoring.itemDeduct(v == null ? null : v, it.severity);
      if (typeof d === 'number' && d > 0) { deduct += d; issue++; cases += v; }
    });
    return { cases: cases, deduct: deduct, issue: issue };
  }
  function fmtM(n) { return n > 0 ? '−' + n : '0'; }
  /* 하단 바의 실시간 감점 표시 — ★심각도별로 나눠 보여준다★ (2026-08-20)
     종전에는 '개선 필요 6건'이라고 한 덩어리로만 보여서, 그 6건이 일반인지 중대인지 알 수 없었다.
     점검 중에 가장 알고 싶은 것은 '중대가 걸렸는가'이므로 ★·★★는 색으로도 구분한다.
     상한에 닿으면 그 표시도 붙인다 — 안 붙이면 한 건 더 넣어도 숫자가 안 움직여 점검자가 헷갈린다. */
  function progHtml(res) {
    const R = Scoring.RULES;
    const seg = [];
    const tier = function (t, label) {
      if (!t.cases) return;
      seg.push('<span class="bb-crit">' + label + ' ' + t.cases + '건 −' + t.capped +
        (t.capHit ? ' 상한' : '') + '</span>');
    };
    seg.push('일반 ' + res.genCases + '건' + (res.genDeduct ? ' −' + res.genDeduct : ''));
    tier(res.s2, R.S2.label);
    tier(res.s1, R.S1.label);
    if (res.na) seg.push('NA ' + res.na);
    if (res.blank) seg.push('미확인 ' + res.blank);
    return seg.join(' · ');
  }


  function recompute() {
    const res = evalNow();
    master.qsc_groups.forEach(function (g, gi) {
      const st = groupStats(g.items);
      $('#gstat' + gi).innerHTML = '개선 필요 ' + st.cases + '건' +
        (st.deduct ? ' · <span class="gscore">감점 ' + st.deduct + '</span>' : '');
      $('#nav' + gi + ' .n').textContent = st.cases + '건';
    });
    $('#bbScore').textContent = res.qsc == null ? '—' : 'QSC ' + res.qsc.toFixed(1) + '점';
    $('#bbGrade').textContent = res.qsc == null ? '' : (res.grade || '');
    $('#bbProg').innerHTML = progHtml(res);
    renderSummary(res);
  }

  /* 하단 결과 요약: 엑셀 '항목별 집계' 블록과 같은 구성 (감점 3층 + QSC + 중대 차감) + 개선 필요 목록
     ★2026-08-18★ 중대 차감이 QSC 점수 안으로 들어왔다. 마지막 줄은 이제 '또 빠질 점수'가 아니라
     '이미 빠진 내역'이다 — 문구를 그대로 두면 점검자가 두 번 빠지는 것으로 읽는다. */
  function renderSummary(res) {
    const body = $('#sumBody');
    body.innerHTML = '';
    const R = Scoring.RULES;
    const rows = [
      ['일반 문항 감점 (1건 = −' + R.general.per + '점)',
        res.genItems + '문항 / ' + res.genCases + '건', fmtM(res.genDeduct)],
      ['★ 중대운영 (문항당 −' + R.S2.first + ' · 추가 건당 −' + R.S2.more + ' · 상한 −' + R.S2.cap + ')',
        res.s2.items + '문항 / ' + res.s2.cases + '건' + (res.s2.capHit ? ' · 상한 도달(원값 ' + res.s2.raw + ')' : ''),
        fmtM(res.s2.capped)],
      ['★★ 즉시위해 (문항당 −' + R.S1.first + ' · 추가 건당 −' + R.S1.more + ' · 상한 −' + R.S1.cap + ')',
        res.s1.items + '문항 / ' + res.s1.cases + '건' + (res.s1.capHit ? ' · 상한 도달(원값 ' + res.s1.raw + ')' : ''),
        fmtM(res.s1.capped)],
      ['중대 차감 합계 — QSC 점수에 이미 반영됨', '★★ ' + res.s1.cases + '건 / ★ ' + res.s2.cases + '건' +
        (res.naCritical ? ' · ⚠NA ' + res.naCritical + '문항' : ''), fmtM(res.criticalDeduct)],
    ];
    rows.forEach(function (r, i) {
      const tr = document.createElement('tr');
      if (i === 3) tr.className = 'sum-crit';
      tr.innerHTML = '<td>' + r[0] + '</td><td class="r">' + r[1] + '</td><td class="r">' + r[2] + '</td>';
      body.appendChild(tr);
    });
    const ref = $('#refBody');
    if (ref) {
      ref.innerHTML = '';
      master.qsc_groups.forEach(function (g) {
        const st = groupStats(g.items);
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + shortName(g.name) + '</td>' +
          '<td class="r">' + fmtM(st.deduct) + '</td>' +
          '<td class="r">' + g.items.length + '</td>' +
          '<td class="r">' + st.cases + '건</td>';
        ref.appendChild(tr);
      });
    }
    $('#sumFinal').innerHTML = res.qsc == null
      ? 'QSC — <span style="font-size:12px;color:var(--sub)">(미확인 ' + res.blank + '건 — 전 문항 확인 후 산출)</span>'
      : 'QSC <b>' + res.qsc.toFixed(1) + '점</b> · <b>' + (res.grade || '') + '</b>' +
        (res.criticalDeduct ? ' <span style="font-size:12px;color:var(--sub)">중대 ' + res.criticalDeduct + '점이 위 점수에 이미 빠져 있습니다</span>' : '');

    const list = $('#offList');
    list.innerHTML = '';
    const off = allItems.filter(function (it) {
      const v = state.values[it.no];
      return typeof v === 'number' && v > 0;
    });
    if (!off.length) {
      list.innerHTML = '<div class="offRow none">개선 필요 없음</div>';
    } else {
      off.forEach(function (it) {
        const v = state.values[it.no];
        const d = Scoring.itemDeduct(v, it.severity);
        const ph = (state.photos[it.no] || []).length;
        const row = document.createElement('div');
        row.className = 'offRow' + (it.severity ? ' crit' : '');
        row.innerHTML = '<span class="no">' + (it.code || it.no) + '</span><span class="t"></span><span class="v">' +
          v + '건 · −' + d + '점' + (ph ? ' · 사진 ' + ph : '') + '</span>';
        $('.t', row).textContent = (it.severity ? '[' + sevLabel(it.severity) + '] ' : '') + it.text;
        row.onclick = function () {
          if (cardEls[it.no]) cardEls[it.no].scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        list.appendChild(row);
      });
    }
    const na = allItems.filter(function (it) { return state.values[it.no] === 'NA'; });
    if (na.length) {
      const naRow = document.createElement('div');
      naRow.className = 'offRow na';
      naRow.textContent = 'NA 제외 문항: ' + na.map(function (it) { return it.code || it.no; }).join(', ');
      list.appendChild(naRow);
    }
  }

  // ---------- 제출 ----------
  $('#submitBtn').onclick = async function () {
    if (!$('#store').value.trim()) { alert('매장을 선택해 주세요.'); $('#store').focus(); return; }
    if (!$('#inspector').value.trim()) { alert('점검자를 입력해 주세요.'); $('#inspector').focus(); return; }
    // 완료 게이트: 미확인 문항이 있으면 제출 불가 — 전 문항 확인 또는 NA 처리 필수
    const res0 = evalNow();
    if (res0.blank > 0) {
      alert('미확인 문항이 ' + res0.blank + '개 있습니다.\n모든 문항을 확인해 주세요. (해당 없는 문항은 NA)');
      return;
    }
    /* ★개선 필요 건이 있는 문항은 개선요청 문장이 있어야 한다★ (2026-08-20 사용자 결정)
       매장 시트에는 문항 본문이 가지 않는다. 이 문장이 비면 매장은 사진만 받고
       무엇을 고쳐야 하는지 알 길이 없다 — 그래서 제출을 막는다. */
    const noText = allItems.filter(function (it) {
      const v = state.values[it.no];
      return typeof v === 'number' && v >= 1 && !String(state.memos[it.no] || '').trim();
    });
    if (noText.length) {
      alert('개선요청 내용을 적지 않은 문항이 ' + noText.length + '개 있습니다.\n\n' +
        noText.slice(0, 6).map(function (it) { return '· ' + (it.code ? it.code + ' ' : '') + it.text; }).join('\n') +
        (noText.length > 6 ? '\n· 외 ' + (noText.length - 6) + '개' : '') +
        '\n\n매장에는 이 글만 전달됩니다. 무엇을 어떻게 고쳐야 하는지 적어 주세요.');
      const card = cardEls[noText[0].no];
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const box = card.querySelector('.memo');
        if (box) box.focus();
      }
      return;
    }

    /* ★사진이 있는데 개선요청이 없는 문항은 제출을 막는다★ (2026-08-26 담당자 결정)
       반대(개선요청은 있는데 사진이 없는 것)는 허용한다 — 사진을 못 찍는 지적도 있다.
       ★막는 이유는 그 사진이 갈 곳이 없어서다★ — 개선요청 표는 '1건 이상'인 문항만 만든다.
         그래서 이 상태로 내면 사진은 드라이브에 올라가고 QSC_상세에 기록만 되고
         ★매장에는 아무것도 안 간다★. 찍은 사람은 전달된 줄 알고, 매장은 받은 적이 없다 —
         이 앱이 가장 싫어하는 '조용한 실패'다.
       건수를 대신 올려 주지 않는다 — 점수를 앱이 몰래 바꾸는 셈이 된다. 사람이 정해야 한다. */
    const orphan = allItems.filter(function (it) {
      const v = state.values[it.no];
      return (state.photos[it.no] || []).length > 0 && !(typeof v === 'number' && v >= 1);
    });
    if (orphan.length) {
      alert('사진은 붙였는데 개선 필요 건수가 없는 문항이 ' + orphan.length + '개 있습니다.\n\n' +
        orphan.slice(0, 6).map(function (it) {
          const v = state.values[it.no];
          const st = (v === 'NA') ? 'NA' : (v === 0 ? '이상 없음' : '미확인');
          return '· ' + (it.code ? it.code + ' ' : '') + it.text + '  (' + st + ' · 사진 ' +
            (state.photos[it.no] || []).length + '장)';
        }).join('\n') +
        (orphan.length > 6 ? '\n· 외 ' + (orphan.length - 6) + '개' : '') +
        '\n\n이대로 내면 그 사진은 매장에 전달되지 않습니다.\n' +
        '개선 필요 건수를 1 이상으로 올리시거나, 사진을 지워 주세요.');
      const card = cardEls[orphan[0].no];
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const res = res0;
    let msg = '개선 필요 ' + (res.genCases + res.s1.cases + res.s2.cases) + '건 · NA ' + res.na + '개' +
      '\nQSC ' + res.qsc.toFixed(1) + '점 · ' + res.grade;
    if (res.criticalDeduct) msg += '\n중대 차감 ' + res.criticalDeduct + '점 (위 QSC 점수에 이미 반영)';
    if (!confirm(msg + '\n제출할까요?')) return;
    const payload = {
      store: $('#store').value.trim(), date: $('#date').value, time: TimePick.get('time'),
      inspector: $('#inspector').value.trim(),
      submittedAt: new Date().toISOString(),
      result: {
        final: res.qsc, qsc: res.qsc, grade: res.grade,
        criticalDeduct: res.criticalDeduct, genDeduct: res.genDeduct,
        s1: { items: res.s1.items, cases: res.s1.cases, deduct: res.s1.capped },
        s2: { items: res.s2.items, cases: res.s2.cases, deduct: res.s2.capped },
      },
      items: allItems.map(function (it) {
        const v = state.values[it.no] == null ? null : state.values[it.no];
        const d = Scoring.itemDeduct(v, it.severity);
        return {
          no: it.no, code: it.code || '', row: it.row, text: it.text,
          severity: it.severity || '', critical: !!it.severity, group: it.group,
          value: v, deduct: typeof d === 'number' ? d : null,
          rating: v === 'NA' ? 'NA' : (typeof v === 'number' ? (v === 0 ? '이상 없음' : v + '건') : ''),
          score: typeof d === 'number' ? -d : null,
          naWhy: v === 'NA' ? (state.naWhy[it.no] || NA_WHY[0]) : '',
          memo: state.memos[it.no] || '', photos: state.photos[it.no] || [],
        };
      }),
    };
    const btn = $('#submitBtn');
    btn.disabled = true; btn.textContent = '저장 중…';
    try {
      let r = await Api.submit('qsc', payload);
      /* ★이미 낸 날짜면 서버가 멈추고 되묻는다★ (2026-08-26) — 종전에는 아무 말 없이 덮어썼다.
         하루에 여러 매장을 도는 날 매장을 잘못 고르면 멀쩡한 매장 자료가 그대로 사라졌다.
         ★매장 확인을 먼저 권하는 문구를 넣는다★ — '덮어쓸까요?'만 물으면 사람은 그냥 예를 누른다. */
      if (r && !r.ok && r.code === 'CONFLICT' && r.existing) {
        if (!Api.askOverwrite(payload.store, r.existing, r.storeWrote)) {
          btn.disabled = false; btn.textContent = '제출';
          return;   // 작성한 내용은 그대로 남는다 — 매장만 다시 고르면 된다
        }
        btn.textContent = '앞 제출을 정리하는 중…';
        payload.overwrite = true;
        r = await Api.submit('qsc', payload);
      }
      if (r.ok) {
        // 이번 회차의 NA 목록을 이 매장 프리셋으로 기억 (다음 회차에 자동 제안)
        const presets = localNaPresets();
        presets[payload.store] = allItems
          .filter(function (it) { return state.values[it.no] === 'NA'; })
          .map(function (it) { return it.no; });
        localStorage.setItem(NA_KEY, JSON.stringify(presets));
        let done = '저장 완료' + (r.mock ? ' (모의 저장 — 구글 연동 전)' : '') +
          '\nQSC ' + res.qsc.toFixed(1) + '점 · ' + res.grade +
          (res.criticalDeduct ? ' · 중대 차감 ' + res.criticalDeduct + '점 반영됨' : '');
        // 통합시트에 자동 기입하지 않는 운영(개인 계정 스크립트)에서는 옮겨 적을 숫자를 바로 알려준다
        if (r.dashboard && r.dashboard.skipped) {
          done += '\n\n▶ 통합시트 위생 칸에 입력\n   ' + res.qsc.toFixed(1) + '%';
        }
        /* ★매장 파일 기록 결과를 반드시 사람에게 보인다★ (2026-08-18)
           서버는 덮어쓰기·잘림·거절을 storeFile에 담아 보내는데 화면이 읽지 않고 있었다.
           '저장 완료'만 뜨면 점검자는 다 들어간 줄 안다 — 조용한 실패가 가장 나쁘다. */
        /* ★앞 제출을 정리하며 한 일을 반드시 보인다★ (2026-08-27) — 덮어쓰기로 저장한 경우
           서버가 undone 에 그 목록을 담아 준다. ★가 붙은 줄은 사람이 손으로 마무리해야 하는 것이다. */
        if (r.undone && r.undone.length) {
          const star = r.undone.filter(function (t) { return String(t).indexOf('★') >= 0; });
          done += '\n\n[앞 제출을 정리했습니다]';
          (star.length ? star : r.undone).forEach(function (t) { done += '\n   · ' + t; });
          if (star.length) done += '\n   ★ 표시가 있는 줄은 손으로 마무리해 주세요.';
        }
        const sf = r.storeFile;
        /* ★밸브가 잠겨 있으면 반드시 말한다★ (2026-08-26)
           종전에는 서버가 {ok:true, skipped:true}를 보내는데 화면이 ok만 보고 넘어갔다.
           그래서 매장 파일에 한 줄도 안 들어간 제출이 그냥 '저장 완료'로 끝났다 —
           스위치 세 개가 다 ★기본값 꺼짐★이라, 속성이 비기만 해도 그 상태가 된다.
           이 화면이 가장 싫어하는 '조용한 실패'라, ok:true여도 skipped면 크게 적는다. */
        if (sf && sf.skipped) {
          done += '\n\n★매장 파일에는 기록하지 않았습니다★' +
            '\n   ' + (sf.note || '매장 파일 쓰기가 꺼져 있습니다') +
            '\n   점수도 개선요청도 매장에 전달되지 않았습니다.' +
            '\n   담당자에게 확인해 주세요.';
        } else if (sf && sf.ok === false) {
          done += '\n\n⚠ 매장 파일에는 기록하지 못했습니다\n   ' + (sf.error || '알 수 없는 이유');
        } else if (sf && sf.warn && sf.warn.length) {
          done += '\n\n· ' + sf.warn.join('\n· ');
        }
        alert(done);
        if (confirm('입력을 초기화할까요? (새 점검 시작)')) {
          localStorage.removeItem(DRAFT_KEY);
          PhotoDraft.clear().catch(function () { /* 아래 초기화 블록이 마무리한다 */ });
          location.reload();
        }
      } else alert('저장 실패: ' + (r.error || '알 수 없는 오류'));
    } catch (e) { alert('저장 실패: ' + e.message); }
    btn.disabled = false; btn.textContent = '제출';
  };

  ['store', 'date', 'inspector'].forEach(function (id) {
    $('#' + id).addEventListener('input', saveDraft);
  });

  /* ★매장·날짜를 고르는 순간 '이번 달에 이미 있나'를 배경에서 물어본다★ (2026-08-26)
     74문항을 채우시는 동안 답이 오므로 제출할 때 더 기다릴 것이 없다.
     안내일 뿐이고 ★판정은 제출 순간에 서버가★ 한다(guardResubmit). */
  const askDup = Api.watchDup($('#dupNote'), 'qsc.status',
    function () { return $('#store').value; },
    function () { return $('#date').value; });
  $('#store').addEventListener('change', askDup);
  $('#date').addEventListener('change', askDup);
  TimePick.onChange('time', saveDraft);

  // ---------- 초기화 ----------
  const draft = loadDraft();
  if (draft) {
    $('#store').value = draft.store || '';
    /* 캐시 목록에 없는 매장이면 위 한 줄로는 안 들어가고 select가 ''로 남는다(신규 매장 + 낡은 캐시).
       배경 갱신이 서버 목록을 가져오면 그때 다시 넣도록 이름을 들고 있는다. */
    if (draft.store && !$('#store').value) pendingStore = draft.store;
    $('#date').value = draft.date || todayStr();
    // 점검은 현장에서 바로 쓰므로 시간은 '지금'을 기본값으로 (임시저장이 있으면 그 값 유지)
    TimePick.set('time', draft.time || TimePick.now());
    $('#inspector').value = draft.inspector || '';
    Object.assign(state.values, draft.values || {});
    Object.assign(state.memos, draft.memos || {});
    Object.assign(state.naWhy, draft.naWhy || {});   // NA 사유도 되살린다
    allItems.forEach(function (it) { updaters[it.no](); });
    $('#saveNote').textContent = '임시저장 불러옴 (' + new Date(draft.t).toLocaleString('ko-KR') + ')';
  } else {
    $('#date').value = todayStr();
    TimePick.set('time', TimePick.now());
  }
  recompute();

  /* ---------- 사진 임시저장 되살리기 ----------
     ★정본(localStorage 임시저장)이 있을 때만 되살린다★. 정본이 없으면 남아 있는 사진을 비운다 —
     이것이 [초기화]·제출 후 초기화의 마지막 관문이다(위 PhotoDraft 주석 참조).
     reload가 삭제 트랜잭션을 끊고 지나가도 지난 회차 사진이 다음 점검에 되살아나지 않는다. */
  if (PhotoDraft.usable()) {
    setPhotoDraft(true);
    if (!draft) {
      PhotoDraft.clear().catch(function (e) {
        setPhotoDraft(false);
        console.warn('[qsc] 사진 임시저장을 비우지 못했습니다', e);
      });
    } else {
      PhotoDraft.all().then(function (map) {
        let n = 0;
        Object.keys(map).forEach(function (no) {
          if (!updaters[no]) return;   // 평가표가 바뀌어 사라진 문항 — 조용히 버린다
          /* 읽어 오는 사이에 사용자가 이미 그 문항에 사진을 붙였다면 그쪽이 최신이다.
             (읽기는 수십 ms라 실제로는 거의 못 겹치지만, 겹치는 순간 방금 찍은 사진이 사라진다) */
          if (state.photos[no] && state.photos[no].length) return;
          state.photos[no] = map[no];
          updaters[no]();
          n += map[no].length;
        });
        if (n) {
          $('#saveNote').textContent = '임시저장 불러옴 · 사진 ' + n + '장 포함 (' +
            new Date(draft.t).toLocaleString('ko-KR') + ')';
        }
      }).catch(function (e) {
        setPhotoDraft(false);
        console.warn('[qsc] 사진 임시저장을 읽지 못했습니다', e);
      });
    }
  }
})();
