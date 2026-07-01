const fs = require('fs');
const path = require('path');

const oldUrlsFile = path.join(__dirname, '../old_urls.txt');
const productsFile = path.join(__dirname, '../products_dump.json');
const vercelJsonPath = path.join(__dirname, '../vercel.json');

if (!fs.existsSync(oldUrlsFile)) {
  console.log('Error: Please provide the old URLs in "old_urls.txt" in the root directory.');
  process.exit(1);
}

const oldUrls = fs.readFileSync(oldUrlsFile, 'utf8').split('\n').filter(l => l.trim().length > 0);
const products = require(productsFile);
const vercelJson = require(vercelJsonPath);

const confidentMatches = [];
const unmatched = [];
const redirects = [];

// Manual overrides for specific slugs
const manualOverrides = {
  'imported-jumbo-strawberry-200gm': 'premium strawberry',
  'iceberg-lettuce-500gm': 'iceberg luttuce',
  'oyester-mushroom-200gm': 'oyster mushroom',
  'parsley-100-gm': 'parsley',
  'premium-gold-kesar-mango-1-kg': 'kesar mango',
  'button-mushroom-1pc': 'button mushrooms',
  'fresh-hand-peeled-sweet-corn-200-gm': 'sweet corn hand peeled',
  'moong-sprout-200-gm': 'moong sprouts',
  // Add more overrides here as needed
};

// Strict state/origin words that must be preserved or handled carefully
const strictModifiers = ['frozen', 'fresh', 'dried', 'ice', 'thai', 'turkish', 'imported', 'jumbo'];

function cleanString(str) {
  return str.toLowerCase()
    .replace(/%20/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const searchSpace = products.map(p => ({
  ...p,
  searchName: cleanString(p.name)
}));

oldUrls.forEach(url => {
  const match = url.match(/\/product\/(\d+)\/([^/?#]+)/);
  if (!match) return; 
  
  const oldId = match[1];
  const rawSlug = match[2];
  const cleanedSlug = cleanString(rawSlug);
  
  let matchedProduct = null;

  // 1. Check manual overrides first
  const overrideKey = rawSlug.toLowerCase();
  if (manualOverrides[overrideKey]) {
    const overrideName = cleanString(manualOverrides[overrideKey]);
    matchedProduct = searchSpace.find(p => p.searchName.includes(overrideName) || overrideName.includes(p.searchName));
  }

  if (!matchedProduct) {
    // 2. Exact match
    matchedProduct = searchSpace.find(p => p.searchName === cleanedSlug);
  }
  
  if (!matchedProduct) {
    // 3. Strict word intersection match
    const slugWords = cleanedSlug.split(' ').filter(w => w.length > 2 && !w.match(/^[0-9]+(gm|kg|g|pc)$/));
    let bestMatch = null;
    let highestScore = 0;
    
    searchSpace.forEach(p => {
      let matchCount = 0;
      let hasModifierMismatch = false;
      
      const newNameWords = p.searchName.split(' ');

      // Check for modifier mismatches
      strictModifiers.forEach(mod => {
        const inOld = slugWords.includes(mod) || cleanedSlug.includes(mod);
        const inNew = newNameWords.includes(mod) || p.searchName.includes(mod);
        
        if (inOld && !inNew) {
           // E.g. old was frozen, new is not
           // If it's "fresh", we might be okay mapping to a default, but to be strictly safe:
           hasModifierMismatch = true;
        }
        if (!inOld && inNew && mod === 'frozen') {
           // E.g. old was fresh/default, new is frozen
           hasModifierMismatch = true;
        }
      });

      if (hasModifierMismatch) return; // Skip this product if strict modifiers don't align

      slugWords.forEach(w => {
        if (newNameWords.includes(w)) matchCount++;
      });
      
      const score = matchCount / slugWords.length;
      
      // Require at least 66% of the significant words to match exactly
      if (score > highestScore && score >= 0.66) {
        highestScore = score;
        bestMatch = p;
      }
    });
    
    matchedProduct = bestMatch;
  }

  if (matchedProduct) {
    confidentMatches.push({
      oldUrl: url,
      oldId,
      slug: rawSlug,
      newId: matchedProduct.id,
      newName: matchedProduct.name
    });
    
    redirects.push({
      source: `/product/${oldId}/:slug`,
      destination: `/product/${matchedProduct.id}`,
      permanent: true
    });
  } else {
    unmatched.push({
      oldUrl: url,
      oldId,
      slug: rawSlug,
      cleanedSlug
    });
    
    // Default to /shop for uncertain/unmatched products
    redirects.push({
      source: `/product/${oldId}/:slug`,
      destination: `/shop`,
      permanent: true
    });
  }
});

console.log('=== CONFIDENT MATCHES ===');
confidentMatches.forEach(m => console.log(`${m.oldId} -> ${m.newName}`));

console.log('\n=== UNMATCHED URLs (Redirecting to /shop) ===');
unmatched.forEach(u => console.log(`${u.oldId} | ${u.slug}`));

// Filter out existing product redirects
vercelJson.redirects = vercelJson.redirects.filter(r => !r.source.startsWith('/product/'));

// Add new redirects at the top (after the other specific ones we added previously)
// Find index of the wildcard catch-all if it exists
let catchAllIndex = vercelJson.redirects.findIndex(r => r.source === '/(.*)');
if (catchAllIndex === -1) catchAllIndex = vercelJson.redirects.length;

// Insert product redirects just before the catch-all
vercelJson.redirects.splice(catchAllIndex, 0, ...redirects);

fs.writeFileSync(vercelJsonPath, JSON.stringify(vercelJson, null, 2));

console.log(`\nSuccessfully added ${redirects.length} product redirects to vercel.json!`);
