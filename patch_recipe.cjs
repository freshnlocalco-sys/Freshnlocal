const fs = require('fs');
const file = 'api/gemini/recipe.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
`const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});`,
`let aiClient: GoogleGenAI | null = null;

function getAIClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    const keyExists = !!apiKey;
    const keyLength = apiKey ? apiKey.length : 0;
    const keyStart = apiKey ? apiKey.substring(0, 4) : 'none';
    console.log(\`[DEBUG] API Key Check: exists=\${keyExists}, length=\${keyLength}, startsWith=\${keyStart}\`);
    
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
}`
);

code = code.replace(
`const response = await ai.models.generateContent({`,
`const ai = getAIClient();
    const response = await ai.models.generateContent({`
);

code = code.replace(
`    const isUnavailable = error?.status === 503 || errMsg.includes('503') || errMsg.includes('unavailable') || errMsg.includes('overloaded');
    
    let friendlyError = "Failed to generate recipe. Please try again later.";
    if (isCreditsDepleted) {`,
`    const isUnavailable = error?.status === 503 || errMsg.includes('503') || errMsg.includes('unavailable') || errMsg.includes('overloaded');
    const isInvalidKey = errMsg.includes('api key not valid') || errMsg.includes('api_key_invalid') || error?.status === 400 || error?.status === 401;
    
    if (!isInvalidKey && !isCreditsDepleted && !isRateLimit && !isUnavailable) {
      console.error("Gemini API Request Failed:", error?.message || error);
    }
    
    let friendlyError = "Failed to generate recipe. Please try again later.";
    if (isInvalidKey || !process.env.GEMINI_API_KEY) {
      friendlyError = "Invalid or missing Gemini API key. Please configure a valid API key in your environment or settings.";
    } else if (isCreditsDepleted) {`
);

code = code.replace(
`    res.status(isCreditsDepleted || isRateLimit ? 429 : (isUnavailable ? 503 : 500)).json({ error: friendlyError });`,
`    res.status(isInvalidKey || !process.env.GEMINI_API_KEY ? 401 : (isCreditsDepleted || isRateLimit ? 429 : (isUnavailable ? 503 : 500))).json({ error: friendlyError });`
);

fs.writeFileSync(file, code);
