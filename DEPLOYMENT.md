# HubStudio5 운영

Firebase 프로젝트 `studio-9240700230-1dd9a`의 기존 허브스튜디오1·2 컬렉션과 ownerId 규칙을 사용합니다. 새 Firestore 규칙이나 서비스 계정 키는 요구하지 않습니다.

- 브라우저 Firebase 이메일/비밀번호 로그인. Firebase SDK가 로그인 유지와 토큰 갱신을 처리합니다. API는 실제 ID 토큰을 확인하고 같은 토큰으로 Firestore REST 요청을 보냅니다. 임의 로컬/체험 로그인은 없습니다.
- 초안: contentProjects, recordType=agentDraft, ownerId=실제 UID, sourceSite/siteId/themePersona=hub5, contentJson.
- 발행: publishedContents, status=published, visibility=public. 공개 글 생성과 초안 제거를 원자적으로 처리합니다. URL은 /blog/{postId}, DB ID는 hub5_{postId}입니다. 발행 취소는 반대로 처리합니다. 수정은 revision과 Firestore updateTime 충돌을 확인합니다.
- 검수 기록: contentProjects의 reviewMessage. 버전 백업: ownerId가 같은 contentProjects의 hub5Revision. 공개 API에 검수와 백업은 노출하지 않습니다. 소유자 확인 후에만 조회·수정·복원·삭제합니다.
- DB 실패는 오류입니다. 서버 파일이나 메모리로 저장 성공을 대체하지 않습니다. AI 실패도 생성/검수 성공으로 대체하지 않습니다.
- 이미지 허브: images에서 visibility=public을 조회합니다. dataUrl(webp/base64)은 /api/hub/{imageId}의 HTTPS 이미지 응답으로 제공하며 Firebase Storage를 사용하지 않습니다.
- 공개 메인·웹진·상세·사이트맵은 동일 DB 공개 조회를 사용합니다. 본문과 실제 링크를 초기 HTML에 출력합니다. 상세 고유 메타/canonical/BlogPosting, 없는 글 404/noindex. sitemap.xml·robots.txt는 서버 함수가 만듭니다.

Vercel 환경변수는 GEMINI_API_KEY, 선택 GEMINI_MODEL입니다. 모델 키는 브라우저에 넣지 않습니다. 정식 주소는 https://hubstudio5.vercel.app 로 고정했습니다. 도메인을 바꾸면 server/seo.ts, index.html, server.ts의 주소를 함께 변경합니다.

npm ci → npm run lint → npm test → npm run build. Vercel routes가 API/공개 SSR을 api/index.ts로 먼저 전달하고 정적 파일을 뒤에서 제공합니다. 파일 저장 폴더와 로컬 JSON DB는 사용하지 않습니다.

실계정 확인: 로그인→이미지 선택→제목 추천→본문 생성→초안 저장→새로고침→발행→비로그인 상세/사이트맵 확인. 검수→개선 적용→버전 복원과 다른 계정 격리를 확인합니다. 로컬 테스트는 Firestore/AI HTTP 요청을 모의 검증하며 실계정 로그인과 배포 DB 쓰기를 대신하지 않습니다.

기존 hub5Posts 공개 조회는 점검 당시 403이었습니다. 미확인 문서를 샘플로 대체하거나 다른 허브 문서로 채우지 않습니다. 기존 문서는 삭제하지 않았습니다.
