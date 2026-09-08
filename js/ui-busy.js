/* 기다림 표시 — 화면 가운데 도는 동그라미 (모든 화면 공통)

   ★왜 만들었나★ (2026-09-08 담당자)
     *"앱에서 제출 같은거 누르거나 페이지 넘어갈때 제출중 혹은 넘어가는중 뭐 이런식으로 뜨잖아
       그때 화면 가운데 동그라미 돌게 하는 모션 띄울수 있어?
       사용자 제출중하거나 뭘 눌렀을때 제출중인지 멈춘건지 잘 구분이 안가서"*

     지금까지는 ★버튼 글자만★ 「전송 중…」으로 바뀌었다. 버튼은 화면 아래에 있고 글자도 작아서,
     누른 사람이 화면 위쪽을 보고 있으면 아무 일도 안 일어난 것처럼 보인다.
     이 앱의 왕복은 2초, 서버가 잠들어 있었으면 ★11초★다 — 그동안 매장은 「멈췄나?」 하고
     다시 누른다. 화면 가운데를 덮으면 ①무슨 일이 일어나는지 보이고 ②다시 못 누른다.

   ★점검 모드 덮개(maint.js)와 다른 것★
     저쪽은 「서버가 막았다 — 아무것도 하지 마라」이고, 이쪽은 「내가 기다리는 중이다」다.
     겹칠 일이 없다(점검이면 요청이 시작되기 전에 막힌다). 그래서 파일을 따로 둔다.

   ★쓰는 법★
     Busy.on('전송 중입니다…');   // 겹쳐 불러도 안전 — 센다
     Busy.off();                  // 부른 만큼 꺼야 사라진다
     Busy.wrap(async () => {...}, '저장 중입니다…');   // 끝나면 알아서 끈다(예외가 나도)

   ★스스로 풀린다★
     off() 를 못 부르는 길(예외·조기 return)이 하나라도 있으면 화면이 영영 잠긴다.
     그래서 60초 뒤에는 스스로 걷히고 콘솔에 남긴다. ★덮개는 덤이지 본체가 아니다★ */
const Busy = (function () {
  'use strict';

  const MIN_MS = 300;        // 너무 빨리 끝나도 이만큼은 보여 준다 (번쩍임 방지)
  const SLOW_MS = 6000;      // 이만큼 지나면 「서버를 깨우는 중」이라고 알려 준다
  const MAX_MS = 60000;      // ★안전장치★ — 이만큼 지나면 스스로 걷힌다

  let box = null;            // 덮개 element
  let msgEl = null;
  let subEl = null;
  let depth = 0;             // 겹쳐 부른 횟수
  let shownAt = 0;
  let slowTimer = null;
  let maxTimer = null;
  let hideTimer = null;

  function build() {
    if (box) return box;
    box = document.createElement('div');
    box.className = 'busyWrap';
    box.id = 'busyWrap';
    /* ★role=status + aria-live★ — 화면을 못 보는 사람에게도 「지금 기다리는 중」이 읽힌다.
       alertdialog 가 아니라 status 인 이유: 이건 답을 요구하는 창이 아니라 상태 알림이다. */
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML =
      '<div class="busyCard">' +
      '<div class="busySpin" aria-hidden="true"></div>' +
      '<div class="busyMsg"></div>' +
      '<div class="busySub"></div>' +
      '</div>';
    msgEl = box.querySelector('.busyMsg');
    subEl = box.querySelector('.busySub');
    document.body.appendChild(box);
    return box;
  }

  function clearTimers() {
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  function hideNow(why) {
    depth = 0;
    clearTimers();
    if (box) box.classList.remove('on');
    if (why) console.warn('[Busy] ' + why);
  }

  return {
    /* msg 를 안 주면 「처리 중입니다…」 — 무엇을 기다리는지 적어 주는 편이 늘 낫다
       autoOff(ms) 를 주면 그만큼 뒤에 스스로 걷힌다 — 화면 이동처럼 ★off 를 부를 사람이
       없는 경우★에 쓴다(이동이 되면 페이지가 통째로 바뀌므로 이 시계는 의미가 없어진다). */
    on: function (msg, autoOff) {
      try {
        build();
        depth++;
        if (depth > 1) {                     // 이미 떠 있으면 문구만 갈아 끼운다
          if (msg) msgEl.textContent = msg;
          return;
        }
        msgEl.textContent = msg || '처리 중입니다…';
        subEl.textContent = '';
        shownAt = Date.now();
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        box.classList.add('on');
        clearTimers();
        /* 6초가 지나면 「멈춘 게 아니다」를 말해 준다 — 앱스 스크립트 콜드 스타트가 11초다.
           그 말이 없으면 사람은 6초쯤에서 앱을 닫는다. */
        slowTimer = setTimeout(function () {
          if (subEl) subEl.textContent = '서버를 깨우는 중입니다. 조금만 기다려 주세요…';
        }, SLOW_MS);
        maxTimer = setTimeout(function () {
          hideNow(autoOff ? '' :
            '60초가 지나 덮개를 스스로 걷었습니다 — off() 를 못 부른 길이 있습니다');
        }, autoOff || MAX_MS);
      } catch (e) {
        /* ★여기서 예외를 밖으로 내보내지 않는다★ — 덮개 때문에 제출이 막히면 본말이 뒤집힌다 */
        console.warn('[Busy] on 실패', e);
      }
    },

    off: function () {
      try {
        if (depth > 0) depth--;
        if (depth > 0 || !box) return;
        clearTimers();
        /* 너무 빨리 끝났으면 조금 더 보여 준다 — 번쩍이고 마는 것이 더 어지럽다 */
        const left = MIN_MS - (Date.now() - shownAt);
        if (left > 0) {
          hideTimer = setTimeout(function () { box.classList.remove('on'); }, left);
        } else {
          box.classList.remove('on');
        }
      } catch (e) {
        console.warn('[Busy] off 실패', e);
      }
    },

    /* 무슨 일이 있어도 끄고 싶을 때 (화면 전환 직전 등) */
    reset: function () { hideNow(''); },

    /* 가장 안전한 쓰는 법 — 예외가 나도 반드시 꺼진다 */
    wrap: async function (fn, msg) {
      Busy.on(msg);
      try {
        return await fn();
      } finally {
        Busy.off();
      }
    },
  };
})();

/* ★화면을 여는 링크는 알아서 잡는다★ (2026-09-08 담당자 — *"페이지 넘어갈때"*)
   홈의 메뉴 카드는 평범한 <a href="qsc.html"> 다. 누르고 새 화면이 그려질 때까지
   느린 폰에서는 흰 화면이 한참 보인다 — 눌린 건지 아닌지 알 수가 없다.

   ★조건을 좁게 잡는다★ — 새 창·다운로드·같은 문서 안 이동(#)·mailto 는 건너뛴다.
     이동이 아닌 것에 덮개를 씌우면 그 화면은 아무 일도 안 하는데 잠긴 것처럼 보인다.
   ★4초 자동 해제★ — 다른 코드가 preventDefault 로 이동을 막았을 수 있다.
     이동이 되면 페이지가 통째로 바뀌므로 이 시계는 쓰이지 않는다. */
document.addEventListener('click', function (e) {
  try {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return;
    if (/^(mailto:|tel:|javascript:|blob:|data:)/i.test(href)) return;
    if (!/\.html(\?|#|$)/i.test(href)) return;      // 이 앱의 화면으로 가는 것만
    Busy.on('화면을 여는 중입니다…', 4000);
  } catch (err) { /* 덮개 때문에 이동이 막히면 본말이 뒤집힌다 */ }
});

/* ★페이지를 떠날 때는 덮개를 켠 채로 둔다★ — 새 화면이 그려질 때까지 흰 화면만 보이는 것보다
   「넘어가는 중」이 떠 있는 편이 낫다. 되돌아왔을 때(뒤로가기·bfcache)는 반드시 걷는다 —
   안 걷으면 지난 덮개가 그대로 남아 화면이 잠긴 것처럼 보인다. */
window.addEventListener('pageshow', function (e) {
  if (e.persisted) Busy.reset();
});
