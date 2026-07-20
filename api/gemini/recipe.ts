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

    // 2. Cache Check
    const cacheKey = generateCacheKey(req.body);
    const cachedResponse = bypassCache ? null : responseCache.get(cacheKey);
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
      prompt = `You are "Freshi", a culinary and grocery AI assistant for FreshNLocal.CO (a premium fresh produce delivery engine in Surat). ${historyContext}The user wants to make a specific recipe, has a follow-up request, or asked a question: "${recipeName}".${preferencesText}
      
CRITICAL GUARD RAILS:
- You MUST ONLY answer questions or provide recipes that are related to food, cooking, culinary arts, groceries, fresh produce, or the FreshNLocal business.
- If the user's request is NOT related to these topics, you MUST politely refuse to answer and remind them that you are a culinary assistant for FreshNLocal. In this case, return the refusal message in the \`recipeMarkdown\` field and an empty array for \`suggestedProductNames\`. Do not provide a recipe.

If the request IS related to food or cooking:
1. Provide the full recipe (or answer their food-related question/follow-up), including the required ingredients and step-by-step instructions if applicable. Format it in Markdown. Use proper spacing and newline characters (e.g. \\n\\n) to ensure headings and paragraphs are correctly formatted.
2. Recommend ALL complementary products (ingredients, garnishes, sides, or spices) from our catalog that the user should buy from our store to make this recipe or dish. Identify as many required ingredients from the catalog as possible (aim for at least 3-6 product recommendations from our catalog if they are relevant to the recipe).

CRITICAL INSTRUCTIONS FOR VARIETY & RECOMMENDATIONS:
- To keep things exciting and diverse, you MUST NOT generate the exact same recipe every time. Use a wide variety of fresh vegetables, exotic fruits, herbs, and local spices from the catalog.
- Check the 'Recent Chat History' if provided. If you have already suggested a specific recipe earlier in this chat session, you MUST suggest a completely different, unique recipe or a highly creative variation. DO NOT repeat the same recipe under any circumstances!
- You MUST select recommendations ONLY from the following exact store catalog:
[ ${catalogText} ]
- Try to recommend MORE items from the catalog that fit well into the recipe to make it complete (e.g. key ingredients, seasonings, fresh garnishes).
- You MUST NEVER suggest, recommend, or add any FNL Juices, juices, cold-pressed juices, beverages, or drinks in either the recipe markdown or the suggested products. Focus strictly on solid foods, fresh produce, groceries, spices, or garnishes.
- Use the EXACT product name as it appears in the catalog.`;
    } else {
      prompt = `You are "Freshi", a culinary and grocery AI assistant for FreshNLocal.CO. ${historyContext}The user has selected these ingredients they already have: ${(products || []).join(", ")}.${preferencesText}
      
CRITICAL GUARD RAILS:
- You MUST ONLY answer questions or provide recipes that are related to food, cooking, culinary arts, groceries, fresh produce, or the FreshNLocal business.
- If the user's request is somehow NOT related to these topics (even with ingredients provided), politely refuse in the \`recipeMarkdown\` field.

If the request IS related to food or cooking:
1. Provide a delicious recipe using some or all of these ingredients. Format it in Markdown. Use proper spacing and newline characters (e.g. \\n\\n) to ensure headings and paragraphs are correctly formatted.
2. Recommend ALL OTHER complementary products that the user should buy from our store to make this recipe even better. Identify as many required ingredients from the catalog as possible (aim for at least 3-6 product recommendations from our catalog if they are relevant to the recipe).

CRITICAL INSTRUCTIONS FOR VARIETY & RECOMMENDATIONS:
- To keep things exciting and diverse, you MUST NOT generate the exact same recipe every time. Be creative and explore different culinary directions (e.g. street food, gourmet, light snack, traditional Indian/Gujarati, or healthy options).
- Check the 'Recent Chat History' if provided. If you have already suggested a specific recipe earlier in this chat session, you MUST suggest a completely different, unique recipe or a highly creative variation. DO NOT repeat the same recipe under any circumstances!
- You MUST select recommendations ONLY from the following exact store catalog:
[ ${catalogText} ]
- Do NOT suggest any product that is already in the user's selected list.
- Try to recommend MORE items from the catalog that fit well into the recipe to make it complete (e.g. key ingredients, seasonings, fresh garnishes).
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
        const modelName = "gemini-3.1-flash-lite"; // Fully supported ultra-low-cost model
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature: 1.0, // High temperature to encourage diverse and creative recipes
            maxOutputTokens: 4000, // Safe limit allowing for reasoning and complete JSON output
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                recipeMarkdown: { type: "STRING" },
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
    
    // Store in cache
    responseCache.set(cacheKey, { data, timestamp: Date.now() });
    
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
