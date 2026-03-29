import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "YouTube Preview Summarizer",
    description: "Summarize YouTube videos from their thumbnails using AI",
    permissions: ["storage"],
    host_permissions: [
      "*://www.youtube.com/*",
      "https://api.anthropic.com/*",
    ],
  },
});
