# Starter demo (disabled)

Agents Starter 템플릿에서 가져온 **데모 기능**입니다.  
`src/feature-flags.ts`에서 모두 `false`이며, 제품 UI·도구·프롬프트에 포함되지 않습니다.

| Flag | Module |
|------|--------|
| weather | `tools/weather.ts` |
| timezone | `tools/timezone.ts`, `tools/client.ts` |
| calculate | `tools/calculate.ts` |
| schedule | `tools/schedule.ts` (일반 리마인더; 제품 예약 스캔은 `tools/reality-schedule.ts`) |
| mcp | `features/mcp.ts`, `components/McpPanel.tsx` |
| images | `features/images.ts`, `hooks/useAttachments.ts` |

제품 코드는 `src/reality/`, `src/tools/reality.ts`, `src/tools/reality-schedule.ts` 를 보세요.
