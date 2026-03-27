/* 수정 포인트:
 * - 페이지 제목, 부제목, 설문 링크, 정신전력평가 링크, 챗봇 링크를 이 파일에서 수정합니다.
 * - 정신전력평가 링크를 아직 사용하지 않으면 url 값을 빈 문자열("")로 둡니다.
 * - 날씨 표시는 cityName, latitude, longitude 값을 바꾸면 다른 지역으로 변경할 수 있습니다.
 */

window.siteConfig = {
  siteTitle: "서산시 과학화 예비군 훈련장",
  pageSubtitle: "",
  survey: {
    url: "https://docs.google.com/forms/d/e/1FAIpQLSffbvyIgFMrx4TUHviybKozJizVmue26MNubdqM98nbtVEJfw/viewform",
    buttonLabel: "설문 참여하기",
  },
  mentalEvaluation: {
    url: "",
    buttonLabel: "정신전력평가 바로가기",
  },
  chatbot: {
    url: "https://chatbot.gov.kt-aicc.com/client/GCL-02-C-00000046-0001/chat.html",
  },
  weather: {
    cityName: "서산시",
    latitude: 36.7849,
    longitude: 126.4503,
    timezone: "Asia/Seoul",
  },
};
