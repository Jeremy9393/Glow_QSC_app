/* 미스터리쇼퍼 공통 폼 — 평가표(관리자)와 설문지(고객)가 이 파일 하나를 공유한다.
   구조·문항·비고칸·안내문이 항상 동일하게 유지되고, 점수·집계·초기화만 관리자 전용으로 켜진다.
   호출: initShopperForm({ admin: true|false })
   응답: 예 / 아니오 (NA 없음 — 미응답은 빈칸으로 두면 채점에서 자동 제외) */
async function initShopperForm(opts) {
  const ADMIN = !!opts.admin;
  const master = await (await fetch('data/master.json')).json();
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const DRAFT_KEY = ADMIN ? 'shopper-admin-v3' : 'shopper-guest-v3';
  const state = { answers: {}, memos: {} };
  const allQs = [];
  master.shopper_categories.forEach(function (c) { c.questions.forEach(function (q) { allQs.push(q); }); });
  const updaters = {};

  // 문항별 예시 [아니오 예시, 예 예시] — 문항(master.json) 변경 시 함께 점검할 것
  const EX = {
    1: ['들어갔는데 인사가 없었어요', '문 열자마자 반갑게 인사해 주셨어요'],
    2: ['다른 곳을 보면서 응대했어요', '눈을 맞추며 응대해 주셨어요'],
    3: ['처음엔 친절했는데 나중엔 무뚝뚝했어요', '끝까지 한결같이 친절했어요'],
    4: ['불렀는데 한참 뒤에 반응했어요', '묻자마자 바로 도와주셨어요'],
    5: ['설명이 어려워서 다시 물어봤어요', '설명이 쉽고 명확했어요'],
    6: ['얼음 빼달라고 했는데 그대로 나왔어요', '요청한 대로 정확히 나왔어요'],
    7: ['메뉴 설명 없이 주문만 받았어요', '맛과 특징을 자세히 설명해 주셨어요'],
    8: ['추천 메뉴 제안이 없었어요', '인기 메뉴를 먼저 추천해 주셨어요'],
    9: ['먹는 방법 안내가 없었어요', '보관 방법까지 챙겨서 알려주셨어요'],
    10: ['표정이 굳어 있어 불편했어요', '미소로 응대해 주셨어요'],
    11: ['반말이 섞여 있었어요', '끝까지 공손하게 말해 주셨어요'],
    12: ['주문을 재촉해서 불쾌했어요', '내내 편안하게 응대받았어요'],
    13: ['카운터에서 음식을 먹고 있었어요', '근무 모습이 깔끔했어요'],
    14: ['직원이 자리에 없어 한참 기다렸어요', '부르자마자 바로 와주셨어요'],
    15: ['직원들끼리 잡담이 크게 들렸어요', '조용하고 차분한 분위기였어요'],
    16: ['진동벨도 안내도 없이 기다렸어요', '진동벨과 함께 안내해 주셨어요'],
    17: ['어디서 주문하는지 몰라 헤맸어요', '주문 방법이 한눈에 보였어요'],
    18: ['제 주문인지 몰라서 확인해야 했어요', '번호를 또렷하게 불러주셨어요'],
    19: ['결제가 오래 걸리고 버벅였어요', '결제가 빠르고 매끄러웠어요'],
    20: ['영수증 안내가 없었어요', '이벤트까지 챙겨 알려주셨어요'],
    21: ['주문 안 한 메뉴가 결제됐어요', '내역이 정확히 일치했어요'],
    22: ['사진보다 많이 부실했어요', '사진 그대로 나왔어요'],
    23: ['컵 겉에 소스가 묻어 있었어요', '그릇과 포장이 깨끗했어요'],
    24: ['진열대 제품이 흐트러져 있었어요', '진열이 보기 좋게 정돈돼 있었어요'],
    25: ['시큼한 냄새가 났어요', '냄새가 신선했어요'],
    26: ['채소 끝이 갈변해 있었어요', '재료가 신선해 보였어요'],
    27: ['먹고 나서 씁쓸한 뒷맛이 남았어요', '끝맛까지 깔끔했어요'],
    28: ['뜨거워야 할 메뉴가 미지근했어요', '온도가 딱 맞게 나왔어요'],
    29: ['가운데가 덜 익어 있었어요', '고르게 잘 익어 있었어요'],
    30: ['빵이 눅눅했어요', '식감이 좋았어요'],
    31: ['국물이 너무 짰어요', '간이 딱 맞았어요'],
    32: ['소스 맛이 너무 강했어요', '재료 맛이 잘 어우러졌어요'],
    33: ['설명과 다른 맛이었어요', '기대한 맛 그대로였어요'],
    34: ['가격에 비해 양이 적었어요', '양이 넉넉했어요'],
    35: ['먹다 보니 눅눅해졌어요', '끝까지 맛이 유지됐어요'],
    36: ['전체적으로 아쉬운 맛이었어요', '전반적으로 맛있었어요'],
    37: ['가격 대비 아쉬웠어요', '가격이 아깝지 않았어요'],
    38: ['다시 올 것 같지 않아요', '또 방문하고 싶어요'],
    39: ['추천하긴 어려울 것 같아요', '지인에게 추천하고 싶어요'],
    40: ['전반적으로 아쉬운 방문이었어요', '전반적으로 만족스러웠어요'],
  };
  function placeholder(no, answer) {
    const e = EX[no];
    if (answer === '아니오') return '어떤 상황이었는지 알려주세요' + (e ? ' (예: ' + e[0] + ')' : '');
    if (answer === '예') return '좋았던 점이 있다면 적어 주세요' + (e ? ' (예: ' + e[1] + ')' : ' (선택)');
    return '예/아니오를 고르기 어려우면 여기에 상황을 적어주세요';
  }

  // 문항 하나가 '완료'로 인정되는 기준: 예/아니오 답변 또는 비고 중 하나라도 있으면 됨
  // (기억이 안 나거나 판단이 어려운 경우, 비고에 상황만 적어도 응답으로 인정)
  function isFilled(no) {
    return state.answers[no] != null || !!(state.memos[no] || '').trim();
  }

  // 방문 정보 필수 입력 항목
  const REQUIRED_META = [
    { id: 'store', label: '매장명' },
    { id: 'date', label: '방문날짜' },
    { id: 'staff', label: '응대직원' },
    { id: 'order', label: '주문내역' },
    { id: 'demo', label: '연령대·성별' },
  ];
  function withEulReul(word) {
    const ch = word.charCodeAt(word.length - 1);
    if (ch < 0xAC00 || ch > 0xD7A3) return word + '를';
    return word + ((ch - 0xAC00) % 28 === 0 ? '를' : '을');
  }

  // ---------- 매장 목록 ----------
  const live = await Api.getConfig();
  const stores = (live && live.stores && live.stores.length) ? live.stores : (master.stores || []);
  stores.forEach(function (s) {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    $('#store').appendChild(o);
  });
  // QR 링크의 ?store= 파라미터로 매장 자동 선택·고정
  const preStore = new URLSearchParams(location.search).get('store');
  if (preStore && stores.indexOf(preStore) >= 0) {
    $('#store').value = preStore;
    $('#store').disabled = true;
  }

  if (ADMIN) {
    if ($('#verInfo')) $('#verInfo').textContent = '평가표 ' + master.version + ' 기준';
    if ($('#resetBtn')) $('#resetBtn').onclick = function () {
      if (!confirm('모든 응답을 지우고 새로 입력할까요?')) return;
      localStorage.removeItem(DRAFT_KEY);
      location.reload();
    };
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function saveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      store: $('#store').value, date: $('#date').value, staff: $('#staff').value,
      order: $('#order').value, demo: $('#demo').value,
      answers: state.answers, memos: state.memos, t: Date.now(),
    }));
    if (ADMIN && $('#saveNote')) $('#saveNote').textContent = '이 기기에 자동 임시저장됨 · ' + new Date().toLocaleTimeString('ko-KR');
  }
  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
  }

  // ---------- 문항 카드 (두 화면 동일) ----------
  function buildQ(q) {
    const card = document.createElement('div');
    card.className = 'item qcard';
    card.innerHTML =
      '<div class="q"><span class="no">' + q.no + '</span><span class="txt"></span></div>' +
      '<div class="opts"><button data-v="예">예</button><button data-v="아니오">아니오</button></div>' +
      '<input type="text" class="why" maxlength="200">';
    $('.q .txt', card).textContent = q.text;
    const why = $('.why', card);

    card.querySelectorAll('.opts button').forEach(function (b) {
      b.onclick = function () {
        state.answers[q.no] = state.answers[q.no] === b.dataset.v ? null : b.dataset.v;
        update();
        recompute();
        saveDraft();
      };
    });
    why.addEventListener('input', function () {
      state.memos[q.no] = why.value;
      markWhy();
      saveDraft();
    });
    function markWhy() {
      why.className = 'why' + (state.answers[q.no] === '아니오' && !why.value.trim() ? ' need' : '');
    }
    function update() {
      const v = state.answers[q.no];
      card.querySelectorAll('.opts button').forEach(function (b) {
        b.className = v === b.dataset.v ? (b.dataset.v === '예' ? 'on-yes' : 'on-no') : '';
      });
      why.placeholder = placeholder(q.no, v);
      if (why.value !== (state.memos[q.no] || '')) why.value = state.memos[q.no] || '';
      markWhy();
    }
    updaters[q.no] = update;
    update();
    return card;
  }

  const catsEl = $('#cats');
  master.shopper_categories.forEach(function (c) {
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.innerHTML = '<div class="ghead"><h2></h2></div>';
    $('.ghead h2', sec).textContent = c.name;
    c.questions.forEach(function (q) { sec.appendChild(buildQ(q)); });
    catsEl.appendChild(sec);
  });

  function answersInOrder() {
    return allQs.map(function (q) { return state.answers[q.no] == null ? null : state.answers[q.no]; });
  }

  // ---------- 진행률(공통) + 점수·집계(관리자 전용) ----------
  function recompute() {
    const n = allQs.filter(function (q) { return isFilled(q.no); }).length;
    $('#prog').textContent = n + ' / ' + allQs.length + ' 응답';
    if ($('#fill')) $('#fill').style.width = (n / allQs.length * 100) + '%';
    if (!ADMIN) return;

    const res = Scoring.shopperScore(answersInOrder());
    $('#bbScore').textContent = res.score == null ? '—' : res.score.toFixed(1) + '점';
    $('#bbGrade').textContent = res.grade || '';
    const body = $('#sumBody');
    body.innerHTML = '';
    master.shopper_categories.forEach(function (c) {
      let yes = 0, ans = 0;
      c.questions.forEach(function (q) {
        const a = state.answers[q.no];
        if (a === '예') { yes++; ans++; }
        else if (a === '아니오') { ans++; }
      });
      const tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td class="r">' + yes + '</td><td class="r">' + ans + '/' + c.questions.length + '</td>' +
        '<td class="r">' + (ans ? Math.round(yes / ans * 100) + '%' : '—') + '</td>';
      tr.cells[0].textContent = c.name;
      body.appendChild(tr);
    });
    $('#sumFinal').innerHTML = res.score == null ? '점수 —' :
      '점수 <b>' + res.score.toFixed(1) + '점</b> · <b>' + (res.grade || '') + '</b>' +
      ' <span style="font-size:12px;color:var(--sub)">(예 ' + res.yes + ' / 응답 ' + res.answered + ')</span>';
  }

  // ---------- 제출 ----------
  $('#submitBtn').onclick = async function () {
    for (const f of REQUIRED_META) {
      const el = $('#' + f.id);
      if (!el.value.trim()) {
        alert(withEulReul(f.label) + ' 입력해 주세요.');
        el.focus();
        return;
      }
    }
    const answered = allQs.filter(function (q) { return isFilled(q.no); }).length;
    const missing = allQs.length - answered;
    if (missing > 0) {
      if (!ADMIN) {
        alert('아직 답변하지 않은 문항이 ' + missing + '개 있습니다.\n예 / 아니오를 선택하거나, 판단이 어려우면 비고에 상황을 적어 주세요.');
        return;
      }
      if (!confirm('미응답(예/아니오·비고 모두 없음) ' + missing + '개 문항이 있습니다 (채점에서 제외됨).\n그대로 제출할까요?')) return;
    }
    const noReason = allQs.filter(function (q) {
      return state.answers[q.no] === '아니오' && !(state.memos[q.no] || '').trim();
    }).length;
    if (noReason > 0 &&
        !confirm("'아니오'로 답한 문항 중 " + noReason + "개에 비고가 비어 있어요.\n어떤 상황이었는지 한 줄만 적어 주시면 개선에 큰 도움이 됩니다.\n이대로 제출할까요?")) return;

    const res = Scoring.shopperScore(answersInOrder());
    if (ADMIN && res.score != null &&
        !confirm('응답 ' + answered + '/' + allQs.length + '\n점수 ' + res.score.toFixed(1) + '점 · ' + res.grade + '\n제출할까요?')) return;

    const payload = {
      store: $('#store').value.trim(), date: $('#date').value,
      staff: $('#staff').value.trim(), order: $('#order').value.trim(), demographic: $('#demo').value.trim(),
      submittedAt: new Date().toISOString(),
      source: ADMIN ? 'admin' : 'customer',
      result: res,
      answers: allQs.map(function (q) {
        return {
          no: q.no, row: q.row, text: q.text,
          answer: state.answers[q.no] == null ? null : state.answers[q.no],
          memo: (state.memos[q.no] || '').trim(),
        };
      }),
    };
    const btn = $('#submitBtn');
    btn.disabled = true; btn.textContent = ADMIN ? '저장 중…' : '전송 중…';
    try {
      const r = await Api.submit('shopper', payload);
      if (r.ok) {
        localStorage.removeItem(DRAFT_KEY);
        if (ADMIN) {
          alert('저장 완료' + (r.mock ? ' (모의 저장 — 구글 연동 전)' : '') +
            (res.score != null ? '\n점수 ' + res.score.toFixed(1) + '점 · ' + res.grade : ''));
          location.reload();
        } else {
          $('#formWrap').style.display = 'none';
          $('#bar').style.display = 'none';
          $('#thanks').style.display = 'flex';
          window.scrollTo(0, 0);
        }
        return;
      }
      alert(ADMIN ? '저장 실패: ' + (r.error || '알 수 없는 오류') : '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } catch (e) {
      alert(ADMIN ? '저장 실패: ' + e.message : '전송에 실패했습니다. 네트워크 연결을 확인해 주세요.');
    }
    btn.disabled = false; btn.textContent = '제출';
  };

  ['store', 'date', 'staff', 'order', 'demo'].forEach(function (id) {
    $('#' + id).addEventListener('input', saveDraft);
  });

  // ---------- 초기화 ----------
  const draft = loadDraft();
  if (draft) {
    if (!$('#store').disabled) $('#store').value = draft.store || '';
    $('#date').value = draft.date || todayStr();
    $('#staff').value = draft.staff || '';
    $('#order').value = draft.order || '';
    $('#demo').value = draft.demo || '';
    Object.assign(state.answers, draft.answers || {});
    Object.assign(state.memos, draft.memos || {});
    allQs.forEach(function (q) { updaters[q.no](); });
    if (ADMIN && $('#saveNote')) $('#saveNote').textContent = '임시저장 불러옴 (' + new Date(draft.t).toLocaleString('ko-KR') + ')';
  } else {
    $('#date').value = todayStr();
  }
  recompute();
}
