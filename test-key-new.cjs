const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.TEST_API_KEY });
async function test() {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'hello'
    });
    console.log("Success:", res.text);
  } catch (err) {
    console.error("Error:", err.message);
  }
}
test();
