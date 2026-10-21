import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, RotateCcw, Maximize2, Sparkles, ShoppingBag, Loader2, Bot, ChevronDown, MessageSquare } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import toast from 'react-hot-toast';
import { useProducts } from '../store/useProducts';
import { useCart, Product } from '../store/useCart';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: number;
  suggestedProducts?: Product[];
  isLoading?: boolean;
}

const QUICK_PROMPTS = [
  "🥑 Quick healthy breakfast",
  "🥗 High-protein dinner salad",
  "🥭 Sweet mango recipe",
  "🍲 Authentic Surat Undhiyu",
  "🥦 Low-calorie meal idea"
];

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  sender: 'bot',
  text: "Hi! I'm **Freshi**, your personal AI chef & fresh produce assistant for **FreshNLocal.co**! 🥑\n\nAsk me for delicious recipes, cooking tips, or ingredients you can prepare with our fresh harvest in Surat. What are we making today?",
  timestamp: Date.now()
};

export function FreshiFloatingChatbot() {
  const location = useLocation();
  const navigate = useNavigate();
  const { products } = useProducts();
  const { addItem, items } = useCart();

  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('fnl_floating_chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      // ignore
    }
    return [WELCOME_MESSAGE];
  });
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [imgError, setImgError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter available solid items for catalog recommendation
  const availableProductNames = useMemo(() => {
    return products
      .filter((p) => {
        const isOutOfStock = p.inStock === false || (typeof p.stock === 'number' && p.stock <= 0);
        if (isOutOfStock) return false;
        const cat = p.category?.toLowerCase() || '';
        const name = p.name.toLowerCase();
        if (cat.includes('juice') || cat.includes('fnl') || name.includes('juice')) return false;
        return true;
      })
      .map((p) => p.name);
  }, [products]);

  // Persist session messages
  useEffect(() => {
    try {
      sessionStorage.setItem('fnl_floating_chat_history', JSON.stringify(messages));
    } catch (e) {
      // ignore
    }
  }, [messages]);

  // Auto-scroll when messages update
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  // Don't render until client mount
  if (!mounted) return null;

  // Check if we should hide the chatbot
  // Hide strictly on admin routes and full-page /fnl-recipes
  const isHidden = 
    location.pathname.startsWith('/admin') ||
    location.pathname === '/fnl-recipes';

  if (isHidden) return null;

  // Check if sticky cart is visible to adjust bottom offset
  const validItems = items.filter((item) => item && item.product && item.quantity > 0);
  const isCartActive = validItems.length > 0 && location.pathname !== '/cart' && location.pathname !== '/checkout';

  const handleSendMessage = async (textToSend?: string) => {
    const queryText = (textToSend || inputText).trim();
    if (!queryText || isTyping) return;

    setInputText('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: Date.now()
    };

    const tempBotMsgId = `bot-${Date.now()}`;
    const placeholderBotMsg: ChatMessage = {
      id: tempBotMsgId,
      sender: 'bot',
      text: '',
      timestamp: Date.now(),
      isLoading: true
    };

    setMessages((prev) => [...prev, userMsg, placeholderBotMsg]);
    setIsTyping(true);

    try {
      const historyContext = messages
        .filter((m) => m.id !== 'welcome' && !m.isLoading && m.text)
        .slice(-6)
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model',
          text: m.text
        }));

      const payload = {
        catalog: availableProductNames,
        recipeName: queryText,
        products: [],
        history: historyContext
      };

      const res = await fetch('/api/gemini/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Failed to generate recipe (${res.status})`);
      }

      const data = await res.json();
      const botResponseText = data.recipeMarkdown || data.text || "Here's what I recommend for you!";

      // Match suggested products
      const suggestions: Product[] = [];
      if (Array.isArray(data.suggestedProductNames)) {
        data.suggestedProductNames.forEach((name: string) => {
          const match = products.find((p) => {
            const isOutOfStock = p.inStock === false || (typeof p.stock === 'number' && p.stock <= 0);
            if (isOutOfStock) return false;
            const cat = p.category?.toLowerCase() || '';
            const pName = p.name.toLowerCase();
            if (cat.includes('juice') || cat.includes('fnl') || pName.includes('juice')) return false;
            return p.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name.toLowerCase());
          });
          if (match && !suggestions.some((s) => s.id === match.id)) {
            suggestions.push(match);
          }
        });
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempBotMsgId
            ? {
                ...m,
                text: botResponseText,
                isLoading: false,
                suggestedProducts: suggestions
              }
            : m
        )
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempBotMsgId
            ? {
                ...m,
                text: "Sorry, I couldn't reach the AI assistant right now. Please try asking again in a moment!",
                isLoading: false
              }
            : m
        )
      );
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    toast.success('Chat restarted! 🥑');
  };

  const handleAddToCart = (product: Product) => {
    addItem(product, 1);
    toast.success(
      <span>
        Added <b>{product.name}</b> to cart! 🛒
      </span>
    );
  };

  // Bottom position calculations (always above sticky cart if active)
  const bottomPosition = isCartActive ? 92 : 24;

  const floatingWidgetContent = (
    <div
      style={{
        position: 'fixed',
        bottom: `${bottomPosition}px`,
        right: '20px',
        zIndex: 999990,
        pointerEvents: 'none',
        transition: 'bottom 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div className="relative pointer-events-auto">
        {/* Floating Chat Window Modal */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 16 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="absolute bottom-14 right-0 mb-2 w-[calc(100vw-36px)] sm:w-[410px] max-w-[410px] h-[520px] sm:h-[570px] max-h-[calc(100vh-130px)] flex flex-col overflow-hidden bg-background/95 backdrop-blur-2xl border border-border shadow-2xl rounded-2xl"
              style={{
                boxShadow: '0 24px 60px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.2)',
              }}
            >
              {/* Header */}
              <div className="px-4 py-3.5 bg-secondary/80 border-b border-border/80 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="relative w-9 h-9 rounded-full overflow-hidden bg-white shadow-xs border border-primary/20 shrink-0 flex items-center justify-center">
                    {!imgError ? (
                      <img
                        src="/freshi-icon.jpg?v=1"
                        alt="Freshi"
                        className="w-full h-full object-contain"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <Bot className="w-5 h-5 text-primary" />
                    )}
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"></span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-black text-foreground tracking-tight">Ask Freshi</h3>
                      <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        AI Chef
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium">Surat Fresh Produce & Recipes</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleClearChat}
                    title="Restart conversation"
                    className="p-1.5 rounded-full hover:bg-background text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Restart chat"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/fnl-recipes');
                    }}
                    title="Open full page"
                    className="p-1.5 rounded-full hover:bg-background text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Expand to full screen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    title="Close chat"
                    className="p-1.5 rounded-full hover:bg-background text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Close chat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar select-text">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} gap-1.5`}
                  >
                    <div className="flex items-end gap-2 max-w-[90%]">
                      {msg.sender === 'bot' && (
                        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-white shadow-xs border border-primary/20 mb-1 flex items-center justify-center">
                          {!imgError ? (
                            <img src="/freshi-icon.jpg?v=1" alt="Freshi" className="w-full h-full object-contain" />
                          ) : (
                            <Bot className="w-3.5 h-3.5 text-primary" />
                          )}
                        </div>
                      )}
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                          msg.sender === 'user'
                            ? 'bg-primary text-primary-foreground font-medium rounded-br-xs'
                            : 'bg-secondary/80 text-foreground border border-border/40 rounded-bl-xs'
                        }`}
                      >
                        {msg.isLoading ? (
                          <div className="flex items-center gap-2 py-1 text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            <span className="text-[11px] font-semibold animate-pulse">Freshi is thinking...</span>
                          </div>
                        ) : (
                          <div className="prose prose-xs max-w-none dark:prose-invert">
                            <Markdown>{msg.text}</Markdown>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Suggested Products from Catalog */}
                    {msg.suggestedProducts && msg.suggestedProducts.length > 0 && (
                      <div className="mt-2 pl-8 w-full">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Sparkles className="w-3.5 h-3.5 text-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Matching Fresh Produce
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {msg.suggestedProducts.slice(0, 3).map((prod) => (
                            <div
                              key={prod.id}
                              className="flex items-center justify-between p-2 rounded-xl bg-background border border-border/60 hover:border-primary/40 transition-colors shadow-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                {prod.imageUrl ? (
                                  <img
                                    src={prod.imageUrl}
                                    alt={prod.name}
                                    className="w-9 h-9 rounded-lg object-cover bg-secondary shrink-0 border border-border/40"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-muted-foreground text-[9px] font-bold">
                                    FNL
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-foreground truncate">{prod.name}</p>
                                  <p className="text-[10px] text-muted-foreground font-semibold">
                                    ₹{prod.price} {prod.unit ? `• ${prod.unit}` : ''}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddToCart(prod)}
                                className="px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                              >
                                <ShoppingBag className="w-3 h-3" />
                                Add
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Suggestion Chips */}
              {messages.length <= 3 && !isTyping && (
                <div className="px-3 py-2 bg-secondary/40 border-t border-border/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                  {QUICK_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(prompt)}
                      className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-full bg-background hover:bg-primary/10 hover:text-primary border border-border/60 text-muted-foreground font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {/* Chat Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="p-3 bg-background border-t border-border flex items-center gap-2 shrink-0"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Ask for recipe or ingredient advice..."
                  disabled={isTyping}
                  className="flex-1 bg-secondary/60 hover:bg-secondary/80 focus:bg-background border border-border/60 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-full px-4 py-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-all disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || isTyping}
                  className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer shadow-sm"
                  aria-label="Send message"
                >
                  {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Action Button - Normal compact size, solid proper green, no image */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-2.5 rounded-full shadow-lg transition-all duration-200 cursor-pointer select-none font-bold text-xs sm:text-sm tracking-wide ${
            isOpen
              ? 'bg-neutral-800 hover:bg-neutral-900 text-white border border-neutral-700'
              : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white border border-emerald-500/40'
          }`}
          style={{
            boxShadow: isOpen
              ? '0 6px 20px rgba(0,0,0,0.3)'
              : '0 6px 20px rgba(5, 150, 105, 0.4), 0 2px 6px rgba(0, 0, 0, 0.1)',
          }}
          aria-label={isOpen ? 'Close Freshi Chat' : 'Ask Freshi'}
        >
          {isOpen ? (
            <>
              <X className="w-4 h-4 text-white" />
              <span>Close</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-emerald-200 shrink-0" />
              <span className="font-extrabold">Ask Freshi</span>
            </>
          )}
        </motion.button>
      </div>
    </div>
  );

  return createPortal(floatingWidgetContent, document.body);
}
