import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

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
    res.status(200).json(data);
  } catch (error: any) {
    console.error(error);
    const errMsg = typeof error?.message === 'string' ? error.message.toLowerCase() : JSON.stringify(error?.message || error).toLowerCase();
    const isCreditsDepleted = errMsg.includes('prepayment') || errMsg.includes('credits are depleted') || errMsg.includes('depleted') || errMsg.includes('resource_exhausted');
    const isRateLimit = !isCreditsDepleted && (error?.status === 429 || errMsg.includes('429') || errMsg.includes('quota'));
    const isUnavailable = error?.status === 503 || errMsg.includes('503') || errMsg.includes('unavailable') || errMsg.includes('overloaded');
    
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
}
