import { clamp, distance, type NetworkEdge, type NetworkNode } from "./types.ts";

export interface NetworkMetrics {
  maxNetForce: number;
  meanNetForce: number;
  meanVelocity: number;
}

export function relaxNetwork(
  nodes: NetworkNode[],
  edges: NetworkEdge[],
  deltaSeconds: number,
  damping: number,
  confinement = 0.02,
): NetworkMetrics {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) node.force = { x: 0, y: 0 };

  for (const edge of edges) {
    const a = byId.get(edge.a);
    const b = byId.get(edge.b);
    if (!a || !b) continue;
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const currentLength = Math.max(1e-6, Math.hypot(dx, dy));
    const extension = currentLength - edge.restLength;
    const tension = edge.stiffness * Math.max(0, extension);
    edge.length = currentLength;
    edge.tension = tension;
    const force = tension / currentLength;
    const fx = dx * force;
    const fy = dy * force;
    a.force.x += fx;
    a.force.y += fy;
    b.force.x -= fx;
    b.force.y -= fy;
  }

  for (const node of nodes) {
    if (node.anchor) {
      node.velocity = { x: 0, y: 0 };
      continue;
    }
    node.force.x += (0.5 - node.position.x) * confinement;
    node.force.y += (0.5 - node.position.y) * confinement;
    node.velocity.x = (node.velocity.x + node.force.x * deltaSeconds) * clamp(damping, 0.65, 0.98);
    node.velocity.y = (node.velocity.y + node.force.y * deltaSeconds) * clamp(damping, 0.65, 0.98);
    node.position.x = clamp(node.position.x + node.velocity.x * deltaSeconds, 0.06, 0.94);
    node.position.y = clamp(node.position.y + node.velocity.y * deltaSeconds, 0.08, 0.92);
  }

  let totalForce = 0;
  let maxNetForce = 0;
  let totalVelocity = 0;
  for (const node of nodes) {
    const forceMagnitude = Math.hypot(node.force.x, node.force.y);
    totalForce += forceMagnitude;
    maxNetForce = Math.max(maxNetForce, forceMagnitude);
    totalVelocity += Math.hypot(node.velocity.x, node.velocity.y);
  }
  return {
    maxNetForce,
    meanNetForce: nodes.length > 0 ? totalForce / nodes.length : 0,
    meanVelocity: nodes.length > 0 ? totalVelocity / nodes.length : 0,
  };
}

export function edgeLength(nodes: readonly NetworkNode[], edge: NetworkEdge): number {
  const a = nodes.find((node) => node.id === edge.a);
  const b = nodes.find((node) => node.id === edge.b);
  return a && b ? distance(a.position, b.position) : Number.POSITIVE_INFINITY;
}

export function topologySignature(edges: readonly NetworkEdge[]): string {
  return edges.map((edge) => `${edge.a}-${edge.b}`).sort().join("|");
}
