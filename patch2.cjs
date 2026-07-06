const fs = require('fs');
let code = fs.readFileSync('src/pages/RecipeAI.tsx', 'utf8');

code = code.replace(
  'disabled={selectedProducts.length === 0}',
  'disabled={searchMode === "ingredients" ? selectedProducts.length === 0 : !recipeNameQuery.trim()}'
);

fs.writeFileSync('src/pages/RecipeAI.tsx', code);
