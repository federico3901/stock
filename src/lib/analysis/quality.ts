import { computeMetrics, derive, div, growth } from "./metrics";
import type { Values } from "./periods";

const ok = (v: number | undefined | null): v is number => typeof v === "number" && Number.isFinite(v);

export interface ScoreItem {
  label: string;
  pass: boolean | null; // null = dato non disponibile
  detail: string;
}

export interface PiotroskiResult {
  score: number;
  available: number;
  items: ScoreItem[];
}

/** Piotroski F-Score (0-9): solidità e direzione dei fondamentali, confrontando l'ultimo esercizio col precedente. */
export function piotroski(cur: Values, prev: Values | undefined): PiotroskiResult {
  const items: ScoreItem[] = [];
  const add = (label: string, cond: boolean | undefined, detail: string) =>
    items.push({ label, pass: cond === undefined ? null : cond, detail });
  const pct = (v: number | undefined) => (ok(v) ? (v * 100).toFixed(1).replace(".", ",") + "%" : "n.d.");
  const x = (v: number | undefined) => (ok(v) ? v.toFixed(3).replace(".", ",") + "x" : "n.d.");

  const roa = div(cur.net_income, cur.total_assets);
  const roaPrev = prev ? div(prev.net_income, prev.total_assets) : undefined;
  add("Utile netto positivo", ok(cur.net_income) ? cur.net_income > 0 : undefined, `ROA ${pct(roa)}`);
  add("Cassa operativa positiva", ok(cur.cfo) ? cur.cfo > 0 : undefined, "Flusso di cassa operativo > 0");
  add("ROA in miglioramento", ok(roa) && ok(roaPrev) ? roa > roaPrev : undefined, `${pct(roaPrev)} → ${pct(roa)}`);
  add(
    "Cassa operativa > utile netto",
    ok(cur.cfo) && ok(cur.net_income) ? cur.cfo > cur.net_income : undefined,
    "Qualità degli utili: gli utili sono coperti dalla cassa",
  );
  const lev = div(cur.long_term_debt ?? 0, cur.total_assets);
  const levPrev = prev ? div(prev.long_term_debt ?? 0, prev.total_assets) : undefined;
  add("Leva in calo", ok(lev) && ok(levPrev) ? lev <= levPrev : undefined, `Debito a lungo / attivo: ${pct(levPrev)} → ${pct(lev)}`);
  const cr = div(cur.total_current_assets, cur.total_current_liabilities);
  const crPrev = prev ? div(prev.total_current_assets, prev.total_current_liabilities) : undefined;
  add("Liquidità in miglioramento", ok(cr) && ok(crPrev) ? cr > crPrev : undefined, `Current ratio: ${x(crPrev)} → ${x(cr)}`);
  const sh = cur.shares_outstanding ?? cur.shares_diluted;
  const shPrev = prev ? (prev.shares_outstanding ?? prev.shares_diluted) : undefined;
  add("Nessuna diluizione", ok(sh) && ok(shPrev) ? sh <= shPrev * 1.001 : undefined, "Numero di azioni non in aumento");
  const gm = div(derive(cur).grossProfit, cur.revenue);
  const gmPrev = prev ? div(derive(prev).grossProfit, prev.revenue) : undefined;
  add("Margine lordo in miglioramento", ok(gm) && ok(gmPrev) ? gm > gmPrev : undefined, `${pct(gmPrev)} → ${pct(gm)}`);
  const at = div(cur.revenue, cur.total_assets);
  const atPrev = prev ? div(prev.revenue, prev.total_assets) : undefined;
  add("Rotazione dell'attivo in miglioramento", ok(at) && ok(atPrev) ? at > atPrev : undefined, `${x(atPrev)} → ${x(at)}`);

  return {
    score: items.filter((i) => i.pass === true).length,
    available: items.filter((i) => i.pass !== null).length,
    items,
  };
}

export interface AltmanResult {
  z: number;
  zone: "sicura" | "grigia" | "a rischio";
  variant: "Z (con capitalizzazione di mercato)" | "Z' (con patrimonio netto contabile)";
  components: { label: string; value: number }[];
}

/** Altman Z-Score: rischio di dissesto finanziario. Non adatto a banche e assicurazioni. */
export function altmanZ(v: Values, marketCap?: number): AltmanResult | null {
  const ta = v.total_assets;
  if (!ok(ta) || ta <= 0 || !ok(v.total_liabilities) || v.total_liabilities <= 0) return null;
  if (!ok(v.total_current_assets) || !ok(v.total_current_liabilities) || !ok(v.operating_income) || !ok(v.revenue)) return null;
  const a = (v.total_current_assets - v.total_current_liabilities) / ta;
  const b = (v.retained_earnings ?? 0) / ta;
  const c = v.operating_income / ta;
  const e = v.revenue / ta;
  if (ok(marketCap) && marketCap > 0) {
    const d = marketCap / v.total_liabilities;
    const z = 1.2 * a + 1.4 * b + 3.3 * c + 0.6 * d + 1.0 * e;
    return {
      z,
      zone: z > 2.99 ? "sicura" : z >= 1.81 ? "grigia" : "a rischio",
      variant: "Z (con capitalizzazione di mercato)",
      components: [
        { label: "Capitale circolante / attivo", value: a },
        { label: "Utili a nuovo / attivo", value: b },
        { label: "EBIT / attivo", value: c },
        { label: "Capitalizzazione / passività", value: d },
        { label: "Ricavi / attivo", value: e },
      ],
    };
  }
  if (!ok(v.total_equity)) return null;
  const d = v.total_equity / v.total_liabilities;
  const z = 0.717 * a + 0.847 * b + 3.107 * c + 0.42 * d + 0.998 * e;
  return {
    z,
    zone: z > 2.9 ? "sicura" : z >= 1.23 ? "grigia" : "a rischio",
    variant: "Z' (con patrimonio netto contabile)",
    components: [
      { label: "Capitale circolante / attivo", value: a },
      { label: "Utili a nuovo / attivo", value: b },
      { label: "EBIT / attivo", value: c },
      { label: "Patrimonio netto / passività", value: d },
      { label: "Ricavi / attivo", value: e },
    ],
  };
}

export interface BeneishResult {
  m: number;
  flag: boolean;
  /** indici calcolati; quelli non disponibili sono posti a 1 (neutri) ed elencati in `missing` */
  indices: Record<string, number>;
  missing: string[];
}

/**
 * Beneish M-Score: probabilità di manipolazione degli utili. M > −1,78 è un segnale di attenzione.
 * Servono due esercizi consecutivi. Gli indici non calcolabili sono trattati come neutri (=1).
 */
export function beneishM(cur: Values, prev: Values | undefined): BeneishResult | null {
  if (!prev || !ok(cur.revenue) || !ok(prev.revenue) || !ok(cur.total_assets) || !ok(prev.total_assets)) return null;
  if (prev.revenue <= 0 || cur.revenue <= 0) return null;
  const missing: string[] = [];
  const idx = (name: string, v: number | undefined) => {
    if (!ok(v) || v <= 0) {
      missing.push(name);
      return 1;
    }
    return v;
  };
  const dsri = idx("DSRI", div(div(cur.receivables, cur.revenue), div(prev.receivables, prev.revenue)));
  const gmC = div(derive(cur).grossProfit, cur.revenue);
  const gmP = div(derive(prev).grossProfit, prev.revenue);
  const gmi = idx("GMI", div(gmP, gmC));
  const aq = (v: Values) =>
    ok(v.total_current_assets) && ok(v.ppe_net) && ok(v.total_assets)
      ? 1 - (v.total_current_assets + v.ppe_net + (v.long_term_investments ?? 0)) / v.total_assets
      : undefined;
  const aqi = idx("AQI", div(aq(cur), aq(prev)));
  const sgi = cur.revenue / prev.revenue;
  const depRate = (v: Values) => (ok(v.da) && ok(v.ppe_net) ? v.da / (v.da + v.ppe_net) : undefined);
  const depi = idx("DEPI", div(depRate(prev), depRate(cur)));
  const sgai = idx("SGAI", div(div(cur.sga, cur.revenue), div(prev.sga, prev.revenue)));
  const levOf = (v: Values) => {
    const debt = (v.long_term_debt ?? 0) + (v.total_current_liabilities ?? 0);
    return ok(v.total_assets) && debt > 0 ? debt / v.total_assets : undefined;
  };
  const lvgi = idx("LVGI", div(levOf(cur), levOf(prev)));
  let tata = 0;
  if (ok(cur.net_income) && ok(cur.cfo)) tata = (cur.net_income - cur.cfo) / cur.total_assets;
  else missing.push("TATA");

  const m = -4.84 + 0.92 * dsri + 0.528 * gmi + 0.404 * aqi + 0.892 * sgi + 0.115 * depi - 0.172 * sgai + 4.679 * tata - 0.327 * lvgi;
  return {
    m,
    flag: m > -1.78,
    indices: { DSRI: dsri, GMI: gmi, AQI: aqi, SGI: sgi, DEPI: depi, SGAI: sgai, LVGI: lvgi, TATA: tata },
    missing,
  };
}

/** Rapporto di accrual di Sloan: (utile netto − cassa operativa) / attivo medio. Alto e positivo = utili poco "cash". */
export function accrualRatio(cur: Values, prev?: Values): number | undefined {
  if (!ok(cur.net_income) || !ok(cur.cfo) || !ok(cur.total_assets)) return undefined;
  const avgTa = ok(prev?.total_assets) ? (cur.total_assets + prev.total_assets) / 2 : cur.total_assets;
  return div(cur.net_income - cur.cfo, avgTa);
}

export type Severity = "alta" | "media" | "info";

export interface RedFlag {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

const p1 = (v: number) => (v * 100).toFixed(1).replace(".", ",") + "%";

/**
 * Regole deterministiche che segnalano situazioni da approfondire, confrontando gli ultimi esercizi.
 * Non sono giudizi: sono domande da porsi leggendo il bilancio.
 */
export function redFlags(series: { label: string; values: Values }[]): RedFlag[] {
  const flags: RedFlag[] = [];
  if (series.length < 2) return flags;
  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  const c = cur.values;
  const p = prev.values;
  const m = computeMetrics({ cur: c, prev: p, yearAgo: p });
  const mPrev = computeMetrics({ cur: p });
  const add = (id: string, severity: Severity, title: string, detail: string) => flags.push({ id, severity, title, detail });

  const revG = growth(c.revenue, p.revenue);
  const recG = growth(c.receivables, p.receivables);
  if (ok(revG) && ok(recG) && recG - revG > 0.1 && recG > 0.1) {
    add("receivables", "alta", "Crediti in crescita più veloce dei ricavi",
      `Crediti ${p1(recG)} contro ricavi ${p1(revG)} (${prev.label} → ${cur.label}). Può indicare ricavi anticipati, condizioni di pagamento più generose o difficoltà di incasso.`);
  }
  const invG = growth(c.inventory, p.inventory);
  if (ok(revG) && ok(invG) && invG - revG > 0.1 && invG > 0.1) {
    add("inventory", "media", "Magazzino in crescita più veloce dei ricavi",
      `Rimanenze ${p1(invG)} contro ricavi ${p1(revG)}. Rischio di domanda più debole del previsto e future svalutazioni.`);
  }
  if (ok(m.fcf_conversion) && m.fcf_conversion < 0.7 && ok(c.net_income) && c.net_income > 0) {
    const also = ok(mPrev.fcf_conversion) && mPrev.fcf_conversion < 0.7;
    add("fcf_conversion", also ? "alta" : "media", "Utili non convertiti in cassa",
      `Il FCF è il ${p1(m.fcf_conversion)} dell'utile netto in ${cur.label}${also ? ` (e ${p1(mPrev.fcf_conversion!)} in ${prev.label})` : ""}. Verificare capitale circolante, capex e poste non monetarie.`);
  }
  const acc = accrualRatio(c, p);
  if (ok(acc) && acc > 0.1) {
    add("accruals", "media", "Accrual elevati",
      `(Utile netto − cassa operativa) / attivo medio = ${p1(acc)}. Storicamente accrual alti anticipano utili futuri più deboli.`);
  }
  if (ok(m.gross_margin) && ok(mPrev.gross_margin) && m.gross_margin - mPrev.gross_margin < -0.02) {
    add("gross_margin", "media", "Margine lordo in calo",
      `Da ${p1(mPrev.gross_margin)} a ${p1(m.gross_margin)}. Capire se è mix, prezzi, costi di input o pressione competitiva.`);
  }
  if (ok(m.operating_margin) && ok(mPrev.operating_margin) && m.operating_margin - mPrev.operating_margin < -0.03) {
    add("operating_margin", "media", "Margine operativo in calo",
      `Da ${p1(mPrev.operating_margin)} a ${p1(m.operating_margin)}.`);
  }
  if (ok(m.sbc_pct) && m.sbc_pct > 0.1) {
    add("sbc", m.sbc_pct > 0.2 ? "alta" : "media", "Compensi in azioni elevati",
      `SBC pari al ${p1(m.sbc_pct)} dei ricavi. Il FCF dichiarato sovrastima la cassa realmente disponibile per gli azionisti.`);
  }
  if (ok(m.share_count_change) && m.share_count_change > 0.03) {
    add("dilution", m.share_count_change > 0.08 ? "alta" : "media", "Diluizione degli azionisti",
      `Azioni diluite ${p1(m.share_count_change)} in un anno.`);
  }
  if (ok(c.buybacks) && ok(c.sbc) && c.buybacks > 0 && c.sbc > c.buybacks * 0.6 && ok(m.share_count_change) && m.share_count_change > -0.005) {
    add("buyback_sbc", "info", "I buyback compensano soprattutto la diluizione",
      "Gran parte dei riacquisti serve a neutralizzare le azioni emesse ai dipendenti: il numero di azioni non scende davvero.");
  }
  if (ok(m.net_debt_to_ebitda) && m.net_debt_to_ebitda > 3) {
    add("leverage", m.net_debt_to_ebitda > 4.5 ? "alta" : "media", "Leva finanziaria elevata",
      `Debito netto / EBITDA = ${m.net_debt_to_ebitda.toFixed(1).replace(".", ",")}x.`);
  }
  if (ok(m.interest_coverage) && m.interest_coverage < 3) {
    add("coverage", m.interest_coverage < 1.5 ? "alta" : "media", "Copertura degli interessi bassa",
      `EBIT / oneri finanziari = ${m.interest_coverage.toFixed(1).replace(".", ",")}x.`);
  }
  if (ok(m.goodwill_pct_assets) && m.goodwill_pct_assets > 0.4) {
    add("goodwill", "info", "Attivo dominato da avviamento e intangibili",
      `${p1(m.goodwill_pct_assets)} del totale attivo: crescita fatta per acquisizioni, con rischio di svalutazioni.`);
  }
  if (ok(m.shareholder_return_pct_fcf) && m.shareholder_return_pct_fcf > 1.2) {
    add("payout", "media", "Remunerazione agli azionisti superiore al FCF",
      `Dividendi + buyback = ${p1(m.shareholder_return_pct_fcf)} del FCF: finanziata con cassa o nuovo debito.`);
  }
  if (ok(m.capex_to_da) && m.capex_to_da < 0.6 && ok(mPrev.capex_to_da) && mPrev.capex_to_da < 0.6) {
    add("underinvest", "info", "Capex stabilmente sotto gli ammortamenti",
      `Capex / ammortamenti = ${m.capex_to_da.toFixed(2).replace(".", ",")}x. Può essere un business leggero oppure sotto-investimento (o ammortamento di intangibili acquisiti).`);
  }
  if (ok(c.total_equity) && c.total_equity < 0) {
    add("neg_equity", "media", "Patrimonio netto negativo", "Spesso effetto di buyback aggressivi o perdite accumulate: valutare la sostenibilità del debito.");
  }
  if (ok(revG) && revG < 0) {
    add("rev_decline", "media", "Ricavi in calo", `Ricavi ${p1(revG)} anno su anno.`);
  }
  if (ok(m.dso) && ok(mPrev.dso) && m.dso - mPrev.dso > 10) {
    add("dso", "media", "Tempi di incasso in allungamento", `DSO da ${mPrev.dso.toFixed(0)} a ${m.dso.toFixed(0)} giorni.`);
  }
  const drG = growth(c.deferred_revenue, p.deferred_revenue);
  if (ok(drG) && ok(revG) && drG < -0.1 && revG > 0) {
    add("deferred", "info", "Ricavi differiti in calo mentre i ricavi crescono",
      `Ricavi differiti ${p1(drG)}: possibile rallentamento degli ordini futuri.`);
  }
  const order: Record<Severity, number> = { alta: 0, media: 1, info: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity]);
}

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Controlli di coerenza aritmetica sui dati estratti: se non tornano, probabilmente c'è un errore di estrazione
 * (o una voce classificata in modo diverso) e conviene verificare la fonte.
 */
export function coherenceChecks(v: Values, tolerance = 0.015): Check[] {
  const out: Check[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * tolerance + 1;
  const fmt = (n: number) => Math.round(n).toLocaleString("it-IT");
  const check = (label: string, lhs: number | undefined, rhs: number | undefined, text: string) => {
    if (!ok(lhs) || !ok(rhs)) return;
    out.push({ label, ok: near(lhs, rhs), detail: `${text}: ${fmt(lhs)} vs ${fmt(rhs)}` });
  };
  if (ok(v.revenue) && ok(v.cost_of_revenue)) check("Utile lordo", v.gross_profit, v.revenue - v.cost_of_revenue, "Ricavi − costo del venduto");
  if (ok(v.total_liabilities) && ok(v.total_equity))
    check("Attivo = passività + patrimonio", v.total_assets, v.total_liabilities + v.total_equity + (v.minority_interest ?? 0), "Totale attivo");
  if (ok(v.pretax_income) && ok(v.income_tax)) {
    // tolleranza più ampia: minoranze e attività cessate possono creare differenze
    const lhs = v.net_income;
    const rhs = v.pretax_income - v.income_tax;
    if (ok(lhs)) out.push({ label: "Utile netto", ok: Math.abs(lhs - rhs) <= Math.abs(rhs) * 0.05 + 1, detail: `Ante imposte − imposte: ${fmt(lhs)} vs ${fmt(rhs)}` });
  }
  if (ok(v.cfo) && ok(v.cfi) && ok(v.cff) && ok(v.net_change_cash)) {
    const lhs = v.net_change_cash;
    const rhs = v.cfo + v.cfi + v.cff;
    // l'effetto cambi non è una voce separata: tolleranza del 5% della cassa operativa
    out.push({ label: "Variazione di cassa", ok: Math.abs(lhs - rhs) <= Math.abs(v.cfo) * 0.05 + 1, detail: `CFO + CFI + CFF: ${fmt(lhs)} vs ${fmt(rhs)} (differenza = effetto cambi)` });
  }
  if (ok(v.net_income) && ok(v.eps_diluted) && ok(v.shares_diluted) && v.shares_diluted > 0) {
    const eps = v.net_income / v.shares_diluted;
    out.push({ label: "EPS diluito", ok: Math.abs(eps - v.eps_diluted) <= Math.abs(v.eps_diluted) * 0.03 + 0.01, detail: `Utile netto / azioni diluite: ${eps.toFixed(2)} vs ${v.eps_diluted.toFixed(2)}` });
  }
  return out;
}
