import type { Settings } from "./types";
import { DEFAULT_MODEL } from "./constants";

export const settingsStorage = storage.defineItem<Settings>(
  "local:ytps-settings",
  {
    fallback: {
      apiKey: "",
      model: DEFAULT_MODEL,
    },
  },
);
