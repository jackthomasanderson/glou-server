import fetch from "node-fetch";

export async function fetchFoodPairingSuggestions({
  prompt,
  apiKey,
  model = "gpt-3.5-turbo",
  systemPrompt = "Tu es un sommelier expert. Pour chaque plat ou bouteille, propose des accords précis et justifiés, format JSON.",
  maxTokens = 512,
  temperature = 0.7,
}: {
  prompt: string;
  apiKey: string;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<any> {
  const url = "https://api.openai.com/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    max_tokens: maxTokens,
    temperature,
  });
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}
