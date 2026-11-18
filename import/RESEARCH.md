# Scheda di ricerca per un'azienda

Scopo: raccogliere da fonti pubbliche e primarie (comunicati sui risultati, presentazioni, bilanci annuali, 10-K/10-Q, sito investor relations della società) guidance, dati di segmento, KPI e analisi qualitativa di UNA azienda, e scriverli in un file JSON.

## Regole che non ammettono eccezioni

1. **Niente a memoria.** Ogni numero e ogni citazione deve venire da una pagina che hai aperto in questa sessione con WebFetch (trovata con WebSearch). Se non trovi un dato, non lo scrivi: lo elenchi in `missing`.
2. **Ogni voce ha la sua fonte**: l'`id` di un documento elencato in `documents`, che a sua volta ha un `url` che hai davvero aperto.
3. Le citazioni (`quote`) sono testuali, nella lingua originale, al massimo 250 caratteri. Se non hai il testo esatto lascia `quote` vuoto.
4. Preferisci la fonte primaria (sito della società, SEC). Una fonte secondaria (agenzia di stampa, sito finanziario) va bene solo se la primaria non è raggiungibile, e va detto nel titolo del documento ("via Reuters").
5. Testi descrittivi in **italiano**, sobri, senza aggettivi promozionali. Nomi propri e termini tecnici (EBITA, backlog, book-to-bill) restano come sono.
6. La data di oggi è 18 novembre 2026: cerca i risultati più recenti (trimestre o nove mesi 2026) oltre agli esercizi 2024 e 2025.

## Cosa cercare

- **Guidance**: per gli esercizi 2024, 2025 e 2026, la guidance iniziale (data con i risultati annuali) e ogni revisione successiva in corso d'anno, più eventuali obiettivi di piano pluriennale. Servono per misurare quanto il management rispetta le promesse.
- **Segmenti e KPI**: ricavi (e, se pubblicato, risultato operativo) per segmento per gli ultimi 2-3 esercizi; KPI operativi che contano per quel business (ordini, portafoglio ordini/backlog, book-to-bill, iscritti, medical care ratio, ecc.).
- **Analisi qualitativa** dell'ultimo bilancio annuale e degli ultimi risultati: modello di business, punti positivi e negativi, rischi specifici (non l'elenco standard), segnali contabili (voci una tantum, rettifiche, cambi di perimetro, differenza tra risultati rettificati e contabili), allocazione del capitale, posizione competitiva, tono del management, domande aperte.

## Formato del file (JSON valido, UTF-8)

```jsonc
{
  "documents": [
    {
      "id": "<slug-azienda>-<slug-breve>",        // es. "ldo-risultati-fy2025"
      "title": "Risultati esercizio 2025 (comunicato stampa)",
      "type": "earnings_release",                  // 10-K | 10-Q | 8-K | earnings_release | presentation | transcript | annual_report | other
      "date": "2026-02-25",                        // data di pubblicazione YYYY-MM-DD
      "fiscalYear": 2025,
      "fiscalPeriod": "FY",                        // FY | Q1 | Q2 | Q3 | Q4 | H1 | 9M
      "url": "https://..."                         // pagina o PDF che hai aperto
    }
  ],
  "guidance": [
    {
      "docId": "<id di un documento sopra>",
      "issuedDate": "2026-02-25",                  // quando è stata comunicata
      "metric": "revenue",                         // revenue | revenue_growth | gross_margin | operating_income | operating_margin | net_income | eps_diluted | ebitda | cfo | fcf | capex | tax_rate | other
      "label": "Ricavi",                           // etichetta usata dal management, es. "EBITA", "FOCF", "Adjusted EPS"
      "targetFiscalYear": 2026,
      "targetPeriod": "FY",
      "low": 21000000000,                          // importi in unità intere della valuta (21 miliardi = 21000000000); percentuali come frazione (0.085 = 8,5%); valori per azione così come sono
      "high": 21500000000,                         // se è un valore puntuale low = high; "circa X" -> low = high = X; "almeno X" -> solo low; "fino a X" -> solo high
      "unit": "currency",                          // currency | percent | per_share | other
      "nonGaap": false,                            // true se è una misura rettificata o non definita dai principi contabili (EBITA, adjusted EPS, FOCF...)
      "qualitative": false,                        // true se non c'è un numero (allora ometti low/high)
      "text": "Breve descrizione in italiano, con le ipotesi dichiarate",
      "quote": "testo esatto dal documento"
    }
  ],
  "custom": [
    {
      "category": "segment_revenue",               // segment_revenue | segment_profit | geo_revenue | kpi
      "name": "Elicotteri",
      "fiscalYear": 2025,
      "fiscalPeriod": "FY",
      "value": 5800000000,                         // unità intere; percentuali come frazione; conteggi come numero
      "unit": "currency",                          // currency | percent | count | testo libero (es. "iscritti")
      "source": { "docId": "<id documento>" }
    }
  ],
  "insights": {
    "id": "<id del documento principale su cui si basa, di norma l'ultimo bilancio annuale o gli ultimi risultati>",
    "summary": "3-5 frasi: cosa è successo nell'ultimo esercizio e negli ultimi risultati",
    "businessModel": "come guadagna: segmenti, clienti, natura dei ricavi",
    "highlights": ["..."],                         // 3-6 punti, con numeri
    "lowlights": ["..."],                          // 3-6 punti, con numeri
    "risks": [ { "title": "...", "detail": "...", "severity": "alta" } ],          // alta | media | bassa; 3-6 rischi specifici
    "accountingFlags": [ { "title": "...", "detail": "...", "severity": "media" } ], // 0-5; vuoto se non ne trovi
    "capitalAllocation": "dividendi, buyback, acquisizioni, debito",
    "competitivePosition": "...",
    "managementTone": { "label": "positivo", "rationale": "..." },                  // molto positivo | positivo | neutro | cauto | negativo
    "nonGaapAdjustments": ["..."],
    "keyQuotes": [ { "text": "citazione testuale", "why": "perché conta" } ],       // 0-4
    "openQuestions": ["..."]                       // 3-5 domande a cui i documenti non rispondono
  },
  "price": { "value": 0, "date": "YYYY-MM-DD", "currency": "EUR", "url": "https://..." }, // ultimo prezzo di chiusura trovato; ometti se non lo trovi
  "missing": ["cosa hai cercato e non trovato, o che non hai potuto aprire"]
}
```

## Controlli prima di consegnare

- Il file è JSON valido: `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('ok')" <file>`
- Ogni `docId` e `insights.id` esiste in `documents`.
- Ordini di grandezza: un ricavo di 19,5 miliardi è `19500000000`, non `19500` né `19.5`.
- Non scrivere nulla fuori dalla cartella indicata nel compito. Non toccare `/mnt/project-files`.
