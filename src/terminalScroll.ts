/** Windows' attached Claude view can leave stale cells after incremental scrolls.
 * Request a native full repaint at a bounded rate; keep the session and draft. */
export function isWheelInput(data: string): boolean {
  // SGR mouse reporting (Claude), including modifier bits. Match only mouse
  // reports, never escape-looking text inside a paste or ordinary key input.
  const sgr = /^\x1b\[<(\d+);\d+;\d+M$/.exec(data);
  if (sgr) return (Number(sgr[1]) & 64) !== 0;
  // Legacy X10 mouse reporting, where the button byte has a +32 offset.
  return data.length === 6 && data.startsWith('\x1b[M') && ((data.charCodeAt(3) - 32) & 64) !== 0;
}

export class ScrollRepaint {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private repaint: () => void, private interval = 120) {}
  input(data: string) {
    if (!isWheelInput(data) || this.timer !== undefined) return;
    // Throttle, rather than debounce: long trackpad gestures also get repaired.
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.repaint();
    }, this.interval);
  }
  cancel() { clearTimeout(this.timer); this.timer = undefined; }
}
