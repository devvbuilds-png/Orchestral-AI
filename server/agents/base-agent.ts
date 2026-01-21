import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export const DEFAULT_MODEL = "gpt-5";

export interface AgentContext {
  sessionId: string;
  productType: "b2b" | "b2c" | "hybrid";
  primaryMode?: "b2b" | "b2c";
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "text" | "json";
  } = {}
): Promise<string> {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 4096,
    responseFormat = "text",
  } = options;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: maxTokens,
      ...(responseFormat === "json" && { response_format: { type: "json_object" } }),
    });

    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("LLM call failed:", error);
    throw error;
  }
}

export async function* streamLLM(
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    maxTokens?: number;
  } = {}
): AsyncGenerator<string> {
  const { model = DEFAULT_MODEL, maxTokens = 4096 } = options;

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        yield content;
      }
    }
  } catch (error) {
    console.error("LLM stream failed:", error);
    throw error;
  }
}

export function parseJSONResponse<T>(response: string): T | null {
  try {
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) ||
                      response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr) as T;
    }
    
    return JSON.parse(response) as T;
  } catch (error) {
    console.error("Failed to parse JSON response:", error);
    console.error("Response was:", response.substring(0, 500));
    return null;
  }
}
