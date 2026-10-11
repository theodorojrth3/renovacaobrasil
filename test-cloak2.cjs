const { handler } = require("./netlify/functions/cloak.js");

const botUA = "facebookexternalhit/1.1";
const humanUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function test(label, ua) {
  const r = await handler({ headers: { "user-agent": ua }, path: "/", rawUrl: "/" });
  const isBlack = r.body.includes("gov.br");
  const isReal = r.body.includes("data-vite-theme") || r.body.includes("--background");
  console.log(`${label}: status=${r.statusCode} gov.br=${isBlack} realSite=${isReal}`);
}

(async () => {
  await test("BOT (facebook)", botUA);
  await test("HUMANO (Chrome)", humanUA);
})();