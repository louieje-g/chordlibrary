const { test, expect } = require('@playwright/test');

const TEST_URL = 'http://localhost:8080';

test.use({ serviceWorkers: 'block' });

async function seedLibrary(page, options = {}) {
  await page.goto(TEST_URL);
  await page.evaluate(({ emptyPlaylist = false }) => {
    const now = Date.now();
    const songs = [
      { id: 'nav-song-1', title: 'Alpha Song', artist: 'First Artist', content: 'C G', createdAt: now - 5000, updatedAt: now - 5000 },
      { id: 'nav-song-2', title: 'Beta Song', artist: 'Second Artist', content: 'D A', createdAt: now - 10000, updatedAt: now - 10000 },
      { id: 'nav-song-3', title: 'Gamma Song', artist: '', content: 'E B', createdAt: now - 15000, updatedAt: now - 15000 }
    ];
    const playlists = [
      {
        id: 'nav-playlist-1',
        name: 'Sunday Set',
        description: 'Main worship service',
        songIds: emptyPlaylist ? [] : songs.map(song => song.id),
        createdAt: now - 20000,
        updatedAt: now - 20000
      },
      {
        id: 'nav-playlist-2',
        name: 'Youth Night',
        description: 'Friday gathering',
        songIds: [],
        createdAt: now - 30000,
        updatedAt: now - 30000
      }
    ];

    localStorage.setItem('chord-library-songs', JSON.stringify(songs));
    localStorage.setItem('chord-library-playlists', JSON.stringify(playlists));
    localStorage.setItem('chord-library-tour-features-seen', JSON.stringify([
      'two-column', 'preferences', 'playlist-reorder', 'qr-sharing', 'library-refresh'
    ]));
  }, options);
  await page.reload();
}

test.describe('Library drawer and playlist view', () => {
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

    await page.click('.tab-btn[data-tab="playlists"]');
    await expect(page.locator('#playlists-tab-count')).toHaveText('2');
    await expect(page.locator('#playlist-list-summary')).toHaveText('2 playlists');
    await expect(page.locator('#playlist-list .playlist-item')).toHaveCount(2);
  });

  test('filters playlists by name or description', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedLibrary(page);
    await page.click('#menu-toggle');
    await page.click('.tab-btn[data-tab="playlists"]');

    await page.fill('#playlist-search-input', 'Friday');
    await expect(page.locator('#playlist-list .playlist-item')).toHaveCount(1);
    await expect(page.locator('#playlist-list .playlist-item-name')).toHaveText('Youth Night');
    await expect(page.locator('#playlist-list-summary')).toHaveText('1 result');
  });

  test('presents playlist context and accessible SVG song controls', async ({ page }) => {
    await seedLibrary(page);
    await page.click('.tab-btn[data-tab="playlists"]');
    await page.click('.playlist-item[data-id="nav-playlist-1"]');

    await expect(page.locator('#app-title')).toHaveText('Sunday Set');
    await expect(page.locator('#playlist-title')).toHaveText('Sunday Set');
    await expect(page.locator('#playlist-song-count')).toHaveText('3 songs');
    await expect(page.locator('#playlist-updated')).toContainText('Updated');
    await expect(page.getByRole('button', { name: 'Edit playlist' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete playlist' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add songs' })).toBeVisible();
    await expect(page.locator('#playlist-songs .playlist-song-item')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Open Alpha Song' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drag Alpha Song to reorder' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Alpha Song from playlist' })).toBeVisible();
    await expect(page.locator('#playlist-songs .playlist-song-item svg')).toHaveCount(9);
  });

  test('uses a guided empty state for a playlist without songs', async ({ page }) => {
    await seedLibrary(page, { emptyPlaylist: true });
    await page.click('.tab-btn[data-tab="playlists"]');
    await page.click('.playlist-item[data-id="nav-playlist-1"]');

    await expect(page.getByText('This playlist is ready for songs')).toBeVisible();
    await expect(page.getByText('Choose Add songs to start building your set.')).toBeVisible();
    await expect(page.locator('#playlist-reorder-hint')).toBeHidden();
  });
});
