# LINX 运行与发布手册

## 1. 本地启动

首次使用需要 Node.js 22.13 或更新版本：

```powershell
npm install
npm run dev
```

打开终端显示的地址，通常是 `http://localhost:3000`。也可以双击项目已有桌面快捷方式。重复启动时应只打开已有页面；关闭服务窗口后页面将停止响应。

## 2. 公司电脑使用

优先从私有 GitHub Releases 下载最新 Chrome 单文件或一键包：

1. 将文件或 ZIP 完整保存到普通文件夹。
2. 单文件可直接用 Google Chrome 打开；一键包先解压，再双击其中的 Chrome 启动脚本。
3. 确认地址栏以 `file:///` 开头，并能看到 LINX 页面和产品统计。

此方式不需要 Node.js、本地服务器或黑色窗口。公司网络若拦截 `chatgpt.site`，不要反复刷新，改用单文件版。

如单文件只显示空白：

- 先确认文件名来自同一个最新 Release，而不是旧的 `LINX.html`。
- 按 `Ctrl+F5` 强制刷新，或关闭旧标签后重新打开。
- 新版应显示“LINX 启动失败”诊断框；把完整页面截图交给 Codex。

## 3. 数据导入和迁移

- 卖家精灵表：进入“产品库”上传 CSV/XLSX，系统会识别常用中文列、图片网址、单元格超链接和 `IMAGE()` 公式。
- 通用数据：先下载页面 XLSX 模板，再按模板列名填写。
- 上传后先看导入预览，核对净新增、旧 ASIN 更新、表内重复、缺图待补和无法导入行；点击“确认导入”前产品库不会变化。
- 历史产品不会被整批替换。旧 ASIN 只采用 Excel 中有内容的字段；空单元格保留旧备注、材质、主图等证据，明确填写的数字 `0` 仍视为有效更新。
- 新产品没有主图也可以导入，会自动进入“待补数据”；同批其他产品继续正常导入。缺 ASIN、ASIN 格式错误或新产品缺英文标题的行会单独跳过。
- 当前只读取工作簿第一张表。直接浮在 Excel 上、单元格里没有图片网址的嵌入图片无法保证识别。
- 更换电脑前进入“推荐规则”下载 JSON 备份；在新电脑同页恢复。

在线版会把产品更新和人工决策按 ASIN 同步到云端；网络临时不可用时先保存在本机，恢复后继续同步。JSON 备份仍是重要批次的人工留档方式。

## 4. 开发验收

完整验收：

```powershell
npm run lint
npm test
git diff --check
```

`npm test` 已包含普通构建、Chrome 单文件构建和所有 Node 回归测试。失败时停止提交和发布，先保留终端中的第一个真实错误。

人工冒烟检查：

1. 机会筛选统计守恒，主归位审计显示通过。
2. D 不出现在两条机会线；潜力、待补、收藏可以重叠。
3. 产品标题能打开对应 Amazon `/dp/{ASIN}`，主图可显示。
4. 导入、收藏、对比、Excel/CSV 导出和 JSON 备份可用。
5. `.run/LINX.html` 能在 Chrome 以 `file:///` 打开。

## 5. GitHub 安全同步

先只读检查：

```powershell
git branch --show-current
git status --short --branch
git remote -v
git log --oneline -8
git fetch origin --prune
git rev-list --left-right --count origin/main...main
```

只有在以下条件全部成立时才提交和推送：改动范围完整、验收通过、未发现敏感信息、远端没有领先或冲突、自动扩池状态属于同一个已完成批次。

禁止 force push、reset、删除用户数据、自动解决冲突或为了“完成同步”制造空提交。`app/acquisition-state.json` 与 `app/candidate-pool.json` 必须成批核对；测试通过不等于扩池状态已经完整。

## 6. 便携版发布

```powershell
npm run build:portable
```

确认 `.run/LINX.html` 通过人工冒烟和 `tests/portable-build.test.mjs` 后，才可制作 GitHub Release。Release 至少保留：

- 带提交短号的单文件 `LINX-Open-in-Chrome-<sha>.html`。
- 带提交短号的一键 ZIP，内含 `LINX.html`、Chrome 启动脚本和说明。

公司电脑的可用性以实际 Chrome 打开结果为准。Sites 可以作为在线补充，但不能替代已验证的 Release 交付。

## 7. 扩池故障处理

- 一个普通详情页不可用：标记该候选待补，继续下一个。
- 连续三个不同 ASIN 详情失败：停止本批，记录尝试数和停止原因。
- CAPTCHA、Robot Check、HTTP 403/429、强制登录或明确反爬：立即停止。
- 搜索摘要或第三方页面只用于轻量发现；没有基本 Amazon 真实性证据，不进入正式池。
- 正式池、候选池和累计计数均按 ASIN 去重，不截断历史数据。
