import type { WorkspaceRecord } from "./workspace-sync";

const DATABASE_NAME = "linx-workspace-v1";
const STORE_NAME = "pending-product-records";

function openWorkspaceDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "asin" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open LINX workspace storage"));
  });
}

export function workspaceRecordMap<T extends { asin: string }>(records: WorkspaceRecord<T>[]) {
  return Object.fromEntries(records.map((record) => [record.asin, record])) as Record<string, WorkspaceRecord<T>>;
}

export async function readLocalWorkspaceRecords<T extends { asin: string }>() {
  const database = await openWorkspaceDatabase();
  try {
    return await new Promise<Record<string, WorkspaceRecord<T>>>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(workspaceRecordMap(request.result as WorkspaceRecord<T>[]));
      request.onerror = () => reject(request.error ?? new Error("Unable to read LINX workspace storage"));
    });
  } finally {
    database.close();
  }
}

export async function saveLocalWorkspaceRecords<T extends { asin: string }>(records: WorkspaceRecord<T>[]) {
  const database = await openWorkspaceDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      records.forEach((record) => store.put(record));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save LINX workspace storage"));
      transaction.onabort = () => reject(transaction.error ?? new Error("LINX workspace storage transaction aborted"));
    });
  } finally {
    database.close();
  }
}
