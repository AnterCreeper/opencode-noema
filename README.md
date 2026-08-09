

# opencode-noema

AI 自治认知记忆系统 —— OpenCode 插件。

**noema**（希腊语：νοήμα），意为"所思内容"。与 noesis（思维活动）相对，noema 是思维的对象、是沉淀下来的理解。

---

## 核心特性

- **AI 完全自治**：AI 自己决定记什么、怎么记、怎么改、怎么忘
- **认知分层**：客观知识 → 主观理解 → 实时上下文，三层自主管理
- **阅读即生成**：Memory.md 不是被"检索"的，而是被"阅读"的——每次阅读都带着当前心境生成新的理解
- **渐进增强**：基础模式依靠平时 `scratch_write` 持久化理解；若宿主支持 `pre-compact` hook，则在压缩前额外获得一次归档窗口

---

## 安装

> 基础能力不依赖 `experimental.session.pre-compact`。当前 [https://github.com/AnterCreeper/opencode/](https://github.com/AnterCreeper/opencode/) 支持该 hook，因此会启用压缩前归档增强。

```bash
# 克隆仓库
git clone <repo-url>
cd opencode-noema

# 安装依赖
npm install

# 构建
npm run build

# 在 OpenCode 中配置插件路径
# ~/.config/opencode/opencode.json:
# {
#   "plugin": ["/path/to/opencode-noema"]
# }
```

首次启动时，插件会自动创建：
- `~/.opencode/soul/SOUL.md` —— AI 的阅读滤镜
- `~/.opencode/soul/memory/` —— 客观知识层
- `~/.opencode/.scratchpad/` —— 主观理解层

---

## 快速开始

### 1. AI 自动获得记忆能力

安装后，每次 session 开始时：
- SOUL.md 自动注入 system prompt
- Scratchpad 文件预创建，AI 可随时记录

### 2. 使用 scratch_ 工具

AI 在对话中可直接使用以下工具：

| 工具 | 作用 |
|------|------|
| `scratch_write` | 在 scratchpad 中记录理解、想法、待办（支持 `type`: `comprehension`/`todo`/`insight`/`draft`/`note`） |
| `scratch_read` | 读取当前 scratchpad 全部或指定 section |
| `scratch_list` | 列出所有 slots，支持按类型/来源/关键词过滤 |
| `scratch_delete` | 删除指定 section |
| `scratch_clear` | 清空当前 scratchpad |

### 3. 管理 Memory.md

AI 直接使用 `read`/`edit`/`write` 工具访问 `~/.opencode/soul/memory/`，无专用工具限制。

### 4. 两种运行模式

| 模式 | 能力 | 代价 |
|------|------|------|
| Baseline | SOUL 注入、scratch 工具、Memory 文件、compact summary 中提示 scratchpad 路径 | compact 前未主动写入的信息可能丢失 |
| Enhanced | Baseline + `experimental.session.pre-compact` 归档窗口 | 需要宿主支持该 hook |

---

## 认知流程

```
Session 开始:
  1. 读取 SOUL.md → 建立"我是谁"的阅读滤镜
  2. 判断当前任务需要什么背景知识
  3. 阅读相关 Memory.md（带着 SOUL 滤镜）
  4. 在 Scratchpad 中写下"读后感"
  5. 基于理解进行当前任务

任务中:
  6. 随时用 scratch_write 记录 lightweight 笔记（1-3 句话）
  7. 遇到新信息 → 判断是否需要更新 Memory.md

Pre-Compact（可选增强）:
  8. 如果宿主支持 `experimental.session.pre-compact`，压缩前触发一次可使用工具的归档窗口
  9. 用户主动 `/compact` → 尽量完整归档关键理解到 Scratchpad/Memory.md
  10. 自动 compact → 快速抢救 1-2 项最关键理解到 Scratchpad

Compact 后:
  11. 系统生成摘要，AI 基于摘要和已写入 scratchpad 的内容恢复工作

Session 结束:
  12. AI 确认：所有重要理解已归档到 Memory.md
```

---

## 设计哲学

### 记忆不是词条仓库，而是阅读理解的现场

> 每次 AI 阅读 Memory.md，都带着当前的 SOUL（价值观）和 Context（心境）。同一文本在不同心境下产生不同理解。Scratchpad 记录的不是"原文说了什么"，而是"这次阅读对我意味着什么"。

这就是**注意力机制在认知层面的体现**。

### 体系结构视角

三层认知存储映射为计算机存储层次：**Context（Cache）→ Scratchpad（DRAM）→ Memory.md（SSD）**。分级的根本依据是**频率 × 生命周期 × 容量**，不是内容/角色/任务。

详见 [PLAN.md](./PLAN.md)。

### 遗忘即筛选

> 如果 AI 记录时就没有真正理解，任何检索系统都救不了。但这不是 bug，而是 feature。
>
> - 理解深刻 → 检索容易 → 不被遗忘
> - 理解浅薄 → 检索困难 → 自然遗忘
>
> 遗忘不是记忆的失败，而是记忆的**质量过滤器**。

### Compact 摘要 vs Scratchpad

| | Compact 摘要 | Scratchpad |
|---|---|---|
| 作者 | 系统自动生成 | AI 自己 |
| 内容 | "发生了什么" | "我怎么理解" |
| 格式 | 固定模板 | 自由 Markdown |
| 作用 | 对话连贯（骨架） | 认知延续（血肉） |

**只有 Compact**：你知道"上次做了什么"，但不知道"上次我是怎么想的"——等于失忆后硬撑。

**Compact + Scratchpad**：骨架不倒 + 灵魂不散。

---

## 文件结构

```
~/.opencode/
├── soul/
│   ├── SOUL.md              # 阅读滤镜/身份层（AI 自治）→ 类比：MMU/页表配置
│   └── memory/              # 客观知识层（AI 自治）→ 类比：SSD 持久存储
│       ├── README.md        # 归档规范
│       ├── index.md         # 记忆总索引
│       └── (AI 自行创建)
└── .scratchpad/             # 主观理解层（按 session 隔离）→ 类比：DRAM 工作内存
    └── {sessionID}.md       # 当前 session 的心境记录
```

**体系结构映射**：SOUL.md（页表配置）→ memory/（SSD）→ .scratchpad/（DRAM）→ Context（Cache）。频率递减，生命周期递增。

---

## 技术栈

- TypeScript
- `@opencode-ai/plugin`
- 纯文本 Markdown（无数据库）
- Vitest 测试

---

## 相关项目

- [opencode-rules](https://github.com/opencode-ai/opencode-rules) —— 人类写规则，系统按条件注入
- [opencode-mem](https://github.com/opencode-ai/opencode-mem) —— 向量搜索词条库
- [opencode-agent-context-pruning](https://github.com/opencode-ai/opencode-agent-context-pruning) —— 工具输出裁剪

---

*版本：v2.0 | 日期：2026-05-09*
