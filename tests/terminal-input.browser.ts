// Open /tests/terminal-input.html using the Vite dev server. This exercises
// the real xterm bundle; synthetic IME sequences supplement manual OS IME tests.
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { clearCommittedInput } from "../src/terminalInput";

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 10));
function fixture(id: string, patched: boolean) {
  const term = new Terminal({ cols: 80, rows: 10, screenReaderMode: !patched });
  term.open(document.getElementById(id)!);
  if (patched) clearCommittedInput(term);
  const received: string[] = [];
  term.onData(data => {
    received.push(data);
    if (patched) document.getElementById("received")!.textContent = JSON.stringify(received);
  });
  return { term, received, textarea: term.textarea! };
}
const baseline = fixture("baseline", false), fixed = fixture("fixed", true);
type Fixture = ReturnType<typeof fixture>;

async function compose(f: Fixture, text: string, caretAtStart = false) {
  const textarea = f.textarea;
  // Reproduce IMEs that reset the caret after committing, as observed in Chrome.
  textarea.setSelectionRange(caretAtStart ? 0 : textarea.value.length, caretAtStart ? 0 : textarea.value.length);
  textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, "end");
  textarea.dispatchEvent(new CompositionEvent("compositionupdate", { data: text, bubbles: true }));
  textarea.dispatchEvent(new InputEvent("input", { data: text, inputType: "insertCompositionText", isComposing: true, bubbles: true }));
  await pause();
  textarea.dispatchEvent(new CompositionEvent("compositionend", { data: text, bubbles: true }));
  textarea.setSelectionRange(0, 0);
  await pause();
}

async function key(f: Fixture, value: string, code = value.charCodeAt(0)) {
  const event = (type: string) => new KeyboardEvent(type, {
    key: value, keyCode: code, charCode: type === "keypress" ? code : 0,
    bubbles: true, cancelable: true, composed: true,
  });
  const down = event("keydown");
  f.textarea.dispatchEvent(down);
  if (!down.defaultPrevented) {
    const press = event("keypress");
    f.textarea.dispatchEvent(press);
    if (!press.defaultPrevented) {
      f.textarea.value += value;
      f.textarea.dispatchEvent(new InputEvent("input", { data: value, inputType: "insertText", bubbles: true, composed: true }));
    }
  }
  f.textarea.dispatchEvent(event("keyup"));
  await pause();
}

document.getElementById("run")!.addEventListener("click", async () => {
  const results = document.getElementById("results")!;
  results.textContent = "Running…";
  const lines: string[] = [];
  const check = (name: string, actual: unknown, expected: unknown) => {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    lines.push(`${pass ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  };
  for (const f of [baseline, fixed]) {
    f.received.length = 0; f.textarea.value = "";
    for (const word of ["看看", "你好", "继续"]) await compose(f, word, true);
  }
  check("unpatched reproduces stale Chinese", baseline.received, ["看看", "看看", "看看"]);
  check("successive Chinese commits", fixed.received, ["看看", "你好", "继续"]);
  check("committed textarea cleared", fixed.textarea.value, "");
  fixed.received.length = 0;
  await key(fixed, "A"); await key(fixed, " ", 32); await key(fixed, "b", 66);
  await compose(fixed, "中文"); await compose(fixed, "🙂"); await compose(fixed, "");
  check("mixed text and cancelled composition", fixed.received.join(""), "A b中文🙂");
  // An IME-active punctuation key takes xterm's deferred textarea-diff path.
  fixed.received.length = 0;
  fixed.textarea.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 229, bubbles: true }));
  fixed.textarea.value = "。";
  fixed.textarea.dispatchEvent(new InputEvent("input", { data: "。", inputType: "insertText", bubbles: true, composed: true }));
  await pause();
  check("IME punctuation is emitted once", fixed.received, ["。"]);
  check("punctuation residue cleared", fixed.textarea.value, "");
  fixed.received.length = 0;
  fixed.term.paste("看看\n你好🙂"); await pause();
  check("multiline paste", fixed.received, ["看看\r你好🙂"]);
  fixed.received.length = 0;
  results.textContent = lines.join("\n");
  fixed.term.focus();
});
