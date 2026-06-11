import "./style.css";
import type { SummarizeResponse, Message } from "@/utils/types";
import { BUTTON_CLASS, WATCH_BUTTON_CLASS } from "@/utils/constants";
import { fetchCaptions } from "@/utils/captions";

const SUMMARIZE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`;

const SEND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  cssInjectionMode: "ui",

  async main(ctx) {
    const processed = new WeakSet<Element>();
    const cache = new Map<string, { summary?: string; error?: string }>();
    const captionsCache = new Map<
      string,
      { text: string; title: string }
    >();
    const conversationCache = new Map<string, Message[]>();
    let activeOverlay: { videoId: string; remove: () => void } | null = null;

    // Intercept clicks on Glance buttons during capture phase,
    // before YouTube's SPA navigation can process them.
    const clickGuard = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Element) {
        const btn = target.closest(`.${BUTTON_CLASS}`);
        if (btn) {
          e.stopImmediatePropagation();
          e.preventDefault();
          btn.dispatchEvent(new CustomEvent("glance-click", { bubbles: false }));
        }
      }
    };
    window.addEventListener("click", clickGuard, true);

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

      btn.addEventListener("glance-click", () => {
        handleClick(videoId);
      });

      container.appendChild(btn);
    }

    async function handleClick(videoId: string) {
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
        showDrawer(videoId, cached);
        return;
      }

      // Show loading
      showDrawer(videoId, { loading: true });

      try {
        // Fetch captions in the content script (has YouTube cookies)
        const captions = await fetchCaptions(videoId);
        captionsCache.set(videoId, {
          text: captions.text,
          title: captions.title,
        });

        // Send captions to background for Claude API call
        const response: SummarizeResponse = await browser.runtime.sendMessage({
          type: "SUMMARIZE_TEXT",
          text: captions.text,
          title: captions.title,
        });

        if (response.success && response.summary) {
          cache.set(videoId, { summary: response.summary });
          // Store initial summary as first conversation message
          conversationCache.set(videoId, [
            { role: "assistant", content: response.summary },
          ]);
          showDrawer(videoId, { summary: response.summary });
        } else {
          const error = response.error ?? "Unknown error";
          cache.set(videoId, { error });
          showDrawer(videoId, { error });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        showDrawer(videoId, { error });
      }
    }

    async function showDrawer(
      videoId: string,
      state: { loading?: boolean; summary?: string; error?: string },
    ) {
      // Remove existing drawer immediately (no animation for swap)
      if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
      }

      const isDark = document.documentElement.hasAttribute("dark");

      let backdrop: HTMLDivElement;
      let panel: HTMLDivElement;

      const dismiss = () => {
        // Animate out
        backdrop.classList.remove("open");
        backdrop.classList.add("closing");
        panel.classList.remove("open");
        panel.classList.add("closing");
        setTimeout(() => {
          ui.remove();
          if (activeOverlay?.videoId === videoId) {
            activeOverlay = null;
          }
        }, 200);
        document.removeEventListener("keydown", onEscape);
      };

      const onEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && activeOverlay?.videoId === videoId) {
          dismiss();
        }
      };

      const ui = await createShadowRootUi(ctx, {
        name: "ytps-overlay",
        position: "inline",
        anchor: "body",
        append: "last",
        onMount(container) {
          Object.assign(container.style, {
            position: "fixed",
            inset: "0",
            zIndex: "2147483647",
            pointerEvents: "none",
          });

          // Backdrop
          backdrop = document.createElement("div");
          backdrop.className = "drawer-backdrop";
          backdrop.style.pointerEvents = "auto";
          backdrop.addEventListener("click", dismiss);
          container.appendChild(backdrop);

          // Panel
          panel = document.createElement("div");
          panel.className = `drawer-panel${isDark ? " dark" : ""}`;
          panel.style.pointerEvents = "auto";

          // Header
          const header = document.createElement("div");
          header.className = "drawer-header";
          const title = document.createElement("span");
          title.className = "drawer-title";
          title.textContent = "AI Summary";
          const closeBtn = document.createElement("button");
          closeBtn.className = "drawer-close";
          closeBtn.textContent = "\u00d7";
          closeBtn.addEventListener("click", dismiss);
          header.append(title, closeBtn);
          panel.appendChild(header);

          // Body
          const body = document.createElement("div");
          body.className = "drawer-body";

          if (state.loading) {
            const loading = document.createElement("div");
            loading.className = "drawer-loading";
            loading.innerHTML = `<div class="drawer-spinner"></div><span>Summarizing...</span>`;
            body.appendChild(loading);
          } else if (state.error) {
            const errorEl = document.createElement("div");
            errorEl.className = "drawer-error";
            errorEl.textContent = state.error;
            body.appendChild(errorEl);
          } else if (state.summary) {
            const summaryEl = document.createElement("div");
            summaryEl.className = "drawer-summary";
            summaryEl.innerHTML = formatSummary(state.summary);
            body.appendChild(summaryEl);

            // Render any existing follow-up messages from cache
            const messages = conversationCache.get(videoId);
            if (messages && messages.length > 1) {
              for (let i = 1; i < messages.length; i++) {
                const msg = messages[i];
                appendMessage(body, msg.role, msg.content);
              }
            }
          }

          panel.appendChild(body);

          // Footer with input (only when summary is loaded)
          if (state.summary) {
            const footer = document.createElement("div");
            footer.className = "drawer-footer";

            const inputRow = document.createElement("div");
            inputRow.className = "drawer-input-row";

            const input = document.createElement("input");
            input.className = "drawer-input";
            input.type = "text";
            input.placeholder = "Ask about this video...";

            const sendBtn = document.createElement("button");
            sendBtn.className = "drawer-send";
            sendBtn.innerHTML = SEND_ICON;
            sendBtn.title = "Send";

            const sendQuestion = async () => {
              const question = input.value.trim();
              if (!question) return;

              input.value = "";
              input.disabled = true;
              sendBtn.disabled = true;

              // Append user message
              appendMessage(body, "user", question);

              // Add loading indicator
              const loadingEl = document.createElement("div");
              loadingEl.className = "drawer-loading drawer-reply-loading";
              loadingEl.innerHTML = `<div class="drawer-spinner"></div>`;
              body.appendChild(loadingEl);
              body.scrollTop = body.scrollHeight;

              // Get conversation history
              const messages = conversationCache.get(videoId) ?? [];
              messages.push({ role: "user", content: question });

              try {
                const caps = captionsCache.get(videoId);
                const response: SummarizeResponse =
                  await browser.runtime.sendMessage({
                    type: "FOLLOW_UP",
                    messages,
                    captions: caps?.text ?? "",
                    title: caps?.title ?? "",
                  });

                loadingEl.remove();

                if (response.success && response.summary) {
                  messages.push({
                    role: "assistant",
                    content: response.summary,
                  });
                  conversationCache.set(videoId, messages);
                  appendMessage(body, "assistant", response.summary);
                } else {
                  appendMessage(
                    body,
                    "assistant",
                    response.error ?? "Something went wrong",
                  );
                }
              } catch (err) {
                loadingEl.remove();
                appendMessage(
                  body,
                  "assistant",
                  err instanceof Error ? err.message : "Something went wrong",
                );
              }

              input.disabled = false;
              sendBtn.disabled = false;
              input.focus();
            };

            input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendQuestion();
              }
              // Stop Escape from dismissing drawer while typing
              if (e.key === "Escape") {
                e.stopPropagation();
                input.blur();
              }
            });
            sendBtn.addEventListener("click", sendQuestion);

            inputRow.append(input, sendBtn);
            footer.appendChild(inputRow);
            panel.appendChild(footer);
          }

          container.appendChild(panel);

          // Trigger slide-in animation on next frame
          requestAnimationFrame(() => {
            backdrop.classList.add("open");
            panel.classList.add("open");
          });
        },
      });

      ui.mount();
      activeOverlay = { videoId, remove: dismiss };
      document.addEventListener("keydown", onEscape);
    }

    function appendMessage(
      container: HTMLElement,
      role: "user" | "assistant",
      content: string,
    ) {
      const msg = document.createElement("div");
      msg.className = `drawer-message drawer-message-${role}`;
      if (role === "assistant") {
        msg.innerHTML = formatSummary(content);
      } else {
        msg.textContent = content;
      }
      container.appendChild(msg);
      container.scrollTop = container.scrollHeight;
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

    function injectWatchPageButton() {
      // Remove any existing watch page button (handles SPA navigation between videos)
      document.querySelector(`.${WATCH_BUTTON_CLASS}`)?.remove();

      // Only inject on watch pages
      const videoId = new URL(window.location.href).searchParams.get("v");
      if (!videoId) return;

      const topButtons = document.querySelector("#top-level-buttons-computed");
      if (!topButtons) return;

      const isDark = document.documentElement.hasAttribute("dark");
      const btn = document.createElement("button");
      btn.className = `${BUTTON_CLASS} ${WATCH_BUTTON_CLASS}`;
      btn.title = "Summarize this video";
      btn.innerHTML =
        SUMMARIZE_ICON + '<span style="margin-left: 6px">Summarize</span>';

      const baseBg = isDark
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.05)";
      const hoverBg = isDark
        ? "rgba(255, 255, 255, 0.2)"
        : "rgba(0, 0, 0, 0.1)";
      const textColor = isDark ? "#f1f1f1" : "#0f0f0f";

      Object.assign(btn.style, {
        height: "36px",
        borderRadius: "18px",
        background: baseBg,
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        color: textColor,
        fontSize: "14px",
        fontFamily: '"Roboto", "Arial", sans-serif',
        fontWeight: "500",
        transition: "background 0.15s ease",
        marginLeft: "8px",
      });

      btn.addEventListener("mouseenter", () => {
        btn.style.background = hoverBg;
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = baseBg;
      });

      btn.addEventListener("glance-click", () => {
        handleClick(videoId);
      });

      topButtons.appendChild(btn);
    }

    // --- Start observing ---

    scanAndInject();
    injectWatchPageButton();

    // Watch for new thumbnails from infinite scroll / dynamic loading
    let debounceTimer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        scanAndInject();
        // Retry watch page button if action bar wasn't ready yet
        if (
          !document.querySelector(`.${WATCH_BUTTON_CLASS}`) &&
          window.location.pathname === "/watch"
        ) {
          injectWatchPageButton();
        }
      }, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Handle SPA navigation
    ctx.addEventListener(window, "wxt:locationchange", () => {
      if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
      }
      setTimeout(() => {
        scanAndInject();
        injectWatchPageButton();
      }, 500);
    });

    // Cleanup on context invalidation
    ctx.onInvalidated(() => {
      window.removeEventListener("click", clickGuard, true);
      observer.disconnect();
      if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
      }
      document
        .querySelectorAll(`.${BUTTON_CLASS}, .${WATCH_BUTTON_CLASS}`)
        .forEach((el) => el.remove());
    });
  },
});
