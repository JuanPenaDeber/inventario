import { GoogleGenAI, Type } from "@google/genai";

const getAiClient = () => {
  // In a real app, never expose keys on client. Use a proxy.
  // For this demo, we assume process.env.API_KEY is available.
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const analyzeInventoryImage = async (base64Image: string) => {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

  try {
    // Remove data URL prefix if present for the API call
    const base64Data = base64Image.split(',')[1];

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          },
          {
            text: "Analyze this inventory item. Identify the object name, a general category (e.g., Electronics, Furniture, Tools), its apparent condition, and an estimated value in USD. Return strictly JSON."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            condition: { type: Type.STRING },
            estimatedValue: { type: Type.NUMBER }
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return null;
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    throw error;
  }
};
