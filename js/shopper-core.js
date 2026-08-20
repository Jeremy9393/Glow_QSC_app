/* 미스터리쇼퍼 공통 폼 — 평가표(관리자)와 설문지(고객)가 이 파일 하나를 공유한다.
   안내문·방문 정보·문항·비고칸 전부 이 파일이 그린다(단일 소스) — 두 화면이 어긋날 수 없음.
   관리자/고객 차이는 ADMIN 플래그의 '보이냐 안 보이냐'뿐: 점수·집계·평가기준·NA 버튼·초기화만 관리자 전용.
   호출: initShopperForm({ admin: true|false })
   응답: 관찰 문항(1~10 카테고리) 예/아니오(+관리자 NA) · 만족도 문항(11·12·13) 1~5 (5점 척도, NA 없음)
   미응답은 빈칸으로 두면 채점에서 자동 제외 — 비고만 적어도 응답으로 인정 */
async function initShopperForm(opts) {
  const ADMIN = !!opts.admin;
  const master = await (await fetch('data/master.json', { cache: 'no-store' })).json();
  const $ = function (s, el) { return (el || document).querySelector(s); };

  // ---------- 공통 블록 렌더 (안내문·방문 정보) — 엑셀 쇼퍼 시트 안내 블록과 짝 (수정 시 함께!) ----------
  const GUIDE = [
    { tip: '필수 요청사항', html: '직원에게 간단한 질문이나 요청을 <b>1회 이상</b> 부탁드립니다. (화장실 위치, 메뉴 추천, 물티슈 요청 등)' },
    /* '냉정하고'를 쓰지 않는다 — 손님에게 가게를 깎으라고 신호를 보내는 말이다.
       이 설문은 매장을 깎으려는 것이 아니라 무엇을 고치면 좋을지 알려는 것이고,
       그 결과를 읽는 사람은 그 매장에서 일하는 직원들이다. */
    { html: '본 평가는 <b>철저하게 익명이 보장</b>됩니다. 보고 느끼신 그대로 편하게 남겨 주세요.' },
    { html: '1~10번 카테고리는 <b>예 / 아니오</b> 중 하나를, 11~13번 카테고리(맛·양·만족도)는 <b>1~5점</b> 중 하나를 선택해 주세요.' },
    { html: '답변에 대한 특이사항은 <b>비고</b>에 자유롭게 적어주세요.' },
    { html: '기억이 안 나거나 판단이 어려운 문항은, <b>비고에 상황이나 이유를 꼭 적어주시길</b> 부탁드립니다.' },
    { html: '<b>연령대·성별</b>은 직원이 아니라 <b>설문을 작성하시는 본인</b> 기준으로 적어주세요.' },
  ];
  const META_FIELDS = [
    { id: 'store', label: '매장명 *', full: true, control: '<select id="store"><option value="">방문한 매장 선택</option></select>' },
    { id: 'date', label: '방문날짜 *', control: '<input type="date" id="date">' },
    { id: 'time', label: '방문 시간 *', control: TimePick.html('time') },
    { id: 'staff', label: '응대직원 설명 *', full: true, control: '<input type="text" id="staff" placeholder="예: 14시경 카운터 결제 응대 · 검은 뿔테 안경 직원">' },
    { id: 'order', label: '주문내역 *', full: true, control: '<input type="text" id="order" placeholder="주문한 메뉴">' },
    { id: 'demo', label: '연령대·성별 (작성자 본인) *', full: true, control: '<input type="text" id="demo" placeholder="직원이 아닌 본인 기준 — 예: 30대 여성">' },
  ];
  if ($('#guideBox')) {
    $('#guideBox').innerHTML = '<h2>평가 전 안내</h2><ul class="guideList">' +
      GUIDE.map(function (g) {
        return '<li>' + (g.tip ? '<span class="tip">' + g.tip + '</span> ' : '') + g.html + '</li>';
      }).join('') + '</ul>';
  }
  if ($('#metaBox')) {
    $('#metaBox').innerHTML = '<h2>방문 정보</h2><div class="meta-grid">' +
      META_FIELDS.map(function (f) {
        return '<div' + (f.full ? ' class="full"' : '') + '><label class="f">' + f.label + '</label>' + f.control + '</div>';
      }).join('') + '</div>';
  }
  /* ★영수증 사진 첨부는 2026-08-20에 없앴다★ (사용자 지시 — 없던 것으로).
     그래서 이 화면은 사진을 한 장도 다루지 않는다. PhotoPick(js/ui-photo.js)도 부르지 않는다
     — 그 부품 자체는 QSC 점검(문항 증빙)과 매장 개선보고가 계속 쓰므로 지우지 않았다. */
  const DRAFT_KEY = ADMIN ? 'shopper-admin-v4' : 'shopper-guest-v4';
  const state = { answers: {}, memos: {} };
  const allQs = [];
  master.shopper_categories.forEach(function (c) { c.questions.forEach(function (q) { allQs.push(q); }); });
  const updaters = {};
  const LIKERT_LABEL = { 1: '매우 아니다', 2: '아니다', 3: '보통', 4: '그렇다', 5: '매우 그렇다' };

  /* 문항별 예시 [아쉬움 예시, 좋음 예시].
     ★번호가 아니라 문항 코드로 묶는다★ — 종전에는 1~40 일련번호를 키로 썼는데,
     2026-08-18에 13번 카테고리가 4문항 → 2문항으로 줄자 번호가 밀려
     '재방문·추천' 문항에 '가격 대비' 예시가, '퇴점 인사' 문항에 '응대 일관성' 예시가 붙었다.
     화면에는 멀쩡한 문장이 떠서 아무도 못 알아챈다. 코드로 묶으면 밀릴 수가 없다.
     문항이 없어지면 그 예시는 그냥 안 쓰이고, 새 문항은 예시 없이 뜬다(둘 다 안전하다). */
  const EX = {
    '1-1': ['들어갔는데 인사가 없었어요', '문 열자마자 반갑게 인사해 주셨어요'],
    '1-2': ['다른 곳을 보면서 응대했어요', '눈을 맞추며 응대해 주셨어요'],
    '1-3': ['나갈 때는 아무 말씀이 없었어요', '나갈 때도 인사해 주셨어요'],
    '2-1': ['불렀는데 한참 뒤에 반응했어요', '묻자마자 바로 도와주셨어요'],
    '2-2': ['설명이 어려워서 다시 물어봤어요', '설명이 쉽고 명확했어요'],
    '2-3': ['얼음 빼달라고 했는데 그대로 나왔어요', '요청한 대로 정확히 나왔어요'],
    '3-1': ['메뉴 설명 없이 주문만 받았어요', '맛과 특징을 자세히 설명해 주셨어요'],
    '3-2': ['추천이나 추가 제안이 없었어요', '어울리는 메뉴를 함께 추천해 주셨어요'],
    '3-3': ['먹는 방법 안내가 없었어요', '보관 방법까지 챙겨서 알려주셨어요'],
    '4-1': ['표정이 굳어 있어 불편했어요', '미소로 응대해 주셨어요'],
    '4-2': ['반말이 섞여 있었어요', '끝까지 공손하게 말해 주셨어요'],
    '4-3': ['주문을 재촉해서 불쾌했어요', '내내 편안하게 응대받았어요'],
    '5-1': ['카운터에서 음식을 먹고 있었어요', '근무 모습이 깔끔했어요'],
    '5-2': ['직원이 자리에 없어 한참 기다렸어요', '부르자마자 바로 와주셨어요'],
    '5-3': ['직원들끼리 잡담이 크게 들렸어요', '조용하고 차분한 분위기였어요'],
    '6-1': ['진동벨도 안내도 없이 기다렸어요', '진동벨과 함께 안내해 주셨어요'],
    '6-2': ['어디서 주문하는지 몰라 헤맸어요', '주문 방법이 한눈에 보였어요'],
    '6-3': ['제 주문인지 몰라서 확인해야 했어요', '번호를 또렷하게 불러주셨어요'],
    '7-1': ['결제가 오래 걸리고 버벅였어요', '결제가 빠르고 매끄러웠어요'],
    '7-2': ['영수증 안내가 없었어요', '이벤트까지 챙겨 알려주셨어요'],
    '7-3': ['주문 안 한 메뉴가 결제됐어요', '내역이 정확히 일치했어요'],
    '8-1': ['사진보다 많이 부실했어요', '사진 그대로 나왔어요'],
    '8-2': ['컵 겉에 소스가 묻어 있었어요', '그릇·식기와 포장이 깨끗했어요'],
    '8-3': ['진열대 제품이 흐트러져 있었어요', '진열이 보기 좋게 정돈돼 있었어요'],
    '9-1': ['시큼한 냄새가 났어요', '냄새가 신선했어요'],
    '9-2': ['채소 끝이 갈변해 있었어요', '재료가 신선해 보였어요'],
    '9-3': ['먹고 나서 씁쓸한 뒷맛이 남았어요', '끝맛까지 깔끔했어요'],
    '10-1': ['뜨거워야 할 메뉴가 미지근했어요', '온도가 딱 맞게 나왔어요'],
    '10-2': ['가운데가 덜 익어 있었어요', '알맞게 잘 익어 있었어요'],
    '10-3': ['빵이 눅눅했어요', '식감이 좋았어요'],
    '11-1': ['국물이 너무 짰어요', '간이 딱 맞았어요'],
    '11-2': ['소스 맛이 너무 강했어요', '재료 맛이 잘 어우러졌어요'],
    '11-3': ['설명과 다른 맛이었어요', '기대한 맛 그대로였어요'],
    '12-1': ['가격에 비해 양이 적었어요', '양이 넉넉했어요'],
    '12-2': ['먹다 보니 눅눅해졌어요', '끝까지 맛이 유지됐어요'],
    '12-3': ['전체적으로 아쉬운 맛이었어요', '전반적으로 맛있었어요'],
    '13-1': ['다시 오거나 추천하기엔 아쉬웠어요', '또 오고 싶고 지인에게도 추천하고 싶어요'],
    '13-2': ['전반적으로 아쉬운 방문이었어요', '전반적으로 만족스러웠어요'],
  };
  function placeholder(q, answer) {
    const e = EX[(String(q.text).match(/^(\d+-\d+)\./) || [])[1]];
    if (q.scale === 'likert') {
      if (typeof answer === 'number' && answer <= 2) return '어떤 점이 아쉬웠는지 알려주세요' + (e ? ' (예: ' + e[0] + ')' : '');
      if (typeof answer === 'number' && answer >= 4) return '좋았던 점이 있다면 적어 주세요' + (e ? ' (예: ' + e[1] + ')' : ' (선택)');
      return '점수를 고르기 어려우면 여기에 상황을 적어주세요';
    }
    if (answer === '아니오') return '어떤 상황이었는지 알려주세요' + (e ? ' (예: ' + e[0] + ')' : '');
    if (answer === '예') return '좋았던 점이 있다면 적어 주세요' + (e ? ' (예: ' + e[1] + ')' : ' (선택)');
    return '예/아니오를 고르기 어려우면 여기에 상황을 적어주세요';
  }

  // 문항 하나가 '완료'로 인정되는 기준: 답변 또는 비고 중 하나라도 있으면 됨
  // (기억이 안 나거나 판단이 어려운 경우, 비고에 상황만 적어도 응답으로 인정)
  function isFilled(no) {
    return state.answers[no] != null || !!(state.memos[no] || '').trim();
  }

  // 방문 정보 필수 입력 항목 — 응대직원은 시간대·상황 설명까지 필수
  // pick: 드롭다운(고르는 칸) — 안내 문구를 '선택해 주세요'로 바꾼다
  const REQUIRED_META = [
    { id: 'store', label: '매장명' },
    { id: 'date', label: '방문날짜' },
    { id: 'time', label: '방문 시간', pick: true, focus: 'timeH', get: function () { return TimePick.get('time'); } },
    { id: 'staff', label: '응대직원 설명' },
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
    // 엑셀 쇼퍼 시트의 평가기준·안내·채점원칙을 그대로 표시 (완전 동기화)
    if ($('#rulesNote') && master.texts) {
      $('#rulesNote').textContent =
        '[평가기준]\n' + (master.texts.shopper_criteria || '') +
        '\n\n' + (master.texts.shopper_principles || '');
    }
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
      store: $('#store').value, date: $('#date').value, time: TimePick.get('time'),
      staff: $('#staff').value, order: $('#order').value, demo: $('#demo').value,
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
    const likert = q.scale === 'likert';
    // 관찰 문항 NA는 관리자 전용 (엑셀 D11:D40 유효성과 동일) — 고객 화면에는 없음
    const optsHtml = likert
      ? '<div class="opts likert">' + [1, 2, 3, 4, 5].map(function (n) {
          return '<button data-v="' + n + '">' + n + '</button>';
        }).join('') + '</div>' +
        '<div class="likert-cap">1 매우 아니다 · 3 보통 · 5 매우 그렇다</div>'
      : '<div class="opts"><button data-v="예">예</button><button data-v="아니오">아니오</button>' +
        (ADMIN ? '<button data-v="NA">NA</button>' : '') + '</div>';
    card.innerHTML =
      '<div class="q"><span class="no">' + q.no + '</span><span class="txt"></span></div>' +
      optsHtml +
      '<input type="text" class="why" maxlength="200">';
    $('.q .txt', card).textContent = q.text;
    const why = $('.why', card);

    card.querySelectorAll('.opts button').forEach(function (b) {
      b.onclick = function () {
        const v = likert ? parseInt(b.dataset.v, 10) : b.dataset.v;
        state.answers[q.no] = state.answers[q.no] === v ? null : v;
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
    function needsWhy() {
      const v = state.answers[q.no];
      return (likert ? (typeof v === 'number' && v <= 2) : v === '아니오') && !why.value.trim();
    }
    function markWhy() {
      why.className = 'why' + (needsWhy() ? ' need' : '');
    }
    function update() {
      const v = state.answers[q.no];
      card.querySelectorAll('.opts button').forEach(function (b) {
        const bv = likert ? parseInt(b.dataset.v, 10) : b.dataset.v;
        b.className = v === bv
          ? (likert ? (bv <= 2 ? 'on-no' : 'on-yes')
             : (bv === '예' ? 'on-yes' : bv === 'NA' ? 'on-na' : 'on-no'))
          : '';
      });
      why.placeholder = placeholder(q, v);
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
    const likertCat = c.questions.length && c.questions[0].scale === 'likert';
    sec.innerHTML = '<div class="ghead"><h2></h2>' +
      (likertCat ? '<span class="gstat">5점 척도</span>' : '') + '</div>';
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
    // 엑셀 집계표(52~64행)와 동일 구성: 환산 점수 · 응답 문항 수(NA 포함) · NA 건 · 달성률(NA 제외)
    master.shopper_categories.forEach(function (c) {
      let conv = 0, ans = 0, na = 0;
      c.questions.forEach(function (q) {
        const a = state.answers[q.no];
        if (a === 'NA') { na++; return; }
        const v = Scoring.shopperConvert(a);
        if (v != null) { conv += v; ans++; }
      });
      const tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td class="r">' + (ans ? (Math.round(conv * 100) / 100) : '—') + '</td>' +
        '<td class="r">' + (ans + na) + '/' + c.questions.length + '</td>' +
        '<td class="r">' + na + '</td>' +
        '<td class="r">' + (ans ? Math.round(conv / ans * 100) + '%' : '—') + '</td>';
      tr.cells[0].textContent = c.name;
      body.appendChild(tr);
    });
    $('#sumFinal').innerHTML = res.score == null ? '점수 —' :
      '점수 <b>' + res.score.toFixed(1) + '점</b> · <b>' + (res.grade || '') + '</b>' +
      ' <span style="font-size:12px;color:var(--sub)">(환산 ' + (Math.round(res.converted * 100) / 100) + ' / 응답 ' + res.answered + ')</span>';
  }

  // ---------- 제출 ----------
  $('#submitBtn').onclick = async function () {
    for (const f of REQUIRED_META) {
      const val = f.get ? f.get() : $('#' + f.id).value.trim();
      if (!val) {
        alert(withEulReul(f.label) + ' ' + (f.verb || (f.pick ? '선택해' : '입력해')) + ' 주세요.' +
          (f.id === 'staff' ? '\n이름 또는 특징과 함께 응대 시간대·응대 상황을 적어 주세요.\n예) 14시경 카운터 결제 응대 · 검은 뿔테 안경 직원' : '') +
          (f.id === 'demo' ? '\n응대 직원이 아니라, 설문을 작성하시는 본인 기준으로 적어 주세요.' : ''));
        $('#' + (f.focus || f.id)).focus();
        return;
      }
    }
    const answered = allQs.filter(function (q) { return isFilled(q.no); }).length;
    const missing = allQs.length - answered;
    if (missing > 0) {
      // 완료 게이트: 답변 또는 비고 중 하나는 반드시 — 미완료 상태로는 제출 불가
      alert(ADMIN
        ? '입력하지 않은 문항이 ' + missing + '개 있습니다.\n확인하지 못한 관찰 문항은 NA로 처리해 주세요. (만족도 문항은 1~5 필수)'
        : '아직 답변하지 않은 문항이 ' + missing + '개 있습니다.\n답을 선택하거나, 판단이 어려우면 비고에 상황을 적어 주세요.');
      return;
    }
    const noReason = allQs.filter(function (q) {
      const v = state.answers[q.no];
      const low = q.scale === 'likert' ? (typeof v === 'number' && v <= 2) : v === '아니오';
      return low && !(state.memos[q.no] || '').trim();
    }).length;
    if (noReason > 0 &&
        !confirm('아쉬웠다고 답한 문항 중 ' + noReason + '개에 비고가 비어 있어요.\n어떤 상황이었는지 한 줄만 적어 주시면 개선에 큰 도움이 됩니다.\n이대로 제출할까요?')) return;

    const res = Scoring.shopperScore(answersInOrder());
    if (ADMIN && res.score != null &&
        !confirm('응답 ' + answered + '/' + allQs.length + '\n점수 ' + res.score.toFixed(1) + '점 · ' + res.grade + '\n제출할까요?')) return;

    /* ★익명 제출은 제출 코드가 있어야 한다★ (설계: 제출 순간에만 검사한다)
       작성은 코드 없이 자유롭게 하고, 여기서 한 번 묻는다.
       ★취소하거나 틀려도 작성 내용은 그대로 남는다★ — 다시 [제출]을 누르면 된다.
       관리자는 로그인으로 신원이 확인되므로 묻지 않는다. */
    let code = '';
    if (!ADMIN) {
      code = (prompt('제출 코드를 입력해 주세요 (6자리)\n\n담당자에게 받으신 번호입니다.\n작성하신 내용은 그대로 남아 있습니다.', '') || '').trim();
      /* 화면이 코드를 '382 917'처럼 띄어 보여 주므로 그대로 옮겨 적는 사람이 많다.
         숫자만 남긴다 — 서버도 같은 일을 하지만, 여기서 걸러야 오타가 아닌 것으로 실패하지 않는다. */
      code = code.replace(/[^0-9]/g, '');
      if (!code) return;
    }

    const payload = {
      code: code,
      store: $('#store').value.trim(), date: $('#date').value, time: TimePick.get('time'),
      staff: $('#staff').value.trim(), order: $('#order').value.trim(), demographic: $('#demo').value.trim(),
      submittedAt: new Date().toISOString(),
      source: ADMIN ? 'admin' : 'customer',
      result: res,
      answers: allQs.map(function (q) {
        return {
          no: q.no, row: q.row, text: q.text, scale: q.scale,
          answer: state.answers[q.no] == null ? null : state.answers[q.no],
          memo: (state.memos[q.no] || '').trim(),
        };
      }),
    };
    const btn = $('#submitBtn');
    btn.disabled = true; btn.textContent = ADMIN ? '저장 중…' : '전송 중…';
    try {
      /* ★관리자와 고객이 서로 다른 액션으로 보낸다★
         고객 설문(survey.html)은 주소만 알면 누구나 열 수 있으므로 서버에서 '익명 허용' 액션으로
         따로 받아야 한다. 둘 다 'shopper'로 보내면, 로그인 강제(AUTH_ENFORCE)를 켜는 순간
         토큰이 없는 고객 설문이 전부 거부되어 조사 자체가 멈춘다.
         서버는 survey.submit을 anon으로 열어 두고, 그 응답은 공식 CS 평균 집계에서 제외한다. */
      const r = await Api.submit(ADMIN ? 'shopper' : 'survey', payload);
      if (r.ok) {
        localStorage.removeItem(DRAFT_KEY);
        if (ADMIN) {
          let done = '저장 완료' + (r.mock ? ' (모의 저장 — 구글 연동 전)' : '') +
            (res.score != null ? '\n점수 ' + res.score.toFixed(1) + '점 · ' + res.grade : '');
          // 같은 달에 쇼퍼가 여러 명이면 통합시트에는 '월 평균'이 들어가므로 그 값을 알려준다
          if (r.dashboard && r.dashboard.skipped && r.dashboard.monthAvg != null) {
            done += '\n\n▶ 통합시트 CS 칸에 입력\n   ' + Number(r.dashboard.monthAvg).toFixed(1) + '% (이번 달 평균)';
          }
          alert(done);
          location.reload();
        } else {
          $('#formWrap').style.display = 'none';
          $('#bar').style.display = 'none';
          $('#thanks').style.display = 'flex';
          window.scrollTo(0, 0);
        }
        return;
      }
      /* ★고객에게도 사유를 보여 준다★ — '전송되지 않았습니다'만으로는 코드를 다시 받아야 하는지,
         그냥 다시 누르면 되는지 알 수 없다. 서버가 사유를 구분해 보내 준다. */
      alert(ADMIN
        ? '저장되지 않았습니다: ' + (r.error || '원인을 알 수 없습니다')
        : (r.error || '전송되지 않았습니다. 잠시 후 다시 시도해 주세요.') +
          '\n\n작성하신 내용은 그대로 있습니다. [제출]을 다시 눌러 주세요.');
    } catch (e) {
      alert(ADMIN ? '저장되지 않았습니다: ' + e.message : '전송되지 않았습니다. 네트워크 연결을 확인해 주세요.');
    }
    btn.disabled = false; btn.textContent = '제출';
  };

  ['store', 'date', 'staff', 'order', 'demo'].forEach(function (id) {
    $('#' + id).addEventListener('input', saveDraft);
  });
  TimePick.onChange('time', saveDraft);

  // ---------- 초기화 ----------
  const draft = loadDraft();
  if (draft) {
    if (!$('#store').disabled) $('#store').value = draft.store || '';
    $('#date').value = draft.date || todayStr();
    // 방문 시간은 기본값을 두지 않는다 — 방문 시각과 작성 시각이 다를 수 있으므로 직접 고르게 함
    TimePick.set('time', draft.time || '');
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
