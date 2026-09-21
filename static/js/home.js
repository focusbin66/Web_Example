
let homeMap = null;
let homeMapMarkers = null;

// HTML 문자 처리
function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 픽셀 코로그풍 지도 마커
function createKorokIcon() {
  return L.divIcon({
    className: "korok-marker",
    html: `
      <div class="pixel-korok">
        <div class="pixel-korok__leaf"></div>
        <div class="pixel-korok__mask">
          <span class="pixel-korok__eye pixel-korok__eye--left"></span>
          <span class="pixel-korok__eye pixel-korok__eye--right"></span>
        </div>
        <div class="pixel-korok__body"></div>
        <div class="pixel-korok__feet"></div>
      </div>
    `,
    iconSize: [48, 58],
    iconAnchor: [24, 54],
    popupAnchor: [0, -52]
  });
}

// 로그인 상태 표시
function onAuthReady() {
  const loginBox = document.getElementById("loginBox");
  const welcomeBox = document.getElementById("welcomeBox");

  if (currentUser) {
    if (loginBox) loginBox.hidden = true;
    if (welcomeBox) welcomeBox.hidden = false;

    const hello = document.getElementById("hello");

    if (hello) {
      const emailName = currentUser.email
        ? currentUser.email.split("@")[0]
        : "여행자";

      hello.textContent =
        `${emailName}님, 숲에 오신 걸 환영해요!`;
    }
  } else {
    if (loginBox) loginBox.hidden = false;
    if (welcomeBox) welcomeBox.hidden = true;
  }

  initHomeMap();
}

// 지도 초기화
function initHomeMap() {
  const mapElement = document.getElementById("homeMap");

  if (!mapElement || homeMap) return;

  if (typeof L === "undefined") {
    setMapStatus("지도 라이브러리를 불러오지 못했습니다.");
    return;
  }

  homeMap = L.map(mapElement).setView(
    [37.5665, 126.9780],
    12
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(homeMap);

  homeMapMarkers = L.featureGroup().addTo(homeMap);

  loadHomePosts();

  requestAnimationFrame(() => {
    if (homeMap) homeMap.invalidateSize();
  });
}

// 지도 상태 안내
function setMapStatus(message) {
  const status = document.getElementById("mapStatus");
  if (status) status.textContent = message;
}

// 게시글 불러오기
async function loadHomePosts() {
  if (!homeMapMarkers) return;

  setMapStatus("숲속 게시글 위치를 찾는 중...");

  const { data, error } = await db
    .from("posts")
    .select(
      "id, nickname, content, image_url, latitude, longitude, created_at"
    )
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("홈 지도 게시글 불러오기 실패:", error);
    setMapStatus("게시글을 불러오지 못했어요.");
    return;
  }

  homeMapMarkers.clearLayers();

  const bounds = [];
  let displayedCount = 0;

  (data || []).forEach((post) => {
    const lat = Number(post.latitude);
    const lng = Number(post.longitude);

    // 좌표 검증
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return;
    }

    // 픽셀 코로그 마커 적용
    const marker = L.marker([lat, lng], {
      icon: createKorokIcon(),
      alt: "게시글 위치"
    });

    const imageURL =
      typeof post.image_url === "string" &&
      post.image_url.startsWith("https://")
        ? post.image_url
        : "";

    const imageHTML = imageURL
      ? `
        <img
          src="${escapeHTML(imageURL)}"
          alt="게시글 사진"
          loading="lazy"
        >
      `
      : "";

    const popupHTML = `
      <div class="map-popup">
        <strong>
          ${escapeHTML(post.nickname || "익명 여행자")}
        </strong>

        <p>${escapeHTML(post.content || "")}</p>

        ${imageHTML}

        <p>
          <a href="/pages/board.html">
            게시판에서 보기 →
          </a>
        </p>
      </div>
    `;

    marker.bindPopup(popupHTML);
    marker.addTo(homeMapMarkers);

    bounds.push([lat, lng]);
    displayedCount++;
  });

  if (bounds.length > 0) {
    homeMap.fitBounds(bounds, {
      padding: [30, 30],
      maxZoom: 15
    });

    setMapStatus(
      `🍃 지도에서 ${displayedCount}개의 게시글 위치를 찾았어요.`
    );
  } else {
    homeMap.setView([37.5665, 126.9780], 12);

    setMapStatus(
      "아직 표시할 위치가 없어요. 첫 번째 이야기를 남겨보세요!"
    );
  }
}

// 페이지 로드 시 지도 초기화
document.addEventListener("DOMContentLoaded", () => {
  initHomeMap();
});