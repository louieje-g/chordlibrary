const { test, expect } = require('@playwright/test');

const TEST_URL = 'http://localhost:8080';

async function seedSong(page, overrides = {}) {
  await page.goto(TEST_URL);
  await page.evaluate((songOverrides) => {
    const song = {
      id: 'inline-song',
      title: 'Inline Song',
      artist: 'Test Artist',
      content: 'C  G\nOriginal lyric',
      transposeSteps: 0,
      twoColumn: false,
      createdAt: 1000,
      updatedAt: 1000,
      ...songOverrides
    };
    localStorage.setItem('chord-library-songs', JSON.stringify([song]));
    localStorage.setItem('chord-library-playlists', '[]');
    localStorage.setItem('chord-library-tour-features-seen', JSON.stringify([
      'two-column', 'preferences', 'playlist-reorder', 'qr-sharing', 'library-refresh'
    ]));
  }, overrides);
  await page.reload();
  await page.click('.song-item[data-id="inline-song"]');
}

test.describe('Inline song chord editing', () => {
  test('opens from an SVG pencil and saves content in place', async ({ page }) => {
    await seedSong(page);

    await expect(page.locator('#btn-inline-edit svg')).toHaveCount(1);
    await page.click('#btn-inline-edit');
    await expect(page.locator('#inline-song-editor')).toBeHidden();
    await expect(page.locator('#song-content')).toBeVisible();
    await expect(page.locator('#song-content')).toHaveAttribute('contenteditable', 'plaintext-only');
    await expect(page.locator('#contenteditable-actions')).toBeVisible();
    await expect(page.locator('#contenteditable-highlight')).toBeVisible();
    expect(await page.locator('#contenteditable-highlight .chord').allTextContents()).toEqual(['C', 'G']);

    const layout = await page.evaluate(() => {
      const content = document.getElementById('song-content');
      const highlight = document.getElementById('contenteditable-highlight');
      const actions = document.getElementById('contenteditable-actions');
      const contentRect = content.getBoundingClientRect();
      const highlightRect = highlight.getBoundingClientRect();
      const contentStyle = getComputedStyle(content);
      const highlightStyle = getComputedStyle(highlight);
      return {
        contentHeight: contentRect.height,
        actionsVisible: getComputedStyle(actions).display !== 'none',
        editModeActive: document.body.classList.contains('inline-edit-active'),
        layersAligned:
          contentRect.left === highlightRect.left &&
          contentRect.top === highlightRect.top &&
          contentRect.width === highlightRect.width &&
          contentRect.height === highlightRect.height &&
          contentStyle.padding === highlightStyle.padding &&
          contentStyle.font === highlightStyle.font &&
          contentStyle.lineHeight === highlightStyle.lineHeight
      };
    });
    expect(layout.contentHeight).toBeGreaterThan(300);
    expect(layout.actionsVisible).toBe(true);
    expect(layout.editModeActive).toBe(true);
    expect(layout.layersAligned).toBe(true);

    await page.fill('#song-content', '[Chorus]\nD  A\nUpdated lyric');
    await expect(page.locator('#contenteditable-highlight .bracket-command')).toHaveText('[Chorus]');
    expect(await page.locator('#contenteditable-highlight .chord').allTextContents()).toEqual(['D', 'A']);
    await page.click('#btn-save-content-edit');

    await expect(page.locator('#song-content')).not.toHaveAttribute('contenteditable', 'plaintext-only');
    await expect(page.locator('#contenteditable-highlight')).toBeHidden();
    await expect(page.locator('#song-content')).toContainText('Updated lyric');
    const storedContent = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chord-library-songs'))[0].content
    );
    expect(storedContent).toBe('[Chorus]\nD  A\nUpdated lyric');
  });

  test('edits original chords when the viewer is transposed', async ({ page }) => {
    await seedSong(page, { transposeSteps: 2 });

    await expect(page.locator('#song-content')).toContainText('D');
    await expect(page.locator('#key-badge')).toHaveText('Key: D');
    await expect(page.locator('#capo-badge')).toHaveCount(0);
    await page.click('#btn-inline-edit');

    await expect(page.locator('#song-content')).toHaveText('C  G\nOriginal lyric');
    await expect(page.locator('#song-content')).toHaveAttribute('aria-label', 'Editing original lyrics and chords');
  });

  test('cancel keeps the stored song unchanged', async ({ page }) => {
    await seedSong(page);
    await page.click('#btn-inline-edit');
    await page.fill('#song-content', 'Temporary content');
    page.once('dialog', dialog => dialog.accept());
    await page.click('#btn-cancel-content-edit');

    await expect(page.locator('#song-content')).toContainText('Original lyric');
    const storedContent = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chord-library-songs'))[0].content
    );
    expect(storedContent).toBe('C  G\nOriginal lyric');
  });

  test('preserves a new line entered with the keyboard', async ({ page }) => {
    await seedSong(page);
    await page.click('#btn-inline-edit');
    await page.locator('#song-content').press('Control+End');
    await page.locator('#song-content').press('Enter');
    await page.locator('#song-content').pressSequentially('Added line');
    await page.click('#btn-save-content-edit');

    const storedContent = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chord-library-songs'))[0].content
    );
    expect(storedContent).toBe('C  G\nOriginal lyric\nAdded line');
  });

  test('styles bracketed section labels without mistaking them for chords', async ({ page }) => {
    await seedSong(page, {
      content: '[Intro]\n[Chorus]\n[Bridge]\n[C]\nC  G'
    });

    const commands = await page.locator('#song-content .bracket-command').allTextContents();
    expect(commands).toEqual(['[Intro]', '[Chorus]', '[Bridge]']);
    await expect(page.locator('#song-content')).toContainText('[C]');
    expect(await page.locator('#song-content .chord').allTextContents()).toEqual(['C', 'C', 'G']);
  });
});
