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
| 4 | `/evidence/<key>` R2 프록시 | ⏳ pending |
| 5 | Live View + Evidence UI | ⏳ pending |
| 6 | 배포 + 테스트 | ⏳ pending |

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

## Phase 4 — `/evidence/<key>` 프록시 (다음)

- [ ] Worker `fetch`에 `/evidence/*` R2 서빙
- [ ] `wrangler.jsonc` `run_worker_first`에 `/evidence/*` 추가
