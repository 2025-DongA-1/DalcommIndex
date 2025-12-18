# -*- coding: utf-8 -*-
"""
build_cafe_db_enriched_v5.py

- 네이버 place + 블로그 + 카카오 좌표를 합쳐 "카페 DB"를 만들고,
  Kiwi 기반 토큰 빈도/사전 태깅/추천 점수를 생성합니다.
- (추가) 가격표(가격 토큰/가격 요약) CSV를 별도로 생성합니다.
- (개선) 키워드TOP40 전용 불용어 분리 + 편의시설 토큰 보호 + 상호/주소 토큰 자동 제외

원본: build_cafe_db_enriched.py 기반(사용자 제공 파일) 
"""

import re, json, hashlib, argparse
import pandas as pd
from collections import Counter, defaultdict
from kiwipiepy import Kiwi

# =========================
# 0) 기본 입력 파일(3개) - 필요 시 CLI로 변경 가능
# =========================
DEFAULT_PLACE_CSV = "gwangju_dessert_cafes_naver_place_bukgu.csv"
DEFAULT_BLOG_CSV  = "gwangju_dessert_cafes_blog_links_bukgu.csv"
DEFAULT_KAKAO_CSV = "gwangju_dessert_cafes_kakao_bukgu.csv"

# =========================
# 1) 기본 출력 파일
# =========================
DEFAULT_OUT_MASTER = "cafes_db_enriched_with_kakao_and_reco.csv"
DEFAULT_OUT_FREQ   = "cafe_token_freq_v2.csv"
DEFAULT_OUT_GLOBAL = "global_token_freq_v2.csv"

# (추가) 가격표 출력
DEFAULT_OUT_PRICE_ITEMS   = "cafe_price_items_v1.csv"      # 카페별 가격 항목(가능하면 메뉴 추정 포함)
DEFAULT_OUT_PRICE_SUMMARY = "cafe_price_summary_v1.csv"    # 카페별 가격 요약(최소/최대/중앙값/목록)

# =========================
# 2) 이모지 제거 + 텍스트 정리/정규화
# =========================
_EMOJI_RE = re.compile(
    "[" 
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002700-\U000027BF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA70-\U0001FAFF"
    "\U00002600-\U000026FF"
    "]+",
    flags=re.UNICODE
)

# 토큰/표기 흔들림을 약하게 정규화 (너무 공격적으로 바꾸면 오탐이 늘어납니다)
NORMALIZE_TOKEN_MAP = {
    "이드": "에이드",
    "크로": "크로아상",
    "크로아": "크로아상",
    "크루": "크루아상",
    "corp": "",      # naver corp 등 잡음 제거 목적
    "next": "",
    "image": "",
}

def remove_emoji(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = _EMOJI_RE.sub(" ", text)
    text = text.replace("\uFE0F", " ").replace("\u200D", " ")
    return text

def clean_text(text: str) -> str:
    """URL/개행/이모지 제거 + 공백 정리"""
    if not isinstance(text, str):
        return ""
    text = remove_emoji(text)
    text = re.sub(r"https?://\S+|www\.\S+", " ", text)
    text = re.sub(r"[\r\n\t]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

# =========================
# 3) 좌표/구/ID 추출
# =========================
def extract_lat_lng_from_html(html: str):
    if not isinstance(html, str):
        return ("", "")
    m = re.search(r"lng=([0-9.]+)&amp;lat=([0-9.]+)", html)
    if m:
        return (m.group(2), m.group(1))  # lat, lng
    return ("", "")

def extract_district(address: str) -> str:
    if not isinstance(address, str):
        return ""
    m = re.search(r"\s(동구|서구|남구|북구|광산구)\s", " " + address + " ")
    return m.group(1) if m else ""

def extract_place_id(place_url: str, html: str = None) -> str:
    if isinstance(place_url, str):
        m = re.search(r"/place/(\d+)", place_url)
        if m:
            return m.group(1)
    if isinstance(html, str):
        m = re.search(r'"id"\s*:\s*"(\d{6,})"', html)
        if m:
            return m.group(1)
    return ""

def norm(s: str) -> str:
    """이름/주소 매칭용 정규화: 소문자 + 괄호 제거 + 특수문자 제거"""
    if not isinstance(s, str):
        return ""
    s = s.lower()
    s = re.sub(r"\([^)]*\)", "", s)        # 괄호 제거
    s = re.sub(r"[^0-9a-z가-힣]+", "", s)  # 특수문자/공백 제거
    return s

def safe_str(v):
    if pd.isna(v):
        return None
    s = str(v).strip()
    return None if s.lower() == "nan" or s == "" else s
# =========================
# 4) Kiwi 토큰화 + 불용어
# =========================
kiwi = Kiwi()

BASE_STOPWORDS = set("""
그리고 그러나 그런데 또한 그래서 그러면 하지만 때문에 위해 통해 대한 대해
저는 제가 우리는 우리 너는 너가 여러분
이 그 저 것 거 수 등 등등
정말 너무 아주 진짜 그냥 약간 조금 많이 운영 품절 모드라 전화 나누다 오더
에서 으로 로 에게 보다 처럼 같이 마련 안쪽 고민 취향 바우
있다 없다 되다 하다 이다 아니다 같다 미술관 카운터 기대 복합 거북
오늘 어제 내일 이번 지난 다음 처음 식물 가게 선택 판매 지구 안녕
사진 영상 글 포스팅 후기 리뷰 방문 방문자 구성 추가 카페 가능 공간 화순
""".split())

# 크롤링/플랫폼 잡음 + 너무 일반적인 표현(빈도 상위로만 뜨는 것들)
# - 핵심 목표: 맛/분위기/메뉴/방문이유·동반인/편의시설을 설명하는 토큰을 남기고,
#   (1) 지역/주소, (2) 플랫폼/수집 노이즈, (3) 리뷰 서술·평가, (4) 주문/결제 등 프로세스,
#   (5) 의미 없는 동사를 제거합니다.
#
# ⚠️ 주의: '편의시설' 파악에 필요한 토큰(주차/와이파이/콘센트/화장실/좌석 등)은
#          불용어에서 제외해야 합니다. (태깅/추천 정확도에 직접 영향)

# 편의시설/작업성/동반조건 등 "남겨야 하는" 토큰(불용어에서 보호)
FACILITY_TOKENS = {
    "주차", "주차장", "와이파이", "wifi", "콘센트", "좌석", "자리", "테이블", "의자",
    "화장실", "흡연", "금연",
    "노키즈", "노키즈존", "키즈", "키즈존",
    "애견", "반려견", "애견동반", "반려동물", "펫프렌들리",
    "유아", "유아의자", "수유실",
    "휠체어", "장애인", "엘리베이터",
}

# (A) 지역/주소 관련(키워드TOP40 오염의 1순위) — 주소 컬럼으로 대체 가능
LOCATION_STOPWORDS = {
    # 광역/행정
    "광주", "광주광역시", "전남", "전라남도", "북구", "남구", "동구", "서구", "광산구",
    # 동/지구/역/대학 등(광주 내)
    "동명동", "양림동", "봉선동", "상무지구", "수완지구", "첨단", "쌍촌동", "용봉동", "일곡동", "중흥동", "용전동",
    "치평동", "화정동", "풍암동", "금호동", "선운지구", "신창동", "신가동", "운남동", "장덕동", "오치동",
    "정문", "후문", "상대", "예대", "전대", "조대", "호대", "광주대", "광주역", "터미널", "송정역", "전남대",
    # 도로/지명(광주)
    "제봉로", "백서로", "운천로", "상무대로", "우치로", "설죽로", "대남대로", "서문대로",
    # 일반 위치 표현(의미 낮음)
    "근처", "주변", "인근", "골목", "위치", "주소", "지도", "빌딩", "건물", "아파트", "상가", "상무", "중흥",
    # 타지역 지명(리뷰 서사 노이즈)
    "서울", "부산", "대구", "대전", "울산", "인천", "제주",
    "나주", "담양", "화순", "곡성", "군산", "포항", "전주", "목포", "순천", "여수",
}

# (B) 플랫폼/수집 노이즈
# - '인스타'는 '인스타 감성'처럼 분위기 신호로도 쓰이므로 **불용어에서 제외**(태깅에 사용)
PLATFORM_STOPWORDS = {
    "naver", "네이버", "블로그", "방문기", "포스팅", "링크", "공유", "업로드",
    "정보", "확인", "참고", "검색", "사이트", "영수증", "인증", "내돈내산",
    "corp", "corp.", "next", "image", "light",
    "tistory", "유튜브", "youtube",
    # 영어 일반 노이즈
    "cafe", "dessert", "brunch", "insta", "instagram", "instagram.com",
}

# (C) 리뷰 서술·평가형(정보량 낮음)
REVIEW_STOPWORDS = {
    "종류", "느낌", "정도", "개인", "총평", "솔직", "기대", "만족",
    "유명", "인기", "핫플", "신상", "인생", "최고",
    "최근", "주말", "평일", "처음", "마지막", "취향",
    "생각", "비주얼", "모습", "이름",
}

# (D) 주문/결제/운영 프로세스(카테고리 파악에 직접 도움 적음)
# - '주차'는 편의시설로 남겨야 하므로 제외(위 FACILITY_TOKENS로 보호)
PROCESS_STOPWORDS = {
    "사장님", "사장", "직원", "알바", "서비스", "친절", "응대",
    "가격", "가성비", "비싸다", "저렴",
    "메뉴판", "키오스크", "주문", "결제", "카드", "현금", "선불", "후불",
    "포장", "배달", "테이크아웃", "픽업", "예약", "대기", "웨이팅",
    "영업시간", "휴무", "정기", "오픈", "마감", "라스트오더",
    "매장", "내부", "외부", "외관", "간판", "입구", "출구", "계단", "지하",
}

# (E) 의미 없는 동사/서술어(빈도 오염)
VERB_STOPWORDS = {
    "오다", "가다", "들르다", "방문", "나오다", "들어가다", "보이다", "찍다", "찾다", "주다", "들다", "맞다",
    "만들다", "알다", "느끼다", "먹다", "마시다", "사다", "구매", "시키다", "즐기다",
    "기다리다", "앉다", "꾸미다", "어울리다",
}

# TOP40 전용(태깅에는 덜 영향을 주도록) — 필요 시만 사용
# - "카페 소개" 관점에서 정보량이 낮은 총평/행동/메타 단어를 적극 제거합니다.
# - 동반자/편의시설 관련 핵심 토큰은 FACILITY_TOKENS/사전 태깅 컬럼에서 관리하는 것을 권장합니다.
TOP40_ONLY_STOPWORDS = {
    # 너무 포괄적인 일반명사/서술(표현 중복)
    "가게", "매장", "내부", "외부", "공간", "장소", "곳",

    # 총평/평가형(설명력 낮음)
    "좋다", "맛있다", "추천", "맛집", "인기", "유명", "최고", "만족", "기대", "솔직", "취향",
    "많다", "다양",

    # 과도하게 일반적인 카테고리(대부분 카페에 기본적으로 등장)
    "분위기", "메뉴", "커피", "음료", "디저트",

    # 리뷰 메타/콘텐츠 단어
    "리뷰", "후기", "블로그", "포스팅", "사진", "포토", "동영상",

    # 의미 약한 서술/행동 조각(키워드로 부적합)
    "시간", "전체", "예상", "준비", "제작", "기념", "선물", "단체",

    # 프로세스성 단어(중복 방지)
    "메뉴판", "키오스크", "주문", "결제", "포장", "테이크아웃", "픽업", "예약", "대기", "웨이팅",

    # 랜드마크/캠퍼스(주소/지역 컬럼과 중복)
    "전남대학교", "전대", "전대정", "정문", "후문", "기숙사", "예대",

    # 브랜드/가맹점 맥락(카페 특성으로 쓰기 어려움)
    "가맹점", "사이렌", "패스",
}

# 최종 도메인 불용어(태깅/추천 공용)
DOMAIN_STOPWORDS = (LOCATION_STOPWORDS | PLATFORM_STOPWORDS | REVIEW_STOPWORDS | PROCESS_STOPWORDS | VERB_STOPWORDS) - FACILITY_TOKENS

# 도로명 패턴 자동 제거(주소 토큰이 누락되어도 방어)
_ROAD_SUFFIX_RE = re.compile(r".+(?:로|길|대로|번길|번안길|마을길|강로)$")

# 1글자지만 의미가 있는 단어(너무 늘리면 잡음이 커집니다)
ALLOWED_SINGLE = set(["빵", "차", "떡", "잼", "쌀", "귤", "밤", "팥"])

_NUMERIC_RE = re.compile(r"^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$")  # 8000 / 8,000 / 8,000.0

def kiwi_tokens(text: str, extra_stopwords=None, nouns_only=False, profile: str = "tagging"):
    """Kiwi 토큰화 공통 함수

    profile:
      - "tagging": 분위기/맛/동반인/편의시설 태깅 및 메뉴추출용(과도한 제거 금지)
      - "top40"  : 키워드TOP40/전역 빈도용(노이즈를 한 단계 더 제거)
    """
    if not text:
        return []
    sw = BASE_STOPWORDS | DOMAIN_STOPWORDS | (extra_stopwords or set())
    allow_exact = None
    allow_substr = None
    if profile == "top40":
        sw = sw | TOP40_ONLY_STOPWORDS
        # ✅ TOP40에는 "카페 소개용"으로 의미 있는 토큰만 남기기(화이트리스트)
        #    - ATMOSPHERE_DICT / TASTE_DICT / COMPANION_DICT / MENU_KEYWORDS 기반
        #    - 전세/주거/동네명 같은 잡음 유입을 구조적으로 차단
        allow_exact, allow_substr = get_top40_allowlists()

    out = []
    for tok in kiwi.tokenize(text):
        form = tok.form.strip()
        tag = tok.tag

        if not form:
            continue

        # 숫자/가격 토큰은 빈도분석에서는 잡음 → 제외(가격표는 별도 함수에서 추출)
        if _NUMERIC_RE.fullmatch(form):
            continue

        form_l = form.lower()
        # 숫자 제거(상호/지점 표기): 예) 미미당906 -> 미미당
        form_l_no_num = re.sub(r"\d+", "", form_l)
        if form_l_no_num:
            form_l = form_l_no_num

        # 토큰 정규화(가벼운 수준)
        if form_l in NORMALIZE_TOKEN_MAP:
            form_l = NORMALIZE_TOKEN_MAP[form_l]
            if not form_l:
                continue

        # 도로명 패턴(로/길/대로/번길 등)은 주소 노이즈 → 자동 제거
        if _ROAD_SUFFIX_RE.fullmatch(form_l):
            continue

        if nouns_only:
            if tag not in ("NNG", "NNP"):
                continue
        else:
            # 동/형용사 표준화(먹다/좋다 등)
            if tag in ("VA", "VV"):
                form_l = form_l + "다"
            if tag not in ("NNG", "NNP", "SL", "SN", "VA", "VV", "XR"):
                continue

        # TOP40 전용: 화이트리스트에 없는 토큰은 제거(키워드TOP40이 40개 미만이어도 허용)
        if profile == "top40":
            if form_l not in allow_exact:
                ok = False
                for s in allow_substr:
                    if s and (s in form_l):
                        ok = True
                        break
                if not ok:
                    continue

        if form_l in sw:
            continue
        if len(form_l) == 1 and form_l not in ALLOWED_SINGLE:
            continue

                # 상호 접미사 제거(미미당 -> 미미 등)
        for suf in _NAME_SUFFIXES:
            if form_l.endswith(suf) and len(form_l) - len(suf) >= 2:
                out.append(form_l[:-len(suf)])

        out.append(form_l)
    return out


# =========================
# 5) 사전 기반 태깅/메뉴/주차 + 추천
# =========================
ATMOSPHERE_DICT = {
    "감성": ["감성", "인스타", "포토존", "무드", "빈티지", "유럽", "감각"],
    "조용": ["조용", "차분", "한적", "잔잔", "힐링"],
    "아늑": ["아늑", "포근", "따뜻", "편안", "안락"],
    "모던": ["모던", "깔끔", "심플", "세련", "미니멀"],
    "넓음": ["넓", "좌석", "자리", "쾌적", "넉넉"],
    "뷰/통창": ["통창", "뷰", "전망", "창가", "햇살", "채광"],
    "테라스": ["테라스", "야외", "루프탑", "마당"],
    "한옥/전통": ["한옥","전통","고택","기와","마을"],
    "키즈/가족친화": ["키즈","유모차","어린이","아이"],
    "반려동물": ["애견","반려","강아지","펫","애견동반"],
}

TASTE_DICT = {
    "달콤": ["달콤", "달다", "단맛", "꿀", "카라멜"],
    "고소": ["고소", "견과", "버터", "피넛", "피스타치오"],
    "진함": ["진하", "풍미", "농도", "리치", "묵직"],
    "담백": ["담백", "깔끔", "산뜻"],
    "촉촉/쫀득": ["촉촉", "부드럽", "폭신", "쫀득", "쫄깃"],
    "상큼": ["상큼", "새콤", "과일", "레몬", "딸기", "망고"],
    "단짠/짭짤": ["소금","짭짤","단짠","솔티"],
    "쌉싸름/다크": ["쌉싸름","쓴","다크","에스프레소","말차"]
}

COMPANION_DICT = {
    "데이트": ["데이트", "연인", "커플", "분위기"],
    "가족": ["가족", "부모", "아이", "어린이", "아기", "유모차"],
    "친구": ["친구", "모임", "수다"],
    "혼카페/작업": ["혼자", "혼카페", "혼공", "작업", "공부", "노트북", "콘센트", "와이파이"],
    "반려동물/애견동반": ["애견","반려","강아지","펫","애견동반"],
    "단체/대관": ["단체","대관","예약","모임"],
}

MENU_KEYWORDS = [
    # 빙수/디저트
    "빙수","팥빙수","망고빙수","딸기빙수","흑임자빙수",
    "케이크","치즈케이크","티라미수","롤케이크","바스크치즈케이크",
    "스콘","쿠키","휘낭시에","마들렌","브라우니","버터바",
    "소금빵","크루아상","베이글","식빵","크림빵","잠봉뵈르",
    "푸딩","파르페","타르트","파이","애플파이",
    "젤라또","아이스크림",
    # 식사/브런치
    "브런치","와플","토스트","샌드위치","파니니","파스타","피자","스테이크","포케","샐러드",
    # 음료
    "라떼","카페라떼","아메리카노","콜드브루","핸드드립","에스프레소",
    "말차","초코","바닐라","딸기라떼","레몬에이드","에이드","밀크티","자몽에이드",
    # 트렌드/재료
    "카다이프","피스타치오",
]

# =========================
# TOP40 화이트리스트(필수)
# =========================
# - 키워드TOP40은 "카페 소개 태그" 용도이므로, 아래 분류(분위기/맛/동반/메뉴)에 해당하는 단어만 남깁니다.
# - 그 외(전세/주거/백운동 등 생활/부동산/동네명/잡담 키워드)는 자동으로 제거됩니다.
#
# 원칙:
#   1) allow_exact: 토큰이 정확히 일치하면 통과
#   2) allow_substr: 어근/변형(예: '진하'→'진하다', '부드럽'→'부드럽다') 대응을 위해 일부만 포함
#
# 필요 시 확장:
#   - TOP40_ALLOWLIST_EXTRA 에 원하는 토큰을 추가하세요(예: '빵', '크림', '치즈' 등).
#
_TOP40_ALLOWLIST_CACHE = None

# 변형 대응이 필요한 짧은 어근(2글자 이하)만 예외적으로 substring 매칭 허용
TOP40_ALLOWLIST_SHORT_STEMS = {
    "넓", "진하", "쫀득", "쫄깃", "부드럽", "폭신", "따뜻", "산뜻", "묵직", "리치", "쓴", "달달",
}

# (선택) 메뉴/맛/분위기에서 자주 등장하지만 사전에 없어서 빠지는 토큰이 있다면 여기에 추가
TOP40_ALLOWLIST_EXTRA = {
    # 예: "빵", "크림", "치즈", "베이커리", "도넛", "마카롱", "휘핑크림",
}

def get_top40_allowlists():
    """TOP40 화이트리스트(Exact + Substring) 캐시 생성"""
    global _TOP40_ALLOWLIST_CACHE
    if _TOP40_ALLOWLIST_CACHE is not None:
        return _TOP40_ALLOWLIST_CACHE

    allow_exact = set()
    # dict 기반(분위기/맛/동반)
    for _d in (ATMOSPHERE_DICT, TASTE_DICT, COMPANION_DICT):
        for _lst in _d.values():
            for _w in _lst:
                _w = str(_w).strip()
                if _w:
                    allow_exact.add(_w)

    # 메뉴 기반
    for _w in MENU_KEYWORDS:
        _w = str(_w).strip()
        if _w:
            allow_exact.add(_w)

    # 사용자 확장
    for _w in TOP40_ALLOWLIST_EXTRA:
        _w = str(_w).strip()
        if _w:
            allow_exact.add(_w)

    # substring 매칭 리스트
    allow_substr = set([w for w in allow_exact if len(w) >= 3])
    allow_substr |= set(TOP40_ALLOWLIST_SHORT_STEMS)

    # 성능을 위해 길이 내림차순 정렬(긴 토큰을 먼저 검사)
    allow_substr = sorted({w for w in allow_substr if w}, key=len, reverse=True)

    _TOP40_ALLOWLIST_CACHE = (allow_exact, allow_substr)
    return _TOP40_ALLOWLIST_CACHE


# 중복 제거(순서 유지)
_seen=set()
MENU_KEYWORDS=[x for x in MENU_KEYWORDS if not (x in _seen or _seen.add(x))]

# -------------------------
# (추가) 카페명/주소 토큰을 TOP40에서 자동 제외하기 위한 행 단위 불용어 생성
# - 상호명/주소에 포함된 토큰이 리뷰 본문에도 반복적으로 등장하면 TOP40이 오염됩니다.
# - 단, 메뉴/편의시설 키워드는 보호하여 제거되지 않게 합니다.
# -------------------------
# 상호에서 자주 등장하는 접미사(상호 조각을 TOP40에서 제거하기 위한 보조 규칙)
# 예: 미미당906 -> 미미, 케주베이커리 -> 케주, 화순하다랩 -> 화순하다
_NAME_SUFFIXES = [
    "당", "카페", "커피", "베이커리", "브로트", "로스터리", "로스터", "로스터스",
    "하우스", "스튜디오", "제과", "디저트", "도넛", "케이크", "마카롱", "빙수",
    "티룸", "티", "바", "랩",
]

def _raw_tokens_for_stopwords(text: str):
    if not text:
        return []
    out = []
    for tok in kiwi.tokenize(str(text)):
        form = tok.form.strip()
        if not form:
            continue
        if _NUMERIC_RE.fullmatch(form):
            continue
        form_l = form.lower()
        # 숫자 제거(상호/지점 표기): 예) 미미당906 -> 미미당
        form_l_no_num = re.sub(r"\d+", "", form_l)
        if form_l_no_num:
            form_l = form_l_no_num
        if form_l in NORMALIZE_TOKEN_MAP:
            form_l = NORMALIZE_TOKEN_MAP[form_l]
            if not form_l:
                continue
        if tok.tag not in ("NNG", "NNP", "SL", "SN", "XR"):
            continue
        if len(form_l) == 1 and form_l not in ALLOWED_SINGLE:
            continue
                # 상호 접미사 제거(미미당 -> 미미 등)
        for suf in _NAME_SUFFIXES:
            if form_l.endswith(suf) and len(form_l) - len(suf) >= 2:
                out.append(form_l[:-len(suf)])

        out.append(form_l)
    return out

_PROTECTED_ROW_SW = set(MENU_KEYWORDS) | set(FACILITY_TOKENS)

def build_row_stopwords(name: str, district: str, addr: str):
    """행(row) 단위로 상호/주소/지역에서 파생되는 토큰을 불용어로 제외합니다.
    - TOP40에서 '상호 조각(브랜드/지점명)'이 섞이는 것을 강하게 억제
    - 주소(로/길/대로 등)는 kiwi_tokens에서 1차 필터링하되, 여기서도 보조적으로 제거
    """
    sw = set()

    # 1) 상호: 분절/지점표기 제거 등 변형을 만들어 최대한 커버
    for base in (name, norm(name)):
        if not base:
            continue
        parts = re.split(r"[\s\-_/()\[\]{}]+", str(base))
        for p in parts:
            p = p.strip()
            if not p:
                continue
            # 지점/호점 표기 제거
            p = re.sub(r"\d+\s*호점$", "", p)
            p = re.sub(r"(?:본점|지점|점)$", "", p)
            # 숫자 제거(906, 2, 1 등)
            p = re.sub(r"\d+", "", p).strip()
            if p:
                sw.update(_raw_tokens_for_stopwords(p))

    # 2) 구/주소
    for s in (district, addr):
        if not s:
            continue
        sw.update(_raw_tokens_for_stopwords(s))

    # 보호 토큰(메뉴/편의시설)은 제거 대상에서 제외
    sw -= _PROTECTED_ROW_SW

    # 너무 짧은 상호 조각(잡음)을 제거
    sw = {t for t in sw if len(t) >= 2}

    return sw

PARK_POS = [r"주차\s*가능", r"무료\s*주차", r"주차장", r"전용\s*주차", r"매장\s*앞\s*주차", r"공영\s*주차"]
PARK_NEG = [r"주차\s*불가", r"주차\s*안\s*됨", r"주차\s*어려", r"주차\s*힘들", r"주차\s*불편"]

def score_from_dict(cnt: Counter, lexicon: dict):
    scores = {}
    for label, words in lexicon.items():
        scores[label] = sum(cnt.get(w, 0) for w in words)
    return [(k, v) for k, v in sorted(scores.items(), key=lambda x: x[1], reverse=True) if v > 0]

def detect_parking(text: str) -> str:
    if not text:
        return ""
    neg = any(re.search(p, text) for p in PARK_NEG)
    pos = any(re.search(p, text) for p in PARK_POS)
    if pos and not neg:
        return "가능"
    if neg and not pos:
        return "불가"
    if pos and neg:
        return "혼재(확인필요)"
    return ""

def extract_menus(text: str, token_counter: Counter, topk=8):
    found = Counter()
    if text:
        for m in MENU_KEYWORDS:
            if len(m) >= 2 and m in text:
                found[m] += 1
    for m in MENU_KEYWORDS:
        found[m] += token_counter.get(m, 0)

    items = [(k, v) for k, v in found.items() if v > 0]
    items.sort(key=lambda x: x[1], reverse=True)
    return [k for k, _ in items[:topk]]

def build_reason(main_menus, atmos_tags, taste_tags, parking):
    parts = []
    if main_menus:
        parts.append("대표메뉴: " + ", ".join(main_menus[:3]))
    if atmos_tags:
        parts.append("분위기: " + ", ".join(atmos_tags[:2]))
    if taste_tags:
        parts.append("맛: " + ", ".join(taste_tags[:2]))
    if parking:
        parts.append("주차: " + parking)
    return " / ".join(parts) if parts else ""

def recommend_type(comp_tags):
    if not comp_tags:
        return "기본"
    if "데이트" in comp_tags:
        return "데이트"
    if "혼카페/작업" in comp_tags:
        return "혼카페/작업"
    if "가족" in comp_tags:
        return "가족"
    if "친구" in comp_tags:
        return "친구"
    return "기본"

def calc_score(blog_count, menus, taste_scored, atmos_scored, parking):
    blog_score  = min(blog_count, 30) / 30 * 40
    menu_score  = min(len(menus), 8) / 8 * 15
    taste_score = min(sum(v for _, v in taste_scored), 15) / 15 * 20
    atmos_score = min(sum(v for _, v in atmos_scored), 15) / 15 * 15
    parking_bonus = 10 if parking == "가능" else 0
    total = blog_score + menu_score + taste_score + atmos_score + parking_bonus
    return round(min(total, 100), 1)

# =========================
# (추가) 가격 추출
# =========================
_PRICE_STRICT = re.compile(r"(?P<price>\d{1,3}(?:,\d{3})+|\d+)\s*원")
_PRICE_LOOSE  = re.compile(r"\b(?P<price>\d{1,3}(?:,\d{3})+)\b")

def _to_int_price(s: str):
    try:
        return int(str(s).replace(",", ""))
    except Exception:
        return None

def _guess_item_from_context(ctx: str):
    # 컨텍스트 안에서 메뉴키워드가 발견되면 그걸 item으로
    for m in sorted(MENU_KEYWORDS, key=len, reverse=True):
        if m in ctx:
            return m
    return ""

def extract_prices(text: str, window: int = 30):
    """
    text에서 가격을 추출합니다.
    - strict: '원' 포함
    - loose: 콤마 숫자(8,000)지만, 주변에 메뉴키워드가 있을 때만 인정
    """
    if not text:
        return []

    out = []

    # 1) strict
    for m in _PRICE_STRICT.finditer(text):
        raw = m.group(0)
        price_raw = m.group("price")
        price_int = _to_int_price(price_raw)
        if price_int is None:
            continue
        if not (500 <= price_int <= 50000):
            continue
        s, e = m.start(), m.end()
        ctx = text[max(0, s-window):min(len(text), e+window)]
        item = _guess_item_from_context(ctx)
        out.append({"item": item, "price": price_int, "raw": raw, "context": ctx, "source": "strict"})

    # 2) loose(원 없이 '8,000' 같은 것) - 주변에 메뉴키워드가 있을 때만
    for m in _PRICE_LOOSE.finditer(text):
        price_raw = m.group("price")
        price_int = _to_int_price(price_raw)
        if price_int is None:
            continue
        if not (500 <= price_int <= 50000):
            continue
        s, e = m.start(), m.end()
        ctx = text[max(0, s-window):min(len(text), e+window)]
        item = _guess_item_from_context(ctx)
        if not item:
            continue
        out.append({"item": item, "price": price_int, "raw": price_raw, "context": ctx, "source": "loose"})

    # 중복 제거
    seen=set()
    uniq=[]
    for r in out:
        key=(r["item"], r["price"], r["raw"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(r)
    return uniq

# =========================
# DB NULL 정규화 함수
# =========================
def normalize_for_db(df: pd.DataFrame):
    df = df.where(pd.notnull(df), None)
    df = df.replace({"": None, "nan": None, "NaN": None})
    return df

# =========================
# 6) 카카오 좌표로 보충(이름+주소 기반 매칭)
# =========================
def find_kakao_match(name, address, district, kakao_map):
    key = norm(name)
    candidates = kakao_map.get(key, [])
    if not candidates:
        return None

    addr_norm = norm(address)
    best, best_score = None, -1

    for r in candidates:
        sc = 0
        gu = str(r.get("gu", ""))
        if district and district in gu:
            sc += 3

        a2 = str(r.get("addr_norm", ""))
        if addr_norm and a2:
            if addr_norm in a2 or a2 in addr_norm:
                sc += 5
            # 약한 유사도(4글자 조각 교집합)로 동명이인 구분
            if len(addr_norm) >= 4 and len(a2) >= 4:
                s1 = set(addr_norm[i:i+4] for i in range(0, len(addr_norm)-3))
                s2 = set(a2[i:i+4] for i in range(0, len(a2)-3))
                sc += min(len(s1 & s2), 10) / 10

        if sc > best_score:
            best_score = sc
            best = r
    return best

# =========================
# 7) 실행
# =========================
def main(args):
    place_df = pd.read_csv(args.place_csv)
    blog_df  = pd.read_csv(args.blog_csv)
    kakao_df = pd.read_csv(args.kakao_csv)

    # 컬럼 방어
    for col in ["name","address","place_url","place_image_url","naver_place_html"]:
        if col not in place_df.columns:
            place_df[col] = ""
    for col in ["name","content","link"]:
        if col not in blog_df.columns:
            blog_df[col] = ""
    for col in ["name","address","x","y","url","gu"]:
        if col not in kakao_df.columns:
            kakao_df[col] = ""

    # 네이버 html에서 좌표 추출
    place_df["lat"], place_df["lng"] = zip(*place_df["naver_place_html"].map(extract_lat_lng_from_html))
    place_df["district"] = place_df["address"].apply(extract_district)

    # cafe_id
    place_df["cafe_id"] = place_df.apply(
        lambda r: extract_place_id(r.get("place_url",""), r.get("naver_place_html","")),
        axis=1
    )
    mask = place_df["cafe_id"].isna() | (place_df["cafe_id"] == "")
    place_df.loc[mask, "cafe_id"] = place_df[mask].apply(
        lambda r: hashlib.md5(f"{r.get('name','')}_{r.get('address','')}".encode("utf-8")).hexdigest()[:12],
        axis=1
    )

    # 블로그 정리 + 카페별 합치기 (이름 정규화 키도 함께 사용)
    blog_df["clean_content"] = blog_df["content"].astype(str).map(clean_text)
    blog_df["name_norm"] = blog_df["name"].astype(str).map(norm)

    blog_group = blog_df.groupby("name_norm").agg(
        blog_count=("link","count"),
        combined_text=("clean_content", lambda s: " ".join(s))
    ).reset_index()

    place_df["name_norm"] = place_df["name"].astype(str).map(norm)

    cafes = place_df.merge(blog_group, on="name_norm", how="left")
    cafes["blog_count"] = cafes["blog_count"].fillna(0).astype(int)
    cafes["combined_text"] = cafes["combined_text"].fillna("")

    # 카카오 맵(이름 정규화 기반)
    kakao_df["name_norm"] = kakao_df["name"].astype(str).map(norm)
    kakao_df["addr_norm"] = kakao_df["address"].astype(str).map(norm)

    kakao_map = defaultdict(list)
    for _, r in kakao_df.iterrows():
        kakao_map[r["name_norm"]].append(r.to_dict())

    # 결과 생성
    rows = []
    freq_rows = []
    global_cnt = Counter()
    price_items = []

    for _, r in cafes.iterrows():
        name = safe_str(r["name"])
        addr = safe_str(r["address"])
        district = safe_str(r["district"])
        text = safe_str(r["combined_text"]) or ""

        lat = str(r["lat"]).strip()
        lng = str(r["lng"]).strip()
        map_link = str(r.get("place_url","")).strip()

        # ✅ 좌표 없는 경우 카카오로 보충
        if (not lat) or (not lng):
            km = find_kakao_match(name, addr, district, kakao_map)
            if km:
                if not lat:
                    lat = str(km.get("y","")).strip()
                if not lng:
                    lng = str(km.get("x","")).strip()
                # 지도링크도 비어있으면 카카오 url로 보충
                if not map_link:
                    map_link = str(km.get("url","")).strip()

        # 토큰/빈도 (카페명은 불용어로 추가)
        extra_sw = build_row_stopwords(name, district, addr)
        # (1) 태깅/메뉴 추출용 토큰(과도한 제거 금지)
        toks_tag = kiwi_tokens(text, extra_stopwords=extra_sw, nouns_only=False, profile="tagging")
        cnt_tag = Counter(toks_tag)

        # (2) TOP40/전역빈도용 토큰(노이즈 추가 제거)
        toks_top = kiwi_tokens(text, extra_stopwords=extra_sw, nouns_only=False, profile="top40")
        cnt_top = Counter(toks_top)
        top_keywords = [k for k, _ in cnt_top.most_common(40)]

        for token, c in cnt_top.items():
            freq_rows.append((r["cafe_id"], name, token, int(c)))
            global_cnt[token] += int(c)

        # 자동 태깅
        atmos_sc = score_from_dict(cnt_tag, ATMOSPHERE_DICT)
        taste_sc = score_from_dict(cnt_tag, TASTE_DICT)
        comp_sc  = score_from_dict(cnt_tag, COMPANION_DICT)

        atmos_tags = [k for k,_ in atmos_sc[:3]]
        taste_tags = [k for k,_ in taste_sc[:3]]
        comp_tags  = [k for k,_ in comp_sc[:3]]

        menus = extract_menus(text, cnt_tag, topk=8)
        main_menus = menus[:3]
        parking = detect_parking(text)

        reason = build_reason(main_menus, atmos_tags, taste_tags, parking)

        # ✅ 가격 추출(별도 CSV로 저장 + DB에도 요약만 넣기)
        prices = extract_prices(text, window=35)
        for p in prices:
            price_items.append({
                "카페id": r["cafe_id"],
                "카페이름": name,
                "item(추정)": p.get("item",""),
                "price(원)": p.get("price",""),
                "raw": p.get("raw",""),
                "source": p.get("source",""),
                "context": p.get("context",""),
            })

        price_list = sorted({p["price"] for p in prices if isinstance(p.get("price"), int)})
        price_summary = ""
        if price_list:
            mid = int(pd.Series(price_list).median())
            price_summary = f"{min(price_list)}~{max(price_list)}원(대표 {mid}원)"

        # ✅ 추천(점수/유형/태그/문구)
        rec_score = calc_score(int(r["blog_count"]), menus, taste_sc, atmos_sc, parking)
        rec_type = recommend_type(comp_tags)
        rec_tags = ",".join([*atmos_tags[:2], *taste_tags[:2], *(comp_tags[:1] if comp_tags else [])]).strip(",")
        rec_msg = f"{rec_type} 추천 · {reason}" if reason else f"{rec_type} 추천"

        rows.append({
            "카페id": r["cafe_id"],
            "카페이름": name,
            "주소": addr,
            "지역(구단위)": district,
            "좌표(lat)": lat,
            "좌표(lng)": lng,
            "지도링크": map_link,
            "카페이미지url": r.get("place_image_url",""),

            "분위기": ", ".join(atmos_tags),
            "맛": ", ".join(taste_tags),
            "동반자": ", ".join(comp_tags),
            "메뉴": ", ".join(menus),
            "주요메뉴": ", ".join(main_menus),
            "주차여부": parking,

            "블로그수": int(r["blog_count"]),
            "추천점수(0-100)": rec_score,
            "추천유형": rec_type,
            "추천태그": rec_tags,
            "추천문구": rec_msg,

            # (추가) 가격 요약
            "가격요약": price_summary,
            "가격목록": json.dumps(price_list, ensure_ascii=False),


            "키워드TOP40": json.dumps(top_keywords, ensure_ascii=False),
        })

    db_df = pd.DataFrame(rows)
    db_df = normalize_for_db(db_df)
    freq_df = pd.DataFrame(freq_rows, columns=["cafe_id","name","token","count"]) \
                .sort_values(["name","count"], ascending=[True, False])
    global_df = pd.DataFrame(global_cnt.most_common(300), columns=["token","count"])

    # 가격표
    price_items_df = pd.DataFrame(price_items)
    if not price_items_df.empty:
        # 카페별 요약
        summ = (price_items_df.groupby(["카페id","카페이름"])["price(원)"]
                .apply(lambda s: sorted({int(x) for x in s.dropna().tolist()}))
                .reset_index(name="가격목록"))
        summ["가격종류수"] = summ["가격목록"].apply(len)
        summ["최소가"] = summ["가격목록"].apply(lambda lst: min(lst) if lst else "")
        summ["최대가"] = summ["가격목록"].apply(lambda lst: max(lst) if lst else "")
        summ["대표가(중앙값)"] = summ["가격목록"].apply(lambda lst: int(pd.Series(lst).median()) if lst else "")
    else:
        summ = pd.DataFrame(columns=["카페id","카페이름","가격목록","가격종류수","최소가","최대가","대표가(중앙값)"])

    db_df.to_csv(args.out_master, index=False, encoding="utf-8-sig")
    freq_df.to_csv(args.out_freq, index=False, encoding="utf-8-sig")
    global_df.to_csv(args.out_global, index=False, encoding="utf-8-sig")
    price_items_df.to_csv(args.out_price_items, index=False, encoding="utf-8-sig")
    summ.to_csv(args.out_price_summary, index=False, encoding="utf-8-sig")

    print("[OK] saved:")
    print(" -", args.out_master)
    print(" -", args.out_freq)
    print(" -", args.out_global)
    print(" -", args.out_price_items)
    print(" -", args.out_price_summary)

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--place_csv", default=DEFAULT_PLACE_CSV)
    p.add_argument("--blog_csv",  default=DEFAULT_BLOG_CSV)
    p.add_argument("--kakao_csv", default=DEFAULT_KAKAO_CSV)

    p.add_argument("--out_master", default=DEFAULT_OUT_MASTER)
    p.add_argument("--out_freq",   default=DEFAULT_OUT_FREQ)
    p.add_argument("--out_global", default=DEFAULT_OUT_GLOBAL)
    p.add_argument("--out_price_items", default=DEFAULT_OUT_PRICE_ITEMS)
    p.add_argument("--out_price_summary", default=DEFAULT_OUT_PRICE_SUMMARY)
    return p.parse_args()

if __name__ == "__main__":
    args = parse_args()
    main(args)
