import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { clearCommittedInput } from "../src/terminalInput.ts";

function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const textarea = Object.assign(new EventTarget(), { value: "" });
  const options = { screenReaderMode: false };
  let onData: () => void = () => {};
  const guard = clearCommittedInput({
    textarea: textarea as HTMLTextAreaElement, options,
    onData(listener) { onData = () => listener("text"); return { dispose() { onData = () => {}; } }; },
  });
  t.after(() => guard.dispose());
  return {
    textarea, options, guard, data: () => onData(),
    event: (type: string, fields = {}) => textarea.dispatchEvent(Object.assign(new Event(type), fields)),
    flush: () => t.mock.timers.runAll(),
  };
}

test("committed Chinese is consumed before the helper textarea is cleared", t => {
  const f = fixture(t);
  const sent: string[] = [];
  for (const text of ["看看", "你好", "继续", "🙂"]) {
    f.event("compositionstart");
    f.textarea.value = text;
    f.event("input", { isComposing: true });
    f.flush();
    assert.equal(f.textarea.value, text, "must retain candidate text while composing");
    // xterm registers its deferred composition commit before our listener.
    setTimeout(() => { sent.push(f.textarea.value); f.data(); }, 0);
    f.event("compositionend");
    f.flush();
    assert.equal(f.textarea.value, "");
  }
  assert.deepEqual(sent, ["看看", "你好", "继续", "🙂"]);
});

test("a new composition or input cancels pending cleanup", t => {
  const f = fixture(t);
  f.textarea.value = "看看";
  f.event("compositionend");
  f.event("compositionstart");
  f.textarea.value += "ni";
  f.flush();
  assert.equal(f.textarea.value, "看看ni");
  f.event("compositionend");
  f.event("keydown");
  f.event("beforeinput");
  f.flush();
  assert.equal(f.textarea.value, "看看ni");
  f.event("input");
  f.flush();
  assert.equal(f.textarea.value, "");
});

test("ordinary text residue is cleared without changing outgoing data", t => {
  const f = fixture(t);
  f.data();
  f.textarea.value = "ABC ";
  f.event("input");
  f.event("keyup");
  f.flush();
  assert.equal(f.textarea.value, "");
});

test("screen reader mode and disposal preserve textarea ownership", t => {
  const f = fixture(t);
  f.options.screenReaderMode = true;
  f.textarea.value = "accessible input";
  f.data(); f.event("keyup"); f.flush();
  assert.equal(f.textarea.value, "accessible input");
  f.options.screenReaderMode = false;
  f.data();
  f.guard.dispose();
  f.event("input"); f.flush();
  assert.equal(f.textarea.value, "accessible input");
});
