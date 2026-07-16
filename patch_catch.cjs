const fs = require('fs');

function patchFile(file) {
  let code = fs.readFileSync(file, 'utf8');
  
  code = code.replace(
    /if \(isInvalidKey \|\| !process\.env\.GEMINI_API_KEY\) \{/g,
    `const rawApiKey = process.env.GEMINI_API_KEY;
      const apiKey = rawApiKey ? rawApiKey.replace(/^["']|["']$/g, '').trim() : undefined;
      
      if (isInvalidKey || !apiKey) {`
  );
  
  code = code.replace(
    /!process\.env\.GEMINI_API_KEY/g,
    `!apiKey`
  );
  
  fs.writeFileSync(file, code);
}

patchFile('server.ts');
patchFile('api/gemini/recipe.ts');
