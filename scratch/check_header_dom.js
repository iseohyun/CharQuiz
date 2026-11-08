const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 914 }, // 사용자 지적 412 x 914px 해상도
    isMobile: true
  });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const headerDiagnosis = await page.evaluate(() => {
    const header = document.querySelector('header.site-header');

    return {
      viewport: `${window.innerWidth} x ${window.innerHeight}`,
      hasHeader: !!header,
      headerDisplay: header ? window.getComputedStyle(header).display : 'none',
      headerVisibility: header ? window.getComputedStyle(header).visibility : 'hidden',
      headerHeight: header ? header.offsetHeight : 0,
      headerHTML: header ? header.outerHTML : 'null'
    };
  });

  console.log('[412x914 Header Diagnosis Results 🔍]:', JSON.stringify(headerDiagnosis, null, 2));
  await browser.close();
})();
