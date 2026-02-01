/**
 * Cloudflare Worker: TikTok Trends Proxy
 *
 * Proxies requests to Apify TikTok Trends Scraper
 * Hides API token and caches results
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Correct input for the TikTok Trends Scraper
const SCRAPER_INPUT = {
  numberOfItems: 30,
  type: "hashtag",
  region: "US",
  resultsPerPage: 30,
  adsScrapeHashtags: true,
  adsCountryCode: "US",
  adsTimeRange: "7"
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Only handle /trends endpoint
    if (url.pathname !== '/trends') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    try {
      // Check cache first (skip if ?nocache=1)
      const skipCache = url.searchParams.get('nocache') === '1';
      const cache = caches.default;
      const cacheKey = new Request('https://cache.local/tiktok-trends-v3', { method: 'GET' });

      if (!skipCache) {
        let cachedResponse = await cache.match(cacheKey);

        if (cachedResponse) {
          console.log('Returning cached data');
          const data = await cachedResponse.json();
          return new Response(JSON.stringify(data), {
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'application/json',
              'X-Cache': 'HIT'
            }
          });
        }
      }

      console.log('Cache miss, fetching from Apify');

      // Fetch latest dataset from Apify
      const apifyUrl = `https://api.apify.com/v2/acts/${env.ACTOR_ID}/runs/last/dataset/items?token=${env.APIFY_TOKEN}`;

      const apifyResponse = await fetch(apifyUrl);

      if (!apifyResponse.ok) {
        // If no runs exist yet, try to start one
        if (apifyResponse.status === 404) {
          return await startNewRun(env);
        }
        throw new Error(`Apify API error: ${apifyResponse.status}`);
      }

      const rawData = await apifyResponse.json();

      // Check if we got data
      if (!rawData || rawData.length === 0) {
        throw new Error('No data returned from Apify');
      }

      // Transform to our format
      const trends = transformApifyData(rawData);

      // Create response
      const responseData = {
        success: true,
        trends: trends,
        count: trends.length,
        source: 'apify',
        timestamp: new Date().toISOString()
      };

      const response = new Response(JSON.stringify(responseData), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'X-Cache': 'MISS',
          'Cache-Control': `public, max-age=${env.CACHE_DURATION}`
        }
      });

      // Store in cache
      const cacheResponse = new Response(JSON.stringify(responseData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${env.CACHE_DURATION}`
        }
      });
      ctx.waitUntil(cache.put(cacheKey, cacheResponse));

      return response;

    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message,
        trends: []
      }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Start a new Apify run if no previous runs exist
async function startNewRun(env) {
  const runUrl = `https://api.apify.com/v2/acts/${env.ACTOR_ID}/runs?token=${env.APIFY_TOKEN}`;

  const runResponse = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(SCRAPER_INPUT)
  });

  if (!runResponse.ok) {
    throw new Error('Failed to start Apify run');
  }

  // Return message indicating scraper is starting
  return new Response(JSON.stringify({
    success: true,
    trends: [],
    message: 'Scraper started. Please refresh in 1-2 minutes.',
    timestamp: new Date().toISOString()
  }), {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json'
    }
  });
}

// Transform Apify data to our dashboard format
function transformApifyData(data) {
  let items = [];

  if (Array.isArray(data)) {
    items = data;
  } else if (data.hashtags) {
    items = data.hashtags;
  } else if (data.trends) {
    items = data.trends;
  }

  return items.slice(0, 30).map((item, index) => {
    // Extract hashtag name
    const hashtag = item.name || item.hashtag || item.title || item.challengeName;
    const cleanHashtag = hashtag.startsWith('#') ? hashtag : '#' + hashtag;

    // Use real data from Apify
    const videoCount = item.videoCount || 0;
    const viewCount = item.viewCount || 0;

    // Calculate growth from trendingHistogram if available
    let growth5h = 0;
    let growth24h = 0;
    let growth7d = 0;

    if (item.trendingHistogram && item.trendingHistogram.length > 0) {
      const histogram = item.trendingHistogram;
      const latest = histogram[histogram.length - 1]?.value || 0;
      const oldest = histogram[0]?.value || 0;

      if (oldest > 0) {
        growth7d = Math.round(((latest - oldest) / oldest) * 100);
      }

      // Estimate shorter timeframes based on rank change
      if (item.rankDiff) {
        growth24h = item.rankDiff * 10; // Rough estimate based on rank movement
        growth5h = Math.round(growth24h / 4);
      }
    }

    // Description from industry or generated
    const description = item.industryName
      ? `Trending in ${item.industryName}`
      : `Trending ${cleanHashtag} on TikTok`;

    // Keywords from hashtag name
    const tagName = cleanHashtag.replace(/^#/, '').toLowerCase();

    return {
      hashtag: cleanHashtag,
      views: viewCount || videoCount * 1000, // Estimate views from video count if not available
      videoCount: videoCount,
      growth5h: growth5h,
      growth24h: growth24h,
      growth7d: growth7d,
      description: description,
      keywords: [tagName],
      rank: item.rank || index + 1,
      rankDiff: item.rankDiff || 0,
      industry: item.industryName || null,
      url: item.url || `https://www.tiktok.com/tag/${tagName}`
    };
  });
}
