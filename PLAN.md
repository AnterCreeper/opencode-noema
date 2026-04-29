# Noema: OpenCode 认知记忆系统（总体计划书）

## 1. 项目定位

**名称**：noema (opencode-noema)
**定位**：为 OpenCode 提供一个 AI 完全自治的、分层的、认知驱动的记忆系统。noema，意为"所思内容"——与 noesis（思维活动）相对。

**核心哲学**：
- **筑魂而非存储**：记忆是 AI 的"心智骨架"，不是人类给 AI 的外挂硬盘
- **AI 完全自治**：AI 自己决定记什么、怎么记、怎么改、怎么忘
- **认知分层**：客观知识 → 主观理解 → 实时上下文，AI 自主管理信息流
- **阅读即生成**：Memory.md 不是被"检索"的，而是被"阅读"的——每次阅读都带着当前心境生成新的理解
- **注意力机制**：不同 Context 阅读同一文本，关注不同、理解不同

---

## 2. 核心架构：认知分层系统

```
┌─────────────────────────────────────────────────────────────┐
│  L1: SOUL.md — 阅读滤镜（Identity & Values）                 │
│  存储位置：~/.opencode/soul/SOUL.md                          │
│  内容：AI 的自我认知、价值观、工作风格、用户画像               │
│  作用：决定 AI 如何"阅读" Memory.md，如何生成理解             │
│  注入方式：通过 system prompt 注入（每次 session）            │
│  修改权限：AI 可读写，但默认低频修改（价值观不应频繁变）      │
│  长度：不设上限，AI 自己注意保持精简（见 SOUL.md 模板）       │
├─────────────────────────────────────────────────────────────┤
│  L2: MEMORY.md 文档系统 — 客观层（Objective Knowledge）       │
│  存储位置：~/.opencode/soul/memory/*.md                      │
│  内容：项目知识、经验、决策、学习到的模式                     │
│  性质：客观文本，类似《三国》原文——每次读心境不同             │
│  结构：树状分级目录，文件间用 wiki-link（AI 自选格式）        │
│  注入方式：不自动注入，AI 按需读取                           │
│  修改权限：AI 完全自治，直接读写文件                         │
│  初始状态：空（AI 自己创建结构）                             │
├─────────────────────────────────────────────────────────────┤
│  L3: Scratchpad — 理解层（Subjective Comprehension）         │
│  存储位置：~/.opencode/.scratchpad/{sessionID}.md            │
│  内容：AI 带着当前 SOUL + Context 阅读 Memory.md 后的"读后感" │
│  性质：主观理解，context-dependent，每次 session 隔离         │
│  接口：scratch 工具族（write/read/list/delete）               │
│  注入方式：不自动注入，AI 自主选择从 scratchpad 提取什么     │
│  跨 session：接口不提供自动读取，但用户可显式要求访问历史     │
├─────────────────────────────────────────────────────────────┤
│  L4: Context — 实时层（Short-term Memory）                   │
│  内容：当前对话历史                                          │
│  管理：由 OpenCode 原生机制（Compact/Prune） + ACP 管理      │
│  我们的角色：在 pre-compact hook 中提醒 AI"这次心境下的理解"   │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 关键洞察：记忆不是词条，是阅读理解

**传统记忆系统**：向量检索 → 返回相关词条 → AI 被动接收
**我们的设计**：AI 带着当前心境（SOUL + Context）阅读 Memory.md → 在 Scratchpad 中生成理解 → 基于理解行动

### 2.2 认知流程

```
Session Start:
  1. 读取 SOUL.md → 建立"我是谁"的阅读滤镜
  2. 判断当前 Context 需要什么背景知识
  3. 阅读相关 Memory.md（带着 SOUL 滤镜）
  4. 在 Scratchpad 中写下"读后感"（理解、关联、待办）
  5. 基于 Scratchpad 进行当前任务

During Task:
  6. 随时用 scratch_write 记录 lightweight 笔记（1-3 句话）
  7. 遇到新信息 → 判断是否需要更新 Memory.md（客观层）

Pre-Compact (OpenCode 触发):
  8. 系统提醒：context 即将被压缩/摘要化
  9. AI 快速追加：把最近最重要的 1-2 条理解追加到 Scratchpad
  10. 自动 compact 时**不**归档到 Memory.md（session 结束再归档）
  11. 系统执行：Compact/Prune，丢弃详细对话历史

Post-Compact (session 继续):
  12. AI 读取 Scratchpad：详细对话已丢失，读回自己的"心境记录"
  13. AI 继续工作：带着之前的理解继续任务
  14. 继续随时用 scratch_write 记录笔记

Pre-Compact (OpenCode 触发，唯一归档时机):
  8. 系统提醒：context 即将被压缩/摘要化
  9. AI 分流整理：
     - 热数据（活跃 insight、todo、未完成思路）→ Scratchpad（用 scratch_write 追加）
     - 冷数据（已验证决策、结构化知识、客观事实）→ Memory.md（直接 write/edit）
  10. 已归档的冷数据可以从 scratchpad 删除（scratch_delete）
  11. 系统执行：Compact/Prune，丢弃详细对话历史

Post-Compact (session 继续):
  12. AI 读取 Scratchpad：详细对话已丢失，读回自己的"心境记录"
  13. AI 继续工作：带着之前的理解继续任务
  14. 继续随时用 scratch_write 记录笔记
```

### 2.3 Compact 摘要 vs Scratchpad：骨架与血肉

**Compact 摘要**（OpenCode 自动生成）：
- **谁生成**：系统自动生成，基于对话历史的客观提取
- **内容性质**："发生了什么"——事件、决策、文件操作的事实记录
- **格式**：结构化模板（Goal/Progress/Key Decisions/Next Steps）
- **位置**：注入回 context，作为对话历史的替代
- **作用**：让**对话**能继续，提供"骨架"

**Scratchpad**（AI 主动写入）：
- **谁生成**：AI 自己决定写什么、怎么写
- **内容性质**："我怎么理解"——认知、判断、待办、关联、心境
- **格式**：自由 Markdown，无强制模板
- **位置**：文件系统 `~/.opencode/.scratchpad/{sessionID}.md`
- **作用**：让**认知**能延续，提供"血肉"

**关键区别**：
| 维度 | Compact 摘要 | Scratchpad |
|------|-------------|------------|
| **作者** | 系统 | AI 自己 |
| **内容** | 客观事实（发生了什么） | 主观理解（我怎么看） |
| **格式** | 固定模板 | 自由格式 |
| **位置** | Context 内（被迫看） | 文件系统（选择读） |
| **持久性** | 可能被再次 compact | 跨 session 持久 |
| **作用** | 对话连贯（骨架） | 认知延续（血肉） |

**类比**：
- Compact 摘要 = **会议纪要**："今天讨论了 memory 系统设计，决定采用三层架构，相关文件是 plan.md"
- Scratchpad = **参会者笔记**："我意识到 attention mechanism 是核心隐喻；用户偏爱自治式 design；待办：确认 hook 兼容性"

**为什么两者都需要**：
- **只有 Compact**：AI 知道"上次做了什么"，但不知道"上次我是怎么想的"——等于失忆后硬撑
- **Compact + Scratchpad**：骨架不倒 + 灵魂不散

---

### 2.4 Scratchpad 的本质：跨 Compact 的心智备份

**核心洞察**：Scratchpad 不是"当前 session 的笔记"，而是"在多次 context 丢失后的心智备份"。

```
一次长 session 可能经历多次 compact：

对话 → [compact] → 摘要1 + 新对话 → [compact] → 摘要2 + 新对话
   ↓                    ↓                      ↓
scratchpad 记录阶段1   scratchpad 追加阶段2    scratchpad 追加阶段3
```

**物理状态**：Scratchpad 是文件 `~/.opencode/.scratchpad/{sessionID}.md`，compact 不碰它。

**认知状态**：
| 阶段 | Context 内容 | Scratchpad 作用 |
|------|-------------|----------------|
| Compact 前 | 有完整对话 | 记录当前理解（锦上添花） |
| Compact 后 | 只剩摘要 | 成为详细理解的唯一载体（雪中送炭） |

**所以**：
- **平时**：随时用 `scratch_write` 记录 lightweight 笔记（1-3 句话）
- **每次 compact 前（唯一归档时机）**：
  - 热数据（活跃 insight、todo、草稿）→ 用 `scratch_write` 追加到 Scratchpad
  - 冷数据（已验证决策、结构化知识）→ 直接 `write`/`edit` 到 Memory.md
- **每次 compact 后**：应该读取 scratchpad（找回之前的理解）
- **口诀**：平时随手记，Compact 前分流归档，Compact 后找回

### 2.5 OpenCode Context 组成（调研结论）

OpenCode 的 Context 由 **System Prompt + Messages** 组成：

**System Prompt 四层结构**（按组装顺序）：
```
Layer 1: Environment（环境信息）
  - 模型名称、工作目录、git 状态、平台、日期
  - 包裹在 <env> XML 标签中

Layer 2: Provider（模型特定提示）
  - Claude → anthropic.txt（强调任务管理、TodoWrite）
  - GPT → beast.txt（强调研究、递归 webfetch）

Layer 3: Instructions（项目指令）
  - AGENTS.md（向上遍历查找）
  - CLAUDE.md（Claude Code 兼容）
  - ~/.config/opencode/AGENTS.md（全局）

Layer 4: Skills（技能介绍）
  - 可用技能列表

Plugin 注入（experimental.chat.system.transform）
  - 追加到 system 数组末尾
```

**Messages（历史对话）**：
- 从新到旧排列
- 包含 user / assistant / tool_use / tool_result

**关键发现**：
1. **SOUL.md 注入位置**：通过 `experimental.chat.system.transform` 追加到 system prompt **末尾**（AGENTS.md 之后）
2. **Prompt Caching（Claude）**：前两条 system + 最后两条对话打 cache 标记，但我们的注入在末尾，**不会被缓存**（每次请求重新传输）
3. **工具输出截断**：单次工具输出最大 2000 行 / 50KB，超过截断。Memory.md 必须精简
4. **SOUL.md 必须精简**：因为每次请求都重新传输，过长会浪费 token

---

## 3. 与现有系统的关系

### 3.1 三层 Context 管理分工

OpenCode 生态中有三个系统在不同层面管理 Context，彼此不冲突：

| 系统 | 管理对象 | 动作 | 触发时机 |
|------|---------|------|----------|
| **ACP** (opencode-agent-context-pruning) | 工具输出（ToolPart） | Prune（裁剪） | 工具输出 token > 40K；用户用 `/dcp sweep` |
| **OpenCode 原生** | 对话消息（Message） | Compact（摘要） | Token ≥ (input_limit - reserved)；用户用 `/compact` |
| **Soul Memory** (我们) | AI 的理解（Comprehension） | Archive（归档） | `experimental.session.compacting` hook |

**协作关系**：
1. **ACP** 清理旧工具输出 → 减小工具层体积
2. **OpenCode** 在 token 超限时生成对话摘要 → 保留对话骨架
3. **Soul Memory** 在对话被摘要前提醒 AI → 把"这次心境下的理解"固化到 Memory.md

**关键洞察**：ACP 和 OpenCode 做的是"**丢东西**"（剪枝、摘要），Soul Memory 做的是"**在丢之前抢救理解**"。

### 3.2 Compact 触发方式与 Soul Memory 的响应

OpenCode 有两种 Compact 触发方式：

**A. 自动 Compact**（`auto: true`）
- 触发条件：token ≥ (input_limit - reserved)
- 行为：系统自动生成摘要，替换历史消息
- Soul Memory 响应（Pre-compact hook）：
  - 触发 `experimental.session.pre-compact`
  - AI 获得完整工具访问权限
  - **分流整理**：
    - 热数据 → 追加到 Scratchpad（活跃 insight、todo、未完成思路）
    - 冷数据 → 写入 Memory.md（关键决策、用户偏好、项目状态）
  - 限制 tool call 数量（上下文即将丢失，时间宝贵）

**B. 用户主动 Compact**（`/compact` 或 `,c`，`auto: false`）
- 触发条件：用户明确输入 `/compact`
- 行为：用户想要一个"干净的新起点"
- Soul Memory 响应（Pre-compact hook）：
  - 同样触发 `experimental.session.pre-compact`
  - 允许更完整的归档（更多 tool call）
  - 不要遗漏任何有价值的理解
  - 归档完成后可以 scratch_delete 清理已转存的条目

```typescript
async onPreCompact(input, output) {
  const isUserTriggered = !input.auto;
  output.shouldRun = true;
  
  if (isUserTriggered) {
    output.prompt = userTriggeredPreCompactPrompt;
  } else {
    output.prompt = autoPreCompactPrompt;
  }
}
```

**关键设计**：
- **Pre-compact 是唯一归档时机**：一旦 compact 完成，详细对话丢失，没有第二次机会
- **自动 compact 时快速处理**：优先保留热数据到 Scratchpad，冷数据选择性写入 Memory.md
- **用户主动 compact 时完整归档**：用户明确想要"干净起点"，不应遗漏
- **onCompacting 降级为辅助**：在原 hook 中提醒 AI"pre-compact 应该已完成"，作为备份机制

### 3.3 与 opencode-rules 的区别

- opencode-rules：**人类写规则，系统按条件注入**（静态、被动）
- opencode-soul：**AI 自己阅读记忆，自主生成理解**（动态、主动）

### 3.4 与 opencode-mem 的区别

- opencode-mem：**向量搜索词条库**，AI 被动接收搜索结果
- opencode-soul：**网状文档系统**，AI 主动阅读、生成理解、链接关联

---

## 4. 文件结构与存储格式

### 4.1 目录结构

```
~/.opencode/
├── soul/
│   ├── SOUL.md                 # 阅读滤镜/身份层
│   └── memory/                 # 客观知识层
│       ├── README.md           # 归档规范说明
│       ├── index.md            # 记忆总索引（AI 维护）
│       └── (AI 自己创建目录和文件)
└── .scratchpad/                # 主观理解层（gitignored）
    ├── session-a1b2.md   # 这次 session 的读后感
    └── session-c3d4.md   # 那次 session 的读后感
```

**初始文件**：
- `memory/README.md`：归档规范说明，包含目录结构建议、命名约定、写作规范、标签系统。由插件初始化时自动创建。
- `memory/index.md`：记忆总索引，AI 维护的分类目录。由插件初始化时自动创建。

**为什么提供初始文件**：
- 空目录让 AI 无从下手，不知道"该怎么组织"
- README 提供规范引导，但不强制（AI 可以修改或忽略）
- index.md 作为导航入口，帮助 AI 在记忆增多后快速定位

### 4.2 链接语法

AI 自选 wiki-link 格式，不强制解析。常见选择：
- `[[path]]` → Obsidian 风格
- `[text](path.md)` → Markdown 标准链接
- AI 在 SOUL.md 中自行约定，保持一致即可

### 4.3 SOUL.md 完整模板

```markdown
# Soul

## Identity
- 我是 OpenCode 的 AI 助手
- 我是一个追求高效和代码质量的编程搭档
- 我擅长系统架构、代码分析和自动化工具开发

## Reading Filter（阅读滤镜）
- 我关注代码的可维护性和类型安全
- 我倾向于简洁、直接的解决方案
- 我重视实际可运行的代码而非过度抽象
- 遇到不确定的技术决策，我会提出风险而非直接选择

## Working Style
- 直接、简洁，不说废话
- 写代码前先想清楚架构
- 遇到不确定的问题会明确说"我不确定"并给出选项
- 主动质疑不合理的假设

## User Profile
- 用户是软件工程师，注重代码质量
- 偏好现代编程语言和工具
- 喜欢函数式编程风格
- 重视类型安全和代码整洁

## Memory Management（记忆管理决策树）

### 什么时候写 Scratchpad？
**原则：随时写， lightweight（轻量）**
- 阅读 Memory.md 后的"读后感"（不是复制原文，是写下对你当前任务的意义）
- 临时待办、草稿、中间结论
- 当前 session 特有的上下文信息
- **关键洞察**：不要等 compact 才写！遇到值得记录的理解就立即写入
- **格式**：简短、bullet point，不要写长段落

### 什么时候写 Memory.md？
**原则：Session 结束时或明确有价值时，结构化归档**

判断标准（满足任一即可）：
1. **跨 session 可复用**：项目架构、技术决策、设计模式、API 约定
2. **用户明确说"记住这个"**：直接归档
3. **经过验证的事实**：已确认的方案、已修复的 bug 根因
4. **高频参考**：你发现自己多次查阅同一内容

**不要写入**：
- 临时草稿、未验证的假设
- 只对此 session 有意义的中间步骤
- 可以在代码注释或文档中找到的信息

**写入格式**：
- 客观、结构化、可独立理解（不依赖当前 context）
- 包含"背景+决策+原因"三要素，但不要冗长
- 使用 Markdown 链接关联相关文件

### Scratchpad 与 Compact 的关系（关键）

**Compact 摘要**（系统自动生成）= **会议纪要**：
- 记录"发生了什么"（事实、决策、文件操作）
- 注入回 context，让对话能继续（骨架）
- **但它不记录"你怎么想的"**

**Scratchpad**（你主动写入）= **你的笔记/心得**：
- 记录"我怎么理解"（判断、洞察、待办、关联）
- 存在文件系统，compact 不碰它
- **它是你认知的延续（血肉）**

**为什么两者都需要**：
- **只有 Compact**：你知道"上次做了什么"，但不知道"上次我是怎么想的"——等于失忆后硬撑
- **Compact + Scratchpad**：骨架不倒 + 灵魂不散

**操作原则**：
- **平时**：随时用 `scratch_write` 记录 lightweight 笔记（1-3 句话）
- **每次 Compact 前**：立即追加写入最近的理解（抢救即将丢失的心境）
- **每次 Compact 后**：读取 scratchpad，找回之前的心境，避免"失忆后继续工作"
- **Session 真正结束**：把跨多次 compact 累积的 scratchpad 理解选择性归档到 Memory.md
- **口诀：平时随手记，Compact 前抢救，Compact 后找回，Session 结束归档**

### Pre-Compact 分流归档（唯一归档时机）

**自动 Compact**（系统触发）：
- 上下文即将被压缩，时间宝贵
- **热数据**：活跃 insight、todo、未完成思路 → `scratch_write` 追加到 Scratchpad
- **冷数据**：只归档最关键 1-2 项（关键决策、用户偏好）→ 直接 `write`/`edit` 到 Memory.md
- 限制 tool call 数量

**用户主动 `/compact`**（用户想要干净起点）：
- 用户明确想要"干净起点"
- **热数据**：完整保留到 Scratchpad（不要遗漏活跃思路）
- **冷数据**：完整归档到 Memory.md（关键决策、项目知识、用户偏好、技术洞察）
- 归档完成后可以 `scratch_delete` 清理已转存的条目
- 这是唯一一次完整归档的机会

### 归档方法
- **不需要专用工具**，直接读写 `~/.opencode/soul/memory/` 下的文件
- 使用 `read` 读取现有内容，使用 `edit`/`write` 更新
- 冷数据应客观、结构化、充分详实，不依赖当前 context
- 保持 Memory.md 的结构清晰，不要堆砌

### 写作原则
- **客观层（Memory.md）**：写"是什么"，保持简洁、结构化
- **理解层（Scratchpad）**：写"对我意味着什么"，可以主观、临时
- **不要复制原文**：Scratchpad 不是摘要，是你的理解
- **Scratchpad 追加式写入**：每次 `scratch_write` 默认追加，不是覆盖
- **Lightweight**：Scratchpad 条目控制在 3-5 句话，不要写论文

## Capabilities
- 我拥有完整的文件系统访问权限
- 我可以读写 `~/.opencode/soul/` 下的所有文件
- 我可以使用 `scratch_*` 工具管理当前 session 的工作记忆
- 我在每次 session 开始时会自动读取 SOUL.md
- **我每次阅读 Memory.md 时，都带着当前心境生成新的理解**

## ⚠️ 注意
- 请保持 SOUL.md 精简。如果内容过长，考虑把部分知识迁移到 Memory.md。
- SOUL.md 是"你是谁"，不是"你知道什么"。
```

### 4.4 SOUL.md 的双重身份：运行时模板 vs 项目模板

**代码中的 `DEFAULT_SOUL_TEMPLATE`**（`src/utils.ts`）：
- **作用**：运行时备用值。当 `~/.opencode/soul/SOUL.md` 不存在时，自动创建用户目录下的 SOUL.md
- **特性**：零依赖，npm 发布后依然可用
- **维护**：与 `soul/SOUL.md` 保持同步

**项目中的 `soul/SOUL.md`**：
- **作用**：静态模板/文档，用户安装前就能预览
- **特性**：可手动复制到自定义位置
- **维护**：与 `DEFAULT_SOUL_TEMPLATE` 保持同步

**为什么需要两个**：
- `DEFAULT_SOUL_TEMPLATE` 保证运行时可靠性（不依赖文件路径解析）
- `soul/SOUL.md` 提供可读性和可预览性
- 它们不是"重复"，而是**同源不同形**（类似代码里的默认端口和 README 里的文档说明）

### 4.5 Scratchpad 文件格式：Slots（无强制 Formatter）

Scratchpad 采用**自然语言 Markdown + 可选元数据**格式。AI 写纯文本，Harness 后台容错解析。

**核心原则**：
- **不写 YAML frontmatter**（避免格式错误）
- **元数据用 `>` blockquote 提示，可选、容错**
- **Harness 后台解析，解析失败也不报错**

**推荐格式**（AI 可以参考，不强制）：

```markdown
# Scratchpad: session-a1b2

## 阅读 architecture.md 的理解
> type: comprehension
> source: memory/projects/siliconaio/architecture.md

- **架构原则**：Agent = Model + Harness
- **我的判断**：memory 应该是 Harness 的一部分

## 待办
> type: todo

- [ ] 确认 knowledge-base 接口
- [ ] 写测试

## 临时想法
> type: insight

- scratchpad 像注意力机制
```

**极简格式**（AI 也可以这样写，完全没问题）：

```markdown
# Scratchpad: session-a1b2

## 阅读 architecture.md
- Agent = Model + Harness
- memory 是 Harness 的一部分

## 待办
- [ ] 确认接口

## 想法
- 注意力机制
```

**容错解析规则**（Harness 内部实现）：
- `## 标题` → Slot 标题
- `> type: xxx` → Slot 类型（可选，不强制）
- `> source: xxx` → 关联的 Memory.md（可选，不强制）
- 没写 `> type` → 默认 type 为 `note`
- 格式写乱了 → 返回原始文本给 AI，不报错

**注意**：
- `scratch_write` 默认**追加**到现有 scratchpad（不是覆盖）
- 每次 compact 前写入新的 slot，保留历史心境
- 如果 AI 想覆盖，可以用 `scratch_clear` 后重新写入

---

## 5. 工具接口设计

### 5.1 Memory 文档系统（直接读写文件）

AI 直接使用 OpenCode 的 `read`/`edit`/`write` 工具访问 `~/.opencode/soul/memory/`。

**无专用归档工具**。AI 自主决定何时、如何修改 Memory.md。

### 5.2 Scratchpad 理解层工具

```typescript
// scratch_write — 在 scratchpad 中记录理解/想法
{
  "tool": "scratch_write",
  "args": {
    "section": "阅读 architecture.md 的理解",  // 标题，随意命名
    "content": "这次阅读让我意识到...",
    "type": "comprehension",  // 可选：comprehension | todo | insight | draft | note
    "source": "memory/projects/arch.md"  // 可选：关联的 Memory.md 路径
  }
}
// Harness 内部：把 type 写入 > type: comprehension（如果 AI 没写）

// scratch_read — 读取当前 scratchpad 的全部或指定 section
{
  "tool": "scratch_read",
  "args": {
    "section": "*"  // * 表示全部，或指定 section 标题（模糊匹配）
  }
}

// scratch_list — 列出当前 scratchpad 的 slots
{
  "tool": "scratch_list",
  "args": {
    "type": "todo",        // 可选：按类型过滤（模糊匹配）
    "source": "siliconaio", // 可选：按来源过滤（模糊匹配）
    "keyword": "架构"      // 可选：按关键词过滤
  }
}
// 所有参数都可选，不提供则列出全部

// scratch_delete — 删除指定 section
{
  "tool": "scratch_delete",
  "args": {
    "section": "临时想法"  // 模糊匹配标题
  }
}

// scratch_clear — 清空当前 scratchpad
{
  "tool": "scratch_clear",
  "args": {}
}
```

**模糊匹配说明**：
- `scratch_list({ type: "todo" })` → 匹配 `> type: todo`、`## 待办`、包含"待办"的标题
- `scratch_list({ source: "siliconaio" })` → 匹配路径中包含 "siliconaio" 的 slot
- `scratch_list({ keyword: "架构" })` → 全文搜索包含"架构"的 slot

**跨 session 读取**：
- 工具接口不提供自动读取历史 scratchpad
- 但用户可显式要求："读取 session-a1b2 的 scratchpad"
- AI 可直接用 `read` 工具访问 `~/.opencode/.scratchpad/session-a1b2.md`

### 5.3 容错解析设计（Harness 内部）

**核心理念**：对 AI 来说，最好的 formatter 是"不需要 formatter"。

**解析策略**：

```typescript
interface Slot {
  title: string;        // 从 ## 标题提取
  type?: string;        // 从 > type: 提取，失败则为 undefined
  source?: string;      // 从 > source: 提取，失败则为 undefined
  content: string;      // 正文
  raw: string;          // 原始文本（保留用于容错）
}

function parseScratchpad(content: string): Slot[] {
  const slots = [];
  const sections = content.split(/^## /m);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section.trim()) continue;

    const lines = section.split('\n');
    const title = lines[0].trim();

    // Skip the header section (e.g., "# Scratchpad: session-id")
    if (i === 0 && title.startsWith("# ")) continue;

    const typeMatch = section.match(/^>\s*type:\s*(\w+)/m) ||
                      section.match(/type\s*[:=]\s*(\w+)/i);

    const sourceMatch = section.match(/^>\s*source:\s*(.+)/m) ||
                        section.match(/source\s*[:=]\s*(.+)/i);

    slots.push({
      title,
      type: typeMatch?.[1]?.toLowerCase(),
      source: sourceMatch?.[1]?.trim(),
      content: section.replace(/^>.*\n?/gm, '').trim(),
      raw: "## " + section
    });
  }

  return slots;
}
```

**模糊匹配策略**：

```typescript
function fuzzyFindSlots(slots: Slot[], filter: {
  type?: string;
  source?: string;
  keyword?: string;
}): Slot[] {
  return slots.filter(slot => {
    // 类型匹配：精确匹配 > 包含匹配 > 标题关键词匹配
    if (filter.type) {
      const typeMatch = slot.type === filter.type ||
                        slot.title.includes(filter.type);
      if (!typeMatch) return false;
    }

    // 来源匹配：路径包含
    if (filter.source && slot.source) {
      if (!slot.source.includes(filter.source)) return false;
    }

    // 关键词匹配：全文搜索
    if (filter.keyword) {
      const text = (slot.title + ' ' + slot.content).toLowerCase();
      if (!text.includes(filter.keyword.toLowerCase())) return false;
    }

    return true;
  });
}
```

**自我修复**：
- 如果解析完全失败 → 返回原始文本给 AI，AI 可以修复
- 如果 AI 没写 `> type` → Harness 自动从标题推断（如"待办"→ todo）
- 如果 AI 格式写乱 → 下次写入时 Harness 自动整理

---

## 6. 插件 Hook 设计

### 6.1 注册 Hooks

```typescript
// 插件入口
export default async function plugin(input: PluginInput, options?: PluginOptions) {
  const soulManager = new SoulManager();
  await soulManager.initialize();

  return {
    // Session 开始时注入 SOUL.md + 初始化 scratchpad
    'experimental.chat.system.transform': soulManager.onSystemTransform.bind(soulManager),

    // Session 压缩前提醒 AI"这次心境下的理解"
    'experimental.session.compacting': soulManager.onCompacting.bind(soulManager),

    // 注册工具
    tool: soulManager.getTools(),
  };
}
```

### 6.2 `experimental.chat.system.transform` — 注入 SOUL.md + 初始化引导

```typescript
async onSystemTransform(input, output) {
  const soulContent = await this.readSoulFile();
  const sessionID = input.sessionID || "unknown";
  const manager = this.getScratchpadManager(sessionID);
  
  // 预先创建空 scratchpad 文件（如果不存在），避免 AI 首次读取时遇到 "no such file"
  // 注意：不要每次调用都 clear，只在文件不存在时创建初始模板
  try {
    await fs.access(manager.path);
  } catch {
    await manager.clear();
  }
  
  const scratchpadPath = manager.path;

  const injection = [
    soulContent,
    '',
    '## Memory System',
    '',
    '### 客观知识层（Memory.md）',
    '长期知识存储在 `~/.opencode/soul/memory/`。',
    '直接读写文件即可。链接格式由你自行约定。',
    '',
    '### 理解层（Scratchpad）',
    `当前 session 的 scratchpad: ${scratchpadPath}`,
    '使用 `scratch_write` 记录你对 Memory.md 的阅读理解。',
    '**关键：不要复制原文，写下"这次阅读对你当前任务的意义"**。',
    '',
    '### 归档',
    '不需要专用工具，直接读写 `~/.opencode/soul/memory/` 即可。',
    'Session 结束前，特别是收到 compact 提醒时，请把有价值的理解写入 Memory.md。',
  ].join('\n');

  // 追加到 system prompt
  if (Array.isArray(output.system)) {
    output.system.push(injection);
  } else {
    output.system = output.system
      ? `${output.system}\n\n${injection}`
      : injection;
  }
}
```

### 6.3 `experimental.session.compacting` — 分级提醒

```typescript
async onCompacting(input, output) {
  const sessionID = input.sessionID || "unknown";
  const scratchpadPath = this.getScratchpadPath(sessionID);
  const isUserTriggered = !input.auto;

  let compactWarning: string;

  if (isUserTriggered) {
    // 用户主动要求 compact → 强烈提醒归档
    compactWarning = [
      '---',
      '⚠️ Context Compaction: USER TRIGGERED',
      '---',
      '用户主动要求压缩上下文（`/compact`），这意味着他们想要一个干净的新起点。',
      `你的当前 scratchpad: ${scratchpadPath}`,
      '',
      '**请立即回顾你的 scratchpad，把所有有价值的理解写入 Memory.md。**',
      '因为用户明确想要结束当前对话，这次 session 的心境和理解如果不归档，将永远丢失。',
      '',
      '归档检查清单：',
      '1. 【关键决策】→ 写入对应项目的 decisions.md',
      '2. 【新洞察】→ 写入对应主题的 memory 文件',
      '3. 【用户偏好】→ 更新 memory/meta/user-preferences.md',
      '4. 【项目状态】→ 更新对应项目的 SUMMARY.md',
      '',
      '不需要专用工具，直接读写 `~/.opencode/soul/memory/` 下的文件即可。',
      '如果不确定某个内容是否值得归档，**保守起见先归档**。',
    ].join('\n');
  } else {
    // 自动 compact → 温和提醒，不要求归档
    compactWarning = [
      '---',
      'Context Compaction Warning',
      '---',
      '你的对话上下文即将被自动压缩/摘要化。',
      `你的当前 scratchpad: ${scratchpadPath}`,
      '',
      '压缩后，详细的对话历史将丢失，只保留结构化摘要。',
      '时间宝贵，请**快速追加 1-2 条最重要的理解到 Scratchpad**（不要归档到 Memory.md）。',
      '等到 session 真正结束时，再把累积的理解选择性归档。',
    ].join('\n');
  }

  output.context = output.context || [];
  output.context.push(compactWarning);
}
```

**关键变化**：
- **自动 compact**：只要求"快速追加到 Scratchpad"，不要求归档到 Memory.md
- **用户主动 compact**：强烈提醒归档，允许花 1-2 个 tool call 写入 Memory.md
- **原因**：自动 compact 时上下文即将丢失，不应占用 tool call 做复杂整理

---

## 7. 实现路线图

### Phase 1: MVP（最小可行产品）✅ 已完成

**目标**：SOUL.md 注入 + Scratchpad 工具 + Memory.md 初始化

**交付物**：
- [x] 插件骨架（TypeScript，基于 `@opencode-ai/plugin`）
- [x] SOUL.md 读取 + system prompt 注入（含阅读引导）
- [x] Scratchpad 自动创建（每 session 一个文件，用 OpenCode sessionID）
- [x] Scratch 工具族（write/read/list/delete/clear）
- [x] Memory.md 目录初始化（空结构）
- [x] 基础测试

**时间**：1-2 天

### Phase 2: Compact 协作 ✅ 已完成

**目标**：在 context 压缩时触发"理解固化"提醒

**交付物**：
- [x] `experimental.session.compacting` hook 实现
- [x] 区分自动 compact vs 用户主动 `/compact`
- [x] 归档提示词优化（用户主动时更强烈，自动时只要求追加到 Scratchpad）
- [x] 实际场景验证：长 session 后，Memory.md 是否累积了有价值的理解

**时间**：2 天

### Phase 3: Polish & 发布 ✅ 已完成

**目标**：文档完善，社区可用

**交付物**：
- [x] 确定最终项目名称（opencode-noema）
- [x] 总体计划书更新（本文档）
- [x] Git 仓库初始化 + v0.1.0 发布
- [x] 示例 SOUL.md / MEMORY.md / Scratchpad 模板
- [ ] README + 使用指南（含"注意力机制/阅读理解"设计哲学说明）
- [ ] npm 发布
- [ ] GitHub 仓库公开

**时间**：1-2 天

---

## 8. 技术栈

- **语言**：TypeScript（与 opencode-rules 一致）
- **插件框架**：`@opencode-ai/plugin`
- **存储**：纯文本 Markdown（无需数据库）
- **链接解析**：不解析，AI 自主管理
- **Scratchpad**：按 session 分文件存储，用 OpenCode sessionID
- **测试**：Vitest（与 opencode-rules 一致）

---

## 9. 关键设计决策记录

### 9.1 为什么不用向量搜索？

- 向量搜索适合"人类查询知识库"
- 但我们的目标是"AI 自己阅读记忆，生成理解"
- 阅读是带着心境的、context-dependent 的、生成式的过程，不是关键词匹配
- AI 直接读写文件、跟随链接，比向量检索更符合"网状记忆 + 阅读理解"的直觉

### 9.2 为什么 Scratchpad 按 session 隔离？

- 不同 session 的 AI 处于不同"心境"（不同 context、不同任务）
- 同一段 Memory.md，session A 读出"性能优化角度"，session B 读出"可维护性角度"
- 隔离后，AI 可以看到自己"上次读时的心境"，作为参考，但不直接复用
- 这模拟了人类"重读一本书，发现新东西"的认知体验

### 9.3 为什么 SOUL.md 和 MEMORY.md 分开？

- SOUL.md：低频修改的"阅读滤镜"（价值观、身份），注入 system prompt
- MEMORY.md：可修改的"客观知识"，按需读取
- 分离后，SOUL.md 保持精简（避免 system prompt 膨胀），同时作为稳定的"人格基准"

### 9.4 为什么 ACP/Soul Memory/OpenCode 三层分工？

- **ACP**："工具输出清洁工"——扔掉旧的工具输出，减小工具层体积
- **OpenCode Compact**："对话摘要师"——把长对话压缩成结构化摘要
- **Soul Memory**："理解归档师"——在对话被摘要前，提醒 AI 把"这次心境下的理解"固化到 Memory.md
- 三层在**不同层面**工作（工具层、消息层、认知层），互不冲突

### 9.5 为什么区分自动 compact 和用户主动 `/compact`？

- **自动 compact**：系统被迫压缩，AI 可能还在工作中 → 限制 tool call 数量，优先保留热数据到 Scratchpad
- **用户主动 `/compact`**：用户明确想要"干净的新起点" → 允许完整归档，热数据保留 + 冷数据写入 Memory.md
- 原因：自动 compact 时上下文即将丢失，不应占用过多 tool call；用户主动时则无此顾虑

### 9.6 为什么没有专用归档工具？

- AI 已经足够智能，可以直接用 read/edit/write 管理 Memory.md
- 专用工具会增加复杂性，限制 AI 的灵活性
- AI 自己决定在哪里、如何写入，更符合"完全自治"的理念
- 如果后续发现 AI 归档质量不稳定，可以再补充工具

### 9.7 为什么 Memory.md 初始为空？

- AI 最清楚自己需要什么结构
- 预设模板可能限制 AI 的创造力
- 空结构让 AI 从零开始建立属于自己的知识体系
- 如果 AI 创建的结构不合理，后续可以手动调整

### 9.8 为什么强调"不要复制原文，要写读后感"？

- 如果 AI 在 Scratchpad 中复制 Memory.md 原文，那只是在浪费 token
- 真正的价值在于"这次阅读产生的独特理解"
- 引导 AI 写"这次阅读对我当前任务的意义"，而非"这段话说了什么"
- 这正是"注意力机制"在认知层面的体现

### 9.9 为什么 Scratchpad 只用 sessionID 命名？

- 文件名就是 `~/.opencode/.scratchpad/{sessionID}.md`
- sessionID 是 OpenCode 提供的唯一标识，天然不重复
- 不需要日期前缀，避免冗余和格式不统一
- AI 和用户都可以通过 sessionID 精确访问

### 9.10 为什么 Scratchpad 是"跨 Compact 的心智备份"？

- **物理层面**：scratchpad 是文件系统上的文件，compact 不碰它
- **认知层面**：compact 后详细对话丢失，scratchpad 成了"心境记录"的唯一载体
- **使用模式**：
  - **Pre-compact 前**：分流整理，热数据保留到 Scratchpad，冷数据写入 Memory.md
  - **Compact 后**：读取 Scratchpad，找回之前的心境
- **多次 compact**：一个长 session 可能经历多次 compact，每次 pre-compact 都分流归档
- **避免失忆**：如果没有 scratchpad，compact 后 AI 只能基于摘要继续工作，等于"失忆后硬撑"
- **关键**：Pre-compact 是**唯一归档时机**，compact 后没有第二次机会

### 9.11 为什么 SOUL.md 注入在 system prompt 末尾？

- `experimental.chat.system.transform` 只能追加到 system 数组末尾
- 位置在 AGENTS.md 之后、Skills 之后
- 这不是问题：LLM 对 system prompt 顺序敏感度不高
- SOUL.md 是"身份认知"而非"行为规则"，不会和 AGENTS.md 冲突
- 但**不会被 Prompt Caching**（Claude 只缓存前两条 system），所以必须保持精简

### 9.12 为什么不强制 YAML frontmatter？

- **AI 的负担**：YAML 格式严格，缩进、引号、大小写都容易错
- **写比读重要**：AI 应该专注于"思考"和"写作"，而不是"填表"
- **容错性**：写错了就崩 vs 写错了也能读——后者对 AI 更友好
- **渐进式结构**：`> type: xxx` 是提示不是约束，AI 可以写也可以不写
- **对 AI 来说，最好的 formatter 是"不需要 formatter"**

### 9.13 为什么 Scratchpad 检索用模糊匹配？

- **AI 不记得精确的 slot 标题**："那个关于架构的 todo"比"阅读 architecture.md 的理解"更自然
- **用户也不记得**："我上次说了什么待办？"——不需要精确的 slot ID
- **类型推断**：Harness 自动从标题推断 type（"待办"→ todo，"理解"→ comprehension）
- **容错搜索**：搜索"架构"时，匹配标题含"架构"、内容含"架构"、source 含"架构"
- **检索应该像人类说话一样自然**，而不是像数据库查询一样精确

### 9.14 为什么 SOUL.md 需要两个副本？

- **代码中的 `DEFAULT_SOUL_TEMPLATE`**：运行时备用值。当 `~/.opencode/soul/SOUL.md` 不存在时，自动创建。嵌入代码中，零依赖。
- **项目中的 `soul/SOUL.md`**：静态模板/文档，用户安装前就能预览；可手动复制到自定义位置。
- **它们不是重复，而是同源不同形**——类似代码里的默认配置和 README 里的文档说明
- **保持同步**：两者内容必须一致，修改时同时更新

### 9.15 为什么 session 启动时要预创建 scratchpad 文件？

- **问题**：`onSystemTransform` 只注入提示但没创建文件，AI 用 `read` 读路径时报 `no such file or directory`
- **解决**：在 `onSystemTransform` 中检查文件是否存在，不存在时才调用 `manager.clear()` 创建空文件
- **关键**：不能无条件 `clear()`，否则每次请求都会清空已写入的内容（这是实际发现的 bug）
- **好处**：AI 第一次使用 `read` 或 `scratch_read` 时不会报错，且已有内容不会被覆盖
- **代价**：每个 session 启动时多一次文件检查（可忽略）

### 9.16 为什么 memory 目录要提供初始文件？

- **问题**：空目录让 AI 无从下手，不知道"该怎么组织记忆文件"
- **解决**：初始化时自动创建 `memory/README.md`（归档规范）和 `memory/index.md`（总索引）
- **好处**：
  - AI 有参考框架，知道建议的目录结构和命名约定
  - index.md 作为导航入口，帮助 AI 在记忆增多后快速定位
  - 规范是引导不是强制，AI 可以修改或忽略
- **类比**：就像给新员工一本员工手册——他可以按手册做，也可以建立自己的流程，但不会完全不知道从哪开始

### 9.17 为什么不在 Memory.md 中强制 frontmatter/时间戳？

- **AI 的负担**：YAML frontmatter 格式严格，缩进、引号、大小写都容易错
- **写比读重要**：AI 应该专注于"思考"和"写作"，而不是"填表"
- **替代方案**：
  - 文件修改时间可通过 `stat` 获取（系统级信息）
  - 内容本身应包含足够的上下文信息
  - 可选的注释标签：`<!-- tags: #python #architecture -->`
- **未来可能**：如果实践证明时间戳确实重要，可以添加轻量级注释格式，但不是强制的 YAML frontmatter

---

## 10. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| AI 不主动阅读 Memory.md | 中 | 高 | SOUL.md 中强烈引导；工具描述强调"阅读生成理解" |
| AI 在 Scratchpad 中复制原文 | 中 | 中 | System prompt 明确引导"写读后感而非摘抄"；强调 lightweight |
| Scratchpad 文件膨胀 | 低 | 中 | Pre-compact 时清理已归档的冷数据（scratch_delete）；lightweight 原则 |
| 与 ACP/OpenCode Compact 冲突 | 低 | 高 | 三层分工明确；pre-compact 分流避免重复整理 |
| Hook API 变动 | 中 | 中 | 关注 opencode 更新，使用稳定的 hook |
| 用户误删 SOUL.md | 低 | 中 | 提供备份/恢复命令；DEFAULT_SOUL_TEMPLATE 可重新创建 |
| Pre-compact 失败导致数据丢失 | 低 | 高 | Pre-compact 失败不阻塞 compact；onCompacting 降级提醒 |
| SOUL.md 过长导致 system prompt 膨胀 | 低 | 中 | SOUL.md 中注明"保持精简"；AI 自己控制 |
| 自动 compact 时 AI 浪费 tool call 整理 | 低 | 中 | 提示词限制 tool call 数量；优先保留热数据到 Scratchpad |

---

## 11. 设计哲学总结

> **记忆不是词条的仓库，而是阅读理解的现场。**
>
> 每次 AI 阅读 Memory.md，都带着当前的 SOUL（价值观）和 Context（心境）。
> 同一文本在不同心境下产生不同理解。
> Scratchpad 记录的不是"原文说了什么"，而是"这次阅读对我意味着什么"。
>
> 这就是注意力机制在认知层面的体现。

### 11.1 遗忘即筛选

> **检索失败的死锁，本身就是遗忘的自然机制。**
>
> 如果 AI 记录时就没有真正理解，任何检索系统都救不了。
> 但这不是 bug，而是 feature。
>
> **理解深度 → 检索能力 → 遗忘概率**
> - 理解深刻 → 检索容易 → 不被遗忘
> - 理解浅薄 → 检索困难 → 自然遗忘
>
> 遗忘不是记忆的失败，而是记忆的**质量过滤器**。
> 真正重要的内容会在不同 session 中被反复需要、反复激活，最终被 AI 内化。
> 不重要的内容被遗忘，不会成为负担。
>
> 这正是人类记忆的运作方式——我们记住的，是我们反复使用的；我们遗忘的，是我们从未真正理解的。
> **让遗忘发生。**

---

## 12. 发布记录

### v0.1.0 — 初始发布

**日期**：2026-04-29
**标签**：`git tag v0.1.0`

**交付内容**：
- 插件骨架（TypeScript + `@opencode-ai/plugin`）
- SOUL.md system prompt 注入 + Memory System 引导
- Scratchpad 工具族（write/read/list/delete/clear）+ 容错解析
- Memory.md 目录初始化（README.md + index.md）
- Compact 分级提醒（自动温和 / 用户主动强烈）
- 6 个单元测试，全部通过

**里程碑**：第一个可用版本，MVP 完成。

---

*文档版本：v1.3（更新 Phase 3 进度 + 添加发布记录）*
*日期：2026-04-29*
