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
- **상태:** 체크포인트 대기

## Phase 2 — Agent 방 API (Live Poll 패턴)
- [ ] `@callable join(name)` — 참가자 목록 동기화
- [ ] `@callable submitAnswer(text)` — 이름+답변을 state에 수집 (답변 창 open일 때만)
- [ ] `@callable closeRound(round)` — `sendEvent`로 조기 종료
- [ ] `@callable publishResults()` / approve 연동 준비
- [ ] Host·Participant UI에 join / 이름 입력
- **체크포인트:** 탭 2개에서 join → 참가자 목록 동시 갱신, submitAnswer가 state에 쌓임
- **상태:** 대기

## Phase 3 — QuizWorkflow: 문제 생성 + 표시
- [ ] `step.do("question-1"…"question-5")` + `Output.object` + `QuestionSchema`
- [ ] question 단계에 **retries** 설정 (실제 재시도 가능)
- [ ] `step.mergeAgentState`로 문제·`answering` 브로드캐스트
- [ ] 고정 단계명 유지
- **체크포인트:** 문제 생성 + 모든 화면 동시 표시; wrangler 재시작 후 같은 문제
- **상태:** 대기

## Phase 4 — 답변 창: waitForEvent + 조기 종료
- [ ] `waitForEvent("close-N", { timeout: 60s })`
- [ ] Host 버튼 → `sendEvent` 조기 종료
- [ ] 타임아웃 자동 진행
- **체크포인트:** 한 라운드 자동 종료 + 다른 라운드 조기 종료
- **상태:** 대기

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
