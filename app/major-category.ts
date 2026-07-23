export type MajorCategoryProduct = {
  title: string;
  category: string;
};

export type MajorCategory = {
  id: string;
  zh: string;
  en: string;
  pattern: RegExp;
};

export const majorCategories: readonly MajorCategory[] = [
  { id: "sideboards-buffets", zh: "餐边柜与边柜", en: "Sideboards & Buffets", pattern: /sideboard|buffet|credenza|餐边柜|边柜/i },
  { id: "bookcases-display", zh: "书架与展示柜", en: "Bookcases & Display Cabinets", pattern: /bookcase|bookshelf|display cabinet|display shel|curio cabinet|书架|展示柜/i },
  { id: "kitchen-islands", zh: "厨房岛台与餐车", en: "Kitchen Islands & Carts", pattern: /kitchen island|storage island|island cart|rolling island|厨房岛|岛台|餐车/i },
  { id: "reception-furniture", zh: "前台与接待家具", en: "Reception Room Furniture", pattern: /reception|front counter|checkout counter|podium|lectern|前台|接待台|讲台/i },
  { id: "pantries-kitchen-storage", zh: "厨房高柜与储物柜", en: "Pantries & Kitchen Storage", pattern: /pantr|kitchen hutch|kitchen cabinet|橱柜|厨房高柜/i },
  { id: "bar-wine-cabinets", zh: "咖啡吧与酒柜", en: "Bar & Wine Cabinets", pattern: /coffee bar|bar cabinet|wine cabinet|wine rack|mini fridge|酒柜|咖啡吧/i },
  { id: "tv-media", zh: "电视与媒体家具", en: "TV & Media Furniture", pattern: /tv stand|media console|entertainment center|audio-visual|av cart|电视柜|媒体柜/i },
  { id: "dressers-bedroom-storage", zh: "斗柜与卧室收纳", en: "Dressers & Bedroom Storage", pattern: /dresser|chest of drawers|nightstand|bedroom armoire|bedroom cabinet|斗柜|床头柜|卧室收纳/i },
  { id: "entryway-shoe-storage", zh: "玄关与鞋柜", en: "Entryway & Shoe Storage", pattern: /shoe cabinet|shoe rack|shoe organizer|hall tree|entryway|storage bench|鞋柜|鞋架|玄关/i },
  { id: "salon-vanity", zh: "美甲沙龙与梳妆台", en: "Salon & Vanity Furniture", pattern: /manicure|nail table|nail desk|salon|vanit|makeup table|美甲|沙龙|梳妆/i },
  { id: "craft-sewing", zh: "缝纫与手作家具", en: "Craft & Sewing Furniture", pattern: /sewing|craft station|craft table|puzzle table|缝纫|手作|拼图桌/i },
  { id: "desks-workstations", zh: "书桌与工作台", en: "Desks & Workstations", pattern: /desk|workstation|computer table|writing table|书桌|办公桌|工作台/i },
  { id: "office-storage", zh: "办公收纳", en: "Office Storage", pattern: /file cabinet|filing cabinet|printer stand|office cabinet|storage locker|办公收纳|文件柜/i },
  { id: "tables-dining", zh: "餐桌与桌类", en: "Tables & Dining Sets", pattern: /dining table|table & chair set|table and chair set|coffee table|console table|sofa table|end table|conference room table|utility table|餐桌|茶几|边桌/i },
  { id: "beds-bedroom", zh: "床与卧室家具", en: "Beds & Bedroom Furniture", pattern: /\bbed\b|bed frame|headboard|footboard|bedroom set|adjustable base|床架|床头板|卧室套装/i },
  { id: "pet-furniture", zh: "宠物家具与宠物箱", en: "Pet Furniture & Habitats", pattern: /pet supplies|dog crate|dog house|cat tree|cat house|cat condo|litter box|reptile|terrarium|aquarium|animal cage|hutch|宠物|猫砂|爬宠|水族/i },
  { id: "trash-laundry", zh: "隐藏垃圾柜与洗衣房家具", en: "Trash Can Cabinets & Laundry Furniture", pattern: /trash|garbage cabinet|laundry|washer|dryer|utility sink|隐藏垃圾|洗衣/i },
  { id: "vinyl-audio", zh: "黑胶与影音家具", en: "Vinyl & Audio Furniture", pattern: /record player|vinyl|turntable|audio cabinet|黑胶|唱片/i },
  { id: "seating-living-room", zh: "客厅座椅与组合家具", en: "Living Room Seating & Sets", pattern: /sofa|couch|chair|recliner|ottoman|glider|living room set|沙发|座椅/i },
  { id: "storage-utility", zh: "综合收纳与工具家具", en: "Storage & Utility Furniture", pattern: /storage cabinet|garment rack|portable closet|storage rack|utility shelf|utility cart|garage storage|storage bin|收纳柜|衣架|工具柜/i },
  { id: "other-furniture", zh: "其他家具", en: "Other Furniture", pattern: /[\s\S]*/ },
] as const;

export function majorCategoryFor(product: MajorCategoryProduct) {
  const text = `${product.category ?? ""} ${product.title ?? ""}`;
  return majorCategories.find((category) => category.pattern.test(text)) ?? majorCategories.at(-1)!;
}

export function majorCategoryLabel(product: MajorCategoryProduct) {
  const category = majorCategoryFor(product);
  return `${category.zh} / ${category.en}`;
}

export function presentMajorCategories(products: readonly MajorCategoryProduct[]) {
  const counts = new Map<string, number>();
  for (const product of products) {
    const id = majorCategoryFor(product).id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return majorCategories
    .filter((category) => counts.has(category.id))
    .map((category) => ({ ...category, count: counts.get(category.id)! }));
}
