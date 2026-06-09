import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set in environment");
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export interface CallOpenAIParams {
  systemPrompt: string;
  userMessage: string;
}

export async function callOpenAI(params: CallOpenAIParams): Promise<string> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const client = getClient();

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessage },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

// Uses the Responses API with built-in web_search_preview — no extra API key needed.
// OpenAI handles the search loop automatically and returns the final grounded response.
export async function callOpenAIWithWebSearch(params: CallOpenAIParams): Promise<string> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const client = getClient();

  const response = await client.responses.create({
    model,
    instructions: params.systemPrompt,
    input: params.userMessage,
    tools: [{ type: "web_search_preview" }],
  });

  return response.output_text;
}
