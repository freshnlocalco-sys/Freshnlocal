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
      const { products, catalog } = req.body;
      const catalogText = catalog ? catalog.join(" | ") : "";
      
      const prompt = `You are a culinary AI for FNL Recipes. The user has selected these ingredients they already have: ${products.join(", ")}.
      
1. Provide a delicious recipe using some or all of these ingredients. Format it in Markdown.
2. Recommend 2 to 4 OTHER complementary products that the user should buy from our store to make this recipe even better (e.g. spices, garnishes, side dishes, or premium ingredients).

CRITICAL INSTRUCTIONS FOR RECOMMENDATIONS:
- You MUST select recommendations ONLY from the following exact store catalog:
[ ${catalogText} ]
- Do NOT suggest any product that is already in the user's selected list.
- Use the EXACT product name as it appears in the catalog.`;
      
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
      console.error(error);
      res.status(500).json({ error: error.message || "Failed to generate recipe" });
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
