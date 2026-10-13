export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  JOBS: Queue<JobMessage>;
  ASSETS: Fetcher;
  APP_NAME: string;
  APP_URL: string;
  MAIL_FROM: string;
  ADMIN_EMAILS: string;
  CREDIT_USD: string;
  CREDIT_MARKUP: string;
  DEFAULT_CREDIT_LIMIT: string;
  SESSION_DAYS: string;
  OPENROUTER_API_KEY?: string;
  RESEND_API_KEY?: string;
  NAS_ANALYZER_URL?: string;
  NAS_ANALYZER_TOKEN?: string;
  DEV_PRINT_MAGIC_LINK?: string;
}

export type JobMessage =
  | { type: "generation"; id: string }
  | { type: "video_poll"; id: string; attempt: number }
  | { type: "analysis"; id: string };
