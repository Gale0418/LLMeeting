import assert from 'node:assert/strict';

const BACKGROUND_KEY = 'llmeeting.backgroundControls.v1';
const STARTERS = [
  ['decision', '我每週有五小時做個人專案。該先做完整功能，還是小型原型？請比較取捨、指出各自風險，並提出一週內可驗證的做法。'],
  ['writing', '我想寫一篇介紹日常小發現的短文。請提出三種不同切入角度、各自適合的讀者與一個開頭範例，並指出哪些角度可能流於老套。'],
  ['review', '我打算用一週做一個簡單的待辦工具，先加入新增、完成與刪除功能。請找出計畫中的假設與風險，區分需要先驗證的事，並提出最小測試。'],
];

/** Exercise real extension UI preferences and first-run draft examples. */
export async function verifyExperience({ panel, settings, control, eventually, uiText }) {
  const checks = [];
  const saved = await panel.evaluate(key => {
    let background;
    try { background = JSON.parse(localStorage.getItem(key) || '{}'); } catch { background = {}; }
    return {
      background: typeof background.background === 'boolean' ? background.background : true,
      motion: typeof background.motion === 'boolean' ? background.motion : true,
    };
  }, BACKGROUND_KEY);

  const setToggle = async (selector, checked) => {
    const toggle = settings.locator(selector);
    if (await toggle.isChecked() !== checked) {
      if (checked) await toggle.check();
      else await toggle.uncheck();
    }
  };
  const assertPanelPreferences = async (background, motion) => {
    await eventually(async () => {
      const state = await panel.evaluate(() => {
        const shell = document.querySelector('.shell');
        const brand = [...document.querySelectorAll('.brand-row :is(h1,.plan-badge,.version-badge)')];
        const status = document.querySelector('#statusText');
        return {
          background: shell.dataset.circuitBackground,
          motion: shell.dataset.circuitMotion,
          brandAnimations: brand.map(node => getComputedStyle(node).animationName),
          statusAnimation: getComputedStyle(status).animationName,
          hiddenBackground: getComputedStyle(document.querySelector('.circuit-backdrop')).display === 'none'
            && getComputedStyle(document.querySelector('.digital-rain')).display === 'none',
        };
      });
      assert.equal(state.background, background ? 'on' : 'off');
      assert.equal(state.motion, motion ? 'on' : 'off');
      assert.equal(state.hiddenBackground, !background);
      const names = [...state.brandAnimations, state.statusAnimation];
      if (!background || !motion) assert.ok(names.every(name => name === 'none'), `brand/status animation should stop: ${names}`);
      else assert.ok(names.every(name => name.includes('brandBreath')), `brand/status animation should resume: ${names}`);
    }, `panel circuit preference background=${background} motion=${motion}`);
  };

  try {
    await panel.bringToFront();
    await panel.emulateMedia({ reducedMotion: 'no-preference' });
    await setToggle('#circuitBackgroundToggle', true);
    await setToggle('#circuitMotionToggle', saved.motion);
    await setToggle('#circuitBackgroundToggle', false);
    await assertPanelPreferences(false, saved.motion);
    assert.equal(await settings.locator('#circuitMotionToggle').isDisabled(), true);
    await panel.reload();
    await panel.emulateMedia({ reducedMotion: 'no-preference' });
    await assertPanelPreferences(false, saved.motion);

    await setToggle('#circuitBackgroundToggle', true);
    await setToggle('#circuitMotionToggle', false);
    await assertPanelPreferences(true, false);
    await panel.reload();
    await panel.emulateMedia({ reducedMotion: 'no-preference' });
    await assertPanelPreferences(true, false);
    await setToggle('#circuitMotionToggle', true);
    await assertPanelPreferences(true, true);

    await panel.reload();
    await panel.emulateMedia({ reducedMotion: 'no-preference' });
    await assertPanelPreferences(true, true);
    checks.push({ scenario: 'options-background-motion-cross-page-sync-animation-and-reload', status: 'pass' });

    const uiLanguage = await settings.evaluate(() => chrome.i18n.getUILanguage());
    const autoLocale = /^zh(?:[-_]|$)/i.test(uiLanguage) ? 'zh-Hant-TW' : /^ja(?:[-_]|$)/i.test(uiLanguage) ? 'ja' : 'en';
    await settings.selectOption('#languageSelect', 'auto');
    await panel.waitForFunction(expected => document.documentElement.lang === expected, autoLocale);
    checks.push({ scenario: 'automatic-locale-follows-browser-language', locale: autoLocale, status: 'pass' });

    await control({ type: 'test:scenario', scenario: 'setup' });
    for (const locale of ['zh_TW', 'en', 'ja']) {
      await settings.selectOption('#languageSelect', locale);
      const documentLanguage = { zh_TW: 'zh-Hant-TW', en: 'en', ja: 'ja' }[locale];
      await panel.waitForFunction(expected => document.documentElement.lang === expected, documentLanguage);
      for (const [id, prompt] of STARTERS) {
        const question = panel.locator('#questionInput');
        await question.fill('');
        const starters = panel.locator('#starterQuestions');
        await eventually(async () => assert.equal(await starters.isVisible(), true), `starter examples visible/${locale}/${id}`);
        await starters.locator(`[data-starter="${id}"]`).click();
        assert.equal(await question.inputValue(), uiText(prompt, locale), `localized starter draft/${locale}/${id}`);
        assert.equal(await starters.isVisible(), false, `starter list hides after draft/${locale}/${id}`);
        const fixture = await control({ type: 'test:inspect' });
        assert.equal(fixture.state.busy, false, `starter must not submit/${locale}/${id}`);
        assert.equal(fixture.state.transcript, null, `starter must not create transcript/${locale}/${id}`);
        assert.deepEqual(fixture.rejectedRequests, [], `starter must not attempt unsupported backend actions/${locale}/${id}`);
        checks.push({ scenario: 'localized-starter-fills-draft-without-submitting', locale, starter: id, status: 'pass' });
      }
      await panel.locator('#questionInput').fill('');
    }
  } finally {
    // Restore the caller's visual preferences and leave locale in English as requested.
    await settings.bringToFront();
    await setToggle('#circuitBackgroundToggle', true);
    await setToggle('#circuitMotionToggle', saved.motion);
    await setToggle('#circuitBackgroundToggle', saved.background);
    await settings.selectOption('#languageSelect', 'en');
    await panel.waitForFunction(() => document.documentElement.lang === 'en');
    await panel.bringToFront();
    await assertPanelPreferences(saved.background, saved.motion);
  }

  checks.push({ scenario: 'preferences-restored-locale-english', status: 'pass' });
  return checks;
}
