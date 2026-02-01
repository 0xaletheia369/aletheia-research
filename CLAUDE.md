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
When adding new external API integrations, always check if CORS headers are present. Many APIs don't have CORS headers and will fail on GitHub Pages.

**Available proxies:**
- `proxyUrlAllOrigins(url)` - General purpose, but fails with some APIs
- `proxyUrlCodeTabs(url)` - More reliable, works with Polymarket

**Which proxy to use:**
- Polymarket (`gamma-api.polymarket.com`) → `proxyUrlCodeTabs()` (allorigins returns 520 error)
- DefiLlama → works directly (has CORS headers)
- Alternative.me (Fear & Greed) → works directly (has CORS headers)
