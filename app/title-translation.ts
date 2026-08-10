const hasChinese = (value: string) => /[\u3400-\u9fff]/.test(value);

const productTypes: [RegExp, string][] = [
  [/reception desk|front desk|checkout counter/i, "前台接待台"],
  [/manicure (?:table|desk)|nail (?:table|desk)/i, "美甲工作台"],
  [/vanity desk|makeup vanity/i, "梳妆台"],
  [/sewing (?:table|cabinet|desk)/i, "缝纫工作台"],
  [/adjustable bed (?:base|frame)/i, "电动可调床架"],
  [/bunk bed/i, "双层床"],
  [/loft bed/i, "高架床"],
  [/platform bed|bed frame|bedframe/i, "床架"],
  [/headboard/i, "床头板"],
  [/dog crate|furniture[- ]style crate/i, "家具式狗笼"],
  [/dog house/i, "狗屋"],
  [/dog bed|pet bed/i, "宠物床"],
  [/cat tree|cat tower/i, "猫爬架"],
  [/cat house|cat condo/i, "猫屋"],
  [/litter box enclosure|litter box furniture|cat litter cabinet/i, "猫砂盆隐藏柜"],
  [/terrarium|reptile enclosure/i, "爬宠箱"],
  [/aquarium stand|fish tank stand/i, "鱼缸底柜"],
  [/reptile tank stand/i, "爬宠缸底柜"],
  [/chicken coop/i, "鸡舍"],
  [/rabbit hutch/i, "兔舍"],
  [/hamster cage/i, "仓鼠笼"],
  [/animal cage|small animal cage|rabbit cage|guinea pig cage/i, "小宠物笼"],
  [/computer desk|office desk|writing desk|standing desk|executive desk|desk with/i, "办公桌"],
  [/tv stand|media console|entertainment center/i, "电视媒体柜"],
  [/record player stand|turntable stand/i, "黑胶唱片柜"],
  [/shoe cabinet/i, "鞋柜"],
  [/shoe rack|shoe organizer/i, "鞋架"],
  [/dresser|chest of drawers/i, "斗柜"],
  [/wardrobe|armoire/i, "衣柜"],
  [/nightstand|bedside table/i, "床头柜"],
  [/bookcase|bookshelf/i, "书架"],
  [/sideboard|buffet cabinet|buffet table/i, "餐边柜"],
  [/pantry cabinet|kitchen pantry|kitchen hutch/i, "厨房高柜"],
  [/bar cabinet|wine cabinet|coffee bar/i, "咖啡酒柜"],
  [/storage cabinet|accent cabinet/i, "储物柜"],
  [/file cabinet|filing cabinet/i, "文件柜"],
  [/trash can cabinet|trash cabinet|garbage cabinet/i, "隐藏垃圾桶柜"],
  [/kitchen island|island cart/i, "厨房岛台"],
  [/coffee table/i, "茶几"],
  [/console table|sofa table/i, "玄关桌"],
  [/end table|side table/i, "边几"],
  [/dining table and chairs|dining set|table and chair set/i, "餐桌椅组合"],
  [/dining table/i, "餐桌"],
  [/storage bench|entryway bench/i, "玄关储物凳"],
  [/breakfast nook bench|dining bench|ottoman bench|storage ottoman/i, "储物长凳"],
  [/ottoman|footstool|foot rest stool/i, "脚凳"],
  [/hall tree/i, "门厅衣帽柜"],
  [/garment rack|clothes rack/i, "衣帽架"],
  [/luggage rack/i, "行李架"],
  [/room divider|privacy screen/i, "屏风隔断"],
  [/bar cart|serving cart|dessert cart|candy cart/i, "餐饮展示推车"],
  [/kitchen cart|kitchen storage cart/i, "厨房收纳推车"],
  [/utility cart|service cart|platform truck|flatbed cart/i, "多功能推车"],
  [/puzzle table/i, "拼图桌"],
  [/puzzle board/i, "拼图板"],
  [/storage bin|storage box/i, "收纳箱"],
  [/trash can|waste bin|garbage bin|waste receptacle/i, "垃圾桶"],
  [/phone locker|cell phone lock box/i, "手机存放柜"],
  [/champagne wall|display arch|display stand/i, "活动展示架"],
  [/ribbon organizer/i, "手工材料收纳架"],
  [/shelf liner|furniture liner/i, "柜架衬垫"],
  [/drawer organizer|cabinet organizer|pull[- ]out organizer/i, "抽拉收纳架"],
  [/lazy susan/i, "旋转收纳盘"],
  [/wine rack/i, "酒架"],
  [/dish rack/i, "碗碟架"],
  [/easel/i, "画架"],
  [/shelf|shelving unit|storage rack/i, "置物架"],
  [/cabinet/i, "柜类家具"],
  [/table/i, "桌类家具"],
  [/chair/i, "座椅"],
];

const categoryTypes: [RegExp, string][] = [
  [/Bed Frames|Beds, Frames/i, "床架"], [/Crates/i, "家具式宠物笼"], [/Home Office Desks/i, "办公桌"],
  [/Television Stands|Entertainment Centers/i, "电视媒体柜"], [/Cats.*Trees/i, "猫爬架"], [/Shoe Cabinets/i, "鞋柜"],
  [/Dressers/i, "斗柜"], [/Kitchen Trash Cans/i, "垃圾桶柜"], [/Buffets & Sideboards/i, "餐边柜"],
  [/Table & Chair Sets/i, "餐桌椅组合"], [/Nightstands/i, "床头柜"], [/Bookcases/i, "书架"],
  [/Coffee Tables/i, "茶几"], [/Garment Racks/i, "衣帽架"], [/Pantries/i, "厨房高柜"],
  [/Storage Cabinets/i, "储物柜"], [/Terrariums/i, "爬宠箱"], [/Sewing Cabinets/i, "缝纫柜"],
  [/Puzzles/i, "拼图用品"], [/Storage Boxes|Storage Bins/i, "收纳箱"], [/Wine Racks/i, "酒架"],
  [/Furniture/i, "家具产品"], [/Storage & Organization/i, "家居收纳用品"], [/Pet Supplies/i, "宠物家具"],
  [/Arts, Crafts & Sewing/i, "手作收纳用品"],
];

const featureTerms: [RegExp, string][] = [
  [/with (?:\d+|two|three|four|five|six)?\s*drawers?|drawer storage/i, "带抽屉"],
  [/adjustable shelves?|adjustable shelf/i, "可调层板"], [/open shelves?|open storage/i, "开放式收纳"],
  [/charging station|usb ports?/i, "带充电站"], [/power outlet|power strip/i, "带电源插座"],
  [/led lights?|rgb led/i, "带LED灯"], [/fluted|waveform|corrugated/i, "竖纹造型"],
  [/rattan|cane door/i, "藤编元素"], [/arched|arch design/i, "拱形设计"],
  [/sliding doors?/i, "滑动柜门"], [/barn doors?/i, "谷仓门"], [/glass doors?/i, "玻璃柜门"],
  [/lockable|locking drawer|with lock/i, "可上锁"], [/wheels?|casters?|rolling/i, "带脚轮"],
  [/foldable|folding/i, "可折叠"], [/extendable|expandable/i, "可伸缩"],
  [/lift[- ]?up storage|hydraulic lift/i, "液压升降储物"], [/storage headboard/i, "储物床头板"],
  [/upholstered|cushioned/i, "软包设计"], [/no box spring/i, "无需弹簧床垫"],
  [/adjustable height|height adjustable/i, "高度可调"], [/cable management|wire management|cable hole/i, "带理线功能"],
  [/anti[- ]tip/i, "防倾倒"], [/scratch(?:ing)? post|scratch pad/i, "带猫抓板"],
  [/waterproof|water resistant/i, "防水"], [/heavy duty/i, "加固承重"],
  [/large capacity|extra large|xxl/i, "大容量"], [/space saving|small spaces?/i, "适合小空间"],
];

const styleTerms: [RegExp, string][] = [
  [/mid[- ]century modern/i, "中世纪现代风"], [/farmhouse/i, "农舍风"], [/industrial/i, "工业风"],
  [/boho|bohemian/i, "波西米亚风"], [/modern/i, "现代"], [/rustic/i, "乡村风"],
];

const colorTerms: [RegExp, string][] = [
  [/off white|cream white/i, "米白色"], [/white/i, "白色"], [/black/i, "黑色"], [/walnut/i, "胡桃木色"],
  [/natural oak|natural wood|natural/i, "原木色"], [/brown/i, "棕色"], [/grey|gray/i, "灰色"],
  [/beige/i, "米色"], [/pink/i, "粉色"], [/green/i, "绿色"], [/blue/i, "蓝色"],
];

const roomTerms: [RegExp, string][] = [
  [/living room/i, "客厅"], [/bedroom/i, "卧室"], [/dining room/i, "餐厅"], [/kitchen/i, "厨房"],
  [/home office|office/i, "办公室"], [/entryway|hallway/i, "玄关"], [/laundry room/i, "洗衣房"],
  [/bathroom/i, "浴室"], [/salon|spa/i, "沙龙"], [/retail store|shop/i, "商铺"],
];

const genericFirstWords = new Set(["a", "an", "the", "modern", "farmhouse", "industrial", "wood", "wooden", "large", "small", "new", "twin", "full", "queen", "king", "california", "mobile", "outdoor", "indoor", "commercial", "heavy", "slim", "oversized", "multi-layer", "three-layer", "platform", "furniture"]);

function firstMatch(value: string, choices: [RegExp, string][]) {
  return choices.find(([pattern]) => pattern.test(value))?.[1];
}

function uniqueMatches(value: string, choices: [RegExp, string][], limit: number) {
  return [...new Set(choices.filter(([pattern]) => pattern.test(value)).map(([, label]) => label))].slice(0, limit);
}

export function furnitureTitleZh(title: string, category = "") {
  const raw = String(title ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "待补充中文标题";
  if (hasChinese(raw)) return raw;

  const firstWord = raw.match(/^[A-Za-z][A-Za-z0-9&'\-]{1,24}/)?.[0] ?? "";
  const brand = firstWord && !genericFirstWords.has(firstWord.toLowerCase()) ? firstWord : "";
  const sizeMatch = raw.match(/\b\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:inch(?:es)?|in\.|\")/i)?.[0]
    ?? raw.match(/\b\d+(?:\.\d+)?\s*cm\b/i)?.[0]
    ?? "";
  const size = sizeMatch.replace(/\s*(?:inch(?:es)?|in\.|\")/i, "英寸").replace(/cm/i, "厘米");
  const type = firstMatch(raw, productTypes) ?? firstMatch(category, categoryTypes) ?? "家居产品";
  const style = firstMatch(raw, styleTerms) ?? "";
  const features = uniqueMatches(raw, featureTerms, 5);
  const rooms = uniqueMatches(raw, roomTerms, 3);
  const color = firstMatch(raw, colorTerms) ?? "";
  const lead = [brand, size, style, type].filter(Boolean).join(" ");
  const details = features.length ? features.join("、") : "适合家居与商业空间使用";
  const scene = rooms.length ? `适用于${rooms.join("、")}` : "";

  return [lead, details, scene, color].filter(Boolean).join("，");
}

export function chineseTitleFromRow(row: Record<string, unknown>) {
  const sourceTitle = String(row["商品标题"] ?? row.title ?? "");
  const sourceCategory = String(row["小类目"] ?? row["类目路径"] ?? row.category ?? "");
  const keys = ["中文标题", "商品中文标题", "标题中文", "中文翻译", "titleZh"];
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value && !/待自动翻译|待补充中文标题/.test(value) && !shouldRegenerateChineseTitle(value, sourceTitle, sourceCategory)) return value;
  }
  return furnitureTitleZh(sourceTitle, sourceCategory);
}

export function shouldRegenerateChineseTitle(saved: string, title: string, category = "") {
  const source = `${title} ${category}`;
  if (/适用于沙龙/.test(saved) && !/salon|spa|manicure|nail|barber/i.test(source)) return true;
  if (/家居产品/.test(saved) && !/家居产品/.test(furnitureTitleZh(title, category))) return true;
  return false;
}
