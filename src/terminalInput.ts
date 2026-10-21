import type { Terminal } from "@xterm/xterm";

/** Clear committed IME text after xterm has forwarded it, never during composition.
 * xterm 6 retains the helper textarea; an IME can move its caret back into that
 * old text and xterm then forwards the wrong substring on the next commit.
 * See https://github.com/xtermjs/xterm.js/issues/6012 and /issues/6078.
 * Install after open(), so xterm's composition/input handlers run first.
 */
export function clearCommittedInput(term: Pick<Terminal, "textarea" | "options" | "onData">) {
  const textarea = term.textarea;
  if (!textarea) return { dispose() {} };
  let composing = false, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  const schedule = () => {
    cancel();
    if (composing || disposed || term.options.screenReaderMode) return;
    // xterm defers composition commits and keyCode 229 textarea diffs. Let
    // those callbacks consume the value before clearing it.
    timer = setTimeout(() => {
      timer = undefined;
      if (!composing && !disposed && !term.options.screenReaderMode) textarea.value = "";
    }, 0);
  };
  const start = () => { composing = true; cancel(); };
  const end = () => { composing = false; schedule(); };
  const input = (event: Event) => { if (!(event as InputEvent).isComposing) schedule(); };
  const listeners: [string, EventListener][] = [
    ["compositionstart", start], ["compositionend", end],
    ["keydown", cancel], ["beforeinput", cancel],
    ["input", input], ["keyup", schedule],
  ];
  for (const [type, listener] of listeners) textarea.addEventListener(type, listener);
  const data = term.onData(schedule);
  return { dispose() {
    disposed = true;
    cancel();
    data.dispose();
    for (const [type, listener] of listeners) textarea.removeEventListener(type, listener);
  } };
}
