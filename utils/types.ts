export interface Settings {
  apiKey: string;
  model: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind: string;
  name: { simpleText: string };
}

export interface SummarizeResponse {
  success: boolean;
  summary?: string;
  error?: string;
}
