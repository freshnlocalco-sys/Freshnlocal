import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateMeta() {
  console.log('Generating pre-rendered HTML files for SEO...');
  try {
    const configPath = path.join(__dirname, '../firebase-applet-config.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    
    const app = initializeApp(config);
    const db = initializeFirestore(app, {
      experimentalForceLongPolling: true
    }, "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67");
    
    const productsRef = collection(db, 'products');
    const snapshot = await getDocs(productsRef);
    
    const products = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const distDir = path.join(__dirname, '../dist');
    const indexPath = path.join(distDir, 'index.html');
    
    let baseHtml = '';
    try {
      baseHtml = await readFile(indexPath, 'utf8');
    } catch (err) {
      console.error('dist/index.html not found. Run this script after vite build.');
      process.exit(1);
    }

    const baseUrl = 'https://www.freshnlocal.co';

    const writeHtml = async (route, title, description, canonical) => {
      // 1. replace title
      let html = baseHtml.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
      
      // 2. replace canonical
      if (html.includes('<link rel="canonical"')) {
        html = html.replace(/<link rel="canonical" href=".*?"\s*\/>/, `<link rel="canonical" href="${canonical}" />`);
      } else {
        html = html.replace('</head>', `  <link rel="canonical" href="${canonical}" />\n</head>`);
      }
      
      // 3. inject description
      if (html.includes('<meta name="description"')) {
        html = html.replace(/<meta name="description" content=".*?"\s*\/>/, `<meta name="description" content="${description}" />`);
      } else {
        html = html.replace('</head>', `  <meta name="description" content="${description}" />\n</head>`);
      }

      // write file
      let outDir = distDir;
      if (route) {
        outDir = path.join(distDir, route);
        await mkdir(outDir, { recursive: true });
      }
      const outPath = path.join(outDir, 'index.html');
      await writeFile(outPath, html, 'utf8');
    };

    // Static routes
    const staticRoutes = [
      { route: '', title: 'Fresh n Local Co. | Organic Produce Delivery', desc: 'Surat\'s premium organic delivery engine. Bringing fully vetted, hand-harvested fresh crops, local seasonal fruits, and premium exotics straight to your door.' },
      { route: 'shop', title: 'Shop All | Fresh N Local Co.', desc: 'Browse our complete catalog of organic fruits, vegetables, dry fruits, and more.' },
      { route: 'about', title: 'About Us | Fresh N Local Co.', desc: 'Learn about our mission to bring the freshest local organic produce to your table.' },
      { route: 'juice', title: 'Cold Pressed Juices | Fresh N Local Co.', desc: 'Freshly squeezed, 100% natural cold pressed juices delivered to your doorstep.' },
      { route: 'returns', title: 'Returns & Refunds | Fresh N Local Co.', desc: 'Information about our return and refund policies for a smooth shopping experience.' }
    ];

    for (const r of staticRoutes) {
      const canonical = r.route ? `${baseUrl}/${r.route}` : baseUrl;
      await writeHtml(r.route, r.title, r.desc, canonical);
    }

    // Product routes
    for (const product of products) {
      const route = `product/${product.id}`;
      const canonical = `${baseUrl}/${route}`;
      const title = `${product.name} - Buy Online | Fresh N Local`;
      const shortAttr = product.unit ? ` (${product.unit})` : '';
      const desc = `Buy ${product.name} online at best price in India on Fresh N Local Co.${shortAttr}`;
      
      await writeHtml(route, title, desc, canonical);
    }

    console.log(`Successfully generated metadata HTML for ${staticRoutes.length} static routes and ${products.length} products.`);
    process.exit(0);
  } catch (error) {
    console.error('Error generating meta:', error);
    process.exit(1);
  }
}

generateMeta();
