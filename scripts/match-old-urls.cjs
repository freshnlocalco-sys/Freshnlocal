const fs = require('fs');
const path = require('path');

const oldUrlsFile = path.join(__dirname, '../old_urls.txt');
const productsFile = path.join(__dirname, '../products_dump.json');

if (!fs.existsSync(oldUrlsFile)) {
  console.log('Error: Please provide the old URLs in "old_urls.txt" in the root directory.');
  process.exit(1);
}

const oldUrls = fs.readFileSync(oldUrlsFile, 'utf8').split('\n').filter(l => l.trim().length > 0);
const products = require(productsFile);

const confidentMatches = [];
const unmatched = [];

function cleanString(str) {
  // Replace hyphens and encoded spaces, remove typical quantity suffixes, and convert to lowercase
  return str.toLowerCase()
    .replace(/%20/g, ' ')
    .replace(/-/g, ' ')
    // Optional: Strip sizes like "250gm", "1kg", "500g", "1 dozen" - keeping it safe for now
    .replace(/\s+/g, ' ')
    .trim();
}

// Prepare products for matching
const searchSpace = products.map(p => ({
  ...p,
  searchName: cleanString(p.name)
}));

oldUrls.forEach(url => {
  // Expected format: /product/28988508/Portobello-Mushroom-250gm
  // Match the numeric ID and the slug
  const match = url.match(/\/product\/(\d+)\/([^/?#]+)/);
  if (!match) return; 
  
  const oldId = match[1];
  const rawSlug = match[2];
  const cleanedSlug = cleanString(rawSlug);
  
  // 1. Exact match on cleaned string
  let matchedProduct = searchSpace.find(p => p.searchName === cleanedSlug);
  
  // 2. Contains match: if the new name contains the old slug, or vice versa
  if (!matchedProduct) {
    matchedProduct = searchSpace.find(p => p.searchName.includes(cleanedSlug) || cleanedSlug.includes(p.searchName));
  }
  
  // 3. Word intersection match
  if (!matchedProduct) {
    const slugWords = cleanedSlug.split(' ').filter(w => w.length > 2);
    let bestMatch = null;
    let highestScore = 0;
    
    searchSpace.forEach(p => {
      let matchCount = 0;
      slugWords.forEach(w => {
        if (p.searchName.includes(w)) matchCount++;
      });
      const score = matchCount / slugWords.length;
      // Stricter matching: require higher overlap and prevent weird partial word matches like Mango -> Mangosteen
      if (score > highestScore && score >= 0.5) {
        // Prevent matching "mango" with "mangosteen" by ensuring whole words match if possible,
        // or just accept it if it's the best score. Let's stick to the score for now.
        let hasExactWordMatch = false;
        slugWords.forEach(w => {
           if (p.searchName.split(' ').includes(w)) hasExactWordMatch = true;
        });
        if (hasExactWordMatch) {
            highestScore = score;
            bestMatch = p;
        }
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
  } else {
    unmatched.push({
      oldUrl: url,
      oldId,
      slug: rawSlug,
      cleanedSlug
    });
  }
});

console.log('=== CONFIDENT MATCHES ===');
console.log(`Found ${confidentMatches.length} confident matches.`);

console.log('\n=== UNMATCHED URLs ===');
if (unmatched.length === 0) {
  console.log('All URLs matched successfully!');
} else {
  console.log(`Found ${unmatched.length} unmatched URLs:`);
  unmatched.forEach(u => {
    console.log(`- ID: ${u.oldId} | Slug: ${u.slug} | Cleaned: ${u.cleanedSlug}`);
  });
}

// Save the results for review
fs.writeFileSync(path.join(__dirname, '../match_results.json'), JSON.stringify({
  confidentMatches,
  unmatched
}, null, 2));

console.log('\nResults saved to match_results.json.');
