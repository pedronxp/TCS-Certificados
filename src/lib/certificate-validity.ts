export const DEFAULT_CERTIFICATE_VALIDITY_YEARS = 2;

export function buildDefaultCertificateDeleteAt(now = new Date()) {
  const retentionDays = getConfiguredPositiveInteger("CERTIFICATE_RETENTION_DAYS");
  if (retentionDays !== undefined) {
    if (retentionDays === null) return null;

    const date = new Date(now);
    date.setDate(date.getDate() + retentionDays);
    return date;
  }

  const validityYears = getConfiguredPositiveInteger("CERTIFICATE_VALIDITY_YEARS") ?? DEFAULT_CERTIFICATE_VALIDITY_YEARS;
  if (validityYears <= 0) return null;

  return addCalendarYears(now, validityYears);
}

export function isCertificateDocumentExpired(
  deleteAt: Date | string | null | undefined,
  now = new Date(),
) {
  if (!deleteAt) return false;

  const deleteAtDate = deleteAt instanceof Date ? deleteAt : new Date(deleteAt);
  return !Number.isNaN(deleteAtDate.getTime()) && deleteAtDate <= now;
}

function getConfiguredPositiveInteger(name: string) {
  const rawValue = process.env[name];
  if (rawValue === undefined) return undefined;

  const value = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(value) || value <= 0) return null;

  return value;
}

function addCalendarYears(date: Date, years: number) {
  const nextDate = new Date(date);
  const originalMonth = nextDate.getMonth();
  nextDate.setFullYear(nextDate.getFullYear() + years);

  if (nextDate.getMonth() !== originalMonth) {
    nextDate.setDate(0);
  }

  return nextDate;
}
