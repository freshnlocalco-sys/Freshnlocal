import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
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
      id: d.document.name.split('/').pop(),
      name: d.document.fields.name?.stringValue,
      category: d.document.fields.category?.stringValue
    };
  }).filter(Boolean);
  
  let count = 0;
  for (const p of products) {
     if (p.category?.toLowerCase() === 'imported / super exotic vegetables') {
        const updateUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/products/${p.id}?updateMask.fieldPaths=category&key=${apiKey}`;
        const patchRes = await fetch(updateUrl, {
           method: 'PATCH',
           body: JSON.stringify({
             fields: { category: { stringValue: 'exotic vegetable' } }
           })
        });
        const patchData = await patchRes.json();
        if (patchData.error) {
           console.log("Error updating", p.name, patchData.error.message);
        } else {
           count++;
        }
     }
  }
  console.log(`Updated ${count} products to exotic vegetable!`);
}
run();
