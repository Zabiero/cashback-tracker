export async function checkStorage(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('__storage_check__');
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    return true;
  } catch {
    return false;
  }
}
