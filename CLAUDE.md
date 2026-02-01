# Project Preferences

## Communication
- Call me "bro"
- Keep responses concise

## Workflow
- Suggest plan mode for complex tasks before starting
- Ask clarifying questions (using AskUserQuestion) before implementing when requirements are unclear
- Always push changes to GitHub after committing
- Suggest updates to CLAUDE.md when noticing patterns or preferences worth persisting

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
| Polymarket (`gamma-api.polymarket.com`) | No | `proxyUrlCodeTabs()` |
| DefiLlama (`api.llama.fi`) | Yes | None |
| Alternative.me (Fear & Greed) | Yes | None |
| Mobula | Yes | None |
| CoinGecko | Yes | None |
| Binance | Yes | None |

### Common Harmless Errors
- `favicon.ico 404` - Normal if no favicon exists, doesn't affect functionality
