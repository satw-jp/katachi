export function createVersionRow(version: string, updatedAt: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "version-row";
  row.textContent = `v${version} · updated ${updatedAt}`;
  return row;
}
