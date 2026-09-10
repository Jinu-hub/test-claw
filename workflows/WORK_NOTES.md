# Quiz Show Workflow — Phases

각 Phase 체크포인트에 **OK**를 받은 뒤에만 다음 Phase로 진행한다.

## Phase 1 — 스키마 / 타입 / 상태 / 바인딩
- [x] `QuestionSchema` — `{ question, correctAnswer }`
- [x] `GradeResultSchema` — `{ grades: { playerName, correct, points, reason }[] }`
- [x] `FinaleSchema` — `{ announcement, winnerName }`
- [x] `QuizState` — status / topic / round / answers / scores / leaderboard / finale / published
- [x] `wrangler.jsonc` — `AI` 바인딩, `QuizAgent` DO, `QUIZ_WORKFLOW`
- [x] deps: `ai`, `zod`, `workers-ai-provider`
- [x] Pizza UI → Host / Participant 스캐폴드
- **체크포인트:** `tsc -b` 통과 + Zod 스키마 export 확인
- **상태:** OK ✓

## Phase 2 — Agent 방 API (Live Poll 패턴)
- [x] `@callable join(name)` — 참가자 목록 동기화 (+ connection.state에 playerName)
- [x] `@callable submitAnswer(text)` — 답변 창 open일 때만 이름+답변 수집
- [x] `@callable closeRound(round)` — 로컬 창 닫기 + `sendWorkflowEvent(close-N)`
- [x] `@callable publishResults()` — approve / published 상태 연동 준비
- [x] `@callable openAnswers()` — Phase 2 체크포인트용 (워크플로 연동 전 임시)
- [x] Host·Participant UI에 join / 이름 입력 / 답변·참가자 목록
- **체크포인트:** 탭 2개에서 join → 참가자 목록 동시 갱신, submitAnswer가 state에 쌓임
- **상태:** OK ✓

## Phase 3 — QuizWorkflow: 문제 생성 + 표시
- [x] `step.do("question-1"…"question-5")` + `Output.object` + `QuestionSchema`
- [x] question 단계에 **retries** (`limit: 5`, exponential)
- [x] `step.mergeAgentState`로 문제·`answering` 브로드캐스트
- [x] 고정 단계명 `question-N` 유지
- [x] 라운드 사이 임시 `step.sleep("answer-window-N", 60s)` (Phase 4에서 waitForEvent로 교체)
- **체크포인트:** 문제 생성 + 모든 화면 동시 표시; wrangler 재시작 후 같은 문제
- **상태:** OK ✓

## Phase 4 — 답변 창: waitForEvent + 조기 종료
- [x] `waitForEvent("close-N", { type, timeout: 60s })`
- [x] Host **Close round early** → `sendWorkflowEvent` 조기 종료
- [x] 타임아웃 시 try/catch로 자동 진행 (워크플로 실패 방지)
- **체크포인트:** 한 라운드 자동 종료 + 다른 라운드 조기 종료
- **상태:** 체크포인트 대기
- **테스트:**
  1. Start 후 라운드 1은 60초 기다려 자동 닫힘 확인
  2. 라운드 2는 Host **Close round early**로 즉시 다음 단계

## Phase 5 — 채점 + 순위표 (5라운드)
- [ ] `step.do("grade-N")` LLM 유사 답 채점
- [ ] 정답 공개 + leaderboard 갱신 (`mergeAgentState`)
- [ ] 라운드 1–5 전체 루프
- **체크포인트:** `Bong Joon-ho` ≈ `Bong Joon Ho` 점수; 재실행 시 점수 불변
- **상태:** 대기

## Phase 6 — Finale + waitForApproval + 공개 페이지
- [ ] `step.do("finale")` 우승자 발표문
- [ ] `waitForApproval()` 후 게시
- [ ] `/results` 공개 결과
- **체크포인트:** 승인 전 미게시 / 승인 후 published
- **상태:** 대기

## Phase 7 — UI + Durability E2E
- [ ] Host / Participant / Results UI 완성
- [ ] 탭 3개(진행자 1 + 참가자 2) 동시 표시
- [ ] wrangler 재시작 후 문제·순위표 유지
- **체크포인트:** 과제 테스트 방법 전부 통과
- **상태:** 대기
