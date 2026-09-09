# Debate Sub-agents — Phases

각 Phase 체크포인트에 **OK**를 받은 뒤에만 다음 Phase로 진행한다.

## Phase 1 — 스키마 / 타입 / 상태 기반
- [x] `ArgumentSchema` — `{ stance, opening, arguments: { point, reasoning }[], closing }`
- [x] `arguments`는 Zod로 **정확히 3개** (`length: 3`)
- [x] `StancesSchema` — 주제에서 양쪽 입장 `{ sideA, sideB }` 추출용
- [x] `OrchestratorState`를 토론용으로 교체 (`status`, `topic`, `sides`, `activity`, `cases`)
- [x] `AdvocateProgressReporter`용 타입 자리 마련 (`ProgressReporter` + `Advocate` stub)
- **체크포인트:** `tsc -b` 통과 + 스키마가 논거 2개/4개 입력을 거부
- **상태:** OK ✓

## Phase 2 — Advocate 서브 에이전트 + RpcTarget
- [x] `export class Advocate extends Agent` (worker entry export)
- [x] `prepareCase(topic, stance, reporter)` — `Output.object` + `ArgumentSchema`
- [x] `ProgressReporter extends RpcTarget` — 부모 `setState.activity` 갱신
- [x] 진행 보고: 모두발언 → 논거 1/3·2/3·3/3 → 마무리
- [x] `@callable debugAdvocate`로 한쪽만 단독 실행 가능
- **체크포인트:** UI/callable로 한쪽 실행 → activity가 단계별로 바뀌고, 반환값에 논거 정확히 3개
- **참고:** 클라이언트 RPC 기본 타임아웃 30s → `defaultCallTimeout: 0` + `call(..., { timeout: 0 })`. Advocate는 LLM 1회(`Output.object`)로 축소.
- **상태:** OK ✓

## Phase 3 — 부모: 입장 추출 + Promise.all
- [x] `@callable debate(topic)` — 주제에서 `StancesSchema`로 양쪽 추출
- [x] `this.subAgent(Advocate, …)` 두 개 생성
- [x] `Promise.all`로 동시 실행 (상대 주장 미공유)
- [x] 완료 후 `cases`를 state에 저장
- **체크포인트:** “민초, 찬성인가 반대인가?” → 두 activity가 동시에 갱신, cases 양쪽 각 논거 3개
- **수정:** 입장 추출 프롬프트에 민초=민트초코 등 취향 논쟁 힌트 추가 (정치 오해석 방지)
- **상태:** 체크포인트 대기

## Phase 4 — 심판 스트리밍 판정
- [ ] 양쪽 도착 후 심판 `streamText` (채팅 스트리밍)
- [ ] 판정에 **승자** + **결정적 논거** 포함
- [ ] `onChatMessage` 또는 `saveMessages`로 UI 채팅에 표시
- **체크포인트:** 판정 메시지에 승자 이름과 구체적 논거가 포함됨
- **상태:** 대기

## Phase 5 — UI + E2E
- [ ] 양쪽 대변인 진행 상황 실시간 표시
- [ ] 주장(opening / 3 arguments / closing) 요약 표시
- [ ] 채팅으로 심판 판정 확인
- [ ] 부먹 vs 찍먹으로 입장 자동 추출 확인
- [ ] `debugAdvocate` 등 임시 callable 정리
- **체크포인트:**
  1. 민초 → 동시 progress + 논거 3개씩 + 판정(승자·결정적 논거)
  2. 부먹/찍먹 → 부모 스스로 양쪽 입장 추출
- **상태:** 대기
