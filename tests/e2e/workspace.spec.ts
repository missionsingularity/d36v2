import { expect, test } from "@playwright/test";

test("fresh visitor opens the workspace without authentication", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cases" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Documents" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Workflows" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Logs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toHaveCount(0);
});

test("invalid routes show the workspace 404 with recovery actions", async ({ page }) => {
  const response = await page.goto("/not-a-real-workspace-route");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We couldn’t find that page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Search" })).toHaveAttribute("href", "/search");
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
});

test("Search retrieves fixture evidence, opens citations, and restores a conversation after refresh", async ({ page }) => {
  await page.goto("/search");
  const composer = page.getByRole("textbox", { name: "Ask a question" });
  await composer.fill("Why has Pranab Kumar Deka not received his pension?");
  await composer.press("Enter");
  await expect(page.getByText(/388 months/).first()).toBeVisible();
  await expect(page.getByText(/382 months/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Pension Proposal/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/388 months/).first()).toBeVisible();
  await page.getByRole("link", { name: /Pension Proposal/ }).click();
  await expect(page.getByRole("heading", { name: "Pension Proposal" })).toBeVisible();
  await expect(page.getByText(/Original logical page|Qualifying service/).first()).toBeVisible();
});

test("case and workflow screens use the supplied records", async ({ page }) => {
  await page.goto("/cases");
  await expect(page.getByText("186 synthetic records")).toBeVisible();
  await page.getByRole("link", { name: "PEN-NGN-2026-041" }).click();
  await expect(page.getByRole("heading", { name: "Pranab Kumar Deka" })).toBeVisible();
  await expect(page.getByText("6 months · unresolved")).toBeVisible();
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  await expect(page.getByText("Documents (13)")).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Workflows" }).click();
  await expect(page.getByRole("heading", { name: "Pension Processing" })).toBeVisible();
  await expect(page.getByText("Verify Service", { exact: true })).toBeVisible();
});

test("profile settings persist and update the workspace identity and appearance", async ({ page }) => {
  await page.goto("/settings?section=profile");
  await page.getByLabel("Full name").fill("Prabir Borgohain");
  await page.getByLabel("Designation").fill("Deputy Secretary");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved on this device.");
  await expect(page.locator(".profile-select-text b")).toHaveText("Prabir Borgohain");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Prabir Borgohain" })).toBeVisible();
  await page.locator(".profile-menu summary").click();
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Language and region" }).click();
  await page.getByLabel("Interface language").selectOption("as");
  await page.getByRole("button", { name: "পৰিৱৰ্তন সংৰক্ষণ কৰক" }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "অনুসন্ধান" })).toBeVisible();
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("button", { name: /Dark/ }).click();
  await page.getByRole("button", { name: "পৰিৱৰ্তন সংৰক্ষণ কৰক" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".profile-select-text b")).toHaveText("Prabir Borgohain");
  await expect(page.locator("html")).toHaveAttribute("lang", "as");
  await page.getByRole("button", { name: "Reset preferences" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("tasks can be created, assigned, broken into subtasks and updated", async ({ page }) => {
  await page.goto("/work");
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Task title").fill("Check service book documents");
  await page.getByLabel("Description").fill("Review the original service entries.");
  await page.getByLabel("Due date").fill("2026-12-10");
  await page.getByRole("button", { name: "Save task" }).click();
  await expect(page.getByText("Check service book documents", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept("Verify appointment date"));
  await page.getByRole("button", { name: "Add subtask" }).click();
  await expect(page.getByText("Verify appointment date")).toBeVisible();
  await page.getByRole("combobox", { name: "Status for Check service book documents" }).selectOption("in_progress");
  await expect(page.getByRole("status")).toContainText(/Saved (on this device only|to this isolated demo workspace).+Task status: in progress/i);
  await page.reload();
  await expect(page.getByText("Check service book documents", { exact: true })).toBeVisible();
});

test("calendar meetings retain agenda and notes and are reachable from Apps", async ({ page }) => {
  await page.goto("/apps");
  await page.getByRole("link", { name: "Open Calendar" }).click();
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await page.getByRole("button", { name: "Prepare meeting" }).click();
  await page.getByLabel("Meeting title").fill("Pension case review");
  await page.getByLabel("Start date and time").fill("2026-12-12T10:30");
  await page.getByLabel("Attendees / offices").fill("Pension Section");
  await page.getByLabel("Agenda").fill("Review pending service records");
  await page.getByRole("button", { name: "Save meeting" }).click();
  await expect(page.getByText("Pension case review", { exact: true })).toBeVisible();
  let promptCount = 0;
  page.on("dialog", (dialog) => void dialog.accept(promptCount++ === 0 ? "Confirm the file references before discussion." : "2026-12-12T10:30"));
  await page.getByRole("button", { name: "Edit notes / time" }).click();
  await expect(page.getByText(/Confirm the file references/)).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help" })).toBeVisible();
});
