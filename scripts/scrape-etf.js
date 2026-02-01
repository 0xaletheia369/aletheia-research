const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const FARSIDE_URLS = {
    bitcoin: 'https://farside.co.uk/bitcoin-etf-flow-all-data/',
    ethereum: 'https://farside.co.uk/ethereum-etf-flow-all-data/',
    solana: 'https://farside.co.uk/sol/'
};

async function scrapeETFData(page, url, type) {
    console.log(`\n========== Scraping ${type} ETF data ==========`);
    console.log(`URL: ${url}`);

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for page to fully render
        await new Promise(r => setTimeout(r, 5000));

        // Debug: log page title
        const title = await page.title();
        console.log(`Page title: ${title}`);

        // Check if we hit a Cloudflare challenge
        const content = await page.content();
        if (content.includes('challenge-platform') || content.includes('cf-browser-verification')) {
            console.log('Cloudflare challenge detected, waiting longer...');
            await new Promise(r => setTimeout(r, 15000));
        }

        // Extract data from the table with extensive debugging
        const data = await page.evaluate((etfType) => {
            const debugInfo = [];

            const tables = document.querySelectorAll('table');
            debugInfo.push(`Found ${tables.length} tables on page`);

            if (tables.length === 0) {
                return { error: 'No tables found', debugInfo };
            }

            // Find the largest table
            let bestTable = null;
            let maxRows = 0;
            tables.forEach((table, idx) => {
                const rows = table.querySelectorAll('tr');
                debugInfo.push(`Table ${idx}: ${rows.length} rows`);
                if (rows.length > maxRows) {
                    maxRows = rows.length;
                    bestTable = table;
                }
            });

            if (!bestTable) {
                return { error: 'No suitable table found', debugInfo };
            }

            const rows = bestTable.querySelectorAll('tr');
            debugInfo.push(`Using table with ${rows.length} rows`);

            // Log first 3 rows' HTML structure for debugging
            for (let i = 0; i < Math.min(3, rows.length); i++) {
                const row = rows[i];
                const ths = row.querySelectorAll('th').length;
                const tds = row.querySelectorAll('td').length;
                const cells = row.querySelectorAll('th, td');
                const cellTexts = Array.from(cells).slice(0, 5).map(c => c.textContent.trim().substring(0, 20));
                debugInfo.push(`Row ${i}: ${ths} th, ${tds} td, content: [${cellTexts.join(' | ')}]`);
            }

            // Determine header row - look for row with th elements or first row
            let headerRowIndex = 0;
            for (let i = 0; i < Math.min(5, rows.length); i++) {
                const ths = rows[i].querySelectorAll('th').length;
                if (ths > 2) { // Row with multiple th elements is likely headers
                    headerRowIndex = i;
                    break;
                }
            }
            debugInfo.push(`Header row index: ${headerRowIndex}`);

            // Extract headers
            const headers = [];
            const headerCells = rows[headerRowIndex]?.querySelectorAll('th, td');
            headerCells?.forEach((cell, idx) => {
                let text = cell.textContent.trim();
                // If empty, generate a name
                if (!text) {
                    text = idx === 0 ? 'Date' : `ETF_${idx}`;
                }
                headers.push(text);
            });
            debugInfo.push(`Headers (${headers.length}): ${headers.slice(0, 6).join(', ')}`);

            // Extract data rows
            const records = [];
            for (let i = headerRowIndex + 1; i < rows.length; i++) {
                const row = rows[i];
                const cells = row.querySelectorAll('th, td');

                if (cells.length === 0) continue;

                const record = {};
                let hasNumericData = false;

                cells.forEach((cell, index) => {
                    const header = headers[index] || `col_${index}`;
                    let value = cell.textContent.trim();

                    // Clean up negative numbers in parentheses
                    if (value.startsWith('(') && value.endsWith(')')) {
                        value = '-' + value.slice(1, -1);
                    }

                    // Check if we have numeric data (ETF flows are numbers)
                    if (index > 0 && /^-?[\d,.]+$/.test(value.replace(/\s/g, ''))) {
                        hasNumericData = true;
                    }

                    record[header] = value;
                });

                // Include row if it has a date-like first column OR has numeric data
                const firstCol = record[headers[0]] || '';
                const looksLikeDate = /\d/.test(firstCol) && /[a-zA-Z]/.test(firstCol); // Has both numbers and letters
                const looksLikeNumericDate = /^\d{1,2}[\/-]\d{1,2}/.test(firstCol);
                const isNotHeader = !/^(date|total)$/i.test(firstCol.trim());

                if ((looksLikeDate || looksLikeNumericDate || hasNumericData) && isNotHeader && firstCol.length > 0) {
                    records.push(record);
                }
            }

            debugInfo.push(`Parsed ${records.length} records`);

            // Log a sample record
            if (records.length > 0) {
                const sample = records[0];
                const sampleStr = Object.entries(sample).slice(0, 4).map(([k,v]) => `${k}:${v}`).join(', ');
                debugInfo.push(`Sample record: ${sampleStr}`);
            }

            return { headers, records, debugInfo };
        }, type);

        // Log debug info
        if (data.debugInfo) {
            data.debugInfo.forEach(msg => console.log(`  ${msg}`));
        }

        if (data.error) {
            console.log(`Error: ${data.error}`);
            return null;
        }

        console.log(`Result: ${data.records?.length || 0} records with ${data.headers?.length || 0} columns`);
        return { headers: data.headers, records: data.records };

    } catch (error) {
        console.error(`Error scraping ${type}:`, error.message);
        return null;
    }
}

async function main() {
    console.log('Starting ETF data scrape...');
    console.log('Time:', new Date().toISOString());

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

    const results = {
        lastUpdated: new Date().toISOString(),
        bitcoin: null,
        ethereum: null,
        solana: null
    };

    // Scrape each ETF type
    for (const [type, url] of Object.entries(FARSIDE_URLS)) {
        results[type] = await scrapeETFData(page, url, type.charAt(0).toUpperCase() + type.slice(1));
        // Delay between requests
        await new Promise(r => setTimeout(r, 5000));
    }

    await browser.close();

    // Calculate summary stats for each ETF type
    ['bitcoin', 'ethereum', 'solana'].forEach(type => {
        const etfData = results[type];
        if (etfData?.records?.length > 0) {
            const records = etfData.records;
            // Find the Total column (might be named differently)
            const totalHeader = etfData.headers.find(h =>
                h.toLowerCase().includes('total') ||
                h.toLowerCase() === 'net'
            ) || etfData.headers[etfData.headers.length - 1]; // Fallback to last column

            if (totalHeader) {
                // Get most recent records (data might be in reverse chronological order)
                const recentRecords = records.slice(0, 7);
                let weeklyFlow = 0;

                recentRecords.forEach(record => {
                    const val = record[totalHeader]?.toString().replace(/[,$\s]/g, '');
                    if (val && !isNaN(parseFloat(val))) {
                        weeklyFlow += parseFloat(val);
                    }
                });

                results[`${type}Summary`] = {
                    latestDate: records[0]?.[etfData.headers[0]],
                    latestFlow: records[0]?.[totalHeader],
                    weeklyFlow: weeklyFlow.toFixed(1),
                    totalRecords: records.length
                };
            }
        }
    });

    // Save to JSON file
    const outputPath = path.join(__dirname, '..', 'docs', 'data', 'etf-flows.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\nData saved to ${outputPath}`);

    // Log summary
    console.log('\n========== Summary ==========');
    console.log('Bitcoin:', results.bitcoinSummary || 'No data');
    console.log('Ethereum:', results.ethereumSummary || 'No data');
    console.log('Solana:', results.solanaSummary || 'No data');
}

main().catch(console.error);
