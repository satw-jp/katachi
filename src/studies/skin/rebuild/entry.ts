const mode = new URLSearchParams(window.location.search).get("mode");
if (mode === "creation") {
  void import("../creation/main.ts");
} else if (mode === "composition") {
  void import("../composition/main.ts");
} else {
  void import("../main.ts");
}
