import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
const url = process.env.PREVIEW_URL ?? "http://127.0.0.1:4174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(url);
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-testid=stage]")
        ?.getAttribute("data-asset-status") === "ready",
  );
  await page.getByRole("button", { name: "Mini Robotico" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-testid=rig-report]")
      ?.textContent?.includes("11 morph"),
  );
  await page.screenshot({ path: "evidence/production-mini.png" });
  await page.getByRole("button", { name: "Simula parlato" }).click();
  await page
    .getByTestId("current-state")
    .filter({ hasText: "Parlato" })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByTestId("current-state")
    .filter({ hasText: "Interrotto" })
    .waitFor();
  await writeFile(
    "evidence/production-smoke.json",
    JSON.stringify(
      {
        url,
        source: "vite preview of npm run build output",
        browser: browser.version(),
        checks: [
          "Holo GLB rendered",
          "Mini GLB rendered",
          "speechStarted enters speaking",
          "Escape cancels to interrupted",
        ],
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS compiled-build smoke: both GLBs load, speech starts, Escape cancels; no console errors.",
  );
} finally {
  await browser.close();
}
