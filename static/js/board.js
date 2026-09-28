
// 게시판 페이지 전용 코드
// 사진 미리보기 + AI 사진 분석 기능 통합

// =========================================================
// 지도 전역 변수
// =========================================================

let postMap = null;
let selectedMarker = null;

let selectedLatitude = null;
let selectedLongitude = null;


// =========================================================
// 로그인 완료 후 실행
// =========================================================

function onAuthReady() {
  loadPosts();
  initPostMap();
}


// =========================================================
// HTML 문자 처리
// =========================================================

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// =========================================================
// 지도 초기화
// =========================================================

function initPostMap() {
  const mapElement = document.getElementById("postMap");

  if (!mapElement || postMap) return;

  postMap = L.map("postMap").setView(
    [37.5665, 126.9780],
    13
  );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }
  ).addTo(postMap);

  postMap.on("click", function (event) {
    setSelectedLocation(
      event.latlng.lat,
      event.latlng.lng
    );
  });
}


// =========================================================
// 위치 선택
// =========================================================

function setSelectedLocation(latitude, longitude) {
  selectedLatitude = latitude;
  selectedLongitude = longitude;

  if (selectedMarker) {
    postMap.removeLayer(selectedMarker);
  }

  selectedMarker = L.marker([
    latitude,
    longitude
  ]).addTo(postMap);

  selectedMarker
    .bindPopup("제보 위치")
    .openPopup();

  const locationBox =
    document.getElementById("selectedLocation");

  if (locationBox) {
    locationBox.textContent =
      "선택한 위치: " +
      latitude.toFixed(6) +
      ", " +
      longitude.toFixed(6);
  }
}


// =========================================================
// 현재 위치 사용
// =========================================================

function useMyLocation() {
  if (!navigator.geolocation) {
    alert("이 브라우저에서는 위치 기능을 사용할 수 없습니다.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      if (postMap) {
        postMap.setView(
          [latitude, longitude],
          16
        );
      }

      setSelectedLocation(latitude, longitude);
    },
    function () {
      alert(
        "현재 위치를 가져오지 못했습니다.\n" +
        "브라우저의 위치 권한을 확인해 주세요."
      );
    }
  );
}


// =========================================================
// 사진 미리보기 + AI 분석 버튼 활성화
// =========================================================

function setupImageFeatures() {
  const imageInput =
    document.getElementById("imageFile");

  const preview =
    document.getElementById("imagePreview");

  const analyzeButton =
    document.getElementById("analyzeImageBtn");

  if (!imageInput) return;

  if (analyzeButton) {
    analyzeButton.disabled = true;
  }

  imageInput.addEventListener("change", function () {
    const file = imageInput.files?.[0];

    if (preview) {
      preview.src = "";
      preview.style.display = "none";
    }

    if (analyzeButton) {
      analyzeButton.disabled = true;
    }

    const resultBox =
      document.getElementById("imageAnalysisResult");

    if (resultBox) {
      resultBox.textContent = "";
    }

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 첨부할 수 있습니다.");
      imageInput.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert("사진은 10MB 이하만 첨부할 수 있습니다.");
      imageInput.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = function (event) {
      if (preview) {
        preview.src = event.target.result;
        preview.style.display = "block";
      }

      if (analyzeButton) {
        analyzeButton.disabled = false;
      }
    };

    reader.onerror = function () {
      alert("사진을 읽지 못했습니다.");
    };

    reader.readAsDataURL(file);
  });
}


// =========================================================
// AI 사진 분석
// =========================================================

async function analyzeImage() {
  const imageInput =
    document.getElementById("imageFile");

  const analyzeButton =
    document.getElementById("analyzeImageBtn");

  const resultBox =
    document.getElementById("imageAnalysisResult");

  const file = imageInput?.files?.[0];

  if (!file) {
    alert("먼저 사진을 선택해 주세요.");
    return;
  }

  if (!resultBox) {
    alert("사진 분석 결과를 표시할 영역이 없습니다.");
    return;
  }

  if (analyzeButton) {
    analyzeButton.disabled = true;
  }

  resultBox.textContent = "사진을 분석하는 중...";

  try {
    const imageData = await new Promise(
      function (resolve, reject) {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(
          new Error("사진을 읽지 못했습니다.")
        );

        reader.readAsDataURL(file);
      }
    );

    const response = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "analyze-image",
        image: imageData,
        prompt:
          "이 사진에 보이는 장소와 주변 환경을 설명해줘. " +
          "확실하지 않은 정보는 추측하지 말고, " +
          "코로그가 나올 법한 특징이 있다면 함께 알려줘. " +
          "게시판에 올릴 수 있는 자연스러운 한국어로 답해줘."
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "사진 분석 요청에 실패했습니다."
      );
    }

    const answer =
      result.answer ||
      result.result ||
      result.text;

    if (!answer) {
      throw new Error("AI 분석 결과가 비어 있습니다.");
    }

    resultBox.textContent = answer;

  } catch (error) {
    console.error("사진 분석 실패:", error);

    resultBox.textContent =
      "사진 분석에 실패했습니다. " +
      (error.message || "잠시 후 다시 시도해 주세요.");

  } finally {
    if (analyzeButton) {
      analyzeButton.disabled =
        !imageInput?.files?.length;
    }
  }
}


// =========================================================
// 분석 결과를 게시글에 넣기
// =========================================================

function insertImageAnalysis() {
  const resultBox =
    document.getElementById("imageAnalysisResult");

  const contentBox =
    document.getElementById("content");

  if (!resultBox || !contentBox) return;

  const analysis = resultBox.textContent.trim();

  if (
    !analysis ||
    analysis.includes("분석하는 중") ||
    analysis.includes("분석에 실패")
  ) {
    alert("먼저 사진 분석을 완료해 주세요.");
    return;
  }

  if (contentBox.value.trim()) {
    contentBox.value += "\n\n" + analysis;
  } else {
    contentBox.value = analysis;
  }

  contentBox.focus();
}


// =========================================================
// 초기화
// =========================================================

function initializeBoardFeatures() {
  setupImageFeatures();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeBoardFeatures
  );
} else {
  initializeBoardFeatures();
}
// =========================================================
// 게시글 작성
// =========================================================

async function addPost() {
  const box = document.getElementById("content");
  const content = box.value.trim();

  if (!content) {
    alert("내용을 입력해 주세요.");
    return;
  }

  const addButton = document.querySelector(
    'button[onclick="addPost()"]'
  );

  if (addButton) addButton.disabled = true;

  try {
    const imageInput = document.getElementById("imageFile");
    const file = imageInput.files[0];
    let imageUrl = null;

    // 사진 업로드
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("이미지 파일만 첨부할 수 있습니다.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert("사진은 10MB 이하만 업로드할 수 있습니다.");
        return;
      }

      const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

      const fileName =
        currentUser.id +
        "/" +
        Date.now() +
        "-" +
        (
          crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now()
        ) +
        "." +
        extension;

      const { error: uploadError } =
        await db.storage
          .from("post-images")
          .upload(fileName, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
          });

      if (uploadError) {
        console.error("사진 업로드 실패:", uploadError);

        alert(
          "사진 업로드에 실패했습니다.\n" +
          uploadError.message
        );

        return;
      }

      const { data: publicUrlData } =
        db.storage
          .from("post-images")
          .getPublicUrl(fileName);

      imageUrl = publicUrlData.publicUrl;
    }

    // 게시글 저장
    const { error } = await db
      .from("posts")
      .insert({
        content: content,
        nickname: currentUser.email.split("@")[0],
        user_id: currentUser.id,
        image_url: imageUrl,
        latitude: selectedLatitude,
        longitude: selectedLongitude
      });

    if (error) {
      if (imageUrl) {
        await db.storage
          .from("post-images")
          .remove([
            imageUrl.split("/post-images/")[1]
          ]);
      }

      console.error("쓰기 실패:", error);

      alert("쓰기 실패: " + error.message);
      return;
    }

    // 입력 초기화
    box.value = "";
    imageInput.value = "";

    const preview =
      document.getElementById("imagePreview");

    if (preview) {
      preview.src = "";
      preview.style.display = "none";
    }

    selectedLatitude = null;
    selectedLongitude = null;

    if (selectedMarker && postMap) {
      postMap.removeLayer(selectedMarker);
      selectedMarker = null;
    }

    const locationBox =
      document.getElementById("selectedLocation");

    if (locationBox) {
      locationBox.textContent =
        "아직 위치를 선택하지 않았습니다.";
    }

    const aiBox = document.getElementById("aiBox");
    if (aiBox) aiBox.textContent = "";

    await loadPosts();

  } finally {
    if (addButton) addButton.disabled = false;
  }
}


// =========================================================
// 게시글 삭제
// =========================================================

async function deletePost(id) {
  const { error } = await db
    .from("posts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("삭제 실패:", error);
    alert("삭제 실패: " + error.message);
    return;
  }

  await loadPosts();
}


// =========================================================
// AI 문장 다듬기
// =========================================================

async function polish() {
  const content = document
    .getElementById("content")
    .value
    .trim();

  if (!content) return;

  const btn = document.getElementById("aiBtn");
  const box = document.getElementById("aiBox");

  btn.disabled = true;
  box.textContent = "생각하는 중...";

  try {
    box.textContent = await askAI(
      "다음 문장을 게시판에 올리기 좋게 " +
      "자연스럽고 재미있게 다듬어줘. " +
      "한 문장으로만 답해줘. " +
      "원래 의미는 바꾸지 마.\n\n" +
      content
    );

  } catch (e) {
    console.error("AI 문장 다듬기 실패:", e);

    box.textContent =
      "AI 기능은 vercel dev 또는 " +
      "배포된 주소에서만 동작합니다.";

  } finally {
    btn.disabled = false;
  }
}


// =========================================================
// AI 자연어 게시판 검색
// =========================================================

async function aiSearchPosts() {
  const input =
    document.getElementById("aiSearchInput");

  const resultBox =
    document.getElementById("aiSearchResult");

  const btn =
    document.getElementById("aiSearchBtn");

  const query = input.value.trim();

  if (!query) {
    resultBox.textContent =
      "검색 내용을 입력해 주세요.";
    return;
  }

  btn.disabled = true;
  resultBox.textContent =
    "게시글을 분석하는 중...";

  try {
    const { data, error } = await db
      .from("posts")
      .select("id, nickname, content, created_at")
      .order("created_at", {
        ascending: false
      })
      .limit(50);

    if (error) throw error;

    if (!data || data.length === 0) {
      resultBox.textContent =
        "검색할 게시글이 없습니다.";
      return;
    }

    const postsText = data
      .map(function (p) {
        return (
          "[게시글 ID: " + p.id + "]\n" +
          "작성자: " + p.nickname + "\n" +
          "내용: " + p.content
        );
      })
      .join("\n\n");

    const prompt =
      "너는 게시판 검색 도우미야.\n" +
      "사용자가 자연어로 요청한 내용을 읽고 " +
      "아래 게시글 중 관련 있는 게시글만 골라줘.\n\n" +

      "규칙:\n" +
      "1. 게시글에 실제로 적힌 내용만 근거로 판단해.\n" +
      "2. 없는 정보를 만들어내지 마.\n" +
      "3. 관련이 약한 글은 제외해.\n" +
      "4. 최대 5개만 골라.\n" +
      "5. 없으면 '관련 게시글이 없습니다.'라고 답해.\n\n" +

      "사용자 검색 요청:\n" +
      query +
      "\n\n" +

      "게시글 목록:\n" +
      postsText +
      "\n\n" +

      "형식:\n" +
      "[게시글 ID: 숫자]\n" +
      "이유: 관련된 이유 한 문장";

    const answer = await askAI(prompt);
    resultBox.textContent = answer;

  } catch (e) {
    console.error("AI 검색 실패:", e);

    resultBox.textContent =
      "AI 검색에 실패했습니다. " +
      "잠시 후 다시 시도해 주세요.";

  } finally {
    btn.disabled = false;
  }
}


// =========================================================
// AI 검색 Enter
// =========================================================

document.addEventListener(
  "DOMContentLoaded",
  function () {
    const input =
      document.getElementById("aiSearchInput");

    if (!input) return;

    input.addEventListener(
      "keydown",
      function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          aiSearchPosts();
        }
      }
    );
  }
);

/* =========================================================
   사진 AI 분석
   ========================================================= */

// DOMContentLoaded가 이미 실행됐어도 초기화되도록 처리
function setupImageAnalysis() {
  const imageInput = document.getElementById("imageFile");
  const analyzeBtn = document.getElementById("analyzeImageBtn");
  const resultBox = document.getElementById("imageAnalysisResult");
  const contentBox = document.getElementById("content");
  const useResultBtn = document.getElementById("useImageAnalysisBtn");

  if (!imageInput || !analyzeBtn || !resultBox) return;

  let analysisText = "";

  // 사진 선택 시 분석 버튼 활성화
  imageInput.addEventListener("change", function () {
    const file = imageInput.files[0];

    analysisText = "";
    resultBox.textContent = "";

    if (useResultBtn) {
      useResultBtn.disabled = true;
    }

    analyzeBtn.disabled = !file;
  });

  // 사진 분석 실행
  analyzeBtn.addEventListener("click", async function () {
    const file = imageInput.files[0];

    if (!file) {
      resultBox.textContent = "먼저 사진을 선택해 주세요.";
      return;
    }

    if (!file.type.startsWith("image/")) {
      resultBox.textContent = "이미지 파일만 분석할 수 있습니다.";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      resultBox.textContent = "사진은 10MB 이하만 분석할 수 있습니다.";
      return;
    }

    analyzeBtn.disabled = true;
    resultBox.textContent = "사진을 분석하고 있어요...";

    try {
      const imageData = await fileToDataURL(file);

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "analyze-image",
          image: imageData,
          prompt:
            "이 사진을 보고 코로그 제보 게시판에 올릴 설명을 작성해줘. " +
            "사진에서 실제로 확인할 수 있는 특징만 말하고, " +
            "확실하지 않은 장소나 정보를 지어내지 마. " +
            "자연스럽고 짧은 한국어 문장으로 작성해줘."
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "사진 분석 요청에 실패했습니다."
        );
      }

      // API 응답의 텍스트 가져오기
      analysisText =
        data.text ||
        data.answer ||
        data.result ||
        data.content ||
        "";

      if (typeof analysisText !== "string" || !analysisText.trim()) {
        throw new Error("AI 분석 결과가 비어 있습니다.");
      }

      resultBox.textContent = analysisText;

      if (useResultBtn) {
        useResultBtn.disabled = false;
      }

    } catch (error) {
      console.error("사진 AI 분석 실패:", error);

      resultBox.textContent =
        "사진 분석에 실패했습니다.\n" +
        (error.message || "잠시 후 다시 시도해 주세요.");

    } finally {
      analyzeBtn.disabled = false;
    }
  });

  // 분석 결과를 게시글 작성 칸에 넣기
  if (useResultBtn) {
    useResultBtn.addEventListener("click", function () {
      if (!analysisText || !contentBox) return;

      contentBox.value = analysisText;
      contentBox.focus();
    });
  }
}


// 파일을 Base64 Data URL로 변환
function fileToDataURL(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();

    reader.onload = function () {
      resolve(reader.result);
    };

    reader.onerror = function () {
      reject(new Error("사진을 읽지 못했습니다."));
    };

    reader.readAsDataURL(file);
  });
}


// DOM 준비 상태에 맞춰 실행
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    setupImageAnalysis
  );
} else {
  setupImageAnalysis();
}