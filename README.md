# Stock

Strumento personale per analizzare un'azienda quotata partendo dai suoi documenti: carichi 10-K, 10-Q, comunicati sui risultati, presentazioni e trascrizioni delle call, e ottieni bilanci normalizzati, metriche, guidance, valutazione e analisi qualitativa in un unico posto.

Non è un servizio di consulenza: i numeri dipendono dai documenti caricati e dalle ipotesi che inserisci.

## Cosa fa

| Scheda | Contenuto |
|---|---|
| **Panoramica** | Numeri chiave, conclusioni calcolate dai dati ("Cosa dicono i numeri"), ultimo trimestre contro anno prima e trimestre precedente, stato della tesi, grafici, segnali, guidance aperta |
| **Documenti** | Caricamento di PDF, HTML (filing SEC) e testo. Il file è letto nel browser: al server arriva solo il testo |
| **Bilanci** | Conto economico, stato patrimoniale, rendiconto finanziario, segmenti e KPI. Annuale e trimestrale (il Q4 è ricavato per differenza), % sui ricavi, variazioni, correzione a mano, rimando alla pagina di origine, controlli di coerenza, esportazione CSV |
| **Metriche** | Circa 45 indicatori: crescita, margini, ROIC/ROE, cassa, solidità, capitale circolante, ritorno agli azionisti, valori per azione, CAGR, scomposizione DuPont |
| **Guidance** | Ogni obiettivo comunicato dal management, le revisioni nel tempo e il confronto col dato effettivo: superata, in linea, mancata. Punteggio di affidabilità del management |
| **Valutazione** | Multipli, reverse DCF (quale crescita e quale margine sconta il prezzo), tre scenari con DCF e rendimento atteso a 5 anni, valore ponderato, tabella di sensibilità |
| **Qualità e segnali** | Piotroski F, Altman Z, Beneish M, accrual, segnali automatici (crediti e magazzino più veloci dei ricavi, utili non coperti da cassa, diluizione, capex bassi…) |
| **Analisi qualitativa** | Per ogni documento: sintesi, modello di business, rischi specifici, segnali contabili, rettifiche non-GAAP, tono del management, citazioni, domande aperte |
| **Cosa è cambiato** | Confronto tra due filing: paragrafi nuovi, riscritti e rimossi in Risk Factors, MD&A e descrizione del business, con sintesi scritta dal modello |
| **Chiedi ai documenti** | Chat sui documenti scelti, con citazioni cliccabili che aprono la pagina |
| **Tesi, note e memo** | Condizioni della tesi verificate in automatico a ogni nuovo dato ("margine operativo ≥ 18%"), note, memo d'investimento generato e stampabile |

In più: confronto fianco a fianco tra aziende, backup e ripristino di tutti i dati, tema chiaro e scuro, azienda dimostrativa per esplorare l'app senza caricare nulla.

## Avvio in locale

Serve Node.js 20.9 o successivo.

```bash
npm install
cp .env.example .env.local   # poi inserisci ANTHROPIC_API_KEY
npm run dev
```

Apri http://localhost:3000 e premi **Carica azienda demo** per vedere tutte le schede con dati inventati.

Senza `DATABASE_URL` i dati sono salvati nella cartella `data/` del progetto.

## Configurazione

| Variabile | A cosa serve |
|---|---|
| `ANTHROPIC_API_KEY` | Lettura dei documenti, chat, memo, sintesi delle differenze. Senza chiave l'app funziona ma i dati vanno inseriti a mano |
| `ANTHROPIC_MODEL` | Facoltativa. Predefinito `claude-opus-5-5` |
| `DATABASE_URL` | Postgres. Obbligatoria su Vercel, dove i file non sono persistenti. La tabella `stock_records` viene creata da sola |
| `APP_PASSWORD` | Password di accesso. Da impostare se l'app è online: senza, chiunque abbia il link usa la tua chiave API |
| `LLM_MOCK=1` | Modalità di prova: le analisi restituiscono dati finti, nessuna chiamata al modello |

## Pubblicazione su Vercel con Supabase

1. Su Supabase crea un progetto, poi **Connect → Transaction pooler** e copia la stringa di connessione.
2. Su Vercel importa questo repository e in **Settings → Environment Variables** imposta `ANTHROPIC_API_KEY`, `DATABASE_URL` e `APP_PASSWORD`.
3. Pubblica. Per portare online i dati creati in locale: **Impostazioni → Scarica backup** in locale, poi **Ripristina da file** sull'app pubblicata.

L'analisi di un documento lungo può durare qualche minuto: le route di estrazione chiedono fino a 300 secondi, quindi controlla che la durata massima delle funzioni del tuo piano Vercel lo consenta.

## Costi

Ogni documento viene letto fino a tre volte (bilanci, guidance, analisi qualitativa); il testo è messo in cache, quindi la seconda e la terza lettura costano una frazione della prima. Il costo stimato di ogni analisi compare accanto al documento. Come ordine di grandezza, un 10-K da 150 pagine è intorno a 100-150 mila token di input: aspettati circa un dollaro a documento col modello predefinito. La stima usa una tabella prezzi scritta nel codice (`src/lib/llm/client.ts`), da aggiornare se i listini cambiano.

## Come sono fatti i dati

- I valori sono salvati in unità intere della valuta di bilancio; costi, capex, dividendi e buyback sono positivi.
- Un periodo è identificato da azienda, esercizio e periodo (`FY`, `Q1`…`Q4`, `H1`, `9M`). Se due documenti riportano lo stesso periodo vince il più recente, tranne per i campi corretti a mano, che non vengono mai sovrascritti.
- Il TTM è la somma degli ultimi quattro trimestri per i flussi e l'ultimo dato per lo stato patrimoniale.
- Le metriche, i punteggi e la valutazione sono calcolati dal codice (`src/lib/analysis`), non dal modello: il modello serve solo a leggere i documenti e a scrivere testo.

## Sviluppo

```bash
npm test          # test dei motori di analisi e dell'archivio dati
npm run typecheck
npm run lint
npm run build
```

Struttura: `src/lib/analysis` (calcoli puri), `src/lib/llm` (prompt, schemi ed estrazione), `src/lib/parse` (lettura di PDF e HTML nel browser), `src/lib/store` (archivio su file o Postgres), `src/app/api` (route), `src/components/company` (una scheda per file).

## Limiti noti

- I PDF fatti di sole immagini (scansioni) non contengono testo e non vengono letti.
- Il confronto tra filing riconosce le sezioni dei documenti SEC in inglese (Item 1, 1A, 7…).
- Il prezzo dell'azione si inserisce a mano.
- Nel confronto tra aziende le valute non sono convertite.
