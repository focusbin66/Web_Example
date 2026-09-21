// 게시판 페이지 전용 코드


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

  const mapElement =
    document.getElementById("postMap");

  if (!mapElement) return;


  // 이미 만들어졌다면 다시 만들지 않음
  if (postMap) return;


  // 서울을 기본 위치로 시작
  postMap = L.map("postMap").setView(
    [37.5665, 126.9780],
    13
  );


  // OpenStreetMap
  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; OpenStreetMap contributors'
    }
  ).addTo(postMap);


  // 지도 클릭
  postMap.on(
    "click",
    function (event) {

      setSelectedLocation(
        event.latlng.lat,
        event.latlng.lng
      );

    }
  );
}


// =========================================================
// 위치 선택
// =========================================================

function setSelectedLocation(
  latitude,
  longitude
) {

  selectedLatitude = latitude;
  selectedLongitude = longitude;


  // 기존 마커 삭제
  if (selectedMarker) {
    postMap.removeLayer(
      selectedMarker
    );
  }


  // 새 마커
  selectedMarker = L.marker([
    latitude,
    longitude
  ]).addTo(postMap);


  selectedMarker
    .bindPopup("제보 위치")
    .openPopup();


  // 표시
  const locationBox =
    document.getElementById(
      "selectedLocation"
    );

  locationBox.textContent =
    "선택한 위치: " +
    latitude.toFixed(6) +
    ", " +
    longitude.toFixed(6);
}


// =========================================================
// 현재 위치 사용
// =========================================================

function useMyLocation() {

  if (!navigator.geolocation) {
    alert(
      "이 브라우저에서는 위치 기능을 사용할 수 없습니다."
    );

    return;
  }


  navigator.geolocation.getCurrentPosition(
    function (position) {

      const latitude =
        position.coords.latitude;

      const longitude =
        position.coords.longitude;


      postMap.setView(
        [latitude, longitude],
        16
      );


      setSelectedLocation(
        latitude,
        longitude
      );

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
// 사진 미리보기
// =========================================================

document.addEventListener(
  "DOMContentLoaded",
  function () {

    const imageInput =
      document.getElementById(
        "imageFile"
      );

    const preview =
      document.getElementById(
        "imagePreview"
      );


    if (!imageInput || !preview) {
      return;
    }


    imageInput.addEventListener(
      "change",
      function () {

        const file =
          imageInput.files[0];


        if (!file) {

          preview.src = "";
          preview.style.display =
            "none";

          return;
        }


        // 이미지 형식과 10MB 제한
        if (!file.type.startsWith("image/")) {
          alert("이미지 파일만 첨부할 수 있습니다.");
          imageInput.value = "";
          preview.src = "";
          preview.style.display = "none";
          return;
        }

        if (file.size > 10 * 1024 * 1024) {

          alert(
            "사진은 10MB 이하만 업로드할 수 있습니다."
          );

          imageInput.value = "";

          preview.src = "";
          preview.style.display =
            "none";

          return;
        }


        const reader =
          new FileReader();


        reader.onload =
          function (event) {

            preview.src =
              event.target.result;

            preview.style.display =
              "block";
          };


        reader.readAsDataURL(file);

      }
    );

  }
);


// =========================================================
// 게시글 불러오기
// =========================================================

async function loadPosts() {

  const { data, error } =
    await db
      .from("posts")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(50);


  if (error) {

    console.error(
      "읽기 실패:",
      error
    );

    return;
  }


  const list =
    document.getElementById(
      "list"
    );


  list.innerHTML =
    (data || [])
      .map(function (p) {


        const isMine =
          currentUser &&
          p.user_id ===
            currentUser.id;


        const del =
          isMine
            ? '<button onclick="deletePost(' +
              Number(p.id) +
              ')">삭제</button>'
            : "";


        // 사진
        const imageHTML =
          p.image_url
            ? '<img class="post-image" src="' +
              escapeHTML(
                p.image_url
              ) +
              '" alt="제보 사진">'
            : "";


        // 지도
        let mapHTML = "";


        if (
          p.latitude != null &&
          p.longitude != null
        ) {

          mapHTML =
            '<div class="post-map" id="post-map-' +
            Number(p.id) +
            '"></div>' +

            '<div class="post-location">' +
            "위치: " +
            Number(p.latitude).toFixed(6) +
            ", " +
            Number(p.longitude).toFixed(6) +
            "</div>";
        }


        return (
          "<li>" +

          "<strong>" +
          escapeHTML(
            p.nickname
          ) +
          "</strong><br>" +

          escapeHTML(
            p.content
          ) +

          imageHTML +

          mapHTML +

          '<div class="post-actions">' +
          del +
          "</div>" +

          "</li>"
        );

      })
      .join("");


  // 게시글별 미니 지도 생성
  (data || []).forEach(
    function (p) {

      if (
        p.latitude == null ||
        p.longitude == null
      ) {
        return;
      }


      const mapElement =
        document.getElementById(
          "post-map-" +
          Number(p.id)
        );


      if (!mapElement) {
        return;
      }


      const smallMap =
        L.map(
          mapElement,
          {
            zoomControl: true,
            attributionControl: true
          }
        ).setView(
          [
            Number(p.latitude),
            Number(p.longitude)
          ],
          15
        );


      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; OpenStreetMap contributors'
        }
      ).addTo(smallMap);


      L.marker([
        Number(p.latitude),
        Number(p.longitude)
      ])
        .addTo(smallMap)
        .bindPopup(
          "제보 위치"
        );

    }
  );
}


// =========================================================
// 게시글 작성
// =========================================================

async function addPost() {

  const box =
    document.getElementById(
      "content"
    );


  const content =
    box.value.trim();


  if (!content) {

    alert(
      "내용을 입력해 주세요."
    );

    return;
  }


  // 버튼
  const addButton =
    document.querySelector(
      'button[onclick="addPost()"]'
    );


  if (addButton) {
    addButton.disabled = true;
  }


  try {

    // ---------------------------------------------
    // 사진 가져오기
    // ---------------------------------------------

    const imageInput =
      document.getElementById(
        "imageFile"
      );


    const file = imageInput.files[0];


    let imageUrl = null;


    // ---------------------------------------------
    // 사진 업로드
    // ---------------------------------------------

    if (file) {

      if (!file.type.startsWith("image/")) {
        alert("이미지 파일만 첨부할 수 있습니다.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert("사진은 10MB 이하만 업로드할 수 있습니다.");
        return;
      }

      // 파일명 안전하게 만들기

      const extension =
        file.name
          .split(".")
          .pop()
          .toLowerCase();


      const fileName =
        currentUser.id +
        "/" +
        Date.now() +
        "-" +
        (crypto.randomUUID ? crypto.randomUUID() : Date.now()) +
        "." +
        extension;


      const {
        error: uploadError
      } = await db.storage
        .from("post-images")
        .upload(
          fileName,
          file,
          {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
          }
        );


      if (uploadError) {

        console.error(
          "사진 업로드 실패:",
          uploadError
        );

        alert(
          "사진 업로드에 실패했습니다.\n" +
          uploadError.message
        );

        return;
      }


      // 공개 URL
      const {
        data: publicUrlData
      } = db.storage
        .from("post-images")
        .getPublicUrl(
          fileName
        );


      imageUrl =
        publicUrlData.publicUrl;
    }


    // ---------------------------------------------
    // 게시글 저장
    // ---------------------------------------------

    const { error } =
      await db
        .from("posts")
        .insert({

          content:
            content,

          nickname:
            currentUser.email
              .split("@")[0],

          user_id:
            currentUser.id,

          image_url:
            imageUrl,

          latitude:
            selectedLatitude,

          longitude:
            selectedLongitude

        });


    if (error) {

      if (imageUrl) {
        await db.storage.from("post-images").remove([
          imageUrl.split("/post-images/")[1]
        ]);
      }

      console.error(
        "쓰기 실패:",
        error
      );

      alert(
        "쓰기 실패: " +
        error.message
      );

      return;
    }


    // ---------------------------------------------
    // 입력 초기화
    // ---------------------------------------------

    box.value = "";


    imageInput.value = "";


    const preview =
      document.getElementById(
        "imagePreview"
      );

    preview.src = "";
    preview.style.display =
      "none";


    // 위치 초기화
    selectedLatitude = null;
    selectedLongitude = null;


    if (selectedMarker) {

      postMap.removeLayer(
        selectedMarker
      );

      selectedMarker = null;
    }


    document.getElementById(
      "selectedLocation"
    ).textContent =
      "아직 위치를 선택하지 않았습니다.";


    document.getElementById(
      "aiBox"
    ).textContent = "";


    await loadPosts();

  } finally {

    if (addButton) {
      addButton.disabled =
        false;
    }
  }
}


// =========================================================
// 게시글 삭제
// =========================================================

async function deletePost(id) {

  const { error } =
    await db
      .from("posts")
      .delete()
      .eq(
        "id",
        id
      );


  if (error) {

    console.error(
      "삭제 실패:",
      error
    );

    alert(
      "삭제 실패: " +
      error.message
    );

    return;
  }


  await loadPosts();
}


// =========================================================
// AI 문장 다듬기
// =========================================================

async function polish() {

  const content =
    document
      .getElementById(
        "content"
      )
      .value
      .trim();


  if (!content) {
    return;
  }


  const btn =
    document.getElementById(
      "aiBtn"
    );


  const box =
    document.getElementById(
      "aiBox"
    );


  btn.disabled = true;


  box.textContent =
    "생각하는 중...";


  try {

    box.textContent =
      await askAI(

        "다음 문장을 게시판에 올리기 좋게 " +
        "자연스럽고 재미있게 다듬어줘. " +
        "한 문장으로만 답해줘. " +
        "원래 의미는 바꾸지 마.\n\n" +

        content

      );

  } catch (e) {

    console.error(
      "AI 문장 다듬기 실패:",
      e
    );


    box.textContent =
      "AI 기능은 vercel dev 또는 " +
      "배포된 주소에서만 동작합니다.";

  } finally {

    btn.disabled =
      false;
  }
}


// =========================================================
// AI 자연어 게시판 검색
// =========================================================

async function aiSearchPosts() {

  const input =
    document.getElementById(
      "aiSearchInput"
    );


  const resultBox =
    document.getElementById(
      "aiSearchResult"
    );


  const btn =
    document.getElementById(
      "aiSearchBtn"
    );


  const query =
    input.value.trim();


  if (!query) {

    resultBox.textContent =
      "검색 내용을 입력해 주세요.";

    return;
  }


  btn.disabled = true;


  resultBox.textContent =
    "게시글을 분석하는 중...";


  try {

    const {
      data,
      error
    } =
      await db
        .from("posts")
        .select(
          "id, nickname, content, created_at"
        )
        .order(
          "created_at",
          {
            ascending: false
          }
        )
        .limit(50);


    if (error) {
      throw error;
    }


    if (
      !data ||
      data.length === 0
    ) {

      resultBox.textContent =
        "검색할 게시글이 없습니다.";

      return;
    }


    const postsText =
      data
        .map(
          function (p) {

            return (
              "[게시글 ID: " +
              p.id +
              "]\n" +

              "작성자: " +
              p.nickname +
              "\n" +

              "내용: " +
              p.content
            );
          }
        )
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


    const answer =
      await askAI(
        prompt
      );


    resultBox.textContent =
      answer;

  } catch (e) {

    console.error(
      "AI 검색 실패:",
      e
    );


    resultBox.textContent =
      "AI 검색에 실패했습니다. " +
      "잠시 후 다시 시도해 주세요.";

  } finally {

    btn.disabled =
      false;
  }
}


// =========================================================
// AI 검색 Enter
// =========================================================

document.addEventListener(
  "DOMContentLoaded",
  function () {

    const input =
      document.getElementById(
        "aiSearchInput"
      );


    if (!input) return;


    input.addEventListener(
      "keydown",
      function (event) {

        if (
          event.key === "Enter"
        ) {

          event.preventDefault();

          aiSearchPosts();
        }

      }
    );

  }
);

