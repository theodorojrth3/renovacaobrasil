const { handler } = require("./netlify/functions/cloak.js");

const botUA = "facebookexternalhit/1.1";
const paths = [
  "/assets/assets/index-20260329-aprfix.css",
  "/assets/assets/index-20260329-aprfix.js",
  "/external/cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6/css/all.min.css",
  "/login.html",
  "/api/consulta.php"
];

(async () => {
  for (const p of paths) {
    const r = await handler({ headers: { "user-agent": botUA }, path: p, rawUrl: p });
    console.log(`${p.padEnd(70)} status=${r.statusCode} len=${r.body ? r.body.length : 0}`);
  }
})();