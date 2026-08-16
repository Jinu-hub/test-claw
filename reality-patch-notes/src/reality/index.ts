export {
  createCloudflareAgentsFixture,
  FIXTURE_TARGET_ID,
  seedFixtureIfNeeded
} from "./fixture";
export {
  getTargetActivitySummary,
  type ActivityLastScan,
  type ActivityPatchItem,
  type ActivityProposalItem,
  type TargetActivitySummary
} from "./activity-summary";
export { fetchSourceText, htmlToText, type FetchedSource } from "./fetch";
export {
  collectCanonicalEvidence,
  findEvidenceByHash,
  hashContent,
  ingestFetchedEvidence,
  listEvidences,
  listUncomparedEvidences,
  persistFetchedEvidence,
  summarizeEvidence
} from "./evidence";
export {
  buildInitialRealityContext,
  isRealityInitialized,
  type InitializeRealityResult
} from "./initialize";
export {
  currentContextObjectKey,
  parseRealityContext,
  addSection,
  replaceSectionBody,
  serializeRealityContext
} from "./markdown";
export {
  insertPatch,
  insertScanRun,
  listPatches,
  queryPatches,
  type PatchEvidenceRef,
  type PatchQuery,
  type PatchSummary
} from "./patches";
export {
  createScheduledScanPayload,
  encodeScheduledScanPayload,
  isScheduledScanPayload,
  parseScheduledTaskPayload,
  type ScheduledScanPayload
} from "./schedule-payload";
export {
  injectNewSectionTestEvidence,
  injectSandboxSessionTestEvidence,
  isIgnoredByWatchIntent,
  scanTarget,
  type ScanTargetResult
} from "./scan";
export {
  acceptSectionProposal,
  findPendingProposal,
  getSectionProposal,
  listPendingProposals,
  listSectionProposals,
  rejectSectionProposal,
  summarizeSectionProposal,
  upsertPendingProposal,
  type SectionProposalStatus,
  type SectionProposalSummary
} from "./section-proposals";
export { ensureRealitySchema, type SqlExecutor } from "./schema";
export {
  getSourcePack,
  listSupportedSourcePackIds,
  type SectionBlueprint,
  type SourcePack,
  type SourceRef
} from "./sources";
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
  PatchType,
  RealityContext,
  ScanRunRow,
  TargetProfile,
  TargetRow,
  TargetStatus,
  WatchIntent
} from "./types";
