import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChefHat, MessageSquare, Loader2, Heart, Send, Trash2, RotateCcw, ShoppingBag, HelpCircle } from 'lucide-react';
import { useProducts } from '../store/useProducts';
import { useCart, Product } from '../store/useCart';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { useAuth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: number;
  suggestedProducts?: Product[];
  isLoading?: boolean;
  error?: string | null;
}

const POPULAR_PROMPTS = [
  "🥑 Quick breakfast idea",
  "🥗 High-protein lunch",
  "🍰 Healthy dessert",
  "🌶️ Surat street food recipe"
];

export function RecipeAI() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  
  // State for Chat Messages
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'bot',
      text: "Hi! I'm **Freshi**, your personal AI chef and culinary assistant for **FreshNLocal.co**! 🥑\n\nI can help you:\n1. 🍳 **Suggest delicious recipes** or answer any food, grocery, and culinary questions.\n2. 🛒 **Recommend matching premium products** from our catalog in Surat that you can add to your cart immediately!\n\nWhat are we cooking today? Ask me any food-related questions!",
      timestamp: Date.now()
    }
  ]);
  
  const [chatInput, setChatInput] = useState('');
  const [savingMsgId, setSavingMsgId] = useState<string | null>(null);
  const [savedRecipeIds, setSavedRecipeIds] = useState<Record<string, string>>({}); // msgId -> savedDocId
  
  const { products } = useProducts();
  const addToCart = useCart(state => state.addItem);
  const { user } = useAuth();
  
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

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

  // Conversational sending function
  const handleSend = async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    // 1. Generate user message
    const userMsgId = 'user-' + Date.now();
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: trimmedText,
      timestamp: Date.now()
    };

    // 2. Generate temporary bot message (with loader)
    const botMsgId = 'bot-' + (Date.now() + 1);
    const tempBotMsg: ChatMessage = {
      id: botMsgId,
      sender: 'bot',
      text: '',
      timestamp: Date.now(),
      isLoading: true
    };

    // Update messages array
    setMessages(prev => [...prev, newUserMsg, tempBotMsg]);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const payload = { 
        catalog: availableProducts, 
        recipeName: trimmedText,
        products: []
      };

      const response = await fetch('/api/gemini/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      let data;
      try {
        const textResponse = await response.text();
        try {
          data = JSON.parse(textResponse);
        } catch(e) {
          throw new Error(`Server returned invalid JSON. Status: ${response.status}.`);
        }
      } catch(e: any) {
        throw new Error(e.message || "Invalid response format");
      }

      if (response.ok) {
        // Find matching products in store based on AI suggestions
        const suggestions: Product[] = [];
        if (data.suggestedProductNames && Array.isArray(data.suggestedProductNames)) {
          data.suggestedProductNames.forEach((name: string) => {
            const match = products.find(p => 
              p.name.toLowerCase().includes(name.toLowerCase()) || 
              name.toLowerCase().includes(p.name.toLowerCase())
            );
            if (match && !suggestions.find(s => s.id === match.id)) {
              suggestions.push(match);
            }
          });
        }

        setMessages(prev => prev.map(msg => {
          if (msg.id === botMsgId) {
            return {
              ...msg,
              isLoading: false,
              text: data.recipeMarkdown || data.text || "No recipe returned.",
              suggestedProducts: suggestions
            };
          }
          return msg;
        }));
      } else {
        setMessages(prev => prev.map(msg => {
          if (msg.id === botMsgId) {
            return {
              ...msg,
              isLoading: false,
              text: '',
              error: data.error || 'Oops! Something went wrong. Please try again.'
            };
          }
          return msg;
        }));
      }
    } catch (error: any) {
      const isAbort = error.name === 'AbortError';
      const friendlyError = isAbort 
        ? 'The request took too long and timed out. Please try again.' 
        : (error.message || 'Failed to connect to the recipe server. Please check your connection.');

      setMessages(prev => prev.map(msg => {
        if (msg.id === botMsgId) {
          return {
            ...msg,
            isLoading: false,
            text: '',
            error: friendlyError
          };
        }
        return msg;
      }));
    }
  };

  // Trigger search if coming from Home Search with "?q=..."
  const hasTriggeredRef = useRef(false);
  useEffect(() => {
    if (initialQuery && !hasTriggeredRef.current && availableProducts.length > 0) {
      hasTriggeredRef.current = true;
      // Clean query parameter from address bar
      setSearchParams({}, { replace: true });
      // Trigger search
      handleSend(initialQuery);
    }
  }, [initialQuery, availableProducts, setSearchParams]);

  // Form Submission
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const query = chatInput;
    setChatInput('');
    handleSend(query);
  };

  // Clear Chat History
  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'bot',
        text: "Hi! I'm **Freshi**, your personal AI chef and culinary assistant for **FreshNLocal.co**! 🥑\n\nI can help you:\n1. 🍳 **Suggest delicious recipes** or answer any food, grocery, and culinary questions.\n2. 🛒 **Recommend matching premium products** from our catalog in Surat that you can add to your cart immediately!\n\nWhat are we cooking today? Ask me any food-related questions!",
        timestamp: Date.now()
      }
    ]);
    setSavedRecipeIds({});
    toast.success('Chat history cleared!');
  };

  // Retry generating a specific message
  const handleRetry = async (botMsgId: string) => {
    const botIndex = messages.findIndex(m => m.id === botMsgId);
    if (botIndex <= 0) return;
    const userMsg = messages[botIndex - 1];
    if (userMsg.sender !== 'user') return;

    // Reset bot message to loading state and clear error
    setMessages(prev => prev.map(msg => {
      if (msg.id === botMsgId) {
        return { ...msg, isLoading: true, error: null, text: '' };
      }
      return msg;
    }));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const payload = { 
        catalog: availableProducts, 
        recipeName: userMsg.text,
        products: []
      };

      const response = await fetch('/api/gemini/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      let data;
      try {
        const textResponse = await response.text();
        try {
          data = JSON.parse(textResponse);
        } catch(e) {
          throw new Error(`Server returned invalid JSON. Status: ${response.status}.`);
        }
      } catch(e: any) {
        throw new Error(e.message || "Invalid response format");
      }

      if (response.ok) {
        const suggestions: Product[] = [];
        if (data.suggestedProductNames && Array.isArray(data.suggestedProductNames)) {
          data.suggestedProductNames.forEach((name: string) => {
            const match = products.find(p => 
              p.name.toLowerCase().includes(name.toLowerCase()) || 
              name.toLowerCase().includes(p.name.toLowerCase())
            );
            if (match && !suggestions.find(s => s.id === match.id)) {
              suggestions.push(match);
            }
          });
        }

        setMessages(prev => prev.map(msg => {
          if (msg.id === botMsgId) {
            return {
              ...msg,
              isLoading: false,
              text: data.recipeMarkdown || data.text,
              suggestedProducts: suggestions
            };
          }
          return msg;
        }));
      } else {
        setMessages(prev => prev.map(msg => {
          if (msg.id === botMsgId) {
            return {
              ...msg,
              isLoading: false,
              text: '',
              error: data.error || 'Oops! Something went wrong. Please try again.'
            };
          }
          return msg;
        }));
      }
    } catch (error: any) {
      const isAbort = error.name === 'AbortError';
      const friendlyError = isAbort 
        ? 'The request took too long and timed out. Please try again.' 
        : (error.message || 'Failed to connect to the recipe server. Please check your connection.');

      setMessages(prev => prev.map(msg => {
        if (msg.id === botMsgId) {
          return {
            ...msg,
            isLoading: false,
            text: '',
            error: friendlyError
          };
        }
        return msg;
      }));
    }
  };

  // Save recipe message to favorites
  const handleSaveRecipeMsg = async (msgId: string, recipeText: string) => {
    if (!user) {
      toast.error('Please log in to save recipes');
      return;
    }
    if (!recipeText) return;

    setSavingMsgId(msgId);
    try {
      const existingDocId = savedRecipeIds[msgId];
      if (existingDocId) {
        await deleteDoc(doc(db, 'users', user.uid, 'savedRecipes', existingDocId));
        setSavedRecipeIds(prev => {
          const updated = { ...prev };
          delete updated[msgId];
          return updated;
        });
        toast.success('Recipe removed from favorites');
      } else {
        const docRef = await addDoc(collection(db, 'users', user.uid, 'savedRecipes'), {
          recipeMarkdown: recipeText,
          createdAt: Date.now()
        });
        setSavedRecipeIds(prev => ({
          ...prev,
          [msgId]: docRef.id
        }));
        toast.success('Recipe saved to favorites!');
      }
    } catch (err) {
      handleFirestoreError(err, savedRecipeIds[msgId] ? OperationType.DELETE : OperationType.CREATE, 'users/savedRecipes');
      toast.error('Failed to save recipe');
    } finally {
      setSavingMsgId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-8 w-full flex-1 flex flex-col">
      <div className="text-center space-y-2 mb-6 shrink-0">
        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <ChefHat className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-foreground">FNL RECIPES</h1>
        <p className="text-xs md:text-sm text-muted-foreground max-w-lg mx-auto">
          Interactive culinary assistant powered by Freshi AI
        </p>
      </div>

      {/* Main Single Column Chat Container */}
      <div className="flex flex-col h-full bg-background border border-border shadow-sm rounded-2xl overflow-hidden flex-1 min-h-[500px] lg:h-[calc(100vh-230px)] lg:max-h-[800px]">
        
        {/* Chat Pane Header */}
        <div className="shrink-0 px-4 py-3 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-primary/20 shrink-0 bg-white shadow-xs">
              <img src="/freshi-icon.png?v=5" alt="Freshi" className="w-full h-full object-contain" />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-black uppercase tracking-wide text-foreground">Freshi Assistant</span>
                <span className="text-[9px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-md">SURAT</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Culinary & Grocery AI</p>
            </div>
          </div>
          
          <button
            onClick={handleClearChat}
            className="p-2 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-50/50 transition-colors"
            title="Clear Chat History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Chat Message Scrollable List */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-secondary/5 custom-scrollbar">
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const isBot = msg.sender === 'bot';
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 max-w-full ${isBot ? 'justify-start' : 'justify-end'}`}
                >
                  {/* Round Avatar for Bot */}
                  {isBot && (
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-primary/20 shrink-0 bg-white shadow-xs mt-1">
                      <img src="/freshi-icon.png?v=5" alt="Freshi" className="w-full h-full object-contain" />
                    </div>
                  )}

                  {/* Text Bubble */}
                  <div className={`relative max-w-[85%] rounded-2xl p-4 md:p-5 shadow-xs space-y-3 ${
                    isBot 
                      ? 'bg-card border border-border rounded-tl-none text-foreground' 
                      : 'bg-primary text-white rounded-tr-none font-medium'
                  }`}>
                    
                    {/* Favorite button for recipes inside Bot bubble */}
                    {isBot && msg.text && !msg.isLoading && !msg.error && (
                      <button
                        onClick={() => handleSaveRecipeMsg(msg.id, msg.text)}
                        disabled={savingMsgId === msg.id}
                        className={`absolute top-3 right-3 p-2 rounded-full transition-all border shrink-0 ${
                          savedRecipeIds[msg.id]
                            ? 'bg-primary text-white border-primary hover:bg-primary/95 shadow-sm'
                            : 'bg-secondary text-muted-foreground border-border hover:text-primary hover:border-primary/40'
                        }`}
                        title={savedRecipeIds[msg.id] ? "Remove from Favorites" : "Save to Favorites"}
                      >
                        {savingMsgId === msg.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Heart className={`w-3.5 h-3.5 ${savedRecipeIds[msg.id] ? 'fill-current' : ''}`} />
                        )}
                      </button>
                    )}

                    {/* Rendering loading indicator */}
                    {msg.isLoading && (
                      <div className="flex items-center space-x-2 py-2">
                        <div className="flex space-x-1">
                          <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs text-muted-foreground animate-pulse font-bold uppercase tracking-wider">Freshi is cooking a response...</span>
                      </div>
                    )}

                    {/* Rendering errors with Try Again trigger */}
                    {msg.error && (
                      <div className="space-y-3 py-1">
                        <p className="text-xs text-red-500 font-bold uppercase tracking-wider text-center">{msg.error}</p>
                        <button
                          onClick={() => handleRetry(msg.id)}
                          className="w-full flex items-center justify-center gap-1.5 bg-secondary hover:bg-primary/10 hover:text-primary text-foreground border border-border px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Try Again
                        </button>
                      </div>
                    )}

                    {/* Text message content */}
                    {msg.text && (
                      <div className={`markdown-body prose prose-sm md:prose-base max-w-none ${isBot ? 'prose-green text-foreground' : 'prose-invert text-white'}`}>
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    )}

                    {/* Interactive shopping cards inside Bot bubble */}
                    {isBot && msg.suggestedProducts && msg.suggestedProducts.length > 0 && (
                      <div className="pt-4 border-t border-border space-y-3 shrink-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Recommended Store Ingredients
                          </span>
                          <button
                            onClick={() => {
                              msg.suggestedProducts?.forEach(item => addToCart(item));
                              toast.success(`Added all recommendations to cart`);
                            }}
                            className="text-[10px] font-black text-primary uppercase tracking-wider hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            Add All to Cart →
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {msg.suggestedProducts.map(item => (
                            <div key={`${msg.id}-item-${item.id}`} className="flex items-center gap-3 p-2.5 rounded-xl border border-border/70 hover:border-primary/40 transition-all bg-secondary/15">
                              <div className="w-12 h-12 rounded-lg bg-white shrink-0 p-1 border border-border/40 flex items-center justify-center overflow-hidden">
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h5 className="text-[10px] font-black uppercase truncate text-foreground">{item.name}</h5>
                                <p className="text-[10px] font-bold text-primary mt-0.5">₹{item.price}</p>
                              </div>
                              <button
                                onClick={() => {
                                  addToCart(item);
                                  toast.success(`${item.name} added to cart`);
                                }}
                                className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors shrink-0 cursor-pointer"
                                title="Add to Cart"
                              >
                                <ShoppingBag className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className={`text-[9px] text-right mt-1.5 opacity-60 font-semibold ${isBot ? 'text-muted-foreground' : 'text-white'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Chat Input Bar Footer */}
        <div className="shrink-0 p-3 md:p-4 border-t border-border bg-card space-y-3">
          {/* Quick suggestions pill tags */}
          <div className="flex items-center gap-2 overflow-x-auto py-1 pr-1 scrollbar-none shrink-0">
            <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap">Try asking:</span>
            {POPULAR_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => handleSend(prompt.replace(/^[^a-zA-Z]*/, '').trim())}
                className="px-3 py-1 rounded-full border border-border bg-background text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors shrink-0"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Text Input Form */}
          <form onSubmit={handleFormSubmit} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask Freshi (e.g. 'How do I cook Avocado Toast?' or ask food questions)..."
              className="flex-1 bg-secondary border border-border/80 rounded-xl px-4 py-3 text-xs md:text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all text-foreground placeholder:text-muted-foreground/60 font-medium"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="bg-primary text-white px-4 md:px-5 py-3 rounded-xl hover:bg-primary/95 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm flex items-center justify-center shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4 md:w-4.5 md:h-4.5" />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
