import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWheelInput, ScrollRepaint } from '../src/terminalScroll.ts';

test('only mouse wheel reports trigger repaint, including modified and legacy wheels', () => {
  for (const input of ['\x1b[<64;20;10M', '\x1b[<65;20;10M', '\x1b[<80;20;10M', '\x1b[M`!!'])
    assert.equal(isWheelInput(input), true);
  for (const input of ['看看', '\x0c', '\x1b[A', '\x1b[<0;20;10M', '\x1b[<32;20;10M', '\x1b[<0;20;10m', '\x1b[200~\x1b[<64;20;10M\x1b[201~'])
    assert.equal(isWheelInput(input), false);
});

test('long wheel gestures are repainted at a bounded rate and after the last wheel', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let paints=0;
  const repaint = new ScrollRepaint(() => paints++);
  for(let i=0;i<100;i++) repaint.input('\x1b[<64;20;10M');
  t.mock.timers.tick(119);assert.equal(paints,0);
  t.mock.timers.tick(1);assert.equal(paints,1);
  repaint.input('\x1b[<65;20;10M');
  t.mock.timers.tick(120);assert.equal(paints,2);
  t.mock.timers.tick(1000);assert.equal(paints,2);
});

test('disconnect and unmount cancel the pending repaint without changing text input', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let paints=0;
  const repaint = new ScrollRepaint(() => paints++);
  repaint.input('中文 draft');t.mock.timers.tick(120);assert.equal(paints,0);
  repaint.input('\x1b[<64;20;10M');repaint.cancel();
  t.mock.timers.tick(120);assert.equal(paints,0);
  repaint.input('\x1b[<65;20;10M');t.mock.timers.tick(120);assert.equal(paints,1);
});
