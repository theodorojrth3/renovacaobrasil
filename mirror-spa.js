const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const https = require('https');

async function mirrorSPA() {
    const url = 'https://renovesuacarteiradehabilitacao.netlify.app/';
    const outputDir = './site-mirror';
    
    const browser = await puppeteer.launch({ 
        headless: 'new', 
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0');
    await page.setViewport({ width: 1280, height: 800 });
    
    // Wait for content
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
    
    for (let i = 0; i < 20; i++) {
        const check = await page.evaluate(() => {
            const root = document.getElementById('root');
            return root ? root.innerHTML.length : 0;
        });
        if (check > 20000) break;
        await new Promise(r => setTimeout(r, 500));
    }
    
    // Get all needed content
    const rootHtml = await page.evaluate(() => document.getElementById('root').innerHTML);
    
    const finalHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>CNH 2026: Renove Automaticamente</title>
<meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" name="viewport"/>
<style>
:root {
    --background: 0 0% 100%;
    --foreground: 20 14.3% 4.1%;
    --muted: 60 4.8% 95.9%;
    --muted-foreground: 25 5.3% 44.7%;
    --border: 20 5.9% 90%;
    --primary: 222 47% 11%;
    --radius: 0.5rem;
}
</style>
</head>
<body>
<div id="root">${rootHtml}</div>
</body>
</html>`;
    
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'index.html'), finalHtml);
    console.log('HTML saved:', finalHtml.length, 'chars');
    
    await browser.close();
}

mirrorSPA().catch(console.error);