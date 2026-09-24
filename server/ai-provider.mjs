// 业务层只依赖 generateSuggestion；不同云服务的 HTTP 细节留在各自适配器。
export function aiConfig(env = process.env) {
  const provider = String(env.AI_PROVIDER ?? "").trim().toLowerCase();
  const model = String(env.AI_MODEL ?? "").trim();
  const key = String(env.AI_API_KEY ?? "").trim();
  return { provider, model, configured: provider === "gemini" && Boolean(model && key) };
}

async function geminiGenerate(prompt, { model, key, signal, fetchFn }) {
  const timeout = AbortSignal.timeout(25_000);
  const response = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Gemini 已限流或额度不足，请直接人工标注或稍后再试");
    throw new Error(`Gemini 暂不可用（HTTP ${response.status}），可直接人工标注`);
  }
  const body = await response.json();
  const rawText = body?.candidates?.[0]?.content?.parts?.filter((part) => typeof part.text === "string").map((part) => part.text).join("") ?? "";
  if (!rawText) throw new Error("Gemini 没有返回可用建议，可直接人工标注");
  return rawText;
}

const providers = { gemini: geminiGenerate };

export async function generateSuggestion(prompt, { env = process.env, fetchFn = fetch, signal } = {}) {
  const { provider, model, configured } = aiConfig(env);
  if (!configured) throw new Error("AI 未配置，仍可直接人工标注");
  try {
    const rawText = await providers[provider](prompt, { model, key: env.AI_API_KEY, fetchFn, signal });
    return { rawText, provider, model };
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error("AI 请求超时，可直接人工标注或稍后再试");
    if (error instanceof TypeError) throw new Error("AI 服务暂时无法连接，可直接人工标注");
    throw error;
  }
}
