const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const FARSIDE_URLS = {
    bitcoin: 'https://farside.co.uk/bitcoin-etf-flow-all-data/',
    ethereum: 'https://farside.co.uk/ethereum-etf-flow-all-data/',
    solana: 'https://farside.co.uk/sol/'
};

async function scrapeETFData(page, url, type) {
    console.log(`Scraping ${type} ETF data from ${url}...`);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for the table to load
    await page.waitForSelector('table', { timeout: 30000 });

    // Extract data from the table
    const data = await page.evaluate(() => {
        const table = document.querySelector('table');
        if (!table) return null;

        const rows = table.querySelectorAll('tr');
        const headers = [];
        const records = [];

        // Get headers from first row
        const headerCells = rows[0]?.querySelectorAll('th, td');
        headerCells?.forEach(cell => {
            headers.push(cell.textContent.trim());
        });

        // Get data from remaining rows
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length === 0) continue;

            const record = {};
            cells.forEach((cell, index) => {
                const header = headers[index] || `col${index}`;
                let value = cell.textContent.trim();

                // Clean up the value - remove parentheses for negative numbers
                if (value.startsWith('(') && value.endsWith(')')) {
                    value = '-' + value.slice(1, -1);
                }

                record[header] = value;
            });

            // Only add if we have a date
            if (record[headers[0]]) {
                records.push(record);
            }
        }

        return { headers, records };
    });

    return data;
}

async function main() {
    console.log('Starting ETF data scrape...');
    console.log('Time:', new Date().toISOString());

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

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

        // Small delay between requests
        await new Promise(r => setTimeout(r, 2000));

        // Scrape Ethereum ETF data
        results.ethereum = await scrapeETFData(page, FARSIDE_URLS.ethereum, 'Ethereum');
        console.log(`Ethereum: ${results.ethereum?.records?.length || 0} records`);

        // Small delay between requests
        await new Promise(r => setTimeout(r, 2000));

        // Scrape Solana ETF data
        results.solana = await scrapeETFData(page, FARSIDE_URLS.solana, 'Solana');
        console.log(`Solana: ${results.solana?.records?.length || 0} records`);

    } catch (error) {
        console.error('Error scraping:', error.message);
    }

    await browser.close();

    // Calculate summary stats
    if (results.bitcoin?.records) {
        const btcRecords = results.bitcoin.records;
        const totalHeader = results.bitcoin.headers.find(h => h.toLowerCase().includes('total'));

        if (totalHeader && btcRecords.length > 0) {
            // Get last 7 days of data
            const last7Days = btcRecords.slice(0, 7);
            let weeklyFlow = 0;

            last7Days.forEach(record => {
                const val = record[totalHeader]?.replace(/[,$]/g, '');
                if (val && !isNaN(parseFloat(val))) {
                    weeklyFlow += parseFloat(val);
                }
            });

            results.bitcoinSummary = {
                latestDate: btcRecords[0]?.[results.bitcoin.headers[0]],
                latestFlow: btcRecords[0]?.[totalHeader],
                weeklyFlow: weeklyFlow.toFixed(1),
                totalRecords: btcRecords.length
            };
        }
    }

    if (results.ethereum?.records) {
        const ethRecords = results.ethereum.records;
        const totalHeader = results.ethereum.headers.find(h => h.toLowerCase().includes('total'));

        if (totalHeader && ethRecords.length > 0) {
            const last7Days = ethRecords.slice(0, 7);
            let weeklyFlow = 0;

            last7Days.forEach(record => {
                const val = record[totalHeader]?.replace(/[,$]/g, '');
                if (val && !isNaN(parseFloat(val))) {
                    weeklyFlow += parseFloat(val);
                }
            });

            results.ethereumSummary = {
                latestDate: ethRecords[0]?.[results.ethereum.headers[0]],
                latestFlow: ethRecords[0]?.[totalHeader],
                weeklyFlow: weeklyFlow.toFixed(1),
                totalRecords: ethRecords.length
            };
        }
    }

    if (results.solana?.records) {
        const solRecords = results.solana.records;
        const totalHeader = results.solana.headers.find(h => h.toLowerCase().includes('total'));

        if (totalHeader && solRecords.length > 0) {
            const last7Days = solRecords.slice(0, 7);
            let weeklyFlow = 0;

            last7Days.forEach(record => {
                const val = record[totalHeader]?.replace(/[,$]/g, '');
                if (val && !isNaN(parseFloat(val))) {
                    weeklyFlow += parseFloat(val);
                }
            });

            results.solanaSummary = {
                latestDate: solRecords[0]?.[results.solana.headers[0]],
                latestFlow: solRecords[0]?.[totalHeader],
                weeklyFlow: weeklyFlow.toFixed(1),
                totalRecords: solRecords.length
            };
        }
    }

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
