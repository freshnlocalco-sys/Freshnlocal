import fs from "fs";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));
const dbId = "ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67";

async function run() {
  const projectId = config.projectId;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/products?pageSize=100&key=${config.apiKey}`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  if (!data.documents) {
     console.log("No documents found or error:", data);
     return;
  }
  
  const products = data.documents.map(d => {
     const fields = d.fields;
     return {
       name: fields.name?.stringValue,
       category: fields.category?.stringValue
     };
  });
  
  const imp = products.filter(p => (p.category || '').toLowerCase().includes("imported"));
  const exo = products.filter(p => (p.category || '').toLowerCase().includes("exotic"));
  
  console.log("IMPORTED VEG:");
  imp.forEach(p => console.log(p.name, p.category));
  
  console.log("EXOTIC VEG:");
  exo.forEach(p => console.log(p.name, p.category));
}
run();
