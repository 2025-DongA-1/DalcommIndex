# DalcommIndex
서울 자가에 살고 싶은 동아 MX 다니는 영환팀 이야기 핵심프로젝트

### csv파일을 mysql 데이터에 넣기
1. & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --local-infile=1 -u 유저이름 -p 데이터베이스명 
2. 서버 활성화 확인
   SHOW VARIABLES LIKE 'local_infile';
SELECT @@global.local_infile, @@session.local_infile;
3. OFF / 0 이면 켜기
SET GLOBAL local_infile = 1;
4. 데이터 집어넣기(powershell에서)
USE 데이터베이스명;
SET NAMES utf8mb4;

-- 필요 시(권한 있으면) 1회 실행:
-- SET GLOBAL local_infile = 1;

LOAD DATA LOCAL INFILE 'C:/Users/1/Desktop/project22/DalcommIndex/데이터정제/cafes_db_enriched_with_kakao_and_reco_mysql.csv' <- 위치
INTO TABLE cafes
CHARACTER SET utf8mb4
FIELDS TERMINATED BY ','
OPTIONALLY ENCLOSED BY '"'
ESCAPED BY '\\'
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(
  @cafe_id, @cafe_name, @address, @district, @lat, @lng,
  @map_url, @image_url,
  @atmosphere_tags, @taste_tags, @companion_tags, @menu_tags, @main_menus,
  @parking, @blog_count, @reco_score, @reco_type, @reco_tags, @reco_message,
  @price_summary, @price_list_json, @top40_json
)
SET
  -- 공통: CRLF 방어(TRIM '\r') + (\N, \\N, '') => NULL
  cafe_id   = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @cafe_id),   '\\N'), '\\\\N'), ''),
  cafe_name = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @cafe_name), '\\N'), '\\\\N'), ''),
  address   = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @address),   '\\N'), '\\\\N'), ''),
  district  = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @district),  '\\N'), '\\\\N'), ''),

  lat = CASE
          WHEN TRIM(BOTH '\r' FROM @lat) IN ('', '\\N', '\\\\N') THEN NULL
          ELSE CAST(TRIM(BOTH '\r' FROM @lat) AS DECIMAL(12,9))
        END,
  lng = CASE
          WHEN TRIM(BOTH '\r' FROM @lng) IN ('', '\\N', '\\\\N') THEN NULL
          ELSE CAST(TRIM(BOTH '\r' FROM @lng) AS DECIMAL(12,9))
        END,

  map_url   = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @map_url),   '\\N'), '\\\\N'), ''),
  image_url = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @image_url), '\\N'), '\\\\N'), ''),

  atmosphere_tags = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @atmosphere_tags), '\\N'), '\\\\N'), ''),
  taste_tags      = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @taste_tags),      '\\N'), '\\\\N'), ''),
  companion_tags  = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @companion_tags),  '\\N'), '\\\\N'), ''),
  menu_tags       = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @menu_tags),       '\\N'), '\\\\N'), ''),
  main_menus      = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @main_menus),      '\\N'), '\\\\N'), ''),

  parking = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @parking), '\\N'), '\\\\N'), ''),

  blog_count = CASE
                 WHEN TRIM(BOTH '\r' FROM @blog_count) IN ('', '\\N', '\\\\N') THEN NULL
                 ELSE CAST(TRIM(BOTH '\r' FROM @blog_count) AS UNSIGNED)
               END,

  reco_score = CASE
                 WHEN TRIM(BOTH '\r' FROM @reco_score) IN ('', '\\N', '\\\\N') THEN NULL
                 ELSE CAST(TRIM(BOTH '\r' FROM @reco_score) AS DECIMAL(5,2))
               END,

  reco_type    = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @reco_type),    '\\N'), '\\\\N'), ''),
  reco_tags    = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @reco_tags),    '\\N'), '\\\\N'), ''),
  reco_message = NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @reco_message), '\\N'), '\\\\N'), ''),
  price_summary= NULLIF(NULLIF(NULLIF(TRIM(BOTH '\r' FROM @price_summary),'\\N'), '\\\\N'), ''),

  -- JSON 컬럼: '', \N, \\N => NULL / 그 외는 JSON으로 캐스팅
  price_list_json = CASE
                      WHEN TRIM(BOTH '\r' FROM @price_list_json) IN ('', '\\N', '\\\\N') THEN NULL
                      ELSE CAST(TRIM(BOTH '\r' FROM @price_list_json) AS JSON)
                    END,
  top40_json      = CASE
                      WHEN TRIM(BOTH '\r' FROM @top40_json) IN ('', '\\N', '\\\\N') THEN NULL
                      ELSE CAST(TRIM(BOTH '\r' FROM @top40_json) AS JSON)
                    END
;


