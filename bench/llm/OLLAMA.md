# Ollama GSTIN benchmark

This runs the existing 40-case GSTIN dataset against a model served by Ollama. It compares two arms:

- `without`: the model receives only the GSTIN question.
- `with`: the same question is sent with the bharat-mcp tools exposed over MCP. The model decides whether to call a tool.

The runner uses Ollama's local `/api/chat` endpoint and connects the package's MCP server in-process through the MCP SDK. It does not require Ollama to be an MCP client.

## Requirements

- Node.js 18+
- Build output present (`npm run build`)
- Ollama installed and running
- An Ollama model that supports tool calling

Pull a model with tool-calling support from the Ollama library, then run:

```bash
ollama pull qwen3:8b
npm run build
npm run bench:ollama -- --model qwen3:8b
```

Run one arm only, or limit the number of cases while checking setup:

```bash
npm run bench:ollama -- --model qwen3:8b --arm with --limit 5
npm run bench:ollama -- --model qwen3:8b --arm without --limit 5
```

The default endpoint is `http://127.0.0.1:11434`. Override it with `--host http://host:11434` or the `OLLAMA_HOST` environment variable.

## Test the harness without Ollama

This stand-in mode is only for checking the runner, scoring, result serialization and tool path. It is not a model evaluation:

```bash
npm run build
npm run bench:ollama -- --model stand-in --mock --limit 5
```

Results are written to `bench/results/`. Mock results are explicitly marked as harness-only. Do not compare them with real model results or report them as Ollama performance.

## Interpretation

A model may fail to call a tool, produce malformed arguments, or return an answer without a verdict. Those outcomes are recorded rather than silently treated as successful tool use. Results depend on the exact model tag, quantization, prompt, Ollama version and hardware. Record those details when publishing a comparison.

The `with` arm measures the model plus tool-calling behaviour. The `without` arm measures the model's unaided answer. The benchmark does not establish that one model is generally better, and 40 synthetic GSTIN cases are a small, narrow evaluation set.
