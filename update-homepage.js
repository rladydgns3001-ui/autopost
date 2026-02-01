const fs = require("fs");
const path = require("path");

const WP_URL = process.env.WP_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

async function main() {
  const auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");
  const htmlContent = fs.readFileSync(
    path.join(__dirname, "wordpress-homepage-inline.html"),
    "utf-8"
  );

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
