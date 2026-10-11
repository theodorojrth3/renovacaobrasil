const { handler } = require("./netlify/functions/cloak.js");
const fs = require("fs");
const path = require("path");

const botUA = "facebookexternalhit/1.1";

(async () => {
  const files = fs.readdirSync("site-mirror").filter(f => /\.(css|js|png|jpg|svg|woff2)$/.test(f));
  let ok = 0, fail = 0;
  for (const f of files) {
    const r = await handler({ headers: { "user-agent": botUA }, path: "/" + f, rawUrl: "/" + f });
    if (r.statusCode === 200 && r.body && r.body.length > 0) ok++; else fail++;
  }
  console.log(`Assets: ok=${ok} fail=${fail} total=${files.length}`);
})();