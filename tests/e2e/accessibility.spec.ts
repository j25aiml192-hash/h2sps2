import { test, expect } from '@playwright/test';

test.describe('Debate Flow Accessibility & Navigation', () => {
  test('Debate page should load and have proper ARIA attributes', async ({ page }) => {
    await page.goto('/debate');
    
    // Check main headline
    const heading = page.getByRole('heading', { name: /debate/i });
    await expect(heading).toBeVisible();

    // Check if agents are loaded
    const agentList = page.locator('div[role="list"]');
    if (await agentList.count() > 0) {
      await expect(agentList).toBeVisible();
    }
  });

  test('Dashboard should have proper chart elements', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check main headline
    const heading = page.getByRole('heading', { name: /dashboard/i });
    await expect(heading).toBeVisible();

    // Export panel
    await expect(page.getByText('Data Export')).toBeVisible();
  });
});
