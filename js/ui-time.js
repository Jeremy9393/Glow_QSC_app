/* 방문 시간 드롭다운 (시 · 분) — QSC 점검·미스터리쇼퍼가 함께 쓰는 단일 소스.
   저장 형식은 'HH:MM' 문자열 하나 (예: '14:30') — 시·분 중 하나라도 비면 빈 문자열.
   분은 5분 단위 12칸: 폰에서 손가락으로 고르기 편한 최소 단위. */
var TimePick = (function () {
  var STEP = 5;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function el(id) { return document.getElementById(id); }

  return {
    STEP: STEP,

    /* id 'time' → <select id="timeH"> · <select id="timeM"> 한 쌍을 그린다 */
    html: function (id) {
      var h = '<option value="">시</option>';
      for (var i = 0; i < 24; i++) h += '<option value="' + pad(i) + '">' + pad(i) + '시</option>';
      var m = '<option value="">분</option>';
      for (var j = 0; j < 60; j += STEP) m += '<option value="' + pad(j) + '">' + pad(j) + '분</option>';
      return '<div class="timepair">' +
        '<select id="' + id + 'H" class="sel-sm">' + h + '</select>' +
        '<select id="' + id + 'M" class="sel-sm">' + m + '</select></div>';
    },

    get: function (id) {
      var h = el(id + 'H'), m = el(id + 'M');
      if (!h || !m || !h.value || !m.value) return '';
      return h.value + ':' + m.value;
    },

    set: function (id, v) {
      var h = el(id + 'H'), m = el(id + 'M');
      if (!h || !m) return;
      var p = String(v || '').split(':');
      h.value = p[0] || '';
      // 5분 단위가 아닌 값(예전 기록·직접 입력)은 가장 가까운 아래 눈금으로 맞춘다
      var mm = parseInt(p[1], 10);
      m.value = isNaN(mm) ? '' : pad(Math.floor(mm / STEP) * STEP);
    },

    /* 지금 시각 (분은 5분 단위로 내림) — QSC 점검처럼 '현장에서 바로 쓰는' 화면의 기본값 */
    now: function () {
      var d = new Date();
      return pad(d.getHours()) + ':' + pad(Math.floor(d.getMinutes() / STEP) * STEP);
    },

    onChange: function (id, fn) {
      [el(id + 'H'), el(id + 'M')].forEach(function (s) { if (s) s.addEventListener('change', fn); });
    },
  };
})();
