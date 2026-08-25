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
    localStorage.setItem('chord-library-setlists', '[]');
    localStorage.setItem('chord-library-tour-features-seen', JSON.stringify([
      'two-column', 'accept-transposition', 'preferences', 'setlist-reorder', 'inline-edit-tools', 'library-refresh'
    ]));
  }, overrides);
  await page.reload();
  await page.click('.song-item[data-id="inline-song"]');
}

test.describe('Inline song chord editing', () => {
  test('keeps styled lyrics and chords visible while editing in light mode', async ({ page }) => {
    await seedSong(page, {
      content: '[Chorus]\nC  G\nVisible lyric'
    });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('chord-library-theme', 'light');
    });
    await page.click('#btn-inline-edit');

    const appearance = await page.evaluate(() => {
      const editor = document.getElementById('song-content');
      const highlight = document.getElementById('contenteditable-highlight');
      const chord = highlight.querySelector('.chord');
      const editorStyle = getComputedStyle(editor);
      const highlightStyle = getComputedStyle(highlight);
      const chordStyle = getComputedStyle(chord);

      const channelValues = color => (color.match(/[\d.]+/g) || []).map(Number);
      const luminance = color => {
        const [red, green, blue] = channelValues(color).slice(0, 3).map(value => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      };
      const contrast = (foreground, background) => {
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return (lighter + 0.05) / (darker + 0.05);
      };

      return {
        editorBackground: editorStyle.backgroundColor,
        editorTextFill: editorStyle.webkitTextFillColor,
        highlightText: highlight.textContent,
        highlightVisibility: highlightStyle.visibility,
        lyricContrast: contrast(highlightStyle.color, highlightStyle.backgroundColor),
        chordContrast: contrast(chordStyle.color, highlightStyle.backgroundColor)
      };
    });

    expect(appearance.editorBackground).toBe('rgba(0, 0, 0, 0)');
    expect(appearance.editorTextFill).toBe('rgba(0, 0, 0, 0)');
    expect(appearance.highlightText).toContain('Visible lyric');
    expect(appearance.highlightText).toContain('C  G');
    expect(appearance.highlightVisibility).toBe('visible');
    expect(appearance.lyricContrast).toBeGreaterThanOrEqual(4.5);
    expect(appearance.chordContrast).toBeGreaterThanOrEqual(4.5);
  });

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

    const caret = await page.evaluate(() => {
      const content = document.getElementById('song-content');
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return null;
      const activeRange = selection.getRangeAt(0);
      const precedingRange = document.createRange();
      precedingRange.selectNodeContents(content);
      precedingRange.setEnd(activeRange.startContainer, activeRange.startOffset);
      return {
        collapsed: activeRange.collapsed,
        charactersBeforeCaret: precedingRange.toString().length
      };
    });
    expect(caret).toEqual({ collapsed: true, charactersBeforeCaret: 0 });

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

  test('inserts chord characters from the inline editing toolbar', async ({ page }) => {
    await seedSong(page);
    await page.click('#btn-inline-edit');

    const charButtons = page.locator('#contenteditable-char-buttons .char-btn');
    await expect(charButtons).toHaveCount(7);
    await expect(page.locator('#contenteditable-char-buttons')).toBeVisible();

    for (const char of ['b', '#', '/', '|', '-']) {
      await page.locator(`#contenteditable-char-buttons [data-inline-char="${char}"]`).click();
    }

    await page.locator('#contenteditable-char-buttons [data-inline-pair="[]"]').click();
    await page.locator('#contenteditable-char-buttons [data-inline-pair="()"]' ).click();
    await expect(page.locator('#song-content')).toHaveText('b#/|-[()]C  G\nOriginal lyric');

    const caretPosition = await page.evaluate(() => {
      const content = document.getElementById('song-content');
      const selection = window.getSelection();
      const activeRange = selection.getRangeAt(0);
      const precedingRange = document.createRange();
      precedingRange.selectNodeContents(content);
      precedingRange.setEnd(activeRange.startContainer, activeRange.startOffset);
      return precedingRange.toString().length;
    });
    expect(caretPosition).toBe(7);

    await page.click('#btn-save-content-edit');
    const storedContent = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chord-library-songs'))[0].content
    );
    expect(storedContent).toBe('b#/|-[()]C  G\nOriginal lyric');
  });

  test('cancels inline editing before opening Edit song info', async ({ page }) => {
    await seedSong(page);
    await page.click('#btn-inline-edit');
    await expect(page.locator('#contenteditable-actions')).toBeVisible();

    await page.click('#btn-song-actions');
    await page.click('#btn-edit-song');

    await expect(page.locator('#song-modal')).toBeVisible();
    await expect(page.locator('#song-content')).not.toHaveAttribute('contenteditable', 'plaintext-only');
    await expect(page.locator('#contenteditable-actions')).toBeHidden();
    await expect(page.locator('#contenteditable-char-buttons')).toBeHidden();
    await expect(page.locator('#contenteditable-highlight')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/inline-edit-active/);
    await expect(page.locator('#song-content')).toContainText('Original lyric');
  });

  test('keeps inline editing active when discarding changes is declined', async ({ page }) => {
    await seedSong(page);
    await page.click('#btn-inline-edit');
    await page.fill('#song-content', 'Unsaved inline draft');
    page.once('dialog', dialog => dialog.dismiss());

    await page.click('#btn-song-actions');
    await page.click('#btn-edit-song');

    await expect(page.locator('#song-modal')).toBeHidden();
    await expect(page.locator('#song-content')).toHaveAttribute('contenteditable', 'plaintext-only');
    await expect(page.locator('#contenteditable-actions')).toBeVisible();
    await expect(page.locator('#contenteditable-highlight')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/inline-edit-active/);
    await expect(page.locator('#song-content')).toHaveText('Unsaved inline draft');
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

  test('keeps equal sheet padding when two-column view is enabled', async ({ page }) => {
    await seedSong(page, {
      twoColumn: true,
      content: '[Verse]\nC  G  Am  F\nLine one\nLine two\n\n[Chorus]\nF  G  C\nLine three'
    });

    const layout = await page.locator('#song-content').evaluate((content) => {
      const contentStyle = getComputedStyle(content);
      const editStyle = getComputedStyle(document.getElementById('btn-inline-edit'));
      return {
        columnCount: contentStyle.columnCount,
        paddingLeft: contentStyle.paddingLeft,
        paddingRight: contentStyle.paddingRight,
        editPosition: editStyle.position,
        editBottom: document.getElementById('btn-inline-edit').getBoundingClientRect().bottom,
        contentTop: content.getBoundingClientRect().top
      };
    });

    expect(layout.columnCount).toBe('2');
    expect(layout.paddingLeft).toBe(layout.paddingRight);
    expect(layout.editPosition).toBe('static');
    expect(layout.editBottom).toBeLessThanOrEqual(layout.contentTop);
  });

  test('accepts the displayed transposition as the new base and supports undo', async ({ page }) => {
    await seedSong(page, { transposeSteps: 2 });

    await expect(page.locator('#btn-transpose-accept')).toBeVisible();
    await expect(page.locator('#btn-transpose-accept svg')).toHaveCount(1);
    await page.click('#btn-transpose-accept');

    await expect(page.locator('#transpose-value')).toHaveText('0');
    await expect(page.locator('#btn-transpose-accept')).toBeHidden();
    await expect(page.locator('#song-content')).toContainText('D  A');
    await expect(page.locator('#key-badge')).toHaveText('Key: D');

    let storedSong = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chord-library-songs'))[0]
    );
    expect(storedSong.content).toBe('D  A\nOriginal lyric');
    expect(storedSong.transposeSteps).toBe(0);

    await page.click('#btn-undo');
    storedSong = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chord-library-songs'))[0]
    );
    expect(storedSong.content).toBe('C  G\nOriginal lyric');
    expect(storedSong.transposeSteps).toBe(2);
    await expect(page.locator('#transpose-value')).toHaveText('2');
    await expect(page.locator('#btn-transpose-accept')).toBeVisible();
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
    await page.locator('#song-content').evaluate((content) => {
      content.focus();
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.press('Enter');
    await page.keyboard.type('Added line');
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
