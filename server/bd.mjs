// Bright Data Web Unlocker 客户端：抓 URL 返回 markdown。
// key 解析顺序：环境变量 BRIGHTDATA_API_KEY > CLI 登录后保存的 credentials.json（bdata login 零配置）。
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function resolveApiKey() {
  if (process.env.BRIGHTDATA_API_KEY) return process.env.BRIGHTDATA_API_KEY;
  for (const dir of [join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "brightdata-cli"), join(homedir(), ".brightdata")]) {
    const file = join(dir, "credentials.json");
    if (!existsSync(file)) continue;
    try {
      const key = JSON.parse(readFileSync(file, "utf8")).api_key;
      if (key) return key;
    } catch {
      // 文件损坏就当没有，继续找下一个位置
    }
  }
  return "";
}

export function bdConfigured() {
  return Boolean(resolveApiKey());
}

class RateLimited extends Error {}

// 单次抓取：只按成功请求计费；Bright Data 的自适应限流（"retry in a few seconds"）返回短文本且不计费，
// 等 10 秒免费重试，最多 2 次；仍失败就抛错由调用方决定跳过（v1 教训：单页失败不阻断批次）
export async function bdFetchMarkdown(url, { zone = process.env.BRIGHTDATA_UNLOCKER_ZONE || "cli_unlocker", country = "us", timeoutMs = 90_000, retries = 2 } = {}) {
  const apiKey = resolveApiKey();
  if (!apiKey) throw new Error("未配置 Bright Data：先 bdata login 或设置 BRIGHTDATA_API_KEY");
  let lastError = new Error("未执行");
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, zone, format: "raw", data_format: "markdown", country }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Bright Data ${response.status}：${detail.slice(0, 160)}`);
      }
      const text = await response.text();
      if (text.length < 500 || /rate limit|retry in/i.test(text.slice(0, 200))) {
        throw new RateLimited(`Bright Data 限流：${text.slice(0, 80)}`);
      }
      return text;
    } catch (error) {
      lastError = error;
      const rateLimited = error instanceof RateLimited;
      if (!rateLimited || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
