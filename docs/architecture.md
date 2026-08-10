# LINX 系统架构与数据口径

## 1. 运行形态

LINX 是 React + TypeScript + Vinext/Vite 构建的选品工作台。页面可通过本地开发服务器运行，也可以构建成内嵌 CSS、JavaScript 和基础产品数据的 Chrome 单文件。

在线 Sites 版本已绑定 D1：人工分类与学习档案通过 `/api/learning-state` 同步，产品新增/编辑/位置变化通过 `/api/product-overrides` 按 ASIN 增量同步。本机浏览器同时保留待同步副本；Chrome 单文件版没有云端 API 时仍可本地使用和 JSON 备份。

`examples/` 是脚手架示例，不是 LINX 业务数据源；D1 业务结构以 `db/`、`drizzle/` 和 `worker/` 的当前实现为准。

## 2. 数据层级

| 层级 | 文件或位置 | 含义 |
| --- | --- | --- |
| 正式基础池 | `app/real-products.json` | 已完成基本真实性确认、随版本发布的产品 |
| 轻量候选池 | `app/candidate-pool.json` | 已发现但仍需深挖的 ASIN，不直接进入机会页 |
| 扩池进度 | `app/acquisition-state.json` | 自动任务累计发现、深挖、入库、停止原因和最近批次 |
| 云端产品增量 | D1 `/api/product-overrides` | 新增、编辑、淘汰、恢复和删除，以 ASIN 记录 |
| 云端学习档案 | D1 `/api/learning-state` | 人工 ABCD、类目、收藏、校准、回收站和复盘 |
| 浏览器产品副本 | `furniture-radar-v6`、`linx-product-overrides-v1` | 基础池差异和网络中断时的待同步产品记录 |
| 浏览器学习副本 | `linx-learning-profile-v1` | 网络中断时的待同步人工决策与学习证据 |

页面启动时会把随版本发布的正式基础池、本机增量和云端增量合并，以更新时间解决同一 ASIN 的记录冲突；不会用新版本静默覆盖用户已有修改。JSON 备份包含产品和持续学习档案。

## 3. Excel 导入流水线

```text
读取第一张工作表
  -> 识别卖家精灵列或 LINX 模板列
  -> 记录每一行真正有内容的字段
  -> 按 ASIN 合并表内重复行
  -> 与当前产品库生成预览
     -> 净新增 | 旧 ASIN 非空更新 | 缺图待补 | 无法导入
  -> 用户确认
  -> 写入本机产品库并按 ASIN排队云端同步
  -> 统一归位重新计算商品卡
```

旧 ASIN 的空单元格不会覆盖已有字段；数值 `0` 是明确值，不当作空白。缺图不会阻断整批，而是让该产品获得 `needsData` 标签。新产品缺英文标题、ASIN 缺失或格式错误时只跳过对应行。

## 4. 统一归位

```text
正式产品
  -> classifyFormalProduct
     -> A / B / C / D
     -> D: garbage
     -> 非 D: red-ocean-blue | blue-ocean-red | unmatched
     -> 独立标签: potential | needsData | favorite
  -> auditProductPlacements
     -> 数量守恒、重复 ASIN、D 泄漏、唯一主归位和追溯校验
```

`app/product-placement.ts` 是上述流程的唯一入口。页面、历史数据、每日新增、表格导入和候选深挖都必须调用它。

主等级表达开发兴趣：

- A：用户明确有较强开发兴趣，且公司适配和证据足够。
- B：理论可做或一般产品。
- C：当前不感兴趣，但未触发硬性禁做。
- D：已触发确认的硬淘汰条件，只进入垃圾箱。

数据待补不等于 C 或 D；潜力款也不替代 A/B/C。一个产品可以同时是“B + 蓝海中的红海 + 潜力款 + 数据待补”。

## 5. 评分与边界

参数集中在 `app/selection-policy.ts`。当前稳定边界包括：新品不超过 180 天、目标售价不低于 100 美元、潜力款月销 50–300 且评论严格少于 100。月销超过 300 视为爆款/成熟阶段，不再作为早期潜力标签。

公司适配、隐藏机会和需求是主要评分来源。利润以 20% 为中线平滑影响评分，且预测利润权重低于公司适配和差异化机会；包装重量和尺寸用于物流、利润与数据完整性，不因单个重量节点自动优先开发。

纯实木、玻璃/镜面、纯软包沙发、塑料为主电竞椅、婴儿类、普通铁床架、纯金属标准化器材架以及明确超出当前室内板式家具能力的产品可触发硬淘汰。只有用户明确“所有同类都不做”的校准反馈才能形成新的类目级硬规则；具体单品不喜欢只影响软偏好或 C 级判断。

## 6. 采集边界

前端不会自动抓取 Amazon。每日扩池由独立任务使用公开信息发现候选，并在正式入库前执行真实性验证。

采集批量、家族配额和 Top 20 只控制先深挖谁、复查谁，不能丢弃已经符合条件的产品，也不能限制正式池或页面数量。单 Listing `Cache miss` 会跳过并继续；连续三个不同 ASIN 详情失败后停止该批。CAPTCHA、Robot Check、403、429、强制登录或明确反爬信号立即停止。

## 7. 构建输出

- `npm run dev`：本地开发服务器，通常为 `http://localhost:3000`。
- `npm run build`：Vinext/Sites 构建。
- `npm run build:pages`：静态 Vite 构建到 `dist-pages/`。
- `npm run build:portable`：先生成静态资源，再内联为 `.run/LINX.html`。

单文件脚本会确保 `#root` 先出现，再执行诊断脚本和应用 bundle；若 Chrome 执行失败，页面会显示可截图的启动错误，而不是保持空白。
