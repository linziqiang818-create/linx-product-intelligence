import { useEffect, useRef, useState } from "react";
import { api, type RulePattern, type RuleStat, type RuleTestResult, type Rules } from "../api";
import { useApp, useToast } from "../store";
import { GROUP_LABELS, MATERIAL_LABELS } from "../types";
import ImportDialog from "../components/ImportDialog";
import { CloseIcon } from "../components/icons";

function PatternList({ title, hint, items, onChange, allowAdd }: { title: string; hint: string; items: RulePattern[]; onChange: (items: RulePattern[]) => void; allowAdd?: boolean }) {
  const update = (index: number, patch: Partial<RulePattern>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="rule-block">
      <div className="rule-block-head">
        <h4>{title}</h4>
        <p>{hint}</p>
      </div>
      <div className="pattern-list">
        {items.map((item, index) => (
          <div key={item.id} className={`pattern-row ${item.enabled ? "" : "disabled"}`}>
            <label className="switch" title={item.enabled ? "已启用" : "已停用"}>
              <input type="checkbox" checked={item.enabled} onChange={(e) => update(index, { enabled: e.target.checked })} />
              <i />
            </label>
            <input className="pattern-label" value={item.label} onChange={(e) => update(index, { label: e.target.value })} placeholder="名称" />
            <input className="pattern-regex" value={item.pattern} onChange={(e) => update(index, { pattern: e.target.value })} placeholder="关键词，用 | 分隔（正则）" spellCheck={false} />
            {allowAdd && <button className="btn btn-icon" title="删除这条" onClick={() => onChange(items.filter((_, i) => i !== index))}><CloseIcon size={13} /></button>}
          </div>
        ))}
        {allowAdd && (
          <button className="btn btn-sm" onClick={() => onChange([...items, { id: `custom-${Date.now()}`, label: "新类目", enabled: true, pattern: "" }])}>
            + 添加一条
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle-line">
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <i />
      </span>
      <b>{label}</b>
    </label>
  );
}

function PatternField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="pattern-field">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} spellCheck={false} />
    </label>
  );
}

export default function SettingsPage() {
  const { counts, profile, setCounts, refreshStatus } = useApp();
  const { notify } = useToast();
  const [rules, setRules] = useState<Rules | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [stats, setStats] = useState<RuleStat[]>([]);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [test, setTest] = useState({ title: "", category: "", material: "" });
  const [testResult, setTestResult] = useState<RuleTestResult | null>(null);
  const [section, setSection] = useState<"rules" | "brain" | "data">("rules");
  const restoreInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.rules().then((r) => {
      setRules(r.rules);
      setSaved(JSON.stringify(r.rules));
      setStats(r.stats);
    }).catch((e) => notify(e.message, "error"));
  }, [notify]);

  const dirty = rules ? JSON.stringify(rules) !== saved : false;
  const patch = (fn: (r: Rules) => Rules) => setRules((r) => (r ? fn(structuredClone(r)) : r));

  const save = async () => {
    if (!rules) return;
    setSaving(true);
    try {
      const before = (counts?.space2 ?? 0) + (counts?.space3 ?? 0);
      const result = await api.saveRules(rules);
      setRules(result.rules);
      setSaved(JSON.stringify(result.rules));
      setStats(result.stats);
      setCounts(result.counts);
      const passed = result.counts.space2 + result.counts.space3;
      const delta = passed - before;
      notify(`规则已保存并重新归位：通过硬性条件 ${passed} 款（${delta >= 0 ? "+" : ""}${delta}），筛除 ${result.counts.removed} 款`, "success");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    if (!window.confirm("恢复为默认规则？你的自定义修改会丢失（人工纠错记录不受影响）。")) return;
    const result = await api.resetRules();
    setRules(result.rules);
    setSaved(JSON.stringify(result.rules));
    setCounts(result.counts);
    const r = await api.rules();
    setStats(r.stats);
    notify("已恢复默认规则", "success");
  };
  const runTest = async () => {
    if (!rules) return;
    setTestResult(await api.testRules({ ...test, rules }));
  };
  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const mode = window.confirm("选择「确定」= 替换当前全部数据；「取消」= 合并进当前数据。") ? "replace" : "merge";
      const result = await api.restore(data, mode);
      setCounts(result.counts);
      await refreshStatus();
      notify("备份已恢复", "success");
    } catch (e) {
      notify(`恢复失败：${(e as Error).message}`, "error");
    }
  };
  const resetPreference = async (scope: "all" | "keep-calibration") => {
    if (!window.confirm(scope === "all" ? "清空第二大脑学到的全部偏好（包括收藏产生的信号）？收藏夹本身保留。" : "清空你日常反馈产生的偏好，只保留历史校准信号？")) return;
    const result = await api.resetPreference(scope);
    setCounts(result.counts);
    await refreshStatus();
    notify("偏好已重置", "success");
  };

  return (
    <section className="settings">
      <div className="space-head">
        <div>
          <span className="kicker">Settings</span>
          <h1>设置</h1>
          <p>规则决定谁能过硬性条件；第二大脑按你的偏好把过线的产品分进第二大脑或适配池，并决定排序。</p>
        </div>
      </div>
      <div className="segmented settings-tabs">
        <button className={section === "rules" ? "active" : ""} onClick={() => setSection("rules")}>硬性规则</button>
        <button className={section === "brain" ? "active" : ""} onClick={() => setSection("brain")}>第二大脑</button>
        <button className={section === "data" ? "active" : ""} onClick={() => setSection("data")}>数据</button>
      </div>

      {section === "rules" && rules && (
        <div className="settings-grid">
          <div className="settings-main">
            <div className={`save-bar ${dirty ? "dirty" : ""}`}>
              <span>{dirty ? "有未保存的修改。保存后所有产品会按新规则重新归位。" : "规则已同步。"}</span>
              <div className="row-actions">
                <button className="btn btn-sm" onClick={reset}>恢复默认</button>
                <button className="btn btn-sm btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? "重新归位中…" : "保存并重新归位"}</button>
              </div>
            </div>

            <PatternList
              title="类目不做"
              hint="命中即清除，进「类目不做」分组。"
              items={rules.categoryBans}
              onChange={(categoryBans) => patch((r) => ({ ...r, categoryBans }))}
              allowAdd
            />

            <div className="rule-block">
              <div className="rule-block-head">
                <h4>座椅</h4>
                <p>椅子类目不做，带座椅的套装也不做。不只看标题：先去掉反证（容量描述 / 椅子收纳车等），再看「明确包含」的写法或类目确认；安全类目一律不清，判不清的留在池里。</p>
              </div>
              <Toggle checked={rules.seating.enabled} onChange={(v) => patch((r) => ({ ...r, seating: { ...r.seating, enabled: v } }))} label="座椅类 / 含座椅套装 → 清除" />
              {rules.seating.enabled && (
                <>
                  <PatternField label="座椅关键词" value={rules.seating.seatPattern} onChange={(v) => patch((r) => ({ ...r, seating: { ...r.seating, seatPattern: v } }))} />
                  <PatternField label="明确包含的写法" hint="with 3 Stools / with Storage Bench / - 2 Bar Stools" value={rules.seating.inclusionPattern} onChange={(v) => patch((r) => ({ ...r, seating: { ...r.seating, inclusionPattern: v } }))} />
                  <PatternField label="反证关键词" hint="容量描述、椅子收纳车、边几等，先从标题里去掉再判" value={rules.seating.negationPattern} onChange={(v) => patch((r) => ({ ...r, seating: { ...r.seating, negationPattern: v } }))} />
                  <PatternField label="类目确认座椅" hint="单把椅子只有类目也这么说才清" value={rules.seating.seatCategoryPattern} onChange={(v) => patch((r) => ({ ...r, seating: { ...r.seating, seatCategoryPattern: v } }))} />
                  <PatternField label="安全类目" hint="命中一律不清（推车 / 玄关 / 鞋柜 / 缝纫收纳等）" value={rules.seating.safeCategoryPattern} onChange={(v) => patch((r) => ({ ...r, seating: { ...r.seating, safeCategoryPattern: v } }))} />
                </>
              )}
            </div>

            <PatternList
              title="普货不做"
              hint="命中这些类目、且标题里没有任何「差异化关键词」的产品，判为普货清除。"
              items={rules.commodity.categories}
              onChange={(categories) => patch((r) => ({ ...r, commodity: { ...r.commodity, categories } }))}
              allowAdd
            />
            <div className="rule-block">
              <PatternField
                label="差异化关键词"
                hint="命中任一词就不算普货（造型 / 功能 / 场景）"
                value={rules.commodity.differentiationPattern}
                onChange={(v) => patch((r) => ({ ...r, commodity: { ...r.commodity, differentiationPattern: v } }))}
              />
              <Toggle checked={rules.commodity.standardizedMetal.enabled} onChange={(v) => patch((r) => ({ ...r, commodity: { ...r.commodity, standardizedMetal: { ...r.commodity.standardizedMetal, enabled: v } } }))} label="纯金属标准化货架 / 床架视为普货" />
              {rules.commodity.standardizedMetal.enabled && (
                <PatternField label="货架关键词" value={rules.commodity.standardizedMetal.pattern} onChange={(v) => patch((r) => ({ ...r, commodity: { ...r.commodity, standardizedMetal: { ...r.commodity.standardizedMetal, pattern: v } } }))} />
              )}
            </div>

            <div className="rule-block">
              <div className="rule-block-head">
                <h4>材质</h4>
                <p>公司做板材 + 亚克力；金属只能做配件；软包只接受鞋凳类的单块坐垫。</p>
              </div>
              <PatternField label="板材 / 亚克力关键词" hint="命中视为板材主体" value={rules.material.panelPattern} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, panelPattern: v } }))} />
              <PatternField label="泛指木材关键词" hint="说明金属只是配件" value={rules.material.woodPattern} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, woodPattern: v } }))} />

              <Toggle checked={rules.material.glass.enabled} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, glass: { ...r.material.glass, enabled: v } } }))} label={`玻璃 / 镜面 → 清除并标「${rules.material.glass.suggestion}」`} />
              {rules.material.glass.enabled && <PatternField label="玻璃关键词" value={rules.material.glass.pattern} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, glass: { ...r.material.glass, pattern: v } } }))} />}

              <Toggle checked={rules.material.solidWood.enabled} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, solidWood: { ...r.material.solidWood, enabled: v } } }))} label="纯实木 → 清除（有板材关键词则放行）" />
              {rules.material.solidWood.enabled && <PatternField label="实木关键词" value={rules.material.solidWood.pattern} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, solidWood: { ...r.material.solidWood, pattern: v } } }))} />}

              <Toggle checked={rules.material.upholstery.enabled} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, upholstery: { ...r.material.upholstery, enabled: v } } }))} label="含软包 / 布艺 → 清除" />
              {rules.material.upholstery.enabled && (
                <>
                  <PatternField label="软包关键词" value={rules.material.upholstery.pattern} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, upholstery: { ...r.material.upholstery, pattern: v } } }))} />
                  <PatternField label="纯软体家具关键词" hint="沙发 / 软床等，即使有坐垫也清除" value={rules.material.upholstery.softFurniturePattern} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, upholstery: { ...r.material.upholstery, softFurniturePattern: v } } }))} />
                  <Toggle checked={rules.material.upholstery.cushionException.enabled} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, upholstery: { ...r.material.upholstery, cushionException: { ...r.material.upholstery.cushionException, enabled: v } } } }))} label="单块坐垫例外（鞋凳 / Hall Tree 类目）" />
                  {rules.material.upholstery.cushionException.enabled && (
                    <PatternField label="例外类目关键词" value={rules.material.upholstery.cushionException.categoryPattern} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, upholstery: { ...r.material.upholstery, cushionException: { ...r.material.upholstery.cushionException, categoryPattern: v } } } }))} />
                  )}
                </>
              )}

              <Toggle checked={rules.material.metalBody.enabled} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, metalBody: { ...r.material.metalBody, enabled: v } } }))} label={`金属主体（无木材/板材词）→ 清除并标「${rules.material.metalBody.suggestion}」`} />
              {rules.material.metalBody.enabled && <PatternField label="金属关键词" value={rules.material.metalBody.pattern} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, metalBody: { ...r.material.metalBody, pattern: v } } }))} />}

              <Toggle checked={rules.material.plasticGamingChair.enabled} onChange={(v) => patch((r) => ({ ...r, material: { ...r.material, plasticGamingChair: { ...r.material.plasticGamingChair, enabled: v } } }))} label="塑料电竞椅 → 清除" />
            </div>

            <div className="rule-block">
              <div className="rule-block-head">
                <h4>只标记，不清除</h4>
                <p>这些只影响标签和排序权重，不会把产品移出适配池。</p>
              </div>
              <Toggle checked={rules.flags.unconventionalMaterial.enabled} onChange={(v) => patch((r) => ({ ...r, flags: { ...r.flags, unconventionalMaterial: { ...r.flags.unconventionalMaterial, enabled: v } } }))} label={`非常规材质（岩板 / 竹 / 藤 / 树脂 / 水泥）标「${rules.flags.unconventionalMaterial.label}」并扣 ${rules.flags.unconventionalMaterial.scorePenalty} 分`} />
              {rules.flags.unconventionalMaterial.enabled && <PatternField label="非常规材质关键词" value={rules.flags.unconventionalMaterial.pattern} onChange={(v) => patch((r) => ({ ...r, flags: { ...r.flags, unconventionalMaterial: { ...r.flags.unconventionalMaterial, pattern: v } } }))} />}
              <Toggle checked={rules.flags.fireplaceSlot.enabled} onChange={(v) => patch((r) => ({ ...r, flags: { ...r.flags, fireplaceSlot: { ...r.flags.fireplaceSlot, enabled: v } } }))} label={`含壁炉不清除，标「${rules.flags.fireplaceSlot.suggestion}」可改款（像冰箱柜留冰箱位）`} />
              <label className="inline-field">
                <span>包装毛重超过多少 kg 标「高运费」</span>
                <input type="number" value={rules.flags.freightWarnKg} onChange={(e) => patch((r) => ({ ...r, flags: { ...r.flags, freightWarnKg: Number(e.target.value) || 50 } }))} style={{ width: 80 }} />
              </label>
            </div>
          </div>

          <aside className="settings-side">
            <div className="panel">
              <h4>规则试算</h4>
              <p className="muted">粘贴一个标题看看会被怎么判（用的是当前编辑中的规则，不必先保存）。</p>
              <input placeholder="英文标题" value={test.title} onChange={(e) => setTest({ ...test, title: e.target.value })} />
              <input placeholder="类目（可空）" value={test.category} onChange={(e) => setTest({ ...test, category: e.target.value })} />
              <input placeholder="材质（可空）" value={test.material} onChange={(e) => setTest({ ...test, material: e.target.value })} />
              <button className="btn btn-sm" onClick={runTest} disabled={!test.title}>试算</button>
              {testResult && (
                <div className={`test-result ${testResult.placement}`}>
                  <b>{testResult.placement === "pass" ? "进入适配池" : `清除 · ${GROUP_LABELS[testResult.removeGroup] ?? testResult.removeGroup}`}</b>
                  {testResult.removeReason && <span>{testResult.removeReason}</span>}
                  {testResult.convertible && <span>可改款：{testResult.convertible}</span>}
                  <span className="muted">材质分组 {MATERIAL_LABELS[testResult.materialGroup] ?? testResult.materialGroup} · {testResult.differentiated ? "有差异化关键词" : "无差异化关键词"} · {testResult.hasPanel ? "有板材词" : "无板材词"}</span>
                  {testResult.tags.length > 0 && <span className="muted">标签：{testResult.tags.join("、")}</span>}
                </div>
              )}
            </div>
            <div className="panel">
              <h4>每条规则清了多少 · 被你捞回多少</h4>
              <p className="muted">捞回比例高的规则可能太严，考虑放宽关键词。</p>
              <table className="stats-table">
                <thead><tr><th>规则</th><th>清除</th><th>捞回</th></tr></thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.ruleId} className={s.removed > 0 && s.rescued / s.removed > 0.2 ? "hot" : ""}>
                      <td title={s.reason}>{s.reason}</td>
                      <td>{s.removed}</td>
                      <td>{s.rescued}</td>
                    </tr>
                  ))}
                  {!stats.length && <tr><td colSpan={3} className="muted">还没有清除记录</td></tr>}
                </tbody>
              </table>
            </div>
          </aside>
        </div>
      )}

      {section === "brain" && (
        <div className="settings-grid">
          <div className="settings-main">
            <div className="panel">
              <h4>它现在对你的了解</h4>
              <div className="brain-meter big">
                <span>偏好强度</span>
                <i><b style={{ width: `${profile?.strength ?? 0}%` }} /></i>
                <em>{profile?.strength ?? 0}%</em>
              </div>
              <p className="muted">
                只统计正向反馈（收藏、👍、捞回）：偏好分达到 40 的产品自动升入第二大脑，与收藏同款气质的新品也会被优先选入；反馈越多挑得越准。
                移出、👎 只影响那一款产品本身，绝不牵连同属性。你手动升入/降级的永远以你为准。
                {profile?.builtAt ? ` 最近更新 ${new Date(profile.builtAt).toLocaleString("zh-CN")}。` : ""}
              </p>
              <div className="pref-columns">
                <div>
                  <h5>你更喜欢</h5>
                  {profile?.top?.length ? (
                    <ul className="pref-list">
                      {profile.top.map((c) => (
                        <li key={`${c.dim}-${c.value}`}>
                          <small>{c.dimLabel}</small>
                          <b>{c.label ?? c.value}</b>
                          <i style={{ width: `${Math.min(100, Math.abs(c.weight) * 6)}%` }} />
                          <em>+{c.weight}</em>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="muted">还没学到什么。去收藏几款、点几个 👍 👎。</p>}
                </div>
                <div>
                  <h5>你倾向排除</h5>
                  {profile?.avoid?.length ? (
                    <ul className="pref-list avoid">
                      {profile.avoid.map((c) => (
                        <li key={`${c.dim}-${c.value}`}>
                          <small>{c.dimLabel}</small>
                          <b>{c.label ?? c.value}</b>
                          <i style={{ width: `${Math.min(100, Math.abs(c.weight) * 6)}%` }} />
                          <em>{c.weight}</em>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="muted">暂无排除倾向。</p>}
                </div>
              </div>
            </div>
          </div>
          <aside className="settings-side">
            <div className="panel">
              <h4>同图变体</h4>
              <p className="muted">
                已自动隐藏 <b>{counts?.variantsHidden ?? 0}</b> 款与库内产品主图相同的重复链接（同一张图只展示一次，代表款取评论最多、被你动过的优先）。收藏或 👍 过的款永远不会被当成变体藏掉。
              </p>
            </div>
            <div className="panel">
              <h4>怎么训练它</h4>
              <ul className="howto">
                <li><b>收藏</b> 是最强的正面信号。</li>
                <li>在第二大脑里点 <b>👎 降到适配池</b>，等于"这类少推"；点 <b>👍 感兴趣</b> 是强化。</li>
                <li>在适配池里 <b>👍 升入第二大脑</b>，等于"这类我要"；<b>👎 移回产品库</b> 并选个原因。</li>
                <li>在产品库或错题本里 <b>拉上</b> 一款被硬筛的，等于告诉它"这条规则判错了"。</li>
                <li>每次移动右上角都能 <b>撤销</b>，撤销会连学习信号一起收回。</li>
                <li>信号会随时间衰减（约 4 个月减半），你的口味变了它也会跟着变。</li>
              </ul>
            </div>
            <div className="panel danger-zone">
              <h4>重置</h4>
              <button className="btn btn-sm" onClick={() => resetPreference("keep-calibration")}>清空学习反馈，重新开始学习</button>
              <button className="btn btn-sm btn-danger" onClick={() => resetPreference("all")}>清空全部偏好（含钉住的层级）</button>
              <p className="muted">两个按钮都会把手动的层级钉住清空、回到白纸期；收藏夹里的产品不会被删除，只是不再作为偏好信号。历史校准灌入已废除（2026-09-18），两条都从零开始。</p>
            </div>
          </aside>
        </div>
      )}

      {section === "data" && (
        <div className="settings-grid">
          <div className="settings-main">
            <div className="panel">
              <h4>产品数据</h4>
              <div className="data-row">
                <div><b>导入卖家精灵表格</b><span>.xlsx / .csv，按 ASIN 去重更新</span></div>
                <button className="btn btn-primary btn-sm" onClick={() => setImportOpen(true)}>导入</button>
              </div>
              <div className="data-row">
                <div><b>导出全部产品</b><span>含所在空间、清除原因、推荐分与理由</span></div>
                <a className="btn btn-sm" href="/api/export?space=1&format=xlsx" download>导出 Excel</a>
              </div>
              <div className="data-row">
                <div><b>重新计算归位与推荐</b><span>一般不需要手动点；规则、导入、反馈后会自动重算</span></div>
                <button className="btn btn-sm" onClick={async () => { const r = await api.recompute(); setCounts(r.counts); notify("已重新计算", "success"); }}>重算</button>
              </div>
            </div>
            <div className="panel">
              <h4>备份与恢复</h4>
              <div className="data-row">
                <div><b>下载完整备份</b><span>产品、收藏、纠错记录、偏好反馈、规则，一个 JSON 文件</span></div>
                <a className="btn btn-sm" href="/api/backup" download>下载备份</a>
              </div>
              <div className="data-row">
                <div><b>从备份恢复</b><span>支持新版备份，也支持旧版「家具选品备份.json」</span></div>
                <button className="btn btn-sm" onClick={() => restoreInput.current?.click()}>选择文件</button>
                <input ref={restoreInput} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
              </div>
            </div>
          </div>
          <aside className="settings-side">
            <div className="panel">
              <h4>当前数据</h4>
              <ul className="kv">
                <li><span>产品库</span><b>{counts?.space1.toLocaleString("zh-CN")}</b></li>
                <li><span>第二大脑</span><b>{counts?.space3.toLocaleString("zh-CN")}</b></li>
                <li><span>适配池（待复核）</span><b>{counts?.space2.toLocaleString("zh-CN")}</b></li>
                <li><span>被硬性条件筛除</span><b>{counts?.removed.toLocaleString("zh-CN")}</b></li>
                <li><span>收藏</span><b>{counts?.favorites}</b></li>
                <li><span>偏好反馈</span><b>{counts?.events}</b></li>
              </ul>
              <p className="muted">数据存在项目目录 data/linx.db，不再依赖浏览器缓存。换电脑或给同事用时，把备份文件恢复进去即可。</p>
            </div>
          </aside>
        </div>
      )}

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onDone={(m) => { setImportOpen(false); notify(m, "success"); refreshStatus(); }} />}
    </section>
  );
}
