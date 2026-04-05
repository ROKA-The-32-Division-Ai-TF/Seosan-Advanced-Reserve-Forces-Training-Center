# 서산시 과학화 예비군 훈련장 웹 허브

공개 안내 페이지는 GitHub Pages용 정적 사이트로 유지하고,  
관리자 기능은 별도 백엔드에서 로그인 후 사용하는 구조로 분리했습니다.

## 기본 파일 구조

```text
index.html
style.css
script.js
data/
  site-config.js
  meals.js
  notices.js
backend/
  app.py
  config.py
  db.py
  security.py
  services.py
  manage_admin.py
  requirements.txt
  templates/
  static/
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

## 관리자 백엔드

관리자 기능은 GitHub Pages가 아니라 별도 백엔드 서버에서 운영합니다.

기능:

- 로그인 기반 관리자 접근
- 관리자 계정 추가
- 공지사항 작성 / 수정 / 삭제
- EXAONE(Ollama) 기반 공지 초안 생성
- 매일 15:30 설문 자동 요약
- 설문 요약 조회

### 실행 방법

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app:app --reload
```

접속:

```text
http://127.0.0.1:8000/admin/login
```

### 초기 관리자 생성

서버를 처음 열면 `/admin/login`에서 초기 관리자 계정을 바로 만들 수 있습니다.

또는 CLI로 추가할 수도 있습니다.

```bash
python3 -m backend.manage_admin create-user admin "관리자 이름"
```

### 관리자 추가

- 로그인 후 대시보드 하단에서 다른 관리자 계정을 추가할 수 있습니다.
- 이렇게 만든 계정은 다른 담당자에게 넘겨서 같이 운영할 수 있습니다.

## 설문 자동 요약

백엔드가 매일 `15:30 Asia/Seoul`에 Google Sheets 응답을 읽고 Ollama로 요약합니다.

필수 환경 변수:

```text
ADMIN_SESSION_SECRET=충분히긴랜덤문자열
GOOGLE_SHEETS_CSV_URL=https://docs.google.com/spreadsheets/d/시트ID/export?format=csv&gid=0
OLLAMA_API_URL=http://127.0.0.1:11434/api/chat
OLLAMA_MODEL=exaone3.5
```

선택 환경 변수:

```text
NOTICE_DRAFT_MODEL=exaone3.5
ENABLE_SUMMARY_SCHEDULER=1
```

## 공개 페이지 공지 자동 반영

관리자 백엔드는 공지 저장 시 `data/notices.js`를 다시 생성합니다.

추가로 GitHub Pages까지 자동 반영하려면 백엔드 서버에서 이 저장소를 푸시할 수 있어야 하며, 아래 환경 변수를 설정합니다.

```text
AUTO_PUBLISH_PUBLIC_SITE=1
PUBLIC_GIT_REMOTE=origin
PUBLIC_GIT_BRANCH=main
```

주의:

- 이 기능을 쓰려면 백엔드 서버의 저장소 clone에 푸시 권한이 있어야 합니다.
- 자동 푸시를 꺼두면 로컬 파일만 갱신되고 GitHub Pages에는 반영되지 않습니다.

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
- 관리자 기능은 정적 페이지가 아니라 백엔드에서 로그인 후 사용합니다.
