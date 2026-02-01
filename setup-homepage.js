const fs = require("fs");
const path = require("path");

const WP_URL = process.env.WP_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

async function main() {
  if (!WP_URL || !WP_USER || !WP_APP_PASSWORD) {
    console.log("환경변수를 설정해주세요:");
    console.log("export WP_URL=https://your-site.com");
    console.log("export WP_USER=your-username");
    console.log("export WP_APP_PASSWORD=your-app-password");
    process.exit(1);
  }

  const auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");
  const htmlContent = fs.readFileSync(
    path.join(__dirname, "wordpress-homepage.html"),
    "utf-8"
  );

  console.log("📄 홈페이지 생성 중...");

  // 1. 페이지 생성
  const pageResponse = await fetch(`${WP_URL}/wp-json/wp/v2/pages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "AutoPost SEO Writer",
      content: htmlContent,
      status: "publish",
    }),
  });

  if (!pageResponse.ok) {
    const error = await pageResponse.text();
    console.error("❌ 페이지 생성 실패:", error);
    process.exit(1);
  }

  const page = await pageResponse.json();
  console.log(`✅ 페이지 생성 완료: ${page.link}`);
  console.log(`   페이지 ID: ${page.id}`);

  // 2. 홈페이지로 설정
  console.log("🏠 홈페이지로 설정 중...");

  const settingsResponse = await fetch(`${WP_URL}/wp-json/wp/v2/settings`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      show_on_front: "page",
      page_on_front: page.id,
    }),
  });

  if (settingsResponse.ok) {
    console.log("✅ 홈페이지 설정 완료!");
  } else {
    console.log("⚠️ 홈페이지 자동 설정 실패 - 수동으로 설정해주세요:");
    console.log("   워드프레스 관리자 → 설정 → 읽기 → 홈페이지 표시: 정적 페이지");
  }

  console.log(`\n🎉 완료! 사이트 확인: ${WP_URL}`);
}

main().catch(console.error);
