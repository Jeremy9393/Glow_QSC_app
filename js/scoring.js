/* QSC 채점 엔진 — 엑셀 v3.7 '절대 감점제'를 그대로 이식.
   일반 문항: 1건 = −1점 (영역 구분 없음, 하한 없이 누적)
   ★  중대운영(S2): 문항당 −8, 같은 문항 추가 건당 −2, 합계 상한 −45
   ★★ 즉시위해(S1): 문항당 −12, 같은 문항 추가 건당 −4, 합계 상한 −48
   QSC 점수 = MAX(0, 100 − 일반 감점 − 중대 차감)   ★2026-08-18 변경★
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
    general: { per: 1 },
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

  // 문항 하나의 감점(양수). 일반 = 건수×1, ★/★★ = first + more×(건수−1). NA·미확인은 그대로 반환.
  function itemDeduct(value, severity) {
    var v = normValue(value);
    if (v === null || v === 'NA') return v;
    if (v === 0) return 0;
    var r = RULES[severity];
    if (r && r.first != null) return r.first + r.more * (v - 1);
    return v * RULES.general.per;
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

  /* items: [{ severity: ''|'S1'|'S2', value }] (그룹 구분 불필요 — 절대 감점제)
     반환: { qsc, grade, genDeduct, genCases, genItems, s1, s2, criticalDeduct,
             blank, na, naCritical, complete } */
  function evaluate(items) {
    var genDeduct = 0, genCases = 0, genItems = 0, blank = 0, na = 0, naCritical = 0;
    items.forEach(function (it) {
      var v = normValue(it.value);
      if (v === null) { blank++; return; }
      if (v === 'NA') { na++; if (it.severity) naCritical++; return; }
      if (!it.severity && v > 0) { genDeduct += v * RULES.general.per; genCases += v; genItems++; }
    });
    var s1 = tierTotal(items, 'S1');
    var s2 = tierTotal(items, 'S2');
    var complete = blank === 0;
    var criticalDeduct = s1.capped + s2.capped;
    // 하한 0 — 상한이 45+48=93이고 일반 감점은 상한이 없으므로, 그냥 빼면 음수가 나온다
    var qsc = complete ? Math.max(0, 100 - genDeduct - criticalDeduct) : null;
    return {
      qsc: qsc, grade: grade(qsc),
      genDeduct: genDeduct, genCases: genCases, genItems: genItems,
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
    RULES: RULES, grade: grade,
    itemDeduct: itemDeduct, evaluate: evaluate, finalPreview: finalPreview,
    shopperConvert: shopperConvert, shopperScore: shopperScore,
  };
});
