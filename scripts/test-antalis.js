const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    const url = 'https://www.antalis.es/eshop/papel-cartulina-sobres/papel-offset/offset-estandar/offset-estandar-ahuesado/print-speed-ahuesado/SKU-545873';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Dump text around "€" or "precio"
    const textContent = await page.evaluate(() => document.body.innerText);

    console.log("=== EXCERPTS WITH € ===");
    const lines = textContent.split('\n');
    lines.forEach((line, i) => {
        if (line.includes('€')) {
            console.log(`L${i}: ${line.trim()}`);
        }
    });

    // Let's also get the full HTML of elements that contain a price-like format
    const priceElementsHTML = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('*'))
            .filter(el => el.children.length === 0 && el.textContent.includes('€'))
            .map(el => el.outerHTML);
    });
    console.log("\n=== PRICE ELEMENTS HTML ===");
    console.log(priceElementsHTML.join('\n'));

    await browser.close();
})();
