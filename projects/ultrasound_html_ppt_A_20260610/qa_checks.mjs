import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('./interactions.js', import.meta.url), 'utf8');

const checks = [
  {
    name: '第 2 页有交互式方法数据流',
    pass:
      html.includes('method-flow-interactive') &&
      html.includes('data-step="image"') &&
      html.includes('method-step-stage') &&
      html.includes('method-dimension-strip'),
  },
  {
    name: '第 2 页有中文解释卡和无遮挡高亮层',
    pass:
      html.includes('核心结论') &&
      css.includes('.method-focus-layer') &&
      css.includes('.method-step-panel'),
  },
  {
    name: '第 3 页队列演示核心标签汉化',
    pass:
      !html.includes('Priority Heap') &&
      !html.includes('worker</span>') &&
      !html.includes('img</div>') &&
      !html.includes('agg</div>') &&
      html.includes('优先级堆') &&
      html.includes('单模型执行器') &&
      html.includes('聚合'),
  },
  {
    name: '第 3 页解释数据库/任务落库逻辑',
    pass: html.includes('存储链路') && html.includes('任务状态') && html.includes('结果落库'),
  },
  {
    name: '第 4 页闭环图放大并配有解释层',
    pass:
      css.includes('.governance-layout.refined') &&
      css.includes('.loop-figure img') &&
      html.includes('governance-callouts') &&
      html.includes('gc-hotspot'),
  },
  {
    name: '没有明显乱码',
    pass: !html.includes('�') && !css.includes('�'),
  },
  {
    name: '不同设备按 16:9 舞台等比自适应',
    pass:
      html.includes('deck-stage') &&
      css.includes('width: 1280px') &&
      css.includes('height: 720px') &&
      css.includes('translate(var(--deck-x') &&
      css.includes('scale(var(--deck-scale') &&
      js.includes('fitDeckToViewport') &&
      js.includes('--deck-scale') &&
      js.includes('--deck-x') &&
      js.includes('--deck-y'),
  },
];

const failed = checks.filter((c) => !c.pass);
for (const c of checks) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}`);
}

if (failed.length) {
  process.exitCode = 1;
}
