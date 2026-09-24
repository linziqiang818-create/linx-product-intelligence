// 稳定的原因代码用于历史记录和以后统计；界面文案可以调整，代码含义不能改。
export const REASONS = Object.freeze([
  { code: "MARKET_GAP", category: "market", label: "市场存在供给缺口" },
  { code: "NEW_PRODUCT_VALIDATED", category: "market", label: "新品已验证需求" },
  { code: "LOW_REVIEW_BARRIER", category: "market", label: "评论壁垒较低" },
  { code: "SALES_VALIDATED", category: "market", label: "销量验证" },
  { code: "PRICE_MARGIN_ROOM", category: "economics", label: "价格或利润留有空间" },
  { code: "VISUAL_DIFFERENTIATION", category: "differentiation", label: "视觉差异" },
  { code: "STRUCTURAL_DIFFERENTIATION", category: "differentiation", label: "结构差异" },
  { code: "FUNCTIONAL_DIFFERENTIATION", category: "differentiation", label: "功能差异" },
  { code: "NICHE_SCENARIO", category: "demand", label: "细分使用场景" },
  { code: "USER_PAIN_POINT", category: "demand", label: "明确的用户痛点" },
  { code: "CLEAR_IMPROVEMENT_SPACE", category: "development", label: "改款落点清晰" },
  { code: "FACTORY_FIT", category: "feasibility", label: "工厂能够实现" },
  { code: "PACKAGING_SHIPPING_FIT", category: "feasibility", label: "包装运输可行" },
  { code: "SPECIFIC_FEATURE_REFERENCE", category: "reference", label: "值得借鉴的局部" },
  { code: "OTHER", category: "other", label: "其他原因" },
]);

const byCode = new Map(REASONS.map((reason) => [reason.code, reason]));
export const REASON_SCOPES = ["whole", "local"];
export const REFERENCE_SCOPES = ["unspecified", "whole", "local", "both"];
export const DECISIONS = ["unconfirmed", "want", "maybe", "reject"];

export function normalizeReasons(input, { suggestion = false } = {}) {
  if (!Array.isArray(input) || input.length > 20) throw new Error("原因必须是最多 20 条的列表");
  return input.map((item) => {
    const code = String(item?.reason_code ?? "");
    const definition = byCode.get(code);
    if (!definition) throw new Error(`未知原因代码：${code}`);
    const scope = String(item?.scope ?? "whole");
    if (!REASON_SCOPES.includes(scope)) throw new Error("原因范围无效");
    const detail = String(item?.detail ?? "").trim().slice(0, 500);
    if (code === "OTHER" && !detail) throw new Error("其他原因需要填写说明");
    const result = { reason_code: code, category: definition.category, scope, detail };
    if (suggestion) {
      result.evidenceFields = Array.isArray(item?.evidenceFields)
        ? item.evidenceFields.map(String).slice(0, 8)
        : [];
    }
    return result;
  });
}
