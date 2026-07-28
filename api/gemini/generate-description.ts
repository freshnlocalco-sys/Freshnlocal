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

// Security & Budgeting: In-memory stores
const rateLimitStore = new Map<string, { count: number, resetTime: number }>();
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  
  // 1. Rate Limiting Check
  const now = Date.now();
  let rlData = rateLimitStore.get(clientIp as string);
  if (!rlData || now > rlData.resetTime) {
    rlData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  }
  rlData.count++;
  rateLimitStore.set(clientIp as string, rlData);
  
  if (rlData.count > MAX_REQUESTS_PER_WINDOW * 5) {
    console.warn(`[DESC-REQ ${requestId}] Rate limit exceeded for IP: ${clientIp}`);
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }

  try {
    checkAndResetBudget();
    if (circuitBreakerTripped || dailyCostCents > DAILY_BUDGET_CENTS) {
      circuitBreakerTripped = true;
      console.warn(`[DESC-REQ ${requestId}] Daily AI budget exceeded.`);
      return res.status(429).json({ error: "Daily AI usage limit reached." });
    }

    const { name, category, unit } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: "Product name and category are required." });
    }

    // Check Cache
    const cacheKey = crypto.createHash("sha256").update(`desc_${name}_${category}`).digest("hex");
    const cachedResponse = responseCache.get(cacheKey);
    if (cachedResponse && (now - cachedResponse.timestamp < CACHE_TTL_MS)) {
      console.log(`[DESC-REQ ${requestId}] Returning CACHED response for description of: "${name}"`);
      return res.status(200).json(cachedResponse.data);
    }

    const prompt = `You are an expert food content writer for freshnlocal.co, a premium fresh produce D2C e-commerce brand based in Surat, Gujarat, India.
Your task is to write a unique, highly engaging product description for: "${name}" (Category: ${category}${unit ? `, Unit: ${unit}` : ''}).

STRICT CONTENT & WRITING RULES:
1. The DESCRIPTION must be exactly between 60 and 90 words.
2. It must have a completely distinct sentence structure and opening line. Do NOT reuse templates or identical starting phrases from other products.
3. Include the following elements, woven naturally into smooth, flowing prose (NEVER use bullet points):
   - What the product is and its variety/origins if applicable.
   - Key nutrients: protein, fiber, vitamins, and minerals. Cite approximate figures per 100g where commonly known as "approx." (never state clinical values as exact, undisputed facts).
   - Common traditional culinary uses in Indian households, especially in Western India / Gujarat if relevant (e.g., in curries, subzis, undhiyu, salads, dals, garnishes, etc.).
   - Exactly one clear, practical tip on how to select or store it to keep it fresh.
4. CRITICAL: Do NOT make medical, therapeutic, or curing claims. Avoid words like "cures," "treats," "boosts immunity," "prevents disease," "reduces cholesterol," "heals," or similar medicinal language. Use general health, wellness, and vitality-boosting associations instead.
5. The content must be completely original and creative. Do NOT copy known brand descriptions or Wikipedia copy.
6. Provide a separate SEO META DESCRIPTION that is under 155 characters. It must be completely different in phrasing from the main description, summarizing the product beautifully to drive clicks.

Format your output exactly as a JSON object with these keys:
- description: (a string containing the 60-90 words description)
- metaDescription: (a string containing the SEO meta description under 155 characters)`;

    const ai = getAIClient();
    if (!ai) {
      return res.status(500).json({ error: "Gemini API client not initialized." });
    }

    let response;
    let retries = 0;
    const MAX_RETRIES = 2;
    const modelName = "gemini-3.6-flash"; // Smarter default model that follows complex prompt instructions perfectly
    
    while (retries <= MAX_RETRIES) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            maxOutputTokens: 500, // Safe limit for description and meta description
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                description: { type: "STRING" },
                metaDescription: { type: "STRING" }
              },
              required: ["description", "metaDescription"]
            }
          }
        });
        
        const usage = response.usageMetadata;
        const inputTokens = usage?.promptTokenCount || 0;
        const outputTokens = usage?.candidatesTokenCount || 0;
        const totalTokens = usage?.totalTokenCount || 0;
        const estCostCents = ((inputTokens / 1000000) * 7.5) + ((outputTokens / 1000000) * 30);
        dailyCostCents += estCostCents;
        
        const execTimeMs = Date.now() - startTime;
        
        console.log(`[DESC-REQ ${requestId}] SUCCESS! 
Model: ${modelName}
Product: ${name}
Execution Time: ${execTimeMs}ms
Tokens: Input=${inputTokens} | Output=${outputTokens} | Total=${totalTokens}
Estimated Cost: $${(estCostCents / 100).toFixed(6)}
Daily Budget Used: $${(dailyCostCents / 100).toFixed(6)}`);
        
        break; // success
      } catch (genErr: any) {
        if (retries < MAX_RETRIES && genErr?.status === 429) {
          retries++;
          console.warn(`[DESC-REQ ${requestId}] 429 Rate Limit from Gemini. Retrying ${retries}/${MAX_RETRIES} in ${1000 * retries}ms...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        } else {
          throw genErr; // Rethrow if max retries exceeded or not a 429
        }
      }
    }

    const data = JSON.parse(response?.text || "{}");
    
    // Store in cache
    responseCache.set(cacheKey, { data, timestamp: Date.now() });
    
    return res.status(200).json(data);
  } catch (error: any) {
    console.error(`[DESC-REQ] Gemini description generation failed:`, error?.message || error);
    return res.status(500).json({ error: error?.message || "Failed to generate product description." });
  }
}
