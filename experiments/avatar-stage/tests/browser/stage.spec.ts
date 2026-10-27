import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const evidence = "evidence";
test("renders both real GLBs, orbits, zooms and captures desktop evidence", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/");
  const stage = page.getByTestId("stage");
  await expect(stage).toHaveAttribute("data-asset-status", "ready");
  await expect(page.getByTestId("rig-report")).toContainText(
    "12 morph · 6 clip",
  );
  await page.getByLabel("Movimento ridotto", { exact: true }).check();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.waitForTimeout(500);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/holo-desktop.png` });
  const before = await page.locator("canvas").screenshot();
  await page.getByRole("button", { name: "Ruota a destra" }).click();
  await page.getByRole("button", { name: "Ingrandisci", exact: true }).click();
  await page.waitForTimeout(300);
  expect(
    Buffer.compare(before, await page.locator("canvas").screenshot()),
  ).not.toBe(0);
  // Verify the actual pointer orbit path as well as accessible camera buttons.
  const bounds = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 120,
    bounds.y + bounds.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.getByRole("button", { name: "Volto", exact: true }).click();
  await page.getByLabel("Espressione", { exact: true }).selectOption("warm");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/holo-face.png` });
  await page.getByRole("button", { name: "Mini Robotico" }).click();
  await expect(stage).toHaveAttribute("data-asset-status", "ready");
  await expect(page.getByTestId("rig-report")).toContainText(
    "11 morph · 6 clip",
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${evidence}/mini-desktop.png` });
  await page.getByRole("button", { name: "Volto", exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/mini-face.png` });
  await page.getByText("Diagnostica rendering").click();
  await expect(page.locator(".diagnostics")).toContainText("Mediana", {
    timeout: 30000,
  });
  const hardware = await page.locator("canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer:
        extension && gl?.getParameter(extension.UNMASKED_RENDERER_WEBGL),
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
    };
  });
  await writeFile(
    `${evidence}/browser-desktop.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        ...hardware,
        frameStats: await page.locator(".diagnostics").innerText(),
        consoleErrors: errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
test("all six states reverse, speech survives avatar switch and cancellation wins", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("stage")).toHaveAttribute(
    "data-asset-status",
    "ready",
  );
  for (const label of [
    "In ascolto",
    "Elaborazione",
    "Parlato",
    "Interrotto",
    "Errore",
    "In attesa",
    "Parlato",
    "Errore",
    "In ascolto",
  ]) {
    await page
      .getByRole("button", { name: new RegExp(`^0[1-6]\\s*${label}$`) })
      .click();
    await expect(page.getByTestId("current-state")).toHaveText(label);
  }
  await page.getByRole("button", { name: "Simula parlato" }).click();
  await page.getByRole("button", { name: "Mini Robotico" }).click();
  await expect(page.getByTestId("current-state")).toHaveText("Parlato");
  await expect(page.getByTestId("stage")).toHaveAttribute(
    "data-asset-status",
    "ready",
  );
  await page.screenshot({ path: `${evidence}/mini-speaking.png` });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("current-state")).toHaveText("Interrotto");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("current-state")).toHaveText("Interrotto");
  await page.getByRole("button", { name: "Simula parlato" }).click();
  await expect(page.getByTestId("current-state")).toHaveText("In attesa", {
    timeout: 8000,
  });
});
test("local import succeeds, malformed imports and resource URIs are rejected", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("stage")).toHaveAttribute(
    "data-asset-status",
    "ready",
  );
  await page
    .getByLabel("Importa GLB locale", { exact: true })
    .setInputFiles("public/models/mini-prototype.glb");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "GLB locale",
  );
  await expect(page.getByTestId("stage")).toHaveAttribute(
    "data-asset-status",
    "ready",
  );
  await expect(page.getByTestId("rig-report")).toContainText("11 morph");
  await page
    .getByLabel("Importa GLB locale", { exact: true })
    .setInputFiles({
      name: "bad.glb",
      mimeType: "model/gltf-binary",
      buffer: Buffer.from("not a GLB"),
    });
  await expect(page.getByRole("alert")).toContainText("GLB non valido");
  await expect(page.getByTestId("stage")).toHaveAttribute(
    "data-asset-status",
    "ready",
  );
  // Reject embedded document resources before GLTFLoader can fetch them.
  const json = JSON.stringify({
    buffers: [{ uri: "https://example.com/private.bin" }],
  });
  const padded = json.padEnd(Math.ceil(json.length / 4) * 4, " "),
    bytes = Buffer.alloc(20 + padded.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  bytes.write(padded, 20);
  await page
    .getByLabel("Importa GLB locale", { exact: true })
    .setInputFiles({
      name: "external.glb",
      mimeType: "model/gltf-binary",
      buffer: bytes,
    });
  await expect(page.getByRole("alert")).toContainText("autosufficiente");
});
test("failed built-in GLB exposes an error and recovers on avatar change", async ({
  page,
}) => {
  await page.route("**/holo-prototype.glb", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/");
  await expect(page.getByTestId("stage")).toHaveAttribute(
    "data-asset-status",
    "error",
  );
  await expect(page.getByRole("alert")).toContainText("GLB HTTP 404");
  await page.getByRole("button", { name: "Mini Robotico" }).click();
  await expect(page.getByTestId("stage")).toHaveAttribute(
    "data-asset-status",
    "ready",
  );
});
test("narrow window, OS reduced motion and keyboard controls remain usable", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByLabel("Movimento ridotto", { exact: true }),
  ).toBeChecked();
  await expect(page.getByTestId("stage")).toHaveAttribute(
    "data-asset-status",
    "ready",
  );
  await page.getByRole("button", { name: "Mini Robotico" }).click();
  await expect(page.getByTestId("stage")).toHaveAttribute(
    "data-asset-status",
    "ready",
  );
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${evidence}/mini-narrow.png`,
    fullPage: true,
  });
  const reset = page.getByRole("button", { name: "Reset", exact: true });
  await reset.focus();
  await page.keyboard.press("Enter");
  await expect(reset).toBeFocused();
  await page.getByText("Diagnostica rendering").click();
  await expect(page.locator(".diagnostics")).toContainText("Mediana", {
    timeout: 30000,
  });
  await writeFile(
    `${evidence}/browser-narrow.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        viewport: [1100, 800],
        reducedMotion: true,
        frameStats: await page.locator(".diagnostics").innerText(),
      },
      null,
      2,
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Simula parlato" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
