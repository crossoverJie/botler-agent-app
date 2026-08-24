#!/usr/bin/env node
// 图片自动导出：用本机 Chrome（优先）截 web/dist/index.html 的当前视图为 PNG。
// 浏览器引擎回退：系统 Chrome -> Playwright 自带 Chromium -> 报错提示安装。
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const repoRoot = resolve(webRoot, '..');
const distFile = resolve(webRoot, 'dist', 'index.html');
const defaultOutDir = resolve(repoRoot, 'exports');

const VIEW_LABEL = { day: '日视图', week: '周视图', month: '月视图', year: '年视图' };

function parseArgs(argv) {
  const out = { view: 'month', date: null, scale: 2, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--view') out.view = argv[++i];
    else if (a === '--date') out.date = argv[++i];
    else if (a === '--scale') out.scale = Number(argv[++i]) || 2;
    else if (a === '--out') out.out = argv[++i];
  }
  if (!VIEW_LABEL[out.view]) {
    throw new Error(`--view 必须是 day|week|month|year，收到：${out.view}`);
  }
  if (!out.date) {
    const now = new Date();
    out.date =
      out.view === 'year'
        ? String(now.getFullYear())
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
            now.getDate(),
          ).padStart(2, '0')}`;
  }
  return out;
}

async function launchBrowser() {
  // 1) 系统 Chrome（本机已有，零下载）
  try {
    const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox', '--disable-gpu'] });
    return { browser: b, engine: '系统 Chrome' };
  } catch (e) {
    console.warn(`[export] 系统 Chrome 不可用（${e.message.split('\n')[0]}）`);
  }
  // 2) Playwright 自带 Chromium（需先 npx playwright install chromium）
  try {
    const b = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
    return { browser: b, engine: 'Playwright Chromium' };
  } catch (e) {
    console.error(
      '\n[export] 没有可用的浏览器引擎。请二选一：\n' +
        '  1) 安装系统 Chrome；或\n' +
        '  2) 运行  npx playwright install chromium  下载 Playwright 自带 Chromium。\n',
    );
    throw e;
  }
}

function fileName(opts) {
  const safe = opts.date.replace(/[^\d-]/g, '');
  return `${safe}_${VIEW_LABEL[opts.view]}.png`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(distFile)) {
    throw new Error(`找不到构建产物：${distFile}\n请先在 web/ 下执行 npm run build。`);
  }

  const fileUrl = `file://${distFile}?view=${opts.view}&date=${encodeURIComponent(
    opts.date,
  )}&export=1`;

  const { browser, engine } = await launchBrowser();
  console.log(`[export] 使用引擎：${engine}`);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: opts.scale,
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.warn('[page error]', m.text());
  });

  await page.goto(fileUrl, { waitUntil: 'load' });
  // 等待视图与 ECharts 画布渲染完成
  await page.waitForSelector('.capture', { timeout: 15000 });
  await page.waitForSelector(
    '.month-grid, .week-grid, .day-detail, .year-grid',
    { timeout: 15000 },
  );
  await page.waitForSelector('.trend-container canvas', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(450);

  const outPath = opts.out || resolve(defaultOutDir, fileName(opts));
  mkdirSync(dirname(outPath), { recursive: true });

  const el = await page.$('.capture');
  await el.screenshot({ path: outPath });
  console.log(`[export] 已保存：${outPath}  (scale=${opts.scale})`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
