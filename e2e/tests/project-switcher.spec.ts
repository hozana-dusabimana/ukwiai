import { test, expect, Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.UKWI_ADMIN_EMAIL || "admin@ukwi.rw";
const ADMIN_PASSWORD = process.env.UKWI_ADMIN_PASSWORD || "ChangeMe!2026";

async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByPlaceholder("you@ukwi.rw").fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("button", { name: "AI Analysis" })).toBeVisible({ timeout: 20_000 });
}

test("header project switcher changes the active project", async ({ page }) => {
  await login(page);

  const switcher = page.getByTestId("project-switcher");
  await expect(switcher).toBeVisible();
  const before = (await switcher.innerText()).trim();

  await switcher.click();
  const menu = page.getByTestId("project-switcher-menu");
  await expect(menu).toBeVisible();

  const items = menu.getByRole("menuitemradio");
  const count = await items.count();
  test.skip(count < 2, "Need at least two projects to test switching");

  // Pick the first item that isn't the currently active one.
  const target = items.filter({ has: page.locator(':scope[aria-checked="false"]') }).first();
  const targetName = (await target.locator("div.font-bold").innerText()).trim();
  await target.click();

  await expect(menu).toHaveCount(0);
  await expect(switcher).toContainText(targetName);
  expect((await switcher.innerText()).trim()).not.toBe(before);
});
