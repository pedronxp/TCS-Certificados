type WopiLock = {
  value: string;
  expiresAt: number;
};

const LOCK_TTL_MS = 30 * 60 * 1000;
const locks = new Map<string, WopiLock>();

export function getWopiLock(fileId: string) {
  const lock = locks.get(fileId);
  if (!lock) return "";

  if (lock.expiresAt <= Date.now()) {
    locks.delete(fileId);
    return "";
  }

  return lock.value;
}

export function setWopiLock(fileId: string, value: string) {
  locks.set(fileId, {
    value,
    expiresAt: Date.now() + LOCK_TTL_MS,
  });
}

export function clearWopiLock(fileId: string) {
  locks.delete(fileId);
}
