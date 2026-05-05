import { describe, it, expect, vi } from "vitest";

describe("API module wiring", () => {
  it("exports the expected endpoint groups", async () => {
    const mod = await import("../api/endpoints");
    for (const k of [
      "authApi", "usersApi", "projectsApi", "stagesApi",
      "imagesApi", "aiApi", "budgetApi", "costApi",
      "dashboardApi", "alertsApi", "notificationsApi", "reportsApi", "systemApi",
    ]) {
      expect(mod[k]).toBeTypeOf("object");
    }
  });
});
