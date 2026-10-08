const scrape = require('website-scraper').promises;
const websiteUrl = 'https://renovesuacarteiradehabilitacao.netlify.app/';

scrape({
    urls: [{ url: websiteUrl, filename: 'index.html' }],
    directory: './site-mirror',
    recursive: true,
    maxDepth: 10,
    ignoreErrors: false,
    request: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    }
}).then(() => {
    console.log('Website downloaded successfully');
}).catch(console.error);