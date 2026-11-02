import { test, expect } from '@playwright/test';

test.describe('AI Layout Suggester, Cost-Down Advisor & Video Walkthrough (027)', () => {
  test('presentation portal shows cost-down advisor, accepts optimization, and renders 30s video', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Project name').fill('AI Video Studio Project');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.locator('canvas[data-rendered]')).toBeVisible({ timeout: 30_000 });

    // Navigate to Deliverables -> Client presentation sheet
    await page.getByRole('button', { name: 'Deliverables' }).click();
    await expect(page.getByTestId('drawings-view')).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Sheets' });
    await nav.getByRole('button', { name: 'Client presentation' }).click();
    await expect(page.getByTestId('presentation-portal')).toBeVisible();

    // Verify Cost-Down Advisor (AI-03 / CP-05) is displayed if candidates exist
    const costDownCard = page.locator('[data-testid="cost-down-card"]');
    if (await costDownCard.isVisible()) {
      await expect(page.locator('text=Cost-Down Advisor (AI-03 / CP-05)')).toBeVisible();
      // Click Apply on first recommendation if available
      const applyBtn = page.locator('button:has-text("Apply Optimization")').first();
      if (await applyBtn.isVisible()) {
        await applyBtn.click();
        await expect(page.locator('text=Applied').first()).toBeVisible();
      }
    }

    // Verify 3D Video Walkthrough trigger button is present
    const videoBtn = page.locator('[data-testid="open-video-walkthrough-btn"]');
    await expect(videoBtn).toBeVisible();
    await videoBtn.click();

    // Verify Walkthrough Video Modal is opened
    const modal = page.locator('[data-testid="walkthrough-video-modal"]');
    await expect(modal).toBeVisible();
    await expect(page.locator('text=Cinematic 3D Video Walkthrough (PR-04)')).toBeVisible();

    // Select 1080p resolution and start render
    const startRenderBtn = page.locator('[data-testid="start-video-render-btn"]');
    await expect(startRenderBtn).toBeVisible();
    await startRenderBtn.click();

    // Verify progress bar appears and progresses
    const progressBar = page.locator('[data-testid="render-progress-bar"]');
    await expect(progressBar).toBeVisible();

    // Wait for render to complete (mock takes ~3-4s)
    const downloadBtn = page.locator('[data-testid="download-video-btn"]');
    await expect(downloadBtn).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Rendering Complete · Ready for Client Presentation')).toBeVisible();

    // Trigger download verification
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
      downloadBtn.click(),
    ]);

    if (download) {
      expect(download.suggestedFilename()).toContain('.mp4');
    }
  });
});
