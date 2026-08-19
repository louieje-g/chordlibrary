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
      'two-column', 'preferences', 'key-capo', 'playlist-reorder', 'qr-sharing'
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
    await expect(page.locator('#inline-song-editor')).toBeVisible();
    await expect(page.locator('#song-content')).toBeHidden();
    await expect(page.locator('.inline-editor-header strong')).toHaveText('Editing chords');
    expect(await page.locator('#inline-song-highlight .chord').allTextContents()).toEqual(['C', 'G']);

    const layout = await page.evaluate(() => {
      const section = document.getElementById('song-content-section');
      const textarea = document.getElementById('inline-song-content');
      const fab = document.getElementById('btn-add-song');
      const rect = section.getBoundingClientRect();
      return {
        bottomGap: window.innerHeight - rect.bottom,
        textareaHeight: textarea.getBoundingClientRect().height,
        editorZIndex: Number(getComputedStyle(section).zIndex),
        fabZIndex: Number(getComputedStyle(fab).zIndex)
      };
    });
    expect(layout.bottomGap).toBeLessThanOrEqual(16);
    expect(layout.textareaHeight).toBeGreaterThan(300);
    expect(layout.editorZIndex).toBeGreaterThan(layout.fabZIndex);

    await page.fill('#inline-song-content', '[Chorus]\nD  A\nUpdated lyric');
    await expect(page.locator('#inline-song-highlight .bracket-command')).toHaveText('[Chorus]');
    expect(await page.locator('#inline-song-highlight .chord').allTextContents()).toEqual(['D', 'A']);
    await page.click('#btn-save-inline-edit');

    await expect(page.locator('#inline-song-editor')).toBeHidden();
    await expect(page.locator('#song-content')).toContainText('Updated lyric');
    const storedContent = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chord-library-songs'))[0].content
    );
    expect(storedContent).toBe('[Chorus]\nD  A\nUpdated lyric');
  });

  test('edits original chords when the viewer is transposed', async ({ page }) => {
    await seedSong(page, { transposeSteps: 2 });

    await expect(page.locator('#song-content')).toContainText('D');
    await page.click('#btn-inline-edit');

    await expect(page.locator('#inline-editor-note')).toBeVisible();
    await expect(page.locator('#inline-song-content')).toHaveValue('C  G\nOriginal lyric');
  });

  test('cancel keeps the stored song unchanged', async ({ page }) => {
    await seedSong(page);
    await page.click('#btn-inline-edit');
    await page.fill('#inline-song-content', 'Temporary content');
    page.once('dialog', dialog => dialog.accept());
    await page.click('#btn-cancel-inline-edit');

    await expect(page.locator('#song-content')).toContainText('Original lyric');
    const storedContent = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chord-library-songs'))[0].content
    );
    expect(storedContent).toBe('C  G\nOriginal lyric');
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
