# 🚀 SEO 최적화 자동 포스팅 시스템

GitHub Actions를 이용하여 **매일 자동으로**:
1. 구글 상위 노출 페이지 분석
2. SEO 최적화된 글 생성 (1500자 이상)
3. 워드프레스 자동 발행

## ✨ 주요 기능

- **경쟁 분석**: 구글 상위 5개 페이지의 제목, H2 태그 분석
- **SEO 최적화**: 키워드 밀도, 메타 설명, H태그 구조 자동 최적화
- **자연스러운 글**: AI 티가 나지 않는 구어체 글쓰기
- **1500자 이상**: 충분한 깊이와 정보 제공
- **완전 자동화**: 하루 1개씩 자동 발행

## 📋 설정 방법

### 1. GitHub 저장소 생성
1. GitHub에서 새 저장소 생성 (**Private 필수**)
2. 이 폴더의 모든 파일 업로드

### 2. SerpAPI 키 발급 (무료)
1. https://serpapi.com 가입
2. 무료 플랜: 월 100회 검색 (충분함)
3. API Key 복사

### 3. GitHub Secrets 설정
저장소 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret Name | 값 | 설명 |
|-------------|-----|------|
| `CLAUDE_API_KEY` | sk-ant-api03-... | Claude API 키 |
| `SERP_API_KEY` | xxxxxxxx | SerpAPI 키 |
| `WP_URL` | https://yourblog.com | 워드프레스 URL |
| `WP_USER` | admin | 워드프레스 사용자명 |
| `WP_APP_PASSWORD` | xxxx xxxx xxxx | 앱 비밀번호 |

### 4. 워드프레스 앱 비밀번호 발급
1. 워드프레스 관리자 → 사용자 → 프로필
2. 애플리케이션 비밀번호 섹션
3. 이름 입력 → "새 앱 비밀번호 추가" → 복사

## ⏰ 발행 시간 변경

`.github/workflows/daily-post.yml` 에서 cron 수정:

```yaml
schedule:
  - cron: '0 0 * * *'  # 기본: 오전 9시 KST
```

| 한국 시간 | Cron (UTC) |
|----------|------------|
| 오전 6시 | `0 21 * * *` |
| 오전 9시 | `0 0 * * *` |
| 오후 12시 | `0 3 * * *` |
| 오후 6시 | `0 9 * * *` |

## 📝 키워드 관리

`keywords.json` 수정:

```json
{
  "currentIndex": 0,
  "keywords": [
    "키워드1",
    "키워드2",
    "키워드3"
  ]
}
```

- `currentIndex`: 현재 진행 중인 번호 (자동 증가)
- 키워드 추가/수정 후 GitHub에 push

## ▶️ 수동 실행 (테스트)

1. GitHub → **Actions** 탭
2. **"Daily SEO Auto Post"** 선택
3. **"Run workflow"** 클릭

## 📊 작동 방식

```
1. 키워드 선택 (순서대로)
       ↓
2. 구글 검색 (SerpAPI)
       ↓
3. 상위 5개 페이지 분석
   - 제목 패턴
   - H2 태그 구조
   - 검색 스니펫
       ↓
4. Claude로 글 생성
   - 경쟁 분석 기반
   - SEO 최적화
   - 자연스러운 문체
   - 1500자 이상
       ↓
5. 워드프레스 발행
       ↓
6. 인덱스 +1 (다음 키워드로)
```

## 💰 비용

| 항목 | 비용 |
|------|------|
| GitHub Actions | **무료** (월 2,000분) |
| SerpAPI | **무료** (월 100회) |
| Claude API | 글 1개당 ~100-200원 |

**월 30개 글 기준: 약 3,000~6,000원**

## ⚠️ 주의사항

- 저장소는 반드시 **Private**으로 설정
- SerpAPI 무료 한도: 월 100회 (하루 1개면 충분)
- Claude API 잔액 확인 필요

## 🔧 문제 해결

### 글자수가 1500자 미만인 경우
- Claude 모델이 짧게 생성할 수 있음
- 프롬프트에서 글자수 강조 이미 적용됨

### SerpAPI 한도 초과
- 무료: 월 100회
- 필요시 유료 플랜 ($50/월 5,000회)

### 워드프레스 발행 실패
- 앱 비밀번호 확인
- REST API 활성화 확인
- URL 형식 확인 (https:// 포함)
