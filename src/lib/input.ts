export function ndcFromPointer(
  event: Pick<PointerEvent, "clientX" | "clientY">,
  viewport: Element,
): { x: number; y: number } {
  const rect = viewport.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
  };
}

export function eventTargetsViewport(event: Event, viewport: Element): boolean {
  return event.target instanceof Node && viewport.contains(event.target);
}
