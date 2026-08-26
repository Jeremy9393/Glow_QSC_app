/* 관리자 도구 — 관리용 화면의 입구 · 쓰기 스위치 (2026-08-26)

   ★관리용 화면은 전부 여기로 모은다★ — 홈은 매장 사람도 보는 자리라 관리 도구가 늘어날수록
     카드가 붐빈다. 관리자만 들어오는 이 화면을 입구로 삼는다. 목록은 admin.html에 정적으로
     적어 둔다(권한 판정이 필요 없다 — 이 화면에 들어온 것 자체가 이미 관리자라는 뜻이다).

   ★쓰기 스위치는 여기서만 바꿀 수 있다★ — 스크립트 속성이 50개를 넘어 구글 설정 화면이
     읽기 전용이 되었기 때문이다(구글 제한). 그래서 서버 admin.switches 를 통해 바꾼다.

   2026-08-26: 「제출 되돌리기」 칸은 뺐다 — 구조를 다시 잡은 뒤에 넣기로 했다(담당자 결정).
     ★서버 기능(admin.undoSubmit)은 그대로 살아 있다★. 지금은 브라우저 콘솔로 부른다.

   권한은 서버가 정한다. admin.* 액션이 전부 menu:'accounts' 라 이 화면도 같은 열쇠를 쓴다
   (admin.html 의 Auth.guard('accounts')). 여기서 역할 이름을 비교하지 않는다. */
(async function () {
  const $ = function (s, el) { return (el || document).querySelector(s); };
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
