import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getAIClient() {
  if (!aiClient) {
    const rawApiKey = process.env.GEMINI_API_KEY;
    const apiKey = rawApiKey ? rawApiKey.replace(/^["']|["']$/g, '').trim() : undefined;
    const keyExists = !!apiKey;
    const keyLength = apiKey ? apiKey.length : 0;
    const keyStart = apiKey ? apiKey.substring(0, 4) : 'none';
    console.log(`[DEBUG] API Key Check: exists=${keyExists}, length=${keyLength}, startsWith=${keyStart}`);
    
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // API routes FIRST
  app.post("/api/gemini/recipe", async (req, res) => {
    try {
      const { products, catalog, preferences, recipeName } = req.body;
      const catalogText = catalog ? catalog.join(" | ") : "";
      
      const preferencesText = preferences && preferences.length > 0 ? ` The user has the following preferences for the recipe: ${preferences.join(", ")}.` : "";
      
      let prompt = '';
      if (recipeName) {
        prompt = `You are "Freshi", a culinary and grocery AI assistant for FreshNLocal.CO (a premium fresh produce delivery engine in Surat). The user wants to make a specific recipe or asked a question: "${recipeName}".${preferencesText}
        
CRITICAL GUARD RAILS:
- You MUST ONLY answer questions or provide recipes that are related to food, cooking, culinary arts, groceries, fresh produce, or the FreshNLocal business.
- If the user's request is NOT related to these topics, you MUST politely refuse to answer and remind them that you are a culinary assistant for FreshNLocal. In this case, return the refusal message in the \`recipeMarkdown\` field and an empty array for \`suggestedProductNames\`. Do not provide a recipe.

If the request IS related to food or cooking:
1. Provide the full recipe for "${recipeName}" (or answer their food-related question), including the required ingredients and step-by-step instructions if applicable. Format it in Markdown. Use proper spacing and newline characters (e.g. \\n\\n) to ensure headings and paragraphs are correctly formatted.
2. Recommend ALL complementary products (ingredients) that the user should buy from our store to make this recipe. Identify as many required ingredients from the catalog as possible.

CRITICAL INSTRUCTIONS FOR RECOMMENDATIONS:
- You MUST select recommendations ONLY from the following exact store catalog:
[ ${catalogText} ]
- You MUST NEVER suggest, recommend, or add any FNL Juices, juices, cold-pressed juices, beverages, or drinks in either the recipe markdown or the suggested products, even if they are part of the catalog or the user asks for them. We do not sell juices for recipes. Focus strictly on solid foods, fresh produce, groceries, spices, or garnishes.
- Use the EXACT product name as it appears in the catalog.`;
      } else {
        prompt = `You are "Freshi", a culinary and grocery AI assistant for FreshNLocal.CO. The user has selected these ingredients they already have: ${products.join(", ")}.${preferencesText}
        
CRITICAL GUARD RAILS:
- You MUST ONLY answer questions or provide recipes that are related to food, cooking, culinary arts, groceries, fresh produce, or the FreshNLocal business.
- If the user's request is somehow NOT related to these topics (even with ingredients provided), politely refuse in the \`recipeMarkdown\` field.

If the request IS related to food or cooking:
1. Provide a delicious recipe using some or all of these ingredients. Format it in Markdown. Use proper spacing and newline characters (e.g. \\n\\n) to ensure headings and paragraphs are correctly formatted.
2. Recommend ALL OTHER complementary products that the user should buy from our store to make this recipe even better. Identify as many required ingredients from the catalog as possible.

CRITICAL INSTRUCTIONS FOR RECOMMENDATIONS:
- You MUST select recommendations ONLY from the following exact store catalog:
[ ${catalogText} ]
- Do NOT suggest any product that is already in the user's selected list.
- You MUST NEVER suggest, recommend, or add any FNL Juices, juices, cold-pressed juices, beverages, or drinks in either the recipe markdown or the suggested products, even if they are part of the catalog or the user asks for them. We do not sell juices for recipes. Focus strictly on solid foods, fresh produce, groceries, spices, or garnishes.
- Use the EXACT product name as it appears in the catalog.`;
      }
      
      const ai = getAIClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
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

      const data = JSON.parse(response.text || "{}");
      res.json(data);
    } catch (error: any) {
      const errMsg = typeof error?.message === 'string' ? error.message.toLowerCase() : JSON.stringify(error?.message || error).toLowerCase();
      const isCreditsDepleted = errMsg.includes('prepayment') || errMsg.includes('credits are depleted') || errMsg.includes('depleted') || errMsg.includes('resource_exhausted');
      const isRateLimit = !isCreditsDepleted && (error?.status === 429 || errMsg.includes('429') || errMsg.includes('quota'));
      const isUnavailable = error?.status === 503 || errMsg.includes('503') || errMsg.includes('unavailable') || errMsg.includes('overloaded');
      const isInvalidKey = errMsg.includes('api key not valid') || errMsg.includes('api_key_invalid') || error?.status === 401;
      
      if (!isInvalidKey) {
        console.error("Gemini API Request Failed:", error?.message || error);
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
  });

  // API route for generating high-fidelity product description & SEO meta description
  app.post("/api/gemini/generate-description", async (req, res) => {
    try {
      const { name, category, unit } = req.body;
      if (!name || !category) {
        return res.status(400).json({ error: "Product name and category are required." });
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

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
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

      const data = JSON.parse(response.text || "{}");
      res.json(data);
    } catch (error: any) {
      console.error("Gemini description generation failed:", error?.message || error);
      res.status(500).json({ error: error?.message || "Failed to generate product description." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
