import { route } from "@/lib/api";
import { llmConfigured, llmMock, llmModel } from "@/lib/llm/client";
import { isEphemeral, storageKind } from "@/lib/store";

export const GET = route(async () => ({
  llm: llmConfigured(),
  mock: llmMock(),
  model: llmModel(),
  storage: storageKind(),
  ephemeral: isEphemeral(),
  passwordProtected: Boolean(process.env.APP_PASSWORD),
}));
