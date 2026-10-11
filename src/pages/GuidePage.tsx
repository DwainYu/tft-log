import { useRef, type ReactNode } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader, Panel } from "../components/ui/Panel";
import { useQuickAdd } from "../components/matches/QuickAddProvider";

/**
 * In-app player guide. Pure local content: no network, no storage writes.
 * In-page navigation uses scrollIntoView instead of `#anchor` links, because
 * HashRouter owns the URL hash and an anchor click would look like a route.
 */

const SECTIONS: { id: string; label: string }[] = [
  { id: "quick-start", label: "快速上手" },
  { id: "pages", label: "页面导览" },
  { id: "workflows", label: "记录与复盘" },
  { id: "data", label: "数据与备份" },
  { id: "faq", label: "常见问题" },
  { id: "design", label: "设计理念" },
  { id: "limits", label: "边界与计划" },
];

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Panel className="mb-4">
      <div id={id} className="scroll-mt-20">
        <header className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-50">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-600">{subtitle}</p>}
        </header>
        <div className="space-y-3 px-4 py-4 text-sm leading-relaxed text-ink-200">{children}</div>
      </div>
    </Panel>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-l-2 border-gold-500/30 pl-3">
      <h3 className="text-[13px] font-semibold text-gold-300">{title}</h3>
      <div className="mt-1 space-y-1.5 text-[13px] leading-relaxed text-ink-300">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: { head: string; body?: ReactNode }[] }) {
  return (
    <ol className="space-y-2">
      {items.map((s, i) => (
        <li key={s.head} className="flex gap-2.5">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-gold-500/40 bg-gold-500/10 text-[11px] font-semibold text-gold-300">
            {i + 1}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-ink-100">{s.head}</div>
            {s.body && <div className="mt-0.5 text-xs leading-relaxed text-ink-400">{s.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-gold-500/25 bg-gold-500/5 px-3 py-2 text-xs leading-relaxed text-ink-300">
      <span className="font-semibold text-gold-300">提示 </span>
      {children}
    </p>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <b className="font-medium text-ink-50">{children}</b>;
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-line bg-base-800 px-1 py-0.5 text-[11px] font-medium text-ink-100">
      {children}
    </span>
  );
}

function PointList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 marker:text-ink-600">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export function GuidePage() {
  const topRef = useRef<HTMLDivElement>(null);
  const { openQuickAdd } = useQuickAdd();

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div ref={topRef}>
      <PageHeader
        title="使用指南"
        subtitle="TFT 弈记怎么记、怎么看、怎么复盘 —— 3 分钟读完核心用法"
        action={
          <Button variant="primary" onClick={openQuickAdd}>
            去记一局
          </Button>
        }
      />

      <nav aria-label="指南目录" className="mb-4 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => goTo(s.id)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-300 hover:bg-base-800 hover:text-ink-100"
          >
            {s.label}
          </button>
        ))}
      </nav>

      <Section
        id="quick-start"
        title="快速上手"
        subtitle="三步最小闭环：记录 → 复盘 → 看趋势"
      >
        <Steps
          items={[
            {
              head: "打完一局，30 秒记完",
              body: (
                <>
                  点侧边栏的 <Label>快速记录一局</Label>（手机上点顶部的 + 号）：弹窗里点一个
                  <Key>最终名次</Key>（键盘 1–8 也行），点选 <Key>阵容</Key>，直接
                  <Label>保存</Label>。其它字段都可以留空，之后随时编辑。
                </>
              ),
            },
            {
              head: "当天记 3–10 局",
              body: (
                <>
                  用 <Label>保存并再记一局</Label> 连续记录：名次和时间清空，阵容、符文、装备保留，
                  连打连记最快。记之前确认侧边栏（手机在顶栏）的 <Key>当前训练</Key> 选对了 —— 日常排位和冲榜要分开记。
                </>
              ),
            },
            {
              head: "给最可惜的一局写复盘",
              body: (
                <>
                  保存时选 <Label>保存并详细复盘</Label>，或从对局详情页点 <Label>开始复盘</Label>：
                  选 <Key>开局路线</Key> 和 <Key>主要问题</Key>，写完 <Key>四项结论</Key>，
                  <Label>保存复盘</Label>。四项填齐，这局才算「已复盘」。
                </>
              ),
            },
            {
              head: "每周看一次趋势",
              body: (
                <>
                  打开 <Label>统计</Label> 看名次走势和错误统计，打开 <Label>周复盘</Label> 看本周小结和
                  下一步建议。数据满 5 局后趋势图才会出现 —— 前几局不用等。
                </>
              ),
            },
          ]}
        />
        <Tip>
          第一次用可以先去 <Label>数据</Label> 页点 <Label>载入示例数据</Label>，用一套虚构对局把每个页面逛一遍。
          示例记录带 demo- 前缀，随时可以 <Label>清除示例数据</Label>；但它会真实参与统计，正式训练前记得清掉。
        </Tip>
      </Section>

      <Section id="pages" title="页面导览" subtitle="侧边栏八个入口，每个页面回答一个问题">
        <div className="space-y-4">
          <Sub title="Dashboard —— 我最近练得怎么样？">
            <PointList
              items={[
                <>
                  五张卡：<Key>近 10 场平均名次</Key>（满 20 局才显示与前一窗口的好坏变化）、
                  <Key>近 10 场 Top4 率</Key>、<Key>吃鸡</Key> 总场次计数、<Key>场次</Key> 与已复盘数、
                  <Key>连续训练天数</Key>。前四率与平均名次看的是最近 10 局窗口，吃鸡和场次是这项训练以来的累计 —— 口径不同是正常的。
                </>,
                <>最近名次折线、主要问题柱状、阵容表现表（少于 3 局的阵容标「样本不足」）、当前训练目标、最近对局列表。</>,
                <>所有数据默认只算<Key>当前训练</Key>；想看全部历史去对局 / 统计页切「全部训练」。</>,
              ]}
            />
          </Sub>
          <Sub title="对局 —— 找出那一局">
            <PointList
              items={[
                <>每页 20 条，点任意一行进详情。筛选器：搜索（阵容 / 棋子 / 装备 / 备注）、名次区间（全部 / Top4 / Bottom4 / 仅吃鸡）、复盘状态、阵容、错误类型、日期区间、排序方式。</>,
                <>筛选条件存在网址里：刷新、收藏都保得住。「清空筛选」一键复位。</>,
                <>「数据范围」下拉默认只看当前训练，可切「全部训练」 —— 注意这个选择不进网址。</>,
                <>页头的 <Label>快速记录一局</Label> 和 <Label>完整对局记录</Label> 是两个记局入口。</>,
              ]}
            />
          </Sub>
          <Sub title="对局详情 & 赛后复盘 —— 想明白为什么">
            <PointList
              items={[
                <>
                  详情页汇总这局的一切：结果徽章（吃鸡 / Top4 / Bottom4）、时长与血量金币、阵容 / 羁绊 / 棋子 / 装备 / 强化符文、备注，
                  下面是 <Key>关键决策</Key>：点 <Label>添加决策</Label> 记「回合、当时状态、你的决定、为什么、结果、现在回看」。一局记 2–3 条就够。
                </>,
                <>
                  复盘页左列是表单：① <Key>开局路线</Key>（连胜 / 连败 / 正常运营 / 走经济 / 硬玩五选一，记在这局对局上）
                  ② <Key>主要问题</Key>（11 类错误的错误类型 + 一句话「这局最大的问题是什么」，必填）
                  ③ <Key>复盘结论</Key>：「本局做得最好的一件事」和「下一局要刻意练习什么」两项必填 —— 四项填齐才算复盘完成；
                  ④ 自我评分 1–5 与开局 / 中期 / 后期过程补充都是选填，过程文字不进入统计。
                </>,
                <>
                  顶部 <Key>复盘进度</Key> 面板实时列出还缺哪几项；没填齐就点 <Label>保存复盘</Label>，会把问题标在对应字段上，不会丢已写内容。
                  保存成功后这局标记为 <Badge tone="good">已复盘</Badge>。
                </>,
              ]}
            />
          </Sub>
          <Sub title="统计 —— 数字从哪些角度看我">
            <PointList
              items={[
                <>
                  训练概览 6 卡：场次 / 平均名次 / <Key>Top4 率</Key>（前四比例）/ <Key>吃鸡率</Key>（第一名比例，不是前四率）/ Bottom4 率 / 连续训练；
                  页脚一行是复盘覆盖率 —— 按「四项必填填齐」判定，不是按有没有写字。
                </>,
                <>
                  往下依次：近 10 / 近 20 场窗口与名次走势、错误统计柱状（点柱子跳进筛选好的对局列表）、阵容统计表、
                  开局路线表、时间段分布（2 小时一档）、决策类型与后视复盘、强化符文表现、近 10 场 vs 前 10 场错误结构对比、
                  血量 / 时长 / 剩余金币分桶。
                </>,
                <>每个模块都有样本阈值：数据不够时显示「再多打几局」的引导而不是画半条曲线吓你 —— 看到引导文案说明是真的没数据，不是坏了。</>,
                <>「数据范围」可切当前训练 / 全部训练，与对局页的选择互相独立。</>,
              ]}
            />
          </Sub>
          <Sub title="资料中心 —— 去哪查版本资料">
            <PointList
              items={[
                <>
                  这是一个<b>人工核验过的外部资料目录</b>：数据站（Tactics.tools、MetaTFT、OP.GG）、官方与版本入口、LoL Wiki。
                  卡片在新标签页打开，本站不抓取、不嵌入、不背书第三方数据。
                </>,
                <>
                  你应用<b>内置</b>的 S18 快照（65 棋子 / 36 羁绊 / 186 装备 / 592 强化符文）不在这里 —— 在「数据」页的 Set 18 面板，
                  以及记局表单里的羁绊 / 装备 / 符文选择器。
                </>,
              ]}
            />
          </Sub>
          <Sub title="训练目标 —— 把错误变成练习动作">
            <PointList
              items={[
                <>
                  <Label>新建目标</Label>：名称和开始日期必填，描述写成可执行的判断标准（例：「4-1 之后不无计划地把金币 D 空」），
                  并手动勾选要针对的错误类型 —— 高频错误可以在统计页的错误统计里先看个数字。
                </>,
                <>
                  状态全部手动：<Label>标记完成</Label> / <Label>归档</Label> / <Label>重新激活</Label>。目标不会自动判定完成 ——
                  你自己确认改掉了再标。过期的进行中目标不会再出现在侧边栏横幅里，但状态要手动归档。
                </>,
                <>删除目标会弹确认框。当前生效的目标会显示在 Dashboard 和周复盘里。</>,
              ]}
            />
          </Sub>
          <Sub title="周复盘 —— 每周一分钟的自动小结">
            <PointList
              items={[
                <>左右箭头翻周（周一为周首），看该周场次、平均名次、Top4 率、吃鸡数、Bottom4 数五张 KPI。</>,
                <>本周小结由本地规则根据名次和错误统计生成（不是 AI），给出一个具体的「下一步」：继续当前目标，或围绕高频错误设新目标。</>,
                <>最常见错误 Top5、本周最常玩阵容、当前训练目标都在本页。</>,
                <>
                  <Key>注意</Key>：周复盘统计的是<b>全部训练</b>在该周的对局，不区分当前训练 —— 和 Dashboard / 统计的会话口径不同，冲榜周和普通周会混在一起。
                </>,
              ]}
            />
          </Sub>
          <Sub title="数据 —— 你的数据你做主">
            <PointList
              items={[
                <>存储概况计数；导出 JSON（全量备份）与 CSV（对局 + 决策明细表）；导入 JSON（合并式）。</>,
                <>训练 Session 管理：新建 / 编辑 / 设为当前；<b>还有对局的 Session 不能删</b>，要先把那些对局移走或删掉。</>,
                <>Set 18 静态数据快照面板（版本号、抓取日期、条目数都在上面）；示例数据载入 / 清除；危险区的清空全部数据。</>,
                <>导出 / 导入是你数据的唯一备份通道 —— 认真读下一节。</>,
              ]}
            />
          </Sub>
        </div>
      </Section>

      <Section id="workflows" title="记录与复盘" subtitle="四条主路径的具体走法">
        <div className="space-y-4">
          <Sub title="快速记录（每天用它）">
            <PointList
              items={[
                <>
                  入口：侧边栏「快速记录一局」/ 任意页面右下角 / 对局列表页头。弹窗流程就是副标题写的：名次 → 阵容 → 问题 → 保存。
                  名次可用键盘 1–8 直接按。
                </>,
                <>
                  阵容选择器会记住你打过的阵容（常用 / 最近 / 预设三个来源），还有 <Label>复制上一局</Label> 一键带上局的阵容、符文、装备。
                  顺手可选：强化符文（最多 3 个，对应游戏里三次三选一）、核心装备、本局最大问题、下一局训练重点。
                </>,
                <>
                  三个保存按钮：<Label>保存</Label> 关窗继续；<Label>保存并再记一局</Label> 保留阵容记下一把；
                  <Label>保存并详细复盘</Label> 直达复盘表单。
                </>,
              ]}
            />
          </Sub>
          <Sub title="完整对局记录（细节用它）">
            <PointList
              items={[
                <>
                  入口：侧边栏 / 对局页的 <Label>完整对局记录</Label>。只有 <Key>名次</Key> 和 <Key>日期</Key> 必填，
                  其余全部可以留空或事后编辑。
                </>,
                <>
                  时间：开始 / 结束时间选填，填了会自动推算时长（也可手动改）；时长限 0–120 分钟。
                  训练 Session 默认记入当前训练，也可以在这里把这一局换到别的训练。
                </>,
                <>
                  阵容细节：最终阵容名、主要羁绊、核心棋子（S18 名单自动补全）、核心装备、强化符文、开局选择、最大问题、备注。
                  保存后进详情页还能继续加决策。
                </>,
              ]}
            />
          </Sub>
          <Sub title="复盘的正确姿势">
            <PointList
              items={[
                <>优先复盘打崩的局（7、8 名）和差一点的局（2–4 名）：前者找失误，后者找临界决策。</>,
                <>「下一局要刻意练习什么」写成可执行动作（"8 级前不 D"），别写"打得稳一点"。下一局的复盘开头问的就是它。</>,
                <>
                  快速记录里写的 <Label>下一局训练重点</Label> 会存为草稿，进到复盘表单会预填进去 —— 但只有四项结论填齐保存后，这局才计入「已复盘」。
                </>,
                <>一局只有一份复盘，再次保存是覆盖更新，不是新增。</>,
              ]}
            />
          </Sub>
          <Sub title="用数据验证自己有没有变强">
            <PointList
              items={[
                <>
                  <Key>看趋势</Key>：统计页走势折线的每个点是一局的实际名次，虚线是近 20 场平均 —— 线往下走就是在变好。
                  样本少的点上下乱跳是正常的，别为单场涨跌下结论。
                </>,
                <>
                  <Key>找病灶</Key>：错误统计柱状 + 「近 10 场 vs 前 10 场」对比表看哪类错误在涨；点柱子直接跳进那批对局。
                </>,
                <>
                  <Key>定点打</Key>：把高频错误做成训练目标（表单里手动勾选对应错误类型），之后每周看该类错误的条数有没有降。
                </>,
              ]}
            />
          </Sub>
        </div>
      </Section>

      <Section id="data" title="数据与备份" subtitle="所有数据只存在你这台设备的浏览器里 —— 全指南最重要的一节">
        <div className="space-y-4">
          <Sub title="数据存在哪里">
            <PointList
              items={[
                <>
                  对局、决策、复盘、目标、训练会话全部存在浏览器的本地数据库（IndexedDB），<b>不上传任何服务器</b>，没有账号，也没有联网请求（资料中心的外链除外）。
                  白天模式的偏好存在 localStorage。
                </>,
                <>
                  换浏览器、换设备、换域名打开（比如从 Toy 页面换到 GitHub Pages），都是<b>互相独立</b>的一份数据，互相看不到。
                  在 Bilibili Toy 里打开时，数据存在这一层浏览器存储分区中，浏览器清理站点数据时会被一起清掉。
                </>,
                <>无痕 / 隐私窗口关闭即销毁，别用它做长期记录。</>,
              ]}
            />
          </Sub>
          <Sub title="怎么备份（建议每周一次）">
            <Steps
              items={[
                {
                  head: "数据页 → 导出 JSON",
                  body: (
                    <>
                      得到「<Label>Export JSON（全部数据）</Label>」导出的完整备份：全部对局、决策、复盘、目标、训练会话。
                      CSV 只有对局和决策明细，用表格软件看可以，<b>不能用来恢复</b>。
                    </>
                  ),
                },
                {
                  head: "把文件放到浏览器之外",
                  body: <>下载目录也会被清理 —— 转存到网盘 / 聊天窗口 / 硬盘，至少在设备之外留一份。</>,
                },
                {
                  head: "换设备或恢复时：导入 JSON",
                  body: (
                    <>
                      导入是<b>按记录 id 合并</b>：文件里的同 id 记录会直接覆盖本地那条（不比较谁更新），新 id 追加，本地独有的保留，
                      校验不过的记录跳过并在导入报告里计数。想保住现状就别乱重放旧备份 —— <b>重放旧备份会把旧版本盖回你的新修改</b>。
                    </>
                  ),
                },
              ]}
            />
            <Tip>
              每周复盘完顺手导出一份，文件名自带日期不会互相覆盖。清浏览器缓存、重装系统、平台清理之前，<b>必须先导出</b> —— 数据丢了没有任何找回渠道。
            </Tip>
          </Sub>
          <Sub title="删除操作会发生什么">
            <PointList
              items={[
                <>
                  <Key>删除对局</Key>（详情页或编辑页，有确认弹窗）：连带删除这局的复盘和全部决策，不可恢复。
                </>,
                <>
                  <Key>删除复盘</Key>（复盘页右栏）：这局回到「未复盘」，但它的主要失误归因仍会留在错误统计里 —— 想撤销归因，去编辑这局对局改掉最大问题。
                </>,
                <>
                  <Key>删除训练会话</Key>：只允许删没有对局的空会话（有对局时按钮会拦你并提示先移动），不会误删战绩。
                </>,
                <>
                  <Key>清空全部数据</Key>：删除所有对局 / 决策 / 复盘 / 目标（确认弹窗里写着条数），训练会话保留为配置。删之前先导 JSON。
                </>,
              ]}
            />
          </Sub>
          <Sub title="示例数据">
            <PointList
              items={[
                <>
                  16 局虚构对局 + 决策 / 复盘 / 目标，日期自动平移到今天，id 全部带 demo- 前缀、固定挂在「日常训练」。
                  加载可重复执行不产生重复数据；<Label>清除示例数据</Label> 只删 demo- 前缀记录，你的真实记录不动。
                </>,
              ]}
            />
          </Sub>
        </div>
      </Section>

      <Section id="faq" title="常见问题" subtitle="全部按当前版本的真实行为回答，没有的功能不会承诺">
        <div className="space-y-4">
          <Sub title="什么样的局算「已复盘」？">
            <p>
              复盘的 4 项必填（主要问题类型、这局最大的问题、做得最好的一件事、下一局练习什么）填齐并保存，才算已复盘、才计入复盘覆盖率。
              只在快速记录里写过「下一局训练重点」、或只在备注里留言，都<b>不算</b> —— 那是草稿，不是复盘。
            </p>
          </Sub>
          <Sub title="「吃鸡率」和「Top4 率」哪个是胜率？">
            <p>
              应用里不叫胜率：<Key>Top4 率</Key> 是前四比例（云顶得分的主逻辑），<Key>吃鸡率</Key> 是第一名比例，两者分开显示，别混。
              平均名次按 1–8 名计算。
            </p>
          </Sub>
          <Sub title="能不能自动抓我的对局 / 读战绩页？">
            <p>
              不能。当前版本只有手动记录，无任何联网取数。国服没有可依赖的对局查询接口，自动录入在路线图上但本版本没有。
            </p>
          </Sub>
          <Sub title="为什么趋势图 / 错误分析是空的？">
            <p>
              设计如此：走势要 5 局以上、错误对比要两个窗口装满、单阵容 3 局以上才给数字，数据不够时显示引导文案 ——
              一个会误导人的数字不如先空着。多打几局、多写几份复盘就会出来。
            </p>
          </Sub>
          <Sub title="资料中心 / 强化符文统计的名字和最新版本对不上？">
            <p>
              内置 S18 资料是固定快照（DDragon 16.19 · TFT 18.3 · 2026-09-24 抓取），平衡改动不会自动跟进，新版本要等重新生成快照。
              统计页的「强化符文表现」来自你自己的样本，个位数场次只有参考意义。
            </p>
          </Sub>
          <Sub title="点了导出 JSON 但没看到下载文件？">
            <p>
              在 Toy 内嵌页面里，浏览器可能拦截下载 —— 数据页的「复制备份」按钮可以把备份内容复制到剪贴板再存成文件；
              在普通浏览器里打开则检查下载目录 / 浏览器的下载管理页。
            </p>
          </Sub>
          <Sub title="点了资料中心卡片没反应？">
            <p>
              嵌入环境的浏览器可能拦截新窗口。卡片下方标注了站点域名，可以手动输入访问；用普通浏览器打开应用则不受影响。
            </p>
          </Sub>
          <Sub title="页面一片空白 / 一直转圈加载不完？">
            <p>
              出错或崩溃时页面会显示兜底提示，先刷新一次。如果一直停在「读取中」转圈，多半是浏览器禁用了站点数据
              （无痕窗口、隐私设置里的「阻止第三方 Cookie / 站点数据」）—— 换普通窗口、允许本站存储再打开。
              操作失败一般会在屏幕下方弹出提示；持续异常请用「哪个页面 + 做了什么操作」反馈（项目开源在 GitHub：
              DwainYu/tft-training-log，可提 issue）。
            </p>
          </Sub>
          <Sub title="连续天数怎么算的？">
            <p>
              从今天（没打则从昨天）往前数连续有记录的日历日。中断一天就重新从零开始 —— 它是出勤表，不是能力表。
            </p>
          </Sub>
        </div>
      </Section>

      <Section id="design" title="设计理念" subtitle="为什么是这几个页面、这些字段、这些口径">
        <PointList
          items={[
            <>
              <Key>本地优先</Key>：训练记录是你的比赛隐私，全部留在本机浏览器，无账号、无上传、打开即用。
              代价是没有云同步，所以把 JSON 导出 / 导入做成了完整、可合并的逃生通道。
            </>,
            <>
              <Key>低摩擦记录优先于完整性</Key>：复盘工具最大的敌人是懒得记。所以快速记录只要名次必选、阵容两次点击就能保存，
              其它字段全部可选随时补 —— 记 50 局残缺数据好过记 3 局完美数据。
            </>,
            <>
              <Key>复盘必须结构化才能分析</Key>：自由文字没法聚类。主要问题归入 11 类错误、开局归入 5 条路线、结论必须写成可执行动作，
              错误统计、近10场对比、周复盘小结、目标联动全部建立在这套结构上。
            </>,
            <>
              <Key>对玩家诚实</Key>：空数据显示引导而不是 0；样本不足明说样本不足；数据不够拒绝画趋势线；
              「已复盘」按填齐标准严格计数 —— 宁可少给数字，不给假数字。
            </>,
            <>
              <Key>训练会话</Key>：日常冲分和比赛周的目标压力不同，混在一起的平均名次没有意义，
              所以全局有会话切换，绝大多数统计只算当前训练。
            </>,
            <>
              <Key>静态数据打包而非实时抓取</Key>：S18 资料内置、离线可用、构建可复现，代价是版本更新要手动重生成快照
              （scripts/build-set18-data.mjs，版本与抓取日期在「数据」页公开可查）。
            </>,
          ]}
        />
      </Section>

      <Section id="limits" title="边界与计划" subtitle="已实现 / 计划中 / 不做，说得明确一点">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="good">已实现 · 手动记录与编辑</Badge>
          <Badge tone="good">已实现 · 结构化复盘与决策记录</Badge>
          <Badge tone="good">已实现 · 统计与图表下钻</Badge>
          <Badge tone="good">已实现 · 训练目标 / 周复盘 / 会话</Badge>
          <Badge tone="good">已实现 · JSON/CSV 导出与合并导入</Badge>
          <Badge tone="good">已实现 · S18 静态数据选择器</Badge>
          <Badge tone="muted">计划中 · 对局自动录入（国服客户端适配）</Badge>
          <Badge tone="muted">计划中 · 截图识别关键回合</Badge>
          <Badge tone="muted">计划中 · AI 周记总结</Badge>
          <Badge tone="bad">不做 · 云同步与账号系统</Badge>
          <Badge tone="bad">不做 · 影响对局的实时数据</Badge>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          「不做」是产品原则：这个工具帮你在<b>局后</b>变强，不参与局内竞争；你的数据只该存在你自己的设备上。
          计划中的功能没有上线时间表，当前版本请只按「已实现」来使用。已知边界：8 人标准局口径（Bottom4 = 5–8 名）、
          数据快照不自动更新、单机使用 —— 这些都写在上面的章节里。
        </p>
      </Section>

      <div className="flex flex-wrap items-center gap-2 pb-2 pt-1">
        <Button onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth" })}>回到顶部</Button>
        <Button variant="primary" onClick={openQuickAdd}>
          记下今天的第一局
        </Button>
      </div>
    </div>
  );
}
