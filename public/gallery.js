/* Static asset gallery. Never changes story variants, approved assets, or user data. */
"use strict";

const galleryPage = document.getElementById("page-gallery");
const galleryGroups = [...galleryPage.querySelectorAll("[data-gallery-group]")];
const galleryItems = document.getElementById("gallery-asset-list");
const galleryTitle = document.getElementById("gallery-image-title");
const galleryDescription = document.getElementById("gallery-description");
const galleryViewModes = document.getElementById("gallery-view-modes");
const galleryVersionControls = document.getElementById("gallery-version-controls");
const galleryCanvases = document.getElementById("gallery-canvases");
const galleryTryHome = document.getElementById("gallery-try-home");
const galleryModeButtons = [...galleryPage.querySelectorAll("[data-gallery-mode]")];
const galleryVersionButtons = [...galleryPage.querySelectorAll("[data-gallery-version]")];

let galleryCatalog = null;
let galleryLoad = null;
let selectedGroupId = "story";
let selectedItemId = "normal";
let selectedVersion = "before";
let selectedMode = "switch";

function galleryAssetUrl(url) {
  // The manifest is a curated, public list of static WebP assets only.
  return typeof url === "string" && /^\/assets\/shiori\/[a-zA-Z0-9/_-]+\.webp$/.test(url) ? url : "";
}

function galleryElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function galleryFrame(item, version, label) {
  const figure = galleryElement("figure", "gallery-figure");
  const stage = galleryElement("div", "gallery-portrait-stage");
  const img = document.createElement("img");
  img.src = galleryAssetUrl(item.versions[version]);
  img.alt = item.label + "（" + label + "）";
  img.decoding = "async";
  img.draggable = false;
  const caption = galleryElement("figcaption", "gallery-image-caption", label + " · 読み込み中");
  img.addEventListener("load", () => {
    caption.textContent = label + " · " + img.naturalWidth + " × " + img.naturalHeight + " px";
  }, { once: true });
  img.addEventListener("error", () => {
    caption.textContent = label + " · 画像を読み込めませんでした";
  }, { once: true });
  stage.append(img);
  figure.append(stage, caption);
  return figure;
}

function renderGallery() {
  if (!galleryCatalog || galleryPage.hidden) return;
  const group = galleryCatalog.groups.find((g) => g.id === selectedGroupId) || galleryCatalog.groups[0];
  if (!group || !group.items.length) return;
  selectedGroupId = group.id;
  const item = group.items.find((entry) => entry.id === selectedItemId) || group.items[0];
  selectedItemId = item.id;
  const comparable = Boolean(galleryAssetUrl(item.versions.before) && galleryAssetUrl(item.versions.after));

  for (const button of galleryGroups) {
    const selected = button.dataset.galleryGroup === selectedGroupId;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-selected", selected);
  }

  const itemButtons = group.items.map((entry) => {
    const button = galleryElement("button", "gallery-asset-button");
    button.type = "button";
    button.dataset.galleryItem = entry.id;
    const selected = entry.id === selectedItemId;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", entry.label + "を表示");
    button.classList.toggle("is-selected", selected);
    const thumb = document.createElement("img");
    thumb.src = galleryAssetUrl(entry.versions[entry.adoptedVersion] || entry.versions.before || entry.versions.current);
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.decoding = "async";
    const label = galleryElement("span", "", entry.label);
    button.append(thumb, label);
    return button;
  });
  galleryItems.replaceChildren(...itemButtons);

  galleryTryHome.hidden = group.id !== "private-v2";
  galleryTitle.textContent = group.label + " · " + item.label +
    (item.adoptedVersion ? (item.adoptedVersion === "current" ? "（採用済み）" : "（採用：修正前）") : "");
  galleryViewModes.hidden = !comparable;
  galleryVersionControls.hidden = !comparable;
  for (const button of galleryModeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.galleryMode === selectedMode));
  }
  for (const button of galleryVersionButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.galleryVersion === selectedVersion));
  }

  const isSideBySide = comparable && selectedMode === "side";
  galleryCanvases.classList.toggle("is-side-by-side", isSideBySide);
  if (isSideBySide) {
    galleryCanvases.replaceChildren(
      galleryFrame(item, "before", "修正前"),
      galleryFrame(item, "after", "修正後")
    );
  } else {
    const version = comparable ? selectedVersion : "current";
    galleryCanvases.replaceChildren(
      galleryFrame(item, version, comparable ? (version === "before" ? "修正前" : "修正後") : (item.adoptedVersion ? "採用版" : "登録素材"))
    );
  }
  galleryDescription.textContent = group.id === "private-v2"
    ? "試験素材（未正式採用）。1086 × 1448 px、5表情共通の表示枠です。閲覧のみではホームに反映されません。"
    : comparable
      ? (isSideBySide
        ? "左右にスクロールして比較できます。画像の透明余白や人物位置は補正していません。"
        : "修正前・修正後を同じ表示枠で切り替えられます。透明余白や人物位置は補正していません。")
      : "採用済みの画像です。旧差分は整理済みです。";
}

async function loadGallery() {
  if (galleryCatalog) { renderGallery(); return; }
  if (galleryLoad) return galleryLoad;
  galleryDescription.textContent = "ギャラリーを読み込み中…";
  galleryLoad = (async () => {
    try {
      const response = await fetch("/data/shiori-gallery.json");
      if (!response.ok) throw new Error("manifest unavailable");
      const payload = await response.json();
      if (payload.schema !== 1 || !Array.isArray(payload.groups) || !payload.groups.length ||
          payload.groups.some((group) =>
            typeof group.id !== "string" || !Array.isArray(group.items) || !group.items.length ||
            group.items.some((item) =>
              typeof item.id !== "string" || typeof item.label !== "string" ||
              !item.versions || !galleryAssetUrl(item.versions.before || item.versions.current) ||
              (item.versions.after && !galleryAssetUrl(item.versions.after))
            ))) throw new Error("invalid gallery manifest");
      galleryCatalog = payload;
      renderGallery();
    } catch {
      galleryDescription.textContent = "素材一覧を読み込めません。画面を開き直すと再試行します。";
    } finally {
      galleryLoad = null;
    }
  })();
  return galleryLoad;
}

galleryGroups.forEach((button) => button.addEventListener("click", () => {
  selectedGroupId = button.dataset.galleryGroup;
  selectedItemId = "";
  renderGallery();
}));
galleryItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-gallery-item]");
  if (!button || !galleryItems.contains(button)) return;
  selectedItemId = button.dataset.galleryItem;
  const currentGroup = galleryCatalog?.groups.find((group) => group.id === selectedGroupId);
  selectedVersion = currentGroup?.items.find((item) => item.id === selectedItemId)?.adoptedVersion || "before";
  renderGallery();
});
galleryModeButtons.forEach((button) => button.addEventListener("click", () => {
  selectedMode = button.dataset.galleryMode;
  renderGallery();
}));
galleryVersionButtons.forEach((button) => button.addEventListener("click", () => {
  selectedVersion = button.dataset.galleryVersion;
  renderGallery();
}));

galleryTryHome.addEventListener("click", () => {
  if (selectedGroupId !== "private-v2" ||
      !galleryCatalog?.groups.find(({ id }) => id === "private-v2")?.items.some(({ id }) => id === selectedItemId)) return;
  galleryDescription.textContent = "試験画像5枚を確認中…";
  window.dispatchEvent(new CustomEvent("shiori:try-private-v2", {
    detail: { expression: selectedItemId }
  }));
});
window.addEventListener("shiori:private-v2-result", (event) => {
  if (!event.detail?.ok && selectedGroupId === "private-v2") {
    galleryDescription.textContent = "試験素材の読み込み検査に失敗しました。ホームの衣装は変更していません。";
  }
});

// Opening an authenticated gallery is the only trigger for the first asset request.
// No images are fetched during login or on unrelated screens.
new MutationObserver(() => { if (!galleryPage.hidden) void loadGallery(); })
  .observe(galleryPage, { attributes: true, attributeFilter: ["hidden"] });
if (!galleryPage.hidden) void loadGallery();
