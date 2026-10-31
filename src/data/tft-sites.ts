/**
 * TFT Data Center Sites Catalog (V2).
 *
 * Curated directory of 6 verified third-party TFT websites with Chinese
 * introductions, practical tutorials, use case guidance, and verified
 * mainland access experiences.
 *
 * Principles:
 * 1. Zero runtime network requests: purely local static data.
 * 2. No iframe, no scraping, no copying third-party data into local storage.
 * 3. All external links open in a new tab with rel="noopener noreferrer".
 * 4. Access notes are subjective test observations recorded on 2026-10-31.
 */

export type SiteCategory =
  | "comps-strategy"
  | "board-calc"
  | "mechanics-loot"
  | "ai-query"
  | "data-explorer";

export interface CategoryOption {
  id: "all" | SiteCategory;
  label: string;
  description: string;
}

export const SITE_CATEGORIES: CategoryOption[] = [
  { id: "all", label: "全部网站", description: "查看精选推荐的全部 6 个工具站点" },
  { id: "comps-strategy", label: "阵容选择与攻略", description: "阵容推荐、梯度评级与灵活转线思路" },
  { id: "board-calc", label: "棋盘模拟与战斗计算", description: "双方站位对位、输出承伤与寻敌路径推演" },
  {
    id: "mechanics-loot",
    label: "游戏机制与特殊奖励",
    description: "特殊战利品、概率表与深度机制资料",
  },
  { id: "ai-query", label: "AI 辅助查询", description: "自然语言中文智能问答与局面决策启发" },
  { id: "data-explorer", label: "综合数据探索", description: "国内多维度大数据交叉探索与胜率检验" },
];

export type MainlandAccessStatus = "accessible" | "slow" | "unconfirmed";

export interface TutorialStep {
  title: string;
  detail: string;
}

export interface TftSite {
  id: string;
  name: string;
  shortName: string;
  url: string;
  category: SiteCategory;
  categoryLabel: string;
  tagline: string;
  description: string;
  coreFeatures: string[];
  useCases: string[];
  tutorial: TutorialStep[];
  recommendations: string[];
  language: "中文" | "英文";
  mainlandAccess: MainlandAccessStatus;
  accessStatusText: string;
  accessNote: string;
  badgeTone: "good" | "gold" | "muted";
  lastVerified: string;
  brandAccent: {
    bg: string;
    text: string;
    border: string;
  };
}

export const TFT_SITES: TftSite[] = [
  {
    id: "tft-flow",
    name: "TFT Flow",
    shortName: "TF",
    url: "https://tftflow.com/",
    category: "comps-strategy",
    categoryLabel: "阵容选择与攻略",
    tagline: "不只是查看阵容，更关注如何根据装备、海克斯和对局情况灵活选择阵容。",
    description:
      "主打阵容推荐、深度对局讲解与 Flex 灵活转线思路的现代 TFT 工具站。它帮助玩家跳脱死板公式，学会在实战中根据当前装备、海克斯与来牌动态决策。",
    coreFeatures: [
      "灵活转线（Flex）推演：分析同类散件在不同体系间的平替阵容分支",
      "Line Selection 选线：按散件、特殊物品与强化符文筛选可用阵容（个性化推荐需订阅登录）",
      "起手局势关联：重点讲解何时进特定阵容，包含散件契合度与启动条件",
      "阵容详情：包含 Comp Variations、Tips 与分阶段装备、升级和搜牌节奏",
    ],
    useCases: [
      "开局爆出特定散件或海克斯，不确定能向哪几套体系发展时",
      "想摆脱单一固定阵容思维，提升实战中的灵活摇摆和转线能力",
      "需要清晰了解一套阵容的成型门槛与阶段提速节奏时",
    ],
    tutorial: [
      {
        title: "浏览推荐阵容列表",
        detail: "进入首页查看当前版本各主流阵容的评级梯队与核心思路梗概。",
      },
      {
        title: "阅读阵容详情与进场条件",
        detail: "点击具体阵容，重点查看「何时选择这套阵容」及核心装备散件要求。",
      },
      {
        title: "查看 Flex 灵活转线分支",
        detail: "若发牌不顺或散件有偏差，参考其提供的平替阵容，避免强行硬走一条路。",
      },
      {
        title: "对照关键回合过渡节奏",
        detail: "参考其 2-1、3-2、4-1 等阶段性打工建议，合理规划金币与拉人口时机。",
      },
    ],
    recommendations: [
      "个性化推荐需要订阅：Line Selection 免费可用 Demo 预设，个性化线路推荐需要按网站要求登录已订阅的 Patreon 或 Twitch 账号。",
      "理解逻辑重于死记站位：该站核心价值在于转线思路启发，实战发牌充满随机性，切忌机械死板套用。",
      "优先核验核心神装：如果缺少关键主 C 或前排核心装，建议参考其备选分支提前转向。",
    ],
    language: "英文",
    mainlandAccess: "accessible",
    accessStatusText: "可访问",
    accessNote: "国内网络环境下测试可正常打开访问，页面载入与交互较为顺畅。",
    badgeTone: "good",
    lastVerified: "2026-10-31",
    brandAccent: {
      bg: "bg-sky-500/10",
      text: "text-sky-400",
      border: "border-sky-500/30",
    },
  },
  {
    id: "tftraits",
    name: "TFTraits",
    shortName: "TT",
    url: "https://tftraits.com/",
    category: "board-calc",
    categoryLabel: "棋盘模拟与战斗计算",
    tagline: "在棋盘上摆出双方阵容，观察开局寻路与目标锁定，并用独立计算器查看输出和承伤。",
    description:
      "TFTraits 提供 Board Planner、DPS Calculator 与 Tank Calculator 等独立工具。Board Planner 可以同时摆出双方阵容，设置星级、装备与强化符文，并查看战斗开始时的 targeting（锁定目标）与 walking（寻路）；输出与承伤则在各自的计算器中单独计算。",
    coreFeatures: [
      "双方棋盘摆位（Board Planner）：同时放置我方与假想对手阵容，设置星级、装备与强化符文",
      "开局寻路与锁定目标（targeting / walking）：查看战斗开始时单位的移动路径与优先攻击目标",
      "独立 DPS Calculator：计算单个英雄在指定装备与羁绊下的输出表现",
      "独立 Tank Calculator（Effective Health）：计算英雄的有效生命值与承伤能力",
    ],
    useCases: [
      "决赛圈 1v1 或 2v2 对位，需要研究主 C 怎么避开敌方突脸或致命爆发",
      "想比较两件备选装备的输出或承伤收益时（改用 DPS / Tank Calculator）",
      "测试主坦站前排左侧或右侧时能否有效拉住敌方多名前排仇恨",
    ],
    tutorial: [
      {
        title: "打开 Board Planner 并放入我方单位",
        detail:
          "进入 tftraits.com/board/，用 Units 面板选择英雄，或粘贴 team code 直接导入阵容，再设置星级、装备与强化符文。",
      },
      {
        title: "摆出假想敌方阵容",
        detail:
          "把对手的常见构筑放到棋盘另一侧，可随机生成对手或手动添加单位，尽量还原实际对位位置。",
      },
      {
        title: "查看开局寻路与锁定目标",
        detail:
          "观察战斗开始时的移动路径与第一攻击目标；如果要看具体输出或承伤数值，改用 DPS Calculator 与 Tank Calculator 单独计算。",
      },
      {
        title: "微调站位并重复对比",
        detail:
          "移动主 C 或主坦的格子后重复观察 targeting / walking 结果，比较哪套对位更符合你的目标。",
      },
    ],
    recommendations: [
      "模拟不是实战预测：站点明确说明棋盘计算并非 100% 准确，结果是基于数据文件与观察的参考，实战仍受技能、暴击与控制影响。",
      "注意工具分工：Board Planner 负责摆位与开局寻路，DPS 和坦度要分别到 DPS Calculator 与 Tank Calculator 查看，不要混为一谈。",
    ],
    language: "英文",
    mainlandAccess: "accessible",
    accessStatusText: "可访问",
    accessNote: "国内网络环境下测试可直接打开访问，棋盘画布渲染响应正常。",
    badgeTone: "good",
    lastVerified: "2026-10-31",
    brandAccent: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/30",
    },
  },
  {
    id: "little-buddy-bot",
    name: "Little Buddy Bot",
    shortName: "LB",
    url: "https://www.littlebuddybot.com/",
    category: "mechanics-loot",
    categoryLabel: "游戏机制与特殊奖励",
    tagline: "查询云顶对局中的特殊机制、奖励和游戏内容，补充普通阵容网站不容易找到的信息。",
    description:
      "Little Buddy Bot 把 TFT 各赛季的机制数据整理成表格，覆盖战利品法球内容、掉落分布、商店与强化符文概率、玩家伤害、经济订阅和特质阶梯等主流阵容站不常收录的数值细节。",
    coreFeatures: [
      "战利品表（Loot orb contents / Loot distribution）：按阶段与法球品质查看奖励池和掉落分布",
      "概率表：Encounter odds、Shop odds、Augment odds 与 Player damage 等数值",
      "强化符文与特质：Augment tables、Augment odds 与 Trait Ladder 阶梯数据",
      "机制专题：Gold / Reroll Subscription、Loaded Dice、Golden Egg 等专题表",
    ],
    useCases: [
      "对局中爆出未知特殊金球或战利品，想核对可能开出的掉落池",
      "想知道某个等级段的商店概率或强化符文出现概率",
      "研究金蛋、骰子、订阅类机制的触发条件与具体数值",
    ],
    tutorial: [
      {
        title: "从首页表格清单选入口",
        detail:
          "打开 littlebuddybot.com，首页按赛季列出 System tables、Encounter odds、Shop odds、Loot orb contents 等专题入口。",
      },
      {
        title: "按查询目标打开对应专题",
        detail:
          "例如查法球内容进 Loot orb contents，查掉落来源进 Loot distribution system，查强化符文进 Augment odds 或 Augment tables。",
      },
      {
        title: "在专题页阅读表格数值",
        detail:
          "核对阶段、概率、数量与奖励池。站内没有统一搜索框，需要从首页目录进入专题后，在对应表格中定位。",
      },
      {
        title: "结合当前对局做判断",
        detail:
          "把概率与当前金币、血量、阶段对照，判断是否值得刷新、投资源或改变运营节奏。",
      },
    ],
    recommendations: [
      "这是机制备查表，不是阵容推荐站：适合局前预习或在两局之间查数值，不提供阵容强度结论。",
      "访问较慢，建议提前打开：国内访问可以连通但加载偏慢，可在开局前先在独立标签页打开。",
    ],
    language: "英文",
    mainlandAccess: "slow",
    accessStatusText: "访问较慢",
    accessNote: "国内网络环境下可以连通，但部分静态资源加载较慢，建议耐心等待。",
    badgeTone: "gold",
    lastVerified: "2026-10-31",
    brandAccent: {
      bg: "bg-purple-500/10",
      text: "text-purple-400",
      border: "border-purple-500/30",
    },
  },
  {
    id: "tft-academy",
    name: "TFT Academy",
    shortName: "TA",
    url: "https://tftacademy.com/tierlist/comps",
    category: "comps-strategy",
    categoryLabel: "阵容选择与攻略",
    tagline: "查看阵容与海克斯评级，结合攻略理解阵容构筑和运营思路。",
    description:
      "由北美顶尖职业选手与高分王者团队（如 Dishsoap、Frodan）倾力打造的高质量攻略站。以严格的阵容梯队评级（Tier List）、清晰的装备优先级与实战运营细节著称。",
    coreFeatures: [
      "高分团队 Tier List：按 S / A / B / C / X 分级，其中 X 表示 Situational（情境适用）",
      "完整阵容页：Tips、Early Units、Item Priority、Positioning Example 与 Alt Builds",
      "强化符文推荐：Augment Priority 分为 ECON / ITEMS / COMBAT 三类",
      "阶段运营建议：Stage 2–4 的分阶段打法、升级与搜牌节奏",
    ],
    useCases: [
      "版本更新或热补丁上线后，迅速了解顶尖高手认可的版本强势构筑",
      "玩特定阵容不知道缺少某件散件时合什么替代装备最稳妥",
      "想要参考顶尖选手的成型站位细节与连胜/连败转换时机",
    ],
    tutorial: [
      {
        title: "浏览 Comps Tier List 梯队",
        detail:
          "进入 /tierlist/comps，先看 S 与 A 级阵容，再到 X 级（Situational）了解只在特定开局才考虑的构筑。",
      },
      {
        title: "打开阵容详情页",
        detail:
          "点击阵容卡片，依次查看 Tips、Early Units、Item Priority、Positioning Example 与 Alt Builds。",
      },
      {
        title: "查看强化符文推荐",
        detail:
          "在 Augment Priority 中按 ECON、ITEMS、COMBAT 三类查看推荐优先级，不要把它理解成固定回合的海克斯选择表。",
      },
      {
        title: "参考阶段运营与站位",
        detail:
          "结合 Stage 2–4 的分段说明，判断何时升级、搜牌与转型，并对照 Positioning Example 摆放前后排。",
      },
    ],
    recommendations: [
      "作为参考而非盲目照搬：高水平 Tier List 建立在扎实的基本功和转线能力之上，不宜在发牌完全不符时硬追 S 级阵容。",
      "关注评级变动与更新说明：王者团队在微调补丁后常有针对性简评，能帮助你捕捉到版本细节调整。",
    ],
    language: "英文",
    mainlandAccess: "unconfirmed",
    accessStatusText: "待确认",
    accessNote: "不同地区与网络接入商体验存在差异，尚未形成确定结论，建议自行在浏览器中打开测试。",
    badgeTone: "muted",
    lastVerified: "2026-10-31",
    brandAccent: {
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/30",
    },
  },
  {
    id: "tft-clarity",
    name: "TFTClarity",
    shortName: "TC",
    url: "https://tftclarity.cn/",
    category: "ai-query",
    categoryLabel: "AI 辅助查询",
    tagline: "通过 AI 辅助查询和理解云顶之弈相关内容，是我个人推荐的中文 TFT 工具。",
    description:
      "针对云顶之弈量身定制的中文 AI 智能问答与决策辅助工具。玩家可以通过自然语言输入对局困惑，快速获取羁绊搭配、装备选择、对局思路建议与机制解析。",
    coreFeatures: [
      "中文自然语言交互：用大白话输入提问，无需记忆复杂的英文术语或英文卡名",
      "具体情境化决策启发：支持输入当前散件、已有英雄和海克斯，让 AI 提供过渡与转线方向",
      "可解释结论：回答附带样本量、平均名次、近期趋势与可追溯的数据详情",
      "中英双语（中文优先）：默认中文界面，也可切换到英文",
    ],
    useCases: [
      "实战中遇到不熟悉的冷门海克斯或冷门机制，需要几十秒内中文搞明白",
      "手头散件比较杂乱，拿不准该合什么通用装备打连胜过渡时",
      "想探究某套阵容在逆风劣势局的变阵方向，需要思路启发",
    ],
    tutorial: [
      {
        title: "进入中文对话界面",
        detail: "访问网站直接开启与 TFTClarity 的中文对话。",
      },
      {
        title: "提出具体且带局势的问题",
        detail: "尽量包含具体细节，例如：“2-1 拿了【XX强化】，掉落了大棒和大剑，有哪些阵容路线？”",
      },
      {
        title: "打开「查询与证据」核对依据",
        detail:
          "回答旁的「查询与证据」会列出统计结果、知识证据与来源，先核对这些依据，再看 AI 给出的结论。",
      },
      {
        title: "与版本和其他数据交叉验证",
        detail:
          "结合页头赛季标记、实际发牌与大数据结果检验 AI 建议，再决定是否采用。",
      },
    ],
    recommendations: [
      "版本说明：TFTClarity 已停止对 Set 17 数据的支持。使用时请以网站当前实际提供的赛季和数据为准。",
      "问题越具体，启发越精准：避免过于宽泛的“怎么上分”，尽量带上回合、现有散件或已有棋子。",
      "切勿将 AI 回答当作绝对真理：AI 工具核心价值在于思路启发与知识速查，切记与实际发牌情况及客观大数据相互印证。",
    ],
    language: "中文",
    mainlandAccess: "accessible",
    accessStatusText: "可访问",
    accessNote: "国内网络环境下测试可稳定访问，中英双语（中文优先），使用体验顺畅。",
    badgeTone: "good",
    lastVerified: "2026-10-31",
    brandAccent: {
      bg: "bg-teal-500/10",
      text: "text-teal-400",
      border: "border-teal-500/30",
    },
  },
  {
    id: "data-tft",
    name: "DataTFT",
    shortName: "DT",
    url: "https://www.datatft.com/explorer",
    category: "data-explorer",
    categoryLabel: "综合数据探索",
    tagline: "国内综合性较强的 TFT 数据网站，适合进行多维度的数据查询与探索。",
    description:
      "功能全面的国内 TFT 大数据查询与探索平台。提供棋子、装备、羁绊、强化符文等多维度的胜率、登场率及组合交叉分析，是玩家检验与交叉验证数据的重要工具。",
    coreFeatures: [
      "数据检索器（Explorer）：用关键字、联想与「或」条件组合查询，并支持排除条件",
      "条件开关：神装、变阵、克制、装备数量、弈子星级、弈子费用等",
      "结果表指标：对局数、出场率、排名、名次差、前四率与登顶率，并可设置最小样本",
      "其他数据板块：阵容榜单、强化/装备评级、版本趋势与概率表",
    ],
    useCases: [
      "复盘某局比赛，想验证某个海克斯或某件装备的真实客观前四率与平均表现",
      "探索冷门英雄或特殊装备搭配的大数据胜率，寻找版本未被广泛发掘的强势点",
      "在两个同费英雄或两件备选合成装备之间，用客观统计数据辅助选择",
    ],
    tutorial: [
      {
        title: "进入数据探索页面（Explorer）",
        detail: "直接访问 /explorer 入口，开启多维度数据检索与交叉分析面板。",
      },
      {
        title: "输入关键字并组合检索条件",
        detail:
          "在检索条件行输入外号、费用、拼音或羁绊等关键字，从联想结果中加入条件，并用「或」组合多个条件。",
      },
      {
        title: "添加排除条件与开关",
        detail:
          "按需添加排除条件，并设置神装、变阵、克制、装备数量、星级、费用等开关，缩小到目标对局。",
      },
      {
        title: "设置最小样本量",
        detail: "在结果上方设置最小数据样本，避免用场次过少的数据下结论。",
      },
      {
        title: "阅读结果表指标",
        detail:
          "查看单位、对局数、出场率、排名、名次差、前四率与登顶率，并结合样本量与版本日期解读。",
      },
    ],
    recommendations: [
      "结合样本量理性分析：低场次数据可能存在幸存者偏差，需关注样本数量，并与主流攻略互相印证。",
      "使用体验注意事项（个人感受）：个人使用中感觉其检索和探索功能全面，但随着加载内容增多，部分页面操作体验会变得不够轻快流畅。此为主观日常使用感受，非客观基准测试结果。",
    ],
    language: "中文",
    mainlandAccess: "accessible",
    accessStatusText: "可访问",
    accessNote: "国内网络环境下测试可正常打开访问，综合数据探索功能全面。",
    badgeTone: "good",
    lastVerified: "2026-10-31",
    brandAccent: {
      bg: "bg-indigo-500/10",
      text: "text-indigo-400",
      border: "border-indigo-500/30",
    },
  },
];

/** Return sites filtered by category. "all" returns all 6 sites. */
export function getFilteredSites(category: "all" | SiteCategory): TftSite[] {
  if (category === "all") {
    return TFT_SITES;
  }
  return TFT_SITES.filter((site) => site.category === category);
}

/** Look up a single site by ID. */
export function getSiteById(id: string): TftSite | undefined {
  return TFT_SITES.find((site) => site.id === id);
}

