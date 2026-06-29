import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import { writeFile, readFile, mkdir } from 'fs/promises';

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.toString().replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

function escapeCsv(unsafe) {
  if (unsafe === undefined || unsafe === null) return '';
  const str = unsafe.toString();
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function generateFeed() {
  console.log('Generating product feed...');
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
    
    let totalProducts = products.length;
    let skippedProducts = 0;
    let includedProducts = 0;
    let skipReasons = {};
    let areImageUrlsHosted = true;

    // CSV Header
    const csvHeader = ['id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'brand', 'google_product_category', 'identifier_exists'];
    let csvContent = csvHeader.join(',') + '\n';

    // XML Header
    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xmlContent += `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n`;
    xmlContent += `  <channel>\n`;
    xmlContent += `    <title>Fresh N Local Product Feed</title>\n`;
    xmlContent += `    <link>https://freshnlocal.co</link>\n`;
    xmlContent += `    <description>Fresh N Local Product Feed</description>\n`;

    for (const product of products) {
      // Validate price and image
      if (product.price === undefined || product.price === null || product.price === '') {
        skippedProducts++;
        skipReasons[product.id] = 'Missing price';
        continue;
      }
      if (!product.imageUrl && !product.image) {
        skippedProducts++;
        skipReasons[product.id] = 'Missing image';
        continue;
      }

      const id = product.id;
      const title = product.name || '';
      if (!title) {
         console.warn(`Product ${id} missing name/title field.`);
      }
      const description = product.description || product.name || '';
      const availability = product.inStock !== false ? 'in stock' : 'out of stock';
      const condition = 'new';
      
      const sellingPriceValue = parseFloat(product.price) || 0;
      const mrpValue = parseFloat(product.originalPrice) || parseFloat(product.mrp) || parseFloat(product.MRP) || 0;

      let feedPrice = '';
      let feedSalePrice = '';

      if (mrpValue > sellingPriceValue) {
        feedPrice = `${mrpValue.toFixed(2)} INR`;
        feedSalePrice = `${sellingPriceValue.toFixed(2)} INR`;
      } else {
        feedPrice = `${sellingPriceValue.toFixed(2)} INR`;
        feedSalePrice = '';
      }

      const link = `${baseUrl}/product/${id}`;
      const image_link = product.imageUrl || product.image;
      const brand = 'Fresh N Local';
      const google_product_category = 'Food, Beverages & Tobacco > Food Items';
      const identifier_exists = 'no';

      if (typeof image_link === 'string' && !image_link.startsWith('https://')) {
         areImageUrlsHosted = false;
         console.warn(`FLAG: Product ${id} has a non-https image URL: ${image_link}`);
      } else if (typeof image_link !== 'string') {
         areImageUrlsHosted = false;
         console.warn(`FLAG: Product ${id} has an invalid image URL format.`);
      }

      // Check for missing fields according to Firestore model expectations
      const fieldsToCheck = ['name', 'description', 'price', 'imageUrl'];
      fieldsToCheck.forEach(field => {
        if (product[field] === undefined) {
           console.log(`Note: Product ${id} is missing field: ${field}`);
        }
      });

      // Add to CSV
      csvContent += [
        escapeCsv(id),
        escapeCsv(title),
        escapeCsv(description),
        escapeCsv(availability),
        escapeCsv(condition),
        escapeCsv(feedPrice),
        escapeCsv(feedSalePrice),
        escapeCsv(link),
        escapeCsv(image_link),
        escapeCsv(brand),
        escapeCsv(google_product_category),
        escapeCsv(identifier_exists)
      ].join(',') + '\n';

      // Add to XML
      xmlContent += `    <item>\n`;
      xmlContent += `      <g:id>${escapeXml(id)}</g:id>\n`;
      xmlContent += `      <g:title>${escapeXml(title)}</g:title>\n`;
      xmlContent += `      <g:description>${escapeXml(description)}</g:description>\n`;
      xmlContent += `      <g:availability>${escapeXml(availability)}</g:availability>\n`;
      xmlContent += `      <g:condition>${escapeXml(condition)}</g:condition>\n`;
      xmlContent += `      <g:price>${escapeXml(feedPrice)}</g:price>\n`;
      if (feedSalePrice) {
        xmlContent += `      <g:sale_price>${escapeXml(feedSalePrice)}</g:sale_price>\n`;
      }
      xmlContent += `      <g:link>${escapeXml(link)}</g:link>\n`;
      xmlContent += `      <g:image_link>${escapeXml(image_link)}</g:image_link>\n`;
      xmlContent += `      <g:brand>${escapeXml(brand)}</g:brand>\n`;
      xmlContent += `      <g:google_product_category>${escapeXml(google_product_category)}</g:google_product_category>\n`;
      xmlContent += `      <g:identifier_exists>${escapeXml(identifier_exists)}</g:identifier_exists>\n`;
      xmlContent += `    </item>\n`;

      includedProducts++;
    }

    xmlContent += `  </channel>\n`;
    xmlContent += `</rss>\n`;

    const publicDir = new URL('../public', import.meta.url);
    try {
      await mkdir(publicDir, { recursive: true });
    } catch (e) {}

    const csvPath = new URL('../public/product-feed.csv', import.meta.url);
    await writeFile(csvPath, csvContent, 'utf8');

    const xmlPath = new URL('../public/product-feed.xml', import.meta.url);
    await writeFile(xmlPath, xmlContent, 'utf8');

    console.log(`\n=== Feed Generation Summary ===`);
    console.log(`Total Products in DB: ${totalProducts}`);
    console.log(`Products Included: ${includedProducts}`);
    console.log(`Products Skipped: ${skippedProducts}`);
    if (skippedProducts > 0) {
       console.log(`Skip Reasons:`);
       Object.entries(skipReasons).forEach(([id, reason]) => {
          console.log(`  - ${id}: ${reason}`);
       });
    }
    console.log(`===============================`);
    if (!areImageUrlsHosted) {
        console.warn(`\nCRITICAL WARNING: Some image URLs are NOT fully hosted https URLs. They will be rejected by Merchant Center/Meta.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error generating feed:', error);
    process.exit(1);
  }
}

generateFeed();
