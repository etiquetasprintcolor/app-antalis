const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function loginAntalis(page) {
    const email = process.env.ANTALIS_EMAIL;
    const password = process.env.ANTALIS_PASSWORD;
    if (!email || !password) {
        console.error("Missing ANTALIS_EMAIL or ANTALIS_PASSWORD!");
        return false;
    }

    console.log("Navigating to Antalis home to login...");
    await page.goto('https://www.antalis.es/eshop/', { waitUntil: 'networkidle2' });

    // Accept cookies
    try {
        const cookieBtn = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 3000 });
        if (cookieBtn) await cookieBtn.click();
        await new Promise(r => setTimeout(r, 1000));
    } catch (e) { }

    // Open login dropdown
    console.log("Opening login dropdown...");
    await page.evaluate(() => {
        const loginWrapper = document.querySelector('.header__login');
        if (loginWrapper) loginWrapper.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log("Typing credentials...");
    // username dropdown uses #usernameSurrogate, password uses #password
    await page.type('#usernameSurrogate', email, { delay: 50 });
    await page.type('#password', password, { delay: 50 });

    console.log("Submitting...");
    // The form id is loginForm
    await Promise.all([
        page.keyboard.press('Enter'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { })
    ]);

    // Check login success by checking if .header__login-wellcom does NOT contain "Iniciar sesión"
    const isLoggedIn = await page.evaluate(() => {
        const welcomeText = document.querySelector('.header__login-wellcom');
        return welcomeText && !welcomeText.innerText.toLowerCase().includes('iniciar sesión');
    });

    return isLoggedIn;
}

async function scrapePrice(page, url) {
    if (!url) return null;
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Wait for the price element
        await page.waitForSelector('[data-price]', { timeout: 10000 }).catch(() => null);

        const data = await page.evaluate(() => {
            const el = document.querySelector('[data-price]');
            if (!el) return null;
            return {
                price: parseFloat(el.getAttribute('data-price')),
                q1: parseFloat(el.getAttribute('data-quantity-price') || "1"),
                q2: parseFloat(el.getAttribute('data-base-unit-quantity-price') || "1")
            };
        });

        if (data && data.price) {
            const totalQuantity = (data.q1 || 1) * (data.q2 || 1);
            return data.price / totalQuantity;
        }
        return null;
    } catch (err) {
        console.error(`Error scraping ${url}: ${err.message}`);
        return null;
    }
}

(async () => {
    console.log("Fetching catalog from Supabase...");
    const { data: catalog, error } = await supabase.from('catalogo_papel').select('*');
    if (error) {
        console.error("Error fetching catalog:", error);
        process.exit(1);
    }

    console.log(`Found ${catalog.length} items. Starting browser...`);
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    const loggedIn = await loginAntalis(page);
    if (!loggedIn) {
        console.error("❌ Failed to log in to Antalis! Aborting scrape so we don't save public prices.");
        await browser.close();
        process.exit(1);
    }
    console.log("✅ Logged in successfully! Now scraping with custom prices...");

    let count = 0;
    for (const item of catalog) {
        count++;
        console.log(`\n[${count}/${catalog.length}] Scraping ${item.material} ${item.gramaje}g (${item.formato_libro})`);

        let precio_hoja = item.precio_hoja;
        let precio_hoja_pallet = item.precio_hoja_pallet;

        // Scrape paquete URL
        if (item.url_paquete) {
            console.log(` -> Paquete: ${item.url_paquete}`);
            const price = await scrapePrice(page, item.url_paquete);
            if (price !== null) {
                precio_hoja = parseFloat(price.toFixed(6));
                console.log(`    💰 Logged-in Precio/Hoja Paquete: ${precio_hoja}`);
            } else {
                console.log(`    ⚠️ Could not scrape paquete price`);
            }
        }

        // Scrape pallet URL
        if (item.url_pallet) {
            console.log(` -> Pallet: ${item.url_pallet}`);
            const price = await scrapePrice(page, item.url_pallet);
            if (price !== null) {
                precio_hoja_pallet = parseFloat(price.toFixed(6));
                console.log(`    💰 Logged-in Precio/Hoja Pallet: ${precio_hoja_pallet}`);
            } else {
                console.log(`    ⚠️ Could not scrape pallet price`);
            }
        }

        // Update DB
        if (precio_hoja !== item.precio_hoja || precio_hoja_pallet !== item.precio_hoja_pallet) {
            console.log(` -> Updating DB for item ID ${item.id}...`);
            const { error: updateError } = await supabase
                .from('catalogo_papel')
                .update({ precio_hoja, precio_hoja_pallet })
                .eq('id', item.id);

            if (updateError) {
                console.error("    ❌ Error updating DB:", updateError);
            } else {
                console.log("    ✅ DB Updated.");
            }
        } else {
            console.log(" -> No price changes found, skipping DB update.");
        }

        await new Promise(r => setTimeout(r, 1000));
    }

    await browser.close();
    console.log("\nFinished scraping all logged-in prices.");
})();
