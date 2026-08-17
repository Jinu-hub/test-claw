/** Chat tools that change the target list (sidebar RPC refresh). */
export const TARGET_MUTATING_TOOLS = new Set([
  "addTarget",
  "removeTarget",
  "updateWatchIntent"
]);

/** Chat tools that change sidebar activity summary (RPC refresh). */
export const ACTIVITY_REFRESH_TOOLS = new Set([
  "addTarget",
  "removeTarget",
  "updateWatchIntent",
  "scanTarget",
  "acceptSectionProposal",
  "rejectSectionProposal",
  "injectTestEvidence",
  "collectEvidence",
  "initializeReality"
]);
