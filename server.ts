import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

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
- Do NOT suggest any juices, beverages, or drinks unless explicitly part of the recipe. Focus on solid foods, spices, or garnishes.
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
- Do NOT suggest any juices, beverages, or drinks. Focus on solid foods, spices, or garnishes.
- Use the EXACT product name as it appears in the catalog.`;
      }
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
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
      console.error("Gemini API Error:", error);
      const errMsg = typeof error?.message === 'string' ? error.message : JSON.stringify(error?.message || error);
      const isCreditsDepleted = errMsg.includes('prepayment') || errMsg.includes('credits are depleted') || errMsg.includes('depleted') || errMsg.includes('RESOURCE_EXHAUSTED');
      const isRateLimit = !isCreditsDepleted && (error?.status === 429 || errMsg.includes('429') || errMsg.includes('quota'));
      const isUnavailable = error?.status === 503 || errMsg.includes('503') || errMsg.includes('UNAVAILABLE') || errMsg.includes('overloaded');
      
      let friendlyError = "Failed to generate recipe. Please try again later.";
      if (isCreditsDepleted) {
        friendlyError = "Freshi AI Chef is currently under active development and getting polished with new recipes! 🍳✨ This feature is in its building stage. Please check back soon!";
      } else if (isRateLimit) {
        friendlyError = "Recipe AI is currently experiencing high demand. Please try again in a few moments.";
      } else if (isUnavailable) {
        friendlyError = "Recipe AI is currently unavailable or overloaded. Please try again later.";
      }
      
      res.status(isCreditsDepleted || isRateLimit ? 429 : (isUnavailable ? 503 : 500)).json({ error: friendlyError });
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
