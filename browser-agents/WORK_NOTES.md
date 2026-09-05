# Browser Agents — Web Exploration 과제 작업 노트

## 목표 요약

에이전트가 시작 URL에서 스스로 링크를 따라가며 질문에 답한다.
도구 호출 사이에 **하나의 브라우저 세션**을 유지하고, hop은 **코드에서 최대 5회**로 제한한다.

## Phase 로드맵

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | State 확장 + hop 가드 인프라 | ✅ done |
| 2 | `readPage` / `followLink` / `screenshot` 도구 | ✅ done |
| 3 | 탐색 루프 시스템 프롬프트 | ✅ done |
| 4 | `/evidence/<key>` R2 프록시 | ✅ done |
| 5 | Live View + Evidence UI | ✅ done |
| 6 | 배포 + 테스트 | ✅ deployed (수동 E2E 대기) |

---

## Phase 1 — State + hop 제한

### 구현 내용

1. **`BrowserAgentState` 확장**
   - `liveUrl: string | null` — Live View iframe URL (기존)
   - `evidence: string[]` — R2 스크린샷 키 (이동 순서)
   - `hopCount: number` — 현재 탐색 이동 횟수

2. **상수**
   - `MAX_HOPS = 5` — 과제 요구사항 고정값

3. **헬퍼 메서드**
   - `canHop()` — hopCount < MAX_HOPS 이면 true
   - `recordHop(screenshotKey)` — hopCount++, evidence push
   - `resetExploration()` — hopCount/evidence 초기화
   - `closeBrowser()` — 브라우저 종료 시 exploration state도 리셋 + liveUrl null

### 리셋 규칙

| 시점 | 동작 |
|------|------|
| `closeBrowser()` | hopCount=0, evidence=[], liveUrl=null |
| `getPage()`로 새 세션 시작 | 기존 세션이 없을 때만 새 브라우저; exploration은 followLink/시작 도구에서 리셋 예정 (Phase 2) |

### 다음에 할 일 (Phase 2)

- `followLink` 진입 시 `canHop()` 검사 → 실패 시 `{ ok: false, reason: "max hops reached" }`
- 이동 성공 시 `recordHop(key)` 호출
- `readPage` / `screenshot` 구현

### 변경 파일

- `worker/index.ts`
- `WORK_NOTES.md` (본 파일)

### 완료 시각

- 2026-09-05 — Phase 1 구현 완료
  - `MAX_HOPS = 5` export
  - `BrowserAgentState`: `evidence`, `hopCount` 추가
  - `canHop` / `recordHop` / `resetExploration` / `closeBrowser` 리셋
  - `tsc --noEmit` 통과

---

## Phase 2 — 탐색 도구 3개

### 구현 내용

1. **`saveScreenshotToR2()`** — `evidence/${Date.now()}.jpg`로 R2 저장
2. **`appendEvidence(key)`** — hop 증가 없이 evidence만 추가 (`screenshot`용)
3. **`readPage()`**
   - `page.evaluate()`로 `url`, `title`, `text`(최대 8k), `links[{text,href}]`(최대 80, 절대 URL, 중복 제거)
   - `hopCount` / `maxHops`도 함께 반환
4. **`followLink(href)`**
   - `canHop()` 실패 시 `{ ok: false, reason: "max hops reached..." }`
   - `page.goto` → 스크린샷 → `recordHop`
   - 반환: `url`, `title`, `screenshotKey`, `hopCount`, `hopsRemaining`
5. **`screenshot()`**
   - 온디맨드 캡처, evidence에 append, **hop 미증가**

### 기존 도구 정리

- `navigate` / `takeScreenshot` / `auditSeo` — **유지** (SEO 과제·하위 호환)
- 탐색은 `followLink` / `readPage` / `screenshot` 사용 권장

### Phase 2 테스트 체크리스트

| # | 시나리오 | 기대 | 결과 |
|---|----------|------|------|
| 1 | `followLink(https://nomadcoders.co)` | hopCount=1, screenshotKey 반환 | ⏳ |
| 2 | `readPage()` | text + links 배열 | ⏳ |
| 3 | `followLink` 6번째 | ok=false, 이동 없음 | ⏳ |
| 4 | `screenshot()` | key 반환, hop 그대로 | ⏳ |
| 5 | 연속 도구 호출 | 같은 browser 세션 유지 | ⏳ |

> 참고: R2 key가 `evidence/...`라서 UI에서 보려면 Phase 4 `/evidence/*` 프록시가 필요.  
> 지금은 도구 output의 `screenshotKey` / `hopCount`로 검증.

### 변경 파일

- `worker/index.ts`
- `WORK_NOTES.md`

### 완료 시각

- 2026-09-05 — Phase 2 구현 완료, `tsc --noEmit` 통과

---

## Phase 3 — 시스템 프롬프트

### 구현 내용

1. **탐색용 system prompt**
   - `followLink` → `readPage` → (답이면 종료 / 아니면 링크 1개 선택) 반복
   - 탐색 Q&A에서는 `navigate` / `takeScreenshot` 사용 금지
   - 최대 `${MAX_HOPS}` hop, `ok:false`면 즉시 보고 후 `closeBrowser`
   - 최종 답: 답 / 찾은 페이지 URL / 경로 / hopCount
   - 사용자 언어로 응답

2. **매 유저 턴 시작 시 `resetExploration()`**
   - 이전 DO state에 남은 hopCount=5로 `max hops`가 뜨던 문제 완화
   - 턴마다 새 hop 예산(0부터)

3. **도구 description 보강**
   - `navigate` / `takeScreenshot`: exploration에서는 `followLink` / `screenshot` 우선 안내
   - `closeBrowser`: 답 후 호출 권장

### Phase 3 테스트 체크리스트

| # | 시나리오 | 기대 | 결과 |
|---|----------|------|------|
| 1 | Clear 후 “nomadcoders.co에서 가장 저렴한 강의” | `followLink`로 시작, `navigate` 안 씀 | ⏳ |
| 2 | 탐색 중 hopCount 1→… | 턴 시작이 0부터 | ⏳ |
| 3 | 답 또는 5 hop 후 | 경로+URL 보고 후 `closeBrowser` | ⏳ |
| 4 | 없는 정보 질문 | 무한 루프 없이 종료 | ⏳ |

### 변경 파일

- `worker/index.ts`
- `WORK_NOTES.md`

### 완료 시각

- 2026-09-05 — Phase 3 구현 완료, `tsc --noEmit` 통과

---

## Phase 4 — `/evidence/<key>` R2 프록시

### 구현 내용

1. **Worker `fetch`**
   - `/evidence/*` 및 `/screenshots/*` → R2 `FILES.get(pathname.slice(1))`
   - 예: `/evidence/1710000000.jpg` → key `evidence/1710000000.jpg`
   - 없으면 404 (SPA `index.html`로 떨어지지 않음)
   - `Content-Type` + `Cache-Control`

2. **`wrangler.jsonc`**
   - `run_worker_first`에 `"/evidence/*"` 추가  
     (어제 `/agents/*`와 같은 SPA 가로채기 방지)

### Phase 4 테스트 체크리스트

| # | 시나리오 | 기대 | 결과 |
|---|----------|------|------|
| 1 | 탐색 후 `screenshotKey`로 `/evidence/...` 열기 | JPEG 이미지 | ⏳ |
| 2 | 없는 key | 404, HTML 아님 | ⏳ |
| 3 | SPA가 `/evidence`를 가로채지 않음 | Worker 먼저 실행 | ⏳ |

> UI Evidence 타임라인은 Phase 5. 지금은 URL/Network로 검증.

### 변경 파일

- `worker/index.ts`
- `wrangler.jsonc`
- `WORK_NOTES.md`

### 완료 시각

- 2026-09-05 — Phase 4 구현 완료

---

## Phase 5 — Live View + Evidence UI

### 구현 내용

1. **레이아웃** — `max-w-6xl` 2컬럼 (채팅 | Live View + Evidence)
2. **Live View** — `agent.state.liveUrl` iframe, 없으면 idle 안내 (배포 Worker 필요)
3. **Evidence 패널** — `agent.state.evidence` 순서대로 Step N + 이미지 + 링크
4. **도구 UI**
   - `followLink` / `screenshot` / `auditSeo` / `takeScreenshot` → 이미지
   - `readPage` → URL / title / link count / 텍스트 미리보기
   - hop 배지 표시
5. **`closeBrowser`** — evidence/hopCount 유지 (다음 유저 턴의 `resetExploration`에서 초기화)  
   → 탐색 종료 후에도 타임라인 확인 가능

### Phase 5 테스트 체크리스트

| # | 시나리오 | 기대 | 결과 |
|---|----------|------|------|
| 1 | 탐색 중 Live View | (배포 시) iframe에 탭 표시 | ⏳ |
| 2 | followLink 후 Evidence | Step 순서대로 스크린샷 | ⏳ |
| 3 | closeBrowser 이후 | Evidence 패널에 기록 유지 | ⏳ |
| 4 | 다음 질문 전송 | evidence/hop 리셋 후 새 탐색 | ⏳ |

### 변경 파일

- `src/App.tsx`
- `worker/index.ts` (`closeBrowser` evidence 유지)
- `WORK_NOTES.md`

### 완료 시각

- 2026-09-05 — Phase 5 구현 완료

---

## Phase 6 — 배포 + 테스트

### 배포

- `npm run build` ✅
- `npx wrangler deploy` ✅
- URL: https://browser-agents.jinu30dev.workers.dev
- Version: `444c3e00-7df7-4ac3-8991-5b8f41e02945`

### E2E 테스트 체크리스트 (직접 확인)

| # | 시나리오 | 기대 | 결과 |
|---|----------|------|------|
| 1 | “nomadcoders.co에서 가장 저렴한 강의를 찾아줘” | followLink 루프 + 답/경로 | ⏳ |
| 2 | Live View | iframe에 실시간 탭 | ⏳ |
| 3 | Evidence | hop 순서 스크린샷 | ⏳ |
| 4 | 없는 정보 질문 | ≤5 hop 후 종료 | ⏳ |
| 5 | closeBrowser 후 Evidence 유지 | 타임라인 보임 | ⏳ |

### Live View 이슈 (2026-09-05)

**증상**: 탐색/Evidence는 되는데 Live View가 idle

**원인**
1. 배포 Worker에 `ACCOUNT_ID` / `API_TOKEN` 시크릿이 없음 (`wrangler secret list` → `[]`)
2. `.dev.vars`가 placeholder (`xxxxxxxx` / `yyyyyyyy`)
3. 탐색 종료 `closeBrowser` 후 `liveUrl=null` → 끝에서는 원래 idle

**수정**
- Live View 실패가 browsing을 막지 않도록 try/catch
- `liveViewError` state + UI 안내
- 종료 후 “Session ended / see Evidence” 메시지

### Evidence 세션별 저장 (2026-09-05)

- 키 형식: `evidence/{explorationId}/{timestamp}.jpg`
- `resetExploration()` / 유저 턴 시작 시 새 `explorationId` (UUID) 발급
- `clearSession()` → 해당 prefix(+ evidence keys) R2 삭제 후 state 초기화
- UI Evidence 헤더에 explorationId 앞 8자 표시
