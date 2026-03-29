import { settingsStorage } from "@/utils/storage";
import { AVAILABLE_MODELS, DEFAULT_PROMPT } from "@/utils/constants";

const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const modelSelect = document.getElementById("model") as HTMLSelectElement;
const promptTextarea = document.getElementById("prompt") as HTMLTextAreaElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const resetPromptBtn = document.getElementById(
  "reset-prompt",
) as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

// Populate model dropdown
for (const model of AVAILABLE_MODELS) {
  const opt = document.createElement("option");
  opt.value = model.id;
  opt.textContent = model.label;
  modelSelect.appendChild(opt);
}

// Load saved settings
settingsStorage.getValue().then((settings) => {
  apiKeyInput.value = settings.apiKey;
  modelSelect.value = settings.model;
  promptTextarea.value = settings.customPrompt;
});

saveBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showStatus("API key is required", true);
    return;
  }

  await settingsStorage.setValue({
    apiKey,
    model: modelSelect.value,
    customPrompt: promptTextarea.value.trim() || DEFAULT_PROMPT,
  });

  showStatus("Settings saved!");
});

resetPromptBtn.addEventListener("click", () => {
  promptTextarea.value = DEFAULT_PROMPT;
});

function showStatus(message: string, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? "status error" : "status";
  if (!isError) {
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  }
}
