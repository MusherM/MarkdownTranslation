# Markdown 翻译

将英文 Markdown 文档翻译为简体中文，同时保留 Markdown 结构。该工具将 Markdown 解析为 AST，仅翻译文本节点，并重新序列化文档。它还支持使用规则的词典并进行重试。

## 功能

- 基于 AST 的翻译（结构保留）
- OpenAI 兼容的 API（自定义 `base_url` 和 `api_key`)
- 词典注入与严格规则检查
- 动态词典注入（仅发送输入中出现的术语）
- 提示存储为外部 Markdown

## 要求

- Node.js 18+

## 安装

```
npm install
```

## 快速入门

```
node src/cli.js input.md -c config.jsonc
```

输出默认为 `input.zh.md`. 使用 `-o -` 打印到标准输出。

### 批处理模式
```
node src/cli.js ./docs -c config.jsonc
```

当输入为目录时，会串行翻译目录内所有 `.md` 与 `.markdown` 文件。默认输出到原文件旁，或通过 `-o` 指定输出目录并保持相对路径结构。

## 配置

创建 `config.jsonc`（或 `config.json`）。示例：

```
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
  "max_batch_chars": 4000,
  "max_batch_segments": 100
}
```

词典可以是内联或通过 `glossary_path`：

```
{
  "glossary": {
    "API": "API",
    "AST": "AST"
  }
}
```

## 词典规则

如果源术语出现在任何翻译段中，输出必须包含相应的目标术语。当规则检查失败时，工具会重新提示模型以包含缺失的术语。重试预算由 `retry_times` 控制。如果多次失败，工具会调用术语判定提示判断该翻译是否仍可接受；若接受则直接采信，否则继续重试。

## 说明

- Markdown 格式可能被序列化器规范化，但文档结构得以保留。
- 代码块、内联代码和 HTML 不会被翻译。
- 翻译过程中每个文档会显示一条细绿色进度条（仅 TTY 环境）。

## 提示

基础提示存储在 `prompts/translate.md`。您可以通过 `prompt_path` 在配置中覆盖它。
术语判定提示存储在 `prompts/glossary-judge.md`。您可以通过 `judge_prompt_path` 在配置中覆盖它。
