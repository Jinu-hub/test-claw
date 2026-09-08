# Second Brain (rag-agents) — Phases

각 Phase 체크포인트에 **OK**를 받은 뒤에만 다음 Phase로 진행한다.

## Phase 1 — 기반 (env + 스키마 + markdown fetch)
- [x] `ACCOUNT_ID` / `API_TOKEN`을 Env로 인식 (`.dev.vars`)
- [x] `sources` 테이블 (url, title, saved_at) + 기존 `chunks` 유지
- [x] `fetchMarkdown(url)` — Browser Rendering `/markdown` REST 호출
- [x] `chunkText(markdown)` — ~800자 단위 분할
- [x] `@callable debugFetchMarkdown` + UI "Test example.com" 버튼
- **체크포인트:** UI에서 `Test example.com` → title·chunkCount·preview가 나오면 **OK**
- **상태:** OK ✓

## Phase 2 — `saveUrl` 도구
- [x] `/markdown` → chunk → `embedMany` → Vectorize upsert + SQL 저장
- [x] `sources`에 URL/제목/시각 기록
- [x] 에이전트 도구로 노출 (채팅에서 URL 붙여넣으면 호출)
- [x] `debugInspectMemory` + UI "Save example.com" 체크포인트
- **체크포인트:** UI에서 `Save example.com` → `saved.chunkCount ≥ 1` 이고 `memory.sources`에 URL이 있으면 **OK**
- **상태:** OK ✓

## Phase 3 — `recall` + 시스템 프롬프트
- [x] 질문 임베딩 → `query({ topK: 5 })` → SQL에서 텍스트 조회
- [x] 조각 + 출처 URL을 모델에 전달 (`sourceUrl`)
- [x] 출처 URL을 항상 밝히도록 시스템 프롬프트 (+ 미지원 내용 거절)
- [x] UI "Test recall" 체크포인트
- **체크포인트:**
  1. `Test recall` → `hit.sourceUrls`에 example.com
  2. 채팅에서 Example Domain 질문 → 답에 URL
  3. 저장 안 한 내용 질문 → 출처 없음 고지
- **상태:** 구현 완료 → 사용자 OK 대기

## Phase 4 — `listSources` 도구
- [ ] 저장한 모든 URL을 제목·저장 시각과 함께 반환
- **체크포인트:** “내가 저장한 게 뭐가 있지?” → 출처 목록 전부

## Phase 5 — 정리 + E2E
- [ ] PDF 업로드/`ingestPdf`/`AI.toMarkdown`/`/api/upload`/R2 의존 제거 (과제: PDF·스크래핑 금지)
- [ ] UI에서 PDF 업로드 제거, 채팅 중심 Second Brain UX
- **체크포인트:** 서로 다른 주제 글 3개 저장 → 특정 글 질문(출처 URL) → 목록 3개 → 미저장 내용 거절
