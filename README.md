# Claude SSH Workbench

A minimal browser workbench for **the real Claude Code terminal on a remote Windows machine**. The center is an xterm.js terminal connected through an SSH PTY. The side panels provide a session list and a read-only file browser. There is no custom chat interface, model picker, or permission-mode toolbar.

中文：通过浏览器直接操作远端 Claude Code 原生终端，保留会话列表和文件浏览。打开自动恢复上次会话；模型、思考强度、模式、停止等操作都在 Claude 原生终端内完成。

## What it does

- Opens interactive Claude Code over SSH using the remote machine's existing login.
- **Starts every new or resumed process with `--dangerously-skip-permissions`.** This intentionally allows Claude to run tools without approval. Use only with a remote account and workspace you are authorized to control. Claude may ask you to accept its native first-use bypass dialog once.
- Restores the last selected session when the page opens. New sessions and imported history connect automatically.
- Keeps terminals alive while switching sessions or closing/reloading the browser, as long as this local backend and its SSH connections remain running.
- Restores terminal colors, cursor, alternate screen, scrollback and unsent input when reattaching to a live process.
- Checks for the actual remote transcript before deciding between `--session-id` and `--resume`. Saved sessions remain on the remote computer.
- Supports terminal keyboard input, Chinese IME, paste and viewport resize. Use Claude's `/model`, `/effort`, `/add-dir`, `/exit`, Escape and other native controls directly.
- Browses remote files, previews UTF-8 text up to 2 MB, inserts a file path into terminal input without submitting it, and shows Git changes when Git is installed remotely.

## Requirements

- Local machine: macOS or Linux, Node.js **22.15+**, npm, and OpenSSH client. The current integration was verified from macOS to Windows.
- Remote machine: Windows with OpenSSH Server and native Claude Code installed at `%USERPROFILE%\.local\bin\claude.exe`, already signed in.
- A working SSH alias with noninteractive authentication. Verify `ssh claude-host` first, including the host fingerprint. Credentials and host-key verification stay with your existing OpenSSH configuration.
- Network access between the two machines. Tailscale is optional; any network that permits your SSH connection works.

This first version targets a Windows remote host. It is not yet a generic Linux/macOS remote adapter.

## Run locally

```sh
git clone https://github.com/MonadWorks/claude-ssh-workbench.git
cd claude-ssh-workbench
npm ci
cp .env.example .env
```

Edit `.env` with your SSH alias and remote directory:

```dotenv
SSH_HOST=claude-host
REMOTE_WORKSPACE=C:\Projects
PORT=4188
```

Then:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:4188**. Keep the backend running while using the workbench. For development, `npm run dev` serves Vite on port 5173 and proxies to the backend on port 4188. The development proxy uses these default ports.

The first connection can take several seconds. First-use login, trust and bypass notices are Claude's native terminal screens. Use the terminal to complete any notices. No subscription or API credentials are bundled with this repository.

## Session behavior and limits

- Up to 8 simultaneous terminal processes and 200 local session entries. Use `/exit` in an unused terminal to free a process slot.
- Refresh and tab switches reattach to the existing terminal; they do not resend prompts or start a second process for the same session.
- Backend shutdown or SSH loss can terminate an active remote CLI. Reopening restores saved conversation history, **not a running shell command or unsaved terminal input**. Verify unfinished operations before repeating them.
- Native commands such as `/clear`, `/fork` or `/resume` can change Claude's session identity inside a terminal. The sidebar tracks the ID used to launch it; refresh the history list to open another native session as its own entry.
- Status in the sidebar describes the terminal connection, not whether Claude is currently thinking. Read the native terminal for task status and prompts.
- File and Git panels show the entire remote workspace. They do not provide per-session rollback.
- Terminal scrollback is limited to 2,000 lines. Claude's complete transcripts remain remote. The history list includes the 100 most recently modified transcript files.
- The interface is a space-opera "bridge": a starfield that jumps to lightspeed when you switch sessions, an opening crawl while a terminal connects, and status shown as glowing blades. The **Warp FX** button in the header turns ambient motion off; that choice is remembered per browser, and the default follows the system's reduced-motion setting.

## Privacy and access

The server binds **only to 127.0.0.1**, validates Host and Origin for HTTP/WebSocket requests, and requires a request marker for HTTP mutations. Keep it local; this is not an authenticated multi-user service and should not be exposed through a public reverse proxy.

The application uses your SSH client directly. It does not copy private keys, read Claude tokens, or supply a shared Claude account. `.env`, `.state/`, logs, generated builds and credential file patterns are ignored by Git. `.state/` contains private local session metadata and is never meant for publication. Terminal screens are held in backend memory for reattachment.

## Development

```sh
npm run dev
npm run check  # TypeScript/build + offline tests; no remote account required
```

`WORKBENCH_STATE_DIR` optionally overrides the local state directory for isolated tests. The install script fixes the executable bit on node-pty's macOS helper. Building node-pty from source on an unsupported prebuilt platform may require a compiler toolchain.

| Module | Responsibility |
| --- | --- |
| `src/components/TerminalPanel.tsx` | xterm view, input, resize and reconnect |
| `src/terminalInput.ts` | Clears committed IME residue after xterm consumes it |
| `src/components/SessionSidebar.tsx` | Session selection |
| `src/components/FilePanel.tsx` | Read-only file and Git views |
| `src/useWorkbench.ts` | Metadata and last-session selection |
| `src/components/Starfield.tsx` | Background starfield, blaster fire and hyperspace jumps |
| `src/components/Holo.tsx` | Decrypting text and the connection opening crawl |
| `src/motion.ts` | Motion preference and decorative cross-component signals |
| `server/terminal.ts` | SSH PTY lifecycle, bounded VT buffer and WebSocket stream |
| `server/sessions.ts` | Local session metadata |
| `server/ssh.ts` | Encoded PowerShell commands and bypass-by-default CLI launch |
| `server/remote.ps1` | Remote read-only file/history/Git queries |
| `server/index.ts` | Local HTTP/WebSocket server and access checks |

Offline tests cover bypass defaults, literal path quoting, terminal screen restoration, initial session selection, and IME cleanup timing. Live integration requires your own authorized remote machine and is not run in CI.

For browser input regression checks, run `npx vite --host 127.0.0.1` and open `/tests/terminal-input.html` on the displayed development URL. Click **Run input regressions** to compare stock xterm against the fix for repeated Chinese text, then type with your actual OS input method in the fixed terminal. This page only displays received input locally; it makes no SSH connection. Synthetic composition events cover the stale-caret failure but do not replace testing with an OS IME. The fixture is excluded from the production build.

Built with [xterm.js](https://xtermjs.org/), [node-pty](https://github.com/microsoft/node-pty) and the official [Claude Code CLI](https://code.claude.com/docs/en/cli-reference). Interface fonts are Orbitron, Rajdhani, Exo 2, News Cycle and JetBrains Mono (SIL Open Font License), bundled through [Fontsource](https://fontsource.org/) so the page makes no external font requests. This is an independent project, not an official Anthropic product.

## License

MIT. See [LICENSE](LICENSE).
