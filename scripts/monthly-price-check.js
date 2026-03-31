const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const nodemailer = require('nodemailer');
puppeteer.use(StealthPlugin());

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY // Service key required to upload to Storage without RLS issues
);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

async function loginAntalis(page) {
    const email = process.env.ANTALIS_EMAIL;
    const password = process.env.ANTALIS_PASSWORD;
    if (!email || !password) {
        console.error("Missing ANTALIS_EMAIL or ANTALIS_PASSWORD!");
        return false;
    }

    console.log("Navigating to Antalis home to login...");
    await page.goto('https://www.antalis.es/eshop/', { waitUntil: 'networkidle2' });

    try {
        const cookieBtn = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
        if (cookieBtn) await cookieBtn.click();
        await new Promise(r => setTimeout(r, 1500));
    } catch (e) { /* no cookie banner */ }

    // Check if the login form is embedded on the page or if we need to navigate to it
    const hasLoginForm = await page.$('#usernameSurrogate').catch(() => null);

    if (!hasLoginForm) {
        console.log("Opening login dropdown and waiting for form...");
        // Click the login button and wait for either a form to appear or a navigation
        await Promise.all([
            page.evaluate(() => {
                const loginWrapper = document.querySelector('.header__login');
                if (loginWrapper) loginWrapper.click();
            }),
            // Wait for navigation OR for the form to appear (whichever comes first)
            Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {}),
                page.waitForSelector('#usernameSurrogate', { timeout: 8000 }).catch(() => {}),
            ])
        ]);
        await new Promise(r => setTimeout(r, 1000));
    }

    // Re-check for the form (might be on a new page now)
    const formExists = await page.$('#usernameSurrogate').catch(() => null);
    if (!formExists) {
        console.error("Could not find login form after clicking. Trying direct navigation to login page...");
        await page.goto('https://www.antalis.es/login', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log("Filling credentials...");
    // Use evaluate to fill fields safely (avoids context destruction errors)
    await page.evaluate((u, p) => {
        const userField = document.querySelector('#usernameSurrogate');
        const passField = document.querySelector('#password');
        if (userField) { userField.value = u; userField.dispatchEvent(new Event('input', { bubbles: true })); }
        if (passField) { passField.value = p; passField.dispatchEvent(new Event('input', { bubbles: true })); }
    }, email, password);

    await new Promise(r => setTimeout(r, 500));

    console.log("Submitting login form...");
    await Promise.all([
        page.evaluate(() => {
            const submitBtn = document.querySelector('button[type="submit"]') || document.querySelector('.login-form__submit');
            if (submitBtn) submitBtn.click();
            else {
                const passField = document.querySelector('#password');
                if (passField) passField.form && passField.form.submit();
            }
        }),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { })
    ]);

    await new Promise(r => setTimeout(r, 2000));

    const isLoggedIn = await page.evaluate(() => {
        // Check multiple indicators of a successful login
        const welcomeText = document.querySelector('.header__login-wellcom');
        const logoutLink = document.querySelector('a[href*="logout"]');
        const userMenu = document.querySelector('.header__user-name');
        if (welcomeText && !welcomeText.innerText.toLowerCase().includes('iniciar sesión')) return true;
        if (logoutLink) return true;
        if (userMenu) return true;
        return false;
    });

    return isLoggedIn;
}

async function scrapePrice(page, url) {
    if (!url) return null;
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
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

function formatPercentage(oldPrice, newPrice) {
    if (!oldPrice || oldPrice === 0) return 'Nuevo';
    if (oldPrice === newPrice) return '0%';
    const diff = ((newPrice - oldPrice) / oldPrice) * 100;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(2)}%`;
}

function getChangeColor(oldPrice, newPrice) {
    if (!oldPrice || oldPrice === 0) return '#6b7280'; // gray
    if (newPrice > oldPrice) return '#dc2626'; // red
    if (newPrice < oldPrice) return '#16a34a'; // green
    return '#6b7280'; // gray (no change)
}

(async () => {
    console.log("Starting Monthly Price Check Cron...");

    const { data: catalog, error } = await supabase.from('catalogo_papel').select('*');
    if (error) {
        console.error("Error fetching catalog:", error);
        process.exit(1);
    }

    console.log(`Found ${catalog.length} items. Starting browser...`);
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    const loggedIn = await loginAntalis(page);
    if (!loggedIn) {
        console.error("❌ Failed to log in to Antalis! Aborting scrape so we don't zero out prices.");
        await browser.close();
        process.exit(1);
    }
    console.log("✅ Logged in successfully! Now scraping prices...");

    let count = 0;
    const reportData = [];
    let priceHikes = 0;
    let priceDrops = 0;

    for (const item of catalog) {
        count++;
        console.log(`\n[${count}/${catalog.length}] Checking ${item.material} ${item.gramaje}g (${item.formato_libro})`);

        let newPaquetePrice = item.precio_hoja;
        let newPalletPrice = item.precio_hoja_pallet;

        if (item.url_paquete) {
            const price = await scrapePrice(page, item.url_paquete);
            if (price !== null) newPaquetePrice = parseFloat(price.toFixed(6));
        }

        if (item.url_pallet) {
            const price = await scrapePrice(page, item.url_pallet);
            if (price !== null) newPalletPrice = parseFloat(price.toFixed(6));
        }

        // Detect changes
        const paqueteChanged = newPaquetePrice !== item.precio_hoja;
        const palletChanged = newPalletPrice !== item.precio_hoja_pallet;

        if (paqueteChanged || palletChanged) {
            console.log(` -> Prices updated for ID ${item.id}`);

            // Tally metrics
            if (newPaquetePrice > (item.precio_hoja || 0)) priceHikes++;
            else if (newPaquetePrice < (item.precio_hoja || Infinity)) priceDrops++;

            // Update DB
            await supabase
                .from('catalogo_papel')
                .update({ precio_hoja: newPaquetePrice, precio_hoja_pallet: newPalletPrice })
                .eq('id', item.id);
        }

        reportData.push({
            id: item.id,
            name: `${item.material} ${item.gramaje}g (${item.formato_libro})`,
            oldPaquete: item.precio_hoja,
            newPaquete: newPaquetePrice,
            oldPallet: item.precio_hoja_pallet,
            newPallet: newPalletPrice,
            paqueteChanged,
            palletChanged
        });

        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("\nFinished scraping. Saving historical data...");

    // Insert snapshot into history tracking
    if (reportData.length > 0) {
        const historyRecords = reportData.map(item => ({
            id_papel: item.id,
            precio_paquete_registrado: item.newPaquete,
            precio_pallet_registrado: item.newPallet,
            // Postgres will default fecha_registro to now(), but we can pass it explicitly
            fecha_registro: new Date().toISOString()
        }));

        const { error: historyError } = await supabase.from('historial_precios_catalogo').insert(historyRecords);
        if (historyError) {
            console.error("❌ Failed to save historical data:", historyError);
        } else {
            console.log("✅ Historical data saved successfully.");
        }
    }

    console.log("Compiling Email Report...");

    // Only include items that actually had price changes to avoid a massive 49-row table,
    // unless you want the full catalog every time. Let's send the full catalog but sort by changes first.

    // Sort so changed items appear at the top
    reportData.sort((a, b) => {
        const aChanged = a.paqueteChanged || a.palletChanged ? 1 : 0;
        const bChanged = b.paqueteChanged || b.palletChanged ? 1 : 0;
        return bChanged - aChanged; // 1s first
    });

    const rowsHtml = reportData.map(item => {
        const paqColor = getChangeColor(item.oldPaquete, item.newPaquete);
        const palColor = getChangeColor(item.oldPallet, item.newPallet);
        const paqPerc = formatPercentage(item.oldPaquete, item.newPaquete);
        const palPerc = formatPercentage(item.oldPallet, item.newPallet);

        return `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px;">
                    ${item.name}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px; text-align: right;">
                    <div style="color: ${item.paqueteChanged ? paqColor : '#6b7280'}; font-weight: ${item.paqueteChanged ? 'bold' : 'normal'};">
                        ${item.newPaquete ? item.newPaquete.toFixed(5) + ' €' : '-'}
                        ${item.oldPaquete && item.paqueteChanged ? `<br><span style="font-size: 11px; opacity: 0.8;">(antes ${item.oldPaquete})</span>` : ''}
                    </div>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: right;">
                    <span style="color: ${paqColor}; font-weight: 600;">${item.paqueteChanged ? paqPerc : '-'}</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #111827; font-size: 14px; text-align: right;">
                    <div style="color: ${item.palletChanged ? palColor : '#6b7280'}; font-weight: ${item.palletChanged ? 'bold' : 'normal'};">
                        ${item.newPallet ? item.newPallet.toFixed(5) + ' €' : '-'}
                        ${item.oldPallet && item.palletChanged ? `<br><span style="font-size: 11px; opacity: 0.8;">(antes ${item.oldPallet})</span>` : ''}
                    </div>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; text-align: right;">
                    <span style="color: ${palColor}; font-weight: 600;">${item.palletChanged ? palPerc : '-'}</span>
                </td>
            </tr>
        `;
    }).join('');

    const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
            <div style="background-color: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #111827; margin-bottom: 8px; font-size: 24px;">Reporte Mensual de Precios Antalis</h1>
                    <p style="color: #6b7280; font-size: 15px; margin: 0;">Análisis automático a día ${new Date().toLocaleDateString('es-ES')}</p>
                </div>

                <div style="display: flex; gap: 20px; margin-bottom: 30px;">
                    <div style="flex: 1; background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center;">
                        <span style="display: block; font-size: 32px; font-weight: bold; color: #111827;">${catalog.length}</span>
                        <span style="color: #4b5563; font-size: 14px;">Papeles Analizados</span>
                    </div>
                    <div style="flex: 1; background-color: #fef2f2; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #fee2e2;">
                        <span style="display: block; font-size: 32px; font-weight: bold; color: #dc2626;">${priceHikes}</span>
                        <span style="color: #991b1b; font-size: 14px;">Subidas de Precio</span>
                    </div>
                    <div style="flex: 1; background-color: #f0fdf4; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #dcfce3;">
                        <span style="display: block; font-size: 32px; font-weight: bold; color: #16a34a;">${priceDrops}</span>
                        <span style="color: #166534; font-size: 14px;">Bajadas de Precio</span>
                    </div>
                </div>

                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="background-color: #f9fafb;">
                                <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; color: #4b5563; font-size: 12px; text-transform: uppercase;">Papel</th>
                                <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; color: #4b5563; font-size: 12px; text-transform: uppercase; text-align: right;">Precio Paquete/Hoja</th>
                                <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; color: #4b5563; font-size: 12px; text-transform: uppercase; text-align: right;">Variación</th>
                                <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; color: #4b5563; font-size: 12px; text-transform: uppercase; text-align: right;">Precio Pallet/Hoja</th>
                                <th style="padding: 12px; border-bottom: 2px solid #e5e7eb; color: #4b5563; font-size: 12px; text-transform: uppercase; text-align: right;">Variación</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
                
                <div style="margin-top: 30px; text-align: center; color: #9ca3af; font-size: 12px;">
                    <p>Este informe ha sido generado automáticamente por el robot de Printcolor.</p>
                </div>
            </div>
        </div>
    `;

    console.log("Sending email...");
    try {
        await transporter.sendMail({
            from: '"Printcolor Bot" <' + process.env.EMAIL_USER + '>',
            to: 'leo.merino@printcolorweb.com, produccion@printcolorweb.com',
            subject: `📊 Reporte Precios Antalis: ${priceHikes > 0 ? '⚠️ Han subido precios' : 'Sin subidas de precio'} (${new Date().toLocaleDateString('es-ES')})`,
            html: htmlContent,
        });
        console.log("✅ Report emailed successfully!");
    } catch (emailErr) {
        console.error("❌ Failed to send email:", emailErr);
    }

    console.log("Generating PDF report...");
    try {
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '30px', bottom: '30px', left: '20px', right: '20px' }
        });

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const fileName = `reporte_${year}-${month}.pdf`;

        console.log(`Uploading ${fileName} to Supabase...`);
        const { error: uploadError } = await supabase.storage.from('reportes_precios').upload(fileName, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true
        });

        if (uploadError) {
            console.error("❌ Failed to upload PDF:", uploadError);
        } else {
            console.log("✅ PDF generated and uploaded successfully!");
        }
    } catch (pdfErr) {
        console.error("❌ PDF generation failed (email was still sent):", pdfErr.message);
    } finally {
        if (browser) await browser.close();
    }

})();
