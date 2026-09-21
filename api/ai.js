
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST 요청만 허용됩니다."
    });
  }

  const apiKey =
    process.env.GROQ_API_TEST ||
    process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Groq API 키가 설정되지 않았습니다."
    });
  }

  try {
    const { prompt, image } = req.body || {};

    if (!prompt && !image) {
      return res.status(400).json({
        error: "분석할 내용이 없습니다."
      });
    }

    // 사진 분석 요청
    const isImageRequest = Boolean(image);

    const model = isImageRequest
      ? "meta-llama/llama-4-scout-17b-16e-instruct"
      : "openai/gpt-oss-20b";

    const userContent = isImageRequest
      ? [
          {
            type: "text",
            text: prompt ||
              "사진을 분석하고 설명해 주세요."
          },
          {
            type: "image_url",
            image_url: {
              url: image
            }
          }
        ]
      : prompt;

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: isImageRequest
                ? `너는 코로그 숲 게시판의 사진 분석 도우미야.
사진에 실제로 보이는 내용을 중심으로 설명해.
사진에서 확인할 수 없는 정보는 단정하지 마.
코로그가 숨어 있을 법한 장소의 특징을 찾아보되,
실제 코로그가 있다고 주장하지 마.
답변은 한국어로 작성하고 다음 형식을 사용해.

📷 사진 설명
사진에 보이는 사물과 환경

🌿 눈여겨볼 요소
흥미로운 모양이나 주변 특징

🍃 게시글 문장 제안
사진과 함께 올릴 수 있는 짧은 문장`
                : "사용자의 요청에 한국어로 답변해 주세요."
            },
            {
              role: "user",
              content: userContent
            }
          ],
          temperature: 0.7,
          max_tokens: 700
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Groq 오류:", result);

      return res.status(response.status).json({
        error:
          result.error?.message ||
          "AI 요청에 실패했습니다."
      });
    }

    const text =
      result.choices?.[0]?.message?.content;

    return res.status(200).json({
      text: text || "분석 결과가 없습니다."
    });

  } catch (error) {
    console.error("AI 서버 오류:", error);

    return res.status(500).json({
      error: "AI 분석 중 서버 오류가 발생했습니다."
    });
  }
}