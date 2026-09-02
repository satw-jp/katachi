import "./artIndex.css";
import {
  NETWORK_FORMATION_ARTWORK_ORDER,
  networkFormationVariant,
} from "./rebuild/networkFormation.ts";

const root = document.getElementById("skin-art-index");
if (!root) throw new Error("SKIN ART index root is missing");
root.className = "skin-art-index";

const setActiveWork = (workId: string | null): void => {
  if (workId) root.dataset.activeWork = workId;
  else delete root.dataset.activeWork;
};

const makeLabel = (text: string, className: string): HTMLElement => {
  const label = document.createElement("span");
  label.className = className;
  label.textContent = text;
  return label;
};

const header = document.createElement("header");
header.className = "skin-art-index-header";
const mark = document.createElement("a");
mark.className = "skin-art-index-mark";
mark.href = "../skin-art/";
mark.setAttribute("aria-label", "SKIN ART index");
mark.append(makeLabel("KATACHI", "skin-art-index-mark-name"), makeLabel("SKIN ART", "skin-art-index-mark-subtitle"));
const headerMeta = document.createElement("span");
headerMeta.className = "skin-art-index-header-meta";
headerMeta.textContent = "PRESENTATION / NETWORK";
const visualStudiesLink = document.createElement("a");
visualStudiesLink.className = "skin-art-index-studies-link";
visualStudiesLink.href = "./studies/";
visualStudiesLink.textContent = "VISUAL STUDIES ↗";
const conceptMoviesLink = document.createElement("a");
conceptMoviesLink.className = "skin-art-index-studies-link";
conceptMoviesLink.href = "./concepts/";
conceptMoviesLink.textContent = "CONCEPT MOVIES ↗";
header.append(mark, headerMeta, visualStudiesLink, conceptMoviesLink);

const field = document.createElement("div");
field.className = "skin-art-index-field";
field.setAttribute("aria-hidden", "true");
const fieldNumber = document.createElement("span");
fieldNumber.className = "skin-art-index-field-number";
fieldNumber.textContent = "00";
const fieldRule = document.createElement("span");
fieldRule.className = "skin-art-index-field-rule";
field.append(fieldNumber, fieldRule);

const hero = document.createElement("section");
hero.className = "skin-art-index-hero";
hero.append(makeLabel("A COMPLETED GRAPH / TEN READINGS", "skin-art-index-eyebrow"));
const title = document.createElement("h1");
title.textContent = "SKIN ART";
const intro = document.createElement("p");
intro.className = "skin-art-index-intro";
intro.textContent = "A network is not only assembled. It is read, tested, rejected, and allowed to settle.";
hero.append(title, intro);

const featured = document.createElement("a");
featured.className = "skin-art-index-featured";
featured.href = "../skin-rebuild.html";
featured.addEventListener("pointerenter", () => setActiveWork("featured"));
featured.addEventListener("pointerleave", () => setActiveWork(null));
featured.addEventListener("focus", () => setActiveWork("featured"));
featured.addEventListener("blur", () => setActiveWork(null));
const featuredNumber = makeLabel("00", "skin-art-index-featured-number");
const featuredCopy = document.createElement("span");
featuredCopy.className = "skin-art-index-featured-copy";
featuredCopy.append(
  makeLabel("FEATURED", "skin-art-index-featured-kicker"),
  makeLabel("FORMATION", "skin-art-index-featured-title"),
  makeLabel("TRACE · RADIAL BLOOM · CONFLUENCE · THICKNESS", "skin-art-index-featured-detail"),
);
const featuredArrow = makeLabel("ENTER ↗", "skin-art-index-featured-arrow");
featured.append(featuredNumber, featuredCopy, featuredArrow);

const worksSection = document.createElement("section");
worksSection.className = "skin-art-index-works";
const worksHeading = document.createElement("div");
worksHeading.className = "skin-art-index-works-heading";
const worksHeadingTitle = makeLabel("THE WORKS", "skin-art-index-works-title");
const worksHeadingMeta = makeLabel("TEN TRAVERSALS / ONE GRAPH", "skin-art-index-works-meta");
const copyListButton = document.createElement("button");
copyListButton.type = "button";
copyListButton.className = "skin-art-index-copy-list";
copyListButton.textContent = "COPY LIST";
copyListButton.setAttribute("aria-label", "Copy the ten SKIN ART works");
const copyListText = NETWORK_FORMATION_ARTWORK_ORDER.map((workId, index) => (
  `${String(index + 1).padStart(2, "0")} ${networkFormationVariant(workId).label}`
)).join("\n");
copyListButton.addEventListener("click", async () => {
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(copyListText);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (!copied) {
    const textarea = document.createElement("textarea");
    textarea.value = copyListText;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    copied = document.execCommand("copy");
    textarea.remove();
  }
  copyListButton.textContent = copied ? "COPIED" : "COPY FAILED";
  window.setTimeout(() => { copyListButton.textContent = "COPY LIST"; }, 1800);
});
worksHeading.append(worksHeadingTitle, worksHeadingMeta, copyListButton);
const workList = document.createElement("ol");
workList.className = "skin-art-index-work-list";

NETWORK_FORMATION_ARTWORK_ORDER.forEach((workId, index) => {
  const variant = networkFormationVariant(workId);
  const item = document.createElement("li");
  const link = document.createElement("a");
  item.className = "skin-art-index-work-item";
  link.className = "skin-art-index-work-link";
  link.dataset.workId = workId;
  link.href = `../skin-rebuild.html?work=${encodeURIComponent(workId)}`;
  link.setAttribute("aria-label", `Open work ${String(index + 1).padStart(2, "0")}, ${variant.label}`);
  link.append(
    makeLabel(String(index + 1).padStart(2, "0"), "skin-art-index-work-number"),
    makeLabel(variant.label, "skin-art-index-work-title"),
    makeLabel(variant.description, "skin-art-index-work-description"),
    makeLabel("↗", "skin-art-index-work-arrow"),
  );
  link.addEventListener("pointerenter", () => { setActiveWork(workId); fieldNumber.textContent = String(index + 1).padStart(2, "0"); });
  link.addEventListener("pointerleave", () => setActiveWork(null));
  link.addEventListener("focus", () => { setActiveWork(workId); fieldNumber.textContent = String(index + 1).padStart(2, "0"); });
  link.addEventListener("blur", () => setActiveWork(null));
  item.append(link);
  workList.append(item);
});
worksSection.append(worksHeading, workList);

const footer = document.createElement("footer");
footer.className = "skin-art-index-footer";
footer.append(makeLabel("SELECT A WORK TO ENTER FULLSCREEN", "skin-art-index-footer-prompt"), makeLabel("AUTOPLAY / REPLAY / INDEX", "skin-art-index-footer-meta"));

root.append(header, field, hero, featured, worksSection, footer);
