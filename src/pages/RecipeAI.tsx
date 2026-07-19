import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChefHat, MessageSquare, Loader2, Heart, Send, Trash2, RotateCcw, ShoppingBag, HelpCircle, Menu, Plus, X } from 'lucide-react';
import { useProducts } from '../store/useProducts';
import { useCart, Product } from '../store/useCart';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { useAuth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, getDoc, setDoc, query, orderBy, getDocs } from 'firebase/firestore';
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

interface RecipeChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
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
  
  // State for Chat Sessions
  const [sessions, setSessions] = useState<RecipeChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const [chatInput, setChatInput] = useState('');
  const [savingMsgId, setSavingMsgId] = useState<string | null>(null);
  const [savedRecipeIds, setSavedRecipeIds] = useState<Record<string, string>>({}); // msgId -> savedDocId
  
  const { products } = useProducts();
  const addToCart = useCart(state => state.addItem);
  const { user } = useAuth();

  // Load sessions from Firestore or localStorage
  useEffect(() => {
    let activeId = '';
    
    if (user) {
      setLoadingHistory(true);
      const loadFromFirestore = async () => {
        try {
          const q = query(collection(db, 'users', user.uid, 'recipeChat'), orderBy('updatedAt', 'desc'));
          const snap = await getDocs(q);
          const sessionsList: RecipeChatSession[] = [];
          
          snap.forEach(doc => {
            const data = doc.data();
            sessionsList.push({
              id: doc.id,
              title: data.title || 'New Chef Chat',
              messages: data.messages || [],
              updatedAt: data.updatedAt || Date.now()
            });
          });
          
          if (sessionsList.length > 0) {
            // Find if there is an empty session (one with no user messages)
            const emptySession = sessionsList.find(s => !s.messages.some(m => m.sender === 'user'));
            
            if (emptySession) {
              setSessions(sessionsList);
              setActiveSessionId(emptySession.id);
              localStorage.setItem('fnl_recipe_active_session_id', emptySession.id);
            } else {
              // Create a brand new session automatically on load
              const newId = 'session-' + Date.now();
              const newSession: RecipeChatSession = {
                id: newId,
                title: 'New Chef Chat',
                messages: [
                  {
                    id: 'welcome',
                    sender: 'bot',
                    text: "Hi! I'm **Freshi**, your personal AI chef and culinary assistant for **FreshNLocal.co**! 🥑\n\nI can help you:\n1. 🍳 **Suggest delicious recipes** or answer any food, grocery, and culinary questions.\n2. 🛒 **Recommend matching premium products** from our catalog in Surat that you can add to your cart immediately!\n\nWhat are we cooking today? Ask me any food-related questions!",
                    timestamp: Date.now()
                  }
                ],
                updatedAt: Date.now()
              };
              
              const updatedList = [newSession, ...sessionsList];
              setSessions(updatedList);
              setActiveSessionId(newId);
              localStorage.setItem('fnl_recipe_active_session_id', newId);
              
              // Save to firestore
              await setDoc(doc(db, 'users', user.uid, 'recipeChat', newId), {
                messages: newSession.messages,
                title: newSession.title,
                updatedAt: newSession.updatedAt
              });
            }
          } else {
            // Create a default session in Firestore
            const defaultId = 'session-' + Date.now();
            const defaultSession: RecipeChatSession = {
              id: defaultId,
              title: 'New Chef Chat',
              messages: [
                {
                  id: 'welcome',
                  sender: 'bot',
                  text: "Hi! I'm **Freshi**, your personal AI chef and culinary assistant for **FreshNLocal.co**! 🥑\n\nI can help you:\n1. 🍳 **Suggest delicious recipes** or answer any food, grocery, and culinary questions.\n2. 🛒 **Recommend matching premium products** from our catalog in Surat that you can add to your cart immediately!\n\nWhat are we cooking today? Ask me any food-related questions!",
                  timestamp: Date.now()
                }
              ],
              updatedAt: Date.now()
            };
            setSessions([defaultSession]);
            setActiveSessionId(defaultId);
            localStorage.setItem('fnl_recipe_active_session_id', defaultId);
            
            // Save to firestore
            await setDoc(doc(db, 'users', user.uid, 'recipeChat', defaultId), {
              messages: defaultSession.messages,
              title: defaultSession.title,
              updatedAt: defaultSession.updatedAt
            });
          }
        } catch (err) {
          console.warn('Failed to load sessions from Firestore', err);
          loadFromLocalStorage();
        } finally {
          setLoadingHistory(false);
        }
      };
      loadFromFirestore();
    } else {
      loadFromLocalStorage();
    }
    
    function loadFromLocalStorage() {
      try {
        const stored = localStorage.getItem('fnl_recipe_chat_sessions');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Find if there is an empty session (one with no user messages)
            const emptySession = parsed.find((s: RecipeChatSession) => !s.messages.some(m => m.sender === 'user'));
            
            if (emptySession) {
              setSessions(parsed);
              setActiveSessionId(emptySession.id);
              localStorage.setItem('fnl_recipe_active_session_id', emptySession.id);
            } else {
              // Create a brand new session automatically on load
              const newId = 'session-' + Date.now();
              const newSession: RecipeChatSession = {
                id: newId,
                title: 'New Chef Chat',
                messages: [
                  {
                    id: 'welcome',
                    sender: 'bot',
                    text: "Hi! I'm **Freshi**, your personal AI chef and culinary assistant for **FreshNLocal.co**! 🥑\n\nI can help you:\n1. 🍳 **Suggest delicious recipes** or answer any food, grocery, and culinary questions.\n2. 🛒 **Recommend matching premium products** from our catalog in Surat that you can add to your cart immediately!\n\nWhat are we cooking today? Ask me any food-related questions!",
                    timestamp: Date.now()
                  }
                ],
                updatedAt: Date.now()
              };
              
              const updatedList = [newSession, ...parsed];
              setSessions(updatedList);
              setActiveSessionId(newId);
              localStorage.setItem('fnl_recipe_active_session_id', newId);
              localStorage.setItem('fnl_recipe_chat_sessions', JSON.stringify(updatedList));
            }
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to parse sessions from localStorage', e);
      }
      
      // Default initial session
      const defaultId = 'session-' + Date.now();
      const defaultSession: RecipeChatSession = {
        id: defaultId,
        title: 'New Chef Chat',
        messages: [
          {
            id: 'welcome',
            sender: 'bot',
            text: "Hi! I'm **Freshi**, your personal AI chef and culinary assistant for **FreshNLocal.co**! 🥑\n\nI can help you:\n1. 🍳 **Suggest delicious recipes** or answer any food, grocery, and culinary questions.\n2. 🛒 **Recommend matching premium products** from our catalog in Surat that you can add to your cart immediately!\n\nWhat are we cooking today? Ask me any food-related questions!",
            timestamp: Date.now()
          }
        ],
        updatedAt: Date.now()
      };
      setSessions([defaultSession]);
      setActiveSessionId(defaultId);
      localStorage.setItem('fnl_recipe_active_session_id', defaultId);
      localStorage.setItem('fnl_recipe_chat_sessions', JSON.stringify([defaultSession]));
    }
  }, [user]);

  // Auto-save sessions to localStorage and Firestore
  useEffect(() => {
    if (loadingHistory || sessions.length === 0 || !activeSessionId) return;

    // Save sessions to localStorage
    localStorage.setItem('fnl_recipe_chat_sessions', JSON.stringify(sessions));
    localStorage.setItem('fnl_recipe_active_session_id', activeSessionId);

    // Save active session to Firestore if user is logged in
    if (user) {
      const activeSession = sessions.find(s => s.id === activeSessionId);
      if (!activeSession) return;

      const saveToFirestore = async () => {
        try {
          const cleanMessages = activeSession.messages.map(m => {
            if (m.isLoading) {
              const { isLoading, ...rest } = m;
              return { ...rest, text: 'Request was interrupted.' } as ChatMessage;
            }
            return m;
          });

          await setDoc(doc(db, 'users', user.uid, 'recipeChat', activeSessionId), {
            messages: cleanMessages,
            title: activeSession.title,
            updatedAt: Date.now()
          });
        } catch (err) {
          console.warn('Failed to save chat session to Firestore', err);
        }
      };

      const timer = setTimeout(() => {
        saveToFirestore();
      }, 2000); // 2 second debounce to avoid rapid Firestore writes
      return () => clearTimeout(timer);
    }
  }, [sessions, activeSessionId, user, loadingHistory]);

  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId) || sessions[0] || null;
  }, [sessions, activeSessionId]);

  const messages = useMemo(() => {
    return activeSession ? activeSession.messages : [];
  }, [activeSession]);

  const setMessages = (updateFn: (prevMsgs: ChatMessage[]) => ChatMessage[]) => {
    if (!activeSessionId) return;
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        const nextMsgs = updateFn(s.messages);
        
        // Auto-update title if it's the default/empty title
        let nextTitle = s.title;
        if (s.title === 'New Chef Chat' || s.title === '') {
          const firstUserMsg = nextMsgs.find(m => m.sender === 'user');
          if (firstUserMsg) {
            nextTitle = firstUserMsg.text.length > 25 
              ? firstUserMsg.text.substring(0, 25) + '...' 
              : firstUserMsg.text;
          }
        }

        return {
          ...s,
          title: nextTitle,
          messages: nextMsgs,
          updatedAt: Date.now()
        };
      }
      return s;
    }));
  };

  const handleNewChat = async () => {
    const newId = 'session-' + Date.now();
    const newSession: RecipeChatSession = {
      id: newId,
      title: 'New Chef Chat',
      messages: [
        {
          id: 'welcome',
          sender: 'bot',
          text: "Hi! I'm **Freshi**, your personal AI chef and culinary assistant for **FreshNLocal.co**! 🥑\n\nI can help you:\n1. 🍳 **Suggest delicious recipes** or answer any food, grocery, and culinary questions.\n2. 🛒 **Recommend matching premium products** from our catalog in Surat that you can add to your cart immediately!\n\nWhat are we cooking today? Ask me any food-related questions!",
          timestamp: Date.now()
        }
      ],
      updatedAt: Date.now()
    };

    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newId);
    setIsSidebarOpen(false); // close sidebar on mobile
    
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'recipeChat', newId), {
          messages: newSession.messages,
          title: newSession.title,
          updatedAt: newSession.updatedAt
        });
      } catch (err) {
        console.warn('Failed to save new session to Firestore', err);
      }
    }
    
    toast.success('New chat session started!');
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const sessionToDelete = sessions.find(s => s.id === sessionId);
    if (!sessionToDelete) return;
    
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    let nextActiveId = activeSessionId;
    
    if (activeSessionId === sessionId) {
      if (updatedSessions.length > 0) {
        nextActiveId = updatedSessions[0].id;
      } else {
        const defaultId = 'session-' + Date.now();
        const defaultSession: RecipeChatSession = {
          id: defaultId,
          title: 'New Chef Chat',
          messages: [
            {
              id: 'welcome',
              sender: 'bot',
              text: "Hi! I'm **Freshi**, your personal AI chef and culinary assistant for **FreshNLocal.co**! 🥑\n\nI can help you:\n1. 🍳 **Suggest delicious recipes** or answer any food, grocery, and culinary questions.\n2. 🛒 **Recommend matching premium products** from our catalog in Surat that you can add to your cart immediately!\n\nWhat are we cooking today? Ask me any food-related questions!",
              timestamp: Date.now()
            }
          ],
          updatedAt: Date.now()
        };
        updatedSessions.push(defaultSession);
        nextActiveId = defaultId;
        
        if (user) {
          try {
            await setDoc(doc(db, 'users', user.uid, 'recipeChat', defaultId), {
              messages: defaultSession.messages,
              title: defaultSession.title,
              updatedAt: defaultSession.updatedAt
            });
          } catch (e) {
            console.warn(e);
          }
        }
      }
    }
    
    setSessions(updatedSessions);
    setActiveSessionId(nextActiveId);
    
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'recipeChat', sessionId));
      } catch (err) {
        console.warn('Failed to delete session from Firestore', err);
      }
    }
    
    toast.success('Chat session deleted!');
  };
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<any>(null);

  // Clear typing interval if we switch sessions or unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
    };
  }, [activeSessionId]);

  // Auto scroll to bottom of chat
  useEffect(() => {
    if (!chatContainerRef.current) return;
    
    const container = chatContainerRef.current;
    const scrollToBottom = () => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    };

    // Scroll immediately
    scrollToBottom();

    // Scroll after multiple small delays to ensure layout and markdown rendering are fully complete
    const timer1 = setTimeout(scrollToBottom, 50);
    const timer2 = setTimeout(scrollToBottom, 150);
    const timer3 = setTimeout(scrollToBottom, 350);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [messages.length]);

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

    // Construct the context before updating state
    const chatHistory = messages
      .filter(m => m.id !== 'welcome' && !m.isLoading && m.text)
      .map(m => ({
        sender: m.sender,
        text: m.text
      }));

    // Update messages array
    setMessages(prev => [...prev, newUserMsg, tempBotMsg]);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const payload = { 
        catalog: availableProducts, 
        recipeName: trimmedText,
        products: [],
        history: chatHistory // Send context history for conversational capability!
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
            const match = products.find(p => {
              const cat = p.category?.toLowerCase() || '';
              const pName = p.name.toLowerCase();
              // Prevent matching any juice, beverage, or FNL brand drink
              if (cat.includes('juice') || cat.includes('fnl') || pName.includes('juice')) {
                return false;
              }
              return p.name.toLowerCase().includes(name.toLowerCase()) || 
                     name.toLowerCase().includes(p.name.toLowerCase());
            });
            if (match && !suggestions.find(s => s.id === match.id)) {
              suggestions.push(match);
            }
          });
        }

        const fullText = data.recipeMarkdown || data.text || "No recipe returned.";
        
        // Clear any previous typing interval
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }

        let currentIndex = 0;
        const chunkSize = 15; // Characters per tick
        const totalLength = fullText.length;

        // Immediately turn off loader and clear text for botMsgId to prepare for typing
        setMessages(prev => prev.map(msg => {
          if (msg.id === botMsgId) {
            return {
              ...msg,
              isLoading: false,
              text: ''
            };
          }
          return msg;
        }));

        typingIntervalRef.current = setInterval(() => {
          currentIndex += chunkSize;
          if (currentIndex >= totalLength) {
            if (typingIntervalRef.current) {
              clearInterval(typingIntervalRef.current);
              typingIntervalRef.current = null;
            }
            setMessages(prev => prev.map(msg => {
              if (msg.id === botMsgId) {
                return {
                  ...msg,
                  text: fullText,
                  suggestedProducts: suggestions
                };
              }
              return msg;
            }));
          } else {
            const nextText = fullText.substring(0, currentIndex);
            setMessages(prev => prev.map(msg => {
              if (msg.id === botMsgId) {
                return {
                  ...msg,
                  text: nextText
                };
              }
              return msg;
            }));
          }

          // Auto-scroll directly inside the animation tick to guarantee scrolling happens during typing
          if (chatContainerRef.current) {
            const container = chatContainerRef.current;
            const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
            if (isNearBottom) {
              container.scrollTop = container.scrollHeight;
            }
          }
        }, 12); // incredibly smooth and fast
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

  // Clear Chat History (Reset active session)
  const handleClearChat = () => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    setMessages(() => [
      {
        id: 'welcome',
        sender: 'bot',
        text: "Hi! I'm **Freshi**, your personal AI chef and culinary assistant for **FreshNLocal.co**! 🥑\n\nI can help you:\n1. 🍳 **Suggest delicious recipes** or answer any food, grocery, and culinary questions.\n2. 🛒 **Recommend matching premium products** from our catalog in Surat that you can add to your cart immediately!\n\nWhat are we cooking today? Ask me any food-related questions!",
        timestamp: Date.now()
      }
    ]);
    
    // Reset title to 'New Chef Chat' for this session
    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          title: 'New Chef Chat',
          updatedAt: Date.now()
        };
      }
      return s;
    }));

    setSavedRecipeIds({});
    toast.success('Current chat cleared!');
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

      // Extract history prior to this message
      const chatHistory = messages
        .slice(0, botIndex - 1)
        .filter(m => m.id !== 'welcome' && !m.isLoading && m.text)
        .map(m => ({
          sender: m.sender,
          text: m.text
        }));

      const payload = { 
        catalog: availableProducts, 
        recipeName: userMsg.text,
        products: [],
        history: chatHistory
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
            const match = products.find(p => {
              const cat = p.category?.toLowerCase() || '';
              const pName = p.name.toLowerCase();
              // Prevent matching any juice, beverage, or FNL brand drink
              if (cat.includes('juice') || cat.includes('fnl') || pName.includes('juice')) {
                return false;
              }
              return p.name.toLowerCase().includes(name.toLowerCase()) || 
                     name.toLowerCase().includes(p.name.toLowerCase());
            });
            if (match && !suggestions.find(s => s.id === match.id)) {
              suggestions.push(match);
            }
          });
        }

        const fullText = data.recipeMarkdown || data.text || "No recipe returned.";
        
        // Clear any previous typing interval
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }

        let currentIndex = 0;
        const chunkSize = 15; // Characters per tick
        const totalLength = fullText.length;

        // Immediately turn off loader and clear text for botMsgId to prepare for typing
        setMessages(prev => prev.map(msg => {
          if (msg.id === botMsgId) {
            return {
              ...msg,
              isLoading: false,
              text: ''
            };
          }
          return msg;
        }));

        typingIntervalRef.current = setInterval(() => {
          currentIndex += chunkSize;
          if (currentIndex >= totalLength) {
            if (typingIntervalRef.current) {
              clearInterval(typingIntervalRef.current);
              typingIntervalRef.current = null;
            }
            setMessages(prev => prev.map(msg => {
              if (msg.id === botMsgId) {
                return {
                  ...msg,
                  text: fullText,
                  suggestedProducts: suggestions
                };
              }
              return msg;
            }));
          } else {
            const nextText = fullText.substring(0, currentIndex);
            setMessages(prev => prev.map(msg => {
              if (msg.id === botMsgId) {
                return {
                  ...msg,
                  text: nextText
                };
              }
              return msg;
            }));
          }

          // Auto-scroll directly inside the animation tick to guarantee scrolling happens during typing
          if (chatContainerRef.current) {
            const container = chatContainerRef.current;
            const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
            if (isNearBottom) {
              container.scrollTop = container.scrollHeight;
            }
          }
        }, 12); // incredibly smooth and fast
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
    <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 w-full flex-1 flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
      <div className="text-center space-y-2 mb-4 shrink-0">
        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <ChefHat className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-foreground">FNL RECIPES</h1>
        <p className="text-xs md:text-sm text-muted-foreground max-w-lg mx-auto">
          Interactive culinary assistant powered by Freshi AI
        </p>
      </div>

      {/* Main Layout containing Sidebar + Chat Area */}
      <div className="relative flex flex-1 bg-background border border-border shadow-sm rounded-2xl overflow-hidden min-h-[500px]">
        
        {/* ==================== CHAT HISTORY SIDEBAR (DESKTOP / LAPTOP) ==================== */}
        <div className="hidden md:flex flex-col w-[260px] border-r border-border bg-white shrink-0 h-full">
          {/* New Chat Button */}
          <div className="p-4 border-b border-border">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary/95 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 mb-2">
              Recent Chats
            </div>
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-primary/10 text-primary font-bold' 
                      : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span className="text-xs truncate font-medium">{session.title || 'New Chef Chat'}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 rounded-md transition-all shrink-0"
                    title="Delete Chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ==================== CHAT HISTORY SIDEBAR (MOBILE DRAWER OVERLAY) ==================== */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="fixed inset-0 bg-black/40 z-[100] md:hidden"
              />

              {/* Drawer */}
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'tween', duration: 0.25 }}
                className="fixed inset-y-0 left-0 w-[280px] bg-white border-r border-border z-[101] flex flex-col h-full shadow-2xl md:hidden"
              >
                {/* Drawer Header */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ChefHat className="w-5 h-5 text-primary" />
                    <span className="text-sm font-black uppercase tracking-wider text-foreground">Recipes History</span>
                  </div>
                  <button
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* New Chat Button */}
                <div className="p-4 border-b border-border">
                  <button
                    onClick={handleNewChat}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary/95 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    New Chat
                  </button>
                </div>

                {/* Sessions List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-2 mb-2">
                    Recent Chats
                  </div>
                  {sessions.map((session) => {
                    const isActive = session.id === activeSessionId;
                    return (
                      <div
                        key={session.id}
                        onClick={() => {
                          setActiveSessionId(session.id);
                          setIsSidebarOpen(false);
                        }}
                        className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                          isActive 
                            ? 'bg-primary/10 text-primary font-bold' 
                            : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <MessageSquare className="w-4 h-4 shrink-0" />
                          <span className="text-xs truncate font-medium">{session.title || 'New Chef Chat'}</span>
                        </div>
                        <button
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="p-1 hover:text-red-500 rounded-md transition-all shrink-0 text-muted-foreground"
                          title="Delete Chat"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ==================== MAIN CHAT INTERFACE AREA ==================== */}
        <div className="flex flex-col flex-1 min-w-0 h-full">
          
          {/* Chat Pane Header */}
          <div className="shrink-0 px-4 py-3 border-b border-border bg-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Toggle Sidebar Hamburger Button for Mobile */}
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                title="View History Sessions"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="relative w-10 h-10 rounded-full overflow-hidden border border-primary/20 shrink-0 bg-white shadow-xs">
                <img src="/freshi-icon.jpg?v=1" alt="Freshi" className="w-full h-full object-contain" />
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-black uppercase tracking-wide text-foreground truncate max-w-[120px] sm:max-w-none">
                    {activeSession?.title || "Freshi Assistant"}
                  </span>
                  <span className="text-[9px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-md shrink-0">SURAT</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Culinary & Grocery AI</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5">
              {/* New Chat Button for quick desktop access */}
              <button
                onClick={handleNewChat}
                className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-secondary hover:bg-primary/10 hover:text-primary border border-border rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                title="New Chat Session"
              >
                <Plus className="w-3.5 h-3.5" />
                New Chat
              </button>

              <button
                onClick={handleClearChat}
                className="p-2 text-muted-foreground hover:text-red-500 rounded-lg hover:bg-red-50/50 transition-colors"
                title="Reset Current Chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
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
                        <img src="/freshi-icon.jpg?v=1" alt="Freshi" className="w-full h-full object-contain" />
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
    </div>
  );
}
