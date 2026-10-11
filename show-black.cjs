const { handler } = require("./netlify/functions/cloak.js");

const humanUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

handler({
  headers: { "user-agent": humanUA },
  path: "/",
  rawUrl: "/"
}).then(r => {
  console.log("=== PÁGINA PRETA (humano) ===");
  console.log("Status:", r.statusCode);
  console.log(r.body);
});