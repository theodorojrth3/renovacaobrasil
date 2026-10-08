const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const https = require('https');

async function downloadAll() {
    const outputDir = './site-mirror';
    fs.mkdirSync(outputDir, { recursive: true });
    
    const filesToDownload = [
        ['https://renovesuacarteiradehabilitacao.netlify.app/assets/assets/index-20260329-aprfix.css', 'assets/assets/index-20260329-aprfix.css'],
        ['https://renovesuacarteiradehabilitacao.netlify.app/assets/assets/index-20260329-aprfix.js', 'assets/assets/index-20260329-aprfix.js'],
        ['https://renovesuacarteiradehabilitacao.netlify.app/assets/assets/rawline-400.woff2', 'assets/assets/rawline-400.woff2'],
        ['https://renovesuacarteiradehabilitacao.netlify.app/assets/assets/rawline-600.woff2', 'assets/assets/rawline-600.woff2'],
        ['https://renovesuacarteiradehabilitacao.netlify.app/assets/assets/rawline-700.woff2', 'assets/assets/rawline-700.woff2'],
        ['https://renovesuacarteiradehabilitacao.netlify.app/external/cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6/css/all.min.css', 'external/cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6/css/all.min.css'],
        ['https://renovesuacarteiradehabilitacao.netlify.app/external/cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6/webfonts/fa-solid-900.woff2', 'external/cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6/webfonts/fa-solid-900.woff2'],
        ['https://renovesuacarteiradehabilitacao.netlify.app/external/i.ibb.co/zPFChvR/logo645.png', 'external/i.ibb.co/zPFChvR/logo645.png'],
        ['https://renovesuacarteiradehabilitacao.netlify.app/external/img.portalmarcossantos.com.br/wp-content/uploads/2025/12/09150903/Detran-AM-participa-do-lancamento-do-programa-CNH-do-Brasil-confira-novas-regras-para-obter-o-documento.jpeg', 'external/img.portalmarcossantos.com.br/wp-content/uploads/2025/12/09150903/Detran-AM-participa-do-lancamento-do-programa-CNH-do-Brasil-confira-novas-regras-para-obter-o-documento.jpeg'],
        ['https://renovesuacarteiradehabilitacao.netlify.app/external/www.gov.br/transportes/pt-br/assuntos/noticias/2025/12/cnh-do-brasil-como-solicitar-a-primeira-habilitacao-pelo-aplicativo/thumb-cnh-2.png', 'external/www.gov.br/transportes/pt-br/assuntos/noticias/2025/12/cnh-do-brasil-como-solicitar-a-primeira-habilitacao-pelo-aplicativo/thumb-cnh-2.png'],
        ['https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/vlibras-portal@dev/app/assets/access_icon.svg', 'external/cdn.jsdelivr.net/gh/spbgovbr-vlibras/vlibras-portal@dev/app/assets/access_icon.svg']
    ];
    
    for (const [url, dest] of filesToDownload) {
        const destPath = path.join(outputDir, dest);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        await new Promise(resolve => {
            https.get(url, res => {
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            }).on('error', resolve);
        });
        console.log('Downloaded:', dest);
    }
}

downloadAll().catch(console.error);