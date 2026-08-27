/* 제출 관리 — 제출 되돌리기 (2026-08-26 · 2026-08-27 admin.html 에서 이 화면으로 옮김)

   ★무엇에 쓰는 물건인가★ — 담당자가 ①실수로 제출한 것을 취소하거나 ②시험 삼아 낸 것을
     원상복구할 때 쓴다. '재제출로 덮어쓰기'와는 다른 일이다 — 덮어쓰기는 제출할 때
     서버가 먼저 되묻고(guardResubmit) 알아서 정리한다.

   ★날짜 한 줄, 통째로★ — 서버는 ★양쪽(QSC·MS)을 함께 되돌릴 때만★ 매장 파일 탭까지
     정리한다(한쪽만 지우면 반대쪽 자료가 그 탭에 남으니 당연한 규칙이다).
     그래서 종류별로 줄을 나누고 늘 kind를 보내면 개선요청 행을 영영 못 지운다 —
     기능을 하나 잃는 셈이다. 기본은 '그 날짜 제출을 통째로'.
     시간(time)도 보내지 않는다(보내면 NA프리셋·매장 파일 정리를 건너뛴다).

   ★지우기 전에 반드시 보여 준다★ — admin.undoSubmit 은 apply 없이 부르면 계획만 돌려준다.
     이 화면은 그 계획을 펴 놓고, 사람이 한 번 더 누를 때만 apply:true 를 보낸다.
     확인창 한 줄로 대신하지 않는 이유는 지울 항목이 여러 줄이기 때문이다 —
     읽지 않고 누르게 만드는 확인창은 없는 것만 못하다.

   2026-08-26: 「쓰기 스위치」 칸은 뺐다(담당자 판단). 서버 스위치는 살아 있고 콘솔로 부른다
     — admin.html 주석 참조.
   2026-08-27: 관리자 도구(admin.html)에 펼쳐져 있던 이 칸을 submits.html 로 옮겼다.
     관리 화면이 셋 다 같은 모습(목록 한 줄 → 눌러서 들어가기)이 되도록.

   권한은 서버가 정한다. admin.* 액션이 전부 menu:'accounts' 라 이 화면도 같은 열쇠를 쓴다
   (admin.html 의 Auth.guard('accounts')). 여기서 역할 이름을 비교하지 않는다. */
(async function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const KIND = { qsc: 'QSC 평가표', shopper: 'MS 평가표 · 고객 설문' };

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

    /* ★「QSC 평가표」·「MS 평가표」 두 묶음으로 보여 준다★ (2026-08-26 담당자 지시)
       담당자가 내는 것이 그 두 가지라, 되돌리는 자리도 그 두 가지로 보이는 것이 맞다.
       ★종전에는 날짜로 묶고 '통째로'만 되돌렸다★ — 서버가 양쪽을 함께 되돌릴 때만
         매장 파일을 정리했기 때문이다. 그 제약은 사라졌다: 한쪽만 되돌려도 점수·방문일·
         개선요청 행까지 다 지운다(탭만 안 지우는데, 빈 양식이라 다음에 그대로 쓰인다).
       ★빈 묶음도 자리는 남긴다★ — '없다'는 것도 봐야 하는 정보다. 줄이 사라지면
         '아직 안 불러왔나' 싶어진다. */
    ['qsc', 'shopper'].forEach(function (k) {
      const mine = items.filter(function (it) { return it.kind === k; });

      const head = document.createElement('p');
      head.className = 'f';
      head.textContent = (k === 'qsc' ? '📋 ' : '🛍 ') + KIND[k];
      subList.appendChild(head);

      if (!mine.length) {
        subList.appendChild(note('되돌릴 제출이 없습니다.'));
        return;
      }
      mine.forEach(function (it) {
        const row = document.createElement('div');
        row.className = 'codeRow unused';
        row.innerHTML = '<span class="st">' + (k === 'qsc' ? '📋' : '🛍') + '</span>' +
          '<span class="nm"></span><span class="info"></span>' +
          '<span class="act"><button class="miniBtn warn">되돌리기</button></span>';
        $('.nm', row).textContent = it.date;
        $('.info', row).textContent = it.time ? it.time + ' 제출분' : '';
        $('button', row).onclick = function () { preview(store, it.date, k, KIND[k]); };
        subList.appendChild(row);
      });
    });

    subList.appendChild(note('[되돌리기]를 누르면 무엇을 지울지 먼저 보여 드립니다. 그때 확인하셔야 실제로 지웁니다.'));
  }

  // ---------- 미리보기 → 실행 ----------
  /* kind가 빈 문자열이면 ★그 날짜 통째로★ 되돌린다(서버 기본값 'both'). */
  async function preview(store, date, kind, label) {
    setHtml(undoPlan, '');
    undoPlan.appendChild(note('확인하는 중입니다…'));
    const req = { store: store, date: date };
    if (kind) req.kind = kind;
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
    head.textContent = store + ' · ' + date + ' · ' + (kind ? KIND[kind] : label);
    undoPlan.appendChild(head);
    list(undoPlan, r.plan || [], '지울 것');
    undoPlan.appendChild(note('아직 아무것도 지우지 않았습니다. 아래를 누르면 그때 지웁니다. 사진은 휴지통으로 가고, 나머지는 되돌릴 수 없습니다.'));

    const go = document.createElement('button');
    go.className = 'issueBtn warn';
    go.textContent = '정말 지웁니다';
    go.onclick = async function () {
      if (!confirm(store + ' ' + date + '\n정말 지울까요? 사진은 휴지통으로 갑니다.')) return;
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
      /* ★'완료'로 끝내지 않는다★ — 위 목록에 손으로 마무리해야 하는 줄이 섞여 온다
         (매장이 이미 적어서 개선요청을 못 지운 경우 등). 그 줄을 읽게 만드는 것이 이 화면의 일이다. */
      undoPlan.appendChild(note('위 목록을 한 번 읽어 주세요. ★ 표시가 있는 줄만 손으로 마무리하시면 됩니다.'));
      loadList(store);
    };
    undoPlan.appendChild(go);
  }
})();
