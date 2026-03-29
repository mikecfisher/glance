import "./style.css";
import type { SummarizeResponse } from "@/utils/types";
import { BUTTON_CLASS } from "@/utils/constants";
import { fetchCaptions } from "@/utils/captions";

const SUMMARIZE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`;

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  cssInjectionMode: "ui",

  async main(ctx) {
    const processed = new WeakSet<Element>();
    const cache = new Map<string, { summary?: string; error?: string }>();
    let activeOverlay: { videoId: string; remove: () => void } | null = null;

    function scanAndInject() {
      const thumbnails = document.querySelectorAll(
        "yt-thumbnail-view-model, ytd-thumbnail:not([hidden])",
      );
      for (const thumb of thumbnails) {
        if (processed.has(thumb)) continue;
        processed.add(thumb);

        const videoId = extractVideoId(thumb);
        if (!videoId) continue;

        attachButton(thumb, videoId);
      }
    }

    function extractVideoId(thumbnailEl: Element): string | null {
      // Method 1: content-id class on ancestor
      const lockup = thumbnailEl.closest("[class*='content-id-']");
      if (lockup) {
        const match = lockup.className.match(/content-id-([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
      }

      // Method 2: find nearest watch link in a parent renderer
      const container = thumbnailEl.closest(
        "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer",
      ) ?? thumbnailEl.closest("yt-lockup-view-model")?.parentElement;

      if (container) {
        const link = container.querySelector<HTMLAnchorElement>(
          'a[href*="/watch?v="], a[href*="/shorts/"]',
        );
        if (link) {
          try {
            const url = new URL(link.href);
            if (url.pathname.startsWith("/shorts/")) {
              return url.pathname.split("/shorts/")[1]?.split("/")[0] ?? null;
            }
            return url.searchParams.get("v");
          } catch {
            return null;
          }
        }
      }

      return null;
    }

    function attachButton(thumbnailEl: Element, videoId: string) {
      // yt-thumbnail-view-model has overflow:hidden, so inject into its parent
      const container = (thumbnailEl.parentElement ?? thumbnailEl) as HTMLElement;

      const btn = document.createElement("button");
      btn.className = BUTTON_CLASS;
      btn.title = "Summarize this video";
      btn.innerHTML = SUMMARIZE_ICON;

      Object.assign(btn.style, {
        position: "absolute",
        top: "8px",
        left: "8px",
        zIndex: "2000",
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        background: "rgba(0, 0, 0, 0.6)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0",
        color: "white",
        transition: "background 0.15s ease",
      });

      if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
      }

      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(85, 85, 255, 0.9)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "rgba(0, 0, 0, 0.6)";
      });

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleClick(videoId, thumbnailEl);
      });

      container.appendChild(btn);
    }

    async function handleClick(videoId: string, anchor: Element) {
      // Toggle off if same overlay is showing
      if (activeOverlay?.videoId === videoId) {
        activeOverlay.remove();
        activeOverlay = null;
        return;
      }

      // Dismiss any existing overlay
      if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
      }

      // Check cache
      const cached = cache.get(videoId);
      if (cached) {
        showOverlay(videoId, anchor, cached);
        return;
      }

      // Show loading
      showOverlay(videoId, anchor, { loading: true });

      try {
        // Fetch captions in the content script (has YouTube cookies)
        const captions = await fetchCaptions(videoId);

        // Send captions to background for Claude API call
        const response: SummarizeResponse = await browser.runtime.sendMessage({
          type: "SUMMARIZE_TEXT",
          text: captions.text,
          title: captions.title,
        });

        if (response.success && response.summary) {
          cache.set(videoId, { summary: response.summary });
          showOverlay(videoId, anchor, { summary: response.summary });
        } else {
          const error = response.error ?? "Unknown error";
          cache.set(videoId, { error });
          showOverlay(videoId, anchor, { error });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        showOverlay(videoId, anchor, { error });
      }
    }

    async function showOverlay(
      videoId: string,
      anchor: Element,
      state: { loading?: boolean; summary?: string; error?: string },
    ) {
      // Remove existing overlay
      if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
      }

      const isDark = document.documentElement.hasAttribute("dark");

      // Position the overlay using fixed positioning relative to the viewport
      const rect = anchor.getBoundingClientRect();

      const ui = await createShadowRootUi(ctx, {
        name: "ytps-overlay",
        position: "inline",
        anchor: "body",
        append: "last",
        onMount(container) {
          // Position the container as a fixed overlay
          Object.assign(container.style, {
            position: "fixed",
            top: `${rect.top}px`,
            left: `${rect.right + 8}px`,
            zIndex: "2147483647",
            maxWidth: "380px",
            minWidth: "280px",
          });

          // If it would go off the right edge, position to the left instead
          if (rect.right + 388 > window.innerWidth) {
            container.style.left = "";
            container.style.right = `${window.innerWidth - rect.left + 8}px`;
          }

          // If it would go off the bottom, align to bottom of thumbnail
          if (rect.top + 200 > window.innerHeight) {
            container.style.top = "";
            container.style.bottom = `${window.innerHeight - rect.bottom}px`;
          }

          const root = document.createElement("div");
          root.className = `overlay-root${isDark ? " dark" : ""}`;

          // Header
          const header = document.createElement("div");
          header.className = "overlay-header";
          const title = document.createElement("span");
          title.className = "overlay-title";
          title.textContent = "AI Summary";
          const closeBtn = document.createElement("button");
          closeBtn.className = "overlay-close";
          closeBtn.textContent = "\u00d7";
          closeBtn.addEventListener("click", () => {
            ui.remove();
            activeOverlay = null;
          });
          header.append(title, closeBtn);
          root.appendChild(header);

          // Body
          if (state.loading) {
            const loading = document.createElement("div");
            loading.className = "overlay-loading";
            loading.innerHTML = `<div class="overlay-spinner"></div><span>Summarizing...</span>`;
            root.appendChild(loading);
          } else if (state.error) {
            const errorEl = document.createElement("div");
            errorEl.className = "overlay-error";
            errorEl.textContent = state.error;
            root.appendChild(errorEl);
          } else if (state.summary) {
            const body = document.createElement("div");
            body.className = "overlay-body";
            body.innerHTML = formatSummary(state.summary);
            root.appendChild(body);
          }

          container.appendChild(root);
        },
      });

      ui.mount();
      activeOverlay = {
        videoId,
        remove: () => ui.remove(),
      };

      // Dismiss on Escape
      const onEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && activeOverlay?.videoId === videoId) {
          activeOverlay.remove();
          activeOverlay = null;
          document.removeEventListener("keydown", onEscape);
        }
      };
      document.addEventListener("keydown", onEscape);
    }

    function formatSummary(text: string): string {
      // Convert markdown-style formatting to HTML
      const lines = text.split("\n");
      const formatted = lines
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return "";
          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            return `<li>${escapeHtml(trimmed.substring(2))}</li>`;
          }
          if (/^\d+\.\s/.test(trimmed)) {
            return `<li>${escapeHtml(trimmed.replace(/^\d+\.\s/, ""))}</li>`;
          }
          return `<p>${escapeHtml(trimmed)}</p>`;
        })
        .join("\n");

      // Wrap consecutive <li> in <ul>
      return formatted.replace(
        /(<li>[\s\S]*?<\/li>(\s*<li>[\s\S]*?<\/li>)*)/g,
        "<ul>$1</ul>",
      );
    }

    function escapeHtml(str: string): string {
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    }

    // --- Start observing ---

    scanAndInject();

    // Watch for new thumbnails from infinite scroll / dynamic loading
    let debounceTimer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scanAndInject, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Handle SPA navigation
    ctx.addEventListener(window, "wxt:locationchange", () => {
      if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
      }
      setTimeout(scanAndInject, 500);
    });

    // Cleanup on context invalidation
    ctx.onInvalidated(() => {
      observer.disconnect();
      if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
      }
      document
        .querySelectorAll(`.${BUTTON_CLASS}`)
        .forEach((el) => el.remove());
    });
  },
});
