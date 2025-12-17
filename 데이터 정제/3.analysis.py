import pandas as pd
from collections import Counter
import ast
import io

# 1. 파일 불러오기
file_path = 'kiwi_frequency_analysis_ready.csv' 

try:
    df = pd.read_csv(file_path, encoding='utf-8')
except FileNotFoundError:
    print(f"Error: 파일을 찾을 수 없습니다: {file_path}")
    exit()

# 2. 'kiwi_tokens' 컬럼의 문자열 리스트를 실제 리스트 객체로 변환
try:
    # NaN 값은 빈 리스트로 처리합니다.
    df['kiwi_tokens'] = df['kiwi_tokens'].apply(lambda x: ast.literal_eval(x) if pd.notna(x) else [])
except ValueError as e:
    print(f"Error: 'kiwi_tokens' 컬럼 변환 중 오류 발생. 데이터 형식 확인 필요: {e}")
    exit()

# 3. 불용어(Stopwords) 정의
# 이전 단계와 동일한 불용어를 사용합니다.
custom_stopwords = set([
    '광주', '카페', '맛집', '케이크', '커피', '메뉴', '주문', '방문', '디저트',
    '우리', '사장', '정말', '이용', '사진', '느낌', '가능', '포장', '생각', 
    '하나', '가장', '자리', '시간', '모습', '사람', '마음', '준비', '오늘',
    '추천', '아메리카노', '라떼', '음료', '테이블', '직접', '주차장', '마시고',
    '예약', '블로그', '바로', '다음', '후기', '윤더지니'
])
TOP_N = 30 # 각 카페별 상위 30개 키워드 추출

# 4. 그룹별 빈도 분석 및 결과 포맷팅 함수 정의
def get_top_keywords_by_name(group):
    """
    그룹(특정 카페)의 모든 토큰을 합치고, 빈도 분석 후 상위 N개 키워드를 반환
    """
    # 4-1. 해당 그룹의 모든 토큰을 하나의 리스트로 합치기
    all_tokens = [token for sublist in group['kiwi_tokens'] for token in sublist]
    
    # 4-2. 단어 빈도 계산
    word_counts = Counter(all_tokens)
    
    # 4-3. 불용어 및 1글자 단어 제거
    filtered_counts = {
        word: count for word, count in word_counts.items() 
        if word not in custom_stopwords and len(word) > 1
    }
    
    # 4-4. 상위 N개 키워드 추출
    top_words = Counter(filtered_counts).most_common(TOP_N)
    
    # 4-5. 결과를 DataFrame으로 포맷팅
    if not top_words:
        return pd.DataFrame()
        
    result_df = pd.DataFrame(top_words, columns=['keyword', 'frequency'])
    result_df['name'] = group['name'].iloc[0] # 카페 이름 추가
    result_df['rank'] = result_df.index + 1  # 순위 (1부터 시작)
    
    # 순서 정리: name, rank, keyword, frequency
    return result_df[['name', 'rank', 'keyword', 'frequency']]

# 5. 'name' 기준으로 그룹화하고 함수 적용
print("🔍 'name' 기준으로 빈도 분석을 그룹별로 적용 중...")
# .apply() 메서드가 각 그룹에 대해 get_top_keywords_by_name 함수를 실행하고 결과를 합쳐줍니다.
analysis_results = df.groupby('name').apply(get_top_keywords_by_name).reset_index(drop=True)

# 6. 최종 결과를 하나의 파일로 저장
output_file_path = 'name_grouped_keyword_frequency.csv'
analysis_results.to_csv(output_file_path, index=False, encoding='utf-8')

print("\n---------------------------------------------------------")
print(f"✅ 'name'별 빈도 분석 완료. 결과가 하나의 파일로 저장되었습니다.")
print(f"📌 저장된 파일 경로: {output_file_path}")
print("---------------------------------------------------------")

# 7. 결과 확인 (첫 3개 카페의 결과 출력)
print("\n--- 🏆 Name별 상위 키워드 분석 결과 (일부) ---")
# 상위 30개가 너무 길 수 있으므로, 각 카페별 상위 5위까지만 출력
preview_df = analysis_results.groupby('name').head(5)
print(preview_df)