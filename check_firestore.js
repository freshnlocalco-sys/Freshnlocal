import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = config.projectId;
const apiKey = config.apiKey;

async function run() {
  const dbId = 'ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67';
  const url1 = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/settings/categoriesConfig?key=${apiKey}`;
  const res1 = await fetch(url1);
  const data1 = await res1.json();
  console.log("SETTINGS:", JSON.stringify(data1, null, 2));

  const url2 = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/products?pageSize=300&key=${apiKey}`;
  const res2 = await fetch(url2);
  const data2 = await res2.json();
  
  const products = data2.documents ? data2.documents.map(d => {
     const fields = d.fields;
     return {
       id: d.name.split('/').pop(),
       name: fields.name?.stringValue,
       category: fields.category?.stringValue
     };
  }) : [];
  
  const exotic = products.filter(p => p.category?.toLowerCase().includes('exotic'));
  const imported = products.filter(p => p.category?.toLowerCase().includes('imported'));
  
  if (data2.error) {
     console.log("PRODUCTS ERROR:", data2);
  }
  
  console.log("\nExotic Products:", exotic);
  console.log("Imported Products:", imported);
}
run();
