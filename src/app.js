const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 760;
const MAX_HISTORY = 25;
const DB_NAME = "little-story-studio";
const DB_VERSION = 1;
const STORE_NAME = "characters";

const canvas = document.querySelector("#drawing-canvas");
const context = canvas.getContext("2d", { willReadFrequently: false });
const emptyHint = document.querySelector("#canvas-empty");
const undoButton = document.querySelector("#undo-button");
const redoButton = document.querySelector("#redo-button");
const saveDialog = document.querySelector("#save-dialog");
const nameInput = document.querySelector("#character-name");
const toast = document.querySelector("#toast");

let tool = "draw";
let color = "#e9584e";
let brushSize = 8;
let drawing = false;
let currentCharacterId = null;
let currentCharacterName = "";
let currentMotion = "wiggle";
let currentBackground = "sunset";
let undoStack = [];
let redoStack = [];
let toastTimer;
let activeObjectUrls = [];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;

    try {
      request = action(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      database.close();
      resolve(request?.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || request?.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || request?.error || new Error("The save was cancelled."));
    };
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2500);
}

function updateHistoryButtons() {
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function updateEmptyHint() {
  const pixels = context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
  let hasDrawing = false;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] < 250 || pixels[index + 1] < 250 || pixels[index + 2] < 250) {
      hasDrawing = true;
      break;
    }
  }
  emptyHint.classList.toggle("is-hidden", hasDrawing);
  updatePreviewImage();
}

function buildTransparentCharacterArt() {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = CANVAS_WIDTH;
  sourceCanvas.height = CANVAS_HEIGHT;
  const sourceContext = sourceCanvas.getContext("2d");
  sourceContext.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  sourceContext.drawImage(canvas, 0, 0);

  const imageData = sourceContext.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const pixels = imageData.data;
  let minX = CANVAS_WIDTH;
  let minY = CANVAS_HEIGHT;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < CANVAS_HEIGHT; y += 1) {
    for (let x = 0; x < CANVAS_WIDTH; x += 1) {
      const index = (y * CANVAS_WIDTH + x) * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      const isWhite = alpha > 0 && red > 245 && green > 245 && blue > 245;
      if (isWhite) {
        pixels[index + 3] = 0;
      }
      if (!isWhite && alpha > 16) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    const blankCanvas = document.createElement("canvas");
    blankCanvas.width = 420;
    blankCanvas.height = 420;
    return blankCanvas.toDataURL("image/png");
  }

  const inset = 42;
  const cropX = Math.max(0, minX - inset);
  const cropY = Math.max(0, minY - inset);
  const cropWidth = Math.min(CANVAS_WIDTH - cropX, maxX - minX + inset * 2);
  const cropHeight = Math.min(CANVAS_HEIGHT - cropY, maxY - minY + inset * 2);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  const cropContext = cropCanvas.getContext("2d");

  const croppedData = new ImageData(cropWidth, cropHeight);
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const srcIndex = ((cropY + y) * CANVAS_WIDTH + (cropX + x)) * 4;
      const dstIndex = (y * cropWidth + x) * 4;
      croppedData.data[dstIndex] = pixels[srcIndex];
      croppedData.data[dstIndex + 1] = pixels[srcIndex + 1];
      croppedData.data[dstIndex + 2] = pixels[srcIndex + 2];
      croppedData.data[dstIndex + 3] = pixels[srcIndex + 3];
    }
  }
  cropContext.putImageData(croppedData, 0, 0);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = 420;
  outputCanvas.height = 420;
  const outputContext = outputCanvas.getContext("2d");
  outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

  const scale = Math.min((outputCanvas.width - 70) / cropWidth, (outputCanvas.height - 70) / cropHeight);
  const drawWidth = cropWidth * scale;
  const drawHeight = cropHeight * scale;
  const drawX = (outputCanvas.width - drawWidth) / 2;
  const drawY = (outputCanvas.height - drawHeight) / 2 + 12;

  const silhouetteCanvas = document.createElement("canvas");
  silhouetteCanvas.width = outputCanvas.width;
  silhouetteCanvas.height = outputCanvas.height;
  const silhouetteContext = silhouetteCanvas.getContext("2d");
  silhouetteContext.drawImage(cropCanvas, drawX, drawY, drawWidth, drawHeight);
  silhouetteContext.globalCompositeOperation = "source-in";
  silhouetteContext.fillStyle = "#ffffff";
  silhouetteContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

  outputContext.save();
  outputContext.globalAlpha = 0.7;
  outputContext.globalCompositeOperation = "source-over";
  outputContext.filter = "drop-shadow(0 5px 0 #f18d78)";
  outputContext.drawImage(silhouetteCanvas, 0, 0);
  outputContext.filter = "none";
  outputContext.globalAlpha = 1;
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
    outputContext.drawImage(silhouetteCanvas, Math.cos(angle) * 6, Math.sin(angle) * 6);
  }
  outputContext.restore();
  outputContext.drawImage(cropCanvas, drawX, drawY, drawWidth, drawHeight);

  const sparklePoints = [
    [Math.max(18, drawX - 16), Math.max(22, drawY + drawHeight * 0.22)],
    [Math.min(402, drawX + drawWidth + 16), Math.max(28, drawY + drawHeight * 0.56)],
  ];
  sparklePoints.forEach(([x, y], index) => {
    outputContext.save();
    outputContext.translate(x, y);
    outputContext.rotate(index ? -0.2 : 0.2);
    outputContext.fillStyle = index ? "#f18d78" : "#f1c94b";
    outputContext.beginPath();
    outputContext.moveTo(0, -9);
    outputContext.quadraticCurveTo(2, -2, 9, 0);
    outputContext.quadraticCurveTo(2, 2, 0, 9);
    outputContext.quadraticCurveTo(-2, 2, -9, 0);
    outputContext.quadraticCurveTo(-2, -2, 0, -9);
    outputContext.fill();
    outputContext.restore();
  });
  return outputCanvas.toDataURL("image/png");
}

function updatePreviewImage() {
  const previewImage = document.querySelector("#preview-image");
  if (previewImage) previewImage.src = buildTransparentCharacterArt();
  const stageCharacter = document.querySelector("#stage-character");
  if (stageCharacter) stageCharacter.src = buildTransparentCharacterArt();
}

function fillCanvas() {
  context.save();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.restore();
  updateEmptyHint();
}

function pushUndo() {
  undoStack.push(canvas.toDataURL("image/png"));
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function restoreSnapshot(snapshot) {
  const image = new Image();
  image.onload = () => {
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    updateEmptyHint();
  };
  image.src = snapshot;
}

function setMotion(nextMotion) {
  const validMotion = ["wiggle", "bounce", "twirl", "glide"].includes(nextMotion) ? nextMotion : "wiggle";
  currentMotion = validMotion;
  const stageScene = document.querySelector("#stage-scene");
  const motionButtons = document.querySelectorAll(".motion-button");
  if (stageScene) stageScene.dataset.motion = currentMotion;
  motionButtons.forEach((button) => {
    const selected = button.dataset.motion === currentMotion;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  updatePreviewImage();
}

function setBackground(nextBackground) {
  const validBackground = ["sunset", "meadow", "forest", "beach", "night", "city", "castle", "arctic"].includes(nextBackground) ? nextBackground : "sunset";
  currentBackground = validBackground;
  const stageScene = document.querySelector("#stage-scene");
  if (stageScene) stageScene.dataset.background = currentBackground;
  const backgroundButtons = document.querySelectorAll(".background-button");
  backgroundButtons.forEach((button) => {
    const selected = button.dataset.background === currentBackground;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(canvas.toDataURL("image/png"));
  restoreSnapshot(undoStack.pop());
  updateHistoryButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(canvas.toDataURL("image/png"));
  restoreSnapshot(redoStack.pop());
  updateHistoryButtons();
}

function pointFromEvent(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (CANVAS_WIDTH / bounds.width),
    y: (event.clientY - bounds.top) * (CANVAS_HEIGHT / bounds.height),
  };
}

function startDrawing(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  pushUndo();
  drawing = true;
  const point = pointFromEvent(event);
  context.beginPath();
  context.moveTo(point.x, point.y);
  context.lineWidth = brushSize * (CANVAS_WIDTH / canvas.getBoundingClientRect().width);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = tool === "erase" ? "#ffffff" : color;
  context.fillStyle = context.strokeStyle;
  context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(point.x, point.y);
  emptyHint.classList.add("is-hidden");
}

function continueDrawing(event) {
  if (!drawing) return;
  event.preventDefault();
  const point = pointFromEvent(event);
  context.lineTo(point.x, point.y);
  context.stroke();
  context.beginPath();
  context.moveTo(point.x, point.y);
}

function stopDrawing() {
  if (!drawing) return;
  drawing = false;
  context.closePath();
  updateEmptyHint();
}

function setTool(nextTool) {
  tool = nextTool;
  document.querySelector("#draw-tool").classList.toggle("is-selected", tool === "draw");
  document.querySelector("#erase-tool").classList.toggle("is-selected", tool === "erase");
  document.querySelector("#draw-tool").setAttribute("aria-pressed", String(tool === "draw"));
  document.querySelector("#erase-tool").setAttribute("aria-pressed", String(tool === "erase"));
  canvas.style.cursor = tool === "erase" ? "cell" : "crosshair";
}

function resetHistory() {
  undoStack = [];
  redoStack = [];
  updateHistoryButtons();
}

function resetEditor() {
  currentCharacterId = null;
  currentCharacterName = "";
  setMotion("wiggle");
  fillCanvas();
  resetHistory();
  setTool("draw");
}

function showView(viewName) {
  const viewIds = ["home-view", "create-view", "stage-view", "gallery-view", "videos-view"];
  const activeViewId = `${viewName}-view`;
  viewIds.forEach((id) => {
    const isActive = id === activeViewId;
    const view = document.getElementById(id);
    if (view) {
      view.hidden = !isActive;
      view.classList.toggle("is-hidden", !isActive);
    }
  });
  if (viewName === "gallery") renderGallery();
  if (viewName === "stage") renderStageCharacter();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function blobFromCanvas() {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The drawing could not be saved."));
    }, "image/png");
  });
}

async function openSaveDialog() {
  const hasContent = !emptyHint.classList.contains("is-hidden");
  if (hasContent) {
    showToast("Draw your character before creating it.");
    return;
  }

  renderStageCharacter();
  showView("stage");
}

function renderStageCharacter() {
  const stageCharacter = document.querySelector("#stage-character");
  if (!stageCharacter) return;
  stageCharacter.src = buildTransparentCharacterArt();
  const stageScene = document.querySelector("#stage-scene");
  if (stageScene) {
    stageScene.dataset.background = currentBackground;
    stageScene.dataset.motion = currentMotion;
  }
}

async function saveCharacter(event) {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }

  try {
    const existing = currentCharacterId ? await withStore("readonly", (store) => store.get(currentCharacterId)) : null;
    const now = Date.now();
    const character = {
      id: currentCharacterId || (crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random().toString(16).slice(2)}`),
      name: name.slice(0, 24),
      image: await blobFromCanvas(),
      motion: currentMotion,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await withStore("readwrite", (store) => store.put(character));
    currentCharacterId = character.id;
    currentCharacterName = character.name;
    saveDialog.close();
    await updateCharacterCount();
    showView("stage");
    renderStageCharacter();
    showToast(`${character.name} is ready for the stage!`);
  } catch (error) {
    console.error("Could not save character", error);
    showToast("Could not save. Your browser storage may be full.");
  }
}

async function getCharacters() {
  const characters = await withStore("readonly", (store) => store.getAll());
  return characters.sort((first, second) => second.updatedAt - first.updatedAt);
}

async function updateCharacterCount() {
  try {
    const characters = await getCharacters();
    document.querySelector("#character-count").textContent = characters.length;
  } catch (error) {
    console.error("Could not read saved characters", error);
    showToast("Your character gallery could not be opened.");
  }
}

function clearOldObjectUrls() {
  activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeObjectUrls = [];
}

async function renderGallery() {
  const grid = document.querySelector("#gallery-grid");
  const emptyState = document.querySelector("#gallery-empty");
  clearOldObjectUrls();
  grid.replaceChildren();

  try {
    const characters = await getCharacters();
    document.querySelector("#character-count").textContent = characters.length;
    emptyState.hidden = characters.length > 0;

    characters.forEach((character) => {
      const card = document.createElement("article");
      card.className = "character-card";
      const art = document.createElement("div");
      art.className = "character-art";
      const image = document.createElement("img");
      image.alt = `${character.name}, your saved character`;
      const imageUrl = URL.createObjectURL(character.image);
      activeObjectUrls.push(imageUrl);
      image.src = imageUrl;
      art.append(image);

      const info = document.createElement("div");
      info.className = "character-info";
      const name = document.createElement("p");
      name.className = "character-name";
      name.textContent = character.name;

      const actions = document.createElement("div");
      actions.className = "card-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit ${character.name}`);
      edit.addEventListener("click", () => loadCharacter(character));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-character";
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete ${character.name}`);
      remove.addEventListener("click", () => deleteCharacter(character));
      actions.append(edit, remove);
      info.append(name, actions);
      card.append(art, info);
      grid.append(card);
    });
  } catch (error) {
    console.error("Could not load gallery", error);
    emptyState.hidden = false;
    emptyState.querySelector("h2").textContent = "Gallery unavailable";
    emptyState.querySelector("p").textContent = "This browser could not open saved characters.";
  }
}

function loadCharacter(character) {
  const image = new Image();
  image.onload = () => {
    fillCanvas();
    context.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    currentCharacterId = character.id;
    currentCharacterName = character.name;
    setMotion(character.motion || "wiggle");
    resetHistory();
    updateEmptyHint();
    showView("create");
    showToast(`${character.name} is ready to draw on.`);
  };
  image.src = URL.createObjectURL(character.image);
  image.onload = ((originalOnload) =>
    function onImageLoad(event) {
      URL.revokeObjectURL(image.src);
      originalOnload.call(this, event);
    })(image.onload);
}

async function deleteCharacter(character) {
  if (!window.confirm(`Delete ${character.name}? This can't be undone.`)) return;
  try {
    await withStore("readwrite", (store) => store.delete(character.id));
    if (currentCharacterId === character.id) resetEditor();
    await renderGallery();
    showToast(`${character.name} was deleted.`);
  } catch (error) {
    console.error("Could not delete character", error);
    showToast("Could not delete that character.");
  }
}

function startNewCharacter() {
  resetEditor();
  showView("create");
}

function createCharacterFromCurrentArt() {
  if (emptyHint.classList.contains("is-hidden")) {
    renderStageCharacter();
    showView("stage");
    return;
  }
  showToast("Draw your character before creating it.");
}

canvas.addEventListener("pointerdown", startDrawing);
canvas.addEventListener("pointermove", continueDrawing);
canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
canvas.addEventListener("lostpointercapture", stopDrawing);

document.querySelector("#draw-tool").addEventListener("click", () => setTool("draw"));
document.querySelector("#erase-tool").addEventListener("click", () => setTool("erase"));
document.querySelectorAll(".motion-button").forEach((button) => {
  button.addEventListener("click", () => setMotion(button.dataset.motion));
});
document.querySelectorAll(".background-button").forEach((button) => {
  button.addEventListener("click", () => setBackground(button.dataset.background));
});
document.querySelector("#create-character-button").addEventListener("click", () => {
  renderStageCharacter();
  showView("stage");
});
document.querySelector("#stage-back-button").addEventListener("click", () => showView("create"));
document.querySelectorAll(".swatch").forEach((swatch) => {
  swatch.style.setProperty("--swatch", swatch.dataset.color);
  swatch.addEventListener("click", () => {
    color = swatch.dataset.color;
    document.querySelector("#color-name").textContent = swatch.dataset.name;
    document.querySelectorAll(".swatch").forEach((item) => {
      const selected = item === swatch;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    setTool("draw");
  });
});

document.querySelector("#brush-size").addEventListener("input", (event) => {
  brushSize = Number(event.currentTarget.value);
  document.querySelector("#size-value").textContent = brushSize;
});
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);
document.querySelector("#clear-button").addEventListener("click", () => {
  if (emptyHint.classList.contains("is-hidden") && window.confirm("Clear this drawing and start fresh?")) {
    pushUndo();
    fillCanvas();
  }
});
document.querySelector("#save-button").addEventListener("click", openSaveDialog);
if (document.querySelector("#save-button")) document.querySelector("#save-button").textContent = "Create character";
document.querySelector("#save-form").addEventListener("submit", saveCharacter);
document.querySelector("#cancel-save").addEventListener("click", () => saveDialog.close());
document.querySelector("#gallery-nav").addEventListener("click", () => showView("gallery"));
document.querySelector("#videos-nav").addEventListener("click", () => showView("videos"));
document.querySelector("#home-videos").addEventListener("click", () => showView("videos"));
document.querySelector("#videos-home").addEventListener("click", () => showView("home"));
document.querySelector("#home-nav").addEventListener("click", (event) => {
  event.preventDefault();
  showView("home");
});
document.querySelector("#start-game").addEventListener("click", () => showView("create"));
document.querySelector("#videos-start-game").addEventListener("click", () => showView("create"));
document.querySelector("#back-to-studio").addEventListener("click", () => showView("create"));
document.querySelector("#new-character").addEventListener("click", startNewCharacter);
document.querySelector("#gallery-new-character").addEventListener("click", startNewCharacter);
document.querySelector("#first-drawing").addEventListener("click", startNewCharacter);

fillCanvas();
updateCharacterCount();
