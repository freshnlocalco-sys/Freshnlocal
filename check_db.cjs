const { Firestore } = require('@google-cloud/firestore');
const firestore = new Firestore({
    projectId: 'ai-studio-6ec7829e-2bd5-4dd4-9c99-1e64c572ed67'
});
async function main() {
    const q = await firestore.collection('products').where('name', '==', 'Juicy Red Cherry').get();
    q.forEach(doc => console.log(JSON.stringify(doc.data(), null, 2)));
}
main();
