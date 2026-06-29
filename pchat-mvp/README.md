# PChat MVP

Isolated local PChat prototype. It does not modify or depend on the current
`user-pchat` server.

## Isolation Rules

- MCP server name: `pchat-mvp`
- Tool names are prefixed with `mvp_`
- Default data directory: `~/.pchat-mvp`
- No automatic writes to `~/.cursor/mcp.json`
- No shared data directory with `~/.cursor-mcp-messenger`

## Run

```bash
npm run ui
npm run mcp
```

There are no runtime npm dependencies in the MVP.

The UI starts on `http://127.0.0.1:4177` by default.

Use the CLI to enqueue input without the UI:

```bash
npm run send -- --session default "hello from local user"
node src/cli.mjs state
```

## MCP Tools

- `mvp_wait_for_user_input`: records an assistant reply and waits for local user input.
- `mvp_enqueue_user_input`: queues input for testing without the UI.
- `mvp_get_state`: returns diagnostic state from the isolated store.

To try it in Cursor, add it as a separate MCP server only after reviewing the
configuration. Do not replace the existing `user-pchat` entry.
