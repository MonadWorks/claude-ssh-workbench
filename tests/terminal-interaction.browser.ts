import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { localTerminalSelection, copyTerminalText } from '../src/terminalSelection';

const text = '中文复制 Clipboard 123';
const paragraph = '正文，标点。'.repeat(6) + '末尾完整';
const fixtures = [false, true].map(gpu => {
  const term = new Terminal({
    cols: 82, rows: 10, fontFamily: 'Menlo, Consolas, "Liberation Mono", monospace', fontSize: 13,
  });
  term.open(document.getElementById(gpu ? 'gpu' : 'dom')!);
  if (gpu) term.loadAddon(new WebglAddon());
  localTerminalSelection(term, () => {});
  const input: string[] = [];
  term.onData(data => input.push(data));
  term.write('\x1b[?1003h\x1b[?1006h' + text + '\r\n' + paragraph + '\r\nEND');
  return { term, input, name: gpu ? 'WebGL' : 'DOM' };
});

document.getElementById('run')!.onclick = () => {
  const results: string[] = [];
  for (const { term, input, name } of fixtures) {
    const check = (pass: boolean, message: string) => results.push(`${pass ? 'PASS' : 'FAIL'} ${name}: ${message}`);
    input.length = 0;
    const screen = term.element!.querySelector('.xterm-screen')!;
    const box = screen.getBoundingClientRect(), cw = box.width / term.cols, ch = box.height / term.rows;
    const mouse = (type: string, col: number, row = 0) => screen.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, button: 0,
      clientX: box.left + (col + 0.1) * cw, clientY: box.top + (row + 0.5) * ch,
    }));
    const drag = (from: number, to: number, row = 0) => {
      mouse('mousedown', from); mouse('mousemove', to, row); mouse('mouseup', to, row);
    };
    drag(0, 22);
    check(term.getSelection() === text, 'plain drag with remote mouse enabled');
    drag(22, 0);
    check(term.getSelection() === text, 'reverse drag including wide characters');
    drag(0, 3, 2);
    check(term.getSelection() === `${text}\n${paragraph}\nEND`, 'multiline Chinese and English selection');
    check(input.length === 0, 'drag kept local');
    mouse('mousedown', 0); mouse('mouseup', 0);
    check(input.some(s => s.startsWith('\x1b[<0;')), 'click still reaches remote TUI');
    drag(0, 22);
    const rows = [...term.element!.querySelectorAll('.xterm-rows>div')];
    if (rows.length) check(rows.every(row => row.scrollWidth <= row.clientWidth + 1), 'CJK punctuation fits cell grid');
  }
  document.getElementById('results')!.textContent = results.join('\n');
};
document.getElementById('copy')!.onmousedown = e => e.preventDefault();
document.getElementById('copy')!.onclick = () => void copyTerminalText(fixtures[1].term.getSelection()).then(
  () => document.getElementById('copy-result')!.textContent = 'Copied synthetic text.',
  () => document.getElementById('copy-result')!.textContent = 'Copy failed.',
);
