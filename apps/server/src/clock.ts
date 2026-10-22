export type Clock = () => string; // ISO 8601 'now'
export const systemClock: Clock = () => new Date().toISOString();
