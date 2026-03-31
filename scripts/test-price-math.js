require('dotenv').config({ path: '.env.local' });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.goto('https://www.antalis.es/eshop/', { waitUntil: 'networkidle2' });
    try {
        const cookieBtn = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 3000 });
        if (cookieBtn) await cookieBtn.click();
    } catch (e) { }

    await page.evaluate(() => document.querySelector('.header__login')?.click());
    await new Promise(r => setTimeout(r, 1000));

    await page.type('#usernameSurrogate', process.env.ANTALIS_EMAIL);
    await page.type('#password', process.env.ANTALIS_PASSWORD);
    await Promise.all([
        page.keyboard.press('Enter'),
        page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => { })
    ]);

    const url = 'https://www.antalis.es/eshop/papel-cartulina-sobres/papel-estucado/estucado-pasta-quimica/estucado-pasta-quimica-mate/novatech-matt/SKU-545537';
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-price]', { timeout: 10000 });
    const data = await page.evaluate(() => {
        const el = document.querySelector('[data-price]');
        return Object.assign({}, el.dataset, {
            innerText: el.innerText
        });
    });
    console.log("Extracted Data:", data);
    await browser.close();
})();
