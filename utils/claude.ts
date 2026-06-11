import { SYSTEM_PROMPT, FOLLOW_UP_SYSTEM_PROMPT } from "./constants";
import type { Message } from "./types";

export async function summarize(
  transcript: string,
  title: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Video title: "${title}"\n\nCaptions:\n${transcript}`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    if (resp.status === 401) throw new Error("Invalid API key");
    if (resp.status === 429) throw new Error("Rate limited — try again shortly");
    const body = await resp.text();
    throw new Error(`API error ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  return data.content[0].text;
}

export async function followUp(
  messages: Message[],
  captions: string,
  title: string,
  apiKey: string,
  model: string,
): Promise<string> {
  // First message provides the video context, then conversation continues
  const apiMessages = [
    {
      role: "user" as const,
      content: `Video title: "${title}"\n\nCaptions:\n${captions}`,
    },
    ...messages,
  ];

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: FOLLOW_UP_SYSTEM_PROMPT,
      messages: apiMessages,
    }),
  });

  if (!resp.ok) {
    if (resp.status === 401) throw new Error("Invalid API key");
    if (resp.status === 429) throw new Error("Rate limited — try again shortly");
    const body = await resp.text();
    throw new Error(`API error ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  return data.content[0].text;
}
