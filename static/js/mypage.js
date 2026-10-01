// 마이페이지: 내 위치 기록
let myPosts = [];
let myPostsMap = null;

function onAuthReady() {
  document.getElementById("myEmail").textContent = currentUser.email || "";
  loadMyPage();
}

async function loadMyPage() {
  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("내 기록 불러오기 실패:", error);
    document.getElementById("myMapStatus").textContent = "위치 기록을 불러오지 못했습니다.";
    return;
  }

  myPosts = data || [];
  document.getElementById("myCount").textContent = myPosts.length;
  renderMyMap();
}

async function deleteMyPost(post, item = null) {
  if (post.user_id !== currentUser.id) {
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
  item?.remove();
  myPosts = myPosts.filter((itemPost) => String(itemPost.id) !== String(post.id));
  document.getElementById("myCount").textContent = myPosts.length;
  renderMyMap();
  document.querySelector(".mypage-detail-overlay")?.remove();
}

function renderMyMap() {
  const status = document.getElementById("myMapStatus");
  if (typeof L === "undefined") {
    status.textContent = "지도 라이브러리를 불러오지 못했습니다.";
    return;
  }
  if (!myPostsMap) {
    myPostsMap = L.map("myPostsMap").setView([37.5665, 126.978], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(myPostsMap);
  }
  if (myPostsMap.myMarkers) myPostsMap.removeLayer(myPostsMap.myMarkers);
  const markers = L.featureGroup();
  const bounds = [];
  myPosts.forEach((post) => {
    if (post.latitude == null || post.longitude == null) return;
    const marker = L.marker([Number(post.latitude), Number(post.longitude)], {
      icon: L.divIcon({
        className: "leaf-marker-container",
        html: '<span class="leaf-marker">🍃</span>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      })
    });
    marker.bindPopup(`<strong>${escapeMapText(post.nickname || "내 기록")}</strong><br>${escapeMapText((post.content || "사진 제보").slice(0, 100))}`);
    marker.on("click", () => openPostDetails(post));
    marker.addTo(markers);
    bounds.push([Number(post.latitude), Number(post.longitude)]);
  });
  markers.addTo(myPostsMap);
  myPostsMap.myMarkers = markers;
  if (bounds.length) {
    myPostsMap.fitBounds(bounds, { padding: [25, 25], maxZoom: 15 });
    status.textContent = `내 게시글 위치 ${bounds.length}곳을 표시하고 있어요.`;
  } else {
    status.textContent = "위치를 등록한 내 게시글이 아직 없습니다.";
  }
  requestAnimationFrame(() => myPostsMap.invalidateSize());
}

function escapeMapText(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  })[character]);
}

function openPostDetails(post) {
  const modal = document.createElement("div");
  modal.className = "mypage-detail-overlay";
  modal.style.cssText = "position:fixed;inset:0;z-index:10000;background:#0009;display:grid;place-items:center;padding:16px";
  const panel = document.createElement("section");
  panel.className = "forest-card";
  panel.style.cssText = "width:min(680px,100%);max-height:90vh;overflow:auto;margin:0";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "닫기";
  close.addEventListener("click", () => modal.remove());
  panel.appendChild(close);
  if (post.image_url) {
    const image = document.createElement("img");
    image.className = "mypage-post-image";
    image.src = post.image_url;
    image.alt = "게시글 사진";
    panel.appendChild(image);
  }
  const heading = document.createElement("h2");
  heading.textContent = post.nickname || "익명 여행자";
  panel.appendChild(heading);
  const content = document.createElement("p");
  content.className = "mypage-post-content";
  content.textContent = post.content || "사진 제보";
  panel.appendChild(content);
  const date = document.createElement("p");
  date.className = "post-meta";
  date.textContent = post.created_at ? new Date(post.created_at).toLocaleString("ko-KR") : "";
  panel.appendChild(date);
  if (post.latitude != null && post.longitude != null) {
    const location = document.createElement("p");
    location.textContent = `📍 ${Number(post.latitude).toFixed(5)}, ${Number(post.longitude).toFixed(5)}`;
    panel.appendChild(location);
  }
  if (post.analysis) {
    const probability = getKorokProbability(post.analysis);
    if (probability != null) {
      const probabilityLabel = document.createElement("strong");
      probabilityLabel.className = "korok-probability";
      probabilityLabel.textContent = `🍃 코로그 발견 가능성: ${probability}% — 사진을 바탕으로 한 AI 추정이며 실제 확률이 아닙니다.`;
      panel.appendChild(probabilityLabel);
    }
    const analysis = document.createElement("p");
    analysis.textContent = `🧠 ${post.analysis}`;
    panel.appendChild(analysis);
  }
  if (post.user_id === currentUser.id) {
    const actions = document.createElement("div");
    actions.className = "mypage-post-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "수정";
    edit.addEventListener("click", () => {
      location.href = `/pages/board.html?edit=${encodeURIComponent(post.id)}`;
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "삭제";
    remove.addEventListener("click", () => deleteMyPost(post));
    actions.append(edit, remove);
    panel.appendChild(actions);
  }
  modal.appendChild(panel);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

function getKorokProbability(analysis) {
  const line = String(analysis || "").match(/코로그 발견 가능성[^\n]*/i)?.[0] || "";
  const percentage = line.match(/\b(\d{1,3})\s*%/);
  if (!percentage) return null;
  const value = Number(percentage[1]);
  return value <= 100 ? value : null;
}
