export type Kind = "image" | "video" | "text";
export type Role = "admin" | "member";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  status: "active" | "disabled";
  credit_limit: number;
  credits_used: number;
  period_start: string;
  period_reset: "monthly" | "never";
  created_at: string;
  last_seen_at: string | null;
  has_password?: boolean;
  must_set_password?: number;
  avatar_url?: string | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  kind: Kind | "analyze";
  description?: string;
  featured?: boolean;
  enabled: boolean;
  context_length?: number;
  input_modalities: string[];
  output_modalities: string[];
  /** USD pricing used for estimates */
  pricing: {
    prompt?: number;        // per token
    completion?: number;    // per token
    per_image?: number;     // per generated image
    per_second?: number;    // per second of video
    per_request?: number;
  };
  /** video / image parameter support */
  options?: {
    aspect_ratios?: string[];
    resolutions?: string[];
    durations?: number[];
    supports_reference?: boolean;
    supports_audio?: boolean;
  };
  source: "curated" | "openrouter" | "override";
}

export interface Estimate {
  credits: number;
  usd: number;
  breakdown: string[];
  warning?: string;
}

export interface GenerateRequest {
  kind: Kind;
  model: string;
  prompt: string;
  negative?: string;
  params?: Record<string, unknown>;
  reference_keys?: string[];
  preset_id?: string;
  count?: number;
}

export interface Output { key: string; mime: string; index?: number }

export interface Generation {
  id: string;
  user_id: string;
  kind: Kind;
  model: string;
  prompt: string;
  params_json: string;
  input_keys_json: string;
  preset_id: string | null;
  status: "queued" | "running" | "done" | "failed";
  provider_job_id: string | null;
  estimate_credits: number;
  actual_credits: number | null;
  cost_usd: number | null;
  outputs_json: string;
  text_output: string | null;
  error: string | null;
  favorite?: number;
  created_at: string;
  completed_at: string | null;
}

export interface PresetVariable {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  default?: string;
  options?: string[];
  required?: boolean;
  help?: string;
}

export interface Preset {
  id: string;
  name: string;
  description: string | null;
  kind: Kind;
  model: string;
  template: string;
  negative: string | null;
  variables_json: string;
  params_json: string;
  reference_keys_json: string;
  cover_key: string | null;
  category: string;
  visibility: "team" | "private";
  created_by: string | null;
  runs: number;
  created_at: string;
  updated_at: string;
}

export interface Analysis {
  id: string;
  user_id: string;
  batch_id: string | null;
  source_url: string | null;
  file_key: string | null;
  filename: string | null;
  note: string | null;
  model: string;
  status: "queued" | "running" | "done" | "failed";
  transcript: string | null;
  summary: string | null;
  visual: string | null;
  extras_json: string;
  estimate_credits: number;
  actual_credits: number | null;
  cost_usd: number | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Batch {
  id: string;
  user_id: string;
  name: string | null;
  total: number;
  created_at: string;
  done?: number;
  failed?: number;
}

export interface LedgerEntry {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
}

export interface AppConfig {
  app_name: string;
  credit_usd: number;
  markup: number;
  nas_bridge: boolean;
}
