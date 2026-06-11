export const DEFAULT_MODEL = "claude-sonnet-4-6";

export const AVAILABLE_MODELS = [
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
] as const;

export const SYSTEM_PROMPT = `You summarize YouTube videos for people deciding whether to watch. Be specific and concrete — name names, cite numbers, state conclusions directly. Never be vague or generic.

Start with one punchy sentence that captures what the video actually covers — mention specific people, companies, or events, not abstract topic categories.

Then give 3-5 bullet points covering the most specific, interesting, or surprising things discussed. If the video reaches a conclusion or makes a recommendation, state it directly.

End with a "Worth watching?" verdict using this format:
Worth watching? [score]/10 — [one sentence explaining why or why not, e.g. "Dense with original insights" or "Mostly rehashes known information with clickbait padding"]`;

export const MAX_CAPTION_CHARS = 48_000;

export const FOLLOW_UP_SYSTEM_PROMPT = `You are answering follow-up questions about a YouTube video. The video captions and your initial summary were provided earlier in the conversation. Answer questions based on what was actually said in the video. Be specific and concise.`;

export const BUTTON_CLASS = "ytps-btn";
export const WATCH_BUTTON_CLASS = "ytps-watch-btn";
