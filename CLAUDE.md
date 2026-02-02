# Project Preferences

## Communication
- Call me "bro"
- Keep responses concise

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## General Rules
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
