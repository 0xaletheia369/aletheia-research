# Lessons Learned

Track patterns from corrections to prevent repeating mistakes.

## Format
```
### [Date] - [Brief Description]
**Mistake**: What went wrong
**Pattern**: The underlying cause
**Rule**: How to prevent it next time
```

---

## Lessons

### Feb 2, 2026 - Fallback Data
**Mistake**: Used hardcoded/made-up fallback data when API returned limited results
**Pattern**: Assumed some data is better than no data
**Rule**: NEVER use fake data. If API fails, show error. Real data only.

### Feb 2, 2026 - API Config
**Mistake**: Apify scraper returned only 1 result because `resultsPerPage: 1`
**Pattern**: Didn't verify API configuration parameters
**Rule**: Always check API input parameters match expected output quantity
