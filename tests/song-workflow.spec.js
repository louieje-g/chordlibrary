const { test, expect } = require('@playwright/test');

const TEST_URL = 'http://localhost:8080';

test.use({ serviceWorkers: 'block' });

async function seedSong(page, overrides = {}) {
  await page.goto(TEST_URL);
  await page.evaluate((songOverrides) => {
    localStorage.setItem('chord-library-songs', JSON.stringify([{
      id: 'viewer-song',
      title: 'Viewer Song',
      artist: 'Test Artist',
      content: '[Verse]\nC  G\nOriginal lyric',
      transposeSteps: 0,
      twoColumn: false,
      createdAt: Date.now() - 60000,
      updatedAt: Date.now() - 60000,
      ...songOverrides
    }]));
    localStorage.setItem('chord-library-playlists', '[]');
    localStorage.setItem('chord-library-tour-features-seen', JSON.stringify([
      'two-column', 'accept-transposition', 'preferences', 'playlist-reorder', 'inline-edit-tools', 'library-refresh'
    ]));
  }, overrides);
  await page.reload();
  await page.click('.home-recent-item[data-home-type="song"][data-id="viewer-song"]');
}

test.describe('Song viewing and song form workflow', () => {
  test('keeps viewer controls compact while preserving essential song context', async ({ page }) => {
    await page.setViewportSize({ width: 366, height: 658 });
    await seedSong(page);

    await expect(page.locator('#app-title')).toHaveText('Viewer Song — Test Artist');
    await expect(page.locator('.song-viewer-overview')).toHaveCount(0);
    await expect(page.locator('.song-content-meta')).toContainText('Chord sheet');
    await expect(page.locator('.song-content-meta')).toContainText('Key: C');
    await expect(page.locator('.song-toolbar')).toHaveAttribute('aria-label', 'Song display controls');
    expect(await page.locator('#font-size-select option').allTextContents()).toEqual([
      '10', '12', '14', '16', '18', '20', '22', '24'
    ]);
    await expect(page.locator('#btn-song-actions svg')).toHaveCount(1);
    await expect(page.locator('#btn-transpose-reset svg')).toHaveCount(1);

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      actionSize: document.getElementById('btn-song-actions').getBoundingClientRect().width,
      resetSize: document.getElementById('btn-transpose-reset').getBoundingClientRect().width,
      toolbarHeight: document.querySelector('.song-toolbar').getBoundingClientRect().height,
      sheetTop: document.getElementById('song-content').getBoundingClientRect().top,
      toolbarDisplay: getComputedStyle(document.querySelector('.song-toolbar')).display
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.actionSize).toBeGreaterThanOrEqual(32);
    expect(layout.resetSize).toBeGreaterThanOrEqual(32);
    expect(layout.toolbarHeight).toBeLessThanOrEqual(44);
    expect(layout.sheetTop).toBeLessThan(170);
    expect(layout.toolbarDisplay).toBe('flex');
  });

  test('scrolls only the chord sheet while keeping viewer controls visible', async ({ page }) => {
    await page.setViewportSize({ width: 366, height: 658 });
    const longChordSheet = Array.from({ length: 70 }, (_, index) =>
      `[VERSE ${index + 1}]\nC-G-Am-F-\nLine ${index + 1}`
    ).join('\n\n');
    await seedSong(page, { content: longChordSheet });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    const scrollTopButton = page.locator('#btn-sheet-scroll-top');
    await expect(scrollTopButton).toBeHidden();
    await expect(scrollTopButton.locator('svg')).toHaveCount(1);

    const toolbarTopBefore = await page.locator('.song-toolbar').evaluate((element) => element.getBoundingClientRect().top);
    await page.locator('#song-content-section').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(scrollTopButton).toBeVisible();
    await page.waitForTimeout(300);

    const layout = await page.evaluate(() => {
      const pageContent = document.getElementById('content');
      const sheet = document.getElementById('song-content-section');
      const toolbarRect = document.querySelector('.song-toolbar').getBoundingClientRect();
      const scrollTopRect = document.getElementById('btn-sheet-scroll-top').getBoundingClientRect();
      const homeRect = document.getElementById('btn-home').getBoundingClientRect();
      return {
        pageScrollTop: pageContent.scrollTop,
        pageOverflow: getComputedStyle(pageContent).overflow,
        sheetScrollTop: sheet.scrollTop,
        sheetScrollHeight: sheet.scrollHeight,
        sheetClientHeight: sheet.clientHeight,
        toolbarTop: toolbarRect.top,
        toolbarBottom: toolbarRect.bottom,
        scrollTopButtonSize: scrollTopRect.width,
        scrollTopButtonBottom: scrollTopRect.bottom,
        homeButtonTop: homeRect.top,
        viewportHeight: window.innerHeight
      };
    });

    expect(layout.pageScrollTop).toBe(0);
    expect(layout.pageOverflow).toBe('hidden');
    expect(layout.sheetScrollHeight).toBeGreaterThan(layout.sheetClientHeight);
    expect(layout.sheetScrollTop).toBeGreaterThan(0);
    expect(Math.abs(layout.toolbarTop - toolbarTopBefore)).toBeLessThanOrEqual(1);
    expect(layout.toolbarBottom).toBeLessThan(layout.viewportHeight);
    expect(layout.scrollTopButtonSize).toBe(44);
    expect(layout.scrollTopButtonBottom).toBeLessThan(layout.homeButtonTop);

    await scrollTopButton.click();
    await expect.poll(() => page.locator('#song-content-section').evaluate((element) => element.scrollTop)).toBe(0);
    await expect(scrollTopButton).toBeHidden();
  });

  test('presents add-song import as an alternate path and keeps actions visible', async ({ page }) => {
    await page.setViewportSize({ width: 366, height: 658 });
    await seedSong(page);
    await page.click('#btn-add-song');
    await page.waitForTimeout(350);

    await expect(page.getByRole('dialog', { name: 'Add a song' })).toBeVisible();
    await expect(page.locator('#song-import-panel')).toBeVisible();
    await expect(page.locator('#song-content-field')).toBeVisible();
    await expect(page.locator('label[for="song-content-input"]')).toContainText('Chord sheet');
    await expect(page.locator('#song-content-help')).toHaveCount(0);
    await expect(page.locator('#song-title-input')).toHaveAttribute('placeholder', 'YAWEH');
    await expect(page.locator('#song-artist-input')).toHaveAttribute('placeholder', 'Harana Band');
    await expect(page.locator('#song-content-input')).toHaveAttribute(
      'placeholder',
      '[INTRO]\nEm-Bm-C-G-\nEm-Bm-C|(Am-Bm-C)-(Bm-C-D)\n\nVERSE\n...'
    );
    await expect(page.locator('#btn-import-song svg')).toHaveCount(1);
    await expect(page.locator('#btn-scan-qr svg')).toHaveCount(1);
    await expect(page.locator('#btn-close-song-modal svg')).toHaveCount(1);
    await expect(page.locator('#btn-save-song svg')).toHaveCount(1);
    await expect(page.locator('#song-content-field .char-btn')).toHaveCount(7);

    await page.fill('#song-content-input', 'C');
    await page.locator('#song-content-input').evaluate((element) => element.setSelectionRange(1, 1));
    await page.locator('#song-content-field [data-pair="[]"]').click();
    await expect(page.locator('#song-content-input')).toHaveValue('C[]');
    await expect(page.locator('#song-content-input')).toHaveJSProperty('selectionStart', 2);
    await page.locator('#song-content-field [data-pair="()"]' ).click();
    await expect(page.locator('#song-content-input')).toHaveValue('C[()]');
    await expect(page.locator('#song-content-input')).toHaveJSProperty('selectionStart', 3);

    const modalLayout = await page.evaluate(() => {
      const footer = document.querySelector('.song-modal-actions');
      const footerRect = footer.getBoundingClientRect();
      const iconRect = document.querySelector('.song-import-icon').getBoundingClientRect();
      const svgRect = document.querySelector('.song-import-icon svg').getBoundingClientRect();
      return {
        footerBottom: footerRect.bottom,
        footerPosition: getComputedStyle(footer).position,
        viewportHeight: window.innerHeight,
        iconCenterDeltaX: Math.abs((iconRect.left + iconRect.width / 2) - (svgRect.left + svgRect.width / 2)),
        iconCenterDeltaY: Math.abs((iconRect.top + iconRect.height / 2) - (svgRect.top + svgRect.height / 2))
      };
    });
    expect(modalLayout.footerPosition).toBe('sticky');
    expect(modalLayout.footerBottom).toBeLessThanOrEqual(modalLayout.viewportHeight + 1);
    expect(modalLayout.iconCenterDeltaX).toBeLessThanOrEqual(1);
    expect(modalLayout.iconCenterDeltaY).toBeLessThanOrEqual(1);

    await page.fill('#song-title-input', 'New Song');
    await expect(page.locator('#song-title-input')).toHaveValue('NEW SONG');
    await page.fill('#song-artist-input', 'New Artist');
    await page.fill('#song-content-input', '[Chorus]\nD  A\nNew lyric');
    await page.click('#btn-save-song');
    await expect(page.locator('#app-title')).toContainText('NEW SONG');
    await expect(page.locator('#song-content')).toContainText('New lyric');
  });

  test('edits only song metadata and preserves the chord sheet', async ({ page }) => {
    await seedSong(page);
    await page.click('#btn-song-actions');
    await page.click('#btn-edit-song');

    await expect(page.getByRole('dialog', { name: 'Edit song info' })).toBeVisible();
    await expect(page.locator('#song-import-panel')).toBeHidden();
    await expect(page.locator('#song-content-field')).toBeHidden();
    await expect(page.locator('#edit-song-info-note')).toBeVisible();
    await expect(page.locator('#song-content-input')).toBeDisabled();

    await page.fill('#song-title-input', 'Renamed Song');
    await page.fill('#song-artist-input', 'Updated Artist');
    await page.click('#btn-save-song');

    await expect(page.locator('#app-title')).toHaveText('RENAMED SONG — Updated Artist');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('chord-library-songs'))[0]);
    expect(stored.content).toBe('[Verse]\nC  G\nOriginal lyric');
  });
});
