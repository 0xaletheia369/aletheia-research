# TikTok Trends Proxy Worker

Cloudflare Worker that proxies Apify TikTok Trends Scraper API calls.

## Setup

1. Install dependencies:
   ```bash
   cd worker
   npm install
   ```

2. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```

3. Deploy:
   ```bash
   npm run deploy
   ```

4. Note your worker URL (e.g., `https://tiktok-trends-proxy.YOUR_SUBDOMAIN.workers.dev`)

5. Update `docs/index.html` to use the worker URL.

## Local Development

```bash
npm run dev
```

## Endpoints

- `GET /trends` - Returns trending TikTok hashtags

## Environment Variables

Set in `wrangler.toml`:
- `APIFY_TOKEN` - Your Apify API token
- `ACTOR_ID` - The Apify actor ID (clockworks~tiktok-trends-scraper)
- `CACHE_DURATION` - Cache duration in seconds (default: 1800 = 30 min)
