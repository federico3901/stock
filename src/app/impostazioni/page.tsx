"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card, ErrorBox, InfoBox, Spinner } from "@/components/ui";
import { api, errMsg, useStatus } from "@/lib/client";

export default function Settings() {
  const { data: status, isLoading } = useStatus();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const restore = async (f: File) => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const json = JSON.parse(await f.text());
      const r = await api<{ restored: number }>("/api/backup", { json });
      setMsg(`Ripristinati ${r.restored} record.`);
    } catch (e) {
      setErr(e instanceof SyntaxError ? "Il file non è un JSON valido." : errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Impostazioni</h1>
      {isLoading || !status ? (
        <div className="text-sm text-ink-2"><Spinner /> Caricamento…</div>
      ) : (
        <>
          <Card title="Stato">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm items-center">
              <dt className="text-ink-2">Analisi con Claude</dt>
              <dd>
                {status.mock ? <Badge tone="warn">modalità di prova (dati finti)</Badge> : status.llm ? <Badge tone="good">✓ chiave API configurata</Badge> : <Badge tone="bad">✕ chiave API mancante</Badge>}
                <span className="ml-2 text-ink-2">modello <code className="font-mono text-xs">{status.model}</code></span>
              </dd>
              <dt className="text-ink-2">Archivio dati</dt>
              <dd>
                {status.storage === "postgres" ? <Badge tone="good">✓ Postgres</Badge> : <Badge>file locali (cartella data/)</Badge>}
              </dd>
              <dt className="text-ink-2">Accesso</dt>
              <dd>{status.passwordProtected ? <Badge tone="good">✓ protetto da password</Badge> : <Badge tone="warn">senza password</Badge>}</dd>
            </dl>
          </Card>

          <Card title="Configurazione" hint="Variabili d'ambiente: in locale nel file .env.local, su Vercel in Project Settings → Environment Variables">
            <ul className="text-sm space-y-3">
              <li>
                <code className="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">ANTHROPIC_API_KEY</code>
                <div className="text-ink-2 mt-0.5">Chiave dell&apos;API di Anthropic: serve per estrarre i dati dai documenti, per la chat e per il memo.</div>
              </li>
              <li>
                <code className="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">DATABASE_URL</code>
                <div className="text-ink-2 mt-0.5">Stringa di connessione Postgres (es. Supabase → Connect → Transaction pooler). Obbligatoria su Vercel, dove i file non sono persistenti. La tabella viene creata da sola.</div>
              </li>
              <li>
                <code className="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">APP_PASSWORD</code>
                <div className="text-ink-2 mt-0.5">Password di accesso all&apos;app. Consigliata se l&apos;app è pubblicata online: senza, chiunque abbia il link può usare la tua chiave API.</div>
              </li>
              <li>
                <code className="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">ANTHROPIC_MODEL</code>
                <div className="text-ink-2 mt-0.5">Facoltativa. Modello da usare (predefinito <code className="font-mono text-xs">claude-opus-5-5</code>); <code className="font-mono text-xs">claude-sonnet-5-5</code> costa circa la metà.</div>
              </li>
            </ul>
          </Card>

          {status.storage === "file" && (
            <InfoBox>I dati sono salvati nella cartella <code className="font-mono text-xs">data/</code> del progetto: va bene per l&apos;uso sul tuo computer. Fai un backup ogni tanto.</InfoBox>
          )}

          <Card title="Backup" hint="Tutti i dati (aziende, documenti, bilanci, note) in un unico file JSON">
            <div className="flex flex-wrap gap-2 items-center">
              <a href="/api/backup" className="inline-flex items-center h-9 px-3.5 text-sm font-medium rounded-md border border-edge bg-surface hover:bg-surface-2">Scarica backup</a>
              <Button onClick={() => file.current?.click()} disabled={busy}>{busy && <Spinner />} Ripristina da file…</Button>
              <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
            </div>
            <p className="text-xs text-ink-2 mt-2">Il ripristino sovrascrive i record con lo stesso identificativo e lascia invariati gli altri. Serve anche per spostare i dati dal computer a Vercel.</p>
            {msg && <p className="text-sm text-good-text mt-2">{msg}</p>}
            <div className="mt-2"><ErrorBox>{err}</ErrorBox></div>
          </Card>
        </>
      )}
    </div>
  );
}
