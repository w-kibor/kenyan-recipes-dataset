const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');
const csv = require('csv-parser');
const fastcsv = require('fast-csv');
const path = require('path');
const https = require('https');

const inputCsv = 'RecipesImp.csv';
const outputCsv = 'Recipes_with_Images_Final.csv';
const imagesDir = 'images';

if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const cleanFilename = (title) => {
    let clean = title.replace(/\r?\n|\r/g, ' ');
    clean = clean.replace(/[^a-zA-Z0-9\s-]/g, '');
    clean = clean.replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
    return clean;
};

const downloadImage = (url, filepath) => {
    return new Promise((resolve) => {
        try {
            if (url.startsWith('data:image')) {
                const matches = url.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
                if (!matches || matches.length !== 3) {
                    resolve(false);
                    return;
                }
                const buffer = Buffer.from(matches[2], 'base64');
                fs.writeFileSync(filepath, buffer);
                resolve(true);
            } else {
                const options = { headers: { 'User-Agent': 'Mozilla/5.0' } };
                https.get(url, options, (res) => {
                    if (res.statusCode === 200) {
                        const fileStream = fs.createWriteStream(filepath);
                        res.pipe(fileStream);
                        fileStream.on('finish', () => { fileStream.close(); resolve(true); });
                    } else { resolve(false); }
                }).on('error', () => resolve(false));
            }
        } catch (e) { resolve(false); }
    });
};

const fetchGoogleImage = async (page, query) => {
    try {
        await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&iax=images&ia=images`, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await delay(2000);

        const imageUrl = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img.tile--img__img'));
            const results = imgs.filter(img => img.src && img.src.length > 10);
            return results.length > 0 ? results[0].src : null;
        });

        return imageUrl;
    } catch (e) {
        console.error(`  [Puppeteer Error: ${e.message}]`);
        return null;
    }
};

const processRows = async (results) => {
    console.log(`Loaded ${results.length} rows.`);

    // Try finding a chrome executable path for Windows
    const executablePaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    ];
    let executablePath = null;
    for (let path of executablePaths) {
        if (fs.existsSync(path)) {
            executablePath = path;
            break;
        }
    }

    if (!executablePath) {
        console.error("No valid Chrome/Edge installation found.");
        process.exit(1);
    }

    console.log(`Using browser executable: ${executablePath}`);

    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-infobars', '--window-position=0,0', '--ignore-certifcate-errors', '--ignore-certifcate-errors-spki-list']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    for (let i = 0; i < results.length; i++) {
        const row = results[i];
        const title = row.title;

        let safeTitle = cleanFilename(title);
        if (safeTitle.length > 50) safeTitle = safeTitle.substring(0, 50);

        const imageFilename = `${safeTitle}.jpg`;
        const imageFilepath = path.join(imagesDir, imageFilename);
        const relativePath = `images/${imageFilename}`;

        if (fs.existsSync(imageFilepath)) {
            console.log(`[${i + 1}/${results.length}] ${title.substring(0, 30)}... -> File exists securely`);
            row.image_path = relativePath;
            continue;
        }

        let cleanQuery = title.replace(/\r?\n|\r/g, ' ');
        cleanQuery = cleanQuery.replace(/\(.*\)/g, '').trim();

        console.log(`[${i + 1}/${results.length}] Fetching for: ${cleanQuery}`);

        let query = `${cleanQuery} recipe food`;
        let imgUrl = await fetchGoogleImage(page, query);

        if (!imgUrl) {
            console.log(`  -> Main query failed, trying fallback: ${cleanQuery}`);
            imgUrl = await fetchGoogleImage(page, `${cleanQuery}`);
        }

        if (imgUrl) {
            let success = await downloadImage(imgUrl, imageFilepath);
            if (success) {
                console.log(`  -> Saved: ${imageFilename}`);
                row.image_path = relativePath;
            } else if (imgUrl.startsWith("http")) { // DuckDuckGo passes real imgur links. Attempt curl if node request blocks it.
                row.image_path = "";
                console.log(`  -> Failed saving via stream. Got URL: ${imgUrl}`);
            } else {
                row.image_path = "";
            }
        } else {
            console.log(`  -> No image found.`);
            row.image_path = "";
        }

        await delay(2000);
    }

    await browser.close();

    fastcsv.writeToPath(outputCsv, results, { headers: true })
        .on('finish', () => {
            console.log(`Done! Saved final dataset to ${outputCsv}`);
        });
};

const main = () => {
    const results = [];
    console.log(`Reading ${inputCsv}...`);

    fs.createReadStream(inputCsv)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
            processRows(results);
        });
};

main();
