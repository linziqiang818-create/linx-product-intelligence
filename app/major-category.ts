export type MajorCategoryProduct = {
  title: string;
  category: string;
  manualMajorCategoryId?: string;
};

export type MajorCategory = {
  id: string;
  zh: string;
  en: string;
  amazonCategoryPattern: RegExp;
};

// Only the stored Amazon category path/leaf may decide the LINX major category.
// Titles and LINX-created scenario labels are deliberately ignored.
export const majorCategories: readonly MajorCategory[] = [
  { id: "pet-furniture", zh: "宠物家具与宠物箱", en: "Pet Furniture & Habitats", amazonCategoryPattern: /^pet supplies:/i },
  { id: "sideboards-buffets", zh: "餐边柜与边柜", en: "Sideboards & Buffets", amazonCategoryPattern: /^(?:buffets? and sideboards?|sideboards? and buffets?|home & kitchen:furniture:.*:buffets & sideboards)$/i },
  { id: "bookcases-display", zh: "书架与展示柜", en: "Bookcases & Display Cabinets", amazonCategoryPattern: /^(?:bookcases and display shelves|home & kitchen:furniture:.*(?::bookcases|:glass display cabinets|:ladder shelves)|toys & games:collectible toys:collectible display & storage:.*)$/i },
  { id: "kitchen-islands", zh: "厨房岛台与餐车", en: "Kitchen Islands & Carts", amazonCategoryPattern: /^home & kitchen:furniture:kitchen furniture:storage islands & carts(?::|$)/i },
  { id: "reception-furniture", zh: "前台与接待家具", en: "Reception Room Furniture", amazonCategoryPattern: /^(?:reception desks?|portable podiums and lecterns|office products:office furniture & lighting:(?:tables:reception room tables|carts & stands:lecterns & podiums))$/i },
  { id: "pantries-kitchen-storage", zh: "厨房高柜与储物柜", en: "Pantries & Kitchen Storage", amazonCategoryPattern: /^(?:kitchen pantry cabinets|home & kitchen:furniture:(?:dining room furniture:pantries|kitchen furniture:baker's racks:standing baker's racks))$/i },
  { id: "bar-wine-cabinets", zh: "咖啡吧与酒柜", en: "Bar & Wine Cabinets", amazonCategoryPattern: /^(?:coffee bar and wine cabinets|home & kitchen:furniture:game & recreation room furniture:home bar furniture|home & kitchen:kitchen & dining:storage & organization:racks & holders:wine racks & cabinets)(?::|$)/i },
  { id: "tv-media", zh: "电视与媒体家具", en: "TV & Media Furniture", amazonCategoryPattern: /^(?:home & kitchen:furniture:living room furniture:tv & media furniture|office products:office furniture & lighting:carts & stands:av carts & stands)(?::|$)/i },
  { id: "dressers-bedroom-storage", zh: "斗柜与卧室收纳", en: "Dressers & Bedroom Storage", amazonCategoryPattern: /^home & kitchen:furniture:(?:bedroom furniture:(?:dressers|nightstands|bedroom armoires)|home office furniture:computer armoires & hutches)$/i },
  { id: "entryway-shoe-storage", zh: "玄关与鞋柜", en: "Entryway & Shoe Storage", amazonCategoryPattern: /^(?:entryway shoe cabinets|shoe cabinets|home & kitchen:furniture:entryway furniture:(?:storage benches|hall trees)|home & kitchen:storage & organization:clothing & closet storage:shoe organizers(?::.*)?|家居与厨房:家具:入口家具:储物长椅)$/i },
  { id: "salon-vanity", zh: "美甲沙龙与梳妆台", en: "Salon & Vanity Furniture", amazonCategoryPattern: /^(?:manicure tables|corner vanity furniture|integrated vanity furniture|transformable vanity furniture|beauty & personal care:salon & spa equipment:manicure tables|home & kitchen:furniture:bedroom furniture:vanities & vanity benches)$/i },
  { id: "craft-sewing", zh: "缝纫与手作家具", en: "Craft & Sewing Furniture", amazonCategoryPattern: /^(?:sewing cabinets|convertible activity furniture|arts, crafts & sewing|toys & games:(?:puzzles|arts & crafts|dress up & pretend play:magnetic & felt playboards))(?::|$)/i },
  { id: "desks-workstations", zh: "书桌与工作台", en: "Desks & Workstations", amazonCategoryPattern: /^(?:home & kitchen:furniture:home office furniture:home office desks|office products:office furniture & lighting:(?:desks & workstations|carts & stands:computer carts & machine stands))(?::|$)/i },
  { id: "office-storage", zh: "办公收纳", en: "Office Storage", amazonCategoryPattern: /^(?:office products:office furniture & lighting:cabinets, racks & shelves|tools & home improvement:storage & home organization:storage lockers|home & kitchen:furniture:home office furniture:home office cabinets)(?::|$)/i },
  { id: "tables-dining", zh: "餐桌与桌类", en: "Tables & Dining Sets", amazonCategoryPattern: /^(?:home & kitchen:furniture:(?:dining room furniture:(?:tables|table & chair sets)|living room furniture:tables|game & recreation room furniture:(?:game tables|folding tables & chairs:folding tables))|office products:office furniture & lighting:tables:(?:conference room tables|utility tables))(?::|$)/i },
  { id: "beds-bedroom", zh: "床与卧室家具", en: "Beds & Bedroom Furniture", amazonCategoryPattern: /^home & kitchen:furniture:bedroom furniture:(?:beds, frames & bases|bedroom sets)(?::|$)/i },
  { id: "room-dividers", zh: "屏风与空间隔断", en: "Room Dividers & Partitions", amazonCategoryPattern: /^home & kitchen:furniture:bedroom furniture:room dividers$/i },
  { id: "trash-laundry", zh: "隐藏垃圾柜与洗衣房家具", en: "Trash Can Cabinets & Laundry Furniture", amazonCategoryPattern: /^(?:laundry workstations|home & kitchen:storage & organization:trash, recycling & compost|tools & home improvement:.*:laundry & utility fixtures|工具与家居装修:.*:洗衣与工具水槽)(?::|$)/i },
  { id: "vinyl-audio", zh: "黑胶与影音家具", en: "Vinyl & Audio Furniture", amazonCategoryPattern: /^(?:vinyl and audio furniture|record player stands)$/i },
  { id: "seating-living-room", zh: "客厅座椅与组合家具", en: "Living Room Seating & Sets", amazonCategoryPattern: /^home & kitchen:furniture:(?:living room furniture:(?:living room sets|ottomans)|game & recreation room furniture:gliders)$/i },
  { id: "storage-utility", zh: "综合收纳与工具家具", en: "Storage & Utility Furniture", amazonCategoryPattern: /^(?:storage cabinets|home & kitchen:(?:furniture:(?:accent furniture:storage cabinets|bathroom furniture:over-the-toilet storage)|storage & organization|kitchen & dining:storage & organization)(?::.*)?|office products:office furniture & lighting:carts & stands:(?:utility carts|storage drawer carts)(?::.*)?|tools & home improvement:storage & home organization:garage storage(?::.*)?|tools & home improvement:kitchen & bath fixtures:bathroom fixtures:bathroom storage & mirrors)$/i },
  { id: "unclassified", zh: "未分类", en: "Unclassified", amazonCategoryPattern: /[\s\S]*/ },
] as const;

export function isManualMajorCategoryId(value: unknown): value is string {
  return typeof value === "string" && value !== "unclassified" && majorCategories.some((category) => category.id === value);
}

export function amazonMajorCategoryFor(product: MajorCategoryProduct) {
  const category = String(product.category ?? "").trim();
  return majorCategories.find((item) => item.amazonCategoryPattern.test(category))
    ?? majorCategories[majorCategories.length - 1];
}

export function majorCategoryFor(product: MajorCategoryProduct) {
  const amazonCategory = amazonMajorCategoryFor(product);
  if (amazonCategory.id !== "unclassified" || !isManualMajorCategoryId(product.manualMajorCategoryId)) return amazonCategory;
  return majorCategories.find((category) => category.id === product.manualMajorCategoryId) ?? amazonCategory;
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
