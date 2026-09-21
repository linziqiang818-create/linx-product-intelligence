// 规则引擎 v2 默认配置。所有正则以字符串保存，便于在设置页编辑并持久化到数据库。
// 顺序即判定优先级：类目不做 → 普货不做 → 材质（玻璃/实木/软包/金属/塑料椅）。

export const RULES_VERSION = 2;

export function defaultRules() {
  return {
    version: RULES_VERSION,

    // 一、类目不做（硬性清除，分组 category）
    categoryBans: [
      { id: "baby", label: "婴儿/儿童家具", enabled: true, pattern: "\\bbaby\\b|nursery|\\bcrib\\b|bassinet|toddler bed|婴儿|童床|婴儿床" },
      { id: "outdoor", label: "户外/庭院", enabled: true, pattern: "outdoor|\\bpatio\\b|garden furniture|balcony|adirondack|hammock|户外|庭院|阳台" },
      { id: "bathroom", label: "浴室柜", enabled: true, pattern: "bathroom vanity|vanity (?:with|w/) sink|vanity sink|bath vanity|over[- ]the[- ]toilet|浴室柜" },
      { id: "lighting", label: "灯具", enabled: true, pattern: "chandelier|pendant light|ceiling light|wall sconce|floor lamp|table lamp|light fixture|灯具|吊灯|落地灯|台灯" },
      { id: "ceiling-rack", label: "吊顶/车库顶置储物架", enabled: true, pattern: "ceiling[- ]mounted (?:storage )?racks?|overhead garage storage|garage ceiling storage|ceiling storage racks?|吊顶储物架" },
    ],

    // 一点五、座椅：椅子类目整体不做，带座椅的套装也不做（用户确认 2026-09-17）。
    // 多信号判定，不能只看标题一个词：先去掉反证（容量描述 / 配件器具），再看"明确包含"的写法；
    // 单把椅子必须类目也确认是座椅才清；推车 / 玄关 / 鞋柜 / 缝纫收纳等安全类目一律不清。判不清就留在池里让用户纠错。
    seating: {
      enabled: true,
      seatPattern: "\\b(?:chairs?|armchairs?|stools?|ottomans?|gliders?|recliners?)\\b",
      benchPattern: "\\bbench(?:es)?\\b",
      // 套装词：与座椅词同时出现才算
      setPattern: "\\b(?:sets?|bundles?|\\d+[ -]?pcs\\b|\\d+[ -]?pieces?\\b|of \\d+\\b)",
      // 明确包含座椅的写法（自带座椅词）：with 3 Stools / with Storage Bench / and 4 Chairs / - 2 Bar Stools
      inclusionPattern: "\\b(?:with|and|&|includes?|including|plus)\\s+(?:an?\\s+|\\d+\\s+)?(?:[a-z]+\\s+){0,2}(?:chairs?|armchairs?|stools?|ottomans?|bench(?:es)?)\\b|[-–,]\\s*\\d+\\s+(?:[a-z]+\\s+){0,2}(?:chairs?|armchairs?|stools?|ottomans?|bench(?:es)?)\\b",
      // 反证：容量描述、椅子配件 / 收纳器具、边几、"不含椅子"——先从文本里去掉再判
      negationPattern: "\\b(?:for|seats?|fits?|up to|accommodates?|seating for)\\s+\\d+\\b[^,;.]{0,24}|\\bchairs?\\s+(?:rack|cart|storage|mat|cover|cushion|pad|legs?|caps?|hanger|dolly|trolley)s?\\b|\\bchairside\\b|\\bchair side\\b|\\b(?:no|without)\\s+(?:the\\s+)?(?:chairs?|stools?)\\b|\\b(?:chairs?|stools?)\\s+(?:are\\s+)?not included\\b",
      // 类目确认座椅：单把椅子只有类目也这么说才清
      seatCategoryPattern: "chairs?|stools?|ottomans?|seating|gliders?|recliners?|table & chair sets?|dining (?:room )?sets?|vanit(?:y|ies) & vanity benches",
      // 安全类目：命中一律不清（座椅词只是上下文，或本来就是公司在做的鞋凳 / Hall Tree）
      safeCategoryPattern: "utility carts?|carts? & stands|\\bracks?\\b|hall trees?|entryway|shoe|mudroom|sewing|craft",
    },

    // 二、普货不做（结构简单、同质化严重；分组 commodity）
    commodity: {
      // 命中这些造型/功能/场景关键词的产品不算普货
      differentiationPattern:
        "motorized|lift[- ]?top|lift up|rotat|swivel|extendable|expandable|fold(?:ing|able)|modular|convertible|transform|hidden compartment|charging|\\busb\\b|outlet|\\bled\\b|lighted|murphy|arched|\\barch\\b|fluted|\\bwave\\b|ripple|grooved|curved|rounded|carved|engraved|scalloped|rattan|\\bcane\\b|woven|weave|vintage|antique|farmhouse|pet crate|dog crate|cat litter|litter box|reception|manicure|nail desk|nail table|sewing|craft station|coffee bar|wine bar|bar cabinet|fireplace|aquarium|reptile|terrarium|laundry|hall tree|with bench|hutch|cushion|壁挂|升降|旋转|伸缩|折叠|模块|隐藏|拱形|波纹|雕花|镂空|弧形|藤编|复古|美甲|前台|缝纫|宠物|猫砂|鱼缸|壁炉|酒柜|吧台|洗衣|坐垫",
      categories: [
        { id: "bed-frame", label: "床架", enabled: true, pattern: "bed frame|bedframe|platform bed|\\bbed\\b(?! ?side)|床架|铁架床" },
        { id: "bookshelf", label: "书架", enabled: true, pattern: "bookshelf|bookcase|book shelf|书架|书柜" },
        { id: "shoe", label: "鞋柜/鞋架", enabled: true, pattern: "shoe (?:cabinet|rack|storage|bench|organizer|shelf)|shoe(?:rack|cabinet)|鞋柜|鞋架|鞋凳" },
        { id: "standing-desk", label: "普通电动升降桌", enabled: true, pattern: "standing desk|sit[- ]stand desk|height adjustable desk|electric desk|adjustable height desk|升降桌|升降台" },
        { id: "coffee-table", label: "简易茶几/边几", enabled: true, pattern: "coffee table|end table|side table|tea table|center table|nesting table|茶几|边几|角几" },
        { id: "tv-stand", label: "简易电视柜", enabled: true, pattern: "tv stand|tv console|media console|media cabinet|tv cabinet|entertainment center|电视柜" },
        { id: "desk", label: "普通固定书桌", enabled: true, pattern: "computer desk|writing desk|office desk|home office desk|study desk|gaming desk|\\bdesk\\b|书桌|电脑桌|办公桌" },
        { id: "sideboard", label: "简易餐边柜", enabled: true, pattern: "sideboard|buffet cabinet|buffet table|credenza|console table|餐边柜|碗柜|玄关桌" },
      ],
      // 纯金属标准化货架/床架（沿用旧规则）
      standardizedMetal: {
        enabled: true,
        pattern: "\\brack\\b|shelving|utility rack|wire shelving|metal locker|metal (?:storage )?cabinet|steel wardrobe|metal armoire|metal pantry|tool cart|machine cart|garment rack|器材架|装备架|货架|金属柜|铁柜",
        bedPattern: "(?:metal|steel|iron).{0,24}bed frame|bed frame.{0,24}(?:metal|steel|iron)|铁床架|钢制床架",
      },
    },

    // 三、材质规则
    material: {
      // 公司能做的材质（板材 + 亚克力）；命中即视为“板材主体”
      panelPattern: "\\bmdf\\b|particle ?board|engineered wood|manufactured wood|composite wood|fiberboard|melamine|laminate|plywood|veneer|acrylic|刨花板|颗粒板|密度板|人造板|三聚氰胺|多层板|亚克力",
      // 泛指木材：不算板材证据，但说明金属只是配件而非主体
      woodPattern: "\\bwood|wooden|\\boak\\b|walnut|木",
      glass: {
        enabled: true,
        pattern: "\\bglass\\b|tempered|\\bmirror\\b|mirrored|玻璃|镜面",
        // “无镜面”之类否定表述不算命中
        negationPattern: "\\b(?:no|without|non)[- ]?(?:a\\s+)?(?:mirrors?|glass)\\b",
        suggestion: "玻璃 → 亚克力",
      },
      solidWood: {
        enabled: true,
        pattern: "solid wood|solid oak|solid pine|solid walnut|solid teak|hardwood|rubberwood|纯实木|全实木",
        suggestion: "",
      },
      upholstery: {
        enabled: true,
        pattern: "fabric|linen|velvet|leather|\\bfoam\\b|upholster|padded|布艺|亚麻|绒|皮革|海绵|软包",
        // 沙发/软床等纯软体家具，即使有坐垫也不做
        softFurniturePattern: "\\bsofa\\b|couch|loveseat|sectional|recliner|accent chair|ottoman|upholstered bed|沙发|躺椅|软床",
        // 单块坐垫例外：鞋凳 / Hall Tree / 玄关凳 等类目
        cushionException: {
          enabled: true,
          cushionPattern: "\\bcushion",
          categoryPattern: "hall tree|shoe|entryway|bench|mudroom|鞋|玄关|长凳",
        },
      },
      metalBody: {
        enabled: true,
        pattern: "\\bmetal\\b|\\bsteel\\b|\\biron\\b|\\balloy\\b|aluminum|\\b铝\\b|铁|钢",
        suggestion: "金属 → 板式",
      },
      plasticGamingChair: {
        enabled: true,
        chairPattern: "gaming chair|电竞椅",
        plasticPattern: "\\bplastic\\b|polypropylene|\\bpp\\b|nylon|塑料|尼龙",
      },
    },

    // 四、仅标记不清除
    flags: {
      unconventionalMaterial: {
        enabled: true,
        pattern: "sintered stone|slate|marble|granite|quartz|travertine|bamboo|rattan|\\bcane\\b|resin|fiberglass|concrete|cement|岩板|大理石|竹|藤|树脂|玻璃钢|水泥",
        label: "非常规材质",
        scorePenalty: 8,
      },
      // 壁炉组件不一定自制：可像冰箱柜留冰箱位一样留壁炉位，或去壁炉改储物（用户确认 2026-09-17）
      fireplaceSlot: {
        enabled: true,
        pattern: "fireplace|壁炉",
        suggestion: "壁炉 → 留位或改储物",
      },
      freightWarnKg: 50,
    },
  };
}

// 把旧版本配置补齐到当前默认结构（新增字段用默认值）。
export function normalizeRules(saved) {
  const base = defaultRules();
  if (!saved || typeof saved !== "object") return base;
  const merged = { ...base, ...saved, version: RULES_VERSION };
  merged.commodity = { ...base.commodity, ...(saved.commodity ?? {}) };
  merged.commodity.standardizedMetal = { ...base.commodity.standardizedMetal, ...(saved.commodity?.standardizedMetal ?? {}) };
  merged.material = { ...base.material, ...(saved.material ?? {}) };
  for (const key of ["glass", "solidWood", "upholstery", "metalBody", "plasticGamingChair"]) {
    merged.material[key] = { ...base.material[key], ...(saved.material?.[key] ?? {}) };
  }
  merged.material.upholstery.cushionException = {
    ...base.material.upholstery.cushionException,
    ...(saved.material?.upholstery?.cushionException ?? {}),
  };
  merged.flags = { ...base.flags, ...(saved.flags ?? {}) };
  merged.flags.unconventionalMaterial = { ...base.flags.unconventionalMaterial, ...(saved.flags?.unconventionalMaterial ?? {}) };
  merged.flags.fireplaceSlot = { ...base.flags.fireplaceSlot, ...(saved.flags?.fireplaceSlot ?? {}) };
  merged.seating = { ...base.seating, ...(saved.seating ?? {}) };
  if (!Array.isArray(merged.categoryBans)) merged.categoryBans = base.categoryBans;
  else {
    // 已保存的旧配置按 id 补齐新增的默认规则；用户改过的条目保留其内容
    const savedBans = merged.categoryBans;
    merged.categoryBans = base.categoryBans.map((d) => {
      const s = savedBans.find((x) => x && x.id === d.id);
      return s ? { ...d, ...s } : d;
    });
  }
  if (!Array.isArray(merged.commodity.categories)) merged.commodity.categories = base.commodity.categories;
  return merged;
}
