# Claude SSH Workbench

A minimal browser workbench for **the real Claude Code terminal on a remote Windows machine**. The center is an xterm.js terminal connected through an SSH PTY. The side panels provide a session list and a read-only file browser. There is no custom chat interface, model picker, or permission-mode toolbar.

中文：通过浏览器直接操作远端 Claude Code 原生终端，保留会话列表和文件浏览。打开自动恢复上次会话；模型、思考强度、模式、停止等操作都在 Claude 原生终端内完成。

## What it does

- Opens interactive Claude Code over SSH using the remote machine's existing login.
- **Starts every new or resumed process with `--dangerously-skip-permissions`.** This intentionally allows Claude to run tools without approval. Use only with a remote account and workspace you are authorized to control. Claude may ask you to accept its native first-use bypass dialog once.
- Restores the last selected session when the page opens. New sessions and imported history connect automatically.
- Hosts each terminal under Claude Code's **remote background supervisor**. Closing the browser, stopping the local backend, or losing SSH leaves the remote worker running. Reconnecting attaches to the same terminal.
- Restores terminal colors, cursor, alternate screen, scrollback and unsent input when reattaching to a live process.
- Checks for the actual remote transcript before deciding between `--session-id` and `--resume`. Saved sessions remain on the remote computer.
- Supports terminal keyboard input, Chinese IME, paste and viewport resize. Use Claude's `/model`, `/effort`, `/add-dir`, `/exit`, Escape and other native controls directly.
- Keeps terminal output and size changes in order across reconnects and multiple browser viewers. If the remote terminal leaves stale text, **Redraw** (or **Ctrl+L** inside Claude) requests a fresh frame without restarting the task or clearing the prompt.
- Browses remote files, previews UTF-8 text up to 2 MB, inserts a file path into terminal input without submitting it, and shows Git changes when Git is installed remotely.

## Requirements

- Local machine: macOS or Linux, Node.js **22.15+**, npm, and OpenSSH client. The current integration was verified from macOS to Windows.
- Remote machine: Windows with OpenSSH Server and native Claude Code **2.1.308+** installed at `%USERPROFILE%\.local\bin\claude.exe`, already signed in. The workspace must already be trusted in Claude Code.
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

Open **http://127.0.0.1:4188**. The backend is needed to view or control terminals, but remote tasks continue when it stops. For development, `npm run dev` serves Vite on port 5173 and proxies to the backend on port 4188. The development proxy uses these default ports.

The first connection can take several seconds. First-use login, trust and bypass notices are Claude's native terminal screens. Use the terminal to complete any notices. No subscription or API credentials are bundled with this repository.

## Files in the browser workbench

SSH does not forward the Mac's image clipboard to the remote Windows clipboard, so the workbench sends files itself through the same SSH alias:

- **Paste** a screenshot into the terminal (Command + V after **Control + Shift + Command + 4**). A clipboard that also holds text pastes the text as usual; only file/image clipboards without text are uploaded.
- **Drop** files anywhere on the page, or use **Uplink** in the terminal bar to choose files.

The backend uploads the batch over SFTP to a new folder under `%USERPROFILE%\ClaudeUploads`, verifies SHA-256 hashes, then types the quoted remote paths into the original terminal followed by a space. It never presses Enter: add your request and send it yourself. If you switched sessions or the original terminal is not connected, the paths are copied to the clipboard instead. PDFs, images, text, Office documents, archives and other regular files are accepted: up to 20 files, 20 MB each, 100 MB total. File names keep a numbered, sanitized version of the original name and extension. File transfer does not convert documents or run their contents; Claude handles each format using its available tools. Folders must be compressed first. Limits match the native helper below. The Uplink console keeps the last 24 transmissions (remote path and a small thumbnail, stored in this browser's local storage) so you can insert or copy them again; **Clear** removes them.

## Files from a Mac terminal

For an ordinary terminal without the browser, the optional native helper uploads files through the existing SSH connection configuration and copies their **remote file paths**. Paste those paths into Claude Code and add your request. It works with an ordinary terminal and does not need the browser or its backend running.

On macOS with Xcode Command Line Tools and Python 3 installed, build a desktop shortcut using your existing SSH alias:

```sh
python3 scripts/build-image-uploader.py --host claude-host --output "$HOME/Desktop/Claude Image Uploader.app"
```

Open the app, then choose **上传剪贴板图片** (upload clipboard image), **选择文件…** (choose files), or drag files into its window. To capture directly to the clipboard on a Mac, press **Control + Shift + Command + 4**, then press **Command + V** in the uploader. After success, switch back to the Claude terminal and press **Command + V** again to paste the remote paths. The helper never submits your Claude prompt. **再次复制路径** copies the last successful result again.

- Regular files including PDFs, images and documents; up to 20 files, 20 MB each and 100 MB per batch. Clipboard bitmap images are converted to PNG. The helper preserves a sanitized original filename and adds a batch-local sequence number.
- Uploads go to a unique folder under `%USERPROFILE%\ClaudeUploads`, outside your project repository. SHA-256 hashes are checked before paths are copied. Copies remain there until you remove them; a failed upload can leave partial files in its new batch folder.
- The app reads the clipboard only when you request it. Successful uploads replace the clipboard with text paths. No GitHub upload, account login, background watcher or additional network service is involved.
- SSH keys and host verification use your existing OpenSSH configuration. The generated app contains the chosen host alias in `Contents/Resources/config.json`, but no private keys or account tokens. Keep personal app builds out of Git.
- The UI is currently Chinese. The helper targets a Windows SSH server and shares its upload folder and limits with the browser uplink above, but runs independently of the browser and its backend.

To run the helper's offline validation checks on macOS:

```sh
swiftc scripts/macos-image-uploader/Transfer.swift tests/image-uploader.swift -o /tmp/image-uploader-tests
/tmp/image-uploader-tests
```

## Session behavior and limits

- Up to 8 simultaneous local terminal connections and 200 local session entries. Remote background workers continue after detaching; use `/exit` inside a worker or `claude stop <job-id>` on the remote host to stop one explicitly.
- Refresh and tab switches reattach to the existing terminal; they do not resend prompts or start a second process for the same session.
- New terminals are started using `claude --bg --exec` and viewed using `claude attach`. The remote supervisor owns the PTY and Claude process; SSH owns only the viewer. Live reconnects preserve running work and unsent terminal input. This does not survive a remote reboot or shutdown, remote network loss, an explicit stop, a process crash, or exhausted usage limits. A task can still pause for input.
- A per-session remote file lock and a stable background-job name prevent duplicate workers when two tabs connect or a connection fails during startup. Completed workers resume from their saved Claude transcript on the next connection.
- **Existing foreground sessions are not moved automatically.** Run `/bg` in the original live Claude session before leaving it. The workbench refuses to duplicate a known foreground conversation; after backgrounding, reopening that conversation attaches to its native background session. Already-disconnected foreground processes cannot safely be adopted by changing this launcher.
- Native commands such as `/clear`, `/fork` or `/resume` can change Claude's session identity inside a terminal. The sidebar tracks the ID used to launch it; refresh the history list to open another native session as its own entry.
- Status in the sidebar describes the terminal connection, not whether Claude is currently thinking. Read the native terminal for task status and prompts.
- File and Git panels show the entire remote workspace. They do not provide per-session rollback.
- Terminal scrollback is limited to 2,000 lines. Claude's complete transcripts remain remote. The history list includes the 100 most recently modified transcript files.
- The interface is a space-opera "bridge": a starfield that jumps to lightspeed when you switch sessions, an opening crawl while a terminal connects, and status shown as glowing blades. The **Warp FX** button in the header turns ambient motion off; that choice is remembered per browser, and the default follows the system's reduced-motion setting.

## Privacy and access

The server binds **only to 127.0.0.1**, validates Host and Origin for HTTP/WebSocket requests, and requires a request marker for HTTP mutations. Keep it local; this is not an authenticated multi-user service and should not be exposed through a public reverse proxy.

The application uses your SSH client directly. It does not copy private keys, read Claude tokens, or supply a shared Claude account. `.env`, `.state/`, logs, generated builds and credential file patterns are ignored by Git. `.state/` contains private local session metadata and is never meant for publication. Terminal screens are held in backend memory for reattachment.

The remote supervisor is Claude Code's built-in service, authenticated with the existing remote login. It uses local Windows named pipes; this integration opens no additional network port. Per-session lock files live in `%LOCALAPPDATA%\ClaudeSSHWorkbench\locks`. Background job metadata stays in Claude's own config directory.

## Persistent sessions from a desktop terminal

The optional launcher opens Claude's native agent view. Every task dispatched there is hosted remotely and defaults to bypass permissions:

```sh
python3 scripts/remote-claude.py --host claude-host --dir 'C:\Projects'
python3 scripts/remote-claude.py --host claude-host --dir 'C:\Projects' --attach <job-id>
```

Enter a task to dispatch it, select a row and press Enter to enter its terminal, and press Left on an empty prompt to return to the list. Reopening the launcher lists the existing background jobs. Closing the SSH window detaches; `Ctrl+C` inside an attached task can still interrupt it. Native model, effort and permission settings remain available within Claude.

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
| `src/useUplink.ts`, `src/uplink.ts` | File paste/drop/pick, upload stream and transmission log |
| `src/components/Uplink.tsx` | Uplink console, transmission card and drop target |
| `src/components/Starfield.tsx` | Background starfield, blaster fire and hyperspace jumps |
| `src/components/Holo.tsx` | Decrypting text and the connection opening crawl |
| `src/motion.ts` | Motion preference and decorative cross-component signals |
| `server/terminal.ts` | SSH PTY lifecycle, bounded VT buffer and WebSocket stream |
| `server/sessions.ts` | Local session metadata |
| `server/ssh.ts` | Encoded PowerShell commands and bypass-by-default CLI launch |
| `server/persistent-terminal.ps1` | Remote background-worker discovery, launch locking and attachment |
| `scripts/remote-claude.py` | Desktop-terminal entry into the remote persistent agent view |
| `server/remote.ps1` | Remote read-only file/history/Git queries |
| `server/index.ts` | Local HTTP/WebSocket server and access checks |
| `server/uploads.ts` | File batch validation, SFTP upload and SHA-256 verification |

Offline tests cover bypass defaults, literal path quoting, terminal screen restoration, initial session selection, IME cleanup timing, and mixed file batch validation, filename sanitization, SFTP quoting and path insertion. Live integration requires your own authorized remote machine and is not run in CI.

For browser input regression checks, run `npx vite --host 127.0.0.1` and open `/tests/terminal-input.html` on the displayed development URL. Click **Run input regressions** to compare stock xterm against the fix for repeated Chinese text, then type with your actual OS input method in the fixed terminal. This page only displays received input locally; it makes no SSH connection. Synthetic composition events cover the stale-caret failure but do not replace testing with an OS IME. The fixture is excluded from the production build.

Built with [xterm.js](https://xtermjs.org/), [node-pty](https://github.com/microsoft/node-pty) and the official [Claude Code CLI](https://code.claude.com/docs/en/cli-reference). Interface fonts are Orbitron, Rajdhani, Exo 2, News Cycle and JetBrains Mono (SIL Open Font License), bundled through [Fontsource](https://fontsource.org/) so the page makes no external font requests. This is an independent project, not an official Anthropic product.

## License

MIT. See [LICENSE](LICENSE).
