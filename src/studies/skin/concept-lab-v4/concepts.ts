import * as THREE from "three";
import { makeSeededRandom } from "./seed.ts";
import type { ConceptBuildContext, ConceptFrameContext, ConceptInstance } from "./conceptTypes.ts";
import type { ConceptEdge } from "./sourceAdapter.ts";
import type { ParameterValue } from "./parameterStore.ts";

function numberParam(parameters: Readonly<Record<string, ParameterValue>>, id: string, fallback: number): number {
  const value = parameters[id];
  return typeof value === "number" ? value : fallback;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

function color(ctx: ConceptBuildContext, index: number, lightness = 0): THREE.Color {
  const palette = [ctx.colors.primary, ctx.colors.secondary, ctx.colors.highlight, ctx.colors.accent, ctx.colors.shadow];
  return new THREE.Color(palette[index % palette.length]).lerp(new THREE.Color(0xf8eee0), clamp01(lightness));
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const drawable = child as THREE.Mesh;
    drawable.geometry?.dispose();
    const material = drawable.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose();
  });
}

function line(points: readonly THREE.Vector3[], material: THREE.LineBasicMaterial): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([...points]);
  return new THREE.Line(geometry, material);
}

function lineMaterial(colorValue: THREE.Color, opacity: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: colorValue,
    transparent: true,
    opacity: Math.min(0.82, opacity * 1.75),
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function sphere(position: THREE.Vector3, radius: number, material: THREE.Material, segments = 10): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(6, segments - 2)), material);
  mesh.position.copy(position);
  return mesh;
}

function curveBetween(start: THREE.Vector3, end: THREE.Vector3, bend: THREE.Vector3, segments = 8): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const u = index / segments;
    points.push(start.clone().lerp(end, u).addScaledVector(bend, Math.sin(Math.PI * u)));
  }
  return points;
}

function edgeLine(edge: ConceptEdge, bend: THREE.Vector3, material: THREE.LineBasicMaterial): THREE.Line {
  return line(curveBetween(edge.start, edge.end, bend), material);
}

function projectedPerpendicular(direction: THREE.Vector3): THREE.Vector3 {
  const axis = Math.abs(direction.z) < 0.8 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  return direction.clone().cross(axis).normalize();
}

class GroupInstance implements ConceptInstance {
  private readonly params: Record<string, ParameterValue>;
  private readonly group: THREE.Group;
  private readonly label: string;
  private readonly updateFn: (frame: ConceptFrameContext, params: Readonly<Record<string, ParameterValue>>) => void;

  constructor(
    group: THREE.Group,
    label: string,
    initial: Readonly<Record<string, ParameterValue>>,
    updateFn: (frame: ConceptFrameContext, params: Readonly<Record<string, ParameterValue>>) => void,
  ) {
    this.group = group;
    this.label = label;
    this.updateFn = updateFn;
    this.params = { ...initial };
  }

  update(frame: ConceptFrameContext): void { this.updateFn(frame, this.params); }
  applyUniformParameters(parameters: Readonly<Record<string, ParameterValue>>): void { Object.assign(this.params, parameters); }
  captureState(): unknown { return { label: this.label, parameters: { ...this.params } }; }
  dispose(): void { this.group.parent?.remove(this.group); disposeObject(this.group); }
}

function createMaterial(ctx: ConceptBuildContext, index: number, opacity: number, transparent = true): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: color(ctx, index),
    transparent,
    opacity: Math.min(0.9, opacity * 1.22),
    depthWrite: false,
    blending: transparent ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
  });
}

function applyAppearance(material: THREE.Material, params: Readonly<Record<string, ParameterValue>>, multiplier = 1): void {
  const basic = material as THREE.MeshBasicMaterial;
  const contrast = 0.72 + numberParam(params, "localContrast", 1.2) * 0.28;
  basic.opacity = clamp01(numberParam(params, "exposure", 1.25) * multiplier * 0.48 * contrast + numberParam(params, "blackRetention", 0.48) * 0.08);
}

function alpha(params: Readonly<Record<string, ParameterValue>>, base: number, multiplier = 1): number {
  const exposure = 1.3 + numberParam(params, "exposure", 1.25) * 0.45;
  const contrast = 0.65 + (0.72 + numberParam(params, "localContrast", 1.2) * 0.28) * 0.35;
  return Math.min(0.94, base * exposure * contrast * multiplier);
}

function makeWeightOfHesitation(ctx: ConceptBuildContext): ConceptInstance {
  const group = new THREE.Group();
  const lines: Array<{ edge: ConceptEdge; object: THREE.Line; material: THREE.LineBasicMaterial; phase: number }> = [];
  const random = makeSeededRandom(ctx.seed);
  for (const [index, edge] of ctx.source.edges.entries()) {
    if (index % 7 !== 0) continue;
    const material = lineMaterial(color(ctx, index, edge.supportRole * 0.1), 0.11 + edge.directionChange * 0.12);
    const object = edgeLine(edge, new THREE.Vector3(), material);
    group.add(object);
    lines.push({ edge, object, material, phase: random() });
  }
  const catches = ctx.source.motifs.slice(0, 8).map((motif, index) => {
    const material = createMaterial(ctx, index + 2, 0.18);
    const object = sphere(motif.center, motif.scale * 0.8, material, 9);
    group.add(object);
    return { object, material, phase: random() };
  });
  ctx.scene.add(group);
  return new GroupInstance(group, "weight-of-hesitation", ctx.parameters, (frame, params) => {
    const gravity = numberParam(params, "gravity", 0.9);
    const sagAmount = numberParam(params, "sag", 0.75) * gravity;
    const tremor = numberParam(params, "tremor", 0.7);
    const catchStiffness = numberParam(params, "catchStiffness", 1);
    for (const [index, item] of lines.entries()) {
      const edge = item.edge;
      const direction = edge.direction;
      const lateral = projectedPerpendicular(direction);
      const catchPulse = 0.5 + 0.5 * Math.sin(frame.elapsedSeconds * (0.31 + item.phase * 0.2) + item.phase * 18);
      const weight = sagAmount * (0.35 + edge.directionChange * 0.7 + edge.length * 0.06) * (1 - clamp01(edge.connectivity * catchStiffness * 0.45));
      const bend = new THREE.Vector3(0, -weight * (0.7 + 0.2 * Math.sin(item.phase * 21)), 0)
        .addScaledVector(lateral, Math.sin(frame.elapsedSeconds * 0.42 + item.phase * 16) * tremor * 0.055 * (0.4 + edge.directionChange))
        .addScaledVector(direction, Math.sin(frame.elapsedSeconds * 0.17 + item.phase * 9) * weight * 0.07);
      const points = curveBetween(edge.start, edge.end, bend, 8);
      const position = item.object.geometry.getAttribute("position") as THREE.BufferAttribute;
      points.forEach((point, pointIndex) => position.setXYZ(pointIndex, point.x, point.y, point.z));
      position.needsUpdate = true;
      item.material.opacity = alpha(params, 0.08 + edge.directionChange * 0.16, 1.55) * (0.6 + catchPulse * 0.4);
      item.object.scale.setScalar(0.96 + catchPulse * 0.06);
      if (index % 3 === 0) item.object.renderOrder = 2;
    }
    for (const item of catches) {
      const pulse = 0.5 + 0.5 * Math.sin(frame.elapsedSeconds * 0.24 + item.phase * 20);
      item.object.scale.setScalar(0.92 + pulse * 0.18);
      item.material.opacity = alpha(params, 0.1 + pulse * 0.18 * numberParam(params, "catchStiffness", 1), 1.2);
      applyAppearance(item.material, params, 1 + pulse * 0.25);
    }
  });
}

function makeMutualRescue(ctx: ConceptBuildContext): ConceptInstance {
  const group = new THREE.Group();
  const random = makeSeededRandom(ctx.seed ^ 0x21ad);
  const bodies = ctx.source.motifs.map((motif, index) => {
    const material = createMaterial(ctx, index, 0.36);
    const object = sphere(motif.center, motif.scale * 1.22, material, 9);
    group.add(object);
    const velocity = new THREE.Vector3();
    const release = 0.15 + random() * 4.5 + (index % 5) * 0.2;
    const target = ctx.source.motifs[(index * 7 + 3) % Math.max(1, ctx.source.motifs.length)]?.center.clone() ?? motif.center.clone();
    return { object, material, position: motif.center.clone(), velocity, target, release, phase: random(), rescued: false };
  });
  const connectors = bodies.map((body, index) => {
    const material = lineMaterial(color(ctx, index + 1), 0.14);
    const object = line([body.position, body.target], material);
    group.add(object);
    return { object, material, phase: random() };
  });
  ctx.scene.add(group);
  return new GroupInstance(group, "mutual-rescue", ctx.parameters, (frame, params) => {
    const gravity = numberParam(params, "gravity", 0.65);
    const catchRadius = numberParam(params, "catchRadius", 0.8);
    const spring = numberParam(params, "springStiffness", 1.15);
    const damping = numberParam(params, "damping", 0.82);
    for (const [index, body] of bodies.entries()) {
      const active = Math.max(0, frame.elapsedSeconds - body.release);
      const target = body.target;
      if (active > 0) {
        body.velocity.y -= gravity * frame.deltaSeconds * 0.32;
        const toTarget = target.clone().sub(body.position);
        const distance = toTarget.length();
        if (distance < catchRadius || body.rescued) {
          body.rescued = true;
          body.velocity.addScaledVector(toTarget, spring * frame.deltaSeconds * 0.5);
        } else if (distance < catchRadius * 1.8 && index % 4 === 0) {
          body.velocity.addScaledVector(toTarget.normalize(), spring * frame.deltaSeconds * 0.12);
        }
        body.velocity.multiplyScalar(Math.pow(damping, frame.deltaSeconds * 8));
        body.position.addScaledVector(body.velocity, frame.deltaSeconds);
      }
      body.object.position.copy(body.position);
      const connector = connectors[index]!;
      const targetPosition = body.rescued ? target : body.position.clone().lerp(target, 0.42);
      updateLine(connector.object, [body.position, targetPosition]);
      const rescuePulse = body.rescued ? 0.62 + 0.38 * Math.sin(frame.elapsedSeconds * 1.3 + connector.phase * 9) ** 2 : 0.3;
      connector.material.opacity = alpha(params, (body.rescued ? 0.18 : 0.06) + rescuePulse * numberParam(params, "rescueLight", 1.6) * 0.08, 1.35);
      body.material.opacity = alpha(params, 0.2 + rescuePulse * 0.24, 1.1);
    }
  });
}

function updateLine(object: THREE.Line, points: readonly THREE.Vector3[]): void {
  const position = object.geometry.getAttribute("position") as THREE.BufferAttribute;
  points.forEach((point, index) => position.setXYZ(index, point.x, point.y, point.z));
  position.needsUpdate = true;
}

function makeVoidBouquet(ctx: ConceptBuildContext): ConceptInstance {
  const group = new THREE.Group();
  const rings: Array<{ object: THREE.Mesh; material: THREE.MeshBasicMaterial; phase: number; base: THREE.Vector3 }> = [];
  const random = makeSeededRandom(ctx.seed ^ 0x03f1);
  for (let index = 0; index < Math.min(16, ctx.source.motifs.length + 5); index += 1) {
    const a = ctx.source.motifs[index % Math.max(1, ctx.source.motifs.length)]?.center ?? new THREE.Vector3();
    const b = ctx.source.motifs[(index * 3 + 5) % Math.max(1, ctx.source.motifs.length)]?.center ?? a;
    const base = a.clone().lerp(b, 0.5).add(new THREE.Vector3((random() - 0.5) * 0.7, (random() - 0.5) * 0.7, (random() - 0.5) * 0.7));
    const material = createMaterial(ctx, index + 1, 0.16);
    const object = new THREE.Mesh(new THREE.TorusGeometry(0.19 + (index % 4) * 0.055, 0.012 + (index % 3) * 0.008, 8, 32), material);
    object.position.copy(base);
    object.rotation.set(random() * 2, random() * 2, random() * 2);
    group.add(object);
    rings.push({ object, material, phase: random(), base });
  }
  ctx.scene.add(group);
  return new GroupInstance(group, "void-bouquet", ctx.parameters, (frame, params) => {
    const scatter = numberParam(params, "scattering", 0.9);
    const threshold = numberParam(params, "voidThreshold", 0.46);
    for (const [index, ring] of rings.entries()) {
      const local = frame.elapsedSeconds * (0.11 + ring.phase * 0.07) + ring.phase * 10;
      const drift = new THREE.Vector3(Math.sin(local) * 0.12, Math.cos(local * 0.73) * 0.1, Math.sin(local * 0.41) * 0.16);
      ring.object.position.copy(ring.base).addScaledVector(drift, scatter);
      ring.object.rotation.x += frame.deltaSeconds * (0.04 + index * 0.003);
      ring.object.rotation.z -= frame.deltaSeconds * 0.03;
      const glow = 0.5 + 0.5 * Math.sin(local * 0.8 + index);
      ring.object.scale.setScalar(0.78 + glow * 0.42 + threshold * 0.12);
      ring.material.opacity = 0.055 + glow * 0.18;
      applyAppearance(ring.material, params, 0.9 + glow * 0.4);
    }
  });
}

function makeInsideOut(ctx: ConceptBuildContext): ConceptInstance {
  const group = new THREE.Group();
  const center = ctx.source.center;
  const supportLines: Array<{ object: THREE.Line; edge: ConceptEdge; material: THREE.LineBasicMaterial; phase: number }> = [];
  for (const [index, edge] of ctx.source.edges.entries()) {
    if (index % 9 !== 0) continue;
    const material = lineMaterial(color(ctx, index + 3), 0.1 + edge.supportRole * 0.14);
    const object = edgeLine(edge, new THREE.Vector3(), material);
    group.add(object);
    supportLines.push({ object, edge, material, phase: (index * 0.17) % 1 });
  }
  const motifs = ctx.source.motifs.map((motif, index) => {
    const material = createMaterial(ctx, index, 0.3);
    const object = sphere(motif.center, motif.scale, material, 9);
    group.add(object);
    return { object, material, base: motif.center.clone(), phase: (index * 0.13) % 1 };
  });
  ctx.scene.add(group);
  return new GroupInstance(group, "inside-out", ctx.parameters, (frame, params) => {
    const expansion = numberParam(params, "supportExpansion", 1.6);
    const inversion = numberParam(params, "inversion", 0.65);
    const implosion = numberParam(params, "motifImplosion", 0.75);
    for (const item of supportLines) {
      const local = 0.5 + 0.5 * Math.sin(frame.elapsedSeconds * 0.21 + item.phase * 16);
      const amount = expansion * (0.25 + 0.75 * local) * (0.35 + item.edge.supportRole);
      const start = item.edge.start.clone().lerp(center, inversion * 0.15).add(item.edge.start.clone().sub(center).normalize().multiplyScalar(amount * 0.2));
      const end = item.edge.end.clone().lerp(center, inversion * 0.15).add(item.edge.end.clone().sub(center).normalize().multiplyScalar(amount));
      updateLine(item.object, curveBetween(start, end, projectedPerpendicular(item.edge.direction).multiplyScalar(item.edge.directionChange * 0.1), 8));
      item.material.opacity = alpha(params, 0.045 + item.edge.supportRole * 0.18 + local * 0.04, 1.45);
    }
    for (const item of motifs) {
      const local = 0.5 + 0.5 * Math.sin(frame.elapsedSeconds * 0.17 + item.phase * 13);
      item.object.position.copy(item.base).lerp(center, inversion * implosion * (0.28 + local * 0.22));
      item.object.scale.setScalar(0.52 + (1 - inversion * implosion) * 0.6 + local * 0.08);
      item.material.opacity = alpha(params, 0.12 + (1 - inversion) * 0.2, 1.1);
    }
  });
}

function makeOneHandManyFlowers(ctx: ConceptBuildContext): ConceptInstance {
  const group = new THREE.Group();
  const random = makeSeededRandom(ctx.seed ^ 0x5a1d);
  const pathSource = ctx.source.nodes.slice(0, Math.min(18, ctx.source.nodes.length));
  const sourceCurve = pathSource.length > 2 ? new THREE.CatmullRomCurve3(pathSource) : new THREE.CatmullRomCurve3([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)]);
  const original = line(sourceCurve.getPoints(24), lineMaterial(color(ctx, 2), 0.16));
  group.add(original);
  const ribbons = ctx.source.motifs.map((motif, index) => {
    const material = lineMaterial(color(ctx, index, 0.1), 0.11 + (index % 4) * 0.02);
    const points = sourceCurve.getPoints(20).map((point, pointIndex) => {
      const u = pointIndex / 20;
      const tangent = sourceCurve.getTangentAt(u).normalize();
      const normal = projectedPerpendicular(tangent);
      const localScale = 0.32 + motif.scale * 2.4 + (index % 5) * 0.025;
      return motif.center.clone().add(point.clone().multiplyScalar(localScale)).addScaledVector(normal, (index % 3 - 1) * 0.06);
    });
    const object = line(points, material);
    group.add(object);
    return { object, material, base: points, deformation: 0.3 + random() * 0.8, phase: random(), motif };
  });
  ctx.scene.add(group);
  return new GroupInstance(group, "one-hand-many-flowers", ctx.parameters, (frame, params) => {
    const deformation = numberParam(params, "localDeformation", 0.85);
    const supportPull = numberParam(params, "supportPull", 0.65);
    for (const [index, ribbon] of ribbons.entries()) {
      const position = ribbon.object.geometry.getAttribute("position") as THREE.BufferAttribute;
      ribbon.base.forEach((point, pointIndex) => {
        const u = pointIndex / Math.max(1, ribbon.base.length - 1);
        const pulse = Math.sin(frame.elapsedSeconds * (0.18 + ribbon.phase * 0.12) + ribbon.phase * 18 + u * 4);
        const pull = ribbon.motif.center.clone().normalize().multiplyScalar(pulse * supportPull * 0.025 * (0.4 + ribbon.motif.sourceIndex % 4));
        position.setXYZ(pointIndex, point.x + pull.x * deformation, point.y + pull.y * deformation, point.z + pull.z * deformation + Math.sin(u * Math.PI) * pulse * 0.035);
      });
      position.needsUpdate = true;
      ribbon.material.opacity = alpha(params, 0.06 + (0.5 + 0.5 * Math.sin(frame.elapsedSeconds * 0.24 + index)) * 0.12, 1.5);
    }
    const originalMaterial = original.material as THREE.LineBasicMaterial;
    originalMaterial.opacity = 0.07 + numberParam(params, "tracePersistence", 0.32) * 0.18;
  });
}

function makeCraftStrata(ctx: ConceptBuildContext): ConceptInstance {
  const group = new THREE.Group();
  const random = makeSeededRandom(ctx.seed ^ 0x7c4a);
  const beads: Array<{ object: THREE.Mesh; material: THREE.MeshBasicMaterial; edge: ConceptEdge; start: THREE.Vector3; end: THREE.Vector3; phase: number; baseRadius: number }> = [];
  for (const [index, edge] of ctx.source.edges.entries()) {
    if (index % 8 !== 0) continue;
    const segments = 4;
    for (let segment = 0; segment < segments; segment += 1) {
      const u0 = segment / segments;
      const u1 = (segment + 1) / segments;
      const start = edge.start.clone().lerp(edge.end, u0);
      const end = edge.start.clone().lerp(edge.end, u1);
      const direction = end.clone().sub(start).normalize();
      const radius = 0.018 + edge.density * 0.04 + random() * 0.012;
      const material = createMaterial(ctx, index + segment, 0.26);
      const object = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * (0.74 + random() * 0.48), start.distanceTo(end), 6), material);
      object.position.copy(start.clone().add(end).multiplyScalar(0.5));
      object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      group.add(object);
      beads.push({ object, material, edge, start, end, phase: random(), baseRadius: radius });
    }
  }
  const contacts = ctx.source.edges.filter((_, index) => index % 8 === 0).map((edge, index) => {
    const material = createMaterial(ctx, index + 2, 0.2);
    const object = sphere(edge.midpoint, 0.055 + edge.connectivity * 0.035, material, 7);
    group.add(object);
    return { object, material, phase: random() };
  });
  ctx.scene.add(group);
  return new GroupInstance(group, "craft-strata", ctx.parameters, (frame, params) => {
    const speed = numberParam(params, "depositionSpeed", 1);
    const variation = numberParam(params, "beadVariation", 0.42);
    const sag = numberParam(params, "spanSag", 0.45);
    const fusion = numberParam(params, "fusion", 0.8);
    for (const [index, bead] of beads.entries()) {
      const progress = clamp01((frame.elapsedSeconds * speed * 0.11 + index * 0.013) % 1.2);
      const active = progress > (index % 4) * 0.08;
      const local = 0.72 + 0.28 * Math.sin(frame.elapsedSeconds * 0.31 + bead.phase * 18);
      bead.object.visible = active;
      bead.object.scale.y = 0.82 + Math.sin(bead.phase * 14 + frame.elapsedSeconds * 0.19) * sag * 0.12;
      const radius = bead.baseRadius * (1 + variation * (0.35 + 0.65 * Math.sin(bead.phase * 17) ** 2));
      bead.object.scale.x = radius / bead.baseRadius;
      bead.object.scale.z = radius / bead.baseRadius;
      bead.material.opacity = active ? alpha(params, 0.13 + local * 0.22, 1.1) : 0;
      if (index % 5 === 0) applyAppearance(bead.material, params, 1 + fusion * 0.16);
    }
    for (const contact of contacts) {
      const local = 0.5 + 0.5 * Math.sin(frame.elapsedSeconds * 0.42 + contact.phase * 16);
      contact.object.scale.setScalar(0.8 + local * fusion * 0.9);
      contact.material.opacity = alpha(params, 0.08 + local * fusion * 0.2, 1.2);
    }
  });
}

function makeShadowRoom(ctx: ConceptBuildContext): ConceptInstance {
  const group = new THREE.Group();
  const roomMaterial = new THREE.MeshBasicMaterial({ color: 0x111614, side: THREE.DoubleSide, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), roomMaterial);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), roomMaterial.clone());
  back.position.set(0, 3.1, 3.5);
  back.rotation.x = Math.PI / 2;
  group.add(back);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(12, 7), roomMaterial.clone());
  side.position.set(-4.2, 0, 3.5);
  side.rotation.z = Math.PI / 2;
  group.add(side);
  const shadows = ctx.source.motifs.slice(0, 18).map((motif, index) => {
    const material = new THREE.MeshBasicMaterial({ color: index % 3 === 0 ? ctx.colors.primary : ctx.colors.highlight, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const object = new THREE.Mesh(new THREE.CircleGeometry(0.25 + (index % 4) * 0.08, 24), material);
    object.position.set(motif.center.x * 1.4, motif.center.y * 0.72 + 1.3, 0.012);
    object.rotation.x = 0;
    object.scale.y = 0.45 + (index % 3) * 0.22;
    group.add(object);
    return { object, material, base: object.position.clone(), phase: (index * 0.19) % 1 };
  });
  ctx.scene.add(group);
  return new GroupInstance(group, "shadow-room", ctx.parameters, (frame, params) => {
    const speed = numberParam(params, "sunSpeed", 0.35);
    const softness = numberParam(params, "shadowSoftness", 1.1);
    const lightCount = Math.max(1, Math.round(numberParam(params, "lightCount", 3)));
    for (const [index, shadow] of shadows.entries()) {
      const lightPhase = frame.elapsedSeconds * speed * (0.13 + (index % lightCount) * 0.035) + shadow.phase * 11;
      const patch = new THREE.Vector3(Math.sin(lightPhase) * 1.6, Math.cos(lightPhase * 0.73) * 0.8, 0);
      shadow.object.position.copy(shadow.base).add(patch);
      shadow.object.scale.set(0.75 + softness * 0.22, 0.35 + (0.5 + 0.5 * Math.sin(lightPhase)) * softness * 0.42, 1);
      shadow.material.opacity = alpha(params, 0.06 + (0.5 + 0.5 * Math.sin(lightPhase * 0.8 + index)) * 0.18, 1.25);
    }
  });
}

function makeMicroLandscape(ctx: ConceptBuildContext): ConceptInstance {
  const group = new THREE.Group();
  const micro = ctx.source.nodes.slice(0, 80).map((node, index) => {
    const material = createMaterial(ctx, index, 0.22);
    const object = sphere(node, 0.018 + (index % 4) * 0.009, material, 6);
    group.add(object);
    return { object, material, base: node.clone(), phase: (index * 0.071) % 1 };
  });
  const meso = ctx.source.edges.filter((_, index) => index % 8 === 0).map((edge, index) => {
    const material = lineMaterial(color(ctx, index + 1), 0.11);
    const object = edgeLine(edge, projectedPerpendicular(edge.direction).multiplyScalar(edge.directionChange * 0.08), material);
    group.add(object);
    return { object, material, edge };
  });
  const macroLines: THREE.Line[] = [];
  for (let index = 0; index < 5; index += 1) {
    const points: THREE.Vector3[] = [];
    for (let pointIndex = 0; pointIndex < 24; pointIndex += 1) {
      const x = -4.8 + pointIndex * 0.42;
      const y = 2.0 + index * 0.28 + Math.sin(pointIndex * 0.42 + index) * 0.18;
      const z = -0.65 + Math.cos(pointIndex * 0.31 + index) * 0.16;
      points.push(new THREE.Vector3(x, y, z));
    }
    const object = line(points, lineMaterial(color(ctx, index + 2), 0.09));
    group.add(object);
    macroLines.push(object);
  }
  ctx.scene.add(group);
  return new GroupInstance(group, "micro-landscape", ctx.parameters, (frame, params) => {
    const journey = numberParam(params, "journeySpeed", 0.7);
    const t = (0.5 + 0.5 * Math.sin(frame.elapsedSeconds * journey * 0.16)) * 0.9;
    const microWeight = 1 - clamp01((t - 0.12) / 0.42);
    const mesoWeight = clamp01(1 - Math.abs(t - 0.5) / 0.35);
    const macroWeight = clamp01((t - 0.58) / 0.32);
    for (const item of micro) { item.object.visible = microWeight > 0.03; item.object.scale.setScalar(0.7 + microWeight * 2.1); item.material.opacity = alpha(params, 0.04 + microWeight * 0.24, 1.15); }
    for (const item of meso) { item.object.scale.setScalar(0.74 + mesoWeight * 0.42); item.material.opacity = alpha(params, 0.03 + mesoWeight * 0.17, 1.3); }
    for (const [index, object] of macroLines.entries()) { object.scale.set(0.62 + macroWeight * 0.7, 0.62 + macroWeight * 0.7, 1); (object.material as THREE.LineBasicMaterial).opacity = 0.02 + macroWeight * 0.16; object.position.z = -0.4 - index * 0.08; }
    ctx.camera.position.x = Math.sin(frame.elapsedSeconds * journey * 0.08) * numberParam(params, "cameraDeviation", 0.25) * 2.2;
    ctx.camera.position.z = 3.2 + Math.cos(frame.elapsedSeconds * journey * 0.06) * 0.32;
    ctx.camera.lookAt(0, 0.5, 0);
  });
}

function makeVisibleMending(ctx: ConceptBuildContext): ConceptInstance {
  const group = new THREE.Group();
  const candidates = [...ctx.source.edges].sort((left, right) => (
    (right.length + right.directionChange + (1 - right.connectivity)) - (left.length + left.directionChange + (1 - left.connectivity))
  )).slice(0, 8);
  const stitches = candidates.map((edge, index) => {
    const direction = edge.direction;
    const gap = edge.length > 0 ? direction.clone().multiplyScalar(0.16 + numberParam(ctx.parameters, "gapAmount", 0.32) * 0.28) : new THREE.Vector3();
    const left = edge.midpoint.clone().sub(gap);
    const right = edge.midpoint.clone().add(gap);
    const scarMaterial = lineMaterial(new THREE.Color(ctx.colors.shadow), 0.22);
    const scar = edgeLine({ ...edge, start: edge.start, end: edge.end }, projectedPerpendicular(direction).multiplyScalar(0.02), scarMaterial);
    group.add(scar);
    const material = lineMaterial(color(ctx, index + 2, 0.12), 0.2);
    const points = curveBetween(left, right, projectedPerpendicular(direction).multiplyScalar(0.14 + edge.directionChange * 0.1), 10);
    const stitch = line(points, material);
    group.add(stitch);
    const beads: THREE.Mesh[] = [];
    for (let beadIndex = 0; beadIndex < 7; beadIndex += 1) {
      const beadMaterial = createMaterial(ctx, index + beadIndex, 0.18);
      const bead = sphere(points[Math.min(points.length - 1, beadIndex + 1)]!, 0.026 + edge.supportRole * 0.02, beadMaterial, 7);
      group.add(bead); beads.push(bead);
    }
    return { edge, scar, stitch, material, beads, points, phase: index * 0.22 };
  });
  group.scale.setScalar(1.8);
  ctx.scene.add(group);
  return new GroupInstance(group, "visible-mending", ctx.parameters, (frame, params) => {
    const speed = numberParam(params, "growthSpeed", 0.85);
    const persistence = numberParam(params, "scarPersistence", 1);
    for (const [index, item] of stitches.entries()) {
      const progress = clamp01((frame.elapsedSeconds * speed * 0.22 + item.phase) % 1.15);
      const visible = Math.max(2, Math.floor(progress * item.points.length));
      const partial = item.points.slice(0, visible);
      updateLine(item.stitch, partial.length > 1 ? partial : item.points.slice(0, 2));
      item.material.opacity = alpha(params, 0.05 + progress * 0.25, 1.55);
      (item.scar.material as THREE.LineBasicMaterial).opacity = 0.05 + persistence * (0.1 + item.edge.directionChange * 0.18);
      for (const [beadIndex, bead] of item.beads.entries()) { bead.visible = beadIndex < visible - 1; bead.scale.setScalar(0.78 + Math.sin(frame.elapsedSeconds * 0.4 + index) ** 2 * 0.55); }
    }
  });
}

function makeStructuralChoir(ctx: ConceptBuildContext): ConceptInstance {
  const group = new THREE.Group();
  const random = makeSeededRandom(ctx.seed ^ 0x4412);
  const phases = ctx.source.nodes.map((_, index) => (index * 0.19 + random() * 0.8) % (Math.PI * 2));
  const frequencies = ctx.source.nodes.map((_, index) => 0.2 + (index % 11) * 0.035 + random() * 0.06);
  const adjacency = ctx.source.nodes.map(() => [] as number[]);
  for (const edge of ctx.source.edges) {
    adjacency[edge.startIndex]?.push(edge.endIndex);
    adjacency[edge.endIndex]?.push(edge.startIndex);
  }
  const lines = ctx.source.edges.filter((_, index) => index % 4 === 0).map((edge, index) => {
    const material = lineMaterial(color(ctx, index, 0.06), 0.08 + edge.connectivity * 0.1);
    const object = line(curveBetween(edge.start, edge.end, new THREE.Vector3(), 5), material);
    group.add(object);
    return { edge, object, material, index };
  });
  const nodes = ctx.source.nodes.slice(0, 100).map((position, index) => {
    const material = createMaterial(ctx, index + 1, 0.17);
    const object = sphere(position, 0.018 + (index % 3) * 0.008, material, 6);
    group.add(object);
    return { object, material, index };
  });
  ctx.scene.add(group);
  let solverAccumulator = 0;
  return new GroupInstance(group, "structural-choir", ctx.parameters, (frame, params) => {
    const coupling = numberParam(params, "coupling", 0.8);
    const excitation = numberParam(params, "excitation", 0.7);
    solverAccumulator += frame.deltaSeconds;
    if (solverAccumulator >= 1 / 30) {
      const step = solverAccumulator; solverAccumulator = 0;
      const next = phases.slice();
      phases.forEach((phase, index) => {
        const neighbors = adjacency[index] ?? [];
        const neighborPull = neighbors.reduce((sum, neighbor) => sum + Math.sin((phases[neighbor] ?? phase) - phase), 0);
        next[index] = phase + (frequencies[index]! + coupling * neighborPull / Math.max(1, neighbors.length) + Math.sin(phase * 0.7) * excitation * 0.03) * step;
      });
      next.forEach((value, index) => { phases[index] = value; });
    }
    for (const item of lines) {
      const startPhase = phases[item.edge.startIndex] ?? 0;
      const endPhase = phases[item.edge.endIndex] ?? 0;
      const offset = Math.sin(startPhase) * 0.025 + Math.sin(endPhase * 1.17) * 0.02;
      const bend = projectedPerpendicular(item.edge.direction).multiplyScalar(offset * (0.8 + item.edge.directionChange));
      updateLine(item.object, curveBetween(item.edge.start, item.edge.end, bend, 5));
      item.material.opacity = alpha(params, 0.04 + (0.5 + 0.5 * Math.sin((startPhase + endPhase) * 0.5)) * (0.08 + item.edge.connectivity * 0.1), 1.6);
    }
    for (const node of nodes) {
      const phase = phases[node.index] ?? 0;
      node.object.scale.setScalar(0.7 + (0.5 + 0.5 * Math.sin(phase)) * numberParam(params, "vibration", 0.45) * 0.9);
      node.material.opacity = alpha(params, 0.06 + (0.5 + 0.5 * Math.sin(phase * 1.13)) * 0.18, 1.25);
    }
  });
}

export const CONCEPT_CREATORS = {
  "weight-of-hesitation": makeWeightOfHesitation,
  "mutual-rescue": makeMutualRescue,
  "void-bouquet": makeVoidBouquet,
  "inside-out": makeInsideOut,
  "one-hand-many-flowers": makeOneHandManyFlowers,
  "craft-strata": makeCraftStrata,
  "shadow-room": makeShadowRoom,
  "micro-landscape": makeMicroLandscape,
  "visible-mending": makeVisibleMending,
  "structural-choir": makeStructuralChoir,
} as const;
