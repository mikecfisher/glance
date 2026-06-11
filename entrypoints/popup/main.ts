import { settingsStorage } from "@/utils/storage";
import { AVAILABLE_MODELS } from "@/utils/constants";

const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const modelSelect = document.getElementById("model") as HTMLSelectElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
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
  });

  showStatus("Settings saved!");
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
