// Prints manual.html to manual.pdf with headless Chromium. Usage: node tools/pdf.mjs [project-folder]
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
const dir = process.argv[2] ? process.argv[2].replace(/\/?$/, '/') : '';
await page.goto('file://' + new URL('../' + dir + 'manual.html', import.meta.url).pathname);
await page.evaluate(() => document.fonts.ready);
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: new URL('../' + dir + 'manual.pdf', import.meta.url).pathname, format: 'Letter', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(dir + 'manual.pdf written');
