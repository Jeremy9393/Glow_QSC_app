/* 관리자 도구 — 제출 되돌리기 · 쓰기 스위치 (2026-08-26)

   ★왜 이 화면이 생겼나★ — 두 기능 다 서버에는 있었지만 부를 자리가 브라우저 콘솔뿐이었다.
     되돌리기는 날짜를 외워서 정확히 타이핑해야 했고, 한 글자만 틀리면 0건으로 끝난다.
     그런데 그 응답('되돌릴 제출을 찾지 못했습니다')은 ★이미 지워졌다★로도 읽힌다 —
     급할 때 쓰는 도구가 가장 위험한 오해를 만드는 자리였다. 그래서 고르게 만든다.

   ★지우기 전에 반드시 보여 준다★ — admin.undoSubmit 은 apply 없이 부르면 계획만 돌려준다.
     이 화면은 그 계획을 화면에 그대로 펴 놓고, 사람이 한 번 더 누를 때만 apply:true 를 보낸다.
     확인창(confirm) 한 줄로 대신하지 않는 이유는 지울 항목이 여러 줄이기 때문이다 —
     읽지 않고 누르게 만드는 확인창은 없는 것만 못하다.

   권한은 서버가 정한다. admin.* 액션이 전부 menu:'accounts' 라 이 화면도 같은 열쇠를 쓴다
   (admin.html 의 Auth.guard('accounts')). 여기서 역할 이름을 비교하지 않는다. */
(async function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const KIND = { qsc: 'QSC 점검', shopper: '미스터리쇼퍼 · 고객 설문' };

  function setHtml(el, html) { el.innerHTML = html; }
  function note(text, cls) {
    const p = document.createElement('p');
    p.className = 'note' + (cls ? ' ' + cls : '');
    p.textContent = text;
    return p;
  }
  function list(el, lines, title) {
    const box = document.createElement('div');
    box.className = 'card inner';
    const h = document.createElement('p');
    h.className = 'f';
    h.textContent = title;
    box.appendChild(h);
    lines.forEach(function (t) {
      const d = document.createElement('div');
      d.className = 'planLine';
      d.textContent = '· ' + t;      // 서버 문자열 — 반드시 textContent
      box.appendChild(d);
    });
    el.appendChild(box);
    return box;
  }

  // ---------- 매장 목록 ----------
  const master = await (await fetch('data/master.json', { cache: 'no-store' })).json();
  const live = await Api.getConfig();
  const stores = (live && live.stores && live.stores.length) ? live.stores : (master.stores || []);
  stores.forEach(function (s) {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    $('#store').appendChild(o);
  });

  // ---------- 제출 목록 ----------
  const subList = $('#subList');
  const undoPlan = $('#undoPlan');

  $('#store').onchange = function () {
    setHtml(undoPlan, '');
    loadList($('#store').value);
  };

  async function loadList(store) {
    setHtml(subList, '');
    if (!store) return;
    subList.appendChild(note('제출 목록을 불러오는 중입니다…'));
    /* 날짜 없이 부르면 서버가 목록만 돌려준다(읽기만 한다 — 아무것도 지우지 않는다). */
    const r = await Api.call('admin.undoSubmit', { store: store }).catch(function () { return null; });
    setHtml(subList, '');
    if (!(r && r.ok)) {
      subList.appendChild(note('제출 목록을 불러오지 못했습니다. ' + ((r && r.error) || ''), 'mockNote'));
      return;
    }
    const items = r.items || [];
    if (!items.length) {
      subList.appendChild(note(store + ' — 되돌릴 제출이 없습니다.'));
      return;
    }

    /* ★같은 날 같은 종류가 두 건이면 그때만 시간까지 넘긴다★ — 시간을 넘기면 서버가
       NA프리셋 정리를 건너뛴다(그 회차만 지우는 뜻이라 그렇게 설계돼 있다).
       한 건뿐인데 굳이 시간을 넘겨서 정리를 덜 하게 만들 이유가 없다. */
    const dup = {};
    items.forEach(function (it) {
      const k = it.kind + '|' + it.date;
      dup[k] = (dup[k] || 0) + 1;
    });

    items.forEach(function (it) {
      const row = document.createElement('div');
      row.className = 'codeRow unused';
      row.innerHTML = '<span class="st">' + (it.kind === 'qsc' ? '📋' : '🛍') + '</span>' +
        '<span class="nm"></span><span class="info"></span>' +
        '<span class="act"><button class="miniBtn warn">되돌리기</button></span>';
      $('.nm', row).textContent = it.date;
      $('.info', row).textContent = KIND[it.kind] + (it.time ? ' · ' + it.time : '');
      $('button', row).onclick = function () {
        const many = dup[it.kind + '|' + it.date] > 1;
        preview(store, it, many ? it.time : '');
      };
      subList.appendChild(row);
    });
    subList.appendChild(note('되돌리려는 줄의 [되돌리기]를 누르면, 무엇을 지울지 먼저 보여 드립니다.'));
  }

  // ---------- 미리보기 → 실행 ----------
  async function preview(store, it, time) {
    setHtml(undoPlan, '');
    undoPlan.appendChild(note('확인하는 중입니다…'));
    const req = { store: store, date: it.date, kind: it.kind };
    if (time) req.time = time;
    const r = await Api.call('admin.undoSubmit', req).catch(function () { return null; });
    setHtml(undoPlan, '');
    if (!(r && r.ok)) {
      undoPlan.appendChild(note('확인하지 못했습니다. ' + ((r && r.error) || ''), 'mockNote'));
      return;
    }
    if (r.nothing) {
      undoPlan.appendChild(note((r.plan || ['되돌릴 제출을 찾지 못했습니다.'])[0], 'mockNote'));
      return;
    }

    const head = document.createElement('p');
    head.className = 'f';
    head.textContent = store + ' · ' + it.date + (time ? ' ' + time : '') + ' · ' + KIND[it.kind];
    undoPlan.appendChild(head);
    list(undoPlan, r.plan || [], '지울 것');
    undoPlan.appendChild(note('아직 아무것도 지우지 않았습니다. 아래를 누르면 그때 지웁니다. 되돌릴 수 없습니다.'));

    const go = document.createElement('button');
    go.className = 'issueBtn warn';
    go.textContent = '정말 지웁니다';
    go.onclick = async function () {
      if (!confirm(store + ' ' + it.date + '\n정말 지울까요? 되돌릴 수 없습니다.')) return;
      go.disabled = true; go.textContent = '지우는 중…';
      req.apply = true;
      const d = await Api.call('admin.undoSubmit', req).catch(function () { return null; });
      go.disabled = false; go.textContent = '정말 지웁니다';
      setHtml(undoPlan, '');
      if (!(d && d.ok)) {
        undoPlan.appendChild(note('지우지 못했습니다. ' + ((d && d.error) || ''), 'mockNote'));
        return;
      }
      /* ★서버가 한 일을 그대로 편다★ — '완료'만 띄우면 안 된다. 매장 파일 탭을 못 찾았거나
         통합시트 칸에 수식이 있어 건너뛴 경우가 여기 섞여 오고, 그건 사람이 손으로 마무리해야
         하는 일이다. 조용한 실패가 가장 나쁘다. */
      list(undoPlan, d.done || [], '한 일');
      undoPlan.appendChild(note('★매장 파일의 개선요청 행은 자동으로 지우지 않습니다★ — 남아 있으면 손으로 지워 주세요.'));
      loadList(store);
    };
    undoPlan.appendChild(go);
  }

  // ---------- 쓰기 스위치 ----------
  const NAME = {
    STORE_FILE_WRITE: '매장 파일 점수',
    STORE_IMPROVE_WRITE: '매장 파일 개선요청',
    DASHBOARD_WRITE: '통합시트 점수',
  };
  function drawSw(sw) {
    const box = $('#swState');
    box.innerHTML = '';
    Object.keys(NAME).forEach(function (k) {
      const on = sw && sw[k] === true;
      const sp = document.createElement('span');
      const b = document.createElement('b');
      b.className = on ? 'ok' : 'hot';
      b.textContent = on ? '켜짐' : '꺼짐';
      sp.appendChild(document.createTextNode(NAME[k] + ' '));
      sp.appendChild(b);
      box.appendChild(sp);
    });
  }
  async function sw(on, btn) {
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '…';
    const body = (on === null) ? {} : { on: on };
    const r = await Api.call('admin.switches', body).catch(function () { return null; });
    btn.disabled = false; btn.textContent = label;
    if (!(r && r.ok)) { alert('스위치를 읽지 못했습니다.\n' + ((r && r.error) || '')); return; }
    drawSw(r.switches);
  }
  $('#swShow').onclick = function () { sw(null, this); };
  $('#swOn').onclick = function () {
    if (!confirm('세 개를 모두 켤까요?\n\n앞으로의 제출이 매장 파일과 통합시트에 실제로 기록됩니다.')) return;
    sw(true, this);
  };
  $('#swOff').onclick = function () {
    if (!confirm('세 개를 모두 끌까요?\n\n제출은 되지만 매장 파일·통합시트에는 아무것도 안 들어갑니다.')) return;
    sw(false, this);
  };

  sw(null, $('#swShow'));   // 들어오면 지금 상태를 바로 보여 준다
})();
