import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { clearCommittedInput } from "../terminalInput";
import { Crawl } from "./Holo";
import { emit } from "../motion";

const THEME = {
  background: "#04060d", foreground: "#dfe6f3", cursor: "#ffe81f", cursorAccent: "#04060d",
  selectionBackground: "rgba(63, 208, 255, 0.32)",
  black: "#0b0f1a", red: "#ff4d5e", green: "#5dff8a", yellow: "#ffe81f",
  blue: "#4fa8ff", magenta: "#c77dff", cyan: "#3fd0ff", white: "#d4dcec",
  brightBlack: "#5a6784", brightRed: "#ff7a86", brightGreen: "#8dffad", brightYellow: "#fff27a",
  brightBlue: "#7fc1ff", brightMagenta: "#dcaaff", brightCyan: "#8be6ff", brightWhite: "#ffffff",
};

export interface TerminalHandle { paste: (text: string) => boolean; }
export const TerminalPanel = forwardRef<TerminalHandle, { sessionId: string }>(
  function TerminalPanel({ sessionId }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const terminal = useRef<Terminal | null>(null);
    const writable = useRef(false);
    const [attempt, setAttempt] = useState(0);
    const [notice, setNotice] = useState("正在连接远端终端…");
    const [ended, setEnded] = useState(false);
    // The crawl covers the terminal until its first output, then plays a short exit.
    const [boot, setBoot] = useState<"on" | "exit" | "off">("on");
    useEffect(() => {
      if (boot !== "exit") return;
      const timer = setTimeout(() => setBoot("off"), 700);
      return () => clearTimeout(timer);
    }, [boot]);
    useImperativeHandle(ref, () => ({ paste(text) {
      if (!writable.current || !terminal.current) return false;
      terminal.current.paste(text);
      terminal.current.focus();
      return true;
    } }), []);
    useEffect(() => {
      let disposed = false, exited = false, socket: WebSocket;
      let retry: ReturnType<typeof setTimeout>, frame = 0;
      setNotice("正在连接远端终端…");
      setEnded(false);
      setBoot("on");
      const live = () => {
        setNotice("");
        setBoot((b) => (b === "on" ? "exit" : b));
      };
      const term = new Terminal({
        fontFamily: 'Menlo, Consolas, "Liberation Mono", monospace', fontSize: 13,
        cursorBlink: true, scrollback: 2000, theme: THEME,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current!);
      const ime = clearCommittedInput(term);
      terminal.current = term;
      fit.fit();
      const send = (value: unknown) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
      };
      const size = () => {
        if (disposed || !host.current?.clientWidth || !host.current?.clientHeight) return;
        fit.fit();
        if (writable.current) send({ type: "resize", cols: term.cols, rows: term.rows });
      };
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(size);
      });
      observer.observe(host.current!);
      const input = term.onData((data) => {
        if (!writable.current) return;
        // The server's VT emulator answers these device/cursor queries once.
        if (/^\x1b\[(?:\??\d+;\d+R|[?>]?[\d;]*c)$/.test(data)) return;
        emit("keystroke");
        for (let i = 0; i < data.length;) {
          let end = Math.min(i + 16384, data.length);
          if (end < data.length && /[\uD800-\uDBFF]/.test(data[end - 1])) end--;
          send({ type: "input", data: data.slice(i, end) });
          i = end;
        }
      });
      term.attachCustomKeyEventHandler((event) => {
        if (event.type === "keydown" && event.metaKey && event.key === "c" && term.hasSelection()) {
          void navigator.clipboard.writeText(term.getSelection());
          return false;
        }
        return true;
      });
      const connect = () => {
        if (disposed) return;
        writable.current = false;
        const query = new URLSearchParams({ id: sessionId, cols: String(Math.max(20, term.cols)), rows: String(Math.max(5, term.rows)) });
        socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/terminal?${query}`);
        socket.onmessage = ({ data }) => {
          if (disposed) return;
          const message = JSON.parse(data);
          if (message.type === "snapshot") {
            term.reset();
            term.resize(message.cols, message.rows);
            term.write(message.data, () => {
              if (disposed || exited) return;
              writable.current = true;
              if (message.data) live();
              size();
              term.focus();
            });
          } else if (message.type === "data") {
            live();
            term.write(message.data);
          } else if (message.type === "exit") {
            exited = true;
            writable.current = false;
            setEnded(true);
            setBoot("off");
            setNotice(message.error || "终端已退出，会话记录已保留。");
          }
        };
        socket.onclose = () => {
          writable.current = false;
          if (!disposed && !exited) {
            setNotice("连接已中断，正在重新连接…");
            retry = setTimeout(connect, 2000);
          }
        };
        socket.onerror = () => socket.close();
      };
      connect();
      return () => {
        disposed = true;
        writable.current = false;
        clearTimeout(retry);
        cancelAnimationFrame(frame);
        observer.disconnect();
        input.dispose();
        ime.dispose();
        socket?.close();
        terminal.current = null;
        term.dispose();
      };
    }, [sessionId, attempt]);
    return <section className="terminal-panel" aria-label="Claude Code 终端">
      <div className="terminal-host" ref={host} />
      {boot !== "off" ? <Crawl status={notice || "跃迁完成"} exiting={boot === "exit"} />
        : notice ? <div className="terminal-notice" role="status">
          <span>{notice}</span>
          {ended ? <button onClick={() => setAttempt((n) => n + 1)}>重新连接</button> : null}
        </div> : null}
    </section>;
  },
);
