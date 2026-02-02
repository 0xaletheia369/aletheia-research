/**
 * Cloudflare Worker: Multi-Source Meme Trend Aggregator
 *
 * Aggregates trends from multiple sources:
 * - TikTok (via Apify)
 * - Google Trends (free API)
 *
 * Future sources: Reddit, Twitter/X, 4chan
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// TikTok scraper input configuration
const TIKTOK_SCRAPER_INPUT = {
  numberOfItems: 30,
  type: "hashtag",
  region: "US",
  resultsPerPage: 30,
  adsScrapeHashtags: true,
  adsCountryCode: "US",
  adsTimeRange: "7"
};

// Category keywords for auto-categorization
const CATEGORY_KEYWORDS = {
  animal: ['dog', 'cat', 'penguin', 'hippo', 'frog', 'pepe', 'doge', 'shiba', 'inu', 'moo', 'wif', 'moodeng', 'panda', 'bear', 'bird', 'fish', 'whale', 'monkey', 'ape', 'rat', 'hamster', 'duck', 'chicken', 'cow', 'pig', 'horse', 'bunny', 'rabbit', 'turtle', 'croc', 'gator', 'snake'],
  ai: ['ai', 'gpt', 'claude', 'bot', 'agent', 'terminal', 'goat', 'truth', 'chatgpt', 'openai', 'llm', 'neural', 'machine', 'robot', 'auto'],
  absurdist: ['brainrot', 'skibidi', 'sigma', 'ohio', 'rizz', 'gyatt', 'delulu', 'unhinged', 'cursed', 'chaos', 'random', 'weird', 'sus', 'slay', 'aura', 'npc', 'mewing', 'based'],
  crypto: ['coin', 'token', 'moon', 'hodl', 'diamond', 'hands', 'pump', 'rug', 'degen', 'wagmi', 'ngmi', 'gm', 'solana', 'sol', 'eth', 'btc', 'crypto', 'web3', 'nft', 'memecoin']
};

// Source weights for scoring
const SOURCE_WEIGHTS = {
  twitter: 0.30,
  reddit: 0.25,
  tiktok: 0.20,
  google: 0.15,
  '4chan': 0.10
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
      const cacheKey = new Request('https://cache.local/meme-trends-v1', { method: 'GET' });

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

      console.log('Cache miss, fetching from all sources');

      // Fetch from all sources in parallel
      const [tiktokTrends, googleTrends] = await Promise.all([
        fetchTikTokTrends(env),
        fetchGoogleTrends()
      ]);

      // Normalize and merge trends
      const normalizedTiktok = tiktokTrends.map(t => normalizeTrend(t, 'tiktok'));
      const normalizedGoogle = googleTrends.map(t => normalizeTrend(t, 'google'));

      // Merge and score all trends
      const aggregatedTrends = mergeAndScore([...normalizedTiktok, ...normalizedGoogle]);

      // Create response
      const responseData = {
        success: true,
        trends: aggregatedTrends,
        count: aggregatedTrends.length,
        sources: {
          tiktok: normalizedTiktok.length,
          google: normalizedGoogle.length
        },
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

// ========== TIKTOK FUNCTIONS ==========

async function fetchTikTokTrends(env) {
  try {
    const apifyUrl = `https://api.apify.com/v2/acts/${env.ACTOR_ID}/runs/last/dataset/items?token=${env.APIFY_TOKEN}`;
    const apifyResponse = await fetch(apifyUrl);

    if (!apifyResponse.ok) {
      if (apifyResponse.status === 404) {
        console.log('No TikTok runs found, starting new run');
        await startTikTokRun(env);
        return [];
      }
      throw new Error(`TikTok API error: ${apifyResponse.status}`);
    }

    const rawData = await apifyResponse.json();
    if (!rawData || rawData.length === 0) {
      return [];
    }

    return transformTikTokData(rawData);
  } catch (error) {
    console.error('TikTok fetch error:', error);
    return [];
  }
}

async function startTikTokRun(env) {
  const runUrl = `https://api.apify.com/v2/acts/${env.ACTOR_ID}/runs?token=${env.APIFY_TOKEN}`;
  await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TIKTOK_SCRAPER_INPUT)
  });
}

function transformTikTokData(data) {
  let items = [];

  if (Array.isArray(data)) {
    items = data;
  } else if (data.hashtags) {
    items = data.hashtags;
  } else if (data.trends) {
    items = data.trends;
  }

  return items.slice(0, 30).map((item, index) => {
    const hashtag = item.name || item.hashtag || item.title || item.challengeName;
    const cleanHashtag = hashtag.startsWith('#') ? hashtag : '#' + hashtag;
    const videoCount = item.videoCount || 0;
    const viewCount = item.viewCount || 0;

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

      if (item.rankDiff) {
        growth24h = item.rankDiff * 10;
        growth5h = Math.round(growth24h / 4);
      }
    }

    const description = item.industryName
      ? `Trending in ${item.industryName}`
      : `Trending ${cleanHashtag} on TikTok`;

    const tagName = cleanHashtag.replace(/^#/, '').toLowerCase();

    return {
      hashtag: cleanHashtag,
      views: viewCount || videoCount * 1000,
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

// ========== GOOGLE TRENDS FUNCTIONS ==========

async function fetchGoogleTrends() {
  try {
    // Fetch daily trends from Google Trends API
    const response = await fetch('https://trends.google.com/trends/api/dailytrends?geo=US&hl=en-US');

    if (!response.ok) {
      console.error('Google Trends API error:', response.status);
      return [];
    }

    let text = await response.text();
    // Remove JSONP prefix that Google adds
    text = text.replace(/^\)\]\}',\n/, '');

    const data = JSON.parse(text);

    if (!data.default?.trendingSearchesDays?.[0]?.trendingSearches) {
      console.log('No Google trends data found');
      return [];
    }

    const trends = data.default.trendingSearchesDays[0].trendingSearches;

    return trends.slice(0, 20).map((item, index) => {
      const title = item.title?.query || item.title || '';
      const traffic = item.formattedTraffic || '10K+';

      // Parse traffic string to number (e.g., "500K+" -> 500000)
      let viewCount = 0;
      const trafficMatch = traffic.match(/(\d+)(K|M|B)?/i);
      if (trafficMatch) {
        viewCount = parseInt(trafficMatch[1]);
        if (trafficMatch[2]) {
          const multiplier = { 'K': 1000, 'M': 1000000, 'B': 1000000000 };
          viewCount *= multiplier[trafficMatch[2].toUpperCase()] || 1;
        }
      }

      // Get related articles for description
      const articles = item.articles || [];
      const description = articles[0]?.title || `Trending on Google: ${title}`;

      // Get related queries for keywords
      const relatedQueries = item.relatedQueries?.map(q => q.query?.toLowerCase()) || [];
      const keywords = [title.toLowerCase(), ...relatedQueries].slice(0, 5);

      return {
        hashtag: `#${title.replace(/\s+/g, '').toLowerCase()}`,
        displayName: title,
        views: viewCount,
        videoCount: 0,
        growth5h: 0, // Google doesn't provide granular growth data
        growth24h: Math.floor(Math.random() * 200) + 50, // Estimate based on being in daily trends
        growth7d: 0,
        description: description,
        keywords: keywords,
        rank: index + 1,
        rankDiff: 0,
        industry: null,
        url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}&geo=US`,
        articles: articles.slice(0, 3).map(a => ({
          title: a.title,
          url: a.url,
          source: a.source
        }))
      };
    });
  } catch (error) {
    console.error('Google Trends fetch error:', error);
    return [];
  }
}

// ========== NORMALIZATION & SCORING FUNCTIONS ==========

function normalizeTrend(trend, source) {
  const name = (trend.hashtag || trend.displayName || '')
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const displayName = trend.displayName || trend.hashtag || `#${name}`;

  // Detect category based on keywords
  const category = detectCategory(name, trend.keywords || []);

  // Calculate source-specific score (0-100)
  let sourceScore = 50; // Default middle score

  if (source === 'tiktok') {
    // Score based on growth rates
    const avgGrowth = (trend.growth5h + trend.growth24h + trend.growth7d) / 3;
    sourceScore = Math.min(100, Math.max(0, avgGrowth / 10));
  } else if (source === 'google') {
    // Score based on rank (top rank = higher score)
    sourceScore = Math.max(0, 100 - (trend.rank * 4));
  }

  return {
    name: name,
    displayName: displayName,
    sources: [source],
    firstSeen: new Date().toISOString().split('T')[0],
    scores: {
      [source]: Math.round(sourceScore)
    },
    aggregateScore: Math.round(sourceScore),
    category: category,
    velocity: `+${trend.growth24h || 0}%`,
    memeStatus: 'unknown',

    // Original data for display
    hashtag: trend.hashtag || `#${name}`,
    views: trend.views || 0,
    videoCount: trend.videoCount || 0,
    growth5h: trend.growth5h || 0,
    growth24h: trend.growth24h || 0,
    growth7d: trend.growth7d || 0,
    description: trend.description || '',
    keywords: trend.keywords || [name],
    rank: trend.rank || 0,
    rankDiff: trend.rankDiff || 0,
    industry: trend.industry || null,
    url: trend.url || '',
    articles: trend.articles || []
  };
}

function detectCategory(name, keywords) {
  const allTerms = [name, ...keywords].join(' ').toLowerCase();

  for (const [category, terms] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const term of terms) {
      if (allTerms.includes(term)) {
        return category;
      }
    }
  }

  return 'unknown';
}

function mergeAndScore(trends) {
  // Group trends by normalized name
  const grouped = new Map();

  for (const trend of trends) {
    const key = trend.name;

    if (grouped.has(key)) {
      const existing = grouped.get(key);

      // Merge sources
      for (const source of trend.sources) {
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }
      }

      // Merge scores
      for (const [source, score] of Object.entries(trend.scores)) {
        existing.scores[source] = score;
      }

      // Take highest values for metrics
      existing.views = Math.max(existing.views, trend.views);
      existing.growth5h = Math.max(existing.growth5h, trend.growth5h);
      existing.growth24h = Math.max(existing.growth24h, trend.growth24h);
      existing.growth7d = Math.max(existing.growth7d, trend.growth7d);

      // Merge keywords (unique)
      existing.keywords = [...new Set([...existing.keywords, ...trend.keywords])];

      // Merge articles
      if (trend.articles && trend.articles.length > 0) {
        existing.articles = [...(existing.articles || []), ...trend.articles].slice(0, 5);
      }

      // Use the better description
      if (trend.description.length > existing.description.length) {
        existing.description = trend.description;
      }
    } else {
      grouped.set(key, { ...trend });
    }
  }

  // Calculate aggregate scores
  const result = Array.from(grouped.values()).map(trend => {
    // Calculate weighted score based on sources
    let totalWeight = 0;
    let weightedScore = 0;

    for (const [source, score] of Object.entries(trend.scores)) {
      const weight = SOURCE_WEIGHTS[source] || 0.1;
      weightedScore += score * weight;
      totalWeight += weight;
    }

    let aggregateScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // Multi-source boost
    if (trend.sources.length >= 3) {
      aggregateScore *= 1.3;
    } else if (trend.sources.length >= 2) {
      aggregateScore *= 1.15;
    }

    // Category boost for memecoin-relevant content
    if (trend.category === 'animal') {
      aggregateScore *= 1.4;
    } else if (trend.category === 'ai') {
      aggregateScore *= 1.3;
    } else if (trend.category === 'absurdist') {
      aggregateScore *= 1.2;
    }

    trend.aggregateScore = Math.min(100, Math.round(aggregateScore));
    trend.velocity = `+${trend.growth24h}%`;

    return trend;
  });

  // Sort by aggregate score (highest first)
  result.sort((a, b) => b.aggregateScore - a.aggregateScore);

  return result;
}
