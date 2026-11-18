import { bad, body, route } from "@/lib/api";
import { getStore, type StoredRecord } from "@/lib/store";

/** Esporta tutti i dati in un unico file JSON. */
export const GET = route(async () => {
  const records = await getStore().dump();
  const payload = JSON.stringify({ app: "stock", version: 1, exportedAt: new Date().toISOString(), records });
  return new Response(payload, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="stock-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});

/** Ripristina un backup: i record con lo stesso id vengono sovrascritti, gli altri restano. */
export const POST = route(async (req) => {
  const b = await body<{ app?: string; records?: StoredRecord[] }>(req);
  if (b.app !== "stock" || !Array.isArray(b.records)) throw bad("File di backup non riconosciuto.");
  const store = getStore();
  let n = 0;
  for (const r of b.records) {
    if (!r || typeof r.collection !== "string" || typeof r.id !== "string" || typeof r.data !== "object" || r.data === null) continue;
    await store.put(r.collection, { ...(r.data as object), id: r.id }, r.companyId ?? null);
    n++;
  }
  return { restored: n };
});
