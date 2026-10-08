const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

async function mirrorSite(url, outputDir) {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    const resources = new Map();
    
    page.on('response', async (response) => {
        const url = response.url();
        const req = response.request();
        if (req.resourceType() === 'document' || req.resourceType() === 'stylesheet' || req.resourceType() === 'script' || req.resourceType() === 'image') {
            try {
                const buffer = await response.buffer();
                resources.set(url, buffer);
            } catch (e) {}
        }
    });
    
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    const html = await page.content();
    
    fs.mkdirSync(outputDir, { recursive: true });
    
    const baseUrl = new URL(url);
    const domain = baseUrl.origin;
    
    let modifiedHtml = html;
    
    for (const [resUrl, buffer] of resources) {
        try {
            const parsedUrl = new URL(resUrl, url);
            let relativePath = parsedUrl.pathname;
            
            if (relativePath.endsWith('/')) {
                relativePath = relativePath + 'index.html';
            }
            
            const localPath = path.join(outputDir, relativePath);
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            fs.writeFileSync(localPath, buffer);
            
            const relativeUrl = relativePath.replace(/\\/g, '/');
            const escapedUrl = resUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            modifiedHtml = modifiedHtml.replace(new RegExp(escapedUrl, 'g'), relativeUrl);
        } catch (e) {
            console.error('Error saving resource:', resUrl, e.message);
        }
    }
    
    fs.writeFileSync(path.join(outputDir, 'index.html'), modifiedHtml);
    
    await browser.close();
    console.log('Mirror completed to:', outputDir);
}

mirrorSite('https://renovesuacarteiradehabilitacao.netlify.app/', './site-mirror')
    .catch(console.error);