# 서산시 과학화 예비군 훈련장 웹 허브

공개 안내 페이지는 GitHub Pages용 정적 사이트입니다.  
관리자 기능은 별도 백엔드에 로그인해서 사용합니다.

## 파일 구조

```text
index.html
style.css
script.js
data/
  site-config.js
  notices.js
  meals.js
  emergency-contacts.js
  public-state.js
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

## 공개 페이지에서 직접 수정하는 파일

### 설문 링크
파일: `data/site-config.js`

```js
survey: {
  url: "여기에 설문 링크 입력",
  buttonLabel: "설문 참여하기",
}
```

### 정신전력평가 링크
파일: `data/site-config.js`

```js
mentalEvaluation: {
  url: "여기에 정신전력평가 링크 입력",
  buttonLabel: "정신전력평가 바로가기",
}
```

### 예비군 챗봇 링크
파일: `data/site-config.js`

```js
chatbot: {
  url: "여기에 챗봇 링크 입력",
}
```

## 관리자 페이지에서 수정하는 항목

아래 파일들은 관리자 백엔드가 자동으로 다시 생성합니다.

- `data/notices.js`
- `data/meals.js`
- `data/emergency-contacts.js`
- `data/public-state.js`

즉, 공지사항, 식사표, 긴급연락처, 공개 사이트 가동 설정은  
가급적 파일을 직접 열지 말고 관리자 페이지에서 수정하는 방식으로 사용하면 됩니다.

## 관리자 페이지에서 할 수 있는 일

- 공개 사이트 가동 여부 켜기 / 끄기
- 공개 사이트 운영 시간 설정
- 공지사항 작성 / 수정 / 삭제
- 긴급연락처 작성 / 수정 / 삭제
- 식사표 작성 / 수정 / 삭제
- EXAONE(Ollama) 기반 공지 초안 생성
- 설문 요약 조회
- 다른 관리자 계정 추가

## 관리자 백엔드 실행 방법

```bash
cd /Users/jeongdongho/Desktop/github
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

맥북에서 바로 접속:

```text
http://127.0.0.1:8000/admin/login
```

스마트폰에서 접속:

```text
http://맥북IP:8000/admin/login
```

- 맥북과 스마트폰이 같은 와이파이 또는 같은 네트워크에 있어야 합니다.
- 예: `http://192.168.0.15:8000/admin/login`

## 초기 관리자 생성

서버를 처음 열면 `/admin/login`에서 초기 관리자 계정을 바로 만들 수 있습니다.

또는 터미널에서 직접 생성할 수도 있습니다.

```bash
python3 -m backend.manage_admin create-user admin "관리자 이름"
```

## 공개 사이트 가동 시간 설정

관리자 페이지의 `공개 사이트 운영` 섹션에서 아래를 설정할 수 있습니다.

- 공개 사이트 가동 여부
- 시간 제한 사용 여부
- 시작 시간
- 종료 시간
- 접근 제한 안내 문구

기본 예시:

- 시작: `09:00`
- 종료: `15:30`

중요:

- 현재 공개 사이트는 GitHub Pages 정적 페이지입니다.
- 따라서 이 기능은 브라우저 화면에서 접근을 제한하는 방식입니다.
- 완전한 서버 차단이 필요하면 정적 사이트가 아니라 별도 웹서버 또는 프록시 구성이 필요합니다.

## 공지사항 수정 형식

관리자 페이지에서 저장하면 아래 형식으로 공개 파일에 반영됩니다.

```js
{
  date: "2026-04-05",
  title: "공지 제목",
  content: "공지 본문",
  isImportant: true,
}
```

## 식사표 수정 형식

관리자 페이지에서 저장하면 아래 형식으로 공개 파일에 반영됩니다.

```js
{
  date: "2026-04-05",
  mealType: "중식",
  menu: ["백미밥", "국", "반찬 1"],
  note: "배식 시간 또는 참고 문구",
}
```

## 긴급연락처 수정 형식

관리자 페이지에서 저장하면 아래 형식으로 공개 파일에 반영됩니다.

```js
{
  id: "contact-1",
  name: "당직실",
  role: "긴급 연락",
  phone: "041-000-0000",
  note: "응급 상황 시 우선 연락",
  sortOrder: 1,
}
```

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

## 공개 사이트 자동 반영

관리자 백엔드는 저장 시 공개 파일을 다시 생성합니다.

GitHub Pages까지 자동 반영하려면 아래 환경 변수를 설정합니다.

```text
AUTO_PUBLISH_PUBLIC_SITE=1
PUBLIC_GIT_REMOTE=origin
PUBLIC_GIT_BRANCH=main
```

주의:

- 백엔드가 실행되는 맥북 또는 서버에 Git 푸시 권한이 있어야 합니다.
- 자동 푸시를 켜지 않으면 로컬 파일만 바뀌고 GitHub Pages에는 반영되지 않습니다.

## GitHub Pages 수동 반영 방법

```bash
git add .
git commit -m "Update reservist hub content"
git push
```

푸시 후 GitHub Pages 반영에는 보통 1~3분 정도 걸립니다.
