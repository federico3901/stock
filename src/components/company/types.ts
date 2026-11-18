import type { Analysis } from "@/lib/analysis/summary";
import type { CompanyBundle } from "@/lib/repo";

export interface TabProps {
  bundle: CompanyBundle;
  analysis: Analysis;
  refresh: () => void;
  setTab: (tab: string) => void;
}
