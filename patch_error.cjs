const fs = require('fs');

function patchFile(file) {
  let code = fs.readFileSync(file, 'utf8');
  
  code = code.replace(
    /const isInvalidKey = errMsg\.includes\('api key not valid'\) \|\| errMsg\.includes\('api_key_invalid'\) \|\| error\?\.status === 400 \|\| error\?\.status === 401;/g,
    `const isInvalidKey = errMsg.includes('api key not valid') || errMsg.includes('api_key_invalid') || error?.status === 401;`
  );
  
  code = code.replace(
    /if \(!isInvalidKey && !isCreditsDepleted && !isRateLimit && !isUnavailable\) \{/g,
    `if (!isInvalidKey) {`
  );
  
  fs.writeFileSync(file, code);
}

patchFile('server.ts');
patchFile('api/gemini/recipe.ts');
