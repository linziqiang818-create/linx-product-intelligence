export function furnitureTitleZh(title: string) {
  return String(title ?? "").trim() ? "中文完整标题待自动翻译" : "待补充中文标题";
}

export function chineseTitleFromRow(row: Record<string, unknown>) {
  const keys = ["中文标题", "商品中文标题", "标题中文", "中文翻译", "titleZh"];
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return furnitureTitleZh(String(row["商品标题"] ?? row.title ?? ""));
}
