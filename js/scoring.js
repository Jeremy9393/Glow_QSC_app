/* QSC 채점 엔진 — 엑셀 'QSC 평가표' 수식을 그대로 이식.
   일반 문항: 점수 = 2 - 건수 (하한 없음) / 중대 문항: 2 - 2x건수 (하한 없음)
   문자 입력: ○=2, △=1, X=0 (중대는 ○/X만) / NA·미입력: 채점 제외
   그룹 점수 = MAX(0, 합계/(응답수*2)*100), 가중치 = 그룹 문항수/전체 문항수
   최종 = 가중 합산(무응답 그룹 가중치 재분배), 하한 0 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Scoring = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const GRADES = [
    { name: '우수', test: function (s) { return s > 93; } },
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

  // value: null(미입력) | 'NA' | '○'|'△'|'X' | 숫자(적발 건수)
  function itemScore(value, critical) {
    if (value == null || value === '') return null;
    if (value === 'NA') return 'NA';
    if (typeof value === 'string') {
      const map = critical ? { '○': 2, 'X': 0 } : { '○': 2, '△': 1, 'X': 0 };
      return value in map ? map[value] : null;
    }
    if (typeof value === 'number' && isFinite(value) && value >= 0) {
      return critical ? 2 - 2 * value : 2 - value;
    }
    return null;
  }

  function itemRating(value, critical) {
    if (value == null || value === '') return null;
    if (value === 'NA') return 'NA';
    if (typeof value === 'string') return itemScore(value, critical) === null ? null : value;
    if (typeof value === 'number' && isFinite(value) && value >= 0) {
      if (critical) return value === 0 ? '○' : 'X';
      return value === 0 ? '○' : value === 1 ? '△' : 'X';
    }
    return null;
  }

  // items: [{ critical: bool, value }]
  function groupScore(items) {
    const nums = [];
    for (const it of items) {
      const s = itemScore(it.value, it.critical);
      if (typeof s === 'number') nums.push(s);
    }
    if (!nums.length) return null;
    const sum = nums.reduce(function (a, b) { return a + b; }, 0);
    return Math.max(0, (sum / (nums.length * 2)) * 100);
  }

  // groups: [{ items: [{critical, value}] }]
  function evaluate(groups) {
    const totalItems = groups.reduce(function (a, g) { return a + g.items.length; }, 0);
    let numer = 0, denom = 0;
    const out = groups.map(function (g) {
      const score = groupScore(g.items);
      const weight = g.items.length / totalItems;
      let answered = 0, na = 0;
      for (const it of g.items) {
        const s = itemScore(it.value, it.critical);
        if (typeof s === 'number') answered++;
        else if (s === 'NA') na++;
      }
      if (score != null) { numer += score * weight; denom += weight; }
      return { score: score, weight: weight, answered: answered, na: na, total: g.items.length };
    });
    const final = denom === 0 ? null : Math.max(0, numer / denom);
    return { groups: out, final: final, grade: grade(final) };
  }

  // answers: ['예'|'아니오'|'NA'|null, ...]
  function shopperScore(answers) {
    let sum = 0, n = 0;
    for (const a of answers) {
      if (a === '예') { sum += 1; n++; }
      else if (a === '아니오') { n++; }
    }
    if (!n) return { score: null, grade: null, answered: 0 };
    const score = (sum / n) * 100;
    return { score: score, grade: grade(score), answered: n, yes: sum };
  }

  return { grade: grade, itemScore: itemScore, itemRating: itemRating, groupScore: groupScore, evaluate: evaluate, shopperScore: shopperScore };
});
