# Markdown Translate

一个优雅的 Markdown 文档翻译工具，支持 CLI 命令行和 Web 界面两种方式。

> 🌐 **在线体验**: [https://musherm.github.io/MarkdownTranslation/](https://musherm.github.io/MarkdownTranslation/)

---

## ✨ 项目特性

- **🧠 AST 智能翻译**: 基于 Markdown 抽象语法树(AST)翻译，完美保留文档结构
- **📚 术语表(Glossary)**: 支持自定义术语映射，确保专业词汇翻译一致性
- **🔄 智能重试机制**: 术语检查失败时自动重试，确保翻译质量
- **⚡ OpenAI 兼容**: 支持任何 OpenAI-compatible API（可自定义 base_url）
- **💻 双模式支持**: CLI 命令行工具 + Web 可视化界面
- **📦 批量翻译**: 支持整个目录的 Markdown 文件批量翻译
- **🎯 动态注入**: 只注入文档中出现的术语，减少 Token 消耗

---

## 🚀 两种使用方式

### 方式一：Web 界面（推荐）

无需安装，直接在浏览器中使用：

👉 **[https://musherm.github.io/MarkdownTranslation/](https://musherm.github.io/MarkdownTranslation/)**

**Web 版特性：**
- 可视化配置管理（API 地址、Key、模型）
- 拖拽上传 Markdown 文件
- 实时翻译进度显示
- 术语表可视化编辑
- 左右分栏预览原文/译文
- 批量翻译队列

<!-- 截图占位符 - 后续可以添加 -->
<!-- ![Web UI 翻译界面](screenshots/web-translate.png) -->

### 方式二：CLI 命令行

适合批量处理、自动化脚本等场景。

**快速开始：**
```bash
# 安装依赖
npm install

# 翻译单个文件
node src/cli.js input.md -c config.jsonc

# 批量翻译整个目录
node src/cli.js ./docs -c config.jsonc
```

输出默认为 `input.zh.md`，使用 `-o -` 可输出到 stdout。

---

## 📖 CLI 配置说明

创建 `config.jsonc`（或 `config.json`）：

```json
{
  "base_url": "https://api.openai.com/v1",
  "api_key": "YOUR_API_KEY",
  "model": "gpt-4o-mini",
  "retry_times": 3,
  "prompt_path": "prompts/translate.md",
  "judge_prompt_path": "prompts/glossary-judge.md",
  "glossary_path": "glossary.example.jsonc",
  "temperature": 0.2,
  "max_tokens": 2048,
  "timeout_ms": 120000,
  "max_batch_chars": 4000,
  "max_batch_segments": 100,
  "log_path": "log.txt"
}
```

**术语表配置：**
```json
{
  "glossary": {
    "API": "API",
    "AST": "抽象语法树",
    "LLM": "大语言模型"
  }
}
```

---

## 🔧 项目结构

```
├── src/              # CLI 核心代码
│   ├── cli.js        # 命令行入口
│   ├── translate.js  # 翻译引擎
│   └── ...
├── web/              # Web 前端 (Vue3 + Vite)
│   ├── src/
│   └── README.md     # Web 版详细说明
└── prompts/          # 翻译提示词模板
```

---

## ⚠️ 注意事项

1. **Markdown 格式**: 翻译后格式可能被规范化，但文档结构保持不变
2. **代码块**: 代码块、行内代码和 HTML 不会被翻译
3. **文件跳过**: 默认跳过已存在的译文文件，使用 `--force` 强制覆盖
4. **日志**: 失败日志保存在 `log.txt`，包含模型输入输出（用于调试）
5. **API Key 安全**: Web 版将 Key 存储在浏览器 localStorage，建议使用专用 Key

---

## 🛠️ 技术栈

- **CLI**: Node.js + Unified/Remark (Markdown AST)
- **Web UI**: Vue 3 + Vite + TypeScript + Tailwind CSS + Shadcn Vue
- **状态管理**: Pinia
- **部署**: GitHub Actions → GitHub Pages

---

## 📄 License

MIT

---

**相关链接：**
- 🌐 Web UI: https://musherm.github.io/MarkdownTranslation/
- 📘 Web 版详细文档: [web/README.md](./web/README.md)
- 🐙 GitHub: https://github.com/MusherM/MarkdownTranslation
