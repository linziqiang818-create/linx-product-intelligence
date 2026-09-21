// 规则引擎 v2：决定一个产品是否进入空间2，以及被清除时的原因分组。
// 判定顺序：人工覆盖 → 类目不做 → 普货不做 → 材质（玻璃 / 实木 / 软包 / 金属主体 / 塑料电竞椅）。
// 分组：category(类目不做) / commodity(普货不做) / material(材质不做) / convertible(材质可改款) / manual(手动清除)

export const GROUP_LABELS = {
  category: "类目不做",
  commodity: "普货不做",
  material: "材质不做",
  convertible: "材质可改款",
  manual: "手动清除",
};

function re(pattern, flags = "i") {
  if (!pattern || !String(pattern).trim()) return null;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

const test = (regex, text) => Boolean(regex && regex.test(text));

export function compileRules(rules) {
  const m = rules.material;
  return {
    categoryBans: rules.categoryBans.filter((r) => r.enabled).map((r) => ({ ...r, re: re(r.pattern) })).filter((r) => r.re),
    differentiation: re(rules.commodity.differentiationPattern),
    commodityCategories: rules.commodity.categories.filter((r) => r.enabled).map((r) => ({ ...r, re: re(r.pattern) })).filter((r) => r.re),
    standardizedMetal: rules.commodity.standardizedMetal.enabled
      ? { re: re(rules.commodity.standardizedMetal.pattern), bed: re(rules.commodity.standardizedMetal.bedPattern) }
      : null,
    panel: re(m.panelPattern),
    wood: re(m.woodPattern),
    glass: m.glass.enabled ? { re: re(m.glass.pattern), negation: re(m.glass.negationPattern, "gi"), suggestion: m.glass.suggestion } : null,
    solidWood: m.solidWood.enabled ? { re: re(m.solidWood.pattern) } : null,
    upholstery: m.upholstery.enabled
      ? {
          re: re(m.upholstery.pattern),
          soft: re(m.upholstery.softFurniturePattern),
          cushion: m.upholstery.cushionException.enabled
            ? { re: re(m.upholstery.cushionException.cushionPattern), category: re(m.upholstery.cushionException.categoryPattern) }
            : null,
        }
      : null,
    metalBody: m.metalBody.enabled ? { re: re(m.metalBody.pattern), suggestion: m.metalBody.suggestion } : null,
    plasticChair: m.plasticGamingChair.enabled ? { chair: re(m.plasticGamingChair.chairPattern), plastic: re(m.plasticGamingChair.plasticPattern) } : null,
    unconventional: rules.flags.unconventionalMaterial.enabled
      ? { re: re(rules.flags.unconventionalMaterial.pattern), label: rules.flags.unconventionalMaterial.label, penalty: Number(rules.flags.unconventionalMaterial.scorePenalty) || 0 }
      : null,
    fireplace: rules.flags.fireplaceSlot?.enabled ? { re: re(rules.flags.fireplaceSlot.pattern), suggestion: rules.flags.fireplaceSlot.suggestion } : null,
    seating: rules.seating?.enabled
      ? {
          seat: re(rules.seating.seatPattern),
          bench: re(rules.seating.benchPattern),
          set: re(rules.seating.setPattern),
          inclusion: re(rules.seating.inclusionPattern),
          negation: re(rules.seating.negationPattern, "gi"),
          seatCategory: re(rules.seating.seatCategoryPattern),
          safeCategory: re(rules.seating.safeCategoryPattern),
        }
      : null,
    freightWarnKg: Number(rules.flags.freightWarnKg) || 50,
  };
}

// 材质分组，用于筛选与偏好学习
export function materialGroupFor(text, c) {
  if (test(c.glass?.re, text)) return "glass";
  if (/acrylic|亚克力/i.test(text)) return "acrylic";
  if (test(c.solidWood?.re, text) && !test(c.panel, text)) return "solid-wood";
  if (test(c.upholstery?.re, text)) return "upholstery";
  if (/bamboo|竹/i.test(text)) return "bamboo";
  if (/rattan|\bcane\b|藤/i.test(text)) return "rattan";
  if (/sintered stone|slate|marble|granite|quartz|岩板|大理石/i.test(text)) return "stone";
  if (test(c.panel, text) || test(c.wood, text)) return "panel";
  if (test(c.metalBody?.re, text)) return "metal";
  if (/plastic|polypropylene|塑料/i.test(text)) return "plastic";
  return "unknown";
}

export function placeProduct(product, c, override, assessment) {
  const title = String(product.title ?? "");
  const category = String(product.category ?? "");
  const material = String(product.material ?? "");
  const text = `${category} ${title} ${material}`;
  const tags = [];
  const notes = [];

  const hasPanel = test(c.panel, text);
  const hasWood = hasPanel || test(c.wood, text);
  const differentiated = test(c.differentiation, text);
  const materialGroup = materialGroupFor(text, c);

  if (assessment?.dataMissing?.length) tags.push("数据待补");
  if ((Number(product.packageGrossKg) || 0) > c.freightWarnKg) tags.push("高运费");
  if (assessment?.cannotShip) tags.push("超规无法直发");
  if (c.unconventional && test(c.unconventional.re, text)) tags.push(c.unconventional.label);
  if (assessment?.potential) tags.push("潜力");

  let auto = { placement: "pass", removeGroup: "", removeReason: "", removeRuleId: "", convertible: "" };

  // 1. 类目不做
  const bannedCategory = c.categoryBans.find((r) => r.re.test(text));
  if (bannedCategory) {
    auto = { placement: "removed", removeGroup: "category", removeReason: `${bannedCategory.label}类目不在开发范围`, removeRuleId: `category:${bannedCategory.id}`, convertible: "" };
  }

  // 1.5 座椅：多信号判定——先去掉反证（容量描述 / 配件器具），再看"明确包含"写法或类目确认；安全类目一律不清
  if (auto.placement === "pass" && c.seating) {
    const s = c.seating;
    const stripped = s.negation ? text.replace(s.negation, " ") : text;
    const seatWord = test(s.seat, stripped);
    const benchWord = test(s.bench, stripped);
    const included = test(s.inclusion, stripped) || (test(s.set, stripped) && (seatWord || benchWord));
    const seatCategory = test(s.seatCategory, category);
    const safeCategory = test(s.safeCategory, category);
    if (!safeCategory && (included || (seatWord && seatCategory))) {
      auto = { placement: "removed", removeGroup: "category", removeReason: "座椅类产品或含座椅套装不在开发范围", removeRuleId: "category:seating", convertible: "" };
    }
  }

  // 2. 普货不做（无差异化关键词才算）
  if (auto.placement === "pass" && !differentiated) {
    const commodity = c.commodityCategories.find((r) => r.re.test(text));
    if (commodity) {
      auto = { placement: "removed", removeGroup: "commodity", removeReason: `${commodity.label}·结构简单无差异化，属于普货`, removeRuleId: `commodity:${commodity.id}`, convertible: "" };
    } else if (c.standardizedMetal && test(c.metalBody?.re, text) && !hasPanel && (test(c.standardizedMetal.re, text) || test(c.standardizedMetal.bed, text))) {
      auto = { placement: "removed", removeGroup: "commodity", removeReason: "纯金属标准化货架/床架，缺少差异化优势", removeRuleId: "commodity:standardized-metal", convertible: "" };
    }
  }

  // 3. 材质
  if (auto.placement === "pass" && c.glass) {
    const glassText = c.glass.negation ? text.replace(c.glass.negation, "") : text;
    if (test(c.glass.re, glassText)) {
      auto = { placement: "removed", removeGroup: "convertible", removeReason: "含玻璃/镜面部件，公司不做玻璃", removeRuleId: "material:glass", convertible: c.glass.suggestion };
      notes.push("结构造型可参考，玻璃部件可换亚克力后开发");
    }
  }
  if (auto.placement === "pass" && c.solidWood && test(c.solidWood.re, text) && !hasPanel) {
    auto = { placement: "removed", removeGroup: "material", removeReason: "纯实木产品不在板式家具开发范围", removeRuleId: "material:solid-wood", convertible: "" };
  }
  if (auto.placement === "pass" && c.upholstery && test(c.upholstery.re, text)) {
    const isSoftFurniture = test(c.upholstery.soft, text);
    const cushionOk = !isSoftFurniture && c.upholstery.cushion && test(c.upholstery.cushion.re, text) && test(c.upholstery.cushion.category, text);
    if (cushionOk) {
      tags.push("含坐垫");
    } else {
      auto = {
        placement: "removed",
        removeGroup: "material",
        removeReason: isSoftFurniture ? "纯软体家具（沙发/软床/软椅）不做" : "含布艺/软包部件，公司不做软包",
        removeRuleId: isSoftFurniture ? "material:soft-furniture" : "material:upholstery",
        convertible: "",
      };
    }
  }
  if (auto.placement === "pass" && c.metalBody && test(c.metalBody.re, text) && !hasWood) {
    auto = { placement: "removed", removeGroup: "convertible", removeReason: "金属主体产品，公司只做板材+金属配件", removeRuleId: "material:metal-body", convertible: c.metalBody.suggestion };
    notes.push("结构可模仿，改为板式结构后可开发");
  }
  if (auto.placement === "pass" && c.plasticChair && test(c.plasticChair.chair, text) && test(c.plasticChair.plastic, text) && !hasPanel) {
    auto = { placement: "removed", removeGroup: "material", removeReason: "塑料为主的电竞椅不在开发范围", removeRuleId: "material:plastic-gaming-chair", convertible: "" };
  }

  // 3.5 壁炉：不清除，标"留位或改储物"——像冰箱柜留冰箱位一样，壁炉组件不一定自制
  if (auto.placement === "pass" && c.fireplace && test(c.fireplace.re, text)) {
    auto = { ...auto, convertible: c.fireplace.suggestion };
    notes.push("壁炉组件不一定自制：可像冰箱柜留冰箱位一样留壁炉位，或去壁炉改储物");
  }

  if (auto.placement === "pass" && test(c.metalBody?.re, text) && hasWood) tags.push("含金属配件");

  // 4. 人工覆盖
  let result = { ...auto, autoPlacement: auto.placement, autoReason: auto.removeReason };
  if (override?.action === "rescue") {
    result = { ...result, placement: "pass", removeGroup: "", removeReason: "", convertible: auto.convertible };
    tags.push("手动捞回");
  } else if (override?.action === "exclude") {
    result = { ...result, placement: "removed", removeGroup: "manual", removeReason: override.reason || "手动清除", removeRuleId: "manual" };
    tags.push("手动清除");
  }

  if (result.convertible) tags.push("可改款");

  return { ...result, tags: [...new Set(tags)], notes, materialGroup, differentiated, hasPanel };
}
