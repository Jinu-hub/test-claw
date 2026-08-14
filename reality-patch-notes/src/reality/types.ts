export type WatchIntent = {
  focus: string[];
  ignore: string[];
  priority: string[];
};

export type ContextSection = {
  key: string;
  title: string;
  body: string;
};

export type TargetProfile = {
  description: string;
  category: string;
  created: string;
  lastUpdated: string;
};

export type RealityContext = {
  targetId: string;
  name: string;
  profile: TargetProfile;
  intent: WatchIntent;
  sections: ContextSection[];
  openQuestions: string[];
};

export type TargetStatus = "active" | "paused" | "archived";

export type TargetRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: TargetStatus;
  watch_intent_json: string;
  created_at: string;
  updated_at: string;
};

export type PatchRow = {
  id: string;
  target_id: string;
  section_key: string;
  type: string;
  title: string;
  summary: string;
  before_value: string | null;
  after_value: string | null;
  impact: string | null;
  created_at: string;
};

export type EvidenceRow = {
  id: string;
  target_id: string;
  url: string;
  title: string;
  publisher: string | null;
  source_type: string | null;
  published_at: string | null;
  observed_at: string;
  summary: string | null;
  content_hash: string | null;
  r2_object_key: string | null;
  compared_at: string | null;
};

export type PatchType = "ADDED" | "CHANGED" | "REMOVED" | "DEPRECATED";

export type ScanRunRow = {
  id: string;
  target_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
};
