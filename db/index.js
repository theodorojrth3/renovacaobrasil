const { drizzle } = require("drizzle-orm/netlify-db");
const schema = require("./schema.js");

const db = drizzle({ schema });

module.exports = { db };
