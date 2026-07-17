/** Timestamp, append, and apply one Study-owned operation atomically. */
export function recordHistoryEntry<State, Entry>(
  history: Entry[],
  state: State,
  createEntry: (timestamp: number) => Entry,
  applyEntry: (state: State, entry: Entry) => void,
): Entry {
  const entry = createEntry(Date.now());
  history.push(entry);
  applyEntry(state, entry);
  return entry;
}
