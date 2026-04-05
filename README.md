# 서산시 과학화 예비군 훈련장 웹 허브

GitHub Pages에 바로 배포할 수 있는 정적 안내 페이지입니다.  
운영자가 `data` 폴더와 설정 파일만 수정해도 설문, 식단, 공지사항, 정신전력평가 링크를 관리할 수 있도록 구성했습니다.
추가로 관리자용 설문 요약 페이지와 매일 15:30 자동 요약 파이프라인을 포함합니다.

## 기본 파일 구조

```text
index.html
admin.html
admin.css
admin.js
style.css
script.js
data/
  site-config.js
  meals.js
  notices.js
  survey-summary.json
.github/
  workflows/
    daily-survey-summary.yml
tools/
  generate_survey_summary.py
```

## 가장 자주 수정하는 파일

### 1. 설문 링크 변경
파일: `data/site-config.js`

```js
survey: {
  url: "여기에 설문 링크 입력",
  buttonLabel: "설문 참여하기",
}
```

### 2. 정신전력평가 링크 추가
파일: `data/site-config.js`

```js
mentalEvaluation: {
  url: "여기에 정신전력평가 링크 입력",
  buttonLabel: "정신전력평가 바로가기",
}
```

- 아직 링크가 없으면 `url: ""` 상태로 두면 됩니다.
- 링크를 넣으면 페이지의 버튼이 자동으로 활성화됩니다.

### 3. 예비군 법령 링크

- 현재 `예비군 법령` 버튼은 아래 사이트로 직접 이동합니다.

```text
https://www.yebigun1.mil.kr/dmobis/rfh/rgt/info/04_01_legislation.jsp
```

### 4. 예비군 챗봇 링크
파일: `data/site-config.js`

```js
chatbot: {
  url: "여기에 챗봇 링크 입력",
}
```

## 데이터 수정 방법

### 식단 수정
파일: `data/meals.js`

```js
{
  date: "2026-03-27",
  mealType: "중식",
  menu: ["백미밥", "국", "반찬1", "반찬2"],
  note: "배식 시간 또는 참고 사항",
}
```

- `date`는 반드시 `YYYY-MM-DD` 형식으로 입력합니다.
- `menu`는 배열 형식으로 입력합니다.
- 최신 날짜가 먼저 보이도록 자동 정렬됩니다.

### 공지사항 수정
파일: `data/notices.js`

```js
{
  date: "2026-03-29",
  title: "공지 제목",
  content: `공지 내용을 입력합니다.

문단을 나누고 싶으면 한 줄 더 띄웁니다.`,
  isImportant: true,
}
```

- `isImportant: true`로 설정하면 `중요` 표시가 붙습니다.
- 최신 날짜가 상단에 자동 정렬됩니다.

## 관리자용 설문 요약 페이지

- 관리자 페이지 주소: `/admin.html`
- 실제 요약 결과는 `data/survey-summary.json` 파일을 읽어 화면에 표시됩니다.
- 이 파일은 직접 수정하지 않고 자동 생성되도록 구성했습니다.

## 매일 15:30 자동 요약 설정

이 자동화는 `GitHub-hosted runner`가 아니라 `self-hosted runner`를 기준으로 구성되어 있습니다.  
이유는 Ollama + EXAONE이 사용자의 GPU 서버에서 돌아가야 하기 때문입니다.

### 1. self-hosted runner 준비

- 3080 Ti 서버 또는 Ollama가 설치된 서버에 GitHub self-hosted runner를 연결합니다.
- 워크플로는 매일 `15:30 KST`에 실행됩니다.
- GitHub cron 기준으로는 `06:30 UTC`입니다.

### 2. 저장소 Secret / Variable 설정

저장소 `Settings > Secrets and variables > Actions`에서 아래 값을 설정합니다.

#### Secret

- `GOOGLE_SHEETS_CSV_URL`

설문 응답이 쌓이는 Google Sheets 주소는 CSV로 읽을 수 있어야 합니다.  
가장 쉬운 방법은 응답 시트의 공유 주소 또는 CSV export 주소를 넣는 것입니다.

예시:

```text
https://docs.google.com/spreadsheets/d/시트ID/export?format=csv&gid=0
```

#### Variable

- `OLLAMA_API_URL`
  예시: `http://127.0.0.1:11434/api/chat`
- `OLLAMA_MODEL`
  예시: `exaone3.5`

### 3. 자동 생성 결과

- 워크플로 파일: `.github/workflows/daily-survey-summary.yml`
- 생성 스크립트: `tools/generate_survey_summary.py`
- 결과 파일: `data/survey-summary.json`

요약이 실행되면 최신 결과가 `data/survey-summary.json`으로 저장되고,  
GitHub Pages의 `/admin.html` 화면에 표시됩니다.

### 4. 수동 실행

필요하면 `Actions > Daily Survey Summary > Run workflow`로 즉시 수동 실행할 수 있습니다.

### 5. 개인정보 주의

- 스크립트는 `이름`, `전화`, `이메일`, `주소`, `소속`, `군번`처럼 민감할 가능성이 큰 열을 분석에서 제외하도록 구성했습니다.
- 그래도 설문 문항 구조에 따라 추가 점검이 필요합니다.
- 관리자 페이지는 현재 정적 페이지이므로 공개 저장소에서는 주소를 아는 사람이 접근할 수 있습니다.
- 민감한 설문 요약이면 추후 별도 관리자 서버로 분리하는 것을 권장합니다.

## GitHub Pages 반영 방법

1. 파일 수정
2. Git에 커밋
3. GitHub 저장소에 푸시
4. `Settings > Pages`에서 `main` 브랜치 `/ (root)` 배포 확인

예시:

```bash
git add .
git commit -m "Update reservist hub content"
git push
```

푸시 후 GitHub Pages 반영에는 보통 1~3분 정도 걸립니다.

## 운영 메모

- 현재 시간과 서산시 날씨는 페이지에서 자동으로 표시됩니다.
- 설문 링크는 이미 연결되어 있습니다.
- 정신전력평가 링크는 운영 시점에 추가하면 됩니다.
- 예비군 챗봇은 외부 링크로 연결됩니다.
- 관리자용 설문 요약은 `admin.html`에서 확인합니다.
