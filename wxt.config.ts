import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Glance",
    description: "AI-powered video summaries, right from the thumbnail",
    permissions: ["storage"],
    host_permissions: [
      "*://www.youtube.com/*",
      "https://api.anthropic.com/*",
    ],
  },
});
