export type OpportunityTrack = "red-ocean-blue" | "blue-ocean-red" | "unmatched";

export type TrackProduct = { title: string; category: string; price: number; reviews: number; rating: number };
export type TrackAssessment = { companyFit: number; hiddenOpportunity: number; demand: number; hardRejected: boolean };

const mainstreamCategory = /sideboard|buffet|credenza|pantry|cabinet|bookcase|bookshelf|dresser|tv stand|media console|kitchen island|coffee bar|餐边柜|橱柜|书柜|斗柜|电视柜|岛台/i;
const designSignals: Array<[RegExp, string]> = [
  [/fluted|reeded|ripple|wave|tambour|波纹|格栅/i, "门板元素有识别度"],
  [/arched|arch\b|rounded|curved|拱形|弧形/i, "轮廓造型区别于普通标品"],
  [/rattan|cane|woven|藤编/i, "材质元素形成视觉差异"],
  [/asymmetric|geometric|mid-century|art deco|异形|几何/i, "风格与构图具有差异化"],
];
const nicheSignals: Array<[RegExp, string]> = [
  [/reptile|terrarium|爬宠|爬虫/i, "服务爬宠饲养的明确小众场景"],
  [/washer|dryer|laundry workstation|washing machine|洗衣机|洗衣房/i, "解决洗衣房工作台与收纳场景"],
  [/manicure|nail tech|nail desk|salon station|美甲/i, "服务美甲与沙龙专业工作场景"],
  [/reception desk|front counter|checkout counter|接待台|前台/i, "服务商业接待与收银场景"],
  [/litter box|cat enclosure|cat cabinet|dog crate|pet furniture|猫砂|宠物柜/i, "把宠物用品家具化"],
  [/trash can cabinet|trash can storage|trash cabinet|trash storage|trashcan cabinet|garbage cabinet|hidden trash|pull out trash|tilt.out.*trash|垃圾桶柜/i, "解决隐藏垃圾桶的明确功能痛点"],
  [/sewing|craft station|craft table|缝纫|手作/i, "服务手作与缝纫专业场景"],
];

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function classifyOpportunityTrack(product: TrackProduct, assessment: TrackAssessment) {
  const text = `${product.category} ${product.title}`;
  const nicheReasons = nicheSignals.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
  const designReasons = designSignals.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
  if (assessment.hardRejected || (assessment.companyFit < 45 && !nicheReasons.length)) return { track: "unmatched" as OpportunityTrack, score: 0, reasons: ["未通过公司能力或硬性条件"] };
  if (nicheReasons.length) {
    const validation = product.reviews >= 10 ? 12 : product.reviews > 0 ? 7 : 2;
    const priceRoom = product.price >= 200 ? 5 : product.price >= 130 ? 3 : 0;
    const score = clamp(assessment.companyFit * .34 + assessment.hiddenOpportunity * .18 + assessment.demand * .12 + validation + priceRoom + Math.min(22, nicheReasons.length * 14));
    return { track: "blue-ocean-red" as OpportunityTrack, score, reasons: [...nicheReasons, product.reviews > 0 ? "已有评论验证，属于可观察的细分市场" : "需求验证数据仍待补充"] };
  }
  if (mainstreamCategory.test(text) && designReasons.length) {
    const validation = Math.min(7, Math.log10(product.reviews + 1) * 3);
    const priceRoom = product.price >= 180 ? 4 : product.price >= 130 ? 2 : 0;
    const score = clamp(assessment.companyFit * .34 + assessment.hiddenOpportunity * .2 + assessment.demand * .12 + validation + priceRoom + Math.min(28, designReasons.length * 16));
    return { track: "red-ocean-blue" as OpportunityTrack, score, reasons: ["成熟柜类具备稳定基础需求", ...designReasons] };
  }
  return { track: "unmatched" as OpportunityTrack, score: 0, reasons: ["尚未发现足够明确的造型创新或小众场景价值"] };
}

export const trackLabels: Record<OpportunityTrack, string> = { "red-ocean-blue": "红海中的蓝海", "blue-ocean-red": "蓝海中的红海", unmatched: "方向不匹配" };
