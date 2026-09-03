/* 점검 모드(공사중) 잠금 덮개 — 모든 화면 공통

   ★무엇을 하나★
   서버가 점검 중이면(응답 code:'MAINT') 화면 전체를 덮어 아무것도 못 하게 한다.
   담당자가 앱을 고치는 동안 매장이 쓰지 못하게 막는 것이 목적이다.
   ★관리자는 서버가 통과시키므로 이 덮개를 보지 않는다★ — 켠 사람 화면은 평소와 똑같다.
   그래서 켜 둔 것을 잊기 쉽고, 관리 화면의 상태등(adminBadge)이 그것을 막는다.

   ★왜 별도 파일인가★
   요청을 던지는 곳이 두 군데다 — api.js(대부분 화면)와 auth.js(로그인).
   survey.html은 auth.js가 없고 login.html은 api.js가 없어서, 어느 한쪽에 넣으면 화면이 빈다.
   덮개를 여기 모으고 두 곳에서 Maint.saw(응답)만 불러 준다.

   ★「먼저 그리기」와 부딪히지 않게★
   화면은 캐시를 0초에 그리고 서버 답은 0.5~2초 뒤에 온다(v62~v80 구조). 그래서
   ① 답이 오면 그때 덮는다(작성 중이던 내용은 임시저장에 남으므로 잃는 게 없다)
   ② 한 번 막히면 localStorage에 표식을 남겨 ★다음 진입부터는 0초에 덮는다★
   ③ 표식은 10분만 유효하다 — 잘못 남아도 저절로 풀린다(영영 잠기는 사고 방지)

   ★자동 해제★
   덮개가 떠 있는 동안 20초마다 가벼운 요청을 던져, 점검이 끝나면 스스로 새로고침한다.
   매장에 「새로고침 해주세요」를 부탁하지 않아도 되게 하는 것이 요점이다. */
const Maint = (function () {
  'use strict';

  const KEY = 'qsc-maint';
  const MARK_TTL = 10 * 60 * 1000;   // 표식 수명 10분 — 잘못 남아도 저절로 풀린다
  const PROBE_MS = 20 * 1000;        // 덮개가 떠 있는 동안 확인 주기

  let shown = false;
  let timer = null;

  /* ---------- 표식 (localStorage) ---------- */

  function readMark() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const m = JSON.parse(raw);
      if (!m || !m.seen || Date.now() - m.seen > MARK_TTL) { clearMark(); return null; }
      return m;
    } catch (e) { return null; }
  }

  function writeMark(info) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        msg: info.msg || '', at: info.at || '', min: info.min || 0, seen: Date.now()
      }));
    } catch (e) { /* 용량 초과·사생활 모드 — 표식이 없으면 ①번 경로로만 동작한다 */ }
  }

  function clearMark() {
    try { localStorage.removeItem(KEY); } catch (e) { }
  }

  /* ---------- 덮개 ---------- */

  function minutesSince(iso) {
    if (!iso) return -1;
    const t = new Date(iso).getTime();
    if (!t) return -1;
    return Math.max(0, Math.floor((Date.now() - t) / 60000));
  }

  function timeLine(info) {
    const el = minutesSince(info.at);
    const parts = [];
    if (info.min) parts.push(info.min + '분쯤 걸립니다');
    if (el >= 0) parts.push(el + '분 경과');
    return parts.join(' · ');
  }

  function build(info) {
    const box = document.createElement('div');
    box.id = 'maintLock';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-live', 'assertive');
    box.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;background:#fff;' +
      'display:flex;align-items:center;justify-content:center;padding:24px;' +
      'font:15px/1.7 -apple-system,BlinkMacSystemFont,"Malgun Gothic","맑은 고딕",sans-serif;color:#222';

    const card = document.createElement('div');
    card.style.cssText = 'max-width:420px;width:100%;text-align:center';

    const icon = document.createElement('div');
    icon.textContent = '🔧';
    icon.style.cssText = 'font-size:44px;line-height:1;margin-bottom:14px';

    const h = document.createElement('div');
    h.textContent = '앱 공사 중입니다';
    h.style.cssText = 'font-size:20px;font-weight:700;margin-bottom:10px';

    /* ★서버 문구를 textContent로 넣는다★ — 담당자가 쓴 글이 그대로 화면에 나가는 자리라
       innerHTML로 넣으면 따옴표·꺾쇠 하나에 화면이 깨진다. */
    const msg = document.createElement('div');
    msg.textContent = info.msg || '잠시 뒤 다시 시도해 주세요.';
    msg.style.cssText = 'color:#444;margin-bottom:8px;word-break:keep-all';

    const when = document.createElement('div');
    when.id = 'maintWhen';
    when.textContent = timeLine(info);
    when.style.cssText = 'color:#888;font-size:13px;margin-bottom:18px';

    const tail = document.createElement('div');
    tail.textContent = '끝나면 이 화면이 저절로 사라집니다. 그대로 두셔도 됩니다.';
    tail.style.cssText = 'color:#888;font-size:13px;margin-bottom:18px;word-break:keep-all';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '지금 다시 확인';
    btn.style.cssText =
      'appearance:none;border:1px solid #ccc;background:#f7f7f7;border-radius:8px;' +
      'padding:10px 18px;font-size:15px;cursor:pointer;color:#222';
    btn.onclick = function () { location.reload(); };

    card.appendChild(icon);
    card.appendChild(h);
    card.appendChild(msg);
    if (when.textContent) card.appendChild(when);
    card.appendChild(tail);
    card.appendChild(btn);
    box.appendChild(card);
    return box;
  }

  function show(info) {
    if (shown) {                       // 이미 떠 있으면 경과 시간만 고친다
      const w = document.getElementById('maintWhen');
      if (w) w.textContent = timeLine(info);
      return;
    }
    shown = true;
    const put = function () {
      if (document.getElementById('maintLock')) return;
      document.body.appendChild(build(info));
      /* 덮개 뒤 화면이 스크롤되면 잠긴 느낌이 깨진다 */
      try { document.body.style.overflow = 'hidden'; } catch (e) { }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', put);
    } else { put(); }
    startProbe();
  }

  function hide() {
    shown = false;
    stopProbe();
    const el = document.getElementById('maintLock');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    try { document.body.style.overflow = ''; } catch (e) { }
  }

  /* ---------- 자동 해제 ---------- */

  /* 덮개가 떠 있는 동안만 돈다. 가벼운 익명 요청 하나를 던지고, 그 응답은 아래 saw()를 다시 타서
     ok면 새로고침, 여전히 MAINT면 경과 시간만 갱신된다.
     ★api.js가 없는 화면(login.html)은 통째로 새로고침한다★ — 덮개뿐인 화면이라 잃을 게 없다. */
  function startProbe() {
    if (timer) return;
    timer = setInterval(function () {
      try {
        if (window.Api && typeof window.Api.call === 'function') {
          window.Api.call('config.stores', {});
        } else {
          location.reload();
        }
      } catch (e) { /* 조용히 — 다음 주기에 다시 해 본다 */ }
    }, PROBE_MS);
  }

  function stopProbe() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  /* ---------- 바깥에서 부르는 것 ---------- */

  /* 서버 응답을 하나 보여 준다. api.js·auth.js가 응답을 받을 때마다 부른다.
     ★ok 응답 하나로 즉시 푼다★ — 점검이 끝난 것을 가장 먼저 아는 신호다.
     ★code를 안 보고 error 문구를 비교하면 안 된다★ — 문구는 담당자가 언제든 바꾼다. */
  function saw(res) {
    if (!res) return res;
    if (res.code === 'MAINT') {
      const info = { msg: String(res.error || res.msg || ''), at: res.at || '', min: res.min || 0 };
      writeMark(info);
      show(info);
      return res;
    }
    if (res.ok) {
      /* 점검이 끝났다. 덮개가 떠 있었다면 ★새로고침해서 새 화면을 받는다★ —
         공사가 끝났다는 것은 대개 파일이 바뀌었다는 뜻이라, 옛 화면 그대로 두면 안 된다. */
      const had = shown;
      clearMark();
      if (had) { hide(); location.reload(); return res; }
      hide();
    }
    return res;
  }

  /* 화면이 뜨자마자 — 지난번에 막혔던 표식이 살아 있으면 0초에 덮는다.
     ★표식이 10분 지나면 무시한다★ (readMark 안에서 지운다) — 표식 때문에 영영 잠기지 않는다. */
  function boot() {
    const m = readMark();
    if (m) show(m);
  }

  /* 관리 화면 맨 위 상태등. ★관리자는 덮개를 못 보므로 이것이 유일한 흔적이다.★
     host = 띠를 넣을 요소(없으면 body 맨 위). 20초마다 스스로 갱신한다. */
  function adminBadge(host) {
    const mount = host || document.body;
    if (!mount) return;
    let bar = document.getElementById('maintBadge');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'maintBadge';
      bar.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;' +
        'margin:0 0 12px;font-size:14px;font-weight:600;border:1px solid transparent';
      mount.insertBefore(bar, mount.firstChild);
    }
    const paint = function (r) {
      if (!r || !r.ok) { bar.style.display = 'none'; return; }
      bar.style.display = 'flex';
      if (r.on) {
        const el = (typeof r.elapsedMin === 'number') ? r.elapsedMin : minutesSince(r.at);
        bar.style.background = '#fdecec';
        bar.style.borderColor = '#f0b4b4';
        bar.style.color = '#a11';
        bar.textContent = '🔴 공사중 — 매장은 아무것도 할 수 없습니다'
          + (el >= 0 ? ' · ' + el + '분 경과' : '');
      } else {
        bar.style.background = '#eaf7ee';
        bar.style.borderColor = '#b8e0c4';
        bar.style.color = '#186a33';
        bar.textContent = '🟢 작동 중 — 매장이 정상 사용 중입니다';
      }
    };
    const ask = function () {
      if (!window.Api || typeof window.Api.call !== 'function') return;
      window.Api.call('admin.maint', {}).then(paint).catch(function () { });
    };
    ask();
    setInterval(ask, PROBE_MS);
    return { refresh: ask, paint: paint };
  }

  boot();

  return { saw: saw, show: show, hide: hide, adminBadge: adminBadge, isOn: function () { return shown; } };
})();

/* auth.js가 window.Maint로 찾는다(최상위 const는 window의 속성이 되지 않는다 — api.js와 같은 이유) */
try { window.Maint = Maint; } catch (e) { /* 무시 */ }
