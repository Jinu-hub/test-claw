# Architecture — Reality Patch Notes

소스를 깊게 읽지 않아도 **어떤 기술이 어떤 기능에 쓰이는지**, **UI가 어디서 데이터를 가져오는지**를 파악하기 위한 지도입니다.

## 1. 한 장 요약

```
Browser (React)
  │  WebSocket ──────────────────────────────┐
  │  RPC (@callable) ─────────────┐          │
  ▼                               ▼          ▼
ChatAgent (Durable Object)
  ├─ SQLite     targets, patches, evidences*, scan_runs, section_proposals
  ├─ R2         current.md, evidence bodies
  ├─ Workers AI chat + scan compare
  ├─ Workflows  InitializeRealityWorkflow, ScanTargetWorkflow
  └─ Schedule   executeTask → startScanTarget (optional, tools always registered)
```

\* evidences: 메타데이터만 SQLite. `r2_object_key`로 본문 위치 참조.

## 2. Cloudflare 바인딩 (`wrangler.jsonc`)

| Binding | 용도 |
|---------|------|
| `ChatAgent` (DO) | 단일 에이전트 클래스. 세션·DB·RPC·broadcast |
| `REALITY_BUCKET` (R2) | Reality markdown + evidence 본문 |
| `AI` (Workers AI) | `@cf/moonshotai/kimi-k2.7-code` |
| `INITIALIZE_REALITY_WORKFLOW` | 초기 Reality Context 빌드 |
| `SCAN_TARGET_WORKFLOW` | fetch → compare → patch / propose |
| `assets` | Vite 빌드 SPA. `/agents/*`, `/oauth/*`는 worker-first |

## 3. 서버 진입점 — `server.ts`

`ChatAgent extends AIChatAgent<Env>`:

| 메서드 / 구역 | 역할 |
|---------------|------|
| `onStart` | schema, fixture seed, accepted proposal → Watch Intent sync |
| `getRealityStore()` | `{ sql, bucket }` — domain layer 공통 인자 |
| `prepare*` / `run*` / `start*` | Workflow step에서 호출하는 initialize/scan 로직 |
| `onWorkflowProgress` / `onWorkflowComplete` | `broadcast` → UI toast·진행률 |
| `@callable listStoredTargets` | 사이드바 타깃 목록 |
| `@callable getTargetActivity` | 사이드바 activity (patches, proposals, last scan) |
| `@callable getStoredContext` | 디버그용 raw markdown (UI 미사용) |
| `onChatMessage` | `streamText` + `collectServerTools(this)` |
| `executeTask` | 예약 스캔 payload면 `startScanTarget` |
| `notifyActivityChanged` | accept/reject 후 sidebar refresh 트리거 |

HTTP: `routeAgentRequest` → DO WebSocket / RPC.

## 4. 도메인 레이어 — `src/reality/`

도메인은 **채팅을 모릅니다.** `RealityStore` + 순수 함수/서비스.

| 모듈 | 책임 |
|------|------|
| `schema.ts` | SQLite DDL |
| `types.ts` | TargetRow, PatchRow, EvidenceRow, RealityContext, … |
| `store.ts` | target CRUD, R2 `put/getCurrentContext` |
| `markdown.ts` | RealityContext ↔ markdown 직렬화, 섹션 replace/add |
| `targets.ts` | add/remove target, Watch Intent 정규화 |
| `sources.ts` | source packs: `sections` / `role` / `refresh`; empty bound evidence → `INSUFFICIENT_EVIDENCE` |
| `fetch.ts` | URL → text |
| `evidence.ts` | hash dedup, R2 persist, list, compare 플래그 |
| `initialize.ts` | pack sources → AI로 섹션 작성 → R2 current |
| `scan.ts` | uncompared evidence → LLM compare → patch 또는 proposal |
| `patches.ts` | patch insert/query |
| `section-proposals.ts` | pending / accept / reject, Focus sync |
| `activity-summary.ts` | **UI 전용** SQLite 집계 (오늘 패치, last scan) |
| `fixture.ts` | 로컬 dev 시드 |
| `schedule-payload.ts` | 예약 스캔 payload encode/decode |

### 스캔 파이프라인 (mental model)

```
collect/fetch sources
  → content_hash 같으면 skip (LLM 호출 전)
  → Watch Intent ignore면 skip
  → 기존 section_key 매칭 → CHANGED patch + markdown replace
  → 새 capability → section_proposals (pending), Reality 자동 추가 안 함
  → scan_run 기록
```

## 5. 에이전트 도구 — `src/tools/`

채팅이 Reality를 **변경·조회하는 유일한 사용자-facing API**.

| 파일 | 내용 |
|------|------|
| `index.ts` | `composeSystemPrompt()`, `collectServerTools()` |
| `reality.ts` | listTargets, addTarget, getReality, scanTarget, proposals, … |
| `reality-schedule.ts` | scheduleScan, listScheduledScans, cancelScheduledScan |
| `shared.ts` | broadcast event types + parsers, MAX_TOOL_STEPS |
| `starter/*` | Agents Starter 데모 (`featureFlags` off) — see `starter/README.md` |

`reality.ts`의 `RealityToolHost` 인터페이스 = `server.ts`가 구현해야 하는 workflow/RPC hooks.

### 주요 Reality tools

| Tool | Domain / Workflow |
|------|-------------------|
| `initializeReality` | `startInitializeReality` → InitializeRealityWorkflow |
| `scanTarget` | `startScanTarget` → ScanTargetWorkflow |
| `getReality` | `part=watch-intent \| summary \| full` |
| `getPatches` | `patches.queryPatches` |
| `listSectionProposals` / `accept*` / `reject*` | `section-proposals.ts` |
| `collectEvidence` / `getEvidence` | `evidence.ts` |
| `injectTestEvidence` | `scan.ts` test helpers |

## 6. Workflows — `src/workflows/`

| Workflow | Steps (요약) |
|----------|--------------|
| `InitializeRealityWorkflow` | prepare → buildInitialRealityContext → complete broadcast |
| `ScanTargetWorkflow` | prepare → scanTarget → complete broadcast |

Workflow는 `ChatAgent` 메서드를 `step.do`로 호출. 진행률은 `reportProgress` → `onWorkflowProgress` → UI.

## 7. 프롬프트 — `prompts.ts`

`REALITY_SYSTEM_PROMPT`: 제품 원칙, mandatory tool use, query rules.

도구별 추가 지침: `tools/reality.ts` (`realityPrompt`), `tools/reality-schedule.ts`.

## 8. UI — `src/app/`

| File | 역할 |
|------|------|
| `App.tsx` | Toasty + Suspense shell |
| `Chat.tsx` | 3열 레이아웃 조립 |
| `hooks/useAgentSession.ts` | WebSocket + chat stream + broadcast |
| `hooks/useTargetData.ts` | RPC sidebar (targets, activity) |
| `components/ChatHeader.tsx` | 헤더 |
| `components/BackgroundJobsBar.tsx` | Workflow 진행률 |
| `components/ChatTranscript.tsx` | 말풍선 + ToolPartView |
| `components/ChatInput.tsx` | 입력 + Focus chip |

Legacy entry: `src/app.tsx` re-exports `app/App.tsx`.

### 연결 3종

| 종류 | 사용처 | 갱신 시점 |
|------|--------|-----------|
| **RPC** (`agent.stub.*`) | targets, activity | connect, target 선택, 수동 refresh |
| **WebSocket broadcast** | workflow progress, scan done, activity-changed | `onMessage` |
| **Chat tool output** | (간접) messages 감시 | scan/accept 등 tool 완료 후 refresh |

`app.tsx` 상단 Set:

- `TARGET_MUTATING_TOOLS` → `refreshTargets`
- `ACTIVITY_REFRESH_TOOLS` → `refreshActivity`

### 컴포넌트

| Component | 입력 | 출력 / 동작 |
|-----------|------|-------------|
| `TargetSidebar` | targets, activity, selectedId | onSelect, onAsk (채팅에 프롬프트 전달) |
| `SuggestedPromptsSidebar` | target, activity | onAsk |
| `ToolPartView` | tool UI part | debug 모드에서 raw I/O |
| `ThemeToggle` | — | dark/light |

### Focus prefix

선택된 타깃으로 보내는 메시지 앞에 `⟦Focus: Name | id⟧` 붙임 (`withTargetFocus`).  
채팅 bubble에서는 `stripTargetFocus`로 숨김. 모델은 `prompts.ts` 규칙으로 해당 target 우선.

## 9. WebSocket 이벤트 (`tools/shared.ts`)

| type constant | 의미 | UI 반응 |
|---------------|------|---------|
| `workflow-progress` | Workflow step | background job bar |
| `reality-initialized` | 초기화 완료 | toast + refresh |
| `reality-scanned` | 스캔 완료 | toast + refresh |
| `reality-activity-changed` | accept/reject 등 | refresh activity |
| `scheduled-task` | 일반 스케줄 (데모) | toast (flags off) |

## 10. SQLite 테이블 (`schema.ts`)

| Table | 용도 |
|-------|------|
| `targets` | id, name, watch_intent_json, status, … |
| `patches` | section 변경 이력 |
| `evidences` | url, hash, r2 key, compared_at |
| `scan_runs` | 스캔 실행 기록 (notes에 patch/proposal count JSON) |
| `patch_evidences` | patch ↔ evidence M:N |
| `section_proposals` | pending/accepted/rejected 새 섹션 제안 |

## 11. R2 키 규칙

| 키 패턴 | 내용 |
|---------|------|
| `targets/{targetId}/current.md` | 현재 Reality Context |
| `targets/{targetId}/evidence/...` | evidence 본문 (see `evidence.ts`) |

로컬 Miniflare: `.wrangler/state/v3/r2/reality-patch-notes/blobs/{hash}` — **논리 키와 다름**.

## 12. feature flags (`feature-flags.ts`)

| Flag | 기본 | 코드 위치 |
|------|------|-----------|
| weather, timezone, calculate, schedule, mcp, images | `false` | `starter/*` (gated in `tools/index.ts`, `app.tsx`) |

Reality tools/prompts는 **항상 on**.

## 13. 파일을 열 때 가이드

| 질문 | 먼저 볼 파일 |
|------|----------------|
| UI가 타깃 목록을 어디서? | `app.tsx` → `listStoredTargets`, `TargetSidebar.tsx` |
| 스캔이 실제로 뭐 함? | `reality/scan.ts`, `workflows/scan-target.ts` |
| 패치가 DB에 어떻게? | `reality/patches.ts`, `schema.ts` |
| 채팅 도구 목록? | `tools/reality.ts` |
| AI한테 뭐라고 시킴? | `prompts.ts`, `realityPrompt` |
| DO 설정? | `wrangler.jsonc`, `server.ts` |

## 14. 알려진 한계 (코드·프롬프트에 명시)

- Source pack은 Agents / Bitcoin만. 일별 시세·온체인 수집기는 아직 없음
- Vectorize, multi-channel notify, proposal auto-accept 없음
- 예약 스캔: 도구 + `executeTask`만, 전용 sidebar UI 없음
- Tool I/O는 debug toggle 없으면 채팅에 노출될 수 있음

## 15. 리팩터 로드맵 (문서화 Phase 이후)

| Phase | 내용 | 상태 |
|-------|------|------|
| 1 | README + ARCHITECTURE (이 문서) | ✅ |
| 2 | 스타터 데모 → `src/starter/` 격리 | ✅ |
| 3 | `app.tsx` hook/컴포넌트 분리 | ✅ |
| 4 | 모듈 머리말 + 타입 중복 제거 | ✅ |
| 5 | Phase N 문구 → capability 이름 | ✅ |
