/**
 * Cloudflare Worker: Multi-Source Meme Trend Aggregator
 *
 * Aggregates trends from multiple sources:
 * - TikTok (via Apify)
 * - Google Trends (free RSS feed)
 * - Reddit (free JSON API)
 * - Twitter/X (via trends24.in scraping)
 *
 * Future sources: 4chan
 */

// Reddit subreddits to monitor for meme trends
const REDDIT_SUBREDDITS = [
  'memes',           // General meme culture
  'CryptoCurrency',  // Crypto community
  'CryptoMoonShots', // Early memecoin signals
  'wallstreetbets'   // Retail trading memes
];

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
      const cacheKey = new Request('https://cache.local/meme-trends-v3', { method: 'GET' });

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
      const [tiktokTrends, googleTrends, redditTrends, twitterTrends] = await Promise.all([
        fetchTikTokTrends(env),
        fetchGoogleTrends(),
        fetchRedditTrends(),
        fetchTwitterTrends()
      ]);

      // Normalize and merge trends
      const normalizedTiktok = tiktokTrends.map(t => normalizeTrend(t, 'tiktok'));
      const normalizedGoogle = googleTrends.map(t => normalizeTrend(t, 'google'));
      const normalizedReddit = redditTrends.map(t => normalizeTrend(t, 'reddit'));
      const normalizedTwitter = twitterTrends.map(t => normalizeTrend(t, 'twitter'));

      // Merge and score all trends
      const aggregatedTrends = mergeAndScore([...normalizedTiktok, ...normalizedGoogle, ...normalizedReddit, ...normalizedTwitter]);

      // Create response
      const responseData = {
        success: true,
        trends: aggregatedTrends,
        count: aggregatedTrends.length,
        sources: {
          tiktok: normalizedTiktok.length,
          google: normalizedGoogle.length,
          reddit: normalizedReddit.length,
          twitter: normalizedTwitter.length
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
    // Fetch daily trends from Google Trends RSS feed
    const response = await fetch('https://trends.google.com/trending/rss?geo=US');

    if (!response.ok) {
      console.error('Google Trends RSS error:', response.status);
      return [];
    }

    const text = await response.text();

    // Parse RSS XML manually (Cloudflare Workers don't have DOMParser)
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(text)) !== null && items.length < 20) {
      const itemXml = match[1];

      // Extract title
      const titleMatch = itemXml.match(/<title>([^<]*)<\/title>/);
      const title = titleMatch ? titleMatch[1].trim() : '';

      if (!title) continue;

      // Extract traffic estimate
      const trafficMatch = itemXml.match(/<ht:approx_traffic>([^<]*)<\/ht:approx_traffic>/);
      const traffic = trafficMatch ? trafficMatch[1] : '1K+';

      // Parse traffic string to number
      let viewCount = 0;
      const trafficNumMatch = traffic.match(/(\d+)(K|M|B)?/i);
      if (trafficNumMatch) {
        viewCount = parseInt(trafficNumMatch[1]);
        if (trafficNumMatch[2]) {
          const multiplier = { 'K': 1000, 'M': 1000000, 'B': 1000000000 };
          viewCount *= multiplier[trafficNumMatch[2].toUpperCase()] || 1;
        }
      }

      // Extract news item title for description
      const newsMatch = itemXml.match(/<ht:news_item_title>([^<]*)<\/ht:news_item_title>/);
      const newsTitle = newsMatch ? newsMatch[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '';

      // Extract news URL
      const newsUrlMatch = itemXml.match(/<ht:news_item_url>([^<]*)<\/ht:news_item_url>/);
      const newsUrl = newsUrlMatch ? newsUrlMatch[1] : '';

      // Extract news source
      const newsSourceMatch = itemXml.match(/<ht:news_item_source>([^<]*)<\/ht:news_item_source>/);
      const newsSource = newsSourceMatch ? newsSourceMatch[1] : '';

      const description = newsTitle || `Trending on Google: ${title}`;
      const keywords = title.toLowerCase().split(/\s+/).filter(w => w.length > 2);

      items.push({
        hashtag: `#${title.replace(/\s+/g, '').toLowerCase()}`,
        displayName: title,
        views: viewCount,
        videoCount: 0,
        growth5h: 0,
        growth24h: Math.min(500, Math.floor(viewCount / 1000) + 50), // Estimate based on traffic
        growth7d: 0,
        description: description,
        keywords: keywords.slice(0, 5),
        rank: items.length + 1,
        rankDiff: 0,
        industry: null,
        url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(title)}&geo=US`,
        articles: newsTitle ? [{
          title: newsTitle,
          url: newsUrl,
          source: newsSource
        }] : []
      });
    }

    console.log(`Parsed ${items.length} Google Trends from RSS`);
    return items;
  } catch (error) {
    console.error('Google Trends fetch error:', error);
    return [];
  }
}

// ========== REDDIT FUNCTIONS ==========

async function fetchRedditTrends() {
  try {
    // Fetch hot posts from multiple subreddits in parallel
    const subredditResults = await Promise.all(
      REDDIT_SUBREDDITS.map(sub => fetchSubredditPosts(sub))
    );

    // Flatten and combine results
    const allPosts = subredditResults.flat();

    // Group by title/topic to find cross-posted trends
    const trendMap = new Map();

    for (const post of allPosts) {
      // Normalize the title for grouping
      const normalizedTitle = normalizeRedditTitle(post.title);

      if (trendMap.has(normalizedTitle)) {
        const existing = trendMap.get(normalizedTitle);
        existing.score += post.score;
        existing.numComments += post.numComments;
        existing.subreddits.push(post.subreddit);
        if (post.score > existing.topPost.score) {
          existing.topPost = post;
        }
      } else {
        trendMap.set(normalizedTitle, {
          title: post.title,
          normalizedTitle: normalizedTitle,
          score: post.score,
          numComments: post.numComments,
          subreddits: [post.subreddit],
          topPost: post,
          createdUtc: post.createdUtc
        });
      }
    }

    // Convert to array and sort by combined score
    const trends = Array.from(trendMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((trend, index) => {
        const post = trend.topPost;

        // Extract keywords from title
        const keywords = extractKeywords(trend.title);

        // Calculate growth estimate based on score and age
        const ageHours = (Date.now() / 1000 - trend.createdUtc) / 3600;
        const scorePerHour = trend.score / Math.max(1, ageHours);
        const growth24h = Math.min(1000, Math.round(scorePerHour * 10));

        return {
          hashtag: `#${trend.normalizedTitle}`,
          displayName: trend.title.slice(0, 50) + (trend.title.length > 50 ? '...' : ''),
          views: trend.score * 100, // Rough estimate: 100 views per upvote
          videoCount: trend.numComments,
          growth5h: Math.round(growth24h / 5),
          growth24h: growth24h,
          growth7d: 0,
          description: `Trending on r/${trend.subreddits.join(', r/')} with ${trend.score.toLocaleString()} upvotes`,
          keywords: keywords,
          rank: index + 1,
          rankDiff: 0,
          industry: null,
          url: `https://reddit.com${post.permalink}`,
          subreddits: trend.subreddits,
          redditScore: trend.score,
          numComments: trend.numComments
        };
      });

    console.log(`Parsed ${trends.length} Reddit trends from ${REDDIT_SUBREDDITS.length} subreddits`);
    return trends;
  } catch (error) {
    console.error('Reddit fetch error:', error);
    return [];
  }
}

async function fetchSubredditPosts(subreddit) {
  try {
    // Use Reddit's JSON API (no auth needed for public data)
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MemeAggregator/1.0'
      }
    });

    if (!response.ok) {
      console.error(`Reddit API error for r/${subreddit}:`, response.status);
      return [];
    }

    const data = await response.json();

    if (!data.data?.children) {
      return [];
    }

    return data.data.children
      .filter(child => child.kind === 't3') // Only posts (t3)
      .map(child => child.data)
      .filter(post => {
        // Filter out stickied posts and very low score posts
        if (post.stickied) return false;
        if (post.score < 100) return false;
        return true;
      })
      .map(post => ({
        title: post.title,
        score: post.score,
        numComments: post.num_comments,
        subreddit: post.subreddit,
        permalink: post.permalink,
        createdUtc: post.created_utc,
        url: post.url,
        isVideo: post.is_video,
        thumbnail: post.thumbnail
      }));
  } catch (error) {
    console.error(`Error fetching r/${subreddit}:`, error);
    return [];
  }
}

function normalizeRedditTitle(title) {
  // Extract the main topic from a Reddit title
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, '')     // Remove spaces
    .slice(0, 30);           // Limit length for grouping
}

function extractKeywords(title) {
  // Extract meaningful keywords from Reddit title
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then', 'once', 'if', 'me', 'im', 'ive', 'dont', 'cant', 'wont', 'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'hadnt', 'doesnt', 'didnt', 'wouldnt', 'couldnt', 'shouldnt', 'mustnt', 'lets', 'thats', 'whos', 'whats', 'heres', 'theres', 'wheres', 'whens', 'whys', 'hows', 'because', 'as', 'until', 'while', 'although', 'though', 'after', 'before', 'when', 'whenever', 'where', 'wherever', 'whether', 'however', 'therefore', 'otherwise']);

  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 5);
}

// ========== TWITTER/X FUNCTIONS ==========

async function fetchTwitterTrends() {
  try {
    // Scrape trends from trends24.in (aggregates Twitter/X trending topics)
    const response = await fetch('https://trends24.in/united-states/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MemeAggregator/1.0)'
      }
    });

    if (!response.ok) {
      console.error('Trends24 error:', response.status);
      return [];
    }

    const html = await response.text();

    // Parse trend links from HTML
    // Format: <a href="https://twitter.com/search?q=TREND" class=trend-link>TREND</a>
    const trendRegex = /<a\s+href="https:\/\/twitter\.com\/search\?q=([^"]+)"\s+class=trend-link>([^<]+)<\/a>/g;
    const trends = new Map(); // Use Map to dedupe

    let match;
    while ((match = trendRegex.exec(html)) !== null) {
      const encodedQuery = match[1];
      const trendName = match[2].trim();

      // Skip if already seen (trends24 shows multiple time periods)
      if (trends.has(trendName.toLowerCase())) continue;

      // Decode URL-encoded query
      const decodedQuery = decodeURIComponent(encodedQuery);

      // Determine if it's a hashtag, cashtag, or regular trend
      const isHashtag = trendName.startsWith('#');
      const isCashtag = trendName.startsWith('$');

      trends.set(trendName.toLowerCase(), {
        name: trendName,
        query: decodedQuery,
        isHashtag,
        isCashtag
      });

      // Limit to top 30 unique trends
      if (trends.size >= 30) break;
    }

    // Convert to array and format
    const trendArray = Array.from(trends.values()).map((trend, index) => {
      const cleanName = trend.name.replace(/^[#$]/, '').toLowerCase();
      const keywords = cleanName.split(/\s+/).filter(w => w.length > 2);

      return {
        hashtag: trend.isHashtag ? trend.name : `#${cleanName.replace(/\s+/g, '')}`,
        displayName: trend.name,
        views: 0, // Twitter doesn't provide view counts via this method
        videoCount: 0,
        growth5h: 0,
        growth24h: Math.max(100, 200 - index * 5), // Estimate: higher rank = more growth
        growth7d: 0,
        description: `Trending on X: ${trend.name}`,
        keywords: keywords.length > 0 ? keywords : [cleanName],
        rank: index + 1,
        rankDiff: 0,
        industry: null,
        url: `https://twitter.com/search?q=${encodeURIComponent(trend.query)}`,
        isHashtag: trend.isHashtag,
        isCashtag: trend.isCashtag
      };
    });

    console.log(`Parsed ${trendArray.length} Twitter trends from trends24.in`);
    return trendArray;
  } catch (error) {
    console.error('Twitter trends fetch error:', error);
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
  } else if (source === 'reddit') {
    // Score based on Reddit score (upvotes) and cross-posting
    const redditScore = trend.redditScore || 0;
    const subredditCount = trend.subreddits?.length || 1;
    // Base score from upvotes (log scale)
    sourceScore = Math.min(100, Math.log10(redditScore + 1) * 20);
    // Boost for cross-posting to multiple subreddits
    sourceScore *= (1 + (subredditCount - 1) * 0.2);
    sourceScore = Math.min(100, sourceScore);
  } else if (source === 'twitter') {
    // Score based on rank (top trends score higher)
    sourceScore = Math.max(0, 100 - (trend.rank * 3));
    // Boost for cashtags (crypto-related) and hashtags
    if (trend.isCashtag) sourceScore *= 1.3;
    if (trend.isHashtag) sourceScore *= 1.1;
    sourceScore = Math.min(100, sourceScore);
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
