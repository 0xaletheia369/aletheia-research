# Project Preferences

## Communication
- Call me "bro"
- Keep responses concise

## Workflow
- Suggest plan mode for complex tasks before starting
- Ask clarifying questions (using AskUserQuestion) before implementing when requirements are unclear
- Always push changes to GitHub after committing
- Suggest updates to CLAUDE.md when noticing patterns or preferences worth persisting
- NEVER use made up/hardcoded fallback data - always use real API data

## Technical Notes

### CORS Proxy for External APIs
When adding new external API integrations, **ALWAYS test CORS before deploying**. Many APIs don't have CORS headers and will fail on GitHub Pages.

**Checklist for new API integrations:**
1. Test API directly in browser console: `fetch('https://api.example.com/...').then(r => r.json())`
2. If CORS error → use `proxyUrlCodeTabs(url)`
3. Test proxy works: `curl -s "https://api.codetabs.com/v1/proxy/?quest=<encoded-url>"`
4. Deploy and verify on GitHub Pages

**Available proxies:**
- `proxyUrlCodeTabs(url)` - Reliable, use this for most APIs without CORS
- `proxyUrlAllOrigins(url)` - Backup, but fails with some APIs (e.g., Polymarket returns 520)

**Known API CORS status:**
| API | CORS | Proxy needed |
|-----|------|--------------|
| Polymarket Gamma (`gamma-api.polymarket.com`) | No | `proxyUrlCodeTabs()` |
| Polymarket CLOB (`clob.polymarket.com`) | Yes | None |
| DefiLlama (`api.llama.fi`) | Yes | None |
| Alternative.me (Fear & Greed) | Yes | None |
| Mobula | Yes | None |
| CoinGecko | Yes | None |
| Binance | Yes | None |
| FRED (`api.stlouisfed.org`) | No | `proxyUrlCodeTabs()` |
| NY Fed Markets (`markets.newyorkfed.org`) | Yes | None |
| DexScreener (`api.dexscreener.com`) | Unknown | Try direct first, fallback to proxy |
| RapidAPI TikTok Trending (`tiktok-trending-data.p.rapidapi.com`) | Yes | None (requires X-RapidAPI-Key header) |

### Common Harmless Errors
- `favicon.ico 404` - Normal if no favicon exists, doesn't affect functionality

---

## Recent Work

**Last session: Feb 1, 2026**

### Completed
- **Memes Tab + DexScreener + TikTok API** - Full integration:
  - Renamed TikTok tab to Memes
  - Real trending hashtags from RapidAPI TikTok Trending Data
  - DexScreener API integration to show related tokens for each trend
  - Filters for Solana and Base chains only, minimum $10K liquidity
  - Shows token symbol, price, 24h change, volume, liquidity, age
  - Lazy loading - fetches tokens when card is expanded
  - 15-minute cache for trends, 5-minute cache for tokens
  - Links directly to DexScreener for each token

- **Macro page** - Built out the full Macro tab with:
  - CPI inflation chart (YoY % from FRED API)
  - Unemployment rate chart (FRED API)
  - Fed Funds rate (NY Fed API - daily, more current than FRED)
  - Current value cards showing latest data
  - Combined/Inflation/Unemployment chart toggle tabs
  - Time period selectors (5Y, 10Y, 20Y)

- **Fed Decision chart** - Added Polymarket FOMC predictions:
  - Historical probability line chart from CLOB API
  - Tabs for March 18, April 29, June 17 meetings
  - Outcomes: No change, 25 bps decrease, 50+ bps decrease, rate increases
  - FT color palette, interactive legend

- **Homepage cleanup** - Removed Price tab (placeholder), updated all cards to show active pages

### Data Sources Added
- FRED API (requires API key: `fffc4b3857d7ee655a7dac83fd77b825`)
- NY Fed Markets API (no key needed)
- Polymarket CLOB API (historical prices)
- RapidAPI TikTok Trending Data (key in code)
- DexScreener API (no key needed)

### Next Steps / Ideas
- (Add future tasks here)
