import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const baseUrl = 'http://localhost:5175';
  const evidenceDir = '../.sisyphus/evidence';
  const testFilesDir = 'public';

  console.log('Starting Playwright screenshot tests...');

  // Test 1: Upload test-long-content.md and verify vertical scrollbar
  console.log('\n=== Test 1: Vertical Scrollbar ===');
  await page.goto(baseUrl);
  await page.waitForLoadState('networkidle');

  // Upload file
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles(`${testFilesDir}/test-long-content.md`);
  await page.waitForTimeout(1000);

  // Check if preview area has scrollbar
  await page.screenshot({ path: `${evidenceDir}/task-1-vertical-scrollbar.png`, fullPage: false });
  console.log(`Screenshot saved: ${evidenceDir}/task-1-vertical-scrollbar.png`);

  // Test 2: Scroll and verify content
  console.log('\n=== Test 2: Scrolled Content ===');
  const previewArea = await page.locator('.prose, [class*="preview"], article').first();
  if (await previewArea.count() > 0) {
    await previewArea.evaluate((el) => el.scrollTop = el.scrollHeight / 2);
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${evidenceDir}/task-1-scrolled-content.png`, fullPage: false });
  console.log(`Screenshot saved: ${evidenceDir}/task-1-scrolled-content.png`);

  // Test 3: Horizontal scrollbar with long line file
  console.log('\n=== Test 3: Horizontal Scrollbar ===');
  await page.goto(baseUrl);
  await page.waitForLoadState('networkidle');

  await fileInput.setInputFiles(`${testFilesDir}/test-long-line.md`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${evidenceDir}/task-1-horizontal-scrollbar.png`, fullPage: false });
  console.log(`Screenshot saved: ${evidenceDir}/task-1-horizontal-scrollbar.png`);

  // Test 4: Empty state
  console.log('\n=== Test 4: Empty State ===');
  await page.goto(baseUrl);
  await page.waitForLoadState('networkidle');
  // Don't upload any file
  await page.screenshot({ path: `${evidenceDir}/task-1-empty-state.png`, fullPage: false });
  console.log(`Screenshot saved: ${evidenceDir}/task-1-empty-state.png`);

  await browser.close();
  console.log('\n=== All tests completed ===');
})();
