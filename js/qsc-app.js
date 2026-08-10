/* QSC 점검 앱 화면 로직 (담당자용) */
(async function () {
  const master = await (await fetch('data/master.json')).json();
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const DRAFT_KEY = 'qsc-draft-v1';
  const state = { values: {}, memos: {}, photos: {} };
  const allItems = [];
  master.qsc_groups.forEach(function (g) { g.items.forEach(function (it) { it.group = shortName(g.name); allItems.push(it); }); });
  // 감점식: 전 문항 0건(○)에서 시작 — 적발된 것만 입력하면 됨
  allItems.forEach(function (it) { state.values[it.no] = 0; });
  const updaters = {};
  const cardEls = {};
  let photoTarget = null;

  $('#resetBtn').onclick = function () {
    if (!confirm('모든 입력(점수·사진·비고)을 지우고 새 점검을 시작할까요?')) return;
    localStorage.removeItem(DRAFT_KEY);
    location.reload();
  };

  $('#verInfo').textContent = '평가표 ' + master.version + ' 기준';
  // 매장 목록: 연동 후엔 통합시트 실시간(숨김 제외) > 오프라인 캐시 > master.json 저장본 순
  const live = await Api.getConfig();
  const stores = (live && live.stores && live.stores.length) ? live.stores : (master.stores || []);
  stores.forEach(function (s) {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    $('#store').appendChild(o);
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
    if (confirm(store + '\n지난 회차에 NA(평가 제외)였던 ' + preset.length + '개 문항을 이번에도 NA로 적용할까요?\n문항 번호: ' + preset.join(', '))) {
      preset.forEach(function (no) { state.values[no] = 'NA'; updaters[no](); });
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
      store: $('#store').value, date: $('#date').value, inspector: $('#inspector').value,
      values: state.values, memos: state.memos, t: Date.now(),
    }));
    $('#saveNote').textContent = '이 기기에 자동 임시저장됨 (사진 제외) · ' + new Date().toLocaleTimeString('ko-KR');
  }
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
  }

  // ---------- 사진 ----------
  async function shrink(file) {
    const img = await new Promise(function (ok, err) {
      const i = new Image();
      i.onload = function () { ok(i); };
      i.onerror = err;
      i.src = URL.createObjectURL(file);
    });
    const M = 1280;
    let w = img.width, h = img.height;
    if (Math.max(w, h) > M) { const k = M / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);
    return c.toDataURL('image/jpeg', 0.8);
  }
  $('#photoInput').addEventListener('change', async function (e) {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (photoTarget == null || !files.length) return;
    for (const f of files) {
      const url = await shrink(f);
      (state.photos[photoTarget] = state.photos[photoTarget] || []).push(url);
    }
    updaters[photoTarget]();
  });

  // ---------- 문항 카드 ----------
  function buildItem(it) {
    const card = document.createElement('div');
    card.className = 'item' + (it.critical ? ' crit' : '');
    const opts = it.critical ? ['○', 'X', 'NA'] : ['○', '△', 'X', 'NA'];
    const onCls = { '○': 'on-o', '△': 'on-d', 'X': 'on-x', 'NA': 'on-na' };
    card.innerHTML =
      '<div class="q"><span class="no">' + it.no + '</span><span class="txt"></span>' +
      (it.critical ? '<span class="badge-crit">중대</span>' : '') + '</div>' +
      '<div class="controls">' +
      '<div class="seg">' + opts.map(function (o) { return '<button data-v="' + o + '">' + o + '</button>'; }).join('') + '</div>' +
      '<div class="counter"><button class="minus">−</button><span class="cnt empty">–</span><button class="plus">＋</button><span class="cl">건</span></div>' +
      '</div>' +
      '<div class="meta-row"><span class="score-chip">미입력</span><input type="text" class="memo" placeholder="비고"><button class="photoBtn">사진</button></div>' +
      '<div class="thumbs"></div>';
    $('.q .txt', card).textContent = it.text;

    function setValue(v) {
      state.values[it.no] = v;
      update();
      recompute();
      saveDraft();
    }
    card.querySelectorAll('.seg button').forEach(function (b) {
      b.onclick = function () {
        const cur = state.values[it.no] == null ? null : state.values[it.no];
        const v = b.dataset.v;
        // 켜져 있는 판정(건수로 켜진 것 포함)을 다시 누르면 입력 해제, 아니면 해당 판정으로 입력
        if (cur === v || Scoring.itemRating(cur, it.critical) === v) setValue(null);
        else setValue(v);
      };
    });
    $('.plus', card).onclick = function () {
      const v = state.values[it.no];
      setValue(typeof v === 'number' ? v + 1 : 1);
    };
    $('.minus', card).onclick = function () {
      const v = state.values[it.no];
      if (typeof v === 'number') { if (v > 0) setValue(v - 1); }
      else setValue(0); // 문자·NA에서 −를 누르면 기본 상태(0건)로 복귀
    };
    $('.cnt', card).onclick = function () {
      const cur = state.values[it.no];
      const inp = prompt('적발 건수를 입력하세요', typeof cur === 'number' ? String(cur) : '0');
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
      const rate = Scoring.itemRating(v, it.critical);
      card.querySelectorAll('.seg button').forEach(function (b) {
        const on = v === b.dataset.v || rate === b.dataset.v;
        b.className = on ? onCls[b.dataset.v] : '';
      });
      const cnt = $('.cnt', card);
      if (typeof v === 'number') { cnt.textContent = v; cnt.className = 'cnt'; }
      else { cnt.textContent = '–'; cnt.className = 'cnt empty'; }
      const chip = $('.score-chip', card);
      const rating = Scoring.itemRating(v, it.critical);
      const score = Scoring.itemScore(v, it.critical);
      if (rating == null) { chip.textContent = '미입력'; chip.className = 'score-chip'; }
      else if (rating === 'NA') { chip.textContent = 'NA 제외'; chip.className = 'score-chip s-na'; }
      else {
        chip.textContent = rating + ' ' + (score >= 0 ? score : '−' + Math.abs(score)) + '점';
        chip.className = 'score-chip ' + (rating === '○' ? 's-o' : rating === '△' ? 's-d' : 's-x');
      }
      const memo = $('.memo', card);
      if (memo.value !== (state.memos[it.no] || '')) memo.value = state.memos[it.no] || '';
      const ph = state.photos[it.no] || [];
      const pbtn = $('.photoBtn', card);
      pbtn.textContent = ph.length ? '사진 ' + ph.length : '사진';
      // 적발(△/X)인데 사진이 없으면 빨간 테두리로 촬영 유도 (추적성)
      pbtn.className = 'photoBtn' + (ph.length ? ' has' : '') +
        ((rating === '△' || rating === 'X') && !ph.length ? ' need' : '');
      const thumbs = $('.thumbs', card);
      thumbs.innerHTML = '';
      ph.forEach(function (url, i) {
        const im = document.createElement('img');
        im.src = url;
        im.onclick = function () {
          if (confirm('이 사진을 삭제할까요?')) { ph.splice(i, 1); update(); }
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
    a.innerHTML = shortName(g.name) + ' <span class="n">적발 0</span>';
    gnav.appendChild(a);

    const sec = document.createElement('section');
    sec.className = 'group';
    sec.id = 'g' + gi;
    const head = document.createElement('div');
    head.className = 'ghead';
    head.innerHTML = '<h2>' + g.name + '</h2><span class="gstat" id="gstat' + gi + '">적발 0 · 100.0점</span>';
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
    const groups = master.qsc_groups.map(function (g) {
      return { items: g.items.map(function (it) { return { critical: it.critical, value: state.values[it.no] == null ? null : state.values[it.no] }; }) };
    });
    return Scoring.evaluate(groups);
  }
  function offenseIn(items) {
    return items.filter(function (it) {
      const v = state.values[it.no] == null ? null : state.values[it.no];
      const r = Scoring.itemRating(v, it.critical);
      return r === '△' || r === 'X';
    }).length;
  }
  function recompute() {
    const res = evalNow();
    res.groups.forEach(function (gr, gi) {
      const off = offenseIn(master.qsc_groups[gi].items);
      $('#gstat' + gi).innerHTML = '적발 ' + off + ' · ' +
        (gr.score == null ? '—' : '<span class="gscore">' + gr.score.toFixed(1) + '점</span>');
      $('#nav' + gi + ' .n').textContent = '적발 ' + off;
    });
    $('#bbScore').textContent = res.final == null ? '—' : res.final.toFixed(1) + '점';
    $('#bbGrade').textContent = res.grade || '';
    const off = offenseIn(allItems);
    const na = allItems.filter(function (it) { return state.values[it.no] === 'NA'; }).length;
    const blank = allItems.filter(function (it) { return state.values[it.no] == null; }).length;
    $('#bbProg').textContent = '적발 ' + off + '건 · NA ' + na + (blank ? ' · 미확인 ' + blank : '');
    renderSummary(res);
  }

  // 하단 결과 요약: 엑셀 '항목별 집계' 블록과 같은 구성 (점수·가중치·가중반영·최종·등급) + 적발 목록
  function renderSummary(res) {
    const body = $('#sumBody');
    body.innerHTML = '';
    res.groups.forEach(function (gr, gi) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + shortName(master.qsc_groups[gi].name) + '</td>' +
        '<td class="r">' + (gr.score == null ? '—' : gr.score.toFixed(1)) + '</td>' +
        '<td class="r">' + (gr.weight * 100).toFixed(1) + '%</td>' +
        '<td class="r">' + (gr.score == null ? '—' : (gr.score * gr.weight).toFixed(1)) + '</td>';
      body.appendChild(tr);
    });
    $('#sumFinal').innerHTML = res.final == null ? '최종 —' :
      '최종 <b>' + res.final.toFixed(1) + '점</b> · <b>' + (res.grade || '') + '</b>';

    const list = $('#offList');
    list.innerHTML = '';
    const off = allItems.filter(function (it) {
      const v = state.values[it.no] == null ? null : state.values[it.no];
      const r = Scoring.itemRating(v, it.critical);
      return r === '△' || r === 'X';
    });
    if (!off.length) {
      list.innerHTML = '<div class="offRow none">적발 없음</div>';
    } else {
      off.forEach(function (it) {
        const v = state.values[it.no];
        const r = Scoring.itemRating(v, it.critical);
        const s = Scoring.itemScore(v, it.critical);
        const ph = (state.photos[it.no] || []).length;
        const row = document.createElement('div');
        row.className = 'offRow' + (it.critical ? ' crit' : '');
        row.innerHTML = '<span class="no">' + it.no + '</span><span class="t"></span><span class="v">' +
          r + (typeof v === 'number' ? ' ' + v + '건' : '') + ' · ' +
          (s >= 0 ? s : '−' + Math.abs(s)) + '점' + (ph ? ' · 사진 ' + ph : '') + '</span>';
        $('.t', row).textContent = (it.critical ? '[중대] ' : '') + it.text;
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
      naRow.textContent = 'NA 제외 문항: ' + na.map(function (it) { return it.no; }).join(', ');
      list.appendChild(naRow);
    }
  }

  // ---------- 제출 ----------
  $('#submitBtn').onclick = async function () {
    if (!$('#store').value.trim()) { alert('매장을 선택해 주세요.'); $('#store').focus(); return; }
    const res = evalNow();
    const off = offenseIn(allItems);
    const naN = allItems.filter(function (it) { return state.values[it.no] === 'NA'; }).length;
    const blank = allItems.filter(function (it) { return state.values[it.no] == null; }).length;
    let msg = '적발 ' + off + '건 · NA ' + naN + '개' + (blank ? ' · 미확인 ' + blank + '개(채점 제외)' : '');
    if (res.final != null) msg += '\n최종 ' + res.final.toFixed(1) + '점 · ' + res.grade;
    if (!confirm(msg + '\n제출할까요?')) return;
    const payload = {
      store: $('#store').value.trim(), date: $('#date').value, inspector: $('#inspector').value.trim(),
      submittedAt: new Date().toISOString(),
      result: { final: res.final, grade: res.grade, groups: res.groups },
      items: allItems.map(function (it) {
        const v = state.values[it.no] == null ? null : state.values[it.no];
        return {
          no: it.no, row: it.row, text: it.text, critical: it.critical, group: it.group,
          value: v, rating: Scoring.itemRating(v, it.critical), score: Scoring.itemScore(v, it.critical),
          memo: state.memos[it.no] || '', photos: state.photos[it.no] || [],
        };
      }),
    };
    const btn = $('#submitBtn');
    btn.disabled = true; btn.textContent = '저장 중…';
    try {
      const r = await Api.submit('qsc', payload);
      if (r.ok) {
        // 이번 회차의 NA 목록을 이 매장 프리셋으로 기억 (다음 회차에 자동 제안)
        const presets = localNaPresets();
        presets[payload.store] = allItems
          .filter(function (it) { return state.values[it.no] === 'NA'; })
          .map(function (it) { return it.no; });
        localStorage.setItem(NA_KEY, JSON.stringify(presets));
        alert('저장 완료' + (r.mock ? ' (모의 저장 — 구글 연동 전)' : '') +
          (res.final != null ? '\n최종 ' + res.final.toFixed(1) + '점 · ' + res.grade : ''));
        if (confirm('입력을 초기화할까요? (새 점검 시작)')) {
          localStorage.removeItem(DRAFT_KEY);
          location.reload();
        }
      } else alert('저장 실패: ' + (r.error || '알 수 없는 오류'));
    } catch (e) { alert('저장 실패: ' + e.message); }
    btn.disabled = false; btn.textContent = '제출';
  };

  ['store', 'date', 'inspector'].forEach(function (id) {
    $('#' + id).addEventListener('input', saveDraft);
  });

  // ---------- 초기화 ----------
  const draft = loadDraft();
  if (draft) {
    $('#store').value = draft.store || '';
    $('#date').value = draft.date || todayStr();
    $('#inspector').value = draft.inspector || '';
    Object.assign(state.values, draft.values || {});
    Object.assign(state.memos, draft.memos || {});
    allItems.forEach(function (it) { updaters[it.no](); });
    $('#saveNote').textContent = '임시저장 불러옴 (' + new Date(draft.t).toLocaleString('ko-KR') + ')';
  } else {
    $('#date').value = todayStr();
  }
  recompute();
})();
