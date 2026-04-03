/**
 * E2E — Authentication UI flows
 *
 * Tests the browser-facing login/signup/signout flows and route-level
 * auth protection implemented in middleware.ts.
 */
import { test, expect, type Page } from "@playwright/test";
import { ensureTestUser, TEST_USER } from "../helpers/db";

test.beforeAll(async () => {
  await ensureTestUser();
});

// ── Route protection ──────────────────────────────────────────────────────────

test("unauthenticated visit to /dashboard redirects to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("unauthenticated visit to /dashboard/projects/new redirects to /login", async ({ page }) => {
  await page.goto("/dashboard/projects/new");
  await expect(page).toHaveURL(/\/login/);
});

test("unauthenticated visit to /dashboard/audit/any-entry redirects to /login", async ({ page }) => {
  await page.goto("/dashboard/audit/entry-abc-123");
  await expect(page).toHaveURL(/\/login/);
});

// ── Login page rendering ──────────────────────────────────────────────────────

test("login page renders expected elements", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "SEO Meta-Agent" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("mode toggles between sign in and sign up", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  // Click "Sign up" toggle link
  await page.getByRole("button", { name: /sign up/i }).last().click();
  await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();

  // Toggle back
  await page.getByRole("button", { name: /sign in/i }).last().click();
  await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
});

// ── Sign in ───────────────────────────────────────────────────────────────────

test("shows error on wrong credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nonexistent@example.com");
  await page.getByLabel("Password").fill("wrongpassword123");
  await page.getByRole("button", { name: /sign in/i }).click();

  // Error message should appear
  await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 8_000 });
});

test("successful sign-in redirects to /dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
});

// ── Authenticated dashboard ───────────────────────────────────────────────────

test("authenticated user sees dashboard with Projects heading", async ({ page }) => {
  // Sign in first
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("link", { name: /new project/i })).toBeVisible();
});

test("sign out returns user to login page", async ({ page }) => {
  // Sign in
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

  // Sign out via form button
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
});

// ── Sign up ───────────────────────────────────────────────────────────────────

test("sign up with an already-registered email shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /sign up/i }).last().click();

  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /create account/i }).click();

  // Supabase returns an error for duplicate email
  await expect(page.locator(".text-red-600")).toBeVisible({ timeout: 8_000 });
});

// ── Redirect preservation ─────────────────────────────────────────────────────

test("login redirect param is preserved and used after sign-in", async ({ page }) => {
  await page.goto("/dashboard/projects/new");
  await expect(page).toHaveURL(/\/login\?redirect/);

  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Should land on the original target after sign-in
  await expect(page).toHaveURL(/\/dashboard\/projects\/new/, { timeout: 10_000 });
});
