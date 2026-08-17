# Reality Patch Notes

**Do not regenerate reality. Patch reality.**

관심 있는 대상(타깃)의 **현재 Reality Context**를 기억하고, 새 evidence와 비교해 **의미 있는 변화만 패치 노트**로 보고하는 Cloudflare Agents 앱입니다.

뉴스 요약기가 아닙니다. “오늘 뭐 바뀌었는지”를 **기록된 reality와 evidence** 기준으로 답합니다.

## Quick start

```bash
cd reality-patch-notes
npm install
npm run dev
```

로컬 개발에는 **Cloudflare 인증**이 필요합니다. `wrangler.jsonc`에서 Workers AI가 `"remote": true`이므로 `wrangler login` 또는 `CLOUDFLARE_API_TOKEN`을 설정하세요. OpenAI/Anthropic 키는 필요 없습니다.

브라우저: [http://localhost:5173](http://localhost:5173)

```bash
npm run check   # format + lint + typecheck
npm run deploy  # build + wrangler deploy
```

## 핵심 개념

| 개념 | 설명 |
|------|------|
| **Target** | 관찰 대상 (예: Cloudflare Agents) |
| **Reality Context** | 타깃에 대해 현재 알고 있는 내용 (마크다운, R2 저장) |
| **Evidence** | 그 reality를 믿게 한 근거 문서 (메타는 SQLite, 본문은 R2) |
| **Patch** | 기존 섹션의 **의미 있는 변경** (ADDED / CHANGED 등) |
| **Section proposal** | evidence에 **새 영역**이 보이지만 기존 섹션에 안 맞을 때 — 사용자 accept 전까지 pending |
| **Watch Intent** | Focus / Ignore / Priority — 스캔·비교 시 필터 |

## 기술 스택 → 역할

| 기술 | 이 프로젝트에서 하는 일 |
|------|-------------------------|
| **Cloudflare Workers** | HTTP + SPA 에셋 서빙 |
| **Durable Object (`ChatAgent`)** | 채팅 세션, SQLite, RPC, WebSocket broadcast |
| **Agent SQLite** (`this.sql`) | targets, patches, evidences 메타, scan_runs, section_proposals |
| **R2** (`REALITY_BUCKET`) | Reality Context `current.md`, evidence 본문 |
| **Workers AI** | 채팅 응답 + 스캔 시 semantic compare |
| **Workflows** | `initializeReality`, `scanTarget` (긴 작업 + 진행률) |
| **Agents SDK** | `AIChatAgent`, `@callable`, schedule, workflow 연동 |
| **Vite + React 19** | 프론트엔드 |
| **Kumo + Tailwind** | UI 컴포넌트 / 스타일 |
| **AI SDK** (`ai`, `@ai-sdk/react`) | `streamText`, 도구, 채팅 스트림 |

바인딩 정의: `wrangler.jsonc`

## UI 레이아웃 → 데이터 소스

```
┌─────────────────┬──────────────────────┬─────────────────┐
│ TargetSidebar   │ Chat (가운데)         │ SuggestedPrompts│
│ (왼쪽)          │                      │ (오른쪽)        │
├─────────────────┼──────────────────────┼─────────────────┤
│ RPC             │ WebSocket + Workers AI│ 클라이언트만     │
│ listStoredTargets│ useAgentChat         │ activity props  │
│ getTargetActivity│ chat tools (reality) │ 로 프롬프트 생성 │
└─────────────────┴──────────────────────┴─────────────────┘
         ▲                    ▲
         │                    │
    @callable           broadcast (workflow 진행,
    on ChatAgent         scan 완료, activity 변경)
```

| UI 영역 | 파일 | 서버 접근 방식 |
|---------|------|----------------|
| 타깃 목록 · Focus | `src/components/TargetSidebar.tsx` | RPC `listStoredTargets` |
| 마지막 스캔 · 오늘 패치 · 대기 제안 |同上 | RPC `getTargetActivity` |
| 채팅 · 도구 결과 | `src/app.tsx` | WebSocket + `useAgentChat` |
| 제안 질문 | `src/components/SuggestedPromptsSidebar.tsx` | 서버 호출 없음 |
| Workflow 진행 · toast | `src/app.tsx` (`onMessage`) | WebSocket `broadcast` |

사이드바는 **채팅 도구를 부르지 않습니다.** 타깃·활동 요약은 `@callable` RPC 전용입니다.

## 기능 → 코드 위치

| 하고 싶은 일 | 서버 | 클라이언트 / UI |
|--------------|------|-----------------|
| 채팅 | `server.ts` → `onChatMessage` | `app.tsx` |
| Reality 읽기/변경 (도구) | `tools/reality.ts` | 채팅에서만 |
| Reality 초기화 | `workflows/initialize-reality.ts` + `reality/initialize.ts` | 진행 toast |
| 스캔 · 패치 · 제안 생성 | `workflows/scan-target.ts` + `reality/scan.ts` | 진행 toast + 사이드바 갱신 |
| 제안 accept/reject | `reality/section-proposals.ts` | 채팅 도구 + 사이드바 갱신 |
| 예약 스캔 | `tools/reality-schedule.ts` → `executeTask` | toast (전용 UI 없음) |
| 시스템 지침 | `prompts.ts` + `tools/reality.ts` (realityPrompt) | — |
| 도메인 전체 barrel | `reality/index.ts` | — |

상세 다이어그램·테이블·데이터 흐름: **[src/ARCHITECTURE.md](./src/ARCHITECTURE.md)**

## 소스 트리 (제품 중심)

```
src/
  server.ts              # ChatAgent DO: RPC, chat, workflow 위임
  prompts.ts             # 제품 system prompt
  feature-flags.ts       # 스타터 데모 on/off (현재 전부 false)
  app.tsx                # re-exports app/App.tsx
  app/
    App.tsx              # Toasty shell
    Chat.tsx             # 3-column layout
    hooks/               # useAgentSession (WS), useTargetData (RPC)
    components/          # ChatHeader, ChatTranscript, ChatInput, …
  client.tsx             # React 진입점

  reality/               # ★ 도메인 (SQLite + R2)
    schema.ts            # 테이블 정의
    store.ts             # targets, R2 current context
    evidence.ts          # evidence ingest, hash dedup, R2 본문
    scan.ts              # fetch → compare → patch / proposal
    patches.ts           # patch 기록·조회
    section-proposals.ts # pending / accept / reject
    activity-summary.ts  # 사이드바용 집계
    initialize.ts        # 초기 Reality Context 생성
    sources.ts           # canonical source pack (Cloudflare Agents)
    ...

  tools/
    index.ts             # composeSystemPrompt + collectServerTools
    reality.ts           # ★ 채팅이 Reality를 건드리는 API
    reality-schedule.ts  # 예약 스캔
    shared.ts            # broadcast 이벤트 타입·파서

  starter/               # ★ Agents Starter 데모 (featureFlags off)
    README.md
    tools/               # weather, timezone, calculate, schedule, client
    features/            # mcp, images
    components/          # McpPanel
    hooks/               # useAttachments

  workflows/
    initialize-reality.ts
    scan-target.ts

  components/
    TargetSidebar.tsx
    SuggestedPromptsSidebar.tsx
    ToolPartView.tsx
    ...
```

## 데이터 저장

| 저장소 | 내용 |
|--------|------|
| **SQLite** (DO 내부) | targets, patches, evidence 메타, scan_runs, proposals |
| **R2** | `targets/{id}/current.md`, evidence 본문 |
| **채팅 history** | DO에 persist (Agents SDK) |

로컬 R2는 `.wrangler/state/v3/r2/.../blobs/` 아래 **content-addressed 해시 파일**로 보입니다. 논리 키(`targets/.../current.md`)와 다르게 보이므로, 탐색용으로 blob 폴더를 직접 열지 않는 편이 좋습니다.

## 스타터 데모 (현재 꺼짐)

`src/feature-flags.ts`에서 weather, timezone, calculate, schedule, mcp, images는 **모두 `false`**.  
구현은 `src/starter/`에 격리되어 있으며 UI·도구·프롬프트에 포함되지 않습니다.  
제품 기능은 **`src/tools/reality.ts` + `reality-schedule.ts`** 입니다.

## 채팅 예시 (제품)

- 「Cloudflare Agents 다시 스캔해줘」→ `scanTarget` (Workflow)
- 「오늘 뭐 바뀐 거 있어?」→ `getPatches`
- 「섹션 제안 목록 보여줘」→ `listSectionProposals`
- 「관심 설정 보여줘」→ `getReality` (`part=watch-intent`)
- 「지금 알고 있는 내용」→ `getReality` (`part=summary`)

## 배포

```bash
npm run deploy
```

메시지는 SQLite에 persist되고, idle 시 DO가 hibernate 됩니다.

## 더 읽을 것

- [src/ARCHITECTURE.md](./src/ARCHITECTURE.md) — 스택·기능·UI 상세 지도
- [Agents SDK](https://developers.cloudflare.com/agents/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)

## License

MIT
