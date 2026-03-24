import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173";

const leftText = [
  "# Title",
  "",
  "* Old bullet with extra context",
  "",
  "Shared paragraph stays mostly the same.",
].join("\n");

const rightText = [
  "# Title",
  "",
  "* New bullet with revised context",
  "",
  "Shared paragraph stays mostly the same, but changes slightly.",
].join("\n");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("#left-input").fill(leftText);
    await page.locator("#right-input").fill(rightText);

    await page.waitForSelector(".diff-row");
    const rowCount = await page.locator(".diff-row").count();
    if (rowCount < 2) throw new Error(`Expected diff rows, got ${rowCount}`);

    const editableRight = page.locator('.line-content[contenteditable="true"][data-side="right"]').first();
    await editableRight.click();
    await editableRight.evaluate((node) => {
      node.textContent = "Updated line";
      node.dispatchEvent(new FocusEvent("blur"));
    });

    const rightValue = await page.locator("#right-input").inputValue();
    if (!rightValue.includes("Updated line")) {
      throw new Error("Right-side inline edit did not sync back to the textarea");
    }

    const block = page.locator("[data-block-wrapper]").nth(1);
    await block.click();
    const rightArrow = block.locator('.arrow-button[data-action="take-right"]');
    await rightArrow.click();

    const syncedRight = await page.locator("#right-input").inputValue();
    if (!syncedRight.includes("Shared paragraph stays mostly the same.")) {
      throw new Error("Bulk copy arrow did not copy left block to right");
    }

    console.log(JSON.stringify({ ok: true, rowCount, rightLength: syncedRight.length }));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
