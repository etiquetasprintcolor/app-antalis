const XLSX = require('xlsx');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'Hoja de cálculo sin título.xlsx');
console.log('Reading:', filePath);

const workbook = XLSX.readFile(filePath);
console.log('Sheet names:', workbook.SheetNames);

workbook.SheetNames.forEach(name => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Sheet: "${name}"`);
    console.log('='.repeat(60));
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    console.log(`Range: ${sheet['!ref']} (${range.e.r + 1} rows x ${range.e.c + 1} cols)\n`);

    // Print ALL rows
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    data.forEach((row, i) => {
        // Skip empty rows
        const hasContent = row.some(cell => cell !== '');
        if (hasContent) {
            console.log(`Row ${i}: ${JSON.stringify(row)}`);
        }
    });

    // Also show formulas if any
    console.log('\n--- Formulas ---');
    for (const cellRef in sheet) {
        if (cellRef.startsWith('!')) continue;
        const cell = sheet[cellRef];
        if (cell.f) {
            console.log(`${cellRef}: =${cell.f}  (value: ${cell.v})`);
        }
    }
});
