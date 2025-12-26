# Agent Guidelines

## Commands
```sh
bun test                    # Run tests

bun run server              # Start server
bun run worker              # Start worker

bun run compile             # Build single binary to dist/bigwig
./dist/bigwig server        # Run server binary
./dist/bigwig worker        # Run worker binary
./dist/bigwig tool --help   # List tools
./dist/bigwig tool <name>   # Run a tool
```

## Architecture
- `src/server/` — public web server (sessions, worker dispatch)
- `src/worker/` — local daemon (sideband to OpenAI, runs CLI agent)
- `src/shared/` — shared types/utils
- `client/` — Expo/React Native app
## Principles
- **Proof of concept** — don't over-engineer
- **Sideband pattern** — worker connects to OpenAI Realtime alongside client
- **CLI agent as brain** — worker spawns amp (or similar) for tool execution
- **Tools route by location** — some tools run on worker, some on client
