const fs = require('fs');
const path = require('path');

// 1. Data needed from user
const oldProductsMappingFile = path.join(__dirname, '../old_products.json');

if (!fs.existsSync(oldProductsMappingFile)) {
  console.log('--- ACTION REQUIRED ---');
  console.log('Please create a file at "old_products.json" in the root directory.');
  console.log('It should contain an array of objects mapping old numeric IDs to product slugs or names.');
  console.log('Example:');
  console.log('[ { "oldId": "28988508", "slug": "Portobello-Mushroom-250gm" } ]');
  console.log('Or if you only have a CSV export, let the AI know and it can adapt this script to read CSV.');
  process.exit(1);
}

const oldProducts = require(oldProductsMappingFile);
const newProducts = require('../products_dump.json');
const vercelJsonPath = path.join(__dirname, '../vercel.json');
const vercelJson = require(vercelJsonPath);

const newRedirects = [];

oldProducts.forEach(old => {
  // Try to find the matching product in products_dump.json
  // We match by checking if the old slug is similar to the new name, or if you provided old name, we match that.
  let matchedProduct = null;

  if (old.slug) {
    const searchSlug = old.slug.toLowerCase().replace(/-/g, ' ');
    matchedProduct = newProducts.find(p => p.name.toLowerCase().replace(/[^a-z0-9]/g, ' ') === searchSlug);
    
    // Fuzzy fallback
    if (!matchedProduct) {
       matchedProduct = newProducts.find(p => {
          const newName = p.name.toLowerCase();
          return newName.includes(searchSlug.split(' ')[0]) && newName.includes(searchSlug.split(' ').pop());
       });
    }
  }

  if (matchedProduct) {
    newRedirects.push({
      source: `/product/${old.oldId}/:slug`,
      destination: `/product/${matchedProduct.id}`,
      permanent: true
    });
  } else {
    console.warn(`Could not find a match for old product: ${old.oldId} - ${old.slug}`);
    // Redirect to general shop if not found
    newRedirects.push({
      source: `/product/${old.oldId}/:slug`,
      destination: `/shop`,
      permanent: true
    });
  }
});

// Update vercel.json
// First, filter out existing product redirects to avoid duplicates
vercelJson.redirects = vercelJson.redirects.filter(r => !r.source.startsWith('/product/'));

// Add our new redirects at the top
vercelJson.redirects.unshift(...newRedirects);

fs.writeFileSync(vercelJsonPath, JSON.stringify(vercelJson, null, 2));
console.log(`Successfully added ${newRedirects.length} product redirects to vercel.json!`);

