import type { Terminal } from '@xterm/xterm';

/** Plain dragging selects locally even when the remote TUI enables mouse tracking.
 * A click is replayed to xterm, so remote buttons and prompt positioning still work. */
export function localTerminalSelection(term: Terminal, beforeSelect: () => void) {
  const host = term.element!;
  const doc = host.ownerDocument;
  let forwarding = false;
  let start: { event: MouseEvent; offset: number; dragged: boolean } | undefined;
  const offset = (e: MouseEvent) => {
    const box = host.querySelector('.xterm-screen')!.getBoundingClientRect();
    const col = Math.max(0, Math.min(term.cols, Math.floor((e.clientX - box.left) / (box.width / term.cols))));
    const row = Math.max(0, Math.min(term.rows - 1, Math.floor((e.clientY - box.top) / (box.height / term.rows))));
    return (term.buffer.active.viewportY + row) * term.cols + col;
  };
  const select = (e: MouseEvent) => {
    const end = offset(e), first = Math.min(start!.offset, end);
    term.select(first % term.cols, Math.floor(first / term.cols), Math.abs(end - start!.offset));
  };
  const stop = (e: MouseEvent) => { e.preventDefault(); e.stopImmediatePropagation(); };
  const move = (e: MouseEvent) => {
    if (!start) return;
    stop(e);
    if (Math.hypot(e.clientX - start.event.clientX, e.clientY - start.event.clientY) >= 3) start.dragged = true;
    if (start.dragged) select(e);
  };
  const remove = () => {
    start = undefined;
    doc.removeEventListener('mousemove', move, true);
    doc.removeEventListener('mouseup', up, true);
  };
  const up = (e: MouseEvent) => {
    if (!start || e.button !== 0) return;
    stop(e);
    const down = start.event;
    const dragged = start.dragged;
    if (dragged) select(e);
    remove();
    if (!dragged) {
      forwarding = true;
      try {
        for (const event of [down, e]) host.dispatchEvent(new MouseEvent(event.type, {
          bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY,
          button: 0, buttons: event.type === 'mousedown' ? 1 : 0, detail: event.detail,
        }));
      } finally { forwarding = false; }
    }
  };
  const down = (e: MouseEvent) => {
    if (forwarding || e.button !== 0 || e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;
    // Leave the native scroll bar available.
    const box = host.querySelector('.xterm-screen')!.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX >= box.right || e.clientY < box.top || e.clientY >= box.bottom) return;
    stop(e);
    beforeSelect();
    term.focus();
    term.clearSelection();
    start = { event: e, offset: offset(e), dragged: false };
    doc.addEventListener('mousemove', move, true);
    doc.addEventListener('mouseup', up, true);
  };
  host.addEventListener('mousedown', down, true);
  window.addEventListener('blur', remove);
  return { dispose() { remove(); host.removeEventListener('mousedown', down, true); window.removeEventListener('blur', remove); } };
}

/** Use the synchronous browser copy event first (also works with clipboard API
 * permission denied); report failure instead of silently keeping old clipboard data. */
export async function copyTerminalText(text: string, doc = document): Promise<void> {
  if (!text) throw new Error('Drag over terminal text to select it first.');
  let copied = false;
  const listener = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    e.stopImmediatePropagation();
    copied = true;
  };
  doc.addEventListener('copy', listener, true);
  try { doc.execCommand('copy'); } catch { /* Try the clipboard API below. */ }
  finally { doc.removeEventListener('copy', listener, true); }
  if (!copied) await navigator.clipboard.writeText(text);
}
