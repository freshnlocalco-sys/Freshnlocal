const url = "https://firebasestorage.googleapis.com/v0/b/freshnlocal-4a420.firebasestorage.app/o/products%2FbGB9vSpDbiqEndgmMS22%2Foriginal.webp?alt=media&token=a795a6c6-121e-4c83-9b36-5e39eae12032";

const encodedUrl = encodeURIComponent(url);
const wsrvUrl = `https://wsrv.nl/?url=${encodedUrl}&w=400&output=webp&q=80`;
console.log(wsrvUrl);
