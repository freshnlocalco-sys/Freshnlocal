const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/gemini/recipe',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data}`);
  });
});

req.write(JSON.stringify({
  recipeName: 'test',
  catalog: ['apple']
}));
req.end();
