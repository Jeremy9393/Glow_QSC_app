/* 저장 연동 계층.
   APPS_SCRIPT_URL이 비어 있으면 모의 저장(브라우저 localStorage) — 개발·데모용.
   구글 앱스 스크립트 배포 후 URL을 넣으면 실제 스프레드시트/드라이브에 저장된다. */
const Api = (function () {
  const CONFIG = {
    APPS_SCRIPT_URL: '', // 배포 후 웹앱 URL 입력 (예: https://script.google.com/macros/s/.../exec)
  };

  function photoCount(payload) {
    if (!payload.items) return 0;
    return payload.items.reduce(function (a, it) { return a + (it.photos ? it.photos.length : 0); }, 0);
  }

  async function submit(type, payload) {
    if (!CONFIG.APPS_SCRIPT_URL) {
      const key = 'qsc-mock-' + type;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      const copy = JSON.parse(JSON.stringify(payload));
      if (copy.items) copy.items.forEach(function (it) { if (it.photos) it.photos = it.photos.length; });
      copy._savedAt = new Date().toISOString();
      list.push(copy);
      localStorage.setItem(key, JSON.stringify(list));
      return { ok: true, mock: true, count: list.length, photos: photoCount(payload) };
    }
    // text/plain으로 보내면 CORS 사전요청 없이 앱스 스크립트가 받을 수 있음
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: type, payload: payload }),
    });
    return res.json();
  }

  // 통합시트의 실시간 상태(매장 목록 등) 조회.
  // 성공 시 localStorage에 캐시 → 오프라인(지하 매장 등)이면 마지막 성공본 사용.
  // URL이 없으면(연동 전) null → 화면은 master.json 저장본으로 동작.
  async function getConfig() {
    if (!CONFIG.APPS_SCRIPT_URL) return null;
    try {
      const res = await fetch(CONFIG.APPS_SCRIPT_URL + '?action=config');
      const cfg = await res.json();
      if (cfg && cfg.ok) {
        localStorage.setItem('qsc-live-config', JSON.stringify(cfg));
        return cfg;
      }
    } catch (e) { /* 오프라인 등 — 캐시로 폴백 */ }
    try { return JSON.parse(localStorage.getItem('qsc-live-config') || 'null'); } catch (e) { return null; }
  }

  return { submit: submit, getConfig: getConfig, CONFIG: CONFIG };
})();
