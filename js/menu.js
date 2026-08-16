/* 홈(런처) 메뉴 조립 — 서버 권한(menus)과 아래 등록표를 조인해 카드를 걸러낸다.

   ★이 등록표가 '화면 목록'의 유일한 정본이다. 시트에 '메뉴' 탭을 만들지 않은 이유가 이것이다 —
     시트에 줄을 하나 추가해도 html·js가 없으면 아무 일도 일어나지 않는다. 화면이 존재하는지는
     코드가 알고, 그 화면을 볼 수 있는지만 서버가 정한다.
   ★서버 menus에는 있는데 등록표에 없는 키는 무시하고 console.warn만 남긴다. 앱 갱신은 매장 손에
     달려 있어 구버전 앱이 새 메뉴를 만나는 일이 실제로 생기는데, 그때 홈이 깨지면 안 된다.
   ★카드 뱃지는 역할명이 아니라 '권한 라벨'이다(편집 가능 / 읽기 전용). 역할이 늘어도 이 파일은
     바뀌지 않는다. 화면 어디에도 역할 이름 비교를 두지 않는다.
   ★카드 필터는 편의일 뿐 보안이 아니다. 카드를 손으로 되살려도 서버가 토큰의 u로 시트를 다시
     읽으므로 데이터는 한 톨도 나오지 않는다. */
var Menu = (function () {
  /* order 오름차순이 곧 홈 화면 순서다.
     새 화면 추가 = html 1 + js 1 + 여기 한 줄 + ACTIONS 한 줄 + '역할' 탭 한 줄 + sw.js 2곳.
     "시트 한 줄"이 아니다 — 정직하게 적어 둔다.

     ★title·desc는 index.html의 정적 카드 문구와 한 글자까지 같아야 한다.
       apply()는 이미 있는 카드의 문구를 덮지 않고 뱃지만 바꾸므로, 두 곳이 어긋나면
       "카드가 없어 새로 만들어질 때만 이름이 달라지는" 재현이 어려운 문의가 생긴다. */
  var REG = [
    { key: 'qsc',       title: 'QSC 점검',            desc: '다문항 위생, 매장관리 점검표',     href: 'qsc.html',       order: 10 },
    { key: 'shopper',   title: '미스터리쇼퍼 평가표', desc: '관리자용 미스터리쇼퍼 평가표',     href: 'shopper.html',   order: 20 },
    /* ★dashboard·store 문구는 2026-08-16에 바꿨다★ — '순위표'·'지적 사항'은 이 앱을 매장 사람이
       본다는 사실과 맞지 않는다. 줄 세우기가 아니라 개선을 돕는 도구로 읽혀야 해서
       '전체 대시보드'·'개선요청사항'으로 통일했다. index.html의 정적 카드 문구도 같이 바뀌어 있다. */
    { key: 'dashboard', title: 'QSC 전체 대시보드',   desc: '전 매장 위생·CS·개선 현황',        href: 'dashboard.html', order: 30 },
    { key: 'store',     title: '매장 QSC현황',        desc: '개선요청사항 확인과 개선 보고',    href: 'store.html',     order: 40 },
    { key: 'codes',     title: '제출 코드 관리',      desc: '고객 설문 QR·제출 코드 발급',      href: 'codes.html',     order: 50 },
    /* 계정 관리는 맨 아래(order 60)다. 매일 쓰는 화면이 아니라 매장에서 "로그인이 안 돼요"
       연락이 왔을 때만 여는 도구이므로, 자주 쓰는 카드를 아래로 밀지 않는다.
       권한은 서버 '역할' 탭의 accounts 줄이 정한다 — 여기서 역할 이름을 비교하지 않는다. */
    { key: 'accounts',  title: '계정 관리',           desc: '매장 계정 비밀번호와 사용 여부',   href: 'accounts.html',  order: 60 },
  ];

  function byKey() {
    var m = {};
    REG.forEach(function (r) { m[r.key] = r; });
    return m;
  }

  // 뱃지는 '무엇을 할 수 있는가'만 말한다. 역할이 무엇인지는 화면의 관심사가 아니다.
  function badgeOf(m) { return (m && m.write) ? '편집 가능' : '읽기 전용'; }

  function build(r) {
    var a = document.createElement('a');
    a.className = 'menuCard';
    a.href = r.href;
    a.setAttribute('data-menu', r.key);

    var mi = document.createElement('span');
    mi.className = 'mi';
    var mt = document.createElement('span');
    mt.className = 'mt';
    mt.textContent = r.title;
    var md = document.createElement('span');
    md.className = 'md';
    md.textContent = r.desc;
    mi.appendChild(mt);
    mi.appendChild(md);

    var tag = document.createElement('span');
    tag.className = 'tag';

    var ar = document.createElement('span');
    ar.className = 'arrow';
    ar.textContent = '›';

    a.appendChild(mi);
    a.appendChild(tag);
    a.appendChild(ar);
    return a;
  }

  function setBadge(card, m) {
    var tag = card.querySelector('.tag');
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'tag';
      var ar = card.querySelector('.arrow');
      if (ar) card.insertBefore(tag, ar); else card.appendChild(tag);
    }
    tag.textContent = badgeOf(m);
  }

  /* menus = 서버가 준 [{key,read,write}] 배열, nav = 카드가 담긴 컨테이너(기본 '.menu').
     반환값 = 화면에 남은 카드 수. 0이면 호출부(index.html)가 안내 한 줄을 띄운다 —
     문구는 그쪽이 정본이다("아직 이용할 수 있는 화면이 없습니다. 감사총무팀에 문의해 주세요."). */
  function apply(menus, nav) {
    nav = nav || document.querySelector('.menu');
    if (!nav) return 0;

    var known = byKey();
    var perm = {};
    (menus || []).forEach(function (m) {
      if (!m || !m.key) return;
      if (!known[m.key]) { console.warn('[menu] 등록표에 없는 메뉴 키라 무시합니다: ' + m.key); return; }
      // 읽기도 쓰기도 없으면 없는 것과 같다(빈칸·오타는 전부 거짓 — 서버 '역할' 탭 규칙과 같은 방향)
      if (m.read || m.write) perm[m.key] = m;
    });

    var shown = 0;
    REG.slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (r) {
      var card = nav.querySelector('[data-menu="' + r.key + '"]');
      if (!perm[r.key]) { if (card) card.remove(); return; }
      if (!card) card = build(r);
      setBadge(card, perm[r.key]);
      // appendChild는 이미 붙어 있는 노드를 '이동'시킨다 — 등록표 순서가 그대로 화면 순서가 된다
      nav.appendChild(card);
      shown++;
    });

    /* data-menu가 없는 카드는 판정할 근거가 없으므로 건드리지 않는다.
       (구버전 index.html이 캐시에 남아 있을 때 홈이 통째로 비는 편이 더 나쁘다) */
    nav.querySelectorAll('.menuCard:not([data-menu])').forEach(function (el) {
      console.warn('[menu] data-menu 속성이 없는 카드가 있어 권한 판정에서 제외했습니다.', el.getAttribute('href'));
    });

    return shown;
  }

  /* 카드에 인앱 알림 배지를 붙인다 (notify.badge 응답의 store 객체를 그대로 넘긴다).
       info = { todo:미완료, new:최근접속 이후 새로 등록된 건, overdue:예정일이 지난 미완료 건 }

     ★권한 뱃지(.tag)와 성격이 다르다★ — .tag는 '무엇을 할 수 있는가'라 카드가 그려질 때 함께 정해지지만,
       이 배지는 시트를 읽어야 알 수 있어 1~3초 뒤에 도착한다. 그래서 apply()에 넣지 않고 따로 뒀다.
       카드는 배지 없이 먼저 완성되어 있어야 하고, 이 함수가 끝내 불리지 않아도 홈은 멀쩡해야 한다.
     ★todo가 0이면 아무것도 그리지 않고 기존 배지를 지운다 — '0건'을 굳이 보여 주면
       매달 초 26개 매장 전부에 회색 0이 붙어 배지가 신호로서 죽는다.
     ★숫자는 textContent로만 넣는다. 서버에서 온 값이라 화면에 마크업으로 해석될 여지를 두지 않는다. */
  function mark(key, info, nav) {
    nav = nav || document.querySelector('.menu');
    if (!nav) return 0;
    var card = nav.querySelector('[data-menu="' + key + '"]');
    if (!card) return 0;

    var old = card.querySelector('.mBadge');
    if (old) old.remove();                       // 다시 그릴 때 배지가 겹쳐 붙는 것을 막는다

    var todo = Math.max(0, Math.floor(Number(info && info.todo) || 0));
    var fresh = Math.max(0, Math.floor(Number(info && info['new']) || 0));
    var late = Math.max(0, Math.floor(Number(info && info.overdue) || 0));
    if (!todo && !fresh) return 0;

    var box = document.createElement('span');
    box.className = 'mBadge';

    if (todo) {
      var c = document.createElement('span');
      // 예정일이 지난 건이 섞여 있으면 같은 숫자라도 더 급한 것이다 — 색을 채워 구분한다
      c.className = late ? 'mCount hot' : 'mCount';
      /* 숫자만 넣는다. 앞에 '●' 같은 표식을 붙이면 배지가 12px 넓어지는데,
         375px 화면에서 '매장 QSC현황' 카드는 딱 그만큼이 모자라 설명 줄이 두 줄로 접힌다
         (실측: 배지 없음 76px → ● 포함 93px → 숫자만 76px. 제목이 '우리 매장 QSC현황'이던
         시절의 측정값이라 지금은 여유가 더 있지만, 규칙을 되돌릴 이유는 없다).
         빨간 알약 자체가 이미 표식이다. */
      c.textContent = String(todo);
      /* 색만으로 구분하면 흑백·색약 화면에서 사라진다. 눌러 보기 전에 이유를 알 수 있게 남긴다.
         ★같은 숫자를 부르는 이름을 앱 전체에서 하나로 맞춘다★ — 서버 todo의 정의는 '완료가 아닌 건'
           인데, 이 배지만 '미완료'라 부르고 매장 화면은 '시작 전/진행/완료', 하단바는 '개선요청'이라
           불러 세 이름이 같은 수를 가리켰다. 남은 일의 이름은 '개선요청'이다.
         '지연'이 아니라 '예정일 지남'인 이유도 같다(store-app.js와 같은 규칙) — 늦은 사람을
           탓하는 말이 아니라 날짜 사실만 알리는 말이어야 한다. */
      c.title = late ? ('남은 개선요청 ' + todo + '건 · 예정일 지남 ' + late + '건') : ('남은 개선요청 ' + todo + '건');
      box.appendChild(c);
    }
    if (fresh) {
      var n = document.createElement('span');
      n.className = 'mNew';
      n.textContent = 'NEW';
      n.title = '새로 등록된 개선요청 ' + fresh + '건';
      box.appendChild(n);
    }

    // 권한 뱃지(.tag) 왼쪽에 둔다 — 화살표와 권한 라벨의 자리는 카드마다 같아야 눈이 헤매지 않는다
    var tag = card.querySelector('.tag');
    if (tag) card.insertBefore(box, tag); else card.appendChild(box);
    return todo;
  }

  return { REG: REG, apply: apply, badgeOf: badgeOf, mark: mark };
})();
