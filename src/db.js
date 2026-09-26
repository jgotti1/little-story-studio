"use strict";

// Everything is stored in this browser with IndexedDB. Nothing leaves the device.
(() => {
  const DB_NAME = "little-story-studio-v2";
  const DB_VERSION = 1;
  const STORES = ["characters", "stories", "videos"];

  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        STORES.forEach((name) => {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(storeName, mode, action) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      let request;
      try {
        request = action(transaction.objectStore(storeName));
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      transaction.oncomplete = () => { database.close(); resolve(request?.result); };
      transaction.onerror = () => { database.close(); reject(transaction.error || request?.error); };
      transaction.onabort = () => { database.close(); reject(transaction.error || new Error("The save was cancelled.")); };
    });
  }

  // The first version of the game kept characters in a database of its own. Read them without
  // creating that database when it was never there, so they can be carried over.
  function readLegacy() {
    return new Promise((resolve) => {
      const request = indexedDB.open("little-story-studio");
      request.onupgradeneeded = () => request.transaction.abort();
      request.onerror = (event) => { event.preventDefault(); resolve([]); };
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("characters")) { database.close(); resolve([]); return; }
        const read = database.transaction("characters", "readonly").objectStore("characters").getAll();
        read.onsuccess = () => { database.close(); resolve(read.result); };
        read.onerror = () => { database.close(); resolve([]); };
      };
    });
  }

  const newestFirst = (items) => items.sort((a, b) => b.updatedAt - a.updatedAt);

  window.LSS.db = {
    all: async (storeName) => newestFirst(await withStore(storeName, "readonly", (store) => store.getAll())),
    get: (storeName, id) => withStore(storeName, "readonly", (store) => store.get(id)),
    put: (storeName, record) => withStore(storeName, "readwrite", (store) => store.put(record)),
    remove: (storeName, id) => withStore(storeName, "readwrite", (store) => store.delete(id)),
    readLegacy,
  };
})();
