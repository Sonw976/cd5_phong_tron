import fs from 'node:fs/promises';
import path from 'node:path';
import { Builder, By, until } from '/tmp/cd5-selenium/node_modules/selenium-webdriver/index.js';
import firefox from '/tmp/cd5-selenium/node_modules/selenium-webdriver/firefox.js';

const base = 'http://127.0.0.1:8877/Ch%E1%BB%A7%20%C4%91%E1%BB%81%205/cd5_ver_2.html';
const outputDir = '/tmp/cd5-shots/selenium';
const requestedGroups = process.argv.slice(2).map(value => value.toUpperCase());
const groups = [
  ['HT', 13],
  ['DU', 19],
  ['DT', 29]
].filter(([prefix]) => !requestedGroups.length || requestedGroups.includes(prefix));

await fs.mkdir(outputDir, { recursive: true });
const options = new firefox.Options().addArguments('-headless', '-width=1440', '-height=1000');
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();

try {
  await driver.manage().setTimeouts({ pageLoad: 45000, script: 10000 });
  for (const [prefix, count] of groups) {
    for (let index = 1; index <= count; index += 1) {
      const code = `${prefix}-${String(index).padStart(2, '0')}`;
      const target = path.join(outputDir, `${code}-bio.png`);
      try {
        await fs.access(target);
        continue;
      } catch {}
      await driver.get(`${base}?audit=${code}&tab=bio`);
      await driver.wait(until.elementLocated(By.css('#modal-wrap.open')), 15000);
      await driver.wait(until.elementIsVisible(await driver.findElement(By.id('modal'))), 15000);
      await driver.sleep(350);
      const screenshot = await driver.takeScreenshot();
      await fs.writeFile(target, screenshot, 'base64');
    }
  }

  const detailChecks = [['HT-12', 'ach'], ['DU-17', 'qte'], ['DU-18', 'ach'], ['DT-26', 'ach'], ['DT-27', 'qte']]
    .filter(([code]) => !requestedGroups.length || requestedGroups.includes(code.slice(0, 2)));
  for (const [code, tab] of detailChecks) {
    await driver.get(`${base}?audit=${code}&tab=${tab}`);
    await driver.wait(until.elementLocated(By.css('#modal-wrap.open')), 15000);
    await driver.sleep(350);
    const screenshot = await driver.takeScreenshot();
    await fs.writeFile(path.join(outputDir, `${code}-${tab}.png`), screenshot, 'base64');
  }
} finally {
  await driver.quit();
}

console.log(`Đã hoàn tất ảnh kiểm tra cho nhóm ${groups.map(group => group[0]).join(', ')} tại ${outputDir}`);
