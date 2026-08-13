# -*- coding: utf-8 -*-
"""엑셀(QSC 평가 체계 개편_v3.xlsx) → data/master.json 추출.

엑셀 시트가 문항·심각도의 원본. 시트 수정 후 이 스크립트를 다시 실행하면
앱 마스터 데이터가 갱신된다. 실행: python tools/extract_master.py

v3.7 구조(2026-08-13):
 - 74문항(행 10~83), 판정(○△X) 폐지 — '개선 필요 건수'만 입력
 - 심각도 = I열 코드(S1=★★ 즉시위해 / S2=★ 중대운영 / 공란=일반)
 - 절대 감점제: 일반 1건 −1 / ★ 문항당 −8·추가 −2·합계 상한 −45
   / ★★ 문항당 −12·추가 −4·합계 상한 −48. QSC = MAX(0, 100 − 일반 감점)
 - 대분류 가중치 폐지(H열 태그는 영역 참고표 전용)
 - 쇼퍼: 11~40행 예/아니오, 41~50행(11·12·13 카테고리) 5점 척도(NA 불가)
 - 등급: 우수 93점 이상(2026-08-12 결정)
"""
import sys, io, json, re, warnings
from pathlib import Path
import openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
warnings.filterwarnings('ignore')

SRC = r'C:\Users\glow-pc-017\Desktop\Ai\1. QSC\QSC 평가 체계 개편_v3.xlsx'
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'master.json'

wb = openpyxl.load_workbook(SRC)
ws = wb['QSC 평가표']

GROUPS = [(10, 16), (17, 27), (28, 40), (41, 55), (56, 65), (66, 83)]

qsc_groups = []
item_no = 0
sev_count = {'S1': 0, 'S2': 0}
for g0, g1 in GROUPS:
    gname = ws[f'A{g0}'].value
    items = []
    for r in range(g0, g1 + 1):
        item_no += 1
        text = str(ws[f'C{r}'].value or '').strip()
        m = re.match(r'^([A-F]-\d{2}[ab]?)\.\s*(.*)$', text)
        code = m.group(1) if m else None
        if m:
            text = m.group(2)
        sev = str(ws[f'I{r}'].value or '').strip()      # S1 / S2 / ''
        if sev not in ('S1', 'S2'):
            sev = ''
        if sev:
            sev_count[sev] += 1
        items.append({
            'no': item_no, 'code': code, 'row': r, 'text': text,
            'severity': sev,                 # '' | 'S2'(★) | 'S1'(★★)
            'critical': bool(sev),           # 구버전 호환 필드
        })
    name = str(gname).strip().replace('\n', ' ') if gname else ''
    qsc_groups.append({'name': name, 'count': g1 - g0 + 1, 'items': items})

assert item_no == 74, f'문항 수 {item_no} — 74가 아님. GROUPS 범위 확인 필요'
assert sev_count == {'S1': 4, 'S2': 12}, f'심각도 분포 {sev_count} — ★★4/★12가 아님. I열 확인 필요'

sh = wb['미스터리쇼퍼 평가표']
LIKERT_ROWS = set(range(41, 51))            # 11·12·13 카테고리 = 5점 척도
cat_anchors = {}
for m in sh.merged_cells.ranges:
    if m.min_col == 1 and 11 <= m.min_row <= 50:
        cat_anchors[m.min_row] = (m.min_row, m.max_row)
shopper_cats = []
q_no = 0
for a in sorted(cat_anchors):
    r0, r1 = cat_anchors[a]
    name = sh[f'A{r0}'].value
    qs = []
    for r in range(r0, min(r1, 50) + 1):
        v = sh[f'C{r}'].value
        if v:
            q_no += 1
            qs.append({
                'no': q_no, 'row': r, 'text': str(v).strip(),
                'scale': 'likert' if r in LIKERT_ROWS else 'yn',
            })
    shopper_cats.append({'name': str(name).strip().replace('\n', ' ') if name else '', 'questions': qs})
assert q_no == 40, f'쇼퍼 문항 수 {q_no} — 40이 아님'
n_likert = sum(1 for c in shopper_cats for q in c['questions'] if q['scale'] == 'likert')
assert n_likert == 10, f'5점 척도 문항 {n_likert} — 10이 아님'

# 매장 목록: 통합시트의 표시 행만 (숨김 행 = 폐점·검사 제외 매장)
DASH = Path(SRC).parent / '[감사총무팀_QSC] 통합시트_대시보드' / '[감사총무팀_QSC] 통합시트.xlsx'
stores = []
if DASH.exists():
    dws = openpyxl.load_workbook(DASH, data_only=True)['데이터']
    for r in range(6, 60):
        name = dws[f'E{r}'].value
        if not name:
            continue
        rd = dws.row_dimensions.get(r)
        if rd and rd.hidden:
            continue
        stores.append(str(name).strip())
else:
    print('!!! 통합시트 파일 없음 — 매장 목록 생략')

master = {
    'version': '2026-08-13 (v3.8)',
    'source': 'QSC 평가 체계 개편_v3.xlsx',
    'stores': stores,
    # 절대 감점제 파라미터 — 엑셀 '채점기준' 시트와 반드시 일치시킬 것
    'scoring': {
        'general_per_case': 1,
        'S2': {'label': '★', 'name': '중대운영', 'first': 8, 'more': 2, 'cap': 45},
        'S1': {'label': '★★', 'name': '즉시위해', 'first': 12, 'more': 4, 'cap': 48},
        'qsc_floor': 0,
        'final_floor': 0,
    },
    'final_weights': {'qsc_inspector': 0.6, 'mystery_shopper': 0.3, 'improvement': 0.1},
    'grades': [
        {'name': '우수', 'rule': '>= 93'}, {'name': '양호', 'rule': '>= 85'},
        {'name': '보통', 'rule': '>= 76'}, {'name': '미흡', 'rule': '>= 66'},
        {'name': '주의', 'rule': '>= 55'}, {'name': '부적합', 'rule': '< 55'},
    ],
    'texts': {
        'criteria': ws['C2'].value, 'principles': ws['C5'].value,
        'shopper_criteria': sh['C2'].value, 'shopper_principles': sh['C5'].value,
        'shopper_grade_note': sh['C66'].value,
    },
    'qsc_groups': qsc_groups,
    'shopper_categories': shopper_cats,
}
OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(master, f, ensure_ascii=False, indent=1)

print('QSC', item_no, '문항 /', len(qsc_groups), '그룹 / ★★', sev_count['S1'], '· ★', sev_count['S2'])
print('쇼퍼', q_no, '문항 /', len(shopper_cats), '카테고리 / 5점 척도', n_likert, '문항')
print('매장', len(stores), '개 (통합시트 표시 행만, 숨김 = 관리 제외)')
print('저장:', OUT)
