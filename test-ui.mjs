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

    const beforeSwapLeft = await page.locator("#left-input").inputValue();

    await page.locator("#left-input").click();
    await page.keyboard.press("Alt+ArrowDown");
    const firstActiveBlock = await page.locator(".diff-block.active").getAttribute("data-block-wrapper");
    if (firstActiveBlock !== "1") {
      throw new Error(`Expected first shortcut jump to focus block 1, got ${firstActiveBlock}`);
    }

    await page.keyboard.press("Alt+ArrowDown");
    const secondActiveBlock = await page.locator(".diff-block.active").getAttribute("data-block-wrapper");
    if (secondActiveBlock !== "2") {
      throw new Error(`Expected second shortcut jump to focus block 2, got ${secondActiveBlock}`);
    }

    await page.keyboard.press("Alt+ArrowUp");
    const previousActiveBlock = await page.locator(".diff-block.active").getAttribute("data-block-wrapper");
    if (previousActiveBlock !== "1") {
      throw new Error(`Expected previous shortcut jump to return to block 1, got ${previousActiveBlock}`);
    }

    const firstEditableRight = page.locator('.line-content[contenteditable="true"][data-side="right"]').first();
    await firstEditableRight.click();
    await firstEditableRight.evaluate((node) => {
      node.textContent = "Persistent edit";
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new FocusEvent("blur"));
    });

    const committedRightValue = await page.locator("#right-input").inputValue();
    if (!committedRightValue.includes("Persistent edit")) {
      throw new Error("Committed inline edit did not sync back to the textarea");
    }

    const secondEditableRight = page.locator('.line-content[contenteditable="true"][data-side="right"]').nth(1);
    await secondEditableRight.click();
    await secondEditableRight.evaluate((node) => {
      node.textContent = "* Temporary bullet";
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.keyboard.press("Control+z");

    const restoredCellValue = await secondEditableRight.innerText();
    if (restoredCellValue !== "* New bullet with revised context") {
      throw new Error(`Expected Ctrl+Z to restore only the current cell, got ${restoredCellValue}`);
    }

    await secondEditableRight.evaluate((node) => {
      node.dispatchEvent(new FocusEvent("blur"));
    });

    const afterUndoRightValue = await page.locator("#right-input").inputValue();
    if (!afterUndoRightValue.includes("Persistent edit")) {
      throw new Error("Ctrl+Z unexpectedly reverted a different cell");
    }
    if (afterUndoRightValue.includes("* Temporary bullet")) {
      throw new Error("Ctrl+Z did not remove the temporary edit from the active cell");
    }

    await page.locator("#swap-view-button").click();

    const swappedLeft = await page.locator("#left-input").inputValue();
    const swappedRight = await page.locator("#right-input").inputValue();
    if (swappedLeft !== afterUndoRightValue) {
      throw new Error("Swap view did not move after content into the before textarea");
    }
    if (swappedRight !== beforeSwapLeft) {
      throw new Error("Swap view did not move before content into the after textarea");
    }

    console.log(JSON.stringify({ ok: true, rowCount, rightLength: afterUndoRightValue.length, swappedLength: swappedLeft.length }));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
