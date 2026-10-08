const fs = require('fs');
let css = fs.readFileSync('site-mirror/assets/assets/index-20260329-aprfix.css', 'utf8');

// Remove references to missing font formats (keep only woff2 and woff)
css = css.replace(/\.eot\?#iefix[^"]*"[^"]*format\("embedded-opentype"\)/g, '');
css = css.replace(/,url\([^)]*\.eot\)/g, '');
css = css.replace(/format\("embedded-opentype"\)/g, '');
css = css.replace(/,url\([^)]*\.ttf\)/g, '');
css = css.replace(/format\("truetype"\)/g, '');
css = css.replace(/,url\([^)]*\.svg\)/g, '');
css = css.replace(/format\("svg"\)/g, '');
css = css.replace(/url\(rawline-100i\.woff2\)/g, 'url(rawline-100.woff2)');

fs.writeFileSync('site-mirror/assets/assets/index-20260329-aprfix.css', css);
console.log('Fixed CSS');