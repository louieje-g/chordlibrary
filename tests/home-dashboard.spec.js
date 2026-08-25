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
    const setlists = Array.from({ length: 4 }, (_, index) => ({
      id: `home-setlist-${index + 1}`,
      name: `Home Setlist ${index + 1}`,
      songIds: songs.slice(0, index + 1).map(song => song.id),
      createdAt: now - ((index + 5) * day),
      updatedAt: now - (index * day)
    }));

    localStorage.setItem('chord-library-songs', JSON.stringify(songs));
    localStorage.setItem('chord-library-setlists', JSON.stringify(setlists));
    localStorage.setItem('chord-library-tour-features-seen', JSON.stringify([
      'two-column', 'accept-transposition', 'preferences', 'setlist-reorder', 'inline-edit-tools', 'library-refresh'
    ]));
  });
  await page.reload();
}

test.describe('Home recent dashboard', () => {
  test('makes recent songs and setlists prominent and understandable', async ({ page }) => {
    await seedDashboard(page);

    await expect(page.getByRole('heading', { name: 'Jump back in' })).toBeVisible();
    await expect(page.getByText('Your latest songs and setlists are ready to open.')).toBeVisible();
    await expect(page.locator('#home-songs-list .home-recent-item')).toHaveCount(3);
    await expect(page.locator('#home-setlists-list .home-recent-item')).toHaveCount(3);
    await expect(page.locator('#home-songs-list .home-item-title').first()).toHaveText('Home Song 1');
    await expect(page.locator('#home-songs-list .home-item-meta').first()).toContainText('Latest Artist');
    await expect(page.locator('#home-songs-list .home-item-updated').first()).toContainText('Updated just now');
    await expect(page.getByRole('button', { name: 'View all songs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View all setlists' })).toBeVisible();
  });

  test('opens a recent song directly', async ({ page }) => {
    await seedDashboard(page);

    await page.locator('#home-songs-list .home-recent-item').first().click();
    await expect(page.locator('#song-detail')).toBeVisible();
    await expect(page.locator('#app-title')).toContainText('Home Song 1');
  });

  test('view all setlists opens the setlist collection on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDashboard(page);

    await page.getByRole('button', { name: 'View all setlists' }).click();
    await expect(page.locator('#sidebar')).toHaveClass(/open/);
    await expect(page.locator('.tab-btn[data-tab="setlists"]')).toHaveClass(/active/);
    await expect(page.locator('#setlists-tab')).toHaveClass(/active/);
  });

  test('adapts the dashboard and persists the library panel toggle on iPad and desktop', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await seedDashboard(page);
    await page.waitForTimeout(350);

    const expandedTabletLayout = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar').getBoundingClientRect();
      const grid = document.querySelector('.home-dashboard-grid');
      const headers = [...document.querySelectorAll('.home-section-header')];
      return {
        sidebarWidth: sidebar.width,
        columnCount: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        headersSeparated: headers.every(header => {
          const heading = header.querySelector('.home-section-heading').getBoundingClientRect();
          const action = header.querySelector('.home-view-all').getBoundingClientRect();
          return heading.right <= action.left;
        })
      };
    });

    expect(expandedTabletLayout.sidebarWidth).toBe(240);
    expect(expandedTabletLayout.columnCount).toBe(1);
    expect(expandedTabletLayout.headersSeparated).toBe(true);
    await expect(page.locator('#menu-toggle')).toBeVisible();
    await expect(page.locator('#menu-toggle svg')).toHaveCount(1);
    await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'true');

    await page.click('#menu-toggle');
    await page.waitForTimeout(350);
    await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/);
    await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'false');

    const collapsedTabletLayout = await page.evaluate(() => ({
      sidebarWidth: document.getElementById('sidebar').getBoundingClientRect().width,
      columnCount: getComputedStyle(document.querySelector('.home-dashboard-grid')).gridTemplateColumns.split(' ').length,
      contentWidth: document.getElementById('content').getBoundingClientRect().width
    }));
    expect(collapsedTabletLayout.sidebarWidth).toBe(0);
    expect(collapsedTabletLayout.columnCount).toBe(2);
    expect(collapsedTabletLayout.contentWidth).toBe(820);
    expect(await page.evaluate(() => localStorage.getItem('chord-library-sidebar-collapsed'))).toBe('true');

    await page.reload();
    await page.waitForTimeout(350);
    await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/);
    await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-label', 'Show library panel');

    await page.click('#menu-toggle');
    await page.waitForTimeout(350);
    await expect(page.locator('body')).not.toHaveClass(/sidebar-collapsed/);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(350);
    const desktopLayout = await page.evaluate(() => ({
      sidebarWidth: document.getElementById('sidebar').getBoundingClientRect().width,
      columnCount: getComputedStyle(document.querySelector('.home-dashboard-grid')).gridTemplateColumns.split(' ').length,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(desktopLayout.sidebarWidth).toBe(280);
    expect(desktopLayout.columnCount).toBe(2);
    expect(desktopLayout.documentWidth).toBeLessThanOrEqual(desktopLayout.viewportWidth);
  });
});
