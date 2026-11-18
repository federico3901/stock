"use client";

import { useState } from "react";
import { Button, Card, ErrorBox, Input, Label, Spinner } from "@/components/ui";

export default function Login() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    // ricarica completa voluta: il cookie appena impostato va letto dal proxy
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (res.ok) window.location.assign("/");
    else {
      setErr((await res.json().catch(() => null))?.error ?? "Accesso non riuscito.");
      setBusy(false);
    }
  };
  return (
    <div className="max-w-sm mx-auto mt-16">
      <Card title="Accedi">
        <form onSubmit={submit} className="space-y-4">
          <Label label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" required />
          </Label>
          <ErrorBox>{err}</ErrorBox>
          <Button variant="primary" type="submit" className="w-full" disabled={busy}>{busy && <Spinner />} Entra</Button>
        </form>
      </Card>
    </div>
  );
}
