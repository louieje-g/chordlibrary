const { test, expect } = require('@playwright/test');

const TEST_URL = 'http://localhost:8080';

test.use({ serviceWorkers: 'block' });

async function seedModalData(page) {
  await page.goto(TEST_URL);
  await page.evaluate(() => {
    const now = Date.now();
    localStorage.setItem('chord-library-songs', JSON.stringify([
      {
        id: 'modal-song',
        title: 'Modal Song',
        artist: 'Test Artist',
        content: '[Chorus]\nC-G-Am-F-',
        createdAt: now,
        updatedAt: now
      }
    ]));
    localStorage.setItem('chord-library-setlists', JSON.stringify([
      {
        id: 'modal-setlist',
        name: 'Sunday Set',
        description: 'Morning service',
        songIds: ['modal-song'],
        createdAt: now,
        updatedAt: now
      }
    ]));
    localStorage.setItem('chord-library-tour-features-seen', JSON.stringify([
      'two-column', 'accept-transposition', 'preferences', 'setlist-reorder', 'inline-edit-tools', 'library-refresh'
    ]));
  });
  await page.reload();
}

test.describe('Enhanced modal experiences', () => {
  test('presents a clear mobile create-setlist form', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedModalData(page);
    await page.click('#menu-toggle');
    await page.click('.tab-btn[data-tab="setlists"]');
    await page.click('#btn-add-setlist');
    await page.waitForTimeout(350);

    const dialog = page.getByRole('dialog', { name: 'Create setlist' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#setlist-modal-subtitle')).toContainText('Build a setlist');
    await expect(page.locator('#setlist-name-input')).toHaveAttribute('placeholder', 'Sunday Worship');
    await expect(page.locator('#setlist-description-input')).toHaveAttribute('placeholder', /service, team, or occasion/);
    await expect(page.locator('#btn-save-setlist-label')).toHaveText('Create setlist');
    await expect(page.locator('#btn-close-setlist svg')).toHaveCount(1);
    await expect(page.locator('.setlist-modal-content > .modal-panel-header .modal-panel-icon svg')).toHaveCount(1);

    const layout = await page.evaluate(() => {
      const panel = document.querySelector('.setlist-modal-content').getBoundingClientRect();
      const actions = document.querySelector('.setlist-modal-content .modal-panel-actions').getBoundingClientRect();
      return {
        panelBottom: panel.bottom,
        actionsBottom: actions.bottom,
        viewportHeight: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth
      };
    });
    expect(layout.panelBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.actionsBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);

    await page.click('#btn-close-setlist');
    await expect(dialog).toBeHidden();
  });

  test('uses edit-specific setlist copy and keeps the app name in the top bar', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await seedModalData(page);
    await page.click('.tab-btn[data-tab="setlists"]');
    await page.click('.setlist-item[data-id="modal-setlist"]');

    await expect(page.locator('#app-title')).toHaveText('Chord Library');
    await expect(page.locator('#setlist-title')).toHaveText('Sunday Set');
    await page.click('#btn-edit-setlist');
    await expect(page.getByRole('dialog', { name: 'Edit setlist' })).toBeVisible();
    await expect(page.locator('#setlist-modal-subtitle')).toContainText('Update this setlist');
    await expect(page.locator('#btn-save-setlist-label')).toHaveText('Save changes');
    await expect(page.locator('#setlist-name-input')).toHaveValue('Sunday Set');
    await expect(page.locator('#setlist-description-input')).toHaveValue('Morning service');
  });

  test('uses accessible SVG preference choices with clear selected states', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedModalData(page);
    await page.click('#user-btn');
    await page.click('#btn-preferences');

    const dialog = page.getByRole('dialog', { name: 'Preferences' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.preferences-modal-content .modal-panel-icon svg')).toHaveCount(1);
    await expect(page.locator('#pref-theme-dark svg')).toHaveCount(1);
    await expect(page.locator('#pref-theme-light svg')).toHaveCount(1);
    await expect(page.locator('#pref-theme-dark')).toHaveAttribute('aria-pressed', 'true');

    await page.click('#pref-theme-light');
    await expect(page.locator('#pref-theme-light')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#pref-theme-dark')).toHaveAttribute('aria-pressed', 'false');
    await page.click('#pref-notation-flat');
    await expect(page.locator('#pref-notation-flat')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#btn-close-preferences-x svg')).toHaveCount(1);
    await page.click('#btn-close-preferences-x');
    await expect(dialog).toBeHidden();
  });

  test('provides a guided, SVG-only QR scanner interface', async ({ page }) => {
    await page.addInitScript(() => {
      window.BarcodeDetector = class {
        constructor() {}
        async detect() { return []; }
      };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => new MediaStream()
        }
      });
      HTMLMediaElement.prototype.play = async function() {};
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await seedModalData(page);
    await page.click('#btn-add-song');
    await page.click('#btn-scan-qr');

    const scanner = page.getByRole('dialog', { name: 'Scan song QR' });
    await expect(scanner).toBeVisible();
    await expect(page.locator('#qr-scanner-status-text')).toHaveText('Camera ready');
    await expect(page.locator('#btn-close-scanner svg')).toHaveCount(1);
    await expect(page.locator('#btn-scan-qr-image svg')).toHaveCount(1);
    await expect(page.locator('#btn-stop-scan-qr svg')).toHaveCount(1);

    const frame = await page.locator('.qr-scanner-viewfinder').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    expect(Math.abs(frame.width - frame.height)).toBeLessThanOrEqual(1);
    expect(frame.width).toBeLessThan(frame.viewportWidth);
    expect(frame.height).toBeLessThan(frame.viewportHeight);

    await page.keyboard.press('Escape');
    await expect(scanner).toBeHidden();
  });

  test('shows generated QR context and instructions in a contained popup', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedModalData(page);
    await page.locator('#home-songs-list .home-recent-item').first().click();
    await page.click('#btn-song-actions');
    await page.click('#btn-share-song');

    const dialog = page.getByRole('dialog', { name: 'Share song via QR' });
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(350);
    await expect(page.locator('#share-qr-song-name')).toHaveText('Modal Song — Test Artist');
    await expect(page.locator('#share-qr-canvas')).toHaveAttribute('aria-label', 'Generated QR code for Modal Song');
    await expect(page.locator('.share-qr-help')).toContainText('open Add Song and choose QR code');
    await expect(page.locator('.share-qr-content .modal-panel-icon svg')).toHaveCount(1);
    await expect(page.locator('#btn-close-share-qr-x svg')).toHaveCount(1);

    const layout = await page.evaluate(() => {
      const panel = document.querySelector('.share-qr-content').getBoundingClientRect();
      const canvas = document.getElementById('share-qr-canvas').getBoundingClientRect();
      return {
        panelBottom: panel.bottom,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        viewportHeight: innerHeight
      };
    });
    expect(layout.panelBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.canvasWidth).toBe(layout.canvasHeight);
    await page.click('#btn-close-share-qr');
    await expect(dialog).toBeHidden();
  });
});
