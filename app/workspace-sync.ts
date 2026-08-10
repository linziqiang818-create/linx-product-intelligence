export type WorkspaceLocation = "active" | "trash" | "deleted";

export type WorkspaceRecord<T extends { asin: string } = { asin: string }> = {
  asin: string;
  location: WorkspaceLocation;
  product?: T;
  updatedAt: string;
};

export function mergeWorkspaceRecords<T extends { asin: string }>(
  left: Record<string, WorkspaceRecord<T>>,
  right: Record<string, WorkspaceRecord<T>>,
) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return Object.fromEntries([...keys].flatMap((asin) => {
    const local = left[asin];
    const cloud = right[asin];
    if (!local) return cloud ? [[asin, cloud]] : [];
    if (!cloud) return [[asin, local]];
    return [[asin, Date.parse(cloud.updatedAt) >= Date.parse(local.updatedAt) ? cloud : local]];
  })) as Record<string, WorkspaceRecord<T>>;
}

export function newerWorkspaceRecords<T extends { asin: string }>(
  local: Record<string, WorkspaceRecord<T>>,
  cloud: Record<string, WorkspaceRecord<T>>,
) {
  return Object.values(local).filter((record) => {
    const current = cloud[record.asin];
    return !current || Date.parse(record.updatedAt) > Date.parse(current.updatedAt);
  });
}

function jsonByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function splitWorkspaceRecords<T extends { asin: string }>(
  records: WorkspaceRecord<T>[],
  maxBytes = 350_000,
  maxRecords = 100,
) {
  const chunks: WorkspaceRecord<T>[][] = [];
  let current: WorkspaceRecord<T>[] = [];
  for (const record of records) {
    const candidate = [...current, record];
    if (current.length && (candidate.length > maxRecords || jsonByteLength({ records: candidate }) > maxBytes)) {
      chunks.push(current);
      current = [record];
    } else current = candidate;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
