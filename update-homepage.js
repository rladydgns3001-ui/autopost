const fs = require("fs");
const path = require("path");

const WP_URL = process.env.WP_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

async function uploadImage(imagePath, filename) {
  console.log(`📤 이미지 업로드 중: ${filename}`);

  const auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");
  const imageBuffer = fs.readFileSync(imagePath);

  const response = await fetch(`${WP_URL}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: imageBuffer,
  });

  if (!response.ok) {
    const error = await response.text();
    console.log("⚠️ 이미지 업로드 실패:", error);
    return null;
  }

  const media = await response.json();
  console.log(`✅ 이미지 업로드 완료: ${media.source_url}`);
  return media.source_url;
}

async function main() {
  const auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");

  // 제품 스크린샷 업로드
  const screenshotPath = path.join(__dirname, "product-screenshot.png");
  let imageUrl = "";

  if (fs.existsSync(screenshotPath)) {
    imageUrl = await uploadImage(screenshotPath, `product-screenshot-${Date.now()}.png`);
  }

  // HTML 파일 읽기
  let htmlContent = fs.readFileSync(
    path.join(__dirname, "wordpress-homepage-inline.html"),
    "utf-8"
  );

  // 이미지 URL 치환
  if (imageUrl) {
    htmlContent = htmlContent.replace(/\[PRODUCT_IMAGE_URL\]/g, imageUrl);
  }

  // 기존 페이지 업데이트 (ID: 17)
  console.log("📄 홈페이지 업데이트 중...");

  const pageResponse = await fetch(`${WP_URL}/wp-json/wp/v2/pages/17`, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: htmlContent,
    }),
  });

  if (!pageResponse.ok) {
    const error = await pageResponse.text();
    console.error("❌ 업데이트 실패:", error);
    process.exit(1);
  }

  console.log("✅ 홈페이지 업데이트 완료!");
  console.log(`🎉 확인: ${WP_URL}`);
}

main().catch(console.error);
