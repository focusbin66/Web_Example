// 게시판 지도, 사진 게시글, 저장 및 관리 기능
let currentImageAnalysis = "";
let currentUserPosts = [];
let postMap = null;
let recordsMap = null;
let selectedMarker = null;
let postMarkers = null;
let selectedLatitude = null;
let selectedLongitude = null;
let currentPost = null;
let editingPost = null;
let savedPostIds = new Set();
let nearbyOrigin = null;
let currentVisitStatus = null;
let currentVisitedCount = 0;
let visitStatusRequestId = 0;

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

function onAuthReady() {
  initPostMap();
  initRecordsMap();
  setupVisitStatusControls();
  loadSavedPostIds();
  loadPosts();
}

function createPostMarker(latitude, longitude, post) {
  return L.marker([latitude, longitude], { icon: createLeafIcon() })
    .on("click", function () {
      openPostModal(post);
    });
}

function createLeafIcon() {
  return L.divIcon({
    className: "leaf-marker-container",
    html: '<span class="leaf-marker">🍃</span>',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
}

function initPostMap() {
  const element = document.getElementById("postMap");
  if (!element || postMap || typeof L === "undefined") return;

  postMap = L.map(element).setView([37.5665, 126.978], 13);
  addMapTiles(postMap);
  postMap.on("click", function (event) {
    setSelectedLocation(event.latlng.lat, event.latlng.lng);
  });
}

function initRecordsMap() {
  const element = document.getElementById("recordsMap");
  if (!element || recordsMap || typeof L === "undefined") return;

  recordsMap = L.map(element).setView([37.5665, 126.978], 12);
  addMapTiles(recordsMap);
  postMarkers = L.featureGroup().addTo(recordsMap);
}

function addMapTiles(map) {
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

function setSelectedLocation(latitude, longitude) {
  selectedLatitude = latitude;
  selectedLongitude = longitude;

  if (selectedMarker) postMap.removeLayer(selectedMarker);
  selectedMarker = L.marker([latitude, longitude], { icon: createLeafIcon() })
    .addTo(postMap)
    .bindPopup("이 위치에 제보를 등록합니다.")
    .openPopup();

  const label = document.getElementById("selectedLocation");
  if (label) {
    label.textContent = `선택한 위치: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
}

function clearSelectedLocation() {
  selectedLatitude = null;
  selectedLongitude = null;
  if (selectedMarker && postMap) postMap.removeLayer(selectedMarker);
  selectedMarker = null;
  document.getElementById("selectedLocation").textContent = "아직 위치를 선택하지 않았습니다.";
}

function useMyLocation() {
  if (!navigator.geolocation) {
    alert("이 브라우저에서는 위치 기능을 사용할 수 없습니다.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      const { latitude, longitude } = position.coords;
      if (postMap) postMap.setView([latitude, longitude], 16);
      setSelectedLocation(latitude, longitude);
    },
    function (error) {
      alert(error.code === error.PERMISSION_DENIED
        ? "위치 권한을 허용한 뒤 다시 시도해 주세요."
        : "현재 위치를 가져오지 못했습니다.");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function loadSavedPostIds() {
  const { data, error } = await db
    .from("saved_posts")
    .select("post_id")
    .eq("user_id", currentUser.id);

  if (error) {
    console.warn("저장 기능을 사용하려면 Supabase에 saved_posts 테이블을 설정해 주세요.", error);
    return;
  }
  savedPostIds = new Set((data || []).map((row) => String(row.post_id)));
  renderPosts(currentUserPosts);
}

async function loadPosts() {
  const list = document.getElementById("list");
  if (list) list.innerHTML = "<li>숲속 기록을 불러오는 중...</li>";

  const { data, error } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("게시글 불러오기 실패:", error);
    if (list) list.innerHTML = "<li>게시글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</li>";
    return;
  }

  currentUserPosts = data || [];
  renderPosts(currentUserPosts);
  renderPostMarkers(currentUserPosts);
  handleEditQuery();
  handlePostQuery();
}

function renderPosts(posts) {
  const list = document.getElementById("list");
  if (!list) return;
  list.replaceChildren();

  if (!posts.length) {
    const empty = document.createElement("li");
    empty.textContent = nearbyOrigin
      ? "현재 위치 5km 안에 등록된 기록이 없습니다."
      : "아직 등록된 제보가 없습니다.";
    list.appendChild(empty);
    return;
  }

  posts.forEach((post) => {
    const card = document.createElement("li");
    card.className = "post-card";

    const heading = document.createElement("h3");
    heading.textContent = post.nickname || "익명 여행자";
    card.appendChild(heading);

    const body = document.createElement("p");
    body.className = "post-card__content";
    body.textContent = post.content || "내용이 없습니다.";
    card.appendChild(body);

    if (post.image_url) {
      const image = document.createElement("img");
      image.className = "post-image";
      image.src = post.image_url;
      image.alt = "제보 사진 (누르면 상세 보기)";
      image.loading = "lazy";
      image.addEventListener("click", () => openPostModal(post));
      card.appendChild(image);
    }

    const date = document.createElement("p");
    date.className = "post-meta";
    date.textContent = post.created_at
      ? new Date(post.created_at).toLocaleString("ko-KR")
      : "";
    card.appendChild(date);

    const actions = document.createElement("div");
    actions.className = "post-card__actions";
    const detail = document.createElement("button");
    detail.type = "button";
    detail.textContent = "자세히 보기";
    detail.addEventListener("click", () => openPostModal(post));
    actions.appendChild(detail);

    const save = document.createElement("button");
    save.type = "button";
    save.className = "post-card__save" + (savedPostIds.has(String(post.id)) ? " is-saved" : "");
    save.textContent = savedPostIds.has(String(post.id)) ? "♥ 저장됨" : "♡ 저장";
    save.addEventListener("click", () => togglePostSave(post));
    actions.appendChild(save);

    if (isOwnPost(post)) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "수정";
      edit.addEventListener("click", () => startEditing(post));
      actions.appendChild(edit);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "삭제";
      remove.addEventListener("click", () => deletePost(post));
      actions.appendChild(remove);
    }

    card.appendChild(actions);
    card.addEventListener("click", (event) => {
      if (!event.target.closest("button, img")) openPostModal(post);
    });
    list.appendChild(card);
  });
}

function renderPostMarkers(posts) {
  if (!recordsMap || !postMarkers) return;
  postMarkers.clearLayers();
  const locations = [];

  posts.forEach((post) => {
    const latitude = Number(post.latitude);
    const longitude = Number(post.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    createPostMarker(latitude, longitude, post).addTo(postMarkers);
    locations.push([latitude, longitude]);
  });

  if (!nearbyOrigin && locations.length) {
    recordsMap.fitBounds(locations, { padding: [30, 30], maxZoom: 14 });
  }
  requestAnimationFrame(() => recordsMap.invalidateSize());
}

function isOwnPost(post) {
  return Boolean(currentUser && post.user_id === currentUser.id);
}

function openPostModal(post) {
  currentPost = post;
  currentVisitStatus = null;
  currentVisitedCount = 0;
  renderVisitStatus();
  loadPostVisitStatus(post);
  document.getElementById("modalContent").textContent = post.content || "내용이 없습니다.";
  document.getElementById("modalMeta").textContent = `${post.nickname || "익명 여행자"} · ${post.created_at ? new Date(post.created_at).toLocaleString("ko-KR") : ""}`;

  const image = document.getElementById("modalImage");
  image.hidden = !post.image_url;
  if (post.image_url) image.src = post.image_url;
  else image.removeAttribute("src");

  const location = document.getElementById("modalLocation");
  location.replaceChildren();
  const hasLocation = post.latitude != null && post.longitude != null;
  location.textContent = hasLocation
    ? `📍 위치: ${Number(post.latitude).toFixed(5)}, ${Number(post.longitude).toFixed(5)}`
    : "📍 위치 정보가 없습니다.";

  const analysisBox = document.getElementById("modalAnalysis");
  analysisBox.hidden = !post.analysis;
  document.getElementById("modalAnalysisText").textContent = post.analysis || "";
  const probability = getKorokProbability(post.analysis);
  const probabilityLabel = document.getElementById("modalProbability");
  probabilityLabel.hidden = probability == null;
  probabilityLabel.textContent = probability == null
    ? ""
    : `🍃 코로그 발견 가능성: ${probability}% — 사진을 바탕으로 한 AI 추정이며 실제 확률이 아닙니다.`;

  const saved = savedPostIds.has(String(post.id));
  const saveButton = document.getElementById("savePostBtn");
  saveButton.textContent = saved ? "♥ 저장됨" : "♡ 저장";
  saveButton.classList.toggle("is-saved", saved);
  document.getElementById("showPostOnMapBtn").hidden = !hasLocation;
  document.getElementById("editPostBtn").hidden = !isOwnPost(post);
  document.getElementById("deletePostBtn").hidden = !isOwnPost(post);

  document.getElementById("postModal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function setupVisitStatusControls() {
  const visitedSwitch = document.getElementById("visitedSwitch");
  const clearButton = document.getElementById("clearVisitStatusBtn");
  if (visitedSwitch) {
    visitedSwitch.onchange = () => savePostVisitStatus(visitedSwitch.checked ? "visited" : "planned");
  }
  if (clearButton) clearButton.onclick = () => savePostVisitStatus(null);
}

function setVisitStatusButtonsDisabled(disabled) {
  ["visitedSwitch", "clearVisitStatusBtn"].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = disabled;
  });
}

function renderVisitStatus() {
  const count = document.getElementById("visitCount");
  if (count) count.textContent = `다녀온 사람 ${currentVisitedCount}명`;
  const visitedSwitch = document.getElementById("visitedSwitch");
  if (visitedSwitch) visitedSwitch.checked = currentVisitStatus === "visited";
}

async function loadPostVisitStatus(post) {
  const requestId = ++visitStatusRequestId;
  const postId = String(post.id);
  const count = document.getElementById("visitCount");
  const message = document.getElementById("visitStatusMessage");
  if (count) count.textContent = "방문 인원을 확인하고 있어요...";
  if (message) message.textContent = "";
  setVisitStatusButtonsDisabled(true);

  try {
    const { data, error } = await db.rpc("get_post_visit_summary", { p_post_id: post.id });
    if (requestId !== visitStatusRequestId || String(currentPost?.id) !== postId) return;
    if (error) throw error;

    const summary = data?.[0];
    currentVisitedCount = Number(summary?.visited_count) || 0;
    currentVisitStatus = summary?.user_status || null;
    renderVisitStatus();
    setVisitStatusButtonsDisabled(false);
  } catch (error) {
    if (requestId !== visitStatusRequestId || String(currentPost?.id) !== postId) return;
    if (count) count.textContent = "방문 인원을 불러오지 못했습니다.";
    if (message) message.textContent = "Supabase에서 supabase/setup-post-visits.sql을 실행해 방문 기록 기능을 설정해 주세요.";
    setVisitStatusButtonsDisabled(true);
    console.error("방문 상태 불러오기 실패:", error);
  }
}

async function savePostVisitStatus(status) {
  const post = currentPost;
  if (!post || (status === null && currentVisitStatus === null)) return;

  const requestId = ++visitStatusRequestId;
  const postId = String(post.id);
  const previousStatus = currentVisitStatus;
  const message = document.getElementById("visitStatusMessage");
  if (message) message.textContent = "방문 상태를 저장하고 있어요...";
  setVisitStatusButtonsDisabled(true);

  try {
    const result = status
      ? await db.from("post_visit_status").upsert({
          post_id: post.id,
          user_id: currentUser.id,
          status,
          updated_at: new Date().toISOString()
        }, { onConflict: "post_id,user_id" })
      : await db.from("post_visit_status").delete()
          .eq("post_id", post.id)
          .eq("user_id", currentUser.id);
    if (result.error) throw result.error;
    if (requestId !== visitStatusRequestId || String(currentPost?.id) !== postId) return;

    currentVisitStatus = status;
    if (previousStatus !== "visited" && status === "visited") currentVisitedCount++;
    if (previousStatus === "visited" && status !== "visited") currentVisitedCount = Math.max(0, currentVisitedCount - 1);

    const { data, error } = await db.rpc("get_post_visit_summary", { p_post_id: post.id });
    if (requestId !== visitStatusRequestId || String(currentPost?.id) !== postId) return;
    const summary = data?.[0];
    if (!error && summary) currentVisitedCount = Number(summary.visited_count) || 0;

    renderVisitStatus();
    if (message) message.textContent = "";
    setVisitStatusButtonsDisabled(false);
  } catch (error) {
    if (requestId !== visitStatusRequestId || String(currentPost?.id) !== postId) return;
    if (message) message.textContent = "저장에 실패했습니다. Supabase 설정과 권한을 확인해 주세요.";
    setVisitStatusButtonsDisabled(false);
    console.error("방문 상태 저장 실패:", error);
  }
}

function closePostModal() {
  document.getElementById("postModal")?.classList.remove("open");
  document.body.style.overflow = "";
}

document.getElementById("closeModal")?.addEventListener("click", closePostModal);
document.getElementById("postModal")?.addEventListener("click", (event) => {
  if (event.target.id === "postModal") closePostModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePostModal();
});

function showPostOnMap() {
  if (!currentPost || currentPost.latitude == null || currentPost.longitude == null) return;
  closePostModal();
  recordsMap?.setView([currentPost.latitude, currentPost.longitude], 16);
  const marker = postMarkers?.getLayers().find((item) => {
    const point = item.getLatLng();
    return point.lat === Number(currentPost.latitude) && point.lng === Number(currentPost.longitude);
  });
  if (marker) {
    const popup = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = currentPost.nickname || "익명 여행자";
    const excerpt = document.createElement("p");
    excerpt.textContent = (currentPost.content || "사진 제보").slice(0, 100);
    popup.append(title, excerpt);
    marker.bindPopup(popup).openPopup();
  }
}

async function togglePostSave(post = currentPost) {
  if (!post) return;
  const postId = String(post.id);
  const alreadySaved = savedPostIds.has(postId);
  const result = alreadySaved
    ? await db.from("saved_posts").delete().eq("user_id", currentUser.id).eq("post_id", post.id)
    : await db.from("saved_posts").insert({ user_id: currentUser.id, post_id: post.id });

  if (result.error) {
    console.error("저장 처리 실패:", result.error);
    alert("개인 저장 기능을 사용할 수 없습니다. Supabase에 saved_posts 테이블과 RLS 정책을 설정했는지 확인해 주세요.");
    return;
  }

  if (alreadySaved) savedPostIds.delete(postId);
  else savedPostIds.add(postId);
  renderPosts(currentUserPosts);
  if (currentPost) openPostModal(currentPost);
}

function toggleNearbyPosts() {
  const status = document.getElementById("nearbyStatus");
  if (!navigator.geolocation) {
    status.textContent = "이 브라우저에서는 위치 기능을 사용할 수 없습니다.";
    return;
  }
  status.textContent = "현재 위치를 확인하고 있어요...";
  navigator.geolocation.getCurrentPosition((position) => {
    nearbyOrigin = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    const nearby = currentUserPosts.filter((post) => {
      if (post.latitude == null || post.longitude == null) return false;
      return distanceInKm(nearbyOrigin.latitude, nearbyOrigin.longitude, Number(post.latitude), Number(post.longitude)) <= 5;
    });
    renderPosts(nearby);
    renderPostMarkers(nearby);
    recordsMap.setView([nearbyOrigin.latitude, nearbyOrigin.longitude], 12);
    status.textContent = `현재 위치에서 5km 안의 기록 ${nearby.length}개를 표시합니다.`;
    document.getElementById("nearbyPostsBtn").hidden = true;
    document.getElementById("allPostsBtn").hidden = false;
  }, () => {
    status.textContent = "위치 권한을 허용한 뒤 다시 시도해 주세요.";
  }, { enableHighAccuracy: true, timeout: 10000 });
}

function showAllPosts() {
  nearbyOrigin = null;
  renderPosts(currentUserPosts);
  renderPostMarkers(currentUserPosts);
  document.getElementById("nearbyStatus").textContent = "전체 위치 기록을 표시합니다.";
  document.getElementById("nearbyPostsBtn").hidden = false;
  document.getElementById("allPostsBtn").hidden = true;
}

function distanceInKm(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validateImage(file) {
  if (!file) return true;
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    alert("JPG, PNG, WEBP, GIF 이미지 파일만 첨부할 수 있습니다.");
    return false;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    alert("사진은 10MB 이하만 첨부할 수 있습니다.");
    return false;
  }
  return true;
}

function setupComposer() {
  const input = document.getElementById("imageFile");
  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    currentImageAnalysis = "";
    const result = document.getElementById("imageAnalysisResult");
    if (result) result.textContent = "";
    document.getElementById("useImageAnalysisBtn").disabled = true;
    document.getElementById("analyzeImageBtn").disabled = !file;
    const preview = document.getElementById("imagePreview");
    if (!file) {
      preview.style.display = "none";
      preview.removeAttribute("src");
      return;
    }
    if (!validateImage(file)) {
      input.value = "";
      document.getElementById("analyzeImageBtn").disabled = true;
      return;
    }
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
  });

  document.getElementById("analyzeImageBtn").addEventListener("click", analyzeSelectedImage);
  document.getElementById("useImageAnalysisBtn").addEventListener("click", () => {
    if (!currentImageAnalysis) return;
    const content = document.getElementById("content");
    content.value = content.value.trim()
      ? `${content.value.trim()}\n\n${currentImageAnalysis}`
      : currentImageAnalysis;
    content.focus();
  });
}

async function analyzeSelectedImage() {
  const file = document.getElementById("imageFile").files?.[0];
  const button = document.getElementById("analyzeImageBtn");
  const resultBox = document.getElementById("imageAnalysisResult");
  if (!file || !validateImage(file)) return;

  button.disabled = true;
  resultBox.textContent = "사진을 분석하고 있어요...";
  try {
    const image = await fileToAIDataURL(file);
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        prompt: "사진에 실제로 보이는 환경과 특징만 설명해 주세요. 코로그 얼굴, 눈, 가면, 신체 구조, 실루엣을 찾거나 식별하지 말고, 물체의 모양을 코로그 얼굴이나 몸으로 해석하지 마세요. 코로그 발견 가능성은 나무, 바위, 풀숲, 숨을 만한 공간 같은 주변 환경 단서만 근거로 놀이용 추정해 주세요. 마지막에 '🍃 코로그 발견 가능성: 65%'와 같은 형식으로 0~100 사이 정수 퍼센트 하나를 쓰고, 65%는 형식 예시이므로 사진에 맞는 값을 판단해 주세요. 퍼센트 뒤에 '사진을 바탕으로 한 AI 추정이며 실제 확률이 아닙니다.'라고 표시하고 실제 코로그가 있다고 단정하지 마세요."
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `AI 요청 실패 (HTTP ${response.status})`);
    currentImageAnalysis = data.text || "";
    if (!currentImageAnalysis.trim()) throw new Error("AI 분석 결과가 비어 있습니다.");
    const probability = getKorokProbability(currentImageAnalysis);
    resultBox.replaceChildren();
    const text = document.createElement("p");
    text.textContent = currentImageAnalysis;
    resultBox.appendChild(text);
    if (probability != null) {
      const badge = document.createElement("strong");
      badge.className = "korok-probability";
      badge.textContent = `🍃 코로그 발견 가능성: ${probability}% — 사진을 바탕으로 한 AI 추정이며 실제 확률이 아닙니다.`;
      resultBox.prepend(badge);
    }
    document.getElementById("useImageAnalysisBtn").disabled = false;
  } catch (error) {
    currentImageAnalysis = "";
    resultBox.textContent = `사진 분석에 실패했습니다. ${error.message || "잠시 후 다시 시도해 주세요."}`;
  } finally {
    button.disabled = false;
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

async function fileToAIDataURL(file) {
  if (typeof createImageBitmap !== "function") return fileToDataURL(file);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const compressed = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("AI 분석용 사진을 준비하지 못했습니다."));
    }, "image/jpeg", 0.78);
  });
  return fileToDataURL(compressed);
}

async function uploadImage(file) {
  if (!file) return null;
  if (!validateImage(file)) throw new Error("이미지 파일 조건을 확인해 주세요.");
  const extension = file.name.split(".").pop().toLowerCase();
  const filePath = `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from("post-images").upload(filePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type
  });
  if (error) throw error;
  return db.storage.from("post-images").getPublicUrl(filePath).data.publicUrl;
}

function getKorokProbability(analysis) {
  const line = String(analysis || "").match(/코로그 발견 가능성[^\n]*/i)?.[0] || "";
  const percentage = line.match(/\b(\d{1,3})\s*%/);
  if (!percentage) return null;
  const value = Number(percentage[1]);
  return value <= 100 ? value : null;
}

async function addPost() {
  const content = document.getElementById("content").value.trim();
  const imageInput = document.getElementById("imageFile");
  const file = imageInput.files?.[0];
  const submitButton = document.getElementById("submitPostBtn");
  if (!content) {
    alert("게시글 내용을 입력해 주세요.");
    return;
  }
  if (selectedLatitude == null || selectedLongitude == null ||
      !Number.isFinite(Number(selectedLatitude)) || !Number.isFinite(Number(selectedLongitude))) {
    alert("게시글을 등록하려면 지도에서 위치를 선택하거나 현재 위치를 사용해 주세요.");
    document.getElementById("selectedLocation")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!validateImage(file)) return;

  submitButton.disabled = true;
  let uploadedUrl = null;
  try {
    if (file) uploadedUrl = await uploadImage(file);
    const values = {
      content,
      image_url: uploadedUrl || (editingPost ? editingPost.image_url : null),
      latitude: selectedLatitude,
      longitude: selectedLongitude,
      analysis: currentImageAnalysis || (!file && editingPost ? editingPost.analysis : null)
    };

    let result;
    if (editingPost) {
      result = await db.from("posts").update(values)
        .eq("id", editingPost.id)
        .eq("user_id", currentUser.id)
        .select("id")
        .maybeSingle();
    } else {
      result = await db.from("posts").insert({
        ...values,
        nickname: currentUser.email?.split("@")[0] || "여행자",
        user_id: currentUser.id
      });
    }

    if (result.error) throw result.error;
    if (editingPost && !result.data) {
      throw new Error("수정된 게시글이 없습니다. 권한 또는 RLS 정책을 확인해 주세요.");
    }
    resetComposer();
    await loadPosts();
  } catch (error) {
    console.error("게시글 저장 실패:", error);
    alert(`게시글을 저장하지 못했습니다. ${error.message || "오류 내용을 확인해 주세요."}`);
  } finally {
    submitButton.disabled = false;
  }
}

function resetComposer() {
  document.getElementById("content").value = "";
  document.getElementById("imageFile").value = "";
  document.getElementById("imagePreview").style.display = "none";
  document.getElementById("imagePreview").removeAttribute("src");
  document.getElementById("imageAnalysisResult").textContent = "";
  document.getElementById("aiBox").textContent = "";
  document.getElementById("analyzeImageBtn").disabled = true;
  document.getElementById("useImageAnalysisBtn").disabled = true;
  currentImageAnalysis = "";
  clearSelectedLocation();
  editingPost = null;
  document.getElementById("writeHeading").textContent = "새 제보 작성";
  document.getElementById("submitPostBtn").textContent = "게시글 등록";
  document.getElementById("cancelEditBtn").hidden = true;
}

function startEditing(post) {
  if (!isOwnPost(post)) {
    alert("본인이 작성한 게시글만 수정할 수 있습니다.");
    return;
  }
  editingPost = post;
  closePostModal();
  document.getElementById("writeHeading").textContent = "게시글 수정";
  document.getElementById("submitPostBtn").textContent = "수정 저장";
  document.getElementById("cancelEditBtn").hidden = false;
  document.getElementById("content").value = post.content || "";
  currentImageAnalysis = post.analysis || "";
  if (post.analysis) document.getElementById("imageAnalysisResult").textContent = post.analysis;
  selectedLatitude = post.latitude == null ? null : Number(post.latitude);
  selectedLongitude = post.longitude == null ? null : Number(post.longitude);
  if (selectedLatitude != null && postMap) {
    postMap.setView([selectedLatitude, selectedLongitude], 15);
    setSelectedLocation(selectedLatitude, selectedLongitude);
  }
  if (post.image_url) {
    const preview = document.getElementById("imagePreview");
    preview.src = post.image_url;
    preview.style.display = "block";
  }
  document.getElementById("writeHeading").scrollIntoView({ behavior: "smooth" });
}

function editCurrentPost() {
  if (currentPost) startEditing(currentPost);
}

function cancelEdit() {
  resetComposer();
}

async function deletePost(post) {
  if (!isOwnPost(post)) {
    alert("본인이 작성한 게시글만 삭제할 수 있습니다.");
    return;
  }
  if (!confirm("이 게시글을 삭제할까요?")) return;
  const { error } = await db.from("posts").delete()
    .eq("id", post.id)
    .eq("user_id", currentUser.id);
  if (error) {
    alert(`삭제하지 못했습니다. ${error.message}`);
    return;
  }
  closePostModal();
  await loadPosts();
}

function deleteCurrentPost() {
  if (currentPost) deletePost(currentPost);
}

async function polish() {
  const content = document.getElementById("content").value.trim();
  const result = document.getElementById("aiBox");
  const button = document.getElementById("aiBtn");
  if (!content) return;
  button.disabled = true;
  result.textContent = "문장을 다듬는 중...";
  try {
    result.textContent = await askAI(`다음 문장을 게시판에 올리기 좋게 자연스럽게 다듬어줘. 원래 의미를 유지해.\n\n${content}`);
  } catch (error) {
    result.textContent = `AI 요청 실패: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

async function aiSearchPosts() {
  const input = document.getElementById("aiSearchInput");
  const resultBox = document.getElementById("aiSearchResult");
  const button = document.getElementById("aiSearchBtn");
  const query = input.value.trim();
  if (!query) {
    resultBox.textContent = "검색 내용을 입력해 주세요.";
    return;
  }
  if (!currentUserPosts.length) {
    resultBox.textContent = "검색할 게시글이 없습니다.";
    return;
  }
  button.disabled = true;
  resultBox.textContent = "게시글을 살펴보고 있어요...";
  try {
    const compactPosts = currentUserPosts.slice(0, 80).map((post) => ({
      id: post.id,
      author: post.nickname || "익명",
      text: post.content || "",
      photoAnalysis: post.analysis || "",
      hasPhoto: Boolean(post.image_url),
      hasLocation: post.latitude != null && post.longitude != null
    }));
    const answer = await askAI(
      "아래 게시글만 근거로 자연어 검색과 관련된 글을 찾으세요. 사진 분석 내용도 단서로 쓰되 사진 파일 자체를 보았다고 주장하지 마세요. 최대 5개, 관련 글이 없으면 없다고 답하세요. 정확히 JSON 배열로 [ {\"id\": 게시글ID, \"reason\": \"선정 이유\"} ] 형식으로 응답하세요.\n검색 요청: " + query + "\n게시글: " + JSON.stringify(compactPosts)
    );
    renderSearchResults(answer, resultBox);
  } catch (error) {
    resultBox.textContent = `AI 검색에 실패했습니다. ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function renderSearchResults(answer, container) {
  let matches = [];
  try {
    const json = answer.match(/\[[\s\S]*\]/)?.[0];
    if (json) matches = JSON.parse(json);
  } catch (error) {
    console.warn("AI 검색 결과 JSON 해석 실패:", error);
  }
  container.replaceChildren();
  if (!matches.length) {
    container.textContent = answer.includes("없") ? "관련 게시글이 없습니다." : answer;
    return;
  }
  matches.forEach((match) => {
    const post = currentUserPosts.find((item) => String(item.id) === String(match.id));
    if (!post) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.textContent = `${post.nickname || "익명"}: ${post.content || "사진 제보"} — ${match.reason || "관련 기록"}`;
    button.addEventListener("click", () => openPostModal(post));
    container.appendChild(button);
  });
  if (!container.childElementCount) container.textContent = "관련 게시글이 없습니다.";
}

function handleEditQuery() {
  const editId = new URLSearchParams(location.search).get("edit");
  if (!editId) return;
  const post = currentUserPosts.find((item) => String(item.id) === editId);
  if (post && isOwnPost(post)) startEditing(post);
  else alert("수정할 게시글을 찾을 수 없거나 권한이 없습니다.");
  history.replaceState(null, "", location.pathname);
}

function handlePostQuery() {
  const postId = new URLSearchParams(location.search).get("post");
  if (!postId) return;
  const post = currentUserPosts.find((item) => String(item.id) === postId);
  if (post) openPostModal(post);
  else alert("게시글을 찾을 수 없습니다.");
  history.replaceState(null, "", location.pathname);
}

setupComposer();
document.getElementById("aiSearchInput")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    aiSearchPosts();
  }
});
