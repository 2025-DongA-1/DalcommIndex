import pandas as pd
from kiwipiepy import Kiwi
import io

# 1. 파일 불러오기
file_path = 'naver_blog_reviews_bukgu_combined_final.csv' 

try:
    # 이전에 분리/정제된 파일을 읽어옵니다.
    df = pd.read_csv(file_path, encoding='utf-8')
except FileNotFoundError:
    print(f"Error: 파일을 찾을 수 없습니다: {file_path}")
    exit()

# 2. Kiwi 분석기 초기화
# 'Kiwi()'를 한 번만 초기화하여 메모리에 올려놓고 재사용합니다.
kiwi = Kiwi()

# 3. 빈도 분석에 사용할 품사 정의
# 일반적으로 명사(NN), 동사(VV), 형용사(VA)를 사용하며,
# 접미사(XSN, XSV, XSA)나 보조용언(VX) 등은 제외하거나 필요에 따라 포함할 수 있습니다.
# 여기서는 일반적인 빈도분석에 유용한 명사, 동사, 형용사만 추출합니다.
TARGET_POS = ['NNG', 'NNP',  # 일반/고유 명사
              'VA',           # 형용사 (예: 좋다, 예쁘다)
              'VV']           # 동사 (예: 먹다, 가다)

# 4. 형태소 분석 및 토큰 추출 함수 정의
def analyze_and_extract_tokens(text):
    """
    Kiwi를 사용하여 텍스트에서 지정된 품사(TARGET_POS)의 어간(stem)만 추출합니다.
    """
    if pd.isna(text):
        return []
    
    text = str(text)
    
    # Kiwi의 형태소 분석 함수 (tokenize)를 사용합니다.
    # tokens = kiwi.tokenize(text)
    
    # 텍스트를 구문 분석하고, 분석된 결과(morpheme)에서 품사를 확인하여 추출합니다.
    results = kiwi.analyze(text)[0][0]
    
    extracted_tokens = []
    for token, pos, _, _ in results:
        # 추출 대상 품사에 포함되고, 길이가 2 이상인 단어만 사용 (단순 조사/어미 제외 목적)
        # 동사(VV)나 형용사(VA)의 경우 어간(Stem)을 추출하여 사용합니다. (예: '먹었다' -> '먹')
        if pos in TARGET_POS:
            # 동사/형용사는 어간(token)을 사용하고, 명사는 형태소(token)를 그대로 사용
            if len(token) > 1 or pos.startswith('NN'): # 길이가 2 이상 또는 명사인 경우
                extracted_tokens.append(token)
    
    return extracted_tokens

# 5. 'content' 컬럼에 함수 적용 및 새 컬럼 생성
print("🔍 'content' 컬럼에 Kiwi 형태소 분석을 적용 중...")
df['kiwi_tokens'] = df['content'].apply(analyze_and_extract_tokens)

# 6. 빈도 분석용으로 정리된 데이터를 새 파일로 저장
output_file_path = 'bukgu_kiwi_frequency_analysis_ready.csv'
df.to_csv(output_file_path, index=False, encoding='utf-8')

print("\n---------------------------------------------------------")
print(f"✅ 빈도 분석용 데이터 준비 완료.")
print(f"📌 저장된 파일 경로: {output_file_path}")
print("---------------------------------------------------------")

# 7. 결과 확인 (추출된 토큰 목록 확인)
print("\n--- 추출된 토큰 확인 (상위 3개 리뷰) ---")
for i, row in df.head(3).iterrows():
    print(f"리뷰 ID {row['review_id']}: {row['kiwi_tokens'][:10]}... ({len(row['kiwi_tokens'])}개 토큰)")