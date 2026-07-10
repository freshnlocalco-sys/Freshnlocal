console.log("Key from env:", process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 5)}... (len ${process.env.GEMINI_API_KEY.length})` : "undefined");
