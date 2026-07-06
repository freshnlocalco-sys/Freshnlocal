const fs = require('fs');
let code = fs.readFileSync('src/pages/RecipeAI.tsx', 'utf8');

code = code.replace(
  /\n            <button\n              onClick={getRecipe}\n              disabled={searchMode === "ingredients" \? selectedProducts\.length === 0 : !recipeNameQuery\.trim\(\)}\n              className={`w-full flex items-center justify-center gap-2 py-3\.5 md:py-4 rounded-xl text-xs md:text-sm font-black uppercase tracking-widest transition-all shadow-sm mt-4 \${\n                selectedProducts\.length > 0\n                  \? 'bg-primary text-white hover:bg-primary\/90 hover:scale-\[1\.01\]'\n                  : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-70'\n              }`}\n            >\n              <MessageSquare className="w-4 h-4 md:w-5 md:h-5" \/>\n              {selectedProducts\.length > 0 \? 'Generate Recipe' : 'Select Ingredients'}\n            <\/button>/g,
  `
            <button
              onClick={getRecipe}
              disabled={searchMode === "ingredients" ? selectedProducts.length === 0 : !recipeNameQuery.trim()}
              className={\`w-full flex items-center justify-center gap-2 py-3.5 md:py-4 rounded-xl text-xs md:text-sm font-black uppercase tracking-widest transition-all shadow-sm mt-4 \${
                (searchMode === 'ingredients' ? selectedProducts.length > 0 : !!recipeNameQuery.trim())
                  ? 'bg-primary text-white hover:bg-primary/90 hover:scale-[1.01]'
                  : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-70'
              }\`}
            >
              <MessageSquare className="w-4 h-4 md:w-5 md:h-5" />
              {(searchMode === 'ingredients' ? selectedProducts.length > 0 : !!recipeNameQuery.trim()) ? 'Generate Recipe' : (searchMode === 'ingredients' ? 'Select Ingredients' : 'Enter Recipe Name')}
            </button>`
);

fs.writeFileSync('src/pages/RecipeAI.tsx', code);
