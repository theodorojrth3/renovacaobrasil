const fs = require('fs');
let js = fs.readFileSync('C:/Users/carlo/Desktop/renove/site-mirror/assets/assets/index-20260329-aprfix.js', 'utf8');

// Replace all broken logo references with working one (using exact match)
js = js.replace(/raavonerno29\.sbs\/cnh-brasil-logo\.png/g, 'i.ibb.co/zPFChvR/logo645.png');

fs.writeFileSync('C:/Users/carlo/Desktop/renove/site-mirror/assets/assets/index-20260329-aprfix.js', js);
console.log('Fixed all logo references');