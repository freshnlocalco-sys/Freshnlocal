const fs = require('fs');
let code = fs.readFileSync('src/pages/RecipeAI.tsx', 'utf8');

code = code.replace(
  '<p className="text-sm md:text-base text-muted-foreground max-w-lg mx-auto">Select the ingredients you have, and our AI chef will craft a delicious recipe for you instantly.</p>',
  '<p className="text-sm md:text-base text-muted-foreground max-w-lg mx-auto">{searchMode === "ingredients" ? "Select the ingredients you have, and our AI chef will craft a delicious recipe for you instantly." : "Search for a specific recipe by name, and we will provide the instructions and ingredients."}</p>'
);

code = code.replace(
  '<h2 className="text-base md:text-lg font-bold flex items-center gap-2">\n              <Utensils className="w-5 h-5 text-primary" />\n              What ingredients do you have?\n            </h2>',
  `            <div className="flex bg-secondary p-1 rounded-xl border border-border mb-6">
              <button
                onClick={() => setSearchMode('ingredients')}
                className={\`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all \${searchMode === 'ingredients' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}\`}
              >
                By Ingredients
              </button>
              <button
                onClick={() => setSearchMode('recipe')}
                className={\`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all \${searchMode === 'recipe' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}\`}
              >
                By Recipe Name
              </button>
            </div>
            {searchMode === 'ingredients' ? (
              <>
                <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-primary" />
                  What ingredients do you have?
                </h2>`
);

code = code.replace(
  'Search to find your ingredients\n              </p>\n            )}',
  `Search to find your ingredients
              </p>
            )}
            </>
            ) : (
              <>
                <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-primary" />
                  What recipe do you want to make?
                </h2>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={recipeNameQuery}
                    onChange={(e) => setRecipeNameQuery(e.target.value)}
                    placeholder="E.G. BUTTER CHICKEN, PASTA CARBONARA"
                    className="w-full bg-secondary border border-border rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/70 uppercase font-medium tracking-wide"
                  />
                  {recipeNameQuery && (
                    <button 
                      onClick={() => setRecipeNameQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5 rounded-full"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </>
            )}`
);

fs.writeFileSync('src/pages/RecipeAI.tsx', code);
