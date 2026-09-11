# Fitness Coach (Think) — Phases

각 Phase 체크포인트에 **OK**를 받은 뒤에만 다음 Phase로 진행한다.

## Phase 1 — CoachAgent 스캐폴드
- [x] `CoachAgent extends Think<Env, State>`
- [x] `getModel()` → `@cf/moonshotai/kimi-k2.5`
- [x] `wrangler.jsonc` — DO 바인딩 / migration을 `CoachAgent`로 정리
- [x] UI `useAgent` 에이전트명 + 타입을 `CoachAgent`로 맞춤
- [x] 데모용 `getWeather` 제거 (확장 도구만 유지 준비)
- **체크포인트:** `tsc -b` 통과 + `npm run cf-typegen` 후 `CoachAgent` 타입 확인
- **상태:** OK ✓

## Phase 2 — soul 성격 + 워크스페이스 로깅 지시
- [x] `configureSession`의 `soul` — 격려하되 핑계 불허 / 훈련 피드백 질문 / 내일 집중 운동으로 마무리
- [x] soul(또는 동일 컨텍스트)에 워크스페이스 지시: 운동 보고 시 `logs/<date>.md` 기록, `plan.md` 최신 유지, 과거 질문 시 파일 읽기
- [ ] 내장 workspace 도구가 동작하는지 확인 (별도 도구 구현 불필요)
- **체크포인트:** 채팅에서 코치 톤 확인 + “오늘 스쿼트…” 보고 후 `logs/<date>.md` / `plan.md` 생성
- **상태:** OK ✓
- **참고:** `jinu-skills` R2 버킷 미존재로 `npm run dev`가 실패했음 → 계정에 버킷 생성 완료 (2026-09-11)

## Phase 3 — 영속 memory
- [x] 쓰기 가능한 `memory` 컨텍스트 블록 (신체 / 부상 / 목표)
- [x] description에 `set_context`로 저장하라는 힌트 포함
- [x] soul에 memory 저장·참조 규칙 추가
- **체크포인트:** 체중·무릎·5km 목표 전달 → Clear/새 브라우저에서도 반영된 계획
- **상태:** OK ✓

## Phase 4 — R2 on-demand skills
- [x] `R2SkillProvider` 연결 (`SKILLS`, prefix `skills/`)
- [x] R2에 가이드 ≥3 업로드 (`squat-form.md`, `running-program.md`, `stretching.md`)
- [x] soul에 load → 답변 → unload 지시
- **체크포인트:** 스쿼트 자세 질문 시 load → 답변 → unload
- **상태:** 체크포인트 대기
- **참고:** 로컬 원본은 `skills/*.md`, R2 키는 `skills/<name>.md` (`jinu-skills` 버킷)

## Phase 5 — 런타임 확장 도구 (1RM)
- [ ] `createExtensionTools` + `extensionLoader = this.env.LOADER`
- [ ] 코치가 JS로 1RM 계산기를 작성·로드할 수 있게 soul/도구 안내
- **체크포인트:** “1RM 계산기 만들어줘” → “80kg 5회면?” → 도구 호출 결과 ≈ 93kg
- **상태:** 대기

## Phase 6 — UI 정리 + E2E
- [ ] 헤더/카피를 Fitness Coach로 정리
- [ ] 과제 테스트 방법 4항 전부 통과
- **체크포인트:** E2E 테스트 절차 문서화 + 수동 검증
- **상태:** 대기

### E2E 테스트 (Phase 6)
1. `cd think-framework && npm run dev`
2. “오늘 스쿼트 했어. 80kg으로 5회씩 5세트 했어” → Workspace에 `logs/<date>.md` 생성
3. “이번 주에 무엇을 했지?” → 로그 파일을 읽어 답변
4. 체중 75kg / 왼쪽 무릎 / 5km 30분 목표 전달 후 새 브라우저 → 내일 계획에 세 정보 반영
5. 스쿼트 자세 질문 → R2 가이드 load/unload
6. 1RM 계산기 생성 → “80kg 5회” → ≈ 93kg
