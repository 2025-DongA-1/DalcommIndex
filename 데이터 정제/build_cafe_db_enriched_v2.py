# -*- coding: utf-8 -*-
"""
build_cafe_db_enriched_v2.py

- 네이버 place + 블로그 + 카카오 좌표를 합쳐 "카페 DB"를 만들고,
  Kiwi 기반 토큰 빈도/사전 태깅/추천 점수를 생성합니다.
- (추가) 가격표(가격 토큰/가격 요약) CSV를 별도로 생성합니다.

원본: build_cafe_db_enriched.py 기반(사용자 제공 파일)  fileciteturn1file0
"""

import re, json, hashlib, argparse
import pandas as pd
from collections import Counter, defaultdict
from kiwipiepy import Kiwi

# =========================
# 0) 기본 입력 파일(3개) - 필요 시 CLI로 변경 가능
# =========================
DEFAULT_PLACE_CSV = "gwangju_dessert_cafes_naver_place_seogu.csv"
DEFAULT_BLOG_CSV  = "gwangju_dessert_cafes_blog_links_seogu.csv"
DEFAULT_KAKAO_CSV = "gwangju_dessert_cafes_kakao_seogu.csv"

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

# =========================
# 4) Kiwi 토큰화 + 불용어
# =========================
kiwi = Kiwi()

BASE_STOPWORDS = set("""
그리고 그러나 그런데 또한 그래서 그러면 하지만 때문에 위해 통해 대한 대해
저는 제가 우리는 우리 너는 너가 여러분
이 그 저 것 거 수 등 등등
정말 너무 아주 진짜 그냥 약간 조금 많이
에서 으로 로 에게 보다 처럼 같이
있다 없다 되다 하다 이다 아니다 같다
오늘 어제 내일 이번 지난 다음
사진 영상 글 포스팅 후기 리뷰 방문 방문자
""".split())

# 크롤링/플랫폼 잡음 + 너무 일반적인 표현(빈도 상위로만 뜨는 것들)
DOMAIN_STOPWORDS = set("""
광주 광주광역시 남구
카페 디저트 베이커리 커피 음료 메뉴 주문
맛집 추천 소개 위치 주소 이용
naver 네이버 corp instagram 동영상 next image
오다 가다 나오다 들어가다 들다 보이다 찍다 찾다 주다 만들다 알다 느끼다 생각
좋다 맛있다 예쁘다 많다 다양 괜찮다 요즘 진짜
""".split())

# 1글자지만 의미가 있는 단어(너무 늘리면 잡음이 커집니다)
ALLOWED_SINGLE = set(["빵", "차", "떡", "잼", "쌀", "귤", "밤", "팥"])

_NUMERIC_RE = re.compile(r"^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$")  # 8000 / 8,000 / 8,000.0

def kiwi_tokens(text: str, extra_stopwords=None, nouns_only=False):
    if not text:
        return []
    sw = BASE_STOPWORDS | DOMAIN_STOPWORDS | (extra_stopwords or set())
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

        # 토큰 정규화(가벼운 수준)
        if form_l in NORMALIZE_TOKEN_MAP:
            form_l = NORMALIZE_TOKEN_MAP[form_l]
            if not form_l:
                continue

        if nouns_only:
            if tag not in ("NNG", "NNP"):
                continue
        else:
            # 동/형용사 표준화(먹다/좋다 등) → 하지만 이들은 보통 불용어로 빠짐
            if tag in ("VA", "VV"):
                form_l = form_l + "다"
            if tag not in ("NNG","NNP","SL","SN","VA","VV","XR"):
                continue

        if form_l in sw:
            continue
        if len(form_l) == 1 and form_l not in ALLOWED_SINGLE:
            continue

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

# 중복 제거(순서 유지)
_seen=set()
MENU_KEYWORDS=[x for x in MENU_KEYWORDS if not (x in _seen or _seen.add(x))]

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
    return " / ".join(parts) if parts else "근거 텍스트가 부족합니다(블로그/설명 추가 수집 권장)."

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
        name = str(r["name"]).strip()
        addr = str(r["address"]).strip()
        district = str(r["district"]).strip()
        text = str(r["combined_text"])

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
        extra_sw = set([name, norm(name)]) if name else set()
        toks = kiwi_tokens(text, extra_stopwords=extra_sw, nouns_only=False)
        cnt = Counter(toks)

        for token, c in cnt.items():
            freq_rows.append((r["cafe_id"], name, token, int(c)))
            global_cnt[token] += int(c)

        # 자동 태깅
        atmos_sc = score_from_dict(cnt, ATMOSPHERE_DICT)
        taste_sc = score_from_dict(cnt, TASTE_DICT)
        comp_sc  = score_from_dict(cnt, COMPANION_DICT)

        atmos_tags = [k for k,_ in atmos_sc[:3]]
        taste_tags = [k for k,_ in taste_sc[:3]]
        comp_tags  = [k for k,_ in comp_sc[:3]]

        menus = extract_menus(text, cnt, topk=8)
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
        rec_msg  = f"{rec_type} 추천 · {reason}"

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
            "간이유": reason,
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

            "키워드TOP40": json.dumps(cnt.most_common(40), ensure_ascii=False),
        })

    db_df = pd.DataFrame(rows)
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
