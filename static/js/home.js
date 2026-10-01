
let homeMap = null;
let homeMapMarkers = null;
let homePosts = [];
let visitedPostIds = new Set();
let myLocationMarker = null;
let myLocationAccuracy = null;
let hasCenteredOnMyLocation = false;

function createHomeMarkerIcon(visited) {
  return L.divIcon({
    className: "leaf-marker-container",
    html: `<span class="leaf-marker${visited ? " leaf-marker--visited" : ""}">🍃</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
}

function createLeafMarker(latitude, longitude, visited = false) {
  return L.marker(
    [latitude, longitude],
    {
      icon: createHomeMarkerIcon(visited)
    }
  );
}

// HTML 문자 처리
function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
      "id, image_url, analysis, latitude, longitude"
    )
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("홈 지도 게시글 불러오기 실패:", error);
    setMapStatus("게시글을 불러오지 못했어요.");
    return;
  }

  homePosts = data || [];
  renderHomePosts();
}

function renderHomePosts() {
  if (!homeMapMarkers) return;
  homeMapMarkers.clearLayers();
  const filter = document.getElementById("probabilityFilter")?.value || "all";
  const bounds = [];
  let displayedCount = 0;

  homePosts.forEach((post) => {
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

    const imageURL =
      typeof post.image_url === "string" &&
      post.image_url.startsWith("https://")
        ? post.image_url
        : "";

    if (!imageURL) return;

    const probability = getKorokProbability(post.analysis);
    if (!matchesProbabilityFilter(probability, filter)) return;
    const marker = createLeafMarker(lat, lng, visitedPostIds.has(String(post.id)));

    const summary = getKorokSummary(post);
    const probabilityText = probability == null
      ? "퍼센트 분석 없음"
      : `코로그 발견 가능성 ${probability}% — 사진을 바탕으로 한 AI 추정이며 실제 확률이 아닙니다.`;

    const popupHTML = `
      <div class="map-popup">
        <img src="${escapeHTML(imageURL)}" alt="게시글 사진" loading="lazy">
        <strong>🍃 ${escapeHTML(probabilityText)}</strong>
        <p class="map-summary">🍃 ${escapeHTML(summary)}</p>
        <div class="map-visit">
          <p class="map-visit__count" aria-live="polite">방문 인원 확인 중...</p>
          <label class="map-visit__control">
            <span>방문 전</span>
            <input class="map-visited-switch" type="checkbox" role="switch" aria-label="방문 전 또는 방문 후 상태" disabled>
            <span class="map-visit__track" aria-hidden="true"></span>
            <span>방문 후</span>
          </label>
          <p class="map-visit__message" aria-live="polite"></p>
        </div>
        <a class="map-popup__board-link" href="/pages/board.html?post=${encodeURIComponent(post.id)}">게시판에서 보기</a>
      </div>
    `;

    marker.bindPopup(popupHTML);
    marker.on("popupopen", (event) => setupHomeVisitSwitch(event.popup, post, marker));
    marker.addTo(homeMapMarkers);

    bounds.push([lat, lng]);
    displayedCount++;
  });

  if (bounds.length > 0) {
    if (!hasCenteredOnMyLocation) {
      homeMap.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 15
      });
    }

    setMapStatus(`🍃 선택한 확률 조건에 맞는 게시글 ${displayedCount}개를 표시하고 있어요.`);
  } else {
    setMapStatus("선택한 확률 조건에 맞는 위치 게시글이 없습니다.");
  }
}

async function setupHomeVisitSwitch(popup, post, marker) {
  const popupElement = popup.getElement();
  if (!popupElement) return;
  L.DomEvent.disableClickPropagation(popupElement);

  const count = popupElement.querySelector(".map-visit__count");
  const toggle = popupElement.querySelector(".map-visited-switch");
  const message = popupElement.querySelector(".map-visit__message");
  if (!count || !toggle || !message) return;

  try {
    const { data, error } = await db.rpc("get_post_visit_summary", { p_post_id: post.id });
    if (error) throw error;
    const summary = data?.[0];
    count.textContent = `다녀온 사람 ${Number(summary?.visited_count) || 0}명`;
    toggle.checked = summary?.user_status === "visited";
    updateHomePostMarker(post.id, marker, toggle.checked);

    if (!currentUser) {
      toggle.disabled = true;
      message.textContent = "방문 상태를 저장하려면 로그인해 주세요.";
      return;
    }

    toggle.disabled = false;
    message.textContent = "";

    toggle.onchange = async () => {
      const previousStatus = summary?.user_status || null;
      const nextStatus = toggle.checked ? "visited" : "planned";
      toggle.disabled = true;
      message.textContent = "방문 상태를 저장하고 있어요...";
      try {
        const result = await db.from("post_visit_status").upsert({
          post_id: post.id,
          user_id: currentUser.id,
          status: nextStatus,
          updated_at: new Date().toISOString()
        }, { onConflict: "post_id,user_id" });
        if (result.error) throw result.error;

        const refreshed = await db.rpc("get_post_visit_summary", { p_post_id: post.id });
        if (refreshed.error) throw refreshed.error;
        const updatedSummary = refreshed.data?.[0];
        count.textContent = `다녀온 사람 ${Number(updatedSummary?.visited_count) || 0}명`;
        toggle.checked = updatedSummary?.user_status === "visited";
        updateHomePostMarker(post.id, marker, toggle.checked);
        message.textContent = "";
      } catch (error) {
        toggle.checked = previousStatus === "visited";
        message.textContent = "저장에 실패했습니다. 방문 상태 SQL 설정을 확인해 주세요.";
        console.error("홈 지도 방문 상태 저장 실패:", error);
      } finally {
        toggle.disabled = false;
      }
    };
  } catch (error) {
    count.textContent = "방문 인원을 불러오지 못했습니다.";
    message.textContent = "Supabase에서 방문 상태 설정 SQL을 실행해 주세요.";
    toggle.disabled = true;
    console.error("홈 지도 방문 상태 불러오기 실패:", error);
  }
}

function updateHomePostMarker(postId, marker, visited) {
  const id = String(postId);
  if (visited) visitedPostIds.add(id);
  else visitedPostIds.delete(id);
  marker.setIcon(createHomeMarkerIcon(visited));
}

function showMyLocation() {
  const status = document.getElementById("locationStatus");
  const button = document.getElementById("showMyLocationBtn");
  if (!navigator.geolocation) {
    if (status) status.textContent = "이 브라우저에서는 현재 위치 기능을 사용할 수 없습니다.";
    return;
  }

  if (button) button.disabled = true;
  if (status) status.textContent = "현재 위치를 확인하고 있어요...";
  navigator.geolocation.getCurrentPosition((position) => {
    const { latitude, longitude, accuracy } = position.coords;
    const location = [latitude, longitude];
    hasCenteredOnMyLocation = true;

    if (!myLocationMarker) {
      myLocationMarker = L.circleMarker(location, {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#2478e5",
        fillOpacity: 1
      }).addTo(homeMap).bindPopup("현재 내 위치");
      myLocationAccuracy = L.circle(location, {
        radius: accuracy,
        color: "#2478e5",
        weight: 1,
        fillColor: "#2478e5",
        fillOpacity: 0.12
      }).addTo(homeMap);
    } else {
      myLocationMarker.setLatLng(location);
      myLocationAccuracy.setLatLng(location).setRadius(accuracy);
    }

    homeMap.setView(location, Math.max(homeMap.getZoom(), 15));
    myLocationMarker.openPopup();
    if (status) status.textContent = `현재 위치를 파란색 마커로 표시했어요. (정확도 약 ${Math.round(accuracy)}m)`;
    if (button) button.disabled = false;
  }, (error) => {
    const message = error.code === error.PERMISSION_DENIED
      ? "위치 권한이 거부되었습니다. 브라우저에서 위치 권한을 허용해 주세요."
      : error.code === error.TIMEOUT
        ? "위치 확인 시간이 초과되었습니다. 다시 시도해 주세요."
        : "현재 위치를 가져오지 못했습니다. 위치 설정을 확인해 주세요.";
    if (status) status.textContent = message;
    if (button) button.disabled = false;
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

function getKorokProbability(analysis) {
  const line = String(analysis || "").match(/코로그 발견 가능성[^\n]*/i)?.[0] || "";
  const percentage = line.match(/\b(\d{1,3})\s*%/);
  if (!percentage) return null;
  const value = Number(percentage[1]);
  return value <= 100 ? value : null;
}

function matchesProbabilityFilter(probability, filter) {
  if (filter === "all") return true;
  if (filter === "none") return probability == null;
  if (probability == null) return false;
  const [minimum, maximum] = filter.split("-").map(Number);
  return probability >= minimum && probability <= maximum;
}

function getKorokSummary(post) {
  const analysis = String(post.analysis || "");
  const explicitLine = analysis.match(/코로그 발견 가능성 한 줄\s*[:：]?\s*([^\n]+)/i);
  if (explicitLine) return explicitLine[1].trim().replace(/\s+/g, " ");

  const description = analysis.split(/(?:📷\s*사진 설명|🌿\s*눈여겨볼 요소)/)[1] || analysis;
  const text = description
    .split(/\n\s*\n/)[0]
    .replace(/🍃.*$/s, "")
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return "AI 요약이 아직 없습니다.";

  const firstSentence = text.match(/^.*?[.!?。](?:\s|$)/)?.[0] || text;
  return `사진 내용 추정 — ${firstSentence.trim().slice(0, 110)}`;
}

// 페이지 로드 시 지도 초기화
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("probabilityFilter")?.addEventListener("change", renderHomePosts);
  document.getElementById("showMyLocationBtn")?.addEventListener("click", showMyLocation);
  initHomeMap();
});