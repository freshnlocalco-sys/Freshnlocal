import React, { useState, useMemo } from 'react';
import { ChefHat, MessageSquare, Loader2, Utensils, Search, X, ShoppingBag, Heart } from 'lucide-react';
import { useProducts } from '../store/useProducts';
import { useCart, Product } from '../store/useCart';
import Markdown from 'react-markdown';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { useAuth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';


const POPULAR_RECIPES = [
  "Avocado Toast", "Banana Bread", "Butter Chicken", "Caesar Salad", "Chicken Curry", 
  "Chicken Tikka Masala", "Chocolate Chip Cookies", "French Toast", "Fruit Smoothie", 
  "Greek Salad", "Grilled Cheese", "Lemonade", "Margherita Pizza", "Oatmeal", 
  "Pancakes", "Paneer Butter Masala", "Pasta Carbonara", "Pesto Pasta", "Smoothie Bowl", 
  "Tomato Soup", "Vegetable Stir Fry", "Mango Lassi", "Chole Bhature", "Palak Paneer", 
  "Dal Makhani", "Biryani", "Mushroom Risotto", "Tacos", "Guacamole", "Sushi", "Sushi Rolls", 
  "Sweet and Sour Chicken", "Pad Thai", "Ramen", "Pho", "Fajitas", "Enchiladas", "Quesadillas", "Burritos",
  "Fried Rice", "Macaroni and Cheese", "Lasagna",
  "Clam Chowder", "French Onion Soup", "Caprese Salad",
  "Eggplant Parmesan", "Chicken Alfredo", "Shrimp Scampi", 
  "Chicken Noodle Soup", "Fish and Chips", "Chicken Pot Pie",
  "Baked Ziti", "Stuffed Peppers", "Roast Chicken",
  "Chicken Wings", "Nachos", "Spring Rolls", "Dumplings",
  "Teriyaki Chicken", "Katsu Curry", "Bibimbap", "Kimchi Fried Rice",
  "Falafel", "Shawarma", "Hummus", "Baba Ganoush", "Moussaka",
  "Paella", "Gazpacho", "Tortilla Española", "Croissants", "Quiche Lorraine",
  "Ratatouille", "Coq au Vin", "Crepes",
  "Waffles", "Eggs Benedict", "Shakshuka", "Huevos Rancheros", "Chilaquiles",
  "Tostadas", "Ceviche", "Empanadas", "Arepas", "Pupusas",
  "Tamales", "Pozole", "Carnitas",
  "Aloo Gobi", "Samosa", "Naan", "Matar Paneer", "Malai Kofta", "Rajma Chawal",
  "Kadai Paneer", "Masala Dosa", "Idli Sambar", "Pav Bhaji", "Pani Puri", "Vada Pav",
  "Aloo Tikki", "Paneer Tikka", "Chicken Korma", "Mutton Biryani", "Aloo Paratha",
  "Bhindi Masala", "Chana Masala", "Gulab Jamun", "Rasgulla", "Jalebi", "Kheer",
  "Prawn Masala", "Fish Curry", "Chicken Shawarma", "Tandoori Chicken", "Keema", "Mutton Curry",
  "Chicken 65", "Chicken Chettinad", "Chicken Manchurian", "Paneer Makhani", "Shahi Paneer",
  "Dal Tadka", "Jeera Rice", "Pulao", "Kashmiri Pulao", "Veg Biryani", "Egg Biryani",
  "Chicken Reshmi Kebab", "Chicken Seekh Kebab", "Paneer Bhurji", "Egg Curry", "Omelette",
  "Scrambled Eggs", "Boiled Eggs", "Egg Fried Rice", "Chicken Fried Rice", "Veg Noodles",
  "Chicken Noodles", "Hakka Noodles", "Chilli Chicken", "Chilli Paneer", "Gobi Manchurian",
  "Mushroom Chilli", "Baby Corn Manchurian", "Veg Manchurian", "Chicken Lollipops"
].sort();

export function RecipeAI() {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'ingredients' | 'recipe'>('ingredients');
  const [recipeNameQuery, setRecipeNameQuery] = useState('');
  const [recipe, setRecipe] = useState<string | null>(null);
  const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedItems, setSuggestedItems] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { products } = useProducts();
  const addToCart = useCart(state => state.addItem);
  const { user } = useAuth();

  const handleSaveRecipe = async () => {
    if (!user) {
      toast.error('Please log in to save recipes');
      return;
    }
    if (!recipe) return;

    setIsSaving(true);
    try {
      if (savedRecipeId) {
        await deleteDoc(doc(db, 'users', user.uid, 'savedRecipes', savedRecipeId));
        setSavedRecipeId(null);
        toast.success('Recipe removed from favorites');
      } else {
        const docRef = await addDoc(collection(db, 'users', user.uid, 'savedRecipes'), {
          recipeMarkdown: recipe,
          createdAt: Date.now()
        });
        setSavedRecipeId(docRef.id);
        toast.success('Recipe saved to favorites!');
      }
    } catch (err) {
      handleFirestoreError(err, savedRecipeId ? OperationType.DELETE : OperationType.CREATE, 'users/savedRecipes');
      toast.error('Failed to save recipe');
    } finally {
      setIsSaving(false);
    }
  };

  const filterCategories = ['Vegan', 'Quick', 'Dessert', 'Healthy'];

  const togglePreference = (pref: string) => {
    setSelectedPreferences(prev => 
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    );
  };

  // Filter to unique, available products that might be good for recipes
  const availableProducts = useMemo(() => {
    return products
      .filter(p => {
        const cat = p.category?.toLowerCase() || '';
        const name = p.name.toLowerCase();
        return !cat.includes('juice') && !cat.includes('fnl') && !name.includes('juice');
      })
      .map(p => p.name)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const queryParts = searchQuery.toLowerCase().trim().split(/\s+/);
    
    const matches = availableProducts.filter(p => {
      const pLower = p.toLowerCase();
      return queryParts.every(part => pLower.includes(part));
    });

    return matches.sort((a, b) => {
       const aLower = a.toLowerCase();
       const bLower = b.toLowerCase();
       const query = searchQuery.toLowerCase().trim();
       if (aLower === query && bLower !== query) return -1;
       if (bLower === query && aLower !== query) return 1;
       if (aLower.startsWith(query) && !bLower.startsWith(query)) return -1;
       if (bLower.startsWith(query) && !aLower.startsWith(query)) return 1;
       return 0;
    });
  }, [searchQuery, availableProducts]);

  const toggleProduct = (product: string) => {
    setSelectedProducts(prev =>
      prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]
    );
  };

  const getRecipe = async () => {
    if (searchMode === 'ingredients' && selectedProducts.length === 0) return;
    if (searchMode === 'recipe' && !recipeNameQuery.trim()) return;
    
    setIsLoading(true);
    setRecipe(null);
    setSavedRecipeId(null);
    setError(null);
    setSuggestedItems([]);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const payload: any = { catalog: availableProducts, preferences: selectedPreferences };
      if (searchMode === 'ingredients') {
        payload.products = selectedProducts;
      } else {
        payload.recipeName = recipeNameQuery.trim();
        payload.products = [];
      }

      const response = await fetch('/api/gemini/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      let data;
      try {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch(e) {
          throw new Error(`Server returned invalid JSON. Status: ${response.status}. Response: ${text.slice(0, 100)}...`);
        }
      } catch(e: any) {
        throw new Error(e.message || "Invalid response format");
      }

      if (response.ok) {
        setRecipe(data.recipeMarkdown || data.text);
        
        // Find matching products in store based on AI suggestions
        if (data.suggestedProductNames && Array.isArray(data.suggestedProductNames)) {
          const suggestions: Product[] = [];
          data.suggestedProductNames.forEach((name: string) => {
            const match = products.find(p => p.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name.toLowerCase()));
            // Only add if we found a match and it wasn't already selected by the user, and not already in suggestions
            if (match && !selectedProducts.includes(match.name) && !suggestions.find(s => s.id === match.id)) {
              suggestions.push(match);
            }
          });
          setSuggestedItems(suggestions);
        }
      } else {
        setError(data.error || 'Oops! Something went wrong. Please try again.');
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setError('The request took too long and timed out. Please try again.');
      } else {
        setError(error.message || 'Failed to connect to the recipe server. Please check your connection.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-12 w-full flex-1">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 md:space-y-8"
      >
        <div className="text-center space-y-3">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <ChefHat className="w-7 h-7 md:w-8 md:h-8 text-primary" />
          </div>
          <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-foreground">FNL RECIPES</h1>
          <p className="text-sm md:text-base text-muted-foreground max-w-lg mx-auto">{searchMode === "ingredients" ? "Select the ingredients you have, and our AI chef will craft a delicious recipe for you instantly." : "Search for a specific recipe by name, and we will provide the instructions and ingredients."}</p>
        </div>

        {!recipe && !isLoading && (
          <div className="bg-background border border-border shadow-sm rounded-2xl p-5 md:p-8 space-y-6">
                        <div className="flex bg-secondary p-1 rounded-xl border border-border mb-6">
              <button
                onClick={() => setSearchMode('ingredients')}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${searchMode === 'ingredients' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                By Ingredients
              </button>
              <button
                onClick={() => setSearchMode('recipe')}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${searchMode === 'recipe' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                By Recipe Name
              </button>
            </div>
            {searchMode === 'ingredients' ? (
              <>
                <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-primary" />
                  What ingredients do you have?
                </h2>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="SEARCH YOUR PRODUCTS"
                className="w-full bg-secondary border border-border rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/70 uppercase font-medium tracking-wide"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5 rounded-full"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>

            {selectedProducts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Selected:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedProducts.map(product => (
                    <button
                      key={product}
                      onClick={() => toggleProduct(product)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all bg-primary text-white border-primary shadow-sm flex items-center gap-1"
                    >
                      {product} <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchQuery.trim() && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Results:</p>
                <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                  {filteredProducts.map(product => {
                    if (selectedProducts.includes(product)) return null;
                    return (
                      <button
                        key={product}
                        onClick={() => toggleProduct(product)}
                        className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border bg-secondary text-foreground border-border hover:border-primary/50"
                      >
                        {product}
                      </button>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <p className="text-xs text-muted-foreground w-full py-4 text-center">
                      No matching products found.
                    </p>
                  )}
                </div>
              </div>
            )}

            {!searchQuery.trim() && selectedProducts.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4 uppercase font-semibold tracking-wider">
                Search to find your ingredients
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
                    placeholder="ENTER YOUR RECIPE NAME"
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
                {recipeNameQuery.trim() && (
                  <div className="mt-2 bg-background border border-border rounded-xl shadow-lg overflow-hidden max-h-[200px] overflow-y-auto custom-scrollbar">
                    {POPULAR_RECIPES
                      .filter(r => r.toLowerCase().includes(recipeNameQuery.toLowerCase()) && r.toLowerCase() !== recipeNameQuery.toLowerCase())
                      .sort((a, b) => {
                        const aLower = a.toLowerCase();
                        const bLower = b.toLowerCase();
                        const query = recipeNameQuery.toLowerCase();
                        if (aLower.startsWith(query) && !bLower.startsWith(query)) return -1;
                        if (bLower.startsWith(query) && !aLower.startsWith(query)) return 1;
                        return aLower.localeCompare(bLower);
                      })
                      .slice(0, 5)
                      .map(recipe => (
                      <button
                        key={recipe}
                        onClick={() => setRecipeNameQuery(recipe)}
                        className="w-full text-left px-4 py-3 text-sm hover:bg-secondary transition-colors uppercase font-medium tracking-wide border-b border-border/50 last:border-0"
                      >
                        {recipe}
                      </button>
                    ))}
                    {POPULAR_RECIPES.filter(r => r.toLowerCase().includes(recipeNameQuery.toLowerCase()) && r.toLowerCase() !== recipeNameQuery.toLowerCase()).length === 0 && (
                       <button
                         onClick={getRecipe}
                         className="w-full text-center px-4 py-3 text-sm text-primary uppercase font-bold tracking-wide hover:bg-secondary transition-colors"
                       >
                          Generate Custom Recipe: "{recipeNameQuery}"
                        </button>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="pt-2 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recipe Preferences (Optional):</p>
              <div className="flex flex-wrap gap-2">
                {filterCategories.map(pref => (
                  <button
                    key={pref}
                    onClick={() => togglePreference(pref)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${
                      selectedPreferences.includes(pref)
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-secondary text-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {pref}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={getRecipe}
              disabled={searchMode === "ingredients" ? selectedProducts.length === 0 : !recipeNameQuery.trim()}
              className={`w-full flex items-center justify-center gap-2 py-3.5 md:py-4 rounded-xl text-xs md:text-sm font-black uppercase tracking-widest transition-all shadow-sm mt-4 ${
                (searchMode === 'ingredients' ? selectedProducts.length > 0 : !!recipeNameQuery.trim())
                  ? 'bg-primary text-white hover:bg-primary/90 hover:scale-[1.01]'
                  : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-70'
              }`}
            >
              <MessageSquare className="w-4 h-4 md:w-5 md:h-5" />
              {(searchMode === 'ingredients' ? selectedProducts.length > 0 : !!recipeNameQuery.trim()) ? 'Generate Recipe' : (searchMode === 'ingredients' ? 'Select Ingredients' : 'Enter Recipe Name')}
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="text-sm uppercase font-bold tracking-widest text-muted-foreground animate-pulse">
              Crafting your recipe...
            </p>
          </div>
        )}

        {error && !isLoading && (
          <div className="bg-red-50 border border-red-100 shadow-sm rounded-2xl p-6 md:p-8 space-y-8 flex flex-col items-center">
            <p className="text-red-500 font-bold uppercase tracking-wider text-sm text-center">{error}</p>
            <button
              onClick={() => {
                setError(null);
              }}
              className="w-full bg-white text-foreground border border-border px-6 py-4 rounded-xl text-sm font-black uppercase tracking-wider hover:bg-primary/5 hover:border-primary/30 transition-colors mt-8"
            >
              Try Again
            </button>
          </div>
        )}

        {recipe && !isLoading && !error && (
          <div className="bg-background border border-border shadow-sm rounded-2xl p-6 md:p-8 space-y-8 relative overflow-hidden">
            <button
              onClick={handleSaveRecipe}
              disabled={isSaving}
              className={`absolute top-4 right-4 md:top-6 md:right-6 p-3 rounded-full transition-all flex items-center justify-center shadow-sm ${
                savedRecipeId 
                  ? 'bg-primary text-white border border-primary hover:bg-primary/90' 
                  : 'bg-secondary text-muted-foreground border border-border hover:text-primary hover:border-primary/50'
              }`}
              title={savedRecipeId ? "Remove from Favorites" : "Save to Favorites"}
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Heart className={`w-5 h-5 ${savedRecipeId ? 'fill-current' : ''}`} />
              )}
            </button>
            <div className="prose prose-sm md:prose-base prose-green max-w-none text-foreground font-sans mt-4">
              <Markdown>{recipe}</Markdown>
            </div>
            
            {selectedProducts.length > 0 && (
              <div className="pt-8 border-t border-border space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground text-center">
                  Required Ingredients
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedProducts.map(name => {
                    const item = products.find(p => p.name === name);
                    if (!item) return null;
                    return (
                      <div key={`req-${item.id}`} className="flex items-center gap-4 p-3 rounded-xl border border-border hover:border-primary/30 transition-colors bg-secondary/30">
                        <div className="w-16 h-16 rounded-lg bg-white shrink-0 p-2 border border-border/50">
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold uppercase truncate">{item.name}</h4>
                          <p className="text-xs font-medium text-primary mt-1">₹{item.price}</p>
                        </div>
                        <button 
                          onClick={() => {
                            addToCart(item);
                            toast.success(`${item.name} added to cart`);
                          }}
                          className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors shrink-0"
                        >
                          <ShoppingBag className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => {
                      suggestedItems.forEach(item => addToCart(item));
                      toast.success(`${suggestedItems.length} items added to cart`);
                    }}
                    className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full text-xs font-black uppercase tracking-wider hover:bg-primary/90 transition-all shadow-sm"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Add All Recommendations to Cart
                  </button>
                </div>
              </div>
            )}
            
            {suggestedItems.length > 0 && (
              <div className="pt-8 border-t border-border space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground text-center">
                  Recommended for this recipe
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {suggestedItems.map(item => (
                    <div key={item.id} className="flex items-center gap-4 p-3 rounded-xl border border-border hover:border-primary/30 transition-colors bg-secondary/30">
                      <div className="w-16 h-16 rounded-lg bg-white shrink-0 p-2 border border-border/50">
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold uppercase truncate">{item.name}</h4>
                        <p className="text-xs font-medium text-primary mt-1">₹{item.price}</p>
                      </div>
                      <button 
                        onClick={() => {
                          addToCart(item);
                          toast.success(`${item.name} added to cart`);
                        }}
                        className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors shrink-0"
                      >
                        <ShoppingBag className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => {
                      let count = 0;
                      if (selectedProducts.length > 0) {
                        selectedProducts.forEach(name => {
                          const item = products.find(p => p.name === name);
                          if (item) {
                            addToCart(item);
                            count++;
                          }
                        });
                      }
                      if (suggestedItems.length > 0) {
                        suggestedItems.forEach(item => {
                          addToCart(item);
                          count++;
                        });
                      }
                      toast.success(`${count} items added to cart`);
                    }}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-xl text-sm font-black uppercase tracking-wider hover:bg-primary/90 transition-all shadow-sm border border-primary/20"
                  >
                    <ShoppingBag className="w-5 h-5" />
                    Add All Items to Cart
                  </button>
                </div>
                
              </div>
            )}

            <button
              onClick={() => {
                setRecipe(null);
                setSavedRecipeId(null);
                setSelectedProducts([]);
                setSelectedPreferences([]);
                setSuggestedItems([]);
              }}
              className="w-full bg-secondary text-foreground border border-border px-6 py-4 rounded-xl text-sm font-black uppercase tracking-wider hover:bg-primary/5 hover:border-primary/30 transition-colors mt-8"
            >
              Create Another Recipe
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
