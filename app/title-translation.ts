const productTypes: Array<[RegExp, string]> = [
  [/reception desk|front desk|front counter/i, "前台接待台"],
  [/standing desk|sit stand desk/i, "电动升降桌"],
  [/conference (room )?table|meeting table/i, "会议桌"],
  [/computer desk|office desk|workstation/i, "办公桌"],
  [/dog crate|dog kennel/i, "狗笼家具"],
  [/hamster cage|guinea pig cage|small animal cage/i, "小动物笼柜"],
  [/reptile tank|reptile terrarium|reptile enclosure/i, "爬宠饲养箱"],
  [/garage storage cabinet|garage cabinets/i, "车库储物柜"],
  [/garage storage rack|ceiling storage rack/i, "车库吊顶储物架"],
  [/shelving unit|storage shelves|industrial shelves/i, "工业置物架"],
  [/file cabinet|filing cabinet/i, "文件柜"],
  [/laundry sink cabinet|utility sink/i, "洗衣房水槽柜"],
  [/craft organizer|craft storage|crafting cabinet/i, "手工材料收纳工作台"],
  [/wine rack|liquor shelf/i, "酒架"],
  [/shoe rack|shoe cabinet|shoe organizer/i, "鞋柜"],
  [/storage cabinet|accent cabinet/i, "储物柜"],
  [/bookshelf|bookcase/i, "书架"],
  [/nightstand|bedside table/i, "床头柜"],
  [/tv stand|media console/i, "电视柜"],
  [/coffee table/i, "茶几"],
  [/end table|side table/i, "边几"],
  [/dining table/i, "餐桌"],
  [/dresser|chest of drawers/i, "斗柜"],
  [/wardrobe|armoire/i, "衣柜"],
  [/pantry cabinet/i, "厨房储物柜"],
  [/bathroom vanity/i, "浴室柜"],
  [/kitchen island/i, "厨房岛台"],
  [/console table/i, "玄关桌"],
  [/desk/i, "桌类家具"],
  [/cabinet/i, "柜类家具"],
  [/table/i, "桌类家具"],
  [/rack|shelf/i, "收纳架"],
];

const featureTerms: Array<[RegExp, string]> = [
  [/farmhouse/i, "农舍风"],
  [/modern|contemporary/i, "现代"],
  [/industrial/i, "工业风"],
  [/rustic/i, "复古乡村风"],
  [/fluted|ribbed/i, "波纹造型"],
  [/heavy duty/i, "重型"],
  [/foldable|collapsible/i, "可折叠"],
  [/adjustable/i, "可调节"],
  [/wall mounted|floating/i, "壁挂式"],
  [/freestanding/i, "落地式"],
  [/rolling|with wheels/i, "带滚轮"],
  [/lockable|locking/i, "可上锁"],
  [/drawers?|\d[- ]drawer/i, "带抽屉"],
  [/with storage|storage/i, "带收纳"],
  [/led lights?|with led/i, "带LED灯"],
  [/usb|charging port|charging station/i, "带充电功能"],
  [/modular/i, "模块化"],
  [/l-shaped/i, "L形"],
  [/corner/i, "转角型"],
  [/set of 2|2[- ]piece|2 pack/i, "两件套"],
  [/extra large|oversized/i, "特大号"],
  [/large/i, "大容量"],
];

export function furnitureTitleZh(title: string) {
  const source = String(title ?? "").trim();
  if (!source) return "待补充中文标题";
  const productType = productTypes.find(([pattern]) => pattern.test(source))?.[1] ?? "家居产品";
  const features = featureTerms
    .filter(([pattern]) => pattern.test(source))
    .map(([, label]) => label)
    .filter((label, index, all) => all.indexOf(label) === index)
    .slice(0, 4);
  return features.length ? `${features.join(" · ")} ${productType}` : productType;
}

export function chineseTitleFromRow(row: Record<string, unknown>) {
  const keys = ["中文标题", "商品中文标题", "标题中文", "中文翻译", "titleZh"];
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return furnitureTitleZh(String(row["商品标题"] ?? row.title ?? ""));
}
