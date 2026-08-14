export {
  createCloudflareAgentsFixture,
  FIXTURE_TARGET_ID,
  seedFixtureIfNeeded
} from "./fixture";
export {
  currentContextObjectKey,
  parseRealityContext,
  serializeRealityContext
} from "./markdown";
export { ensureRealitySchema, type SqlExecutor } from "./schema";
export {
  getCurrentContext,
  getCurrentContextMarkdown,
  getTarget,
  listTargets,
  parseWatchIntent,
  putCurrentContext,
  upsertTarget,
  type RealityStore
} from "./store";
export {
  addTarget,
  allocateTargetId,
  createUninitializedContext,
  findTargetByName,
  normalizeIntentList,
  normalizeIntentTerm,
  removeTarget,
  resolveTarget,
  resolveTargetOrSingle,
  slugifyTargetId,
  summarizeTarget,
  setWatchIntent,
  updateWatchIntent
} from "./targets";
export type {
  ContextSection,
  EvidenceRow,
  PatchRow,
  RealityContext,
  ScanRunRow,
  TargetProfile,
  TargetRow,
  TargetStatus,
  WatchIntent
} from "./types";
