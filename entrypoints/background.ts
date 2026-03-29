import type { SummarizeResponse } from "@/utils/types";
import { summarize } from "@/utils/claude";
import { settingsStorage } from "@/utils/storage";

interface SummarizeTextRequest {
  type: "SUMMARIZE_TEXT";
  text: string;
  title: string;
}

export default defineBackground(() => {
  console.log("[YTPS] Background service worker started");

  browser.runtime.onMessage.addListener(
    (
      message: SummarizeTextRequest,
      _sender: browser.runtime.MessageSender,
      sendResponse: (response: SummarizeResponse) => void,
    ) => {
      if (message.type !== "SUMMARIZE_TEXT") return;

      console.log(
        `[YTPS] Summarize request: "${message.title}" (${message.text.length} chars)`,
      );

      handleSummarize(message.text, message.title)
        .then(sendResponse)
        .catch((err: Error) => {
          console.error("[YTPS] Error:", err);
          sendResponse({ success: false, error: err.message });
        });

      return true;
    },
  );
});

async function handleSummarize(
  text: string,
  title: string,
): Promise<SummarizeResponse> {
  const settings = await settingsStorage.getValue();

  if (!settings.apiKey) {
    return {
      success: false,
      error: "No API key configured. Click the extension icon to set it up.",
    };
  }

  const summary = await summarize(
    text,
    title,
    settings.apiKey,
    settings.model,
    settings.customPrompt,
  );

  return { success: true, summary };
}
