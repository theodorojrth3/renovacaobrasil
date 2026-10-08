const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

async function mirrorWebsite() {
    const url = 'https://renovesuacarteiradehabilitacao.netlify.app/';
    const outputDir = './site-mirror';
    
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Use wget to download with recursion
    const { spawn } = require('child_process');
    
    // Check for wget in PATH
    const wgetPath = 'C:\\Program Files\\Git\\usr\\bin\\wget.exe';
    
    if (fs.existsSync(wgetPath)) {
        console.log('Using wget for mirroring...');
        const cmd = `"${wgetPath}" --mirror --convert-links --adjust-extension --page-requisites --no-parent --restrict-file-names=windows "${url}" -P "${outputDir}"`;
        spawn('cmd', ['/c', cmd], { stdio: 'inherit' });
    } else {
        // Fallback: use curl with recursive
        console.log('Using curl for mirroring...');
        // Download main HTML
        const curlPath = 'C:\\Windows\\System32\\curl.exe';
        if (fs.existsSync(curlPath)) {
            spawn('cmd', ['/c', `"${curlPath}" -L "${url}" -o "${outputDir}/index.html"`], { stdio: 'inherit' });
        }
    }
}

mirrorWebsite().catch(console.error);