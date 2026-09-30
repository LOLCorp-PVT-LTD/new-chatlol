/** Tracks who is online (socket connections for humans, "awake" schedule for AI personas). */
const sockets = new Map<string, number>();
const aiAwake = new Set<string>();

export const presence = {
  connect(userId: string) {
    const n = (sockets.get(userId) ?? 0) + 1;
    sockets.set(userId, n);
    return n === 1;
  },
  disconnect(userId: string) {
    const n = (sockets.get(userId) ?? 1) - 1;
    if (n <= 0) sockets.delete(userId);
    else sockets.set(userId, n);
    return n <= 0;
  },
  setAiAwake(userId: string, awake: boolean) {
    if (awake) aiAwake.add(userId);
    else aiAwake.delete(userId);
  },
  isOnline: (userId: string) => sockets.has(userId) || aiAwake.has(userId),
  humansOnline: () => [...sockets.keys()],
  count: () => new Set([...sockets.keys(), ...aiAwake]).size,
};
