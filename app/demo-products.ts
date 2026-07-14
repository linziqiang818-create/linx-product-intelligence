export type DemoProduct = {
  asin: string; title: string; category: string; price: number; rating: number; reviews: number;
  bsr: number; dimensions: string; weight: number; material: string; variants: string;
  sellingPoints: string; painPoints: string; sourceUrl: string; note: string; complexity: number;
  differentiation: number; returnRisk: "低" | "中" | "高"; monthlySales: number;
  launchDays: number; salesGrowth: number; packageGrossKg: number; packageDimensionsCm: string;
  estimatedMargin: number; priceUplift: number;
};

type DemoArgs = [
  string, string, string, number, number, number, number, number, number,
  number, string, string, number, number, number, "低" | "中" | "高", string,
];

function demo([asin, title, category, price, monthlySales, launchDays, salesGrowth, rating, reviews, packageGrossKg, packageDimensionsCm, material, estimatedMargin, priceUplift, differentiation, returnRisk, note]: DemoArgs): DemoProduct {
  return {
    asin, title, category, price, monthlySales, launchDays, salesGrowth, rating, reviews,
    bsr: Math.max(100, Math.round(90000 / Math.max(1, monthlySales))),
    dimensions: packageDimensionsCm, weight: Math.round(packageGrossKg * 2.205 * 10) / 10,
    packageGrossKg, packageDimensionsCm, material, estimatedMargin, priceUplift,
    variants: "测试数据", sellingPoints: "模拟市场信号，用于验证筛选逻辑",
    painPoints: rating > 0 && rating < 4.3 ? "评分偏低，存在结构、安装或包装改进空间" : "",
    sourceUrl: "", note: `TEST 模拟样本｜${note}`, complexity: 3, differentiation, returnRisk,
  };
}

export const demoProducts: DemoProduct[] = [
  demo(["TEST-001", "Fluted Craft Storage Cabinet with Drawers", "Craft Room Furniture", 169, 180, 120, 22, 4.1, 110, 25, "95 x 48 x 24 cm", "Engineered wood, MDF, metal drawer slides", 24, 5, 5, "中", "新品、低评论、高增长的场景收纳"]),
  demo(["TEST-002", "Curved Reception Desk with Lockable Storage", "Reception Furniture", 289, 95, 165, 18, 4.0, 72, 38, "125 x 68 x 18 cm", "MDF, particle board, lockable drawer", 23, 6, 5, "中", "前台场景明确且客单价高"]),
  demo(["TEST-003", "Manicure Nail Desk with Dust Collector Cabinet", "Salon Workstation", 239, 88, 140, 31, 3.9, 64, 32, "118 x 62 x 22 cm", "Engineered wood cabinet, drawers, metal hardware", 21, 8, 5, "中", "美容场景需求增长且评分有改款窗口"]),
  demo(["TEST-004", "Fold-Out Sewing Armoire Cabinet with Storage", "Sewing Furniture", 259, 74, 210, 16, 4.2, 96, 41, "132 x 64 x 21 cm", "MDF cabinet, folding table, adjustable shelf", 22, 7, 5, "中", "隐藏式缝纫工作台，人工浏览容易漏掉"]),
  demo(["TEST-005", "Farmhouse Coffee Station Cabinet with Charging Outlet", "Coffee Bar Furniture", 189, 155, 95, 27, 4.1, 138, 28, "101 x 52 x 25 cm", "Engineered wood, drawer, cabinet doors, outlet", 25, 6, 5, "中", "咖啡场景叠加充电和收纳"]),
  demo(["TEST-006", "Printer Stand with Lateral File Cabinet and Charging", "Home Office Storage", 149, 132, 180, 19, 4.2, 210, 22, "91 x 50 x 20 cm", "Particle board, drawer slides, adjustable shelf", 23, 4, 4, "低", "打印机场景的相邻类目机会"]),
  demo(["TEST-007", "Furniture Style Double Dog Crate with Drawers", "Pet Furniture", 229, 118, 150, 21, 4.0, 124, 36, "128 x 65 x 20 cm", "Engineered wood cabinet, steel door frame, drawers", 20, 7, 5, "中", "宠物用品家具化、高客单价"]),
  demo(["TEST-008", "Fluted Cat Litter Box Enclosure with Storage", "Pet Furniture", 139, 205, 80, 34, 4.1, 88, 24, "96 x 52 x 18 cm", "MDF, fluted cabinet doors, adjustable shelf", 24, 5, 5, "低", "低评论高销量的宠物家具化新品"]),
  demo(["TEST-009", "Record Player Stand with Vinyl Storage Drawers", "Living Room Storage", 159, 168, 135, 24, 4.2, 145, 21, "88 x 48 x 19 cm", "Engineered wood, drawers, adjustable shelf", 25, 5, 4, "低", "黑胶细分场景增长"]),
  demo(["TEST-010", "Slim Entryway Shoe Cabinet with Flip Drawers", "Entryway Furniture", 129, 240, 110, 17, 4.0, 260, 23, "108 x 46 x 17 cm", "Particle board, flip drawer hardware", 22, 4, 4, "中", "小空间玄关收纳，需求与痛点同时明显"]),
  demo(["TEST-011", "Lift Top Coffee Table with Hidden File Storage", "Living Room Tables", 179, 145, 195, 15, 4.1, 190, 29, "112 x 60 x 20 cm", "Engineered wood, lift top hinge, drawer", 21, 6, 5, "中", "结构功能明确且评论尚未饱和"]),
  demo(["TEST-012", "Charging Nightstand with Rotating Hidden Drawer", "Bedroom Furniture", 139, 126, 105, 29, 3.9, 76, 18, "68 x 49 x 18 cm", "MDF, rotating drawer, USB outlet", 22, 7, 5, "中", "旋转隐藏结构和差评改款窗口"]),
  demo(["TEST-013", "Corner Desk with Rotating Storage Cabinet", "Home Office Desk", 219, 92, 230, 14, 4.2, 155, 34, "124 x 64 x 22 cm", "Particle board, rotating cabinet, drawers", 20, 6, 5, "中", "角落场景与旋转收纳组合"]),
  demo(["TEST-014", "Arched Pantry Cabinet with Fluted Doors", "Kitchen Pantry Furniture", 199, 110, 175, 20, 4.1, 118, 31, "119 x 58 x 20 cm", "MDF, arched fluted doors, adjustable shelves", 24, 5, 5, "中", "造型识别度高的板式收纳"]),
  demo(["TEST-015", "Makeup Vanity Desk with Fold-Down Mirror Cabinet", "Bedroom Vanity Desk", 189, 84, 145, 26, 4.0, 69, 27, "105 x 56 x 19 cm", "Engineered wood, folding cabinet, drawers", 22, 7, 5, "中", "梳妆场景结构创新，不含玻璃包装"]),
  demo(["TEST-016", "Mobile Podium Lectern with Locking Storage Drawer", "Office Presentation Furniture", 179, 66, 200, 15, 4.2, 58, 26, "108 x 55 x 20 cm", "MDF cabinet, drawer, locking casters", 23, 4, 4, "低", "讲台细分类目，销量不大但竞争低"]),
  demo(["TEST-017", "Wave Door Sideboard Cabinet with Modular Shelves", "Dining Room Storage", 209, 138, 125, 23, 4.1, 102, 33, "116 x 58 x 21 cm", "Engineered wood, wave cabinet doors, adjustable shelves", 25, 6, 5, "中", "波纹外观与模块化收纳"]),
  demo(["TEST-018", "Expandable Dresser with Detachable Changing Top", "Bedroom Storage", 199, 71, 190, 13, 4.2, 83, 35, "121 x 62 x 22 cm", "MDF dresser, drawers, adjustable top", 21, 5, 4, "中", "可拆模块增加使用周期"]),
  demo(["TEST-019", "Folding Craft Table Cabinet on Casters", "Craft Room Furniture", 229, 102, 155, 18, 4.0, 91, 37, "127 x 64 x 22 cm", "Engineered wood cabinet, folding panels, casters", 22, 7, 5, "中", "折叠结构解决小空间工作台痛点"]),
  demo(["TEST-020", "Narrow Console Table with Hidden Charging Drawer", "Entryway Furniture", 119, 210, 90, 16, 4.1, 170, 17, "92 x 42 x 16 cm", "Particle board, drawer, hidden outlet", 20, 4, 4, "低", "窄体玄关和隐藏充电"]),
  demo(["TEST-021", "Tempered Glass Coffee Table with Chrome Frame", "Living Room Tables", 189, 460, 900, 3, 4.5, 5200, 31, "112 x 68 x 16 cm", "Tempered glass and steel", 31, 1, 2, "高", "高销量但玻璃材质不适合公司"]),
  demo(["TEST-022", "Full Length Mirror Storage Cabinet", "Bedroom Storage", 169, 330, 620, 4, 4.4, 2400, 29, "122 x 58 x 18 cm", "Mirror glass, MDF cabinet", 27, 2, 3, "高", "镜面包装风险"]),
  demo(["TEST-023", "Boucle Upholstered Modular Sofa", "Living Room Seating", 699, 520, 260, 12, 4.3, 890, 92, "168 x 92 x 58 cm", "Upholstered foam sofa", 26, 8, 4, "高", "软体家具供应链不匹配"]),
  demo(["TEST-024", "Power Recliner Chair with Massage", "Living Room Seating", 429, 410, 310, 9, 4.2, 1600, 68, "102 x 78 x 72 cm", "Upholstered electric recliner", 24, 6, 3, "高", "电动软体售后风险"]),
  demo(["TEST-025", "Hybrid Memory Foam Mattress", "Bedroom Mattress", 299, 1900, 700, 2, 4.6, 12000, 34, "105 x 42 x 42 cm", "Foam mattress", 32, 2, 1, "高", "床垫不属于板式家具"]),
  demo(["TEST-026", "Outdoor Patio Storage Bench", "Patio Furniture", 199, 380, 340, 10, 4.3, 980, 38, "126 x 69 x 28 cm", "Outdoor resin and steel", 25, 4, 3, "中", "户外产品能力不匹配"]),
  demo(["TEST-027", "Bathroom Vanity Cabinet with Ceramic Sink", "Bathroom Furniture", 459, 160, 240, 8, 4.2, 340, 56, "136 x 72 x 45 cm", "MDF vanity, ceramic sink", 23, 7, 4, "高", "卫浴与水槽供应链超范围"]),
  demo(["TEST-028", "Laundry Sink Cabinet with Faucet", "Laundry Furniture", 329, 120, 420, 6, 4.3, 510, 61, "121 x 74 x 48 cm", "Cabinet, stainless sink, faucet", 24, 5, 3, "高", "涉水五金和超重风险"]),
  demo(["TEST-029", "Modern Wood Chandelier with LED", "Lighting", 159, 640, 280, 11, 4.4, 730, 12, "78 x 42 x 18 cm", "Wood and LED lighting", 29, 4, 3, "高", "灯具合规和供应链不匹配"]),
  demo(["TEST-030", "Baby Changing Table with Safety Rails", "Nursery Furniture", 189, 290, 360, 7, 4.5, 1200, 27, "104 x 61 x 19 cm", "Engineered wood changing table", 25, 4, 3, "高", "婴童安全责任超范围"]),
  demo(["TEST-031", "Heavy Duty Steel Utility Rack", "Garage Storage", 179, 2500, 1000, 2, 4.7, 9800, 44, "122 x 58 x 18 cm", "Powder coated steel utility rack", 35, 1, 1, "低", "纯金属标准品，销量高也不应入选"]),
  demo(["TEST-032", "Adjustable Wire Shelving Unit", "Garage Storage", 129, 3100, 1250, 1, 4.6, 15000, 36, "120 x 54 x 16 cm", "Chrome wire shelving", 33, 1, 1, "低", "高度同质化标准货架"]),
  demo(["TEST-033", "Ceiling Mounted Overhead Storage Rack", "Garage Storage", 159, 1800, 800, 3, 4.5, 7200, 32, "128 x 42 x 17 cm", "Steel overhead rack", 31, 2, 2, "高", "安装和安全责任高"]),
  demo(["TEST-034", "Metal Locker Cabinet 4 Door", "Office Storage", 209, 640, 540, 4, 4.4, 2600, 47, "132 x 62 x 21 cm", "Steel metal locker", 30, 2, 1, "中", "纯金属柜不具公司差异化优势"]),
  demo(["TEST-035", "Rolling Mechanic Tool Cart", "Garage Tools", 249, 980, 730, 3, 4.6, 4400, 52, "105 x 66 x 35 cm", "Steel tool cart with drawers", 28, 3, 2, "中", "工具车并非室内板式家具"]),
  demo(["TEST-036", "Set of 4 Metal Folding Chairs", "Folding Chairs", 119, 2100, 1100, 1, 4.5, 8900, 38, "104 x 54 x 24 cm", "Steel folding chair", 27, 1, 1, "中", "标准椅类且非公司方向"]),
  demo(["TEST-037", "Small C Shaped End Table", "Living Room Tables", 39, 5200, 1500, 1, 4.5, 19000, 6, "64 x 42 x 9 cm", "Particle board and steel", 26, 1, 2, "低", "售价低于目标价格带"]),
  demo(["TEST-038", "Basic 5 Tier Bookshelf", "Home Office Storage", 79, 3800, 1300, 2, 4.6, 22000, 15, "95 x 34 x 14 cm", "Particle board bookshelf", 28, 1, 2, "低", "低价成熟红海产品"]),
  demo(["TEST-039", "Extra Large Wardrobe Storage Cabinet", "Bedroom Storage", 499, 82, 230, 12, 4.0, 180, 76, "182 x 88 x 42 cm", "Engineered wood wardrobe cabinet", 18, 8, 4, "高", "超过重量和尺寸能力"]),
  demo(["TEST-040", "16 Foot Conference Table with Power Modules", "Office Furniture", 1299, 24, 420, 4, 4.2, 38, 118, "286 x 118 x 46 cm", "MDF conference table with outlets", 20, 12, 5, "高", "不可通过当前渠道发货"]),
  demo(["TEST-041", "Hidden Storage Cabinet for Small Apartments", "Living Room Storage", 169, 125, 130, 25, 4.1, 92, 0, "", "Engineered wood cabinet with drawers", 24, 5, 4, "中", "缺少包装数据，必须待核算"]),
  demo(["TEST-042", "Standard Two Door Storage Cabinet", "Home Storage Cabinet", 159, 480, 1600, 0, 4.7, 8600, 24, "98 x 52 x 18 cm", "Engineered wood cabinet, adjustable shelf", 26, 1, 2, "低", "成熟高评论产品，不是隐藏机会"]),
  demo(["TEST-043", "Tripod Floor Lamp with Shelf", "Lighting", 119, 870, 460, 6, 4.4, 2100, 9, "72 x 39 x 15 cm", "Wood shelf and lighting fixture", 29, 3, 2, "中", "灯具不是公司可承接家具形态"]),
  demo(["TEST-044", "Aquarium Stand with Built In Power Strip", "Aquarium Furniture", 189, 310, 260, 13, 4.2, 420, 31, "106 x 61 x 21 cm", "MDF aquarium stand, outlet", 24, 5, 4, "高", "承重和涉水风险超出范围"]),
  demo(["TEST-045", "Electric Fireplace TV Console", "Living Room Entertainment", 399, 520, 480, 8, 4.3, 1900, 58, "152 x 73 x 39 cm", "Engineered wood console, electric fireplace", 22, 7, 4, "高", "电器和超重售后风险"]),
  demo(["TEST-046", "Twin Over Full Bunk Bed with Storage", "Bedroom Beds", 529, 180, 520, 5, 4.4, 760, 86, "198 x 94 x 52 cm", "Wood bunk bed with drawers", 21, 9, 4, "高", "床类和安全责任不匹配"]),
  demo(["TEST-047", "Upholstered Platform Bed Frame with Drawers", "Bedroom Beds", 329, 760, 390, 7, 4.4, 3400, 49, "168 x 76 x 34 cm", "Upholstered bed frame, drawers", 25, 6, 3, "高", "软包床类不属于当前供应链"]),
  demo(["TEST-048", "Outdoor Patio Bar Cabinet with Cooler", "Patio Furniture", 379, 210, 270, 9, 4.2, 460, 63, "136 x 78 x 44 cm", "Outdoor resin cabinet and cooler", 23, 8, 4, "高", "户外与冷藏模块超范围"]),
  demo(["TEST-049", "Glass Display Cabinet with LED Lights", "Living Room Storage", 269, 350, 410, 7, 4.3, 1300, 54, "142 x 72 x 38 cm", "Tempered glass cabinet, MDF, LED", 24, 6, 4, "高", "玻璃破损和电子件售后"]),
  demo(["TEST-050", "Expandable Dining Sideboard with Drawers", "Dining Room Storage", 219, 125, 170, 18, 4.1, 140, 34, "122 x 62 x 23 cm", "Engineered wood sideboard, extendable top, drawers", 12, 6, 5, "中", "产品适配但利润率过低"]),
];
