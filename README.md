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

### Batch Mode
```
node src/cli.js ./docs -c config.jsonc
```

If the input is a directory, all `.md` and `.markdown` files are translated serially. Output files are written alongside the originals by default, or to the directory provided via `-o`.

## Configuration
Create `config.jsonc` (or `config.json`). Example:

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
  "max_batch_segments": 100,
  "log_path": "log.txt"
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
If a source term appears in any translated segment, the output must contain the corresponding target term. When the rule check fails, the tool re-prompts the model with the missing terms. The retry budget is controlled by `retry_times`. If the glossary check keeps failing, the tool asks a glossary-judge prompt whether the translation is still acceptable; if accepted, the translation is kept without further retries. If retries are exhausted, the last translation result is used as a fallback.

## Notes
- Markdown formatting may be normalized by the serializer, but the document structure is preserved.
- Code blocks, inline code, and HTML are not translated.
- A thin green progress bar is shown per document during translation (TTY only).
- If a translated output file already exists (e.g., `foo.zh.md`), the file is skipped.
- Failures are logged to `log.txt` by default (including model inputs/outputs for debugging). You can change the path with `log_path`.

## Prompt
The base prompt is stored in `prompts/translate.md`. You can override it with `prompt_path` in config.
The glossary-judge prompt is stored in `prompts/glossary-judge.md`. You can override it with `judge_prompt_path` in config.
