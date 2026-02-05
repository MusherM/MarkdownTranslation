# Markdown Translate

Translate English Markdown documents to Simplified Chinese while preserving Markdown structure. The tool parses Markdown into an AST, translates only text nodes, and re-serializes the document. It also supports a glossary with rule-based checks and retries.

## Features
- AST-based translation (structure preserved)
- OpenAI-compatible API (custom `base_url` and `api_key`)
- Glossary injection with strict rule checking
- Dynamic glossary injection (only terms found in the input are sent)
- Prompt stored as external Markdown

## Requirements
- Node.js 18+

## Install
```
npm install
```

## Quick Start
```
node src/cli.js input.md -c config.jsonc
```

Output defaults to `input.zh.md`. Use `-o -` to print to stdout.

## Configuration
Create `config.jsonc` (or `config.json`). Example:

```
{
  "base_url": "https://api.openai.com/v1",
  "api_key": "YOUR_API_KEY",
  "model": "gpt-4o-mini",
  "retry_times": 3,
  "prompt_path": "prompts/translate.md",
  "glossary_path": "glossary.example.jsonc",
  "temperature": 0.2,
  "max_tokens": 2048,
  "max_batch_chars": 4000,
  "max_batch_segments": 100
}
```

Glossary can be inline or via `glossary_path`:

```
{
  "glossary": {
    "API": "API",
    "AST": "AST"
  }
}
```

## Glossary Rules
If a source term appears in any translated segment, the output must contain the corresponding target term. When the rule check fails, the tool re-prompts the model with the missing terms. The retry budget is controlled by `retry_times`.

## Notes
- Markdown formatting may be normalized by the serializer, but the document structure is preserved.
- Code blocks, inline code, and HTML are not translated.

## Prompt
The base prompt is stored in `prompts/translate.md`. You can override it with `prompt_path` in config.
