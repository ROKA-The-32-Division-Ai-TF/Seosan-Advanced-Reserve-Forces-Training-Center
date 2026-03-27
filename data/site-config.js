/* 수정 포인트:
 * - 페이지 제목, 부제목, 설문 링크를 이 파일에서 수정합니다.
 * - 날씨 표시는 cityName, latitude, longitude 값을 바꾸면 다른 지역으로 변경할 수 있습니다.
 */

window.siteConfig = {
  unitName: "제32보병사단",
  pageTitle: "예비군 훈련 안내",
  pageSubtitle: "필요한 정보를 빠르게 확인하세요",
  survey: {
    url: "https://docs.google.com/forms/d/e/1FAIpQLSffbvyIgFMrx4TUHviybKozJizVmue26MNubdqM98nbtVEJfw/viewform",
    buttonLabel: "설문 참여하기",
  },
  weather: {
    cityName: "서산시",
    latitude: 36.7849,
    longitude: 126.4503,
    timezone: "Asia/Seoul",
  },
};
