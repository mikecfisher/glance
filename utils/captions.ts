import type { CaptionTrack } from "./types";
import { MAX_CAPTION_CHARS } from "./constants";

export interface CaptionResult {
  text: string;
  title: string;
}

/**
 * Fetch captions using YouTube's innertube /player API with proper auth.
 * Must run in the content script context (on youtube.com) for cookie access.
 */
export async function fetchCaptions(videoId: string): Promise<CaptionResult> {
  console.log(`[YTPS] Fetching captions for ${videoId}`);

  // Get innertube config from the page
  const config = getInnertubeConfig();
  if (!config) {
    throw new Error("Could not read YouTube page config (ytcfg).");
  }

  // Build auth headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const sapisid = getSapisid();
  if (sapisid) {
    headers["Authorization"] = await makeSapisidhash(sapisid);
    headers["X-Origin"] = "https://www.youtube.com";
  }

  // Call innertube /player endpoint
  const resp = await fetch(
    `/youtubei/v1/player?key=${config.apiKey}&prettyPrint=false`,
    {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: "WEB",
            clientVersion: config.clientVersion,
            visitorData: config.visitorData,
          },
        },
        playbackContext: {
          contentPlaybackContext: {
            signatureTimestamp: config.sts,
          },
        },
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    },
  );

  if (!resp.ok) {
    throw new Error(`Innertube player API returned HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const playability = data?.playabilityStatus?.status;

  if (playability !== "OK") {
    throw new Error(`Video not playable: ${playability}`);
  }

  const tracks: CaptionTrack[] | undefined =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error("No caption tracks found for this video.");
  }

  console.log(
    `[YTPS] Found ${tracks.length} tracks:`,
    tracks.map((t) => `${t.languageCode} (${t.kind || "manual"})`),
  );

  const track = selectBestTrack(tracks);
  if (!track) {
    throw new Error("Could not select a caption track.");
  }

  // Fetch the caption XML
  const captionResp = await fetch(track.baseUrl, { credentials: "include" });
  if (!captionResp.ok) {
    throw new Error(`Caption fetch failed: HTTP ${captionResp.status}`);
  }

  const xml = await captionResp.text();
  console.log(`[YTPS] Caption XML: ${xml.length} chars`);

  const text = parseTimedText(xml);
  if (!text) {
    throw new Error("Caption XML was empty or unparseable.");
  }

  // Extract video title from player response
  const title =
    data?.videoDetails?.title ??
    data?.microformat?.playerMicroformatRenderer?.title?.simpleText ??
    "";

  console.log(`[YTPS] Got ${text.length} chars of captions for "${title}"`);

  return {
    text: text.substring(0, MAX_CAPTION_CHARS),
    title,
  };
}

interface InnertubeConfig {
  apiKey: string;
  clientVersion: string;
  visitorData: string;
  sts: number;
}

function getInnertubeConfig(): InnertubeConfig | null {
  // Content scripts run in an isolated world and can't access window.ytcfg.
  // Extract the config values from the page HTML instead.
  const html = document.documentElement.innerHTML;

  const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1];
  const clientVersion = html.match(
    /"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/,
  )?.[1];
  const visitorData = html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/)?.[1];
  const sts = html.match(/"STS"\s*:\s*(\d+)/)?.[1];

  if (!apiKey || !clientVersion) return null;

  return {
    apiKey,
    clientVersion,
    visitorData: visitorData ?? "",
    sts: sts ? Number(sts) : 0,
  };
}

function getSapisid(): string | null {
  const match =
    document.cookie.match(/SAPISID=([^;]+)/) ??
    document.cookie.match(/__Secure-3PAPISID=([^;]+)/);
  return match?.[1] ?? null;
}

async function makeSapisidhash(sapisid: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const input = `${timestamp} ${sapisid} https://www.youtube.com`;
  const hashBuffer = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(input),
  );
  const hashHex = [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `SAPISIDHASH ${timestamp}_${hashHex}`;
}

function selectBestTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const englishManual = tracks.find(
    (t) => t.languageCode === "en" && t.kind !== "asr",
  );
  if (englishManual) return englishManual;

  const englishAuto = tracks.find((t) => t.languageCode === "en");
  if (englishAuto) return englishAuto;

  const anyManual = tracks.find((t) => t.kind !== "asr");
  if (anyManual) return anyManual;

  return tracks[0] ?? null;
}

function parseTimedText(xml: string): string {
  const segments: string[] = [];
  const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const text = decodeEntities(match[1]).replace(/\n/g, " ").trim();
    if (text) segments.push(text);
  }
  return segments.join(" ");
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}
