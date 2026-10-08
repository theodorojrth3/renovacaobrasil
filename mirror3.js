const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const targetUrl = 'https://renovesuacarteiradehabilitacao.netlify.app/';
const outputDir = './site-mirror';

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const client = url.startsWith('https') ? https : http;
        
        client.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close();
                fs.unlink(dest, () => {});
                downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
        }).on('error', (err) => {
            file.close();
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

(async () => {
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Download main page
    const html = await fetchHtml(targetUrl);
    fs.writeFileSync(path.join(outputDir, 'index.html'), html);
    
    // Find and download assets
    const allAssets = html.match(/(?:src|href)=["']([^"']+)/gi) || [];
    
    const downloaded = new Set();
    
    for (const match of allAssets) {
        const url = match.replace(/(?:src|href)=["']/, '').trim();
        if (url.startsWith('http') || url.startsWith('//')) {
            const fullUrl = url.startsWith('//') ? `https:${url}` : url;
            if (!downloaded.has(fullUrl)) {
                downloaded.add(fullUrl);
                try {
                    const parsedUrl = new URL(fullUrl);
                    let relativePath = parsedUrl.pathname;
                    if (relativePath.endsWith('/')) relativePath += 'index.html';
                    const destPath = path.join(outputDir, relativePath);
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    await downloadFile(fullUrl, destPath);
                    console.log('Downloaded:', relativePath);
                } catch (e) {
                    console.error('Failed:', fullUrl, e.message);
                }
            }
        }
    }
    console.log('Done!');
})();