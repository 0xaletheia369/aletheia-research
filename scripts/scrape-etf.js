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
    console.log(`Scraping ${type} ETF data from ${url}...`);

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait a bit for any JS to execute
        await new Promise(r => setTimeout(r, 3000));

        // Debug: log page title and check for Cloudflare
        const title = await page.title();
        console.log(`Page title: ${title}`);

        // Check if we hit a Cloudflare challenge
        const content = await page.content();
        if (content.includes('challenge-platform') || content.includes('cf-browser-verification')) {
            console.log('Cloudflare challenge detected, waiting longer...');
            await new Promise(r => setTimeout(r, 10000));
        }

        // Try to find table
        const hasTable = await page.$('table');
        if (!hasTable) {
            console.log('No table found on page');
            // Debug: log a snippet of page content
            const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500));
            console.log('Page content preview:', bodyText);
            return null;
        }

        // Extract data from the table
        const data = await page.evaluate(() => {
            const tables = document.querySelectorAll('table');
            // Find the largest table (most likely the data table)
            let bestTable = null;
            let maxRows = 0;

            tables.forEach(table => {
                const rows = table.querySelectorAll('tr');
                if (rows.length > maxRows) {
                    maxRows = rows.length;
                    bestTable = table;
                }
            });

            if (!bestTable) return null;

            const rows = bestTable.querySelectorAll('tr');
            const headers = [];
            const records = [];

            // Find header row (first row with th elements, or first row)
            let headerRowIndex = 0;
            for (let i = 0; i < Math.min(3, rows.length); i++) {
                if (rows[i].querySelectorAll('th').length > 0) {
                    headerRowIndex = i;
                    break;
                }
            }

            // Get headers - if empty, use column index as fallback
            const headerCells = rows[headerRowIndex]?.querySelectorAll('th, td');
            headerCells?.forEach((cell, idx) => {
                const text = cell.textContent.trim();
                // Use 'Date' for first column if empty, otherwise use index
                headers.push(text || (idx === 0 ? 'Date' : `col${idx}`));
            });

            // Get data from remaining rows
            for (let i = headerRowIndex + 1; i < rows.length; i++) {
                // Try td first, then th (some tables use th for first column)
                let cells = rows[i].querySelectorAll('td');
                if (cells.length === 0) {
                    cells = rows[i].querySelectorAll('th, td');
                }
                if (cells.length === 0) continue;

                const record = {};
                let hasData = false;
                let hasDateLikeValue = false;

                cells.forEach((cell, index) => {
                    const header = headers[index] || `col${index}`;
                    let value = cell.textContent.trim();

                    // Clean up the value - remove parentheses for negative numbers
                    if (value.startsWith('(') && value.endsWith(')')) {
                        value = '-' + value.slice(1, -1);
                    }

                    // Check if this looks like actual data (not empty or just whitespace)
                    if (value && value.length > 0 && value !== '-') {
                        hasData = true;
                    }

                    // Check if first column looks like a date (contains month name or numbers with separators)
                    if (index === 0 && value) {
                        const datePattern = /\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
                        const numericDate = /^\d{1,2}[\/-]\d{1,2}/;
                        if (datePattern.test(value) || numericDate.test(value)) {
                            hasDateLikeValue = true;
                        }
                    }

                    record[header] = value;
                });

                // Only add if we have actual data and first column has meaningful content
                const firstColValue = record[headers[0]];
                // Skip if first column is empty, just dashes, or looks like a header/total row
                const skipPatterns = /^(total|date|\s*-+\s*|)$/i;
                if (hasData && firstColValue && firstColValue.length > 0 && !skipPatterns.test(firstColValue)) {
                    records.push(record);
                }
            }

            return { headers, records, debug: { totalRows: rows.length, headerRowIndex } };
        });

        console.log(`Found ${data?.records?.length || 0} records with ${data?.headers?.length || 0} columns`);
        if (data?.debug) {
            console.log(`Debug: totalRows=${data.debug.totalRows}, headerRowIndex=${data.debug.headerRowIndex}`);
        }
        if (data?.headers) {
            console.log(`Headers: ${data.headers.slice(0, 5).join(', ')}...`);
        }
        if (data?.records?.length === 0 && data?.debug?.totalRows > 1) {
            // Log first few rows for debugging
            console.log('Warning: Table has rows but no records parsed');
        }
        return data;

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

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Set extra headers
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

    try {
        // Scrape Bitcoin ETF data
        results.bitcoin = await scrapeETFData(page, FARSIDE_URLS.bitcoin, 'Bitcoin');
        console.log(`Bitcoin: ${results.bitcoin?.records?.length || 0} records`);

        // Longer delay between requests
        await new Promise(r => setTimeout(r, 5000));

        // Scrape Ethereum ETF data
        results.ethereum = await scrapeETFData(page, FARSIDE_URLS.ethereum, 'Ethereum');
        console.log(`Ethereum: ${results.ethereum?.records?.length || 0} records`);

        // Longer delay between requests
        await new Promise(r => setTimeout(r, 5000));

        // Scrape Solana ETF data
        results.solana = await scrapeETFData(page, FARSIDE_URLS.solana, 'Solana');
        console.log(`Solana: ${results.solana?.records?.length || 0} records`);

    } catch (error) {
        console.error('Error scraping:', error.message);
    }

    await browser.close();

    // Calculate summary stats for each ETF type
    ['bitcoin', 'ethereum', 'solana'].forEach(type => {
        const etfData = results[type];
        if (etfData?.records?.length > 0) {
            const records = etfData.records;
            const totalHeader = etfData.headers.find(h => h.toLowerCase().includes('total'));

            if (totalHeader) {
                const last7Days = records.slice(0, 7);
                let weeklyFlow = 0;

                last7Days.forEach(record => {
                    const val = record[totalHeader]?.replace(/[,$]/g, '');
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
    console.log(`Data saved to ${outputPath}`);

    // Also log summary
    console.log('\n=== Summary ===');
    console.log('Bitcoin:', results.bitcoinSummary);
    console.log('Ethereum:', results.ethereumSummary);
    console.log('Solana:', results.solanaSummary);
}

main().catch(console.error);
