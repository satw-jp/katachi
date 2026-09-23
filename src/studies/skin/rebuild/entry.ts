const compositionMode = new URLSearchParams(window.location.search).get("mode") === "composition";
if (compositionMode) {
  void import("../composition/main.ts");
} else {
  void import("../main.ts");
}
