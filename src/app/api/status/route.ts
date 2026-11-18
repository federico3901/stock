import { route } from "@/lib/api";
import { llmConfigured, llmMock, llmModel } from "@/lib/llm/client";
import { storageKind } from "@/lib/store";

export const GET = route(async () => ({
  llm: llmConfigured(),
  mock: llmMock(),
  model: llmModel(),
  storage: storageKind(),
  passwordProtected: Boolean(process.env.APP_PASSWORD),
}));
