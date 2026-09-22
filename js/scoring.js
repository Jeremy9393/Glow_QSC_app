/* QSC 채점 엔진 — 평가표 엑셀(QSC·MS 평가표.xlsx)의 수식과 같은 값을 낸다.
   일반 문항: 1건 = 100 ÷ 해당 일반 문항 수   ★2026-09-22 변경 (팀장 승인)★
     해당 = 일반 문항 58개 중 NA 가 아닌 것. 58개 모두 해당하면 1건 1.72점, NA 8개면 2점.
     같은 문항에서 여러 건이면 건마다 뺀다(영역 구분 없음).
     종전에는 1건 = 1점이었다 — 일반 문항이 58개뿐인데 100문항처럼 빼서 약 1.7배 후했고
     (등급 눈금 93·85·76 이 「틀린 건수」로 쓰였다), NA 가 많은 매장일수록 어길 기회가 적어 유리했다.
     이제 MS 처럼 「해당 문항 수」로 나눈다 — 해당 문항 중 어긴 비율이 같으면 점수도 같다.
   ★  중대운영(S2): 문항당 −8, 같은 문항 추가 건당 −2, 합계 상한 −45   (그대로)
   ★★ 즉시위해(S1): 문항당 −12, 같은 문항 추가 건당 −4, 합계 상한 −48 (그대로)
     중대는 비율에 묻히면 안 되므로 따로 뺀다 — ★ 하나면 우수 불가, ★★ 하나면 양호가 최대.
   QSC 점수 = MAX(0, 100 − 일반 감점 − 중대 차감), 소수 첫째 자리 반올림
     반올림은 서버 round1 · 엑셀 D89 ROUND(…,1) 과 같다 — 등급도 반올림한 점수로 매긴다.
   ★2026-08-18 변경★ 중대 차감을 QSC 점수 안으로
     종전에는 중대(★·★★)를 QSC 점수에서 빼지 않고 대시보드 최종점수 단계에서 따로 뺐다.
     그래서 ★★ 하나가 걸려도 점검 화면의 QSC 점수는 멀쩡해 보이고, 실제 타격은
     한 달 뒤 통합시트에서야 드러났다. 이제 매긴 자리에서 바로 보인다.
     하한 0 — 중대가 다 걸리고 일반도 많이 걸려도 음수로 내려가지 않는다.
   최종(대시보드) = QSC×60% + 쇼퍼×30% + 개선현황×10% (하한 0)
     ★'− 중대 차감' 항이 없다★ — 중대는 이미 QSC 점수 안에서 빠졌다. 여기서 또 빼면 두 번 반영된다.
   등급: 우수 93점 이상 / 양호 85 / 보통 76 / 미흡 66 / 주의 55 / 부적합 55 미만
   입력: null(미확인) | 'NA'(해당 없음) | 0 이상 정수(개선 필요 건수) */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Scoring = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  var RULES = {
    general: { total: 100 },   // 일반 문항 전체 배점 — 1건 = total ÷ 해당 일반 문항 수 (generalBase)
    S2: { label: '★', first: 8, more: 2, cap: 45 },
    S1: { label: '★★', first: 12, more: 4, cap: 48 },
  };

  var GRADES = [
    { name: '우수', test: function (s) { return s >= 93; } },
    { name: '양호', test: function (s) { return s >= 85; } },
    { name: '보통', test: function (s) { return s >= 76; } },
    { name: '미흡', test: function (s) { return s >= 66; } },
    { name: '주의', test: function (s) { return s >= 55; } },
    { name: '부적합', test: function () { return true; } },
  ];

  function grade(score) {
    if (score == null) return null;
    return GRADES.find(function (g) { return g.test(score); }).name;
  }

  function normValue(value) {
    if (value == null || value === '') return null;
    if (value === 'NA') return 'NA';
    if (typeof value === 'number' && isFinite(value) && value >= 0) return Math.floor(value);
    return null;
  }

  /* 소수 첫째 자리 반올림 — 엑셀 ROUND(…,1) 과 같은 값
     ★+1e-9 는 딱 반(.x5)에 걸린 값을 엑셀처럼 올리려는 것이다★ — 해당 문항 48개에서 3건이면 1건 점수가
     25/12 라 참값이 23.75 처럼 딱 반이 되는데, 부동소수 계산은 23.7499999… 를 내어 23.7 로 내려갔다
     (엑셀은 23.8 · 2026-09-22 무작위 322건 대조에서 3건 어긋남으로 잡음). 반이 아닌 값은 반에서 1e-4 이상
     떨어져 있어 이 덧셈으로 뒤집히지 않는다. 서버 round1 은 이미 반올림된 값을 받으므로 그대로 둔다. */
  function round1(x) { return Math.round(x * 10 + 1e-9) / 10; }

  /* 일반 문항 1건의 점수 = 100 ÷ 해당 일반 문항 수 (★2026-09-22★)
     해당 = 심각도 없는 문항 중 NA 가 아닌 것. 미확인(빈칸)도 해당으로 센다 — 적는 도중에
     칩 숫자가 흔들리지 않게 하려는 것이고, 빈칸이 하나라도 있으면 QSC 점수는 어차피 안 나온다.
     엑셀 일반 행 F열 수식의 분모 COUNTIFS(I,"")−COUNTIFS(I,"",D,"NA") 와 같은 셈이다.
     items: [{ severity, value }] — 문항 전체(74개)를 넘긴다. */
  function generalBase(items) {
    var n = 0;
    items.forEach(function (it) {
      if (it.severity) return;
      if (normValue(it.value) === 'NA') return;
      n++;
    });
    return { n: n, per: n > 0 ? RULES.general.total / n : 0 };
  }

  /* 문항 하나의 감점(양수). 일반 = 건수 × per, ★/★★ = first + more×(건수−1). NA·미확인은 그대로 반환.
     ★일반 문항은 per(= generalBase(문항 전체).per)가 꼭 있어야 한다★ — 1건의 점수가 그 매장의
     해당 문항 수에 달려 있어서 문항 하나만 보고는 정할 수 없다. 빠뜨리면 옛 「1건 1점」으로
     조용히 돌아가는 대신 바로 멈춘다(시험에서 잡히게). */
  function itemDeduct(value, severity, per) {
    var v = normValue(value);
    if (v === null || v === 'NA') return v;
    if (v === 0) return 0;
    var r = RULES[severity];
    if (r && r.first != null) return r.first + r.more * (v - 1);
    if (typeof per !== 'number' || !isFinite(per)) throw new TypeError('itemDeduct: 일반 문항은 per(1건 점수)가 필요합니다');
    return v * per;
  }

  // 심각도별 합산: 상한 적용 전/후를 함께 반환
  function tierTotal(items, severity) {
    var raw = 0, cases = 0, hit = 0;
    items.forEach(function (it) {
      if (it.severity !== severity) return;
      var d = itemDeduct(it.value, it.severity);
      if (typeof d === 'number' && d > 0) { raw += d; hit++; cases += normValue(it.value); }
    });
    var cap = RULES[severity].cap;
    return { raw: raw, capped: Math.min(cap, raw), cap: cap, capHit: raw >= cap, items: hit, cases: cases };
  }

  /* items: [{ severity: ''|'S1'|'S2', value }] — 문항 전체(74개). 그룹 구분 불필요.
     반환: { qsc(소수 첫째 자리), grade, genDeduct(반올림 전), genCases, genItems, genN, genPer,
             s1, s2, criticalDeduct, blank, na, naCritical, complete } */
  function evaluate(items) {
    var base = generalBase(items);
    var genCases = 0, genItems = 0, blank = 0, na = 0, naCritical = 0;
    items.forEach(function (it) {
      var v = normValue(it.value);
      if (v === null) { blank++; return; }
      if (v === 'NA') { na++; if (it.severity) naCritical++; return; }
      if (!it.severity && v > 0) { genCases += v; genItems++; }
    });
    // 건수 × 100 을 먼저 하고 나눈다 — 딱 떨어지는 값(300/48 = 6.25)이 오차 없이 나와 엑셀과 같은 반올림이 된다
    var genDeduct = base.n ? genCases * RULES.general.total / base.n : 0;
    var s1 = tierTotal(items, 'S1');
    var s2 = tierTotal(items, 'S2');
    var complete = blank === 0;
    var criticalDeduct = s1.capped + s2.capped;
    /* 하한 0 — 일반은 해당 문항을 전부 어기면 그것만으로 100점이 빠지고(같은 문항 여러 건이면 그 이상),
       중대는 그 위에 얹는 벌점(상한 45+48=93)이라 그냥 빼면 음수가 나온다. 음수를 두면 종합점수에서
       QSC 가 자기 몫(60)을 넘어 MS·개선율 몫까지 깎는다. */
    var qsc = complete ? round1(Math.max(0, 100 - genDeduct - criticalDeduct)) : null;
    return {
      qsc: qsc, grade: grade(qsc),
      genDeduct: genDeduct, genCases: genCases, genItems: genItems, genN: base.n, genPer: base.per,
      s1: s1, s2: s2, criticalDeduct: criticalDeduct,
      blank: blank, na: na, naCritical: naCritical, complete: complete,
      // final = QSC 점수. 중대 차감은 이미 qsc 안에 들어 있다.
      final: qsc,
    };
  }

  /* 참고: 최종점수 미리보기 (쇼퍼·개선현황을 알 때만 사용 — 정본은 통합시트)
     ★중대 차감을 빼지 않는다★ — qsc 인자에 이미 반영돼 있다. 두 번째 인자는 옛 호출부와의
     호환을 위해 자리만 남겨 두고 쓰지 않는다. */
  function finalPreview(qsc, _criticalDeductUnused, shopper, improvement) {
    if (qsc == null) return null;
    var s = qsc * 0.6 + (shopper == null ? 0 : shopper * 0.3) + (improvement == null ? 0 : improvement * 0.1);
    return Math.max(0, s);
  }

  /* 쇼퍼 응답: '예'(1) | '아니오'(0) | 1~5(5점 척도 → (n−1)/4 환산) | 'NA' | null
     점수 = 환산 합계 ÷ 응답 수 × 100 (NA·미응답 제외) */
  function shopperConvert(a) {
    if (a === '예') return 1;
    if (a === '아니오') return 0;
    if (typeof a === 'number' && a >= 1 && a <= 5) return (a - 1) / 4;
    return null;
  }
  function shopperScore(answers) {
    var sum = 0, n = 0;
    answers.forEach(function (a) {
      var v = shopperConvert(a);
      if (v != null) { sum += v; n++; }
    });
    if (!n) return { score: null, grade: null, answered: 0, converted: 0 };
    var score = (sum / n) * 100;
    return { score: score, grade: grade(score), answered: n, converted: sum, yes: sum };
  }

  return {
    RULES: RULES, grade: grade, round1: round1, generalBase: generalBase,
    itemDeduct: itemDeduct, evaluate: evaluate, finalPreview: finalPreview,
    shopperConvert: shopperConvert, shopperScore: shopperScore,
  };
});
