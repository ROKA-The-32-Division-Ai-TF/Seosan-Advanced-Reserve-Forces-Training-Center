# 서산시 과학화 예비군 훈련장 웹 허브

GitHub Pages에 바로 배포할 수 있는 정적 안내 페이지입니다.  
운영자가 `data` 폴더와 설정 파일만 수정해도 설문, 식단, 공지사항, 정신전력평가 링크를 관리할 수 있도록 구성했습니다.

## 기본 파일 구조

```text
index.html
style.css
script.js
data/
  site-config.js
  meals.js
  notices.js
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
- 챗 기능은 현재 제거된 상태입니다.
