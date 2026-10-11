import type { DbOrTx, Tx } from "./types";

function isTransaction(dbOrTx: DbOrTx): dbOrTx is Tx {
  return "rollback" in dbOrTx;
}

/** Runs `fn` in a transaction, joining the caller's if it already has one. */
export async function inTransaction<T>(dbOrTx: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (isTransaction(dbOrTx)) return fn(dbOrTx);
  return dbOrTx.transaction(fn);
}
