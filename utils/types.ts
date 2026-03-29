export interface Settings {
  apiKey: string;
  model: string;
  customPrompt: string;
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
