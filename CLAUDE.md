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
When adding new external API integrations, always check if CORS headers are present. Many APIs (like Polymarket) don't have CORS headers and will fail on GitHub Pages.

**Solution:** Use `proxyUrlAllOrigins(url)` for APIs without CORS support:
```javascript
const response = await fetch(proxyUrlAllOrigins(url));
```

APIs that need proxy: Polymarket (`gamma-api.polymarket.com`)
APIs that work directly: Alternative.me (Fear & Greed), DefiLlama
