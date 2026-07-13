const config = require('./firebase-applet-config.json');

async function run() {
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/products?key=${config.apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  const cherry = data.documents.find(d => d.fields.name && d.fields.name.stringValue === 'Juicy Red Cherry');
  console.log(JSON.stringify(cherry, null, 2));
}
run();
