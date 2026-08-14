# -*- coding: utf-8 -*-
"""매장별 설문 QR 생성 → data/qr.json

현장 미스터리쇼퍼가 관리자 폰의 QR을 찍어 설문에 들어오는 용도.
QR에는 매장 링크만 담는다 — 제출 코드는 담지 않는다(코드는 제출할 때 손으로 입력).
그래서 QR이 남에게 찍혀도 코드 없이는 제출할 수 없다.

브라우저에서 QR을 그리지 않고 여기서 미리 만들어 두는 이유:
 - QR 인코딩을 직접 구현하면 스캔 실패 위험이 있다 (검증된 라이브러리 결과를 그대로 쓴다)
 - 앱은 오프라인에서도 떠야 한다 (외부 QR API 호출 불가)

매장이 바뀌면: python tools/extract_master.py → python tools/make_qr.py 순서로 실행.
필요 패키지: pip install segno

실행: python tools/make_qr.py
"""
import sys, io, json, base64
from pathlib import Path
from urllib.parse import quote
import segno

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / 'data' / 'master.json'
OUT = ROOT / 'data' / 'qr.json'
BASE = 'https://jeremy9393.github.io/Glow_QSC_app/'

master = json.loads(MASTER.read_text(encoding='utf-8'))
stores = master.get('stores') or []
assert stores, 'master.json에 매장 목록이 없습니다 — extract_master.py 먼저 실행'

out = {'base': BASE, 'generatedFrom': master.get('version'), 'stores': {}, 'urls': {}}
sizes = []
for name in stores:
    url = BASE + 'survey.html?store=' + quote(name)
    qr = segno.make(url, error='m')          # 오류정정 M — 화면 반사·구겨짐에 여유
    buf = io.BytesIO()
    # 1px/모듈 — 화면에서 CSS로 확대(픽셀 유지). 앱이 다크 테마라 흰 바탕을 명시해야 스캔이 된다
    qr.save(buf, kind='png', scale=1, border=2, dark='#000000', light='#ffffff')
    b64 = base64.b64encode(buf.getvalue()).decode()
    out['stores'][name] = 'data:image/png;base64,' + b64
    out['urls'][name] = url
    sizes.append(len(b64))
    print('%-16s v%-2s %3d바이트  %s' % (name, qr.version, len(b64), url))

OUT.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
print('\n매장 %d개 · 평균 %d바이트 · 파일 %.1fKB' % (len(stores), sum(sizes) / len(sizes), OUT.stat().st_size / 1024))
print('저장:', OUT)
