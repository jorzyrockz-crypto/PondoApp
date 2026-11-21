// Run with NODE_PATH and CHROMIUM_PATH pointing to a Playwright/Chromium install.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

(async () => {
  const root = process.cwd();
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end();
      res.setHeader('Content-Type', ({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json'})[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const cases = [
      { width:320, height:700, touch:true }, { width:390, height:844, touch:true },
      { width:768, height:1024, touch:true }, { width:1024, height:1366, touch:true },
      { width:844, height:390, touch:true }, { width:800, height:700, touch:false },
    ];
    for (const c of cases) {
      const page = await browser.newPage({ viewport: { width:c.width, height:c.height }, hasTouch:c.touch, isMobile:c.touch });
      await page.route('https://www.gstatic.com/firebasejs/**', route => route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.locator('#authOfflineBtn').click();
      await page.waitForFunction(() => window.trackerReady);
      await page.evaluate(() => { if (typeof closePondoAbout === 'function') closePondoAbout(); });
      await page.addStyleTag({ content:'*,*::before,*::after{animation:none!important;transition:none!important}' });
      await page.waitForTimeout(250);
      const initial = await page.locator('.bottomnav').evaluate(nav => {
        const buttons = [...nav.querySelectorAll('.nav-btn')];
        return { bg:getComputedStyle(nav).backgroundColor, nav:nav.getBoundingClientRect().toJSON(),
          buttons:buttons.map(button => { const rect=button.getBoundingClientRect(), label=button.querySelector('.nav-label'), l=label.getBoundingClientRect(); return { width:rect.width,height:rect.height,left:rect.left,right:rect.right,labelLeft:l.left,labelRight:l.right,color:getComputedStyle(label).color,background:getComputedStyle(button).backgroundColor,icon:getComputedStyle(button.querySelector('svg')).stroke }; }) };
      });
      assert.equal(initial.bg, 'rgb(255, 255, 255)', JSON.stringify(c));
      assert.notEqual(initial.buttons[0].background, initial.buttons[1].background);
      assert.equal(initial.buttons[0].color, initial.buttons[0].icon);
      assert.equal(initial.buttons[1].color, 'rgb(64, 87, 121)');
      for (const b of initial.buttons) {
        assert.ok(b.width >= 44 && b.height >= 44, JSON.stringify({c,b}));
        assert.ok(b.labelLeft >= b.left-1 && b.labelRight <= b.right+1, JSON.stringify({c,b}));
      }
      assert.ok(initial.nav.bottom <= c.height + 1 && initial.nav.top > 0);
      for (const tab of ['funds','projects','contributions','dashboard']) {
        await page.locator(`.nav-btn[data-tab="${tab}"]`).click();
        assert.equal(await page.locator(`.nav-btn[data-tab="${tab}"]`).getAttribute('aria-current'), 'page');
        assert.equal(await page.locator(`#tab-${tab}`).isVisible(), true);
      }
      await page.locator('#navMore').click();
      assert.equal(await page.locator('#navMore').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#navMoreMenu').isVisible(), true);
      for (const [label,tab] of [['Transactions','transactions'],['Refund History','refunds'],['Reports','report']]) {
        if (!(await page.locator('#navMoreMenu').isVisible())) await page.locator('#navMore').click();
        await page.locator('#navMoreMenu button').filter({hasText:label}).click();
        assert.equal(await page.locator(`#tab-${tab}`).isVisible(), true);
        assert.equal(await page.locator('#navMore').evaluate(el=>el.classList.contains('active')), true);
        assert.equal(await page.locator('#navMoreMenu').isVisible(), false);
      }
      await page.locator('#navMore').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#navMoreMenu').isVisible(), false);
      assert.equal(await page.locator('#navMore').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#navMore').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('#navMore').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      await page.evaluate(() => document.body.classList.add('dark-mode'));
      assert.equal(await page.locator('.bottomnav').evaluate(el=>getComputedStyle(el).backgroundColor), 'rgb(15, 26, 48)');
      await page.waitForTimeout(250);
      const dark=await page.locator('#navMore').evaluate(el=>({background:getComputedStyle(el).backgroundColor,label:getComputedStyle(el.querySelector('.nav-label')).color,icon:getComputedStyle(el.querySelector('svg')).stroke}));
      assert.notEqual(dark.background,initial.buttons[0].background);assert.equal(dark.label,dark.icon);
      await page.close();
    }
    for (const c of [{width:1280,height:800,touch:false},{width:1180,height:820,touch:true}]) {
      const page = await browser.newPage({viewport:{width:c.width,height:c.height},hasTouch:c.touch,isMobile:c.touch});
      await page.route('https://www.gstatic.com/firebasejs/**', route=>route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.locator('#authOfflineBtn').click(); await page.waitForFunction(()=>window.trackerReady);
      await page.waitForTimeout(250);
      const desktop = await page.locator('.bottomnav').evaluate(el=>({box:el.getBoundingClientRect().toJSON(),bg:getComputedStyle(el.querySelector('.nav-btn.active')).backgroundColor,icon:getComputedStyle(el.querySelector('.nav-btn.active svg')).stroke}));
      assert.ok(desktop.box.width < c.width / 2 && desktop.box.height > 400, JSON.stringify(desktop));
      assert.notEqual(desktop.bg,'rgba(0, 0, 0, 0)');
      assert.equal(desktop.icon,await page.locator('.nav-btn.active .nav-label').evaluate(el=>getComputedStyle(el).color));
      await page.close();
    }
    console.log('Light bottom navigation, navigation actions, focus, dark mode, and desktop sidebar passed.');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(err=>{ console.error(err); process.exitCode=1; });
