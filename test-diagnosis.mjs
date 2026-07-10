import { GoogleGenAI } from "@google/genai";
import fetch from "node-fetch";

const apiKey = process.env.GEMINI_API_KEY || "";

function maskKey(key) {
  if (!key) return "NO_KEY";
  if (key.length <= 10) return "****";
  return key.substring(0, 6) + "...(masked)..." + key.substring(key.length - 4);
}

console.log("1. API Key being used at runtime:", maskKey(apiKey));
console.log("2. Using model: gemini-2.5-flash");

async function runDiagnosis() {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  console.log("4. Endpoint URL:", endpoint.replace(apiKey, maskKey(apiKey)));
  
  console.log("5. Sending test request to Gemini API...");
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Hello" }] }]
      })
    });
    
    console.log("\n6. Complete HTTP Response:");
    console.log("HTTP Status:", response.status, response.statusText);
    
    const headers = {};
    for (const [key, value] of response.headers.entries()) {
      headers[key] = value;
    }
    console.log("Headers:", JSON.stringify(headers, null, 2));
    
    const data = await response.json();
    console.log("Full JSON Response:");
    console.log(JSON.stringify(data, null, 2));
    
    if (data.error) {
       console.log("\nError Code:", data.error.code);
       console.log("Error Message:", data.error.message);
       console.log("Error Status:", data.error.status);
    }
    
  } catch (err) {
    console.error("Failed to fetch:", err);
  }
}

runDiagnosis();
