# Browser Agents — Web Exploration 과제 작업 노트

## 목표 요약

에이전트가 시작 URL에서 스스로 링크를 따라가며 질문에 답한다.
도구 호출 사이에 **하나의 브라우저 세션**을 유지하고, hop은 **코드에서 최대 5회**로 제한한다.

## Phase 로드맵

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | State 확장 + hop 가드 인프라 | ✅ done |
| 2 | `readPage` / `followLink` / `screenshot` 도구 | ⏳ pending |
| 3 | 탐색 루프 시스템 프롬프트 | ⏳ pending |
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

## Phase 2 — 탐색 도구 3개 (다음)

- [ ] `readPage()` — text + links via `page.evaluate()`
- [ ] `followLink(href)` — goto + screenshot + `canHop`/`recordHop`
- [ ] `screenshot()` — on-demand R2 capture
- [ ] 기존 `navigate` / `takeScreenshot` 정리 여부 결정
