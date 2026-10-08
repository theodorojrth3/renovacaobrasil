const fs = require('fs');
const path = require('path');

const headContent = fs.readFileSync('./site-mirror/head-content.html', 'utf8');
const rootContent = fs.readFileSync('./site-mirror/root-content.html', 'utf8');

let finalHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
${headContent}
</head>
<body>
<div id="root">${rootContent}</div>
</body>
</html>`;

finalHtml = finalHtml.replace(/href="\.\.\/assets\/assets\//g, 'href="./assets/assets/');
finalHtml = finalHtml.replace(/src="\.\.\/assets\/assets\//g, 'src="./assets/assets/');
finalHtml = finalHtml.replace(/src="\/external\//g, 'src="./external/');

fs.writeFileSync('./site-mirror/index.html', finalHtml);
console.log('Final HTML:', finalHtml.length, 'chars');

fs.unlinkSync('./site-mirror/head-content.html');
fs.unlinkSync('./site-mirror/root-content.html');