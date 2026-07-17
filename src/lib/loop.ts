export function startFrameLoop(frame: (now: number) => void): () => void {
  let requestId = 0;
  let running = true;
  const tick = (now: number): void => {
    if (!running) return;
    requestId = requestAnimationFrame(tick);
    frame(now);
  };
  requestId = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(requestId);
  };
}
