import type { StoredRecord } from "@/lib/store/types";
import data from "./data/index.json";

/** Le aziende distribuite con l'app: generate da scripts/build-seed.mjs a partire da import/. */
export const SEED_RECORDS = data as StoredRecord[];
