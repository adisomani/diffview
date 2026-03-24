const { diffArrays, diffWordsWithSpace } = window.Diff;

const state = {
  blocks: [],
  activeBlockIndex: null,
};

const elements = {
  leftInput: document.querySelector("#left-input"),
  rightInput: document.querySelector("#right-input"),
  diffContainer: document.querySelector("#diff-container"),
  copyLeftButton: document.querySelector("#copy-left-button"),
  copyRightButton: document.querySelector("#copy-right-button"),
};

function splitLines(text) {
  return text.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim() !== "");
}

function splitBlocks(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let buffer = [];

  function flushBuffer() {
    const block = buffer.join("\n").trim();
    if (block) blocks.push(block);
    buffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushBuffer();
      continue;
    }

    if (/^([*-+]|\d+\.)\s+/.test(trimmed)) {
      flushBuffer();
      blocks.push(trimmed);
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      flushBuffer();
      blocks.push(trimmed);
      continue;
    }

    buffer.push(line);
  }

  flushBuffer();
  return blocks;
}

function joinLines(lines) {
  return lines.filter((line) => line.trim() !== "").join("\n");
}

function joinBlocks(blocks) {
  return blocks.filter((block) => block.trim() !== "").join("\n\n");
}

function syncInputsFromBlocks() {
  elements.leftInput.value = joinBlocks(state.blocks.map((block) => block.leftText));
  elements.rightInput.value = joinBlocks(state.blocks.map((block) => block.rightText));
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeForMatch(text) {
  return text
    .toLowerCase()
    .replace(/["“”'‘’`*()[\]{}:;,.!?_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(leftText, rightText) {
  const left = normalizeForMatch(leftText);
  const right = normalizeForMatch(rightText);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftSet = new Set(left.split(" "));
  const rightSet = new Set(right.split(" "));
  let overlap = 0;

  for (const word of leftSet) {
    if (rightSet.has(word)) overlap += 1;
  }

  const union = new Set([...leftSet, ...rightSet]).size || 1;
  const jaccard = overlap / union;
  const lengthRatio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
  return jaccard * 0.8 + lengthRatio * 0.2;
}

function pairChangedSequences(leftItems, rightItems, threshold = 0.34) {
  const candidatePairs = [];

  for (let leftIdx = 0; leftIdx < leftItems.length; leftIdx += 1) {
    for (let rightIdx = 0; rightIdx < rightItems.length; rightIdx += 1) {
      const score = similarityScore(leftItems[leftIdx], rightItems[rightIdx]);
      if (score >= threshold) {
        candidatePairs.push({ leftIdx, rightIdx, score });
      }
    }
  }

  candidatePairs.sort((a, b) => b.score - a.score);

  const matchedLeft = new Set();
  const matchedRight = new Set();
  const anchors = [];

  for (const pair of candidatePairs) {
    if (matchedLeft.has(pair.leftIdx) || matchedRight.has(pair.rightIdx)) continue;

    const breaksOrder = anchors.some((anchor) => (
      (anchor.leftIdx < pair.leftIdx && anchor.rightIdx > pair.rightIdx)
      || (anchor.leftIdx > pair.leftIdx && anchor.rightIdx < pair.rightIdx)
    ));

    if (breaksOrder) continue;

    matchedLeft.add(pair.leftIdx);
    matchedRight.add(pair.rightIdx);
    anchors.push({ leftIdx: pair.leftIdx, rightIdx: pair.rightIdx });
    anchors.sort((a, b) => a.leftIdx - b.leftIdx);
  }

  const pairs = [];
  let leftCursor = 0;
  let rightCursor = 0;

  for (const anchor of anchors) {
    while (leftCursor < anchor.leftIdx || rightCursor < anchor.rightIdx) {
      if (leftCursor < anchor.leftIdx && rightCursor < anchor.rightIdx) {
        pairs.push({ leftIdx: leftCursor, rightIdx: rightCursor });
        leftCursor += 1;
        rightCursor += 1;
      } else if (leftCursor < anchor.leftIdx) {
        pairs.push({ leftIdx: leftCursor, rightIdx: null });
        leftCursor += 1;
      } else {
        pairs.push({ leftIdx: null, rightIdx: rightCursor });
        rightCursor += 1;
      }
    }

    pairs.push({ leftIdx: anchor.leftIdx, rightIdx: anchor.rightIdx });
    leftCursor = anchor.leftIdx + 1;
    rightCursor = anchor.rightIdx + 1;
  }

  while (leftCursor < leftItems.length || rightCursor < rightItems.length) {
    if (leftCursor < leftItems.length && rightCursor < rightItems.length) {
      pairs.push({ leftIdx: leftCursor, rightIdx: rightCursor });
      leftCursor += 1;
      rightCursor += 1;
    } else if (leftCursor < leftItems.length) {
      pairs.push({ leftIdx: leftCursor, rightIdx: null });
      leftCursor += 1;
    } else {
      pairs.push({ leftIdx: null, rightIdx: rightCursor });
      rightCursor += 1;
    }
  }

  return pairs;
}

function buildRows(leftText, rightText) {
  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  const changes = diffArrays(leftLines, rightLines);
  const rows = [];
  let leftLineNo = 1;
  let rightLineNo = 1;

  for (let i = 0; i < changes.length; i += 1) {
    const part = changes[i];

    if (!part.added && !part.removed) {
      for (const line of part.value) {
        rows.push({ leftLineNo, rightLineNo, leftText: line, rightText: line, changed: false });
        leftLineNo += 1;
        rightLineNo += 1;
      }
      continue;
    }

    const next = changes[i + 1];
    if (part.removed && next?.added) {
      const pairs = pairChangedSequences(part.value, next.value, 0.3);
      for (const pair of pairs) {
        const leftText = pair.leftIdx === null ? "" : (part.value[pair.leftIdx] ?? "");
        const rightText = pair.rightIdx === null ? "" : (next.value[pair.rightIdx] ?? "");
        if (!leftText && !rightText) continue;
        rows.push({
          leftLineNo: leftText && pair.leftIdx !== null ? leftLineNo + pair.leftIdx : "",
          rightLineNo: rightText && pair.rightIdx !== null ? rightLineNo + pair.rightIdx : "",
          leftText,
          rightText,
          changed: leftText !== rightText,
        });
      }
      leftLineNo += part.value.length;
      rightLineNo += next.value.length;
      i += 1;
      continue;
    }

    if (part.added && next?.removed) {
      const pairs = pairChangedSequences(next.value, part.value, 0.3);
      for (const pair of pairs) {
        const leftText = pair.leftIdx === null ? "" : (next.value[pair.leftIdx] ?? "");
        const rightText = pair.rightIdx === null ? "" : (part.value[pair.rightIdx] ?? "");
        if (!leftText && !rightText) continue;
        rows.push({
          leftLineNo: leftText && pair.leftIdx !== null ? leftLineNo + pair.leftIdx : "",
          rightLineNo: rightText && pair.rightIdx !== null ? rightLineNo + pair.rightIdx : "",
          leftText,
          rightText,
          changed: leftText !== rightText,
        });
      }
      leftLineNo += next.value.length;
      rightLineNo += part.value.length;
      i += 1;
      continue;
    }

    if (part.removed) {
      for (const [offset, line] of part.value.entries()) {
        if (line.trim() === "") continue;
        rows.push({ leftLineNo: leftLineNo + offset, rightLineNo: "", leftText: line, rightText: "", changed: true });
      }
      leftLineNo += part.value.length;
      continue;
    }

    for (const [offset, line] of part.value.entries()) {
      if (line.trim() === "") continue;
      rows.push({ leftLineNo: "", rightLineNo: rightLineNo + offset, leftText: "", rightText: line, changed: true });
    }
    rightLineNo += part.value.length;
  }

  return rows;
}

function buildBlocks(leftText, rightText) {
  const leftBlocks = splitBlocks(leftText);
  const rightBlocks = splitBlocks(rightText);
  const changes = diffArrays(leftBlocks, rightBlocks);
  const blocks = [];
  let leftIndex = 0;
  let rightIndex = 0;

  for (let i = 0; i < changes.length; i += 1) {
    const part = changes[i];

    if (!part.added && !part.removed) {
      for (const block of part.value) {
        blocks.push({
          leftText: block,
          sourceRightText: block,
          rightText: block,
          leftIndex,
          rightIndex,
          changed: false,
        });
        leftIndex += 1;
        rightIndex += 1;
      }
      continue;
    }

    const next = changes[i + 1];
    if (part.removed && next?.added) {
      const pairs = pairChangedSequences(part.value, next.value, 0.26);
      for (const pair of pairs) {
        const leftText = pair.leftIdx === null ? "" : (part.value[pair.leftIdx] ?? "");
        const rightText = pair.rightIdx === null ? "" : (next.value[pair.rightIdx] ?? "");
        if (!leftText && !rightText) continue;
        blocks.push({
          leftText,
          sourceRightText: rightText,
          rightText,
          leftIndex: leftText && pair.leftIdx !== null ? leftIndex + pair.leftIdx : null,
          rightIndex: rightText && pair.rightIdx !== null ? rightIndex + pair.rightIdx : null,
          changed: leftText !== rightText,
        });
      }
      leftIndex += part.value.length;
      rightIndex += next.value.length;
      i += 1;
      continue;
    }

    if (part.added && next?.removed) {
      const pairs = pairChangedSequences(next.value, part.value, 0.26);
      for (const pair of pairs) {
        const leftText = pair.leftIdx === null ? "" : (next.value[pair.leftIdx] ?? "");
        const rightText = pair.rightIdx === null ? "" : (part.value[pair.rightIdx] ?? "");
        if (!leftText && !rightText) continue;
        blocks.push({
          leftText,
          sourceRightText: rightText,
          rightText,
          leftIndex: leftText && pair.leftIdx !== null ? leftIndex + pair.leftIdx : null,
          rightIndex: rightText && pair.rightIdx !== null ? rightIndex + pair.rightIdx : null,
          changed: leftText !== rightText,
        });
      }
      leftIndex += next.value.length;
      rightIndex += part.value.length;
      i += 1;
      continue;
    }

    for (const [offset, block] of part.value.entries()) {
      if (block.trim() === "") continue;
      blocks.push({
        leftText: part.removed ? block : "",
        sourceRightText: part.added ? block : "",
        rightText: part.added ? block : "",
        leftIndex: part.removed ? leftIndex + offset : null,
        rightIndex: part.added ? rightIndex + offset : null,
        changed: true,
      });
    }

    if (part.removed) {
      leftIndex += part.value.length;
    } else {
      rightIndex += part.value.length;
    }
  }

  return blocks;
}

function diffMarkup(leftText, rightText, side) {
  if (leftText === rightText) return escapeHtml(side === "left" ? leftText : rightText);

  return diffWordsWithSpace(leftText, rightText).map((part) => {
    if (!part.added && !part.removed) return escapeHtml(part.value);
    if (side === "left" && part.removed) return `<span class="diff-token deleted">${escapeHtml(part.value)}</span>`;
    if (side === "right" && part.added) return `<span class="diff-token added">${escapeHtml(part.value)}</span>`;
    return "";
  }).join("");
}

function renderRow(row, blockIndex, rowIndex) {
  const leftClass = row.changed && row.leftText ? `deleted${row.rightText ? "" : " only"}` : "";
  const rightClass = row.changed && row.rightText ? `added${row.leftText ? "" : " only"}` : "";

  return `
    <div class="diff-row">
      <div class="diff-cell">
        <div class="line-content ${leftClass}" contenteditable="true" data-side="left" data-block-index="${blockIndex}" data-row-index="${rowIndex}">${diffMarkup(row.leftText, row.rightText, "left")}</div>
      </div>
      <div class="diff-cell">
        <div class="line-content ${rightClass}" contenteditable="true" data-side="right" data-block-index="${blockIndex}" data-row-index="${rowIndex}">${diffMarkup(row.leftText, row.rightText, "right")}</div>
      </div>
    </div>
  `;
}

function renderBlock(block, blockIndex) {
  const rows = buildRows(block.leftText, block.rightText);
  if (!rows.length) return "";

  return `
    <section class="diff-block ${block.changed ? "changed" : ""} ${state.activeBlockIndex === blockIndex ? "active" : ""}" data-block-wrapper="${blockIndex}">
      ${block.changed ? `
        <div class="block-toolbar">
          <button class="arrow-button" data-action="take-left" data-block-index="${blockIndex}" aria-label="Copy right block to left">←</button>
          <button class="arrow-button" data-action="take-right" data-block-index="${blockIndex}" aria-label="Copy left block to right">→</button>
        </div>
      ` : ""}
      <div class="block-rows">
        ${rows.map((row, rowIndex) => renderRow(row, blockIndex, rowIndex)).join("")}
      </div>
    </section>
  `;
}

function handleRowEdit(event) {
  const side = event.currentTarget.dataset.side;
  const blockIndex = Number(event.currentTarget.dataset.blockIndex);
  const rowIndex = Number(event.currentTarget.dataset.rowIndex);
  const block = state.blocks[blockIndex];
  if (!block) return;

  const rows = buildRows(block.leftText, block.rightText);
  const row = rows[rowIndex];
  if (!row) return;

  const nextValue = event.currentTarget.innerText.replace(/\u00a0/g, " ");
  if (side === "left") {
    if (row.leftLineNo === "") return;
    const leftLines = splitLines(block.leftText);
    leftLines[row.leftLineNo - 1] = nextValue;
    block.leftText = joinLines(leftLines);
  } else {
    if (row.rightLineNo === "") return;
    const rightLines = splitLines(block.rightText);
    rightLines[row.rightLineNo - 1] = nextValue;
    block.rightText = joinLines(rightLines);
  }

  syncInputsFromBlocks();
  render();
}

function applyBlockChoice(blockIndex, side) {
  const block = state.blocks[blockIndex];
  if (!block) return;

  if (side === "left") {
    block.leftText = block.rightText;
  } else {
    block.rightText = block.leftText;
  }

  syncInputsFromBlocks();
  render();
}

function render() {
  state.blocks = buildBlocks(elements.leftInput.value, elements.rightInput.value);
  if (state.activeBlockIndex !== null && state.activeBlockIndex >= state.blocks.length) {
    state.activeBlockIndex = null;
  }

  elements.diffContainer.innerHTML = state.blocks.map((block, index) => renderBlock(block, index)).join("");

  document.querySelectorAll("[data-row-index]").forEach((node) => {
    node.addEventListener("blur", handleRowEdit);
  });

  document.querySelectorAll(".arrow-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const blockIndex = Number(button.dataset.blockIndex);
      if (button.dataset.action === "take-left") applyBlockChoice(blockIndex, "left");
      if (button.dataset.action === "take-right") applyBlockChoice(blockIndex, "right");
    });
  });
}

function setActiveBlock(blockIndex) {
  state.activeBlockIndex = blockIndex;
  document.querySelectorAll("[data-block-wrapper]").forEach((node) => {
    node.classList.toggle("active", Number(node.dataset.blockWrapper) === blockIndex);
  });
}

async function copyText(button, text) {
  await navigator.clipboard.writeText(text);
  const previous = button.textContent;
  button.textContent = "✓";
  setTimeout(() => {
    button.textContent = previous;
  }, 1000);
}

elements.copyLeftButton.addEventListener("click", () => copyText(elements.copyLeftButton, elements.leftInput.value));
elements.copyRightButton.addEventListener("click", () => copyText(elements.copyRightButton, elements.rightInput.value));
elements.leftInput.addEventListener("input", render);
elements.rightInput.addEventListener("input", render);

elements.diffContainer.addEventListener("mousedown", (event) => {
  if (event.target.closest(".arrow-button")) return;
  const block = event.target.closest("[data-block-wrapper]");
  if (!block) return;
  setActiveBlock(Number(block.dataset.blockWrapper));
});

elements.diffContainer.addEventListener("focusin", (event) => {
  const block = event.target.closest("[data-block-wrapper]");
  if (!block) return;
  setActiveBlock(Number(block.dataset.blockWrapper));
});

elements.diffContainer.addEventListener("click", (event) => {
  if (event.target.closest(".arrow-button")) return;
  const block = event.target.closest("[data-block-wrapper]");
  if (!block) {
    setActiveBlock(null);
    return;
  }
  setActiveBlock(Number(block.dataset.blockWrapper));
});

document.addEventListener("click", (event) => {
  if (event.target.closest("#diff-container")) return;
  if (state.activeBlockIndex !== null) {
    setActiveBlock(null);
  }
});

elements.leftInput.value = "";
elements.rightInput.value = "";
render();
