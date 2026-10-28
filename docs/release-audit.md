# TFT 日志 上线前审查报告（release audit）

- 审查日期：2026-10-11（当晚发布窗口）
- 基线：`main@c18cdcd`（已验证包含 PR #2 全部合并）；Toy 兼容构建在 `feat/bilibili-toy-compat@296a53f`（仅改 `vite.config.ts` 的 base 三态）
- 工作分支：`feature/tft-guide-and-release-audit`，提交 `5c85138`（指南 + 审查修复）、`1c15302`（实机验证发现的两处崩溃级修复）
- 原则：不覆盖/amend/强推任何已验证提交；只修「明确在范围内、低风险、有测试支撑」的 P0/P1，其余以建议记录
- 验证状态：`tsc --noEmit` 通过；`npm test` 53 文件 / 494 用例全绿；`TOY=1 npm run build` 通过；真实浏览器（BrowserSkill）实测通过（见 §5）

## 合并后复核（2026-10-28）

本节是合并到当前主线后的补充记录；以上审计元数据保留为 2026-10-11 的原始证据，不代表今天的提交或分支状态。

- 当前基线：`main@76dc784`，玩家指南与安全修复已通过 [PR #6](https://github.com/DwainYu/tft-log/pull/6) 合并。
- 原审核分支里的 Toy 构建提交 `296a53f` 与主线 `7dc2bfe` 补丁一致，未重复合并；审核文档与封面单独通过本 `docs` PR 归档。
- 名次规则以当前实现为准：渐进记录允许缺省名次，但一旦存在就必须是 1–8。此项修正了 §1 P0-1 中“名次必填”的旧描述。
- 复核验证：`npm run typecheck`、38 项定向测试、`npm run build`、PR CI、合并后 `main` CI 与 GitHub Pages 部署均通过；完整套件 62 文件 / 639 项断言通过，但有一次测试环境销毁后的既有 `Toast.tsx` 定时器竞态使进程退出 1。
- 本次复核未重跑原报告中的全部真实浏览器场景；因此 §5 的浏览器结论仍对应 2026-10-11 的原构建，不能外推为对所有后续改动的完整回归。

## 1. P0 —— 阻止发布项（当晚已全部修复）

### P0-1 导入畸形备份可致统计/页面崩溃（已修）
- 位置：`src/services/export-service.ts` `importSnapshot` 匹配过滤（:209-216）
- 证据：旧过滤只查 `id` 与静态数据合法性；`playedAt` 缺失/非法（`"not-a-date"`、`2026-13-45T99:99`）或 `placement` 越界（0/9/2.5/字符串）的记录会被原样写进 IndexedDB。排序、时间分桶、Top4/Bottom4 计算在坏数据上行为未定义，且坏数据会永久留在库里，每次打开页面反复触发。
- 修复：导入前逐条校验 `isRecord && hasId && isPlacement(1..8 整数) && typeof playedAt === "string" && isValidWallClock && validateMatchStaticData` 全过才入库，否则计入 `skipped`。（这是 2026-10-11 的规则；当前允许缺省名次，见“合并后复核”。）
- 测试：`export-service.test.ts`「import guards」3 例（无效时间跳过、越界名次跳过、无 schemaVersion 仍兼容）。

### P0-2 未来版本备份文件被旧版「尽力导入」（已修）
- 位置：`export-service.ts` `parseSnapshot`（:136-141）
- 证据：`schemaVersion` 此前不检查；若未来 v3 备份改了字段语义，旧版会静默半导入，破坏数据一致性。
- 修复：`schemaVersion > SNAPSHOT_SCHEMA_VERSION(2)` 直接抛错「请先升级」。
- 测试：`export-service.test.ts`「rejects a snapshot from a newer schema version」。

### P0-3 任何渲染期错误 = 整页白屏无出口（已修）
- 位置：新增 `src/components/ui/ErrorBoundary.tsx`；挂载于 `src/App.tsx:28`（包住 `<Routes>`）
- 证据：审查中真实浏览器里数据页触发 React #310 时，若无边界整个应用空白（当时用户看到的正是无提示白屏）；现在显示兜底面板 + 存储禁用指引 + 「刷新页面」按钮。
- 测试：`ErrorBoundary.test.tsx` 2 例。

### P0-4 使用指南初版基于过期盘点、描述不存在功能（已修）
- 证据：第一版功能盘点报告与源码冲突（分页大小、资料中心内容、胜率口径、复盘页结构等 6+ 处）。若照写会向玩家承诺不存在的能力，违反「不承诺未支持能力」红线。
- 修复：`GuidePage.tsx` 全部按源码逐条重写；关键口径已对源核验：`PAGE_SIZE=20`（MatchesPage.tsx:21）、错误类型 11 类 / 开局路线 5 条（types.ts:12,60）、demo 16 局（demo-matches.json）、`winRate=第一名`（stats.ts）、`isReviewComplete=四项必填`（review.ts:38-45）、S18 快照 65/36/186/592。
- 测试：`guide-page.test.tsx` 5 例，含「不出现虚假承诺」负向断言。

### P0-5（实机验证发现）数据页整页崩溃：hooks 顺序违规（已修，`1c15302`）
- 位置：`src/pages/DataPage.tsx` —— 新增的 `backupText` state 原本在 `if (counts === undefined) return <Spinner/>`（:70）之后。
- 证据：真实浏览器打开 `#/data` 立即命中 ErrorBoundary，控制台 React error #310（Rendered more hooks…）。jsdom 测试此前完全没覆盖 DataPage，故未拦截。
- 修复：state 声明移到早退之前；新增 `data-page.test.tsx` 回归测试，并用 stash 验证过「坏代码必失败、好代码通过」。

## 2. P1 —— 重要问题（当晚处理情况）

### P1-1 导入文案承诺与实际合并语义相反（已修）
- 位置：`DataPage.tsx:294` 及导入说明正文
- 证据：导入是按 id 的 upsert，同 id 无条件用文件内容覆盖、不比较新旧（`export-service.ts` 合并实现）；旧文案暗示「不会覆盖新数据」，用户重放旧备份会把自己的新修改倒写回去且无任何提示。
- 修复：文案改为「合并导入：同 id 记录以文件内容覆盖（不比较新旧），新记录追加」+ 正文警告重放旧备份的后果；代码注释同步纠正。真实浏览器截图确认新文案已上线到 dist。
- 遗留建议：如需真正安全，应实现 `updatedAt` newer-wins 或导入前 diff 预览 —— 属功能改动，不在当晚低风险范围。

### P1-2 Toy 沙箱可能拦截导出下载 → 备份逃生通道（已修 + 已验证）
- 位置：`DataPage.tsx` 「复制备份（下载被拦截时用）」按钮（:282）+ `copyText`（export-service.ts:314）+ 手动复制兜底 Modal（:550+）
- 证据：`downloadText` 用 blob + `a.click()`，Toy iframe 若无 `allow-downloads` 会静默失败（无报错、无文件）。
- 修复：三级逃生：剪贴板 API（1.5s 超时保护）→ `execCommand("copy")` → 弹出只读文本框手动全选。实机验证：在真实 Chromium 中确认 `writeText` 可永久挂起（无焦点场景），超时兜底链路完整走通（弹出兜底 Modal、按钮恢复可用）。
- 验证结果（预览页实测）：Toy 预览 iframe 的 `sandbox` 属性含 `allow-downloads`；沙箱内点击 Export JSON 出现「JSON 已导出」提示、无页面错误。文件实际落盘未能用本机 bsk 构建捕获（remote browser 不支持 download 拦截），但沙箱权限 + 应用侧行为均正常。

### P1-3（实机验证发现）剪贴板写入可永久挂起 → 全部按钮卡 busy（已修，`1c15302`）
- 位置：`export-service.ts` `copyText`
- 证据：BrowserSkill 实测 `navigator.clipboard.writeText` 30s 不 resolve（无用户手势/焦点场景浏览器会悬挂权限），导致 `onCopyBackup` 永不返回、数据页四个按钮全部禁用无法恢复。
- 修复：`Promise.race` 1.5s 超时后落入 `execCommand` 兜底；新增悬挂场景测试（export-service.test.ts）。

### P1-4 删除/清空失败时按钮永久卡 busy 且无反馈（已修）
- 位置：`MatchDetailPage.tsx`、`MatchFormPage.tsx`、`TrainingGoalsPage.tsx`、`DataPage.tsx`（清除示例 / 清空全部）
- 证据：确认弹窗的 async handler 无 catch；IndexedDB 抛错（配额/禁用）时 `busy` 不复位、错误被吞。
- 修复：统一 try/catch/finally + toast 提示错误信息。

### P1-5 IndexedDB 被禁用时启动转圈永不结束（已修，沙箱已验证）
- 位置：`src/services/session-context.tsx:38-39`
- 证据：`ensureDefaultSessions()` 无 catch；无痕/禁用站点数据时 promise reject 未处理，`booted` 永不置真，整站停在加载态。
- 修复：`.catch` 后照常放行渲染（页面级错误由 ErrorBoundary/toast 承接）；指南 FAQ 增加「一直转圈」的存储禁用指引。
- 验证结果（预览页实测）：Toy 沙框 iframe 带 `allow-same-origin`，且**上一版预览（a257285）写入的数据在本次预览中完整存活**（Dashboard 直接显示旧 demo 数据）—— 同域 IndexedDB 在两次发布间持久化正常。注意：`bilibilitoy.com` 相对 `bilibili.com` 属第三方上下文，浏览器开启第三方存储分区/清理时仍可能重置，指南「数据与备份」一节已如实告知。

### P1-6 训练目标默认开始日期用 UTC 日（已修）
- 位置：`GoalComponents.tsx:23` `dateKey(wallClockNow())`
- 证据：UTC+8 用户每天 00:00–08:00 新建目标会默认成「昨天」。
- 测试：`goal-form.test.tsx` 用 23:30 本地时刻钉死该行为。

### P1-7 Toy 沙箱可能拦截新窗口（资料中心外链）（已验证，未改代码）
- 证据：`DataCenterPage` 卡片 `target="_blank"`；iframe 无 `allow-popups` 时点击无反应。
- 验证结果（预览页实测）：Toy 预览 iframe `sandbox` 属性含 `allow-popups allow-popups-to-escape-sandbox` —— 新窗口不被沙箱拦截。指南 FAQ 仍保留「点了没反应」的自救说明（覆盖个别浏览器策略）。

## 3. P2 —— 已知但不阻止发布（建议，未动代码）

| # | 问题 | 位置 | 建议 |
|---|------|------|------|
| D1 | 导入非事务：中途抛错留下半导入状态 | `export-service.ts` importSnapshot | 包进 `db.transaction("rw", …)`；失败整体回滚 |
| D2 | 同 id 覆盖无 newer-wins / 无预览 diff | 同上 | 导入前 diff 报告或按 `updatedAt` 择新 |
| D3 | S18 快照 `validateDataset` 在模块加载期抛错会白屏 | `src/data/tft/*` | 已被 ErrorBoundary 兜住；建议降级为「数据不可用」面板 |
| D4 | 跨午夜对局按开始日归日 | `lib/wallclock` 使用处 | 产品决策项，保持现状并文档化 |
| D5 | 删除对局不回滚 compositionUsage 计数 | `composition-usage-service` | 删除路径里同步回收 |
| D6 | `useLiveQuery` 的 error 态未surfaced | 各页面 | 统一 hook 包一层错误提示 |
| D7 | Modal 焦点管理（焦点未 trap、关闭未归还） | `components/ui/Modal.tsx` | 补 focus-trap |
| D8 | bottom4 硬编码 8 人局（>4 即算） | `domain/stats/stats.ts` | 多人数模式支持时参数化 |
| D9 | 统计页 ~17 个查询串行 await | `stats-service` | `Promise.all` 化；本地库量级下无感 |
| D10 | recharts YAxis 对极端值裁切 | StatisticsPage 图表 | `allowDataOverflow` + domain 兜底 |
| D11 | 包体单 chunk 1.32MB（gzip 373KB） | vite build | 建议 manualChunks / 路由级懒加载，改善 Toy 内首屏 |
| D12 | 主题偏好 localStorage 失败静默降级 | `lib/theme` | 现状可接受（try/catch 已有），无需处理 |

## 4. Toy 环境专项（发布前人工核对清单）

| 项 | 状态 | 说明 |
|----|------|------|
| 相对路径 base | 已验证 | `TOY=1` 构建产物 `index.html` 全部 `./assets/…`、`./favicon.svg` |
| HashRouter | 已符合 | 应用本就用 hash 路由，与 Toy 子路径兼容；指南内跳转刻意用 `scrollIntoView` 不产生 `#锚点` 路由冲突 |
| 单文件体积 | 已验证 | HTML 1KB，无大内联数据块 |
| 沙箱权限（实测） | 已验证 | 预览 iframe `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-downloads allow-pointer-lock allow-top-navigation-by-user-activation"` —— 下载与新窗口均不被拦 |
| 导出下载 | 已验证（应用侧） | 沙箱内点 Export JSON 出现「JSON 已导出」、无错误；文件落盘未能被本机 bsk 捕获（remote browser 限制），由 `allow-downloads` 属性佐证 |
| 新窗口外链 | 已验证（权限侧） | `allow-popups` 存在；FAQ 自救文案仍保留 |
| IndexedDB 持久化 | 已验证 | 上一版预览写入的数据在本版预览完整存活；第三方分区/清理风险已在指南如实告知 |
| 内容预检（toy_doctor） | 已通过 | 1 条 WARN（产物指纹误报，Vite 实际已带 hash） |

## 5. 验证记录

- `npx tsc --noEmit`：通过
- `npm test`：53 文件 / 494 用例全部通过（新增 12 个用例：指南 5、导入守卫 4、copyText 4、ErrorBoundary 2、GoalForm 2、DataPage 2 —— 部分并入既有用例文件）
- `TOY=1 npm run build`：通过；dist 抽查含「使用指南/记录与复盘/复制备份/页面遇到了一点问题」字符串，资源路径全部相对
- BrowserSkill 真实浏览器实测（本地静态服务 dist）：
  - `#/guide` 渲染、目录滚动不离开路由（hash 保持 `#/guide`）、「去记一局」打开快速记录抽屉 —— 通过
  - 移动端 375×667 指南排版 —— 通过
  - `#/data`：发现并修复 P0-5（React #310）后完整走通：载入示例 16 局 → 存储概况计数 → 复制备份（触发 P1-3 悬挂 bug，修复后正确落入兜底 Modal）→ 清除示例归零 —— 通过
  - 控制台除扩展自身噪音外无页面错误
- 未实机覆盖（标注）：导出文件在 Toy 侧的真实落盘（bsk 构建限制，见 §4）；复盘表单完整提交流程仅由既有测试覆盖
- Toy 预览页实测（BrowserSkill，预览 URL 见 §6）：Dashboard/指南/数据页在沙箱 iframe 内渲染正常；沙箱 `sandbox` 属性含 `allow-downloads`/`allow-popups`；上一版预览的 IndexedDB 数据跨发布存活；沙箱内导出触发成功提示、控制台无页面错误

## 6. 发布动作记录

- 打包：`dist/`（`TOY=1 npm run build`）经 toy 内容预检（1 条误报 WARN，见 §4）后以 `toy create dist --title "TFT 弈记" --slug tft-yiji --category TOOL --json` 上传，**仅生成预览、未提交审核**（按任务要求等待人工确认）
- 预览 URL：https://www.bilibili.com/toy/preview/preview_5k2perG1/index.html
- 提交审核：用户确认后执行。首次 `--yes` 提交被服务端以 `code=307009 缺少必要文件` 原子拒绝（`mylist` 确认无半成品），补上封面 `toy-poster.png` 后重跑成功
- 审核提交结果：作品 ID `42684584559616`，状态 `auditing`（审核中），提交时生成预览 https://www.bilibili.com/toy/preview/preview_sg82lvhT/index.html

## 7. 残余风险（发布可接受度评估）

1. **数据丢失面**：单机存储 + 浏览器/平台清理 = 无找回渠道，指南「数据与备份」一节已如实告知（含重放旧备份倒写警告、第三方分区说明）。
2. **导入非事务**（D1）：极端畸形文件仍可能半导入，但坏记录现在会在入口被过滤，风险显著下降。
3. **首屏 1.3MB chunk**（D11）：慢网络下 Toy 内加载偏慢，不阻塞使用。
4. **导出落盘**：沙箱权限已确认放行，未捕获真实文件（工具限制）；即使个别环境拦截，「复制备份」三级兜底已实机验证可用。
