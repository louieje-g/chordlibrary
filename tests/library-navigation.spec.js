const { test, expect } = require('@playwright/test');

const TEST_URL = 'http://localhost:8080';

test.use({ serviceWorkers: 'block' });

async function seedLibrary(page, options = {}) {
  await page.goto(TEST_URL);
  await page.evaluate(({ emptySetlist = false }) => {
    const now = Date.now();
    const songs = [
      { id: 'nav-song-1', title: 'Alpha Song', artist: 'First Artist', content: 'C G', createdAt: now - 5000, updatedAt: now - 5000 },
      { id: 'nav-song-2', title: 'Beta Song', artist: 'Second Artist', content: 'D A', createdAt: now - 10000, updatedAt: now - 10000 },
      { id: 'nav-song-3', title: 'Gamma Song', artist: '', content: 'E B', createdAt: now - 15000, updatedAt: now - 15000 }
    ];
    const setlists = [
      {
        id: 'nav-setlist-1',
        name: 'Sunday Set',
        description: 'Main worship service',
        songIds: emptySetlist ? [] : songs.map(song => song.id),
        createdAt: now - 20000,
        updatedAt: now - 20000
      },
      {
        id: 'nav-setlist-2',
        name: 'Youth Night',
        description: 'Friday gathering',
        songIds: [],
        createdAt: now - 30000,
        updatedAt: now - 30000
      }
    ];

    localStorage.setItem('chord-library-songs', JSON.stringify(songs));
    localStorage.setItem('chord-library-setlists', JSON.stringify(setlists));
    localStorage.setItem('chord-library-tour-features-seen', JSON.stringify([
      'two-column', 'accept-transposition', 'preferences', 'setlist-reorder', 'inline-edit-tools', 'library-refresh'
    ]));
  }, options);
  await page.reload();
}

test.describe('Library drawer and setlist view', () => {
  test('migrates existing saved collections and tour progress to setlist identifiers', async ({ page }) => {
    await page.goto(TEST_URL);
    await page.evaluate(() => {
      const legacySetlists = [{
        id: 'migrated-setlist',
        name: 'Migrated Sunday Set',
        description: 'Saved before the rename',
        songIds: [],
        createdAt: 1000,
        updatedAt: 1000
      }];
      localStorage.removeItem('chord-library-setlists');
      localStorage.setItem('chord-library-playlists', JSON.stringify(legacySetlists));
      localStorage.setItem('chord-library-tour-features-seen', JSON.stringify([
        'two-column', 'accept-transposition', 'preferences', 'playlist-reorder',
        'inline-edit-tools', 'library-refresh'
      ]));
    });
    await page.reload();

    await page.click('.tab-btn[data-tab="setlists"]');
    await expect(page.locator('.setlist-item[data-id="migrated-setlist"]')).toContainText('Migrated Sunday Set');

    const migration = await page.evaluate(() => ({
      current: JSON.parse(localStorage.getItem('chord-library-setlists')),
      legacy: localStorage.getItem('chord-library-playlists'),
      seenFeatures: JSON.parse(localStorage.getItem('chord-library-tour-features-seen'))
    }));
    expect(migration.current).toHaveLength(1);
    expect(migration.current[0].id).toBe('migrated-setlist');
    expect(migration.legacy).toBeNull();
    expect(migration.seenFeatures).toContain('setlist-reorder');
    expect(migration.seenFeatures).not.toContain('playlist-reorder');
    await expect(page.locator('#tour-overlay')).toBeHidden();
  });

  test('shows collection counts, metadata, and keyboard-friendly drawer rows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedLibrary(page);
    await page.click('#menu-toggle');

    await expect(page.locator('#songs-tab-count')).toHaveText('3');
    await expect(page.locator('#song-list-summary')).toHaveText('3 songs');
    await expect(page.locator('#song-list .song-item')).toHaveCount(3);
    await expect(page.locator('#song-list .song-item').first()).toHaveAttribute('type', 'button');
    await expect(page.locator('#song-list .drawer-item-updated').first()).toContainText(/just now|min ago/);
    await expect(page.locator('#btn-add-song-sidebar svg')).toHaveCount(1);

    await page.click('.tab-btn[data-tab="setlists"]');
    await expect(page.locator('#setlists-tab-count')).toHaveText('2');
    await expect(page.locator('#setlist-list-summary')).toHaveText('2 setlists');
    await expect(page.locator('#setlist-list .setlist-item')).toHaveCount(2);
  });

  test('filters setlists by name or description', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedLibrary(page);
    await page.click('#menu-toggle');
    await page.click('.tab-btn[data-tab="setlists"]');

    await page.fill('#setlist-search-input', 'Friday');
    await expect(page.locator('#setlist-list .setlist-item')).toHaveCount(1);
    await expect(page.locator('#setlist-list .setlist-item-name')).toHaveText('Youth Night');
    await expect(page.locator('#setlist-list-summary')).toHaveText('1 result');
  });

  test('presents setlist context and accessible SVG song controls', async ({ page }) => {
    await seedLibrary(page);
    await page.click('.tab-btn[data-tab="setlists"]');
    await page.click('.setlist-item[data-id="nav-setlist-1"]');

    await expect(page.locator('#app-title')).toHaveText('Chord Library');
    await expect(page.locator('#setlist-title')).toHaveText('Sunday Set');
    await expect(page.locator('#setlist-song-count')).toHaveText('3 songs');
    await expect(page.locator('#setlist-updated')).toContainText('Updated');
    await expect(page.getByRole('button', { name: 'Edit setlist' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete setlist' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add songs' })).toBeVisible();
    await expect(page.locator('#setlist-songs .setlist-song-item')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Open Alpha Song' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drag Alpha Song to reorder' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Alpha Song from setlist' })).toBeVisible();
    await expect(page.locator('#setlist-songs .setlist-song-item svg')).toHaveCount(9);
  });

  test('uses a guided empty state for a setlist without songs', async ({ page }) => {
    await seedLibrary(page, { emptySetlist: true });
    await page.click('.tab-btn[data-tab="setlists"]');
    await page.click('.setlist-item[data-id="nav-setlist-1"]');

    await expect(page.getByText('This setlist is ready for songs')).toBeVisible();
    await expect(page.getByText('Choose Add songs to start building your set.')).toBeVisible();
    await expect(page.locator('#setlist-reorder-hint')).toBeHidden();
  });
});
