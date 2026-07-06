const http = require('http');
const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/gemini/recipe',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
});
req.on('error', console.error);
req.write(JSON.stringify({
  products: ['Apple'],
  catalog: ['Apple', 'Banana', 'Orange'],
  preferences: ['sweet']
}));
req.end();
