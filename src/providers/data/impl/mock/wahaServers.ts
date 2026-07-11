import type { ID, IWahaServer } from "@/shared/types";
import type {
  ICreateWahaServerInput,
  IWahaServerPatch,
  IWahaServersProvider,
} from "../../contracts/wahaServers";

function seed(): IWahaServer[] {
  return [
    {
      id: "00000000-0000-0000-0000-000000wahad",
      name: "Servidor WAHA (demonstração)",
      baseUrl: "https://waha.demo.local",
      apiKeyRef: "WAHA_SERVER_DEMO_AB",
      webhookHmacRef: "WAHA_SERVER_DEMO_HMAC",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
}

let servers: IWahaServer[] = seed();

/** Test-only: restore the deterministic seed between cases. */
export function __resetMockWahaServers(): void {
  servers = seed();
}

export const mockWahaServersProvider: IWahaServersProvider = {
  async list(): Promise<IWahaServer[]> {
    return servers.map((s) => ({ ...s }));
  },
  async create(input: ICreateWahaServerInput): Promise<IWahaServer> {
    const server: IWahaServer = {
      id: crypto.randomUUID(),
      name: input.name,
      baseUrl: input.baseUrl,
      apiKeyRef: input.apiKeyRef,
      createdAt: new Date().toISOString(),
    };
    servers = [...servers, server];
    return { ...server };
  },
  async update(id: ID, patch: IWahaServerPatch): Promise<IWahaServer> {
    const idx = servers.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`[mock] waha server ${id} not found`);
    const next = {
      ...servers[idx],
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.baseUrl !== undefined ? { baseUrl: patch.baseUrl } : {}),
      updatedAt: new Date().toISOString(),
    };
    servers = servers.map((s) => (s.id === id ? next : s));
    return { ...next };
  },
  async setWebhookHmacRef(id: ID, hmacRef: string | null): Promise<IWahaServer> {
    const idx = servers.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`[mock] waha server ${id} not found`);
    const next: IWahaServer = {
      ...servers[idx],
      webhookHmacRef: hmacRef ?? undefined,
      updatedAt: new Date().toISOString(),
    };
    servers = servers.map((s) => (s.id === id ? next : s));
    return { ...next };
  },
  async remove(id: ID): Promise<void> {
    servers = servers.filter((s) => s.id !== id);
  },
};
