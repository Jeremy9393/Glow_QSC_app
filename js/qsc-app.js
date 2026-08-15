/* QSC 점검 앱 화면 로직 (담당자용) — v3.7 절대 감점제
   입력: 이상 없음 0 / 개선 필요 건수 / 해당 없음 NA
   ★(S2)·★★(S1)는 QSC 평균에 넣지 않고 차감액만 집계 → 대시보드 최종점수에서 차감 */
(async function () {
  // cache:'no-store' — 데이터 파일은 항상 서버 최신본 (오프라인이면 SW 캐시 폴백)
  const master = await (await fetch('data/master.json', { cache: 'no-store' })).json();
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const DRAFT_KEY = 'qsc-draft-v2';
  const state = { values: {}, memos: {}, photos: {} };
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

  function sevLabel(sev) { return sev === 'S1' ? '★★' : sev === 'S2' ? '★' : ''; }

  $('#resetBtn').onclick = function () {
    if (!confirm('모든 입력(건수·사진·비고)을 지우고 새 점검을 시작할까요?')) return;
    localStorage.removeItem(DRAFT_KEY);
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
    if (confirm(store + '\n지난 회차에 NA(해당 없음)였던 ' + preset.length + '개 문항을 이번에도 NA로 적용할까요?\n문항 번호: ' + preset.join(', '))) {
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
      store: $('#store').value, date: $('#date').value, time: TimePick.get('time'),
      inspector: $('#inspector').value,
      values: state.values, memos: state.memos, t: Date.now(),
    }));
    $('#saveNote').textContent = '이 기기에 자동 임시저장됨 (사진 제외) · ' + new Date().toLocaleTimeString('ko-KR');
  }
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
  }

  // ---------- 사진 ---------- (줄이기는 js/ui-photo.js의 공통 부품 — 쇼퍼 영수증과 같은 규격)
  $('#photoInput').addEventListener('change', async function (e) {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (photoTarget == null || !files.length) return;
    for (const f of files) {
      const url = await PhotoPick.shrink(f);
      (state.photos[photoTarget] = state.photos[photoTarget] || []).push(url);
    }
    updaters[photoTarget]();
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
      '<div class="meta-row"><span class="score-chip">미확인</span><input type="text" class="memo" placeholder="비고"><button class="photoBtn">사진</button></div>' +
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
        const cur = state.values[it.no];
        const v = b.dataset.v === 'NA' ? 'NA' : 0;
        // 켜져 있는 버튼을 다시 누르면 입력 해제(미확인), 아니면 해당 상태로 입력
        setValue(cur === v ? null : v);
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
      pbtn.className = 'photoBtn' + (ph.length ? ' has' : '') +
        (typeof v === 'number' && v > 0 && !ph.length ? ' need' : '');
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
  function recompute() {
    const res = evalNow();
    master.qsc_groups.forEach(function (g, gi) {
      const st = groupStats(g.items);
      $('#gstat' + gi).innerHTML = '개선 필요 ' + st.cases + '건' +
        (st.deduct ? ' · <span class="gscore">감점 ' + st.deduct + '</span>' : '');
      $('#nav' + gi + ' .n').textContent = st.cases + '건';
    });
    $('#bbScore').textContent = res.qsc == null ? '—' : 'QSC ' + res.qsc.toFixed(1) + '점';
    $('#bbGrade').innerHTML = res.qsc == null ? '' :
      (res.grade || '') + (res.criticalDeduct ? ' <span class="bb-crit">중대 −' + res.criticalDeduct + '점</span>' : '');
    $('#bbProg').textContent = '개선 필요 ' + (res.genCases + res.s1.cases + res.s2.cases) + '건 · NA ' + res.na +
      (res.blank ? ' · 미확인 ' + res.blank : '');
    renderSummary(res);
  }

  // 하단 결과 요약: 엑셀 '항목별 집계' 블록과 같은 구성 (감점 3층 + QSC + 중대 차감) + 개선 필요 목록
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
      ['중대 차감 합계 — 대시보드 최종점수에서 직접 차감', '★★ ' + res.s1.cases + '건 / ★ ' + res.s2.cases + '건' +
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
        (res.criticalDeduct ? ' <span style="font-size:12px;color:var(--sub)">최종점수에서 중대 ' + res.criticalDeduct + '점 추가 차감</span>' : '');

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
    const res = res0;
    let msg = '개선 필요 ' + (res.genCases + res.s1.cases + res.s2.cases) + '건 · NA ' + res.na + '개' +
      '\nQSC ' + res.qsc.toFixed(1) + '점 · ' + res.grade;
    if (res.criticalDeduct) msg += '\n중대 차감 ' + res.criticalDeduct + '점 (최종점수에서 차감)';
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
        let done = '저장 완료' + (r.mock ? ' (모의 저장 — 구글 연동 전)' : '') +
          '\nQSC ' + res.qsc.toFixed(1) + '점 · ' + res.grade +
          (res.criticalDeduct ? ' · 중대 차감 ' + res.criticalDeduct + '점' : '');
        // 통합시트에 자동 기입하지 않는 운영(개인 계정 스크립트)에서는 옮겨 적을 숫자를 바로 알려준다
        if (r.dashboard && r.dashboard.skipped) {
          done += '\n\n▶ 통합시트 위생 칸에 입력\n   ' + res.qsc.toFixed(1) + '%';
        }
        alert(done);
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
  TimePick.onChange('time', saveDraft);

  // ---------- 초기화 ----------
  const draft = loadDraft();
  if (draft) {
    $('#store').value = draft.store || '';
    $('#date').value = draft.date || todayStr();
    // 점검은 현장에서 바로 쓰므로 시간은 '지금'을 기본값으로 (임시저장이 있으면 그 값 유지)
    TimePick.set('time', draft.time || TimePick.now());
    $('#inspector').value = draft.inspector || '';
    Object.assign(state.values, draft.values || {});
    Object.assign(state.memos, draft.memos || {});
    allItems.forEach(function (it) { updaters[it.no](); });
    $('#saveNote').textContent = '임시저장 불러옴 (' + new Date(draft.t).toLocaleString('ko-KR') + ')';
  } else {
    $('#date').value = todayStr();
    TimePick.set('time', TimePick.now());
  }
  recompute();
})();
