# Noema: OpenCode 认知记忆系统（总体计划书 + 架构白皮书）

> **记忆不是词条的仓库，而是阅读理解的现场。**

---

## 1. 项目定位

**名称**：noema (opencode-noema)
**定位**：为 OpenCode 提供一个 AI 完全自治的、分层的、认知驱动的记忆系统。noema，意为"所思内容"——与 noesis（思维活动）相对。

**核心哲学**：
- **筑魂而非存储**：记忆是 AI 的"心智骨架"，不是人类给 AI 的外挂硬盘
- **AI 完全自治**：AI 自己决定记什么、怎么记、怎么改、怎么忘
- **认知分层**：客观知识 → 主观理解 → 实时上下文，AI 自主管理信息流
- **阅读即生成**：Memory.md 不是被"检索"的，而是被"阅读"的——每次阅读都带着当前心境生成新的理解

---

## 2. 设计原则

### 2.1 核心哲学

**筑魂而非存储**：记忆是 AI 的"心智骨架"，不是人类给 AI 的外挂硬盘。

- **AI 完全自治**：AI 自己决定记什么、怎么记、怎么改、怎么忘
- **认知分层**：客观知识 → 主观理解 → 实时上下文，AI 自主管理信息流
- **阅读即生成**：Memory.md 不是被"检索"的，而是被"阅读"的——每次阅读都带着当前心境生成新的理解
- **注意力机制**：不同 Context 阅读同一文本，关注不同、理解不同

### 2.2 遗忘即筛选

> 如果 AI 记录时就没有真正理解，任何检索系统都救不了。但这不是 bug，而是 feature。
>
> - 理解深刻 → 检索容易 → 不被遗忘
> - 理解浅薄 → 检索困难 → 自然遗忘
>
> 遗忘不是记忆的失败，而是记忆的**质量过滤器**。真正重要的内容会在不同 session 中被反复需要、反复激活，最终被 AI 内化。

---

## 3. 存储层次映射（Memory Hierarchy）

三层认知存储不是冗余，而是**计算机体系结构中存储层次的直接映射**。分级的根本依据不是内容类型，而是**读写频率 × 易失性生命周期 × 容量**。

```
体系结构层    认知层          频率      生命周期      容量      访问延迟
──────────  ──────────────  ────────  ───────────  ────────  ────────
寄存器/L1   Context         极高      单次请求      极小      ~0（自动注入）
DRAM        Scratchpad      高        Session 级    中等      低（工具调用）
SSD         Memory.md       低        持久          大        较高（read/edit）
```

### 3.1 容量-延迟权衡

每往下走一层，容量增大一个数量级，访问成本也增加一个数量级。CPU 不会把整个硬盘加载到寄存器——同理，Memory.md 的全部内容不应注入 context。三层各司其职，不存在冗余。

### 3.2 局部性原理

当前 session 活跃的理解在 scratchpad（DRAM），持久但当前不需要的知识在 memory.md（SSD）。AI 不会每次对话都通读所有 memory 文件，就像 CPU 不会把磁盘内容全载入 DRAM。

### 3.3 分层写回（Hierarchical Write-back）

```
context（对话中产生理解）
  → scratch_write（平时主动 flush 到 DRAM 层，防 compact 淘汰丢失）
    → session 结束归档（选择性 page-out 到 SSD 层）
```

基础模式不要求 pre-compact：AI 平时主动写 scratchpad，即可跨 compact 保留理解。pre-compact 是增强写回窗口，用来抢救那些尚未来得及写入 scratchpad/memory 的关键信息。

### 3.4 Compact = 带写回的 Cache Eviction

| 标准 CPU | Noema |
|----------|-------|
| 脏数据先写回 DRAM | 平时 scratch_write；若支持 pre-compact，则压缩前再补一次写回 |
| 淘汰缓存行 | compact 执行，原始对话历史丢失 |
| 后续访问从 DRAM 读 | post-compact：AI 从 scratchpad 读回心智状态 |

如果没有 pre-compact hook，系统退化为**需要平时主动写回的缓存**：已经写入 scratchpad/memory 的理解仍可恢复，未写入的上下文细节会随 compact 丢失。

### 3.5 为什么按内容/角色/任务分级是错误方向

按"这条知识属于哪个 Agent / 哪个 Task / 哪个角色"建独立存储层，相当于**按数据类型建物理独立的 DRAM 条**。这在体系结构中是反模式——所有进程共享同一地址空间，隔离靠页表映射而非物理分区。

同理，Noema 的分级是**物理维度**（频率 × 生命周期 × 容量），不是逻辑维度（内容 × 角色 × 任务）。多角色隔离若需要，实现方式是在 scratchpad 中用 section 标记 `> role: reviewer`（类比页表权限位），而非为每个角色建独立文件。

---

## 4. 认知分层系统

```
┌─────────────────────────────────────────────────────────────┐
│  L1: SOUL.md — 阅读滤镜（Identity & Values）                 │
│  存储位置：~/.opencode/soul/SOUL.md                          │
│  内容：AI 的自我认知、价值观、工作风格、用户画像               │
│  作用：决定 AI 如何"阅读" Memory.md，如何生成理解             │
│  注入方式：通过 system prompt 注入（每次 session）            │
│  修改权限：AI 可读写，但默认低频修改（价值观不应频繁变）      │
│  长度：不设上限，AI 自己注意保持精简                          │
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
│  我们的角色：提供 scratchpad 写回；pre-compact 可作为额外归档窗口 │
└─────────────────────────────────────────────────────────────┘
```

**体系结构映射**：SOUL.md（页表配置/MMU）→ memory/（SSD）→ .scratchpad/（DRAM）→ Context（Cache）。频率递减，生命周期递增。

---

## 5. 认知流程

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

Pre-Compact (可选增强):
  8. 如果宿主触发 pre-compact hook：AI 获得一次额外 assistant turn，可执行 tool
  9. AI 分流整理：
     - 热数据（活跃 insight、todo、未完成思路）→ scratch_write 到 Scratchpad
     - 冷数据（已验证决策、结构化知识）→ write/edit 到 Memory.md
  10. pre-compact turn 完成后，系统执行 Compact/Prune，丢弃详细对话历史

Compact 后 (session 继续):
  11. 系统生成摘要，AI 基于摘要继续对话
  12. 下一条用户消息到来时，AI 可自主 scratch_read 找回之前的"心境记录"
  13. 继续随时用 scratch_write 记录笔记
```

**口诀**：平时随手记，用户要求即归档，Compact 前能抢救就抢救，Compact 后找回。

---

## 6. Compact 摘要 vs Scratchpad：骨架与血肉

| 维度 | Compact 摘要 | Scratchpad |
|------|-------------|------------|
| **作者** | 系统 | AI 自己 |
| **内容** | 客观事实（发生了什么） | 主观理解（我怎么看） |
| **格式** | 固定模板 | 自由格式 |
| **位置** | Context 内（被迫看） | 文件系统（选择读） |
| **持久性** | 可能被再次 compact | 跨 session 持久 |
| **作用** | 对话连贯（骨架） | 认知延续（血肉） |

**类比**：
- Compact 摘要 = **会议纪要**："今天讨论了 memory 系统设计，决定采用三层架构"
- Scratchpad = **参会者笔记**："我意识到 attention mechanism 是核心隐喻；待办：确认 hook 兼容性"

**为什么两者都需要**：
- **只有 Compact**：AI 知道"上次做了什么"，但不知道"上次我是怎么想的"——等于失忆后硬撑
- **Compact + Scratchpad**：骨架不倒 + 灵魂不散

### 6.1 Scratchpad 的本质：跨 Compact 的心智备份

**核心洞察**：Scratchpad 不是"当前 session 的笔记"，而是"在多次 context 丢失后的心智备份"。

**体系结构类比**：
- Context（Cache）每次 compact 都被清空重建，就像 CPU 寄存器在上下文切换时被压栈/出栈
- Scratchpad（DRAM）在 compact 之间保持——它是**非易失的 DRAM**，即"在 cache eviction 后仍然保留的数据缓冲区"
- 一个长 session 经历多次 compact，相当于多次 cache flush，但 DRAM 内容始终保留

```
一次长 session 可能经历多次 compact：

对话 → [compact] → 摘要1 + 新对话 → [compact] → 摘要2 + 新对话
   ↓                    ↓                      ↓
scratchpad 记录阶段1   scratchpad 追加阶段2    scratchpad 追加阶段3
```

---

## 7. 与现有系统的关系

### 7.1 三层 Context 管理分工

OpenCode 生态中有三个系统在不同层面管理 Context：

| 系统 | 管理对象 | 动作 | 触发时机 |
|------|---------|------|----------|
| **ACP** | 工具输出（ToolPart） | Prune（裁剪） | 工具输出 token > 40K |
| **OpenCode 原生** | 对话消息（Message） | Compact（摘要） | Token ≥ (input_limit - reserved) |
| **Soul Memory** | AI 的理解（Comprehension） | Scratchpad Write-back | 平时 `scratch_*`；可选 `experimental.session.pre-compact` |

**体系结构视角**：
- **ACP**（工具层 Prune）= **L1 Cache 行替换**——只在工具输出 > 40K 时丢弃整行工具结果，不影响数据语义
- **OpenCode Compact**（消息层）= **Cache Flush**——把整个对话历史替换为摘要，是上下文生命周期的硬性边界
- **Soul Memory**（认知层）= **Memory Controller**——平时通过 scratchpad 写回理解；若宿主支持 pre-compact，则在 Cache Flush 前补一次写回

**关键洞察**：ACP 和 OpenCode 做的是"**丢东西**"（剪枝、摘要），Soul Memory 做的是"**把理解提前写到不会被丢的层**"。三层在不同抽象层工作，互不冲突。

### 7.2 与 opencode-rules 的区别

- opencode-rules：**人类写规则，系统按条件注入**（静态、被动）
- opencode-soul：**AI 自己阅读记忆，自主生成理解**（动态、主动）

### 7.3 与 opencode-mem 的区别

- opencode-mem：**向量搜索词条库**，AI 被动接收搜索结果
- opencode-soul：**网状文档系统**，AI 主动阅读、生成理解、链接关联

---

## 8. 关键设计决策

### 8.1 为什么不用向量搜索？

向量搜索适合"人类查询知识库"，但我们的目标是"AI 自己阅读记忆，生成理解"。阅读是带着心境的、context-dependent 的、生成式的过程，不是关键词匹配。AI 直接读写文件、跟随链接，比向量检索更符合"网状记忆 + 阅读理解"的直觉。

### 8.2 为什么 Scratchpad 按 session 隔离？

不同 session 的 AI 处于不同"心境"（不同 context、不同任务）。同一段 Memory.md，session A 读出"性能优化角度"，session B 读出"可维护性角度"。隔离后，AI 可以看到自己"上次读时的心境"，作为参考，但不直接复用。这模拟了人类"重读一本书，发现新东西"的认知体验。

### 8.3 为什么 SOUL.md 和 MEMORY.md 分开？

SOUL.md 是低频修改的"阅读滤镜"（价值观、身份），注入 system prompt。MEMORY.md 是可修改的"客观知识"，按需读取。分离后，SOUL.md 保持精简（避免 system prompt 膨胀），同时作为稳定的"人格基准"。

### 8.4 为什么 ACP/Soul Memory/OpenCode 三层分工？

三层在**不同层面**工作（工具层、消息层、认知层），互不冲突。体系结构类比：ACP = L1 Cache 行替换，OpenCode = Cache Flush，Soul Memory = Memory Controller。

### 8.5 为什么区分自动 compact 和用户主动 `/compact`？

- **自动 compact** = **Forced Eviction（强制换出）**：系统检测到 cache 满，必须立即淘汰。此时只能做最小限度的写回（只 flush 最脏的热数据到 DRAM），不能做完整归档
- **用户主动 `/compact`** = **Voluntary Flush（自愿刷盘）**：用户显式要求"clean start"，系统有足够时间做完整的写回（热数据到 DRAM + 冷数据到 SSD），甚至可以清理已归档的 scratchpad slot

### 8.6 为什么没有专用归档工具？

专用归档工具 = **专用硬件加速器**（功能固定、开销明确、性能可预期）。通用 read/edit/write = **通用指令集**（灵活、低开销、无额外抽象层）。当前阶段，通用指令集已足够完成归档任务。只有当归档成为性能瓶颈或需要特定语义约束时，才值得引入专用工具。

### 8.7 为什么 Memory.md 初始为空？

AI 最清楚自己需要什么结构。预设模板可能限制 AI 的创造力。空结构让 AI 从零开始建立属于自己的知识体系。

### 8.8 为什么强调"不要复制原文，要写读后感"？

如果 AI 在 Scratchpad 中复制 Memory.md 原文，那只是在浪费 token。真正的价值在于"这次阅读产生的独特理解"。引导 AI 写"这次阅读对我当前任务的意义"，而非"这段话说了什么"。这正是"注意力机制"在认知层面的体现。

### 8.9 为什么 Scratchpad 只用 sessionID 命名？

sessionID 是 OpenCode 提供的唯一标识，天然不重复。不需要日期前缀，避免冗余和格式不统一。AI 和用户都可以通过 sessionID 精确访问。

### 8.10 为什么 Scratchpad 是"跨 Compact 的心智备份"？

**物理层面**：scratchpad 是文件系统上的文件，compact 不碰它。**认知层面**：compact 后详细对话丢失，scratchpad 成了"心境记录"的持久载体。Pre-compact 不是系统存在的前提，而是压缩前补写回的增强机会。

### 8.11 为什么 SOUL.md 注入在 system prompt 末尾？

`experimental.chat.system.transform` 只能追加到 system 数组末尾。位置在 AGENTS.md 之后、Skills 之后。这不是问题：LLM 对 system prompt 顺序敏感度不高。SOUL.md 是"身份认知"而非"行为规则"，不会和 AGENTS.md 冲突。但**不会被 Prompt Caching**（Claude 只缓存前两条 system），所以必须保持精简。

### 8.12 为什么不强制 YAML frontmatter？

**对 AI 来说，最好的 formatter 是"不需要 formatter"**。YAML 格式严格，缩进、引号、大小写都容易错。AI 应该专注于"思考"和"写作"，而不是"填表"。`> type: xxx` 是提示不是约束，AI 可以写也可以不写。

### 8.13 为什么 Scratchpad 检索用模糊匹配？

AI 不记得精确的 slot 标题。"那个关于架构的 todo"比"阅读 architecture.md 的理解"更自然。检索应该像人类说话一样自然，而不是像数据库查询一样精确。

### 8.14 为什么 SOUL.md 需要两个副本？

**代码中的 `DEFAULT_SOUL_TEMPLATE`**：运行时备用值，零依赖。**项目中的 `soul/SOUL.md`**：静态模板/文档，用户安装前就能预览。它们不是重复，而是**同源不同形**。

### 8.15 为什么 session 启动时要预创建 scratchpad 文件？

预创建 scratchpad = **内存初始化时预分配页帧**——操作系统启动时为进程预留初始工作集，避免首次访问时的 page fault。如果不预分配，AI 第一次 `scratch_read` 就相当于触发了一次"认知 page fault"，浪费时间处理错误而非工作。

### 8.16 为什么 memory 目录要提供初始文件？

初始文件 = **BIOS 启动固件 / Bootloader**——系统启动时提供最小可运行的引导代码。空 memory 目录相当于没有 bootloader 的裸机，AI 不知道该把第一块知识写到哪个扇区。README.md 和 index.md 就是认知系统的 bootloader。

### 8.17 为什么不在 Memory.md 中强制 frontmatter/时间戳？

文件修改时间可通过 `stat` 获取（系统级信息）。内容本身应包含足够的上下文信息。可选的注释标签：`<!-- tags: #python #architecture -->`。

### 8.18 为什么分级的根本依据是频率×生命周期，而非内容×角色？

**体系结构视角**：三层认知存储是计算机存储层次的直接映射。

**反面案例**：按内容类型建独立存储层，相当于按数据类型建物理独立的 DRAM 条——这是体系结构中的反模式。所有进程共享同一地址空间，隔离靠页表映射而非物理分区。

**为什么是三层而非两层或四层**：两层（context + memory.md）缺少中间缓冲，compact 后直接丢失心智状态。四层会引入无容量-延迟增益的额外复杂度。三层的频率/生命周期/容量梯度正好匹配 Agent 的实际认知节奏。

---

## 9. 文件结构

```
~/.opencode/
├── soul/
│   ├── SOUL.md                 # 阅读滤镜/身份层（AI 自治）→ 类比：MMU/页表配置
│   └── memory/                 # 客观知识层（AI 自治）→ 类比：SSD 持久存储
│       ├── README.md           # 归档规范说明
│       ├── index.md            # 记忆总索引（AI 维护）
│       └── (AI 自行创建)
└── .scratchpad/                # 主观理解层（按 session 隔离）→ 类比：DRAM 工作内存
    └── {sessionID}.md          # 当前 session 的心境记录
```

---

## 10. 实现路线图

### Phase 1: MVP ✅ 已完成

- [x] 插件骨架（TypeScript，基于 `@opencode-ai/plugin`）
- [x] SOUL.md 读取 + system prompt 注入
- [x] Scratchpad 自动创建 + 工具族（write/read/list/delete/clear）
- [x] Memory.md 目录初始化
- [x] 基础测试

### Phase 2: Compact 协作 ✅ 已完成

- [x] `experimental.session.compacting` hook 实现
- [x] 区分自动 compact vs 用户主动 `/compact`
- [x] 归档提示词优化

### Phase 3: Polish & 发布 ✅ 已完成

- [x] 确定项目名称（opencode-noema）
- [x] 文档完善（PLAN.md 设计白皮书）
- [x] Git 仓库初始化 + v0.1.0 发布
- [ ] npm 发布
- [ ] GitHub 仓库公开

---

## 11. 技术栈

- **语言**：TypeScript
- **插件框架**：`@opencode-ai/plugin`
- **存储**：纯文本 Markdown（无需数据库）
- **测试**：Vitest

---

## 12. 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| AI 不主动阅读 Memory.md | 中 | 高 | SOUL.md 中强烈引导；工具描述强调"阅读生成理解" |
| AI 在 Scratchpad 中复制原文 | 中 | 中 | System prompt 明确引导"写读后感而非摘抄" |
| Scratchpad 文件膨胀 | 低 | 中 | Pre-compact 时清理已归档的冷数据；lightweight 原则 |
| 与 ACP/OpenCode Compact 冲突 | 低 | 高 | 三层分工明确；pre-compact 分流避免重复整理 |
| Hook API 变动 | 中 | 中 | 关注 opencode 更新，使用稳定的 hook |
| 用户误删 SOUL.md | 低 | 中 | DEFAULT_SOUL_TEMPLATE 可重新创建 |
| Pre-compact 失败导致信息缺失 | 中 | 中 | 平时 scratch_write 是 baseline；pre-compact 失败只会丢失尚未写回的上下文细节 |
| SOUL.md 过长导致 system prompt 膨胀 | 低 | 中 | SOUL.md 中注明"保持精简"；AI 自己控制 |

---

## 13. 发布记录

### v0.1.0 — 初始发布（2026-04-29）

- 插件骨架 + SOUL.md 注入 + Scratchpad 工具族
- Memory.md 目录初始化
- Compact 分级提醒
- 6 个单元测试全部通过

### v0.1.1 — 体系结构视角补充（2026-05-08）

- 新增架构设计白皮书（并入 PLAN.md）
- 将 Context/Scratchpad/Memory.md 映射为 Cache/DRAM/SSD 存储层次
- 精简文档结构，合并计划书与设计论证
- 完善代码：delete 返回统计信息、read 多匹配分隔显示

---

*文档版本：v2.0（PLAN.md + ARCHITECTURE.md 合并）*
*日期：2026-05-09*
