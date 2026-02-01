const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

// 환경 변수
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const WP_URL = process.env.WP_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;
const SERP_API_KEY = process.env.SERP_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY; // Unsplash API

const keywordsPath = path.join(__dirname, "keywords.json");

// ============================================
// 1. 구글 상위 노출 페이지 검색
// ============================================
async function searchGoogle(keyword) {
  console.log(`🔍 "${keyword}" 구글 검색 중...`);

  const params = new URLSearchParams({
    q: keyword,
    location: "South Korea",
    hl: "ko",
    gl: "kr",
    google_domain: "google.co.kr",
    num: "10",
    api_key: SERP_API_KEY,
  });

  const response = await fetch(
    `https://serpapi.com/search.json?${params.toString()}`
  );
  const data = await response.json();

  if (!data.organic_results) {
    console.log("⚠️ 검색 결과 없음, 기본 방식으로 진행");
    return null;
  }

  return data.organic_results.slice(0, 5).map((result) => ({
    title: result.title,
    link: result.link,
    snippet: result.snippet,
    position: result.position,
  }));
}

// ============================================
// 2. 상위 페이지 콘텐츠 스크래핑
// ============================================
async function fetchPageContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);

    const h2Matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [];
    const h2Tags = h2Matches
      .map((h) => h.replace(/<[^>]+>/g, "").trim())
      .slice(0, 10);

    return { textContent, h2Tags };
  } catch (e) {
    return null;
  }
}

// ============================================
// 3. 경쟁 분석
// ============================================
async function analyzeCompetitors(keyword, searchResults) {
  if (!searchResults) {
    return {
      keyword,
      topTitles: [],
      commonH2: [],
      contentSummary: "검색 결과 분석 불가",
    };
  }

  console.log(`📊 상위 ${searchResults.length}개 페이지 분석 중...`);

  const topTitles = searchResults.map((r) => r.title);
  const snippets = searchResults.map((r) => r.snippet).join("\n");
  const allH2 = [];

  for (let i = 0; i < Math.min(3, searchResults.length); i++) {
    const content = await fetchPageContent(searchResults[i].link);
    if (content && content.h2Tags) {
      allH2.push(...content.h2Tags);
    }
  }

  const h2Frequency = {};
  allH2.forEach((h2) => {
    const key = h2.toLowerCase();
    h2Frequency[key] = (h2Frequency[key] || 0) + 1;
  });

  const commonH2 = Object.entries(h2Frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([h2]) => h2);

  return {
    keyword,
    topTitles,
    commonH2,
    snippets,
  };
}

// ============================================
// 4. Unsplash에서 관련 이미지 검색
// ============================================
async function searchImage(keyword) {
  console.log(`🖼️ 관련 이미지 검색 중...`);

  // 키워드에서 영어 검색어 추출 (더 나은 결과를 위해)
  const searchTerms = {
    "블로그": "blogging writing",
    "AI": "artificial intelligence technology",
    "자동화": "automation robot",
    "워드프레스": "wordpress website",
    "SEO": "search engine optimization",
    "글쓰기": "writing content",
    "수익": "money income",
    "애드센스": "advertising monetization",
    "프로그램": "software computer",
    "포스팅": "blog post content",
  };

  // 키워드에서 영어 검색어 찾기
  let searchQuery = "blog technology";
  for (const [korean, english] of Object.entries(searchTerms)) {
    if (keyword.includes(korean)) {
      searchQuery = english;
      break;
    }
  }

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=1&orientation=landscape`,
      {
        headers: {
          Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        },
      }
    );

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const photo = data.results[0];
      return {
        url: photo.urls.regular,
        alt: photo.alt_description || keyword,
        credit: photo.user.name,
        creditLink: photo.user.links.html,
      };
    }
  } catch (e) {
    console.log("⚠️ 이미지 검색 실패:", e.message);
  }

  return null;
}

// ============================================
// 5. 워드프레스에 이미지 업로드
// ============================================
async function uploadImageToWordPress(imageUrl, filename) {
  console.log(`📤 이미지 업로드 중...`);

  const auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");

  // 이미지 다운로드
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();

  // 워드프레스에 업로드
  const response = await fetch(`${WP_URL}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${filename}.jpg"`,
    },
    body: Buffer.from(imageBuffer),
  });

  if (!response.ok) {
    console.log("⚠️ 이미지 업로드 실패");
    return null;
  }

  const media = await response.json();
  console.log(`✅ 이미지 업로드 완료: ${media.source_url}`);

  return {
    id: media.id,
    url: media.source_url,
  };
}

// ============================================
// 6. Claude로 SEO 최적화 글 생성
// ============================================
async function generateContent(keyword, analysis, imageData) {
  const client = new Anthropic({ apiKey: CLAUDE_API_KEY });

  // 이미지 HTML 생성
  let imageHtml = "";
  if (imageData) {
    imageHtml = `
<figure class="wp-block-image size-large">
  <img src="${imageData.url}" alt="${keyword}" />
  <figcaption>Photo by <a href="${imageData.creditLink}" target="_blank">${imageData.credit}</a> on Unsplash</figcaption>
</figure>`;
  }

  const systemPrompt = `당신은 10년 경력의 전문 블로그 작가입니다.
다음 원칙을 반드시 지켜주세요:

1. **자연스러운 글쓰기**: AI가 쓴 것처럼 보이지 않도록, 개인적인 경험과 의견을 포함하세요.
2. **구어체 사용**: "~입니다", "~합니다" 대신 "~해요", "~거든요", "~더라고요" 등 자연스러운 표현 사용
3. **개인적 관점**: "제가 직접 사용해보니", "솔직히 말씀드리면", "많은 분들이 궁금해하시는데" 등
4. **불완전한 문장**: 가끔 "근데", "아무튼", "그래서요" 등으로 시작하는 자연스러운 문장
5. **SEO 최적화**: 키워드를 자연스럽게 2-3% 밀도로 포함
6. **구조화**: H2, H3 태그로 명확하게 섹션 구분
7. **1500자 이상**: 충분한 깊이와 정보 제공
8. **이미지 위치**: 첫 번째 H2 섹션 바로 앞에 [IMAGE_PLACEHOLDER] 태그 삽입`;

  const userPrompt = `다음 키워드로 블로그 글을 작성해주세요.

📌 **키워드**: ${keyword}

📊 **경쟁 분석 결과**:
- 상위 노출 제목들: ${analysis.topTitles.join(" | ")}
- 자주 사용되는 소제목: ${analysis.commonH2.join(", ")}
- 검색 결과 요약: ${analysis.snippets || "없음"}

📝 **작성 요구사항**:

1. **제목**: 클릭을 유도하는 매력적인 제목 (키워드 포함)

2. **본문 구조**:
   - 도입부 (2-3문장): 독자의 고민에 공감
   - [IMAGE_PLACEHOLDER] ← 여기에 이미지가 들어갑니다
   - 본론: 3-5개의 H2 섹션
   - 각 섹션에 구체적인 예시, 숫자, 팁 포함
   - 결론: 핵심 요약 + 행동 유도

3. **글쓰기 스타일**:
   - 자연스러운 구어체 사용
   - 가끔 질문형 문장
   - 이모지는 H2 제목에만 1개씩
   - 중요한 부분은 **굵게**

4. **반드시 1500자 이상**

다음 JSON 형식으로 응답:
{
  "title": "제목",
  "metaDescription": "메타 설명 (150자 이내)",
  "content": "HTML 본문 ([IMAGE_PLACEHOLDER] 포함)"
}`;

  console.log("🤖 Claude로 글 생성 중...");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
    messages: [{ role: "user", content: systemPrompt + "\n\n" + userPrompt }],
  });

  const text = response.content[0].text;

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const article = JSON.parse(jsonMatch[0]);

      // 이미지 플레이스홀더를 실제 이미지로 교체
      if (imageHtml) {
        article.content = article.content.replace("[IMAGE_PLACEHOLDER]", imageHtml);
      } else {
        article.content = article.content.replace("[IMAGE_PLACEHOLDER]", "");
      }

      const contentLength = article.content.replace(/<[^>]+>/g, "").length;
      console.log(`📏 글자수: ${contentLength}자`);

      return article;
    }
  } catch (e) {
    console.error("JSON 파싱 실패:", e);
  }

  return null;
}

// ============================================
// 7. 워드프레스 발행
// ============================================
async function postToWordPress(title, content, metaDescription, featuredImageId) {
  const auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");

  const postData = {
    title: title,
    content: content,
    status: "publish",
    excerpt: metaDescription,
    meta: {
      _yoast_wpseo_metadesc: metaDescription,
    },
  };

  // 대표 이미지 설정
  if (featuredImageId) {
    postData.featured_media = featuredImageId;
  }

  const response = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(postData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WordPress API 오류: ${response.status} - ${error}`);
  }

  return await response.json();
}

// ============================================
// 메인 실행
// ============================================
async function main() {
  console.log("═".repeat(50));
  console.log("🚀 SEO 최적화 자동 포스팅 시작");
  console.log("═".repeat(50));

  // 키워드 로드
  const keywordsData = JSON.parse(fs.readFileSync(keywordsPath, "utf-8"));
  const { currentIndex, keywords } = keywordsData;

  if (currentIndex >= keywords.length) {
    console.log("✅ 모든 키워드 발행 완료!");
    return;
  }

  const keyword = keywords[currentIndex];
  console.log(`\n📌 키워드 ${currentIndex + 1}/${keywords.length}: "${keyword}"`);

  // Step 1: 구글 검색
  const searchResults = await searchGoogle(keyword);

  // Step 2: 경쟁 분석
  const analysis = await analyzeCompetitors(keyword, searchResults);
  console.log(`✅ 분석 완료 - 상위 제목 ${analysis.topTitles.length}개`);

  // Step 3: 이미지 검색 및 업로드
  let imageData = null;
  let featuredImageId = null;

  const image = await searchImage(keyword);
  if (image) {
    const uploaded = await uploadImageToWordPress(
      image.url,
      `${keyword.replace(/\s+/g, "-")}-${Date.now()}`
    );
    if (uploaded) {
      imageData = {
        url: uploaded.url,
        credit: image.credit,
        creditLink: image.creditLink,
      };
      featuredImageId = uploaded.id;
    }
  }

  // Step 4: 글 생성
  const article = await generateContent(keyword, analysis, imageData);

  if (!article) {
    console.error("❌ 글 생성 실패");
    process.exit(1);
  }

  console.log(`✅ 글 생성 완료: "${article.title}"`);

  // Step 5: 워드프레스 발행
  console.log("📤 워드프레스 발행 중...");
  const post = await postToWordPress(
    article.title,
    article.content,
    article.metaDescription,
    featuredImageId
  );

  console.log(`\n${"═".repeat(50)}`);
  console.log(`✅ 발행 완료!`);
  console.log(`📎 URL: ${post.link}`);
  console.log(`🖼️ 이미지: ${imageData ? "포함" : "없음"}`);
  console.log(`📊 진행률: ${currentIndex + 1}/${keywords.length}`);
  console.log(`${"═".repeat(50)}`);

  // 인덱스 업데이트
  keywordsData.currentIndex = currentIndex + 1;
  fs.writeFileSync(keywordsPath, JSON.stringify(keywordsData, null, 2));
}

main().catch((err) => {
  console.error("❌ 오류 발생:", err);
  process.exit(1);
});
