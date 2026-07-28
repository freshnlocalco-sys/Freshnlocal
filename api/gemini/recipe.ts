import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";

let aiClient: GoogleGenAI | null = null;
function getAIClient() {
  if (!aiClient) {
    const rawApiKey = process.env.GEMINI_API_KEY;
    const apiKey = rawApiKey ? rawApiKey.replace(/^["']|["']$/g, '').trim() : undefined;
    
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Security & Budgeting: In-memory stores (Note: In a serverless environment like Vercel, 
// these are per-instance and may clear on cold boots, but still offer baseline protection)
const rateLimitStore = new Map<string, { count: number, resetTime: number }>();
const inFlightRequests = new Set<string>(); // Used to prevent duplicate concurrent requests
const responseCache = new Map<string, { data: any, timestamp: number }>();

const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

// Global Budget Control
let dailyCostCents = 0;
let lastCostReset = Date.now();
const DAILY_BUDGET_CENTS = 100; // Maximum $1.00 API spend per day
let circuitBreakerTripped = false;

function checkAndResetBudget() {
  const now = Date.now();
  if (now - lastCostReset > 24 * 60 * 60 * 1000) {
    dailyCostCents = 0;
    lastCostReset = now;
    circuitBreakerTripped = false;
  }
}

// Helper to generate a stable cache key
function generateCacheKey(body: any): string {
  const data = JSON.stringify({
    products: body.products || [],
    recipeName: body.recipeName || "",
    preferences: body.preferences || [],
    history: body.history || [],
    bypassCache: body.bypassCache || false
  });
  return crypto.createHash("sha256").update(data).digest("hex");
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  // Vercel populates req.headers['x-forwarded-for']
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  
  // 1. Rate Limiting Check
  const now = Date.now();
  let rlData = rateLimitStore.get(clientIp as string);
  if (!rlData || now > rlData.resetTime) {
    rlData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  }
  rlData.count++;
  rateLimitStore.set(clientIp as string, rlData);
  
  if (rlData.count > MAX_REQUESTS_PER_WINDOW) {
    console.warn(`[REQ ${requestId}] Rate limit exceeded for IP: ${clientIp}`);
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  try {
    const { products = [], catalog = [], preferences = [], recipeName = "", history = [], bypassCache = false } = req.body;
    
    checkAndResetBudget();
    if (circuitBreakerTripped || dailyCostCents > DAILY_BUDGET_CENTS) {
      circuitBreakerTripped = true;
      console.warn(`[REQ ${requestId}] Daily AI budget exceeded. Current spend: $${(dailyCostCents / 100).toFixed(2)}`);
      return res.status(429).json({ error: "Daily AI usage limit reached. Please try again tomorrow." });
    }

    // 2. Cache Check - Only cache actual recipe requests or longer queries to keep greetings/casual chats interactive!
    const cleanRecipeName = recipeName.trim().toLowerCase();
    const isGreeting = cleanRecipeName.length < 10 || 
                      /^(hi|hello|hey|hola|greetings|yo|good morning|good afternoon|good evening|who are you|help|start|welcome)/.test(cleanRecipeName);
    
    const shouldBypassCache = bypassCache || isGreeting;
    const cacheKey = generateCacheKey(req.body);
    const cachedResponse = shouldBypassCache ? null : responseCache.get(cacheKey);
    if (cachedResponse && (now - cachedResponse.timestamp < CACHE_TTL_MS)) {
      console.log(`[REQ ${requestId}] Returning CACHED response for recipe: "${recipeName}"`);
      return res.status(200).json(cachedResponse.data);
    }

    // 3. In-flight Request Protection (prevent duplicate parallel clicks)
    const inFlightKey = `${clientIp}_${cacheKey}`;
    if (inFlightRequests.has(inFlightKey)) {
      console.warn(`[REQ ${requestId}] Duplicate request detected for IP: ${clientIp}`);
      return res.status(429).json({ error: "A request is already processing. Please wait." });
    }
    inFlightRequests.add(inFlightKey);

    // We only take the top 80 most relevant catalog items to give Gemini rich recommendation options
    let optimizedCatalog = catalog;
    if (catalog.length > 80) {
      const searchTerms = (recipeName + " " + products.join(" ")).toLowerCase()
        .split(/[\s,.\-()]+/)
        .filter((w: string) => w.length > 2);
      
      const scored = catalog.map((c: string) => {
        let score = 0;
        const cl = c.toLowerCase();
        for (const term of searchTerms) {
          if (cl.includes(term)) score += 5;
        }
        // Slightly boost popular categories/keywords to encourage variety
        if (cl.includes("pepper") || cl.includes("herb") || cl.includes("organic") || cl.includes("fresh") || cl.includes("curry") || cl.includes("spice")) {
          score += 1;
        }
        return { item: c, score };
      });
      
      scored.sort((a: any, b: any) => b.score - a.score);
      
      const relevantItems = scored.filter((s: any) => s.score > 1).map((s: any) => s.item);
      const otherItems = scored.filter((s: any) => s.score <= 1).map((s: any) => s.item);
      
      const targetSize = 80;
      let selectedItems = [...relevantItems];
      if (selectedItems.length < targetSize) {
        const needed = targetSize - selectedItems.length;
        const step = Math.max(1, Math.floor(otherItems.length / needed));
        for (let i = 0; i < otherItems.length && selectedItems.length < targetSize; i += step) {
          if (!selectedItems.includes(otherItems[i])) {
            selectedItems.push(otherItems[i]);
          }
        }
        for (let i = 0; i < otherItems.length && selectedItems.length < targetSize; i++) {
          if (!selectedItems.includes(otherItems[i])) {
            selectedItems.push(otherItems[i]);
          }
        }
      } else if (selectedItems.length > 100) {
        selectedItems = selectedItems.slice(0, 100);
      }
      
      optimizedCatalog = selectedItems;
    }
    const catalogText = optimizedCatalog.join(", ");
    
    const preferencesText = preferences && preferences.length > 0 ? ` The user has the following preferences for the recipe: ${preferences.join(", ")}.` : "";
    
    // Format conversation history for context (limit to last 4)
    let historyContext = "";
    if (history && Array.isArray(history) && history.length > 0) {
      historyContext = "Below is the recent history of our conversation so far:\n";
      history.slice(-4).forEach((msg: any) => {
        const senderName = msg.sender === 'user' ? 'User' : 'Freshi (AI Assistant)';
        historyContext += `[${senderName}]: ${msg.text}\n`;
      });
      historyContext += "\n";
    }

    let prompt = '';
    if (recipeName) {
      prompt = `You are "Freshi", a friendly, warm, and highly conversational culinary and grocery AI assistant for FreshNLocal.CO (a premium fresh produce delivery engine in Surat). ${historyContext}The user sent the following message: "${recipeName}".${preferencesText}

CRITICAL GUARD RAILS & CONVERSATIONAL DIRECTIONS:
- You MUST detect the intent of the user's message:

1. GREETING / CASUAL TALK (e.g., "hello", "hi", "hey", "how are you", "who are you", "good evening", etc.):
   - DO NOT provide or spit out a full recipe.
   - Reply conversationally with a warm, welcoming, and interactive greeting.
   - Introduce yourself as Freshi, their personal AI Chef for FreshNLocal.co in Surat.
   - Enthusiastically ask what they would like to cook today or what fresh ingredients they are looking for.
   - Offer some suggestions of categories they can ask about (e.g., Surat street food favorites, healthy breakfast ideas, comforting Indian curries, light salads, or high-protein meals).
   - Keep the reply concise, friendly, and engaging. Encourage them to ask questions or tell you what ingredients they have!
   - For suggestedProductNames, recommend 2-3 popular fresh, high-quality products from the catalog (like "Avocado", "Cherry Tomato", or "Baby Spinach") to showcase and inspire them, labeling them as "Featured Fresh Produce Today".

2. FOOD-RELATED QUESTIONS / DISCUSSIONS (e.g., cooking tips, how to store veggies, nutrition questions, recipe follow-ups, or questions like "what can I make with tomatoes"):
   - Answer their question thoroughly, conversationally, and helpfully in the recipeMarkdown field.
   - Do NOT provide a full structured recipe (with full steps/ingredients list) unless they specifically asked you to "give me a recipe for X" or "how to make X". Instead, have a natural conversation, offering expert culinary advice and asking clarifying questions to guide them!
   - Recommend any relevant products from the catalog that can help them (e.g., if they ask about seasoning, suggest relevant spices/herbs from the catalog).

3. SPECIFIC RECIPE REQUESTS (e.g., "how to make Aloo Puri", "give me a Surti Ghugra recipe", "recipe for avocado toast"):
   - Provide a complete, delicious, structured recipe formatted in beautiful Markdown (using proper headings, lists, and spacing).
   - Check the recent conversation history to ensure you DO NOT repeat a recipe already discussed in this chat session. Be creative and suggest unique, exciting variations!
   - Recommend all complementary ingredients, spices, garnishes, and fresh items from our catalog that are required or go beautifully with the dish, aiming for 3-6 product recommendations.

- You MUST select recommendations ONLY from the following exact store catalog:
[ ${catalogText} ]
- You MUST NEVER suggest, recommend, or add any FNL Juices, juices, cold-pressed juices, beverages, or drinks in either the recipe markdown or the suggested products. Focus strictly on solid foods, fresh produce, groceries, spices, or garnishes.
- Use the EXACT product name as it appears in the catalog.
- If the user's request is entirely unrelated to food, culinary arts, groceries, cooking, or FreshNLocal, politely remind them that you are the FreshNLocal culinary assistant and ask them how you can help them with their next meal.`;
    } else {
      prompt = `You are "Freshi", a culinary and grocery AI assistant for FreshNLocal.CO. ${historyContext}The user has selected these ingredients they already have on hand: ${(products || []).join(", ")}.${preferencesText}

CRITICAL DIRECTIONS FOR INGREDIENTS COOKING:
1. Provide a delicious, creative recipe that utilizes some or all of their selected ingredients. Format it in beautiful, well-spaced Markdown.
2. Recommend other complementary products (e.g., seasonings, key vegetables, garnishes, grains) from our catalog that they should purchase to make this recipe perfect. Aim for 3-6 product recommendations.
3. Be creative and explore different culinary directions (e.g., street food, gourmet, light snack, traditional Indian/Gujarati, or healthy options). Do not generate the exact same recipe every time.
4. You MUST select recommendations ONLY from the following exact store catalog:
[ ${catalogText} ]
- Do NOT suggest any product that is already in the user's selected list.
- You MUST NEVER suggest, recommend, or add any FNL Juices, juices, cold-pressed juices, beverages, or drinks in either the recipe markdown or the suggested products. Focus strictly on solid foods, fresh produce, groceries, spices, or garnishes.
- Use the EXACT product name as it appears in the catalog.`;
    }
    
    const ai = getAIClient();
    console.log(`[REQ ${requestId}] Sending Gemini request... (Prompt length: ${prompt.length} chars)`);
    
    let response;
    let retries = 0;
    const MAX_RETRIES = 2;
    
    while (retries <= MAX_RETRIES) {
      try {
        const modelName = "gemini-3.6-flash"; // Smarter default model that follows complex prompt instructions perfectly
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: 0.7, // Slightly lower temperature for better instruction following on greetings vs recipes
            maxOutputTokens: 4000, // Safe limit allowing for reasoning and complete JSON output
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                recipeMarkdown: { 
                  type: "STRING",
                  description: "The main text response. This MUST be a warm, interactive conversational message/greeting for simple chat or casual inputs, and ONLY a full formatted recipe when a recipe is explicitly requested."
                },
                suggestedProductNames: { 
                  type: "ARRAY", 
                  items: { type: "STRING" },
                  description: "Array of EXACT product names selected from the store catalog."
                }
              },
              required: ["recipeMarkdown", "suggestedProductNames"]
            }
          }
        });
        
        // Log detailed token usage and cost metrics
        const usage = response.usageMetadata;
        const inputTokens = usage?.promptTokenCount || 0;
        const outputTokens = usage?.candidatesTokenCount || 0;
        const totalTokens = usage?.totalTokenCount || 0;
        // Approximate cost for gemini-3.5-flash: $0.075 / 1M input, $0.30 / 1M output
        const estCostCents = ((inputTokens / 1000000) * 7.5) + ((outputTokens / 1000000) * 30);
        dailyCostCents += estCostCents;
        
        const execTimeMs = Date.now() - startTime;
        
        console.log(`[REQ ${requestId}] SUCCESS! 
Model: ${modelName}
Execution Time: ${execTimeMs}ms
Tokens: Input=${inputTokens} | Output=${outputTokens} | Total=${totalTokens}
Estimated Cost: $${(estCostCents / 100).toFixed(6)}
Daily Budget Used: $${(dailyCostCents / 100).toFixed(6)}`);
        
        break; // success, break retry loop
      } catch (genErr: any) {
        if (retries < MAX_RETRIES && genErr?.status === 429) {
          retries++;
          console.warn(`[REQ ${requestId}] 429 Rate Limit from Gemini. Retrying ${retries}/${MAX_RETRIES} in ${1000 * retries}ms...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        } else {
          throw genErr; // Rethrow if max retries exceeded or not a 429
        }
      }
    }

    inFlightRequests.delete(inFlightKey);

    const data = JSON.parse(response?.text || "{}");
    
    // Store in cache if not a greeting or casual chat
    if (!shouldBypassCache) {
      responseCache.set(cacheKey, { data, timestamp: Date.now() });
    }
    
    res.status(200).json(data);
  } catch (error: any) {
    // Ensure we clear in-flight requests on error
    const cacheKey = generateCacheKey(req.body);
    const inFlightKey = `${clientIp}_${cacheKey}`;
    inFlightRequests.delete(inFlightKey);
    
    const errMsg = typeof error?.message === 'string' ? error.message.toLowerCase() : JSON.stringify(error?.message || error).toLowerCase();
    const isCreditsDepleted = errMsg.includes('prepayment') || errMsg.includes('credits are depleted') || errMsg.includes('depleted') || errMsg.includes('resource_exhausted');
    const isRateLimit = !isCreditsDepleted && (error?.status === 429 || errMsg.includes('429') || errMsg.includes('quota'));
    const isUnavailable = error?.status === 503 || errMsg.includes('503') || errMsg.includes('unavailable') || errMsg.includes('overloaded');
    const isInvalidKey = errMsg.includes('api key not valid') || errMsg.includes('api_key_invalid') || error?.status === 401;
    
    if (!isInvalidKey) {
      console.error(`[REQ ${requestId}] Gemini API Request Failed:`, error?.message || error);
    }
    
    let friendlyError = "Failed to generate recipe. Please try again later.";
    const rawApiKey = process.env.GEMINI_API_KEY;
    const apiKey = rawApiKey ? rawApiKey.replace(/^["']|["']$/g, '').trim() : undefined;
    
    if (isInvalidKey || !apiKey) {
      friendlyError = "Invalid or missing Gemini API key. Please configure a valid API key in your environment or settings.";
    } else if (isCreditsDepleted) {
      friendlyError = "Freshi AI Chef is currently under active development and getting polished with new recipes! 🍳✨ This feature is in its building stage. Please check back soon!";
    } else if (isRateLimit) {
      friendlyError = "Recipe AI is currently experiencing high demand. Please try again in a few moments.";
    } else if (isUnavailable) {
      friendlyError = "Recipe AI is currently unavailable or overloaded. Please try again later.";
    }
    
    res.status(isInvalidKey || !apiKey ? 401 : (isCreditsDepleted || isRateLimit ? 429 : (isUnavailable ? 503 : 500))).json({ error: friendlyError });
  }
}
