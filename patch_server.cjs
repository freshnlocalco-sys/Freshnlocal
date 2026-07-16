const fs = require('fs');
const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
`    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {`,
`    const apiKey = process.env.GEMINI_API_KEY;
    const keyExists = !!apiKey;
    const keyLength = apiKey ? apiKey.length : 0;
    const keyStart = apiKey ? apiKey.substring(0, 4) : 'none';
    console.log(\`[DEBUG] API Key Check: exists=\${keyExists}, length=\${keyLength}, startsWith=\${keyStart}\`);
    
    if (!apiKey) {`
);

fs.writeFileSync(file, code);
