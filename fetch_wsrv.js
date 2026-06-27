async function test() {
  const url = "https://wsrv.nl/?url=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Ffreshnlocal-4a420.firebasestorage.app%2Fo%2Fproducts%252FbGB9vSpDbiqEndgmMS22%252Foriginal.webp%3Falt%3Dmedia%26token%3Da795a6c6-121e-4c83-9b36-5e39eae12032&w=400&output=webp&q=80";
  const res = await fetch(url);
  console.log(res.status, res.headers.get('content-type'));
}
test();
