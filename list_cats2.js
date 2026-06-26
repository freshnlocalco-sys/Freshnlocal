import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = config.projectId;
const apiKey = config.apiKey;

async function run() {
  const dbId = 'ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents:runQuery?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'products' }]
      }
    })
  });
  const data = await res.json();
  const products = (Array.isArray(data) ? data : []).map(d => {
    if (!d.document) return null;
    return {
      name: d.document.fields.name?.stringValue,
      category: d.document.fields.category?.stringValue
    };
  }).filter(Boolean);
  
  const cats = new Set(products.map(p => p.category));
  console.log("Categories in use:", Array.from(cats));
  console.log("Exotic products:", products.filter(p => p.category?.toLowerCase().includes('exotic')));
}
run();
