/** xterm writes are asynchronous; resize/reset must share their ordering. */
export interface OutputTerminal {
  write(data: string, callback: () => void): void;
  resize(cols: number, rows: number): void;
  reset(): void;
}

export class TerminalOutput {
  private pending = Promise.resolve();
  private disposed = false;
  constructor(private terminal: OutputTerminal) {}

  private enqueue(action: () => void | Promise<void>) {
    this.pending = this.pending.then(() => { if (!this.disposed) return action(); });
  }
  write(data: string, after?: () => void) {
    this.enqueue(() => new Promise<void>((resolve) => {
      this.terminal.write(data, () => {
        if (!this.disposed) after?.();
        resolve();
      });
    }));
  }
  resize(cols: number, rows: number, after?: () => void) {
    this.enqueue(() => { this.terminal.resize(cols, rows); after?.(); });
  }
  restore(cols: number, rows: number, data: string, after?: () => void) {
    this.enqueue(() => { this.terminal.reset(); this.terminal.resize(cols, rows); });
    this.write(data, after);
  }
  after(action: () => void) { this.enqueue(action); }
  flush() { return this.pending; }
  dispose() { this.disposed = true; }
}
