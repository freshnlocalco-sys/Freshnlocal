import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, doc, getDoc, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { generateMetaFeedXml } from '../../src/lib/metaFeedGenerator';

let dbInstance: any = null;

function getDb() {
  if (!dbInstance) {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    dbInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true
    }, firebaseConfig.firestoreDatabaseId || "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67");
  }
  return dbInstance;
}

// In-memory feed cache for edge / serverless instances (TTL: 10 minutes)
let cachedFeed: { xml: string; stats: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const startTime = Date.now();
  const forceRefresh = req.query?.force === 'true' || req.query?.refresh === 'true';

  try {
    const now = Date.now();
    let feedXml: string;
    let feedStats: any;

    if (!forceRefresh && cachedFeed && (now - cachedFeed.timestamp < CACHE_TTL_MS)) {
      feedXml = cachedFeed.xml;
      feedStats = { ...cachedFeed.stats, cached: true, cacheAgeSeconds: Math.round((now - cachedFeed.timestamp) / 1000) };
    } else {
      const db = getDb();

      // Fetch products and categories config concurrently
      const [productsSnapshot, categoriesConfigSnap] = await Promise.all([
        getDocs(collection(db, 'products')),
        getDoc(doc(db, 'settings', 'categoriesConfig')).catch(() => null)
      ]);

      const products = productsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const catData = categoriesConfigSnap && categoriesConfigSnap.exists() ? categoriesConfigSnap.data() : {};
      const customMappings = catData.metaCategoryMapping || {};

      const result = generateMetaFeedXml(products, {
        baseUrl: 'https://www.freshnlocal.co',
        brandName: 'Fresh N Local',
        currency: 'INR',
        feedTitle: 'Fresh N Local Meta Commerce Product Catalog',
        feedDescription: 'Real-time automated product catalog data feed for Meta Business Suite and Commerce Manager.',
        metaCategoryMapping: customMappings
      });

      feedXml = result.xml;
      feedStats = { ...result.stats, cached: false };

      // Update cache
      cachedFeed = {
        xml: feedXml,
        stats: feedStats,
        timestamp: now
      };
    }

    // Diagnostics mode if requested: ?diagnostics=true or ?format=json
    if (req.query?.diagnostics === 'true' || req.query?.format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        success: true,
        endpoint: 'https://www.freshnlocal.co/api/meta/catalog-feed.xml',
        executionTimeMs: Date.now() - startTime,
        feedStats
      });
    }

    // Standard Meta RSS 2.0 XML Feed Response
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('X-Catalog-Total-Items', String(feedStats.totalFeedItems));
    res.setHeader('X-Catalog-Active-Products', String(feedStats.activeIncludedProducts));
    res.setHeader('X-Catalog-Variants', String(feedStats.totalVariantsIncluded));

    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    return res.status(200).send(feedXml);
  } catch (error: any) {
    console.error('[META-CATALOG-FEED-ERROR]', error);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns="http://base.google.com/ns/1.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Fresh N Local Product Catalog Feed (Error)</title>
    <link>https://www.freshnlocal.co</link>
    <description>Catalog feed generation error: ${error?.message || 'Internal Server Error'}</description>
  </channel>
</rss>`);
  }
}
