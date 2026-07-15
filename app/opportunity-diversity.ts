export type DiversityProduct = { asin: string; title: string; category: string };

const familyPatterns: Array<[RegExp, string]> = [
  [/sideboard|buffet|credenza/i, "餐边柜与边柜"],
  [/pantry|kitchen hutch/i, "橱柜与厨房高柜"],
  [/coffee bar|bar cabinet|mini fridge/i, "咖啡吧与酒柜"],
  [/tv stand|media console|entertainment center/i, "电视与媒体柜"],
  [/bookcase|bookshelf|display cabinet/i, "书架与展示柜"],
  [/dresser|chest of drawers/i, "斗柜"],
  [/shoe cabinet|hall tree|entryway/i, "玄关与鞋柜"],
  [/kitchen island|trash can|garbage cabinet|hidden trash/i, "厨房岛与隐藏垃圾柜"],
  [/reptile|terrarium/i, "爬宠箱与爬宠家具"],
  [/washer|dryer|laundry workstation/i, "洗衣机工作台"],
  [/litter box|cat enclosure|cat cabinet/i, "猫砂柜"],
  [/dog crate|dog kennel|pet furniture/i, "宠物家具"],
  [/manicure|nail desk|nail table|salon station/i, "美甲与沙龙工作台"],
  [/reception|front counter|checkout counter/i, "商业前台"],
  [/sewing|craft station|craft table/i, "缝纫与手作工作台"],
  [/record player|vinyl/i, "黑胶与影音家具"],
  [/printer stand|file cabinet|filing cabinet/i, "办公收纳"],
];

export function opportunityFamily(product: DiversityProduct) {
  const text = `${product.category} ${product.title}`;
  return familyPatterns.find(([pattern]) => pattern.test(text))?.[1]
    ?? product.category.split(/[\/／]/)[0].trim()
    ?? "其他";
}

export function diversifyOpportunityRows<T extends DiversityProduct>(rows: T[], maxPerFamily = Number.POSITIVE_INFINITY) {
  const buckets = new Map<string, T[]>();
  for (const product of rows) {
    const family = opportunityFamily(product);
    buckets.set(family, [...(buckets.get(family) ?? []), product]);
  }
  const result: T[] = [];
  for (let index = 0; [...buckets.values()].some((bucket) => index < Math.min(bucket.length, maxPerFamily)); index++) {
    for (const bucket of buckets.values()) if (bucket[index] && index < maxPerFamily) result.push(bucket[index]);
  }
  return result;
}

export function opportunityFamilyCount(products: DiversityProduct[]) {
  return new Set(products.map(opportunityFamily)).size;
}
