# 달콤인덱스  
*(팀명: 서울 자가에 살고싶은 동아 MX 다니는 영환팀 이야기)*

---

## 서비스 소개
* **서비스명:** DalcommIndex (달콤인덱스)
* **서비스설명:**  
  DalcommIndex는 지역 기반 카페 데이터를 활용하여 사용자가 원하는  
  **테마, 디저트, 분위기, 방문 목적(데이트·카공 등)**에 맞는 카페를  
  검색·추천해주는 서비스입니다.  

  검색/필터 기능과 카카오맵 기반 지도 탐색,  
  그리고 자연어 입력 기반 챗봇 추천 기능을 통해  
  사용자는 자신의 상황에 가장 적합한 카페를 직관적으로 탐색할 수 있습니다.
<br>

---

## 프로젝트 기간
2025.12.17 ~ 2025.12.31 (2주)
<br>

---

## 주요 기능
* **기능 1 : 카페 검색 / 필터링**  
  지역, 테마, 디저트, 분위기, 방문 목적 등 다양한 조건을 조합한 카페 검색

* **기능 2 : 지도 기반 탐색 (카카오맵)**  
  카카오맵 API를 활용한 지도 탐색 및 마커 기반 카페 조회

* **기능 3 : 카페 상세보기**  
  카페 상세 정보, 이미지, 태그, 평점 확인

* **기능 4 : 즐겨찾기 / 마이페이지**  
  관심 카페 저장 및 개인 즐겨찾기 관리

* **기능 5 : ChatGPT API 기반 챗봇**  
  자연어 입력을 분석하여 사용자 상황에 맞는 카페 추천

* **기능 6 : 랭킹 / 인사이트**  
  인기 키워드 및 트렌드 기반 카페 정보 제공
<br>

---

## 기술 스택

### 🖥 Frontend
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=React&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=Vite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-323330?style=for-the-badge&logo=JavaScript&logoColor=F7DF1E)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=HTML5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=CSS3&logoColor=white)

### 🗺 Map / External API
![KakaoMap](https://img.shields.io/badge/KakaoMap-FFCD00?style=for-the-badge&logo=Kakao&logoColor=000000)

### ⚙ Backend
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=Node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=Express&logoColor=white)
![REST API](https://img.shields.io/badge/REST_API-005571?style=for-the-badge)

### 🗄 Database
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=MySQL&logoColor=white)

### 🤖 AI / Recommendation
![ChatGPT](https://img.shields.io/badge/ChatGPT_API-412991?style=for-the-badge&logo=OpenAI&logoColor=white)
![Keyword](https://img.shields.io/badge/Keyword_Based_Recommendation-2ECC71?style=for-the-badge)

### 🔧 Development & Collaboration
![Git](https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=Git&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=GitHub&logoColor=white)
![VSCode](https://img.shields.io/badge/VS_Code-007ACC?style=for-the-badge&logo=VisualStudioCode&logoColor=white)
<br>

---

## 시스템 아키텍처
- 사용자는 웹(React) 환경에서 서비스에 접근
- 프론트엔드는 Node.js + Express 기반 백엔드 서버와 REST API로 통신
- 백엔드는 MySQL DB에서 카페/유저/즐겨찾기/리뷰 데이터 조회
- 지도 기능은 Kakao Maps API 활용
- 챗봇 요청은 자연어 분석 후 추천 결과 반환

📌 *(시스템 아키텍처 이미지 삽입 위치)*
<br>

---

## 유스케이스
- 사용자는 검색 및 필터를 통해 카페를 조회할 수 있다
- 사용자는 지도를 통해 주변 카페를 탐색할 수 있다
- 사용자는 카페 상세 정보를 확인하고 즐겨찾기에 추가할 수 있다
- 사용자는 챗봇을 통해 자연어 기반 추천을 받을 수 있다
- 로그인한 사용자는 마이페이지에서 즐겨찾기를 관리할 수 있다
<br>

---

## 서비스 흐름도
1. 사용자가 검색 / 필터 / 챗봇 중 하나의 방식으로 요청
2. 프론트엔드에서 백엔드 서버로 요청 전달
3. 백엔드는 DB 및 추천 로직을 통해 결과 처리
4. 처리된 결과를 프론트엔드로 반환
5. 사용자는 검색 결과, 지도, 상세 페이지를 통해 카페 정보 확인

📌 *(서비스 흐름도 이미지 삽입 위치)*
<br>

---

## ER 다이어그램
- **USERS** : 사용자 정보
- **CAFES** : 카페 기본 정보
- **USER_FAVORITES** : 사용자 즐겨찾기
- **USER_REVIEWS** : 사용자 리뷰
- **CAFE_STATS** : 카페 통계 및 키워드 정보

📌 *(ER 다이어그램 이미지 삽입 위치)*
<br>

---

## 화면구성
- 메인 페이지 : 검색창, 추천 키워드, 트렌드 정보
- 검색 페이지 : 필터 기반 카페 리스트
- 지도 페이지 : 카카오맵 기반 탐색
- 카페 상세 페이지 : 상세 정보 및 즐겨찾기
- 챗봇 페이지 : 자연어 입력 추천
- 마이페이지 : 즐겨찾기 관리
<br>

---

## 팀원 역할
- **Frontend** : UI/UX 구현, 검색·지도·상세 페이지 개발
- **Backend** : API 설계, DB 연동, 추천 로직 구현
- **AI / Data** : 키워드 분석 및 챗봇 추천 로직 설계
<br>

---

## 트러블슈팅

* **문제 1**  
  필터 초기화를 반복할 경우 검색 결과가 사라지는 문제  
  → 초기화 시 기본값(all)을 유지하도록 상태 관리 로직 수정

* **문제 2**  
  지도 팝업에서 즐겨찾기 저장 시 마이페이지와 동기화되지 않는 문제  
  → 즐겨찾기 변경 이벤트 발생 시 데이터 재조회 로직 추가

* **문제 3**  
  챗봇 추천 결과가 사용자 의도와 다르게 출력되는 문제  
  → 키워드 우선순위 및 목적 분류 로직 개선
