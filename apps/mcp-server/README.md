# @fortunel/mcp-server

Standalone Model Context Protocol server. Phase B deliverable.

## Why a separate package?

The MCP **stdio** transport can't run on Cloudflare Workers (no stdin/stdout). This package wraps the REST API in MCP tools and runs in two shapes:

| Transport | Where it runs                | Used by                                  |
| --------- | ---------------------------- | ---------------------------------------- |
| stdio     | User's machine (this package) | Claude Desktop, Cursor, Zed              |
| HTTP/SSE  | Mounted at `/mcp` on the API | Cloud agents, browser-based MCP clients  |

Both shapes share the same tool definitions imported from this package.

## Phase B scope

- Tools mirror the REST surface: `create_post`, `list_posts`, `get_post`, `update_post`, `delete_post`, `get_trading_signal`, `list_signals`, `backtest_strategy`, `ingest_knowledge`, `list_knowledge`, `generate_draft`
- Each tool calls the REST API with a scoped API key — MCP server is just a client
- Tool descriptions optimized for AI consumers (verb-first, single-sentence)
