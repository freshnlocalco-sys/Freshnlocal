const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  try {
    const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: "Hello",
    });
    console.log(response.text);
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
