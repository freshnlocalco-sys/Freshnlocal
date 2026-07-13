async function run() {
  const url = `https://firestore.googleapis.com/v1/projects/ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67/databases/(default)/documents/products?pageSize=100`;
  const res = await fetch(url);
  const data = await res.json();
  const cherry = data.documents.find(d => d.fields.name && d.fields.name.stringValue === 'Juicy Red Cherry');
  console.log(JSON.stringify(cherry, null, 2));
}
run();
