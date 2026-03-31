/**
 * Quick test: check which tables exist in Supabase and try to create them if needed
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function main() {
    console.log('🔍 Checking existing tables...\n');

    // Try to query catalogo_papel
    const { data: cat, error: catErr } = await supabase.from('catalogo_papel').select('id').limit(1);
    console.log('catalogo_papel:', catErr ? `❌ ${catErr.message}` : `✅ exists (${cat.length} rows sampled)`);

    // Try to query historial_pedidos
    const { data: hist, error: histErr } = await supabase.from('historial_pedidos').select('id').limit(1);
    console.log('historial_pedidos:', histErr ? `❌ ${histErr.message}` : `✅ exists (${hist.length} rows sampled)`);

    // Check v1 tables too
    const tables = ['parent_sheet_types', 'catalog_papers', 'conversion_rules', 'order_calculations', 'price_reference', 'price_checks'];
    for (const t of tables) {
        const { error } = await supabase.from(t).select('id').limit(1);
        console.log(`${t}: ${error ? '❌ not found' : '✅ exists (v1)'}`);
    }
}

main().catch(console.error);
