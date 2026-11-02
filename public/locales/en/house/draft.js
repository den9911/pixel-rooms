export function readRoomDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.pixels !== 'string' || !/^[0-9a-f]{256}$/.test(value.pixels) ||
      typeof value.name !== 'string' || value.name.length > 40) return null;
  if (value.schema === undefined) return { ...value, legacy: true };
  if (value.schema !== 1 || !(value.roomId === null || typeof value.roomId === 'string' && value.roomId.length > 0) ||
      !(value.baseVersion === null || Number.isSafeInteger(value.baseVersion) && value.baseVersion >= 1) ||
      ((value.roomId === null) !== (value.baseVersion === null))) return null;
  return { schema: 1, pixels: value.pixels, name: value.name, roomId: value.roomId, baseVersion: value.baseVersion };
}
export function hasConflict(draft, mine) {
  if (!draft) return false;
  if (draft.legacy) return !!mine;
  return draft.roomId !== (mine?.id ?? null) || draft.baseVersion !== (mine?.version ?? null);
}
export function roomDraft(pixels, name, roomId, baseVersion) {
  return { schema: 1, pixels, name, roomId, baseVersion };
}
