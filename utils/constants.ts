export const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export const AVAILABLE_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fastest)" },
  { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { id: "claude-opus-4-6-20250527", label: "Claude Opus 4.6" },
] as const;

export const DEFAULT_PROMPT =
  "Summarize this YouTube video based on its captions. Give a concise summary (3-5 bullet points) of the key topics and takeaways. Be specific about what is discussed.";

export const MAX_CAPTION_CHARS = 48_000;

export const BUTTON_CLASS = "ytps-btn";
