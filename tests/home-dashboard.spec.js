const { test, expect } = require('@playwright/test');

const TEST_URL = 'http://localhost:8080';

test.use({ serviceWorkers: 'block' });

async function seedDashboard(page) {
  await page.goto(TEST_URL);
  await page.evaluate(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const songs = Array.from({ length: 5 }, (_, index) => ({
      id: `home-song-${index + 1}`,
      title: `Home Song ${index + 1}`,
      artist: index === 0 ? 'Latest Artist' : `Artist ${index + 1}`,
      content: 'C  G\nTest lyric',
      transposeSteps: 0,
      twoColumn: false,
      createdAt: now - ((index + 5) * day),
      updatedAt: now - (index * day)
    }));
    const playlists = Array.from({ length: 4 }, (_, index) => ({
      id: `home-playlist-${index + 1}`,
      name: `Home Playlist ${index + 1}`,
      songIds: songs.slice(0, index + 1).map(song => song.id),
      createdAt: now - ((index + 5) * day),
      updatedAt: now - (index * day)
    }));

    localStorage.setItem('chord-library-songs', JSON.stringify(songs));
    localStorage.setItem('chord-library-playlists', JSON.stringify(playlists));
    localStorage.setItem('chord-library-tour-features-seen', JSON.stringify([
      'two-column', 'preferences', 'key-capo', 'playlist-reorder', 'qr-sharing', 'library-refresh'
    ]));
  });
  await page.reload();
}

test.describe('Home recent dashboard', () => {
  test('makes recent songs and playlists prominent and understandable', async ({ page }) => {
    await seedDashboard(page);

    await expect(page.getByRole('heading', { name: 'Jump back in' })).toBeVisible();
    await expect(page.getByText('Your latest songs and playlists are ready to open.')).toBeVisible();
    await expect(page.locator('#home-songs-list .home-recent-item')).toHaveCount(3);
    await expect(page.locator('#home-playlists-list .home-recent-item')).toHaveCount(3);
    await expect(page.locator('#home-songs-list .home-item-title').first()).toHaveText('Home Song 1');
    await expect(page.locator('#home-songs-list .home-item-meta').first()).toContainText('Latest Artist');
    await expect(page.locator('#home-songs-list .home-item-updated').first()).toContainText('Updated just now');
    await expect(page.getByRole('button', { name: 'View all songs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View all playlists' })).toBeVisible();
  });

  test('opens a recent song directly', async ({ page }) => {
    await seedDashboard(page);

    await page.locator('#home-songs-list .home-recent-item').first().click();
    await expect(page.locator('#song-detail')).toBeVisible();
    await expect(page.locator('#app-title')).toContainText('Home Song 1');
  });

  test('view all playlists opens the playlist collection on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDashboard(page);

    await page.getByRole('button', { name: 'View all playlists' }).click();
    await expect(page.locator('#sidebar')).toHaveClass(/open/);
    await expect(page.locator('.tab-btn[data-tab="playlists"]')).toHaveClass(/active/);
    await expect(page.locator('#playlists-tab')).toHaveClass(/active/);
  });
});
