import pandas as pd
import re
import emoji 
import html # HTML 엔터티 디코딩을 위한 라이브러리
import io

# 1. 파일 불러오기
file_path = 'gwangju_dessert_cafes_blog_links_bukgu.csv' # 원본 파일을 사용하여 작업을 다시 시작합니다.

try:
    df = pd.read_csv(file_path, encoding='utf-8')
except UnicodeDecodeError:
    # 한국어 환경에서 주로 사용되는 cp949 인코딩으로 재시도
    df = pd.read_csv(file_path, encoding='cp949')
except FileNotFoundError:
    print(f"Error: 파일을 찾을 수 없습니다: {file_path}")
    exit()

# 2. 텍스트 정제(Cleaning) 함수 정의 및 적용 (이모티콘, HTML 태그 등 제거)
def clean_text(text):
    """이모티콘, HTML 태그 및 엔터티를 안전하게 제거하는 함수"""
    if pd.isna(text):
        return text
    
    text = str(text)
    
    # 2-1. HTML 엔터티 디코딩 (예: &lt; -> <, &gt; -> >)
    text = html.unescape(text)
    
    # 2-2. HTML 태그 제거 (예: <br>, <a>...</a>)
    text = re.sub('<[^>]*>', '', text)
    
    # 2-3. 이모티콘 제거 (emoji 라이브러리 사용)
    text = emoji.replace_emoji(text, replace='')
    
    # 2-4. 과도한 공백(연속된 공백)을 하나의 공백으로 치환하여 정리
    text = re.sub('\s+', ' ', text)
    
    return text.strip()

# 정제를 적용할 컬럼 목록
text_columns = ['blog_title', 'blog_description', 'content'] 
for col in text_columns:
    if col in df.columns:
        df[col] = df[col].apply(clean_text)


# 3. 'https://blog.naver.com' 기준으로 리뷰를 나누고 ID 부여
# 'link' 컬럼에서 URL을 포함하는 행을 새로운 리뷰의 시작점으로 간주합니다.
is_new_blog_start = df['link'].astype(str).str.contains('https://blog.naver.com', na=False)
start_indices = df[is_new_blog_start].index.tolist()

individual_reviews = []
for i in range(len(start_indices)):
    start = start_indices[i]
    
    # 다음 리뷰의 시작 인덱스 또는 DataFrame의 끝을 end로 설정
    if i < len(start_indices) - 1:
        end = start_indices[i+1]
    else:
        end = len(df)
    
    # 리뷰 데이터 추출
    review_data = df.iloc[start:end].copy()
    
    # 🌟 각 리뷰/블로그 포스트에 고유 ID 할당
    review_data['review_id'] = i + 1 
    
    individual_reviews.append(review_data)

# 4. 분리된 모든 리뷰 데이터를 하나의 DataFrame으로 합칩니다.
if not individual_reviews:
    print("Error: 'https://blog.naver.com'을 포함하는 행을 찾을 수 없습니다. 리뷰를 나눌 수 없습니다.")
    exit()
    
combined_reviews_df = pd.concat(individual_reviews)

# 5. 합쳐진 DataFrame을 새로운 CSV 파일로 저장합니다.
output_file_path = 'naver_blog_reviews_bukgu_combined_final.csv'
combined_reviews_df.to_csv(output_file_path, index=False, encoding='utf-8') 

print(f"✅ 'https://blog.naver.com' 기준으로 총 {len(individual_reviews)}개의 리뷰가 분리되어 하나의 파일로 저장되었습니다.")
print(f"📌 저장된 파일 경로: {output_file_path}")

# 6. 정제 및 분리된 데이터의 구조를 확인합니다.
print("\n--- 저장된 파일의 상위 5개 행 (review_id 포함) ---")
pd.set_option('display.max_colwidth', 100) # 내용을 더 길게 표시하도록 설정
print(combined_reviews_df[['blog_title', 'content', 'review_id']].head(5))
pd.reset_option('display.max_colwidth')