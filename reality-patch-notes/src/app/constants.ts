/** Chat tools that change the target list (sidebar RPC refresh). */
export const TARGET_MUTATING_TOOLS = new Set([
  "addTarget",
  "removeTarget",
  "setWatchIntent",
  "updateWatchIntent",
  "acceptWatchIntentProposal"
]);

/** Chat tools that change sidebar activity summary (RPC refresh). */
export const ACTIVITY_REFRESH_TOOLS = new Set([
  "addTarget",
  "removeTarget",
  "setWatchIntent",
  "updateWatchIntent",
  "suggestWatchIntent",
  "acceptWatchIntentProposal",
  "rejectWatchIntentProposal",
  "scanTarget",
  "acceptSectionProposal",
  "rejectSectionProposal",
  "injectTestEvidence",
  "collectEvidence",
  "initializeReality"
]);
