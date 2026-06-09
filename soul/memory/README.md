# Memory 归档规范

## 目录结构

建议按以下方式组织 memory 文件：

```
memory/
├── README.md          # 本文件（归档规范说明）
├── index.md           # 记忆总索引（AI 维护）
├── meta/              # 元信息
│   └── user-preferences.md
├── projects/          # 按项目分类
│   ├── project-a/
│   │   ├── SUMMARY.md     # 项目概况
│   │   ├── decisions.md   # 关键决策记录
│   │   └── architecture.md # 架构设计
│   └── project-b/
└── knowledge/         # 跨项目知识
    ├── patterns.md      # 设计模式
    ├── bugfixes.md      # Bug 根因与修复
    └── tools.md         # 工具使用经验
```

## 命名约定

- 文件名使用 kebab-case（短横线连接）
- 使用 .md 后缀
- 避免中文文件名（防止编码问题）

## 写作规范

1. **客观性**：写"是什么"，不是"我觉得"
2. **可独立理解**：不依赖当前 context，新 session 能读懂
3. **三要素**：背景 + 决策/事实 + 原因（简短）
4. **链接关联**：用 Markdown 链接关联相关文件
5. **避免堆砌**：定期整理，合并重复内容

## 标签系统（可选）

在文件顶部用注释添加标签，便于检索：

```markdown
<!-- tags: #python #architecture #performance -->
```

## 何时更新索引

当新增重要记忆文件时，同步更新 `index.md`。
