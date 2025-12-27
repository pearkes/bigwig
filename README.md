# Bigwig

Voice-controlled assistant that orchestrates CLI coding agents (amp, claude code, etc.) via OpenAI Realtime API. Read more of the rational in [my blog post](https://www.jackpearkes.com/posts/this-is-my-ai-assistant), which also includes an architecture diagram and more details on security and sandboxing.

## Why?

CLI agents already solve or will continue to improve workflows around memory, tools, and persistence. This wraps a CLI agent in voice + a mobile UI capable of CarPlay, long-running calls, etc., so you can get a very capable self-managed assistant that can use a variety of upstream model providers and countless tools.

## Install & Run

> [!NOTE]
> Try cloning this repository and running a CLI coding agent to ask for help installing.

#### 1. Install the `bigwig` executable and set an OpenAI key.

This single binary contains both the server and worker process.

```bash
$ git clone https://github.com/pearkes/bigwig.git
$ bun install && bun compile
# dist/bigwig
$ cp dist/bigwig ~/.local/bin/
...
```

#### 2. Start the server with defaults and pair your phone.

This server provides an endpoint for the iOS app to connect to 
and manages voice agent sessions. An OpenAI key is required for the 
WebRTC voice API support.

If you're just trying it out, this will work well on your local network.

```bash
$ export OPENAI_API_KEY=...
$ bigwig server --host 0.0.0.0
...
```

Scan the QR code printed in the logs via the iOS app and confirm the match code.

####  3. Join and start the worker.

The worker manages and executes CLI agent processes, and sends data to the user via the server.

Generate a join token in the iOS app (copy paste).

```bash
$ bigwig worker join --token <token> --server <server-url>
...
$ bigwig worker --agent amp
```

This assumes you have `amp` or `claude` installed in the worker environment. Be thoughtful of running this in a safe place, as it runs the equivalent of `--dangerously-skip-permissions`. Some sort of sandbox is suggested.

## Usage

```
Usage: bigwig <command> [args]

Commands:
  server             Start the web server
  worker             Start the worker
  tool <name>        Run a tool

Help:
  --help, -h         Show this help
  tool --help        List available tools

Details:
  Usage: bigwig server [command]

  Commands:
    unpair             Drop paired credentials and reset workers
    --host <host>      Bind host (e.g. 0.0.0.0 for LAN access)
    --origin <url>     Override pairing/QR origin URL

  Notes:
    Requires OPENAI_API_KEY for OpenAI Realtime/WebRTC voice sessions


  Usage: bigwig worker [options]

  Options:
    join --token <token> --server <url>  Pair worker and store credentials
    --connect <url>                      Worker server URL (default: ws://localhost:8080/worker)
    --workspace-dir <dir>                Workspace path (default: current directory)
    --agent <name>                       Agent plugin to use (default: amp)
    --help, -h                           Show this help
```

## Development

```sh
bun test                      # Run tests
bun run compile               # Builds binary to dist/bigwig
bun run worker                # Run the worker
bun run server                # Run the server
bun run check                 # Lint + format
```

## Security

The CLI agent being run by the worker process executes with the equivalent of `--dangerously-allow-all`. You should only use this if you have a strong understanding of the risks associated, and take the appropriate precautions in the environment the agent is running in.

The client (iOS app) and server pair together to protect the server endpoints, which expose the API to run tasks. The client claims a nonce, then proves possession of a newly generated device key by signing a pairing message which the server verifies, storing the device public key. After pairing, requests are signed, and the server issues short‑lived session tokens as well as one‑time worker join tokens. 

Workers exchange a join token for a persistent credential used to authenticate their connection.

## TODO

The status of this project is a working proof of concept that I think can function day-to-day reliably.

Improvements to be made in no particular order:

- [ ] Support additional CLI agent providers: Codex, OpenCode. There is a plugin interface for this that is pretty adaptable
- [ ] Explore support for alternative Voice APIs (currently, OpenAI is required and assumed)
- [ ] Allow for authentication/bootstrap of CLI agents via the iOS app _without_ becoming an OAuth provider
- [ ] Version control integration for the worker, to persist and manage changes to the workspace?
- [ ] Explore built-in sandboxing

Note that while it was carefully managed and verified, a large amount of this codebase was written by CLI agents/LLMs. See [AGENTS.md](AGENTS.md) for agent guidelines.
