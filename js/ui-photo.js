/* 사진 첨부 공통 부품 — QSC 점검(문항별 증빙)과 미스터리쇼퍼(영수증)가 함께 쓴다.
   원본을 그대로 올리면 폰 사진 한 장이 수 MB라 제출이 느려지므로, 긴 변 1280px·JPEG 80%로 줄여서 보낸다.
   저장 형식은 data:image/jpeg;base64,... 문자열 배열. */
var PhotoPick = (function () {
  /* 용량 상한제 — 해상도만 줄이면 사진 내용에 따라 크기가 들쭉날쭉해서(복잡한 매장 사진은 500KB 초과),
     '한 장 몇 KB 이하'를 목표로 두고 품질을 낮춰가며 다시 인코딩한다.
     드라이브 용량과 폰 업로드 시간이 예측 가능해진다. 캔버스로 다시 그리므로 위치정보(EXIF)도 함께 제거된다. */
  var MAX_PX = 1280;                    // 긴 변 — 영수증 글씨가 읽히는 선
  var TARGET_BYTES = 180 * 1024;        // 한 장 목표 용량
  var QUALITY_STEPS = [0.8, 0.65, 0.5, 0.4];
  var PX_STEPS = [1280, 1024, 800];     // 최저 품질로도 목표를 못 맞추면 해상도를 한 단계 낮춘다

  function bytesOf(dataUrl) {
    var i = dataUrl.indexOf(',') + 1;
    return Math.round((dataUrl.length - i) * 0.75);
  }
  function render(img, px) {
    var w = img.width, h = img.height;
    if (Math.max(w, h) > px) {
      var k = px / Math.max(w, h);
      w = Math.round(w * k); h = Math.round(h * k);
    }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.fillStyle = '#fff';               // 투명 PNG가 검게 변하는 것 방지
    g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    return c;
  }

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var best = null;
        for (var p = 0; p < PX_STEPS.length; p++) {
          var c = render(img, PX_STEPS[p]);
          for (var q = 0; q < QUALITY_STEPS.length; q++) {
            var url = c.toDataURL('image/jpeg', QUALITY_STEPS[q]);
            best = url;
            if (bytesOf(url) <= TARGET_BYTES) {  // 목표 달성 — 더 낮출 필요 없음
              URL.revokeObjectURL(img.src);
              return resolve(url);
            }
          }
        }
        URL.revokeObjectURL(img.src);
        resolve(best);                  // 최저 해상도·최저 품질까지 갔을 때의 최선
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /* box 안에 [사진 버튼 + 썸네일]을 그린다.
     opts: { id, label, max, hint, onChange }
     반환: { get, set, count } — 사진은 브라우저 임시저장(localStorage)에 넣지 않는다(용량 초과 위험) */
  function mount(box, opts) {
    opts = opts || {};
    var max = opts.max || 3;
    var id = opts.id || 'photo';
    var list = [];
    box.classList.add('photoField');
    box.innerHTML =
      '<button type="button" class="photoBtn wide" id="' + id + 'Btn"></button>' +
      '<div class="thumbs"></div>' +
      (opts.hint ? '<div class="photoHint">' + opts.hint + '</div>' : '') +
      '<input type="file" accept="image/*" multiple hidden>';
    var btn = box.querySelector('.photoBtn');
    var thumbs = box.querySelector('.thumbs');
    var input = box.querySelector('input[type=file]');

    function render() {
      btn.textContent = list.length
        ? (opts.label || '사진') + ' ' + list.length + '장 · 추가하기'
        : (opts.label || '사진') + ' 첨부하기';
      btn.className = 'photoBtn wide' + (list.length ? ' has' : ' need');
      thumbs.innerHTML = '';
      list.forEach(function (url, i) {
        var im = document.createElement('img');
        im.src = url;
        im.title = '누르면 삭제';
        im.onclick = function () {
          if (!confirm('이 사진을 삭제할까요?')) return;
          list.splice(i, 1);
          render();
          if (opts.onChange) opts.onChange(list);
        };
        thumbs.appendChild(im);
      });
    }

    btn.onclick = function () { input.click(); };
    input.addEventListener('change', async function (e) {
      var files = Array.prototype.slice.call(e.target.files);
      e.target.value = '';
      if (!files.length) return;
      btn.disabled = true;
      var prev = btn.textContent;
      btn.textContent = '사진 처리 중…';
      try {
        for (var i = 0; i < files.length; i++) {
          if (list.length >= max) { alert('사진은 최대 ' + max + '장까지 첨부할 수 있습니다.'); break; }
          list.push(await shrink(files[i]));
        }
      } catch (err) {
        btn.textContent = prev;
        alert('사진을 불러오지 못했습니다. 다시 시도해 주세요.');
      }
      btn.disabled = false;
      render();
      if (opts.onChange) opts.onChange(list);
    });

    render();
    return {
      get: function () { return list.slice(); },
      set: function (arr) { list = (arr || []).slice(0, max); render(); },
      count: function () { return list.length; },
    };
  }

  return { shrink: shrink, mount: mount, MAX_PX: MAX_PX, TARGET_BYTES: TARGET_BYTES, bytesOf: bytesOf };
})();
