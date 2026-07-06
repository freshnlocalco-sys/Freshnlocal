import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: { 'User-Agent': 'aistudio-build' },
  }
});

async function run() {
  console.log("Starting...");
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Hello",
    });
    console.log("Success:", response.text);
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}
run();
