import { test, expect, Page } from "@playwright/test";

// Seeded demo operator shown on the live login screen.
const ADMIN_EMAIL = process.env.UKWI_ADMIN_EMAIL || "admin@ukwi.rw";
const ADMIN_PASSWORD = process.env.UKWI_ADMIN_PASSWORD || "ChangeMe!2026";

async function login(page: Page) {
  await page.goto("/");
  // Landing → Sign in (navbar button).
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();

  await page.getByPlaceholder("you@ukwi.rw").fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Authenticated shell renders the sidebar.
  await expect(page.getByRole("button", { name: "AI Analysis" })).toBeVisible({ timeout: 20_000 });
}

test("notification renders as a centered card with a working X close button", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "AI Analysis" }).click();

  // Deterministically trigger a notification: a non-image file is rejected
  // client-side, which raises the same Toast used for the AI relevance notice.
  await page.locator("#file-upload").setInputFiles({
    name: "not-an-image.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not a basketball court photo"),
  });

  const card = page.getByTestId("toast-card");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("toast-backdrop")).toBeVisible();
  await expect(card).toContainText(/image/i);

  // The card is horizontally centered in the viewport.
  const box = await card.boundingBox();
  const vp = page.viewportSize();
  expect(box).not.toBeNull();
  expect(vp).not.toBeNull();
  const cardCenterX = box!.x + box!.width / 2;
  expect(Math.abs(cardCenterX - vp!.width / 2)).toBeLessThan(40);

  // The X button dismisses it.
  await page.getByTestId("toast-close").click();
  await expect(card).toHaveCount(0);
});

test("clicking the backdrop dismisses the notification", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "AI Analysis" }).click();

  await page.locator("#file-upload").setInputFiles({
    name: "nope.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("nope"),
  });

  await expect(page.getByTestId("toast-card")).toBeVisible();
  // Click near a corner of the backdrop, away from the centered card.
  await page.getByTestId("toast-backdrop").click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId("toast-card")).toHaveCount(0);
});
