import type { SummarizeResponse, Message } from "@/utils/types";
import { summarize, followUp } from "@/utils/claude";
import { settingsStorage } from "@/utils/storage";

interface SummarizeTextRequest {
  type: "SUMMARIZE_TEXT";
  text: string;
  title: string;
}

interface FollowUpRequest {
  type: "FOLLOW_UP";
  messages: Message[];
  captions: string;
  title: string;
}

type BackgroundRequest = SummarizeTextRequest | FollowUpRequest;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(
    (
      message: BackgroundRequest,
      _sender: browser.runtime.MessageSender,
      sendResponse: (response: SummarizeResponse) => void,
    ) => {
      if (message.type === "SUMMARIZE_TEXT") {
        handleSummarize(message.text, message.title)
          .then(sendResponse)
          .catch((err: Error) => {
            sendResponse({ success: false, error: err.message });
          });
        return true;
      }

      if (message.type === "FOLLOW_UP") {
        handleFollowUp(message.messages, message.captions, message.title)
          .then(sendResponse)
          .catch((err: Error) => {
            sendResponse({ success: false, error: err.message });
          });
        return true;
      }
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

  const summary = await summarize(text, title, settings.apiKey, settings.model);
  return { success: true, summary };
}

async function handleFollowUp(
  messages: Message[],
  captions: string,
  title: string,
): Promise<SummarizeResponse> {
  const settings = await settingsStorage.getValue();

  if (!settings.apiKey) {
    return {
      success: false,
      error: "No API key configured. Click the extension icon to set it up.",
    };
  }

  const summary = await followUp(
    messages,
    captions,
    title,
    settings.apiKey,
    settings.model,
  );
  return { success: true, summary };
}
