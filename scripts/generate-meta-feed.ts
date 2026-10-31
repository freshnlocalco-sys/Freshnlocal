import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { generateMetaFeedXml } from '../src/lib/metaFeedGenerator';

async function generateMetaFeed() {
  console.log('Generating Meta Business Suite catalog feed...');
  try {
    const configPath = new URL('../firebase-applet-config.json', import.meta.url);
    const config = JSON.parse(await readFile(configPath, 'utf8'));

    const app = initializeApp(config);
    const db = initializeFirestore(app, {
      experimentalForceLongPolling: true
    }, config.firestoreDatabaseId || "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67");

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

    const { xml, stats } = generateMetaFeedXml(products as any[], {
      baseUrl: 'https://www.freshnlocal.co',
      brandName: 'Fresh N Local',
      currency: 'INR',
      feedTitle: 'Fresh N Local Meta Commerce Product Catalog',
      feedDescription: 'Real-time automated product catalog data feed for Meta Business Suite and Commerce Manager.',
      metaCategoryMapping: customMappings
    });

    const publicDir = new URL('../public/api/meta', import.meta.url);
    await mkdir(publicDir, { recursive: true });

    const feedPath = new URL('../public/api/meta/catalog-feed.xml', import.meta.url);
    await writeFile(feedPath, xml, 'utf8');

    // Also write a root copy for alternate scheduled feed links
    const rootFeedPath = new URL('../public/meta-catalog-feed.xml', import.meta.url);
    await writeFile(rootFeedPath, xml, 'utf8');

    console.log(`\n=== Meta Catalog Feed Summary ===`);
    console.log(`Total Products in DB: ${stats.totalProductsInDb}`);
    console.log(`Active Base Products: ${stats.activeIncludedProducts}`);
    console.log(`Total Variant Items: ${stats.totalVariantsIncluded}`);
    console.log(`Total Feed Items: ${stats.totalFeedItems}`);
    console.log(`Skipped Products: ${stats.skippedProducts}`);
    console.log(`Output: public/api/meta/catalog-feed.xml (${(xml.length / 1024).toFixed(1)} KB)`);
    console.log(`=================================`);

    process.exit(0);
  } catch (error) {
    console.error('Error generating Meta catalog feed:', error);
    process.exit(1);
  }
}

generateMetaFeed();
