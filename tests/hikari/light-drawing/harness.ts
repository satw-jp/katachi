import { LD1_CONTRACT, LD1_EXIT_SURFACE_PRESETS, LD1_FORM_PRESETS, LD1_GEOMETRY, lowerSurfaceAndGradient, mapLd1RayDiagramX, mapLd1RayDiagramY, physicalDisplayRgb, reliefAndGradient, runLd1Reference, type Ld1ExitSurfaceMode, type Ld1Form, type Ld1ReferenceResult, type RaySegment } from "../../../src/studies/cloud-sculpt/lightDrawing/ld1Reference.ts";

const amplitude = document.querySelector<HTMLInputElement>("#amplitude")!;
const form = document.querySelector<HTMLSelectElement>("#form")!;
const exitSurface = document.querySelector<HTMLSelectElement>("#exit-surface")!;
const value = document.querySelector<HTMLOutputElement>("#amplitude-value")!;
const ridgePosition = document.querySelector<HTMLInputElement>("#ridge-position")!;
const ridgePositionValue = document.querySelector<HTMLOutputElement>("#ridge-position-value")!;
const ridgeBend = document.querySelector<HTMLInputElement>("#ridge-bend")!;
const ridgeBendValue = document.querySelector<HTMLOutputElement>("#ridge-bend-value")!;
const state = document.querySelector<HTMLElement>("#compute-state")!;
const chips = document.querySelector<HTMLElement>("#chips")!;
const offCanvas = document.querySelector<HTMLCanvasElement>("#off-canvas")!;
const onCanvas = document.querySelector<HTMLCanvasElement>("#on-canvas")!;
const deltaCanvas = document.querySelector<HTMLCanvasElement>("#delta-canvas")!;
const heightCanvas = document.querySelector<HTMLCanvasElement>("#height-canvas")!;
const profileCanvas = document.querySelector<HTMLCanvasElement>("#profile-canvas")!;
const rayCanvas = document.querySelector<HTMLCanvasElement>("#ray-canvas")!;
let pending = 0;

chips.innerHTML = [["CPU-only", "deterministic synchronous reference"], ["Seed", LD1_CONTRACT.seed], ["Samples", String(LD1_CONTRACT.sampleCount)], ["Source", `${LD1_CONTRACT.sourceAngularRadiusDegrees}° angular radius`], ["IOR", String(LD1_CONTRACT.ior)], ["Receiver", `y ${LD1_CONTRACT.receiverY}`], ["Reconstruction", `fixed ${LD1_CONTRACT.reconstructionRadiusTexels}-texel energy-normalized reconstruction`]].map(([k, v]) => `<span class="chip"><b>${k}</b>${v}</span>`).join("");
form.innerHTML = LD1_FORM_PRESETS.map((preset) => `<option value="${preset.value}">${preset.label} / ${preset.plainLabel}</option>`).join("");
exitSurface.innerHTML = LD1_EXIT_SURFACE_PRESETS.map((preset) => `<option value="${preset.value}">${preset.label} / ${preset.plainLabel}</option>`).join("");
// The harness intentionally opens on the controlled connected-ridge × opposing-exit comparison.
form.value = "connected-ridge";
exitSurface.value = "opposing";

function draw(result: Ld1ReferenceResult): void {
  drawPhysical(offCanvas, physicalDisplayRgb(result.off.field, result.config));
  drawPhysical(onCanvas, physicalDisplayRgb(result.on.field, result.config));
  drawDifference(deltaCanvas, result.signedDifference, result.config.displayScale / result.off.field.texelArea);
  metrics("#off-metrics", result.off, "OFF"); metrics("#on-metrics", result.on, "ON");
  const delta = result.centroidDelta; document.querySelector("#delta-metrics")!.innerHTML = rows([["signed |Δ|", sum(result.absoluteDifference).toExponential(3)], ["centroid Δ", delta ? `${delta.u.toFixed(4)}, ${delta.v.toFixed(4)}` : "—"], ["support", `${result.support.filter(Boolean).length} causal texels`], ["display", `fixed ×${result.config.displayScale}`]]);
  drawHeight(result); drawProfile(result); drawRays(result);
}
function metrics(selector: string, scenario: Ld1ReferenceResult["off"], label: string): void { const f = scenario.ledger; document.querySelector(selector)!.innerHTML = rows([["interface exit (intermediate)", rgb(f.interfaceExit)], ["receiver hit (raw)", rgb(f.deposited)], ["accepted / rejected", `${rgb(f.accepted)} / ${rgb(f.rejected)}`], ["escaped / TIR", `${rgb(f.escaped)} / ${rgb(f.tir)}`], ["centroid", scenario.centroid ? `${scenario.centroid.u.toFixed(4)}, ${scenario.centroid.v.toFixed(4)}` : "—"], ["sampling / containment", `${f.deliveredCount} delivered rays · ${f.supportRejectedTexelCount} clipped texels`]]); void label; }
function rows(values: Array<[string, string]>): string { return values.map(([k,v]) => `<dt>${k}</dt><dd>${v}</dd>`).join(""); }
function rgb(v: {r:number;g:number;b:number}): string { return `${v.r.toFixed(4)} / ${v.g.toFixed(4)} / ${v.b.toFixed(4)}`; }
function sum(values: Float32Array): number { let total = 0; for (const value of values) total += value; return total; }
function drawPhysical(canvas: HTMLCanvasElement, values: Float32Array): void { const side = Math.sqrt(values.length / 3); resizeRasterCanvas(canvas, side); const context = canvas.getContext("2d")!; const image = context.createImageData(side, side); for (let i=0;i<side*side;i++) { const offset=i*3; const target=i*4; image.data[target]=tone(values[offset]); image.data[target+1]=tone(values[offset+1]); image.data[target+2]=tone(values[offset+2]); image.data[target+3]=255; } context.putImageData(image,0,0); }
function drawDifference(canvas: HTMLCanvasElement, values: Float32Array, scale: number): void { const side=Math.sqrt(values.length/3); resizeRasterCanvas(canvas, side); const context=canvas.getContext("2d")!; const image=context.createImageData(side,side); for(let i=0;i<side*side;i++){const d=(values[i*3]+values[i*3+1]+values[i*3+2])/3*scale; const a=Math.min(1,Math.abs(d)*1.3); const j=i*4; image.data[j]=d<0?Math.round(238*a):Math.round(40*a); image.data[j+1]=d<0?Math.round(94*a):Math.round(214*a); image.data[j+2]=d<0?Math.round(104*a):Math.round(230*a); image.data[j+3]=255;} context.putImageData(image,0,0); }
function resizeRasterCanvas(canvas: HTMLCanvasElement, side: number): void { if (canvas.width !== side || canvas.height !== side) { canvas.width = side; canvas.height = side; } }
function tone(value: number): number { return Math.round(255 * Math.max(0, Math.min(1, value / (1 + value)))); }
function drawHeight(result: Ld1ReferenceResult): void {
  const side=heightCanvas.width; const context=heightCanvas.getContext("2d")!; const image=context.createImageData(side,side);
  let minThickness=Infinity,maxThickness=-Infinity;
  for(let j=0;j<side;j++)for(let i=0;i<side;i++){
    const x=-1.08+(i+.5)/side*2.16; const z=-1.08+(j+.5)/side*2.16;
    const upper=reliefAndGradient(x,z,result.config.bulgeAmplitude,result.config.form,result.config.ridgePosition,result.config.ridgeBend);
    const lower=lowerSurfaceAndGradient(x,z,result.config.bulgeAmplitude,result.config.form,result.config.exitSurfaceMode,result.config.ridgePosition,result.config.ridgeBend);
    const thickness=LD1_GEOMETRY.baseTopY+upper.relief-lower.height;
    minThickness=Math.min(minThickness,thickness); maxThickness=Math.max(maxThickness,thickness);
    const normalized=Math.max(-1,Math.min(1,(thickness-LD1_GEOMETRY.baseTopY)/(result.config.bulgeAmplitude*1.5) || 0));
    const k=(j*side+i)*4;
    image.data[k]=normalized<0?Math.round(67+150*-normalized):Math.round(67+40*normalized);
    image.data[k+1]=normalized<0?Math.round(99+50*-normalized):Math.round(125+105*normalized);
    image.data[k+2]=normalized<0?Math.round(136+30*-normalized):Math.round(157+68*normalized);
    image.data[k+3]=255;
  }
  context.putImageData(image,0,0);
  const formPreset=LD1_FORM_PRESETS.find((item)=>item.value===result.config.form)!;
  const exitPreset=LD1_EXIT_SURFACE_PRESETS.find((item)=>item.value===result.config.exitSurfaceMode)!;
  document.querySelector("#height-note")!.textContent=`${formPreset.label} × ${exitPreset.label}：色は表面と向こう側の間の縦の厚み ${minThickness.toFixed(3)}…${maxThickness.toFixed(3)}。受け面に描いた模様ではありません。`;
}
function drawProfile(result: Ld1ReferenceResult): void {
  const c=profileCanvas.getContext("2d")!; const w=profileCanvas.width,h=profileCanvas.height; const minY=-.19,maxY=.70,left=40,right=w-24,top=22,bottom=h-30;
  const mapY=(y:number)=>bottom-(y-minY)/(maxY-minY)*(bottom-top); const px=(index:number)=>left+(right-left)*index/(result.profile.length-1);
  c.clearRect(0,0,w,h); c.font="12px system-ui"; c.lineWidth=1;
  for(const [y,label,color] of [[0,"flat exit reference y=0","#5d6d7a"],[.34,"flat upper reference y=0.340","#425a69"]] as const){c.strokeStyle=color;c.setLineDash([4,4]);c.beginPath();c.moveTo(left,mapY(y));c.lineTo(right,mapY(y));c.stroke();c.setLineDash([]);c.fillStyle=color;c.fillText(label,left+4,mapY(y)-6);}
  const points=result.profile;
  c.fillStyle="rgba(91,196,207,.10)"; c.beginPath(); points.forEach((p,i)=>i?c.lineTo(px(i),mapY(p.topY)):c.moveTo(px(i),mapY(p.topY))); for(let i=points.length-1;i>=0;i--)c.lineTo(px(i),mapY(points[i].lowerY)); c.closePath(); c.fill();
  for(const [key,color] of [["topY","#77dce6"],["lowerY","#efb86d"]] as const){c.strokeStyle=color;c.lineWidth=3;c.beginPath();points.forEach((p,i)=>i?c.lineTo(px(i),mapY(p[key])):c.moveTo(px(i),mapY(p[key])));c.stroke();}
  const minThickness=Math.min(...points.map((p)=>p.thickness)); const maxThickness=Math.max(...points.map((p)=>p.thickness));
  c.fillStyle="#77dce6"; c.fillText(`surface / 表面 · z=0 section`,left,16); c.fillStyle="#efb86d"; c.fillText(`far side / 向こう側 · vertical thickness ${minThickness.toFixed(3)}…${maxThickness.toFixed(3)} · fixed y ${minY.toFixed(2)}…${maxY.toFixed(2)}`,left,32);
}
function drawRays(result: Ld1ReferenceResult): void {
  const c=rayCanvas.getContext("2d")!;const w=rayCanvas.width,h=rayCanvas.height;const x=(v:number)=>mapLd1RayDiagramX(v)*w;const y=(v:number)=>mapLd1RayDiagramY(v)*h;const labelX=x(-1.47);
  const guide=(physicalY:number,label:string,color="#2b3e4e")=>{c.strokeStyle=color;c.lineWidth=1;c.setLineDash([4,4]);c.beginPath();c.moveTo(0,y(physicalY));c.lineTo(w,y(physicalY));c.stroke();c.setLineDash([]);c.fillStyle="#9bb0c0";c.fillText(label,labelX,y(physicalY)-6);};
  c.clearRect(0,0,w,h);c.font="12px system-ui";guide(LD1_GEOMETRY.sourceY,"finite source y=1.350");guide(LD1_GEOMETRY.lowerY,"flat exit reference y=0");guide(result.config.receiverY,`fixed receiver y=${result.config.receiverY.toFixed(3)}`);
  const profile=result.profile;
  for(const [key,color] of [["topY","#5bc4cf"],["lowerY","#efb86d"]] as const){c.strokeStyle=color;c.lineWidth=2;c.beginPath();profile.forEach((p,i)=>i?c.lineTo(x(p.x),y(p[key])):c.moveTo(x(p.x),y(p[key])));c.stroke();}
  c.fillStyle="#79dce6";c.fillText("surface z=0 section",labelX,y(Math.max(...profile.map((p)=>p.topY)))-6);c.fillStyle="#efb86d";c.fillText("far side z=0 section",labelX,y(Math.min(...profile.map((p)=>p.lowerY)))+16);
  const segments=result.on.representative.flatMap((r)=>[r.incident,r.inside,r.outgoing].filter(Boolean) as RaySegment[]).slice(0,9);
  segments.forEach((s,i)=>{c.strokeStyle=["#f0cc82","#79dce6","#b8eff0"][i%3];c.lineWidth=1.4;c.beginPath();c.moveTo(x(s.from.x),y(s.from.y));c.lineTo(x(s.to.x),y(s.to.y));c.stroke();});
  c.fillStyle="#a8bac8";c.fillText("rays: x–y projections (their z can differ from the section)",labelX,h-8);
}
function schedule(): void {
  value.value=Number(amplitude.value).toFixed(3);
  ridgePositionValue.value=Number(ridgePosition.value).toFixed(2);
  ridgeBendValue.value=Number(ridgeBend.value).toFixed(2);
  const gesturesApply=form.value === "connected-ridge";
  for (const input of [ridgePosition, ridgeBend]) input.disabled=!gesturesApply;
  for (const control of document.querySelectorAll<HTMLElement>(".gesture-control")) control.classList.toggle("ignored",!gesturesApply);
  const formPreset=LD1_FORM_PRESETS.find((item)=>item.value===form.value)!;
  const exitPreset=LD1_EXIT_SURFACE_PRESETS.find((item)=>item.value===exitSurface.value)!;
  document.querySelector("#form-explanation")!.textContent=`${formPreset.description}。選んだ形から、光を毎回あらためて計算します。${gesturesApply ? " 稜線の位置と曲がりは、この局所の制御された readiness 比較だけに使います。" : " 稜線の位置と曲がりは connected ridge 以外では無視されます。"}`;
  document.querySelector("#exit-explanation")!.textContent=`${exitPreset.description}。表面・光・受け面は同じままです。`;
  state.textContent="tracing deterministic CPU samples…"; cancelAnimationFrame(pending);
  pending=requestAnimationFrame(()=>{draw(runLd1Reference({bulgeAmplitude:Number(amplitude.value),form:form.value as Ld1Form,exitSurfaceMode:exitSurface.value as Ld1ExitSurfaceMode,ridgePosition:Number(ridgePosition.value),ridgeBend:Number(ridgeBend.value)}));state.textContent="CPU trace ready · fixed exposure / support";});
}
amplitude.addEventListener("input",schedule); ridgePosition.addEventListener("input",schedule); ridgeBend.addEventListener("input",schedule); form.addEventListener("change",schedule); exitSurface.addEventListener("change",schedule); document.querySelector<HTMLButtonElement>("#reset")!.addEventListener("click",()=>{amplitude.value="0.18";form.value="connected-ridge";exitSurface.value="opposing";ridgePosition.value="0";ridgeBend.value="0";schedule();}); window.addEventListener("beforeunload",()=>cancelAnimationFrame(pending),{once:true}); schedule();
