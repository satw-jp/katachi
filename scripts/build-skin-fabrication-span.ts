import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildFabricationSpanCoupon } from "../src/studies/skin/fabrication-span/fabricationSpanCoupon.ts";
import { generateMaterialSpanGcode } from "../src/studies/skin/fabrication-span/fabricationSpanGcode.ts";
import { FABRICATION_SPAN_PRESETS } from "../src/studies/skin/fabrication-span/fabricationSpanPresets.ts";

const repository = process.cwd().replace(/\\/g, "/");
const generatorCommit = execFileSync("git", ["-c", `safe.directory=${repository}`, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const outputDirectory = resolve(process.cwd(), process.argv[2] ?? "../fabrication-span-output");
mkdirSync(outputDirectory, { recursive: true });

for (const preset of FABRICATION_SPAN_PRESETS) {
  const coupon = buildFabricationSpanCoupon(preset.id);
  const artifact = generateMaterialSpanGcode(coupon, { variantId: preset.id, generatorCommit });
  const gcodePath = resolve(outputDirectory, artifact.fileName);
  const metadataPath = resolve(outputDirectory, artifact.fileName.replace(/\.gcode$/, ".json"));
  writeFileSync(gcodePath, artifact.gcode, "utf8");
  writeFileSync(metadataPath, `${JSON.stringify(artifact.metadata, null, 2)}\n`, "utf8");
  console.log(`${gcodePath} ${artifact.lineCount} lines ${artifact.byteLength} bytes`);
}
