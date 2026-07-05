import React, { useState, useMemo } from 'react';
import { ChefHat, MessageSquare, Loader2, Utensils, Search, X, ShoppingBag } from 'lucide-react';
import { useProducts } from '../store/useProducts';
import { useCart, Product } from '../store/useCart';
import Markdown from 'react-markdown';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';

export function RecipeAI() {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [recipe, setRecipe] = useState<string | null>(null);
  const [suggestedItems, setSuggestedItems] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { products } = useProducts();
  const addToCart = useCart(state => state.addItem);

  // Filter to unique, available products that might be good for recipes
  const availableProducts = useMemo(() => {
    return products
      .filter(p => !p.category?.toLowerCase().includes('juice'))
      .map(p => p.name)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return availableProducts.filter(p => p.toLowerCase().includes(query));
  }, [searchQuery, availableProducts]);

  const toggleProduct = (product: string) => {
    setSelectedProducts(prev =>
      prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]
    );
  };

  const getRecipe = async () => {
    if (selectedProducts.length === 0) return;
    
    setIsLoading(true);
    setRecipe(null);
    setSuggestedItems([]);
    
    try {
      const response = await fetch('/api/gemini/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: selectedProducts, catalog: availableProducts }),
      });
      
      const data = await response.json();
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
        setRecipe('Oops! Something went wrong. Please try again.');
      }
    } catch (error) {
      setRecipe('Failed to connect to the recipe server. Please check your connection.');
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
          <p className="text-sm md:text-base text-muted-foreground max-w-lg mx-auto">Select the ingredients you have, and our AI chef will craft a delicious recipe for you instantly.</p>
        </div>

        {!recipe && !isLoading && (
          <div className="bg-background border border-border shadow-sm rounded-2xl p-5 md:p-8 space-y-6">
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

            <button
              onClick={getRecipe}
              disabled={selectedProducts.length === 0}
              className={`w-full flex items-center justify-center gap-2 py-3.5 md:py-4 rounded-xl text-xs md:text-sm font-black uppercase tracking-widest transition-all shadow-sm mt-4 ${
                selectedProducts.length > 0
                  ? 'bg-primary text-white hover:bg-primary/90 hover:scale-[1.01]'
                  : 'bg-secondary text-muted-foreground cursor-not-allowed opacity-70'
              }`}
            >
              <MessageSquare className="w-4 h-4 md:w-5 md:h-5" />
              {selectedProducts.length > 0 ? 'Generate Recipe' : 'Select Ingredients'}
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

        {recipe && !isLoading && (
          <div className="bg-background border border-border shadow-sm rounded-2xl p-6 md:p-8 space-y-8">
            <div className="prose prose-sm md:prose-base prose-green max-w-none text-foreground font-sans">
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
              </div>
            )}

            <button
              onClick={() => {
                setRecipe(null);
                setSelectedProducts([]);
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
