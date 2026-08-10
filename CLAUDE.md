# JIA JU / LINX 项目规则

## 工作边界

- 开始工作前确认当前目录是 `D:\Users\Administrator\Documents\JIA JU`，并先检查 `git status --short --branch`。
- 这是共享工作区。未确认所有权前，不覆盖、回滚、删除或提交既有未提交改动，也不要让两个任务同时修改同一文件。
- `app/acquisition-state.json` 与 `app/candidate-pool.json` 由每日扩池任务维护；只有确认一整批状态连续且已完成，才能随扩池结果提交。
- 页面与数据体验、筛选模型与潜力判断、项目总控与版本发布是三个职责域。跨域改动先明确顺序和验收者。

## 代码真相与数据口径

- `app/product-placement.ts` 是所有正式产品主归位和计数审计的唯一入口。页面只消费其结果，不复制分类规则。
- 筛选规则集中在 `app/opportunity.ts`、`app/selection-policy.ts`、`app/recommendation-grade.ts` 与 `app/product-potential.ts`。
- D 只进入垃圾箱；非 D 必须且只能进入红海中的蓝海、蓝海中的红海或方向不匹配之一。潜力、数据待补和收藏是可重叠标签。
- 历史、每日新增、导入和候选深挖使用同一分类函数。不得用 Top N、家族配额或页面截断限制正式池、分类或展示数量。
- 候选发现不等于正式入库；没有公开 Amazon 真实性证据或关键字段不足时保持候选/数据待补，不编造销量、利润或材质。
- 在线版产品修改与学习记录优先同步到绑定的 D1；断网或单文件版回退到本机 `localStorage`。页面 JSON 备份/恢复继续作为手工迁移和灾备手段。

## 验证与发布

- 完整验收依次运行 `npm run lint`、`npm test`、`git diff --check`。`npm test` 已包含普通构建和单文件构建。
- 发布前必须审查变更范围、敏感信息、自动扩池连续性和远端领先/冲突状态。禁止 force push、reset、删除用户数据、自动解决冲突或制造空提交。
- 公司电脑优先使用 GitHub Release 中的 Chrome 单文件版；`chatgpt.site` 可能被公司网络拦截，不能作为唯一交付方式。
- 具体运行、排障和发布步骤见 `docs/operator-runbook.md`；当前阶段状态见 `docs/handoff.md`。

## 文档维护

- 行为、数据口径、运行方式或发布路径改变时，同步更新 README 和对应 docs。
- README 保持为新人入口；架构原理放 `docs/architecture.md`，操作步骤放 `docs/operator-runbook.md`，阶段性事实放 `docs/handoff.md`。
- 不在本规则文件堆积提交历史、一次性事故复盘或易过期的数量。
