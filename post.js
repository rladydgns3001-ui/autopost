const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

// 환경 변수
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const WP_URL = process.env.WP_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;
const SERP_API_KEY = process.env.SERP_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // OpenAI DALL-E API

const keywordsPath = path.join(__dirname, "keywords.json");

// ============================================
// 1. 공식문서 도메인 목록
// ============================================
const OFFICIAL_DOMAINS = [
  // 기술 공식문서
  "docs.google.com", "developer.android.com", "developer.apple.com",
  "docs.microsoft.com", "learn.microsoft.com", "aws.amazon.com/docs",
  "cloud.google.com/docs", "docs.aws.amazon.com", "firebase.google.com/docs",
  "reactjs.org", "vuejs.org", "angular.io", "nodejs.org", "python.org",
  "developer.mozilla.org", "w3.org", "github.com/docs",
  // 정부/공공기관
  "gov.kr", "korea.kr", "mois.go.kr", "nts.go.kr", "hometax.go.kr",
  "nhis.or.kr", "nps.or.kr", "bokjiro.go.kr", "law.go.kr",
  // 금융
  "fss.or.kr", "kofia.or.kr", "kbstar.com", "shinhan.com", "wooribank.com",
  // 기타 공신력 있는 사이트
  "wikipedia.org", "namu.wiki", "terms.naver.com", "ko.dict.naver.com"
];

// ============================================
// 2. 구글 상위 노출 페이지 검색 (최근 3개월 + 공식문서 우선)
// ============================================
async function searchGoogle(keyword, options = {}) {
  const { recentOnly = true, officialFirst = true } = options;
  console.log(`🔍 "${keyword}" 구글 검색 중... (최근 3개월 필터: ${recentOnly})`);

  // 기본 검색 파라미터
  const params = new URLSearchParams({
    q: keyword,
    location: "South Korea",
    hl: "ko",
    gl: "kr",
    google_domain: "google.co.kr",
    num: "15", // 더 많은 결과를 가져와서 필터링
    api_key: SERP_API_KEY,
  });

  // 최근 3개월 필터 적용
  if (recentOnly) {
    params.append("tbs", "qdr:m3"); // m3 = 최근 3개월
  }

  const response = await fetch(
    `https://serpapi.com/search.json?${params.toString()}`
  );
  const data = await response.json();

  if (!data.organic_results) {
    if (!recentOnly) {
      // 이미 전체 기간 검색인데도 결과가 없으면 빈 배열 반환
      console.log("⚠️ 검색 결과 없음 - 빈 결과로 진행");
      return [];
    }
    console.log("⚠️ 최근 3개월 결과 없음, 전체 기간으로 재검색...");
    // 날짜 필터 없이 재검색
    return searchGoogle(keyword, { recentOnly: false, officialFirst });
  }

  let results = data.organic_results.map((result) => ({
    title: result.title,
    link: result.link,
    snippet: result.snippet,
    position: result.position,
    date: result.date || null, // SerpAPI가 제공하는 날짜 정보
    isOfficial: OFFICIAL_DOMAINS.some(domain => result.link.includes(domain)),
  }));

  // 공식문서 우선 정렬
  if (officialFirst) {
    results = results.sort((a, b) => {
      if (a.isOfficial && !b.isOfficial) return -1;
      if (!a.isOfficial && b.isOfficial) return 1;
      return a.position - b.position;
    });
  }

  console.log(`📊 검색 결과: ${results.length}개 (공식문서: ${results.filter(r => r.isOfficial).length}개)`);

  return results.slice(0, 7);
}

// ============================================
// 3. 공식문서 전용 검색
// ============================================
async function searchOfficialDocs(keyword) {
  console.log(`📚 "${keyword}" 공식문서 검색 중...`);

  // 공식문서 사이트 한정 검색
  const siteQuery = `${keyword} (site:gov.kr OR site:or.kr OR site:go.kr OR site:docs.google.com OR site:developer.android.com)`;

  const params = new URLSearchParams({
    q: siteQuery,
    location: "South Korea",
    hl: "ko",
    gl: "kr",
    google_domain: "google.co.kr",
    num: "5",
    api_key: SERP_API_KEY,
  });

  try {
    const response = await fetch(
      `https://serpapi.com/search.json?${params.toString()}`
    );
    const data = await response.json();

    if (!data.organic_results || data.organic_results.length === 0) {
      console.log("⚠️ 공식문서 검색 결과 없음");
      return [];
    }

    return data.organic_results.map((result) => ({
      title: result.title,
      link: result.link,
      snippet: result.snippet,
      isOfficial: true,
      source: "official_search",
    }));
  } catch (e) {
    console.log("⚠️ 공식문서 검색 실패:", e.message);
    return [];
  }
}

// ============================================
// 4. 상위 페이지 콘텐츠 스크래핑 (날짜 추출 포함)
// ============================================
async function fetchPageContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });

    if (!response.ok) return null;

    const html = await response.text();

    // 날짜 추출 시도 (다양한 형식)
    let publishDate = null;
    const datePatterns = [
      // meta 태그에서 추출
      /<meta[^>]*property="article:published_time"[^>]*content="([^"]+)"/i,
      /<meta[^>]*name="date"[^>]*content="([^"]+)"/i,
      /<meta[^>]*name="pubdate"[^>]*content="([^"]+)"/i,
      // 일반적인 날짜 형식
      /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/,
      /(\d{4}년\s*\d{1,2}월\s*\d{1,2}일)/,
    ];

    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match) {
        publishDate = match[1];
        break;
      }
    }

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

    return { textContent, h2Tags, publishDate, url };
  } catch (e) {
    return null;
  }
}

// ============================================
// 5. 날짜가 최근 3개월 이내인지 확인
// ============================================
function isWithinThreeMonths(dateStr) {
  if (!dateStr) return true; // 날짜 정보 없으면 일단 포함

  try {
    // 다양한 날짜 형식 파싱
    let date;
    if (dateStr.includes("년")) {
      // 한국어 형식: 2024년 1월 15일
      const match = dateStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
      if (match) {
        date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      }
    } else {
      date = new Date(dateStr);
    }

    if (isNaN(date.getTime())) return true;

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    return date >= threeMonthsAgo;
  } catch (e) {
    return true;
  }
}

// ============================================
// 6. 경쟁 분석 (공식문서 + 최근 정보 우선)
// ============================================
async function analyzeCompetitors(keyword, searchResults, officialDocs) {
  if (!searchResults && !officialDocs) {
    return {
      keyword,
      topTitles: [],
      commonH2: [],
      contentSummary: "검색 결과 분석 불가",
      officialSources: [],
      recentSources: [],
    };
  }

  const allResults = [...(searchResults || []), ...(officialDocs || [])];
  console.log(`📊 총 ${allResults.length}개 페이지 분석 중... (공식문서: ${(officialDocs || []).length}개)`);

  const topTitles = allResults.map((r) => r.title);
  const snippets = allResults.map((r) => r.snippet).join("\n");
  const allH2 = [];
  const officialSources = [];
  const recentSources = [];

  // 콘텐츠 분석 (공식문서 우선)
  const sortedResults = allResults.sort((a, b) => {
    if (a.isOfficial && !b.isOfficial) return -1;
    if (!a.isOfficial && b.isOfficial) return 1;
    return 0;
  });

  for (let i = 0; i < Math.min(5, sortedResults.length); i++) {
    const result = sortedResults[i];
    const content = await fetchPageContent(result.link);

    if (content) {
      if (content.h2Tags) {
        allH2.push(...content.h2Tags);
      }

      // 공식문서 소스 수집
      if (result.isOfficial) {
        officialSources.push({
          title: result.title,
          url: result.link,
          snippet: result.snippet,
          content: content.textContent.slice(0, 1000),
        });
      }

      // 최근 3개월 이내 콘텐츠 수집
      if (isWithinThreeMonths(content.publishDate)) {
        recentSources.push({
          title: result.title,
          url: result.link,
          date: content.publishDate,
          snippet: result.snippet,
        });
      }
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

  console.log(`✅ 분석 완료 - 공식문서: ${officialSources.length}개, 최근 정보: ${recentSources.length}개`);

  return {
    keyword,
    topTitles,
    commonH2,
    snippets,
    officialSources,
    recentSources,
  };
}

// ============================================
// 7. DALL-E로 이미지 생성
// ============================================
async function generateImage(keyword) {
  console.log(`🖼️ DALL-E로 이미지 생성 중...`);

  // 키워드를 영어 프롬프트로 변환
  const promptMap = {
    "블로그": "modern blog writing workspace with laptop and coffee, minimalist style",
    "AI": "artificial intelligence concept, neural network visualization, futuristic blue tones",
    "자동화": "automation and robotics concept, gears and technology, modern illustration",
    "워드프레스": "wordpress website design on laptop screen, professional workspace",
    "SEO": "search engine optimization concept, magnifying glass on search bar, digital marketing",
    "글쓰기": "creative writing concept, person typing on laptop, warm lighting",
    "수익": "online business success, growth chart, professional setting",
    "애드센스": "digital advertising concept, website monetization, modern design",
    "프로그램": "software development, code on screen, modern tech workspace",
    "포스팅": "content creation, social media marketing, digital workspace",
  };

  let imagePrompt = "modern technology blog concept, clean minimalist design, professional";
  for (const [korean, english] of Object.entries(promptMap)) {
    if (keyword.includes(korean)) {
      imagePrompt = english;
      break;
    }
  }

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: imagePrompt + ", high quality, 16:9 aspect ratio, no text",
        n: 1,
        size: "1792x1024",
        quality: "standard",
      }),
    });

    const data = await response.json();

    if (data.data && data.data.length > 0) {
      return {
        url: data.data[0].url,
        alt: keyword,
      };
    }
  } catch (e) {
    console.log("⚠️ 이미지 생성 실패:", e.message);
  }

  return null;
}

// ============================================
// 9. 워드프레스에 이미지 업로드
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
// 8. Claude로 SEO 최적화 글 생성 (공식문서 + 최신정보 기반)
// ============================================
async function generateContent(keyword, analysis, imageData) {
  const client = new Anthropic({ apiKey: CLAUDE_API_KEY });

  // 이미지 HTML 생성
  let imageHtml = "";
  if (imageData) {
    imageHtml = `
<figure class="wp-block-image size-large">
  <img src="${imageData.url}" alt="${keyword}" />
</figure>`;
  }

  // 공식문서 정보 포맷팅
  const officialDocsInfo = analysis.officialSources && analysis.officialSources.length > 0
    ? analysis.officialSources.map(s => `- ${s.title}: ${s.snippet}`).join("\n")
    : "공식문서 검색 결과 없음";

  // 최신 정보 포맷팅
  const recentInfo = analysis.recentSources && analysis.recentSources.length > 0
    ? analysis.recentSources.map(s => `- [${s.date || '최근'}] ${s.title}: ${s.snippet}`).join("\n")
    : "최근 정보 없음";

  const systemPrompt = `당신은 10년 경력의 전문 블로그 작가이자 구글 SEO 전문가입니다.

## 핵심 원칙: 신뢰할 수 있는 정보 제공

### 정보 출처 우선순위 (매우 중요!)
1. **공식문서/공공기관 정보를 최우선으로 참조**
2. **최근 3개월 이내의 최신 정보만 사용**
3. 오래된 정보나 확인되지 않은 정보는 절대 포함하지 않음
4. 수치, 통계, 정책 정보는 반드시 출처와 함께 제시
5. "~라고 합니다", "~인 것으로 알려져 있습니다" 등 불확실한 표현 금지

### 글쓰기 스타일
- 자연스러운 구어체 사용 ("~해요", "~거든요", "~더라고요")
- 개인 경험 포함 ("제가 직접 써보니", "솔직히 말하면")
- AI가 쓴 티가 나지 않도록 자연스럽게
- 정확한 정보와 구체적인 수치/날짜 포함

### 절대 금지 사항 (매우 중요!)
- 이모지 절대 사용 금지
- 마크다운 문법 절대 사용 금지: ##, **, *, #, - 등
- 반드시 HTML 태그만 사용할 것
- 2024년 이전의 오래된 정보 사용 금지
- 확인되지 않은 수치/통계 사용 금지

### HTML 형식 필수
- 제목(소제목): <h2>제목</h2> 형식 사용 (## 금지)
- 강조: <strong>텍스트</strong> 형식 사용 (** 금지)
- 문단: <p>텍스트</p> 형식 사용
- 목록: <ul><li>항목</li></ul> 형식 사용 (- 금지)

### 구글 SEO 최적화
- 제목: 키워드를 앞쪽에 배치, 55자 이내
- 첫 문단 100자 내에 키워드 포함
- H2 태그 3-5개, 각 H2에 키워드 자연스럽게 포함
- 키워드 밀도 1.5-2.5%
- 메타 설명: 키워드 포함, 150자 이내

### 글 구조
- 도입부: 2-3문장으로 독자 고민 공감
- [IMAGE_PLACEHOLDER] 태그를 도입부 바로 다음에 삽입
- 본론: H2 섹션 3-5개
- 본문 중간에 자연스럽게 "AI 블로그 자동화 프로그램"을 언급하며 내부 링크 삽입
- 결론: 핵심 요약 + 행동 유도
- 글 마지막에 [CTA_PLACEHOLDER] 태그 삽입
- 총 1500자 이상`;

  const userPrompt = `다음 키워드로 구글 SEO에 최적화된 블로그 글을 작성해주세요.

**키워드**: ${keyword}
**작성 기준일**: ${new Date().toISOString().split('T')[0]} (이 날짜 기준 최신 정보 사용)

## 참고할 공식문서/공신력 있는 출처:
${officialDocsInfo}

## 최근 3개월 이내 최신 정보:
${recentInfo}

**경쟁 분석 결과**:
- 상위 노출 제목들: ${analysis.topTitles.join(" | ")}
- 자주 사용되는 소제목: ${analysis.commonH2.join(", ")}

**작성 요구사항**:

1. **제목 (55자 이내)**: 키워드를 앞쪽에 배치, 클릭 유도

2. **본문 구조**:
   - 도입부 (2-3문장): 독자 고민 공감, 첫 100자 내 키워드 포함
   - [IMAGE_PLACEHOLDER]
   - H2 섹션 3-5개 (각 H2에 키워드 변형 포함)
   - **반드시 위에서 제공한 공식문서와 최신 정보를 바탕으로 작성**
   - 각 섹션에 구체적인 예시, 숫자, 데이터 포함 (출처 명시 가능)
   - 본문 중간에 자연스럽게 내부 링크 삽입: <a href="https://wpauto.kr/">AI 블로그 자동화 프로그램</a> (문맥에 맞게 자연스럽게)
   - 결론: 핵심 3줄 요약 + 다음 행동 유도
   - 글 마지막에 [CTA_PLACEHOLDER] 태그 삽입

3. **정보 신뢰성 필수**:
   - 제공된 공식문서 정보를 우선적으로 활용
   - 최근 3개월 이내 정보만 사용
   - 오래된 정보, 불확실한 정보 사용 금지
   - 구체적인 날짜, 수치, 출처 포함

4. **절대 금지 - 마크다운 사용 금지**:
   - ## 사용 금지 → <h2>제목</h2> 사용
   - ** 사용 금지 → <strong>텍스트</strong> 사용
   - 이모지 사용 금지
   - 반드시 순수 HTML만 사용

5. **SEO 요소**:
   - 키워드 자연스럽게 7-10회 포함
   - 중요 키워드는 <strong>텍스트</strong> 태그로 강조

6. **1500자 이상 필수**

JSON 형식으로만 응답:
{
  "title": "제목 (이모지 없이)",
  "metaDescription": "메타 설명 150자 이내 (키워드 포함)",
  "content": "HTML 본문 (이모지 없이, [IMAGE_PLACEHOLDER] 포함)"
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

      // 마크다운을 HTML로 변환 (후처리)
      article.content = article.content
        // ## 제목 → <h2>제목</h2>
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        // **텍스트** → <strong>텍스트</strong>
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        // *텍스트* → <em>텍스트</em>
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        // - 목록 → <li>
        .replace(/^- (.+)$/gm, '<li>$1</li>');

      // 이미지 플레이스홀더를 실제 이미지로 교체
      if (imageHtml) {
        article.content = article.content.replace("[IMAGE_PLACEHOLDER]", imageHtml);
      } else {
        article.content = article.content.replace("[IMAGE_PLACEHOLDER]", "");
      }

      // CTA 박스 추가 (메인 페이지로 유도)
      const ctaHtml = `
<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 50px 40px; border-radius: 20px; margin: 50px 0; text-align: center; box-shadow: 0 20px 60px rgba(102, 126, 234, 0.4);">
  <p style="color: rgba(255,255,255,0.8); font-size: 0.95rem; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px;">AI 블로그 자동화 솔루션</p>
  <h3 style="color: #fff; font-size: 1.8rem; margin-bottom: 15px; font-weight: 900;">블로그 글쓰기, AI가 대신해드립니다</h3>
  <p style="color: rgba(255,255,255,0.9); font-size: 1.1rem; margin-bottom: 30px; line-height: 1.7;">키워드 하나로 SEO 최적화 글 작성부터 워드프레스 자동 발행까지!<br><strong style="color: #ffd93d;">월정액 없이 평생 사용</strong>하세요.</p>
  <a href="https://wpauto.kr/" style="display: inline-block; background: #ffd93d; color: #1a1a2e; padding: 18px 50px; border-radius: 50px; font-weight: 800; text-decoration: none; font-size: 1.15rem; box-shadow: 0 10px 30px rgba(0,0,0,0.3); transition: all 0.3s;">무료 상담받기 →</a>
  <p style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-top: 15px;">지금 바로 카카오톡으로 문의하세요</p>
</div>`;

      // 본문 중간 링크 버튼 추가
      const midCtaHtml = `
<div style="background: #f8f9fa; border: 2px solid #667eea; padding: 25px; border-radius: 15px; margin: 30px 0; text-align: center;">
  <p style="color: #333; font-size: 1.05rem; margin-bottom: 15px;">💡 <strong>시간 없이 블로그 운영하고 싶다면?</strong></p>
  <a href="https://wpauto.kr/" style="display: inline-block; background: #667eea; color: #fff; padding: 12px 30px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 1rem;">AI 자동화 프로그램 알아보기</a>
</div>`;

      // 본문 중간에 링크 버튼 삽입 (3번째 H2 태그 앞에)
      const h2Matches = article.content.match(/<h2[^>]*>/gi);
      if (h2Matches && h2Matches.length >= 3) {
        const thirdH2 = h2Matches[2];
        article.content = article.content.replace(thirdH2, midCtaHtml + thirdH2);
      }
      article.content = article.content.replace("[CTA_PLACEHOLDER]", ctaHtml);
      // CTA 플레이스홀더가 없는 경우 글 끝에 추가
      if (!article.content.includes(ctaHtml)) {
        article.content += ctaHtml;
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
// 10. 워드프레스 발행
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

  // Step 1: 구글 검색 (최근 3개월 필터 + 공식문서 우선)
  console.log("\n📍 Step 1: 최신 정보 검색 (최근 3개월)");
  const searchResults = await searchGoogle(keyword, { recentOnly: true, officialFirst: true });

  // Step 2: 공식문서 전용 검색
  console.log("\n📍 Step 2: 공식문서 검색");
  const officialDocs = await searchOfficialDocs(keyword);

  // Step 3: 경쟁 분석 (공식문서 + 최신 정보 포함)
  console.log("\n📍 Step 3: 종합 분석");
  const analysis = await analyzeCompetitors(keyword, searchResults, officialDocs);
  console.log(`✅ 분석 완료 - 상위 제목 ${analysis.topTitles.length}개, 공식문서 ${analysis.officialSources.length}개, 최신 정보 ${analysis.recentSources.length}개`);

  // Step 4: 이미지 검색 및 업로드
  console.log("\n📍 Step 4: 이미지 생성");
  let imageData = null;
  let featuredImageId = null;

  const image = await generateImage(keyword);
  if (image) {
    const uploaded = await uploadImageToWordPress(
      image.url,
      `blog-image-${Date.now()}`
    );
    if (uploaded) {
      imageData = {
        url: uploaded.url,
        credit: "AI Generated",
        creditLink: "#",
      };
      featuredImageId = uploaded.id;
    }
  }

  // Step 5: 글 생성 (공식문서 + 최신정보 기반)
  console.log("\n📍 Step 5: AI 글 생성 (공식문서 + 최신 정보 기반)");
  const article = await generateContent(keyword, analysis, imageData);

  if (!article) {
    console.error("❌ 글 생성 실패");
    process.exit(1);
  }

  console.log(`✅ 글 생성 완료: "${article.title}"`);

  // Step 6: 워드프레스 발행
  console.log("\n📍 Step 6: 워드프레스 발행");
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
