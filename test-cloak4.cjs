const { handler } = require("./netlify/functions/cloak.js");

const tests = [
  { name: "Cloaksupreme", ua: "Mozilla/5.0 (compatible; Cloaksupreme/1.0; +http://cloaksupreme.com)" },
  { name: "Googlebot", ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  { name: "Facebook", ua: "facebookexternalhit/1.1" },
  { name: "Chrome Humano", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
  { name: "iPhone", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
  { name: "curl", ua: "curl/8.0" },
  { name: "vazio", ua: "" },
];

(async () => {
  for (const t of tests) {
    const r = await handler({ headers: { "user-agent": t.ua }, path: "/", rawUrl: "/" });
    const isBlack = r.body.includes("gov.br");
    const isReal = r.body.includes("data-vite-theme");
    const expected = t.name === "Cloaksupreme" || t.name === "Chrome Humano" || t.name === "iPhone";
    const ok = (expected && isReal) || (!expected && isBlack);
    console.log(`${t.name.padEnd(20)} status=${r.statusCode} gov.br=${isBlack} real=${isReal} ${ok ? "OK" : "FAIL"}`);
  }
})();