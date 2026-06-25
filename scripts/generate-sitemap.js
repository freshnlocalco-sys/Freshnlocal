import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import { writeFile, readFile, mkdir } from 'fs/promises';

async function generateSitemap() {
  console.log('Generating sitemap...');
  try {
    const configPath = new URL('../firebase-applet-config.json', import.meta.url);
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    
    const app = initializeApp(config);
    const db = initializeFirestore(app, {}, "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67");
    
    const productsRef = collection(db, 'products');
    const snapshot = await getDocs(productsRef);
    
    const products = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const baseUrl = 'https://freshnlocal.co';
    const staticRoutes = [
      '',
      '/shop',
      '/about',
      '/juice',
      '/returns'
    ];
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    for (const route of staticRoutes) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}${route}</loc>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>${route === '' ? '1.0' : '0.8'}</priority>\n`;
      xml += `  </url>\n`;
    }
    
    for (const product of products) {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/product/${product.id}</loc>\n`;
      if (product.updatedAt) {
        let dateStr = '';
        if (typeof product.updatedAt === 'number') {
           dateStr = new Date(product.updatedAt).toISOString();
        } else if (product.updatedAt.toDate) {
           dateStr = product.updatedAt.toDate().toISOString();
        }
        if (dateStr) {
           xml += `    <lastmod>${dateStr}</lastmod>\n`;
        }
      }
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }
    
    xml += `</urlset>`;
    
    const publicDir = new URL('../public', import.meta.url);
    try {
      await mkdir(publicDir, { recursive: true });
    } catch (e) {}
    
    const sitemapPath = new URL('../public/sitemap.xml', import.meta.url);
    await writeFile(sitemapPath, xml, 'utf8');
    
    console.log(`Successfully generated sitemap with ${staticRoutes.length} static routes and ${products.length} products.`);
    process.exit(0);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    process.exit(1);
  }
}

generateSitemap();
