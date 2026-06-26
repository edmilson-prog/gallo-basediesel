import type { ID, IWhatsAppGoServer } from "@/shared/types";
import type {
  ICreateGoServerInput,
  IGoServerPatch,
  IWhatsAppGoServersProvider,
} from "../../contracts/whatsappGoServers";

/** Stable demo seed so the wizard's server selector has one option in mock mode. */
function seed(): IWhatsAppGoServer[] {
  return [
    {
      id: "00000000-0000-0000-0000-0000000000go",
      name: "Servidor Go (demonstração)",
      baseUrl: "https://evogo.demo.local",
      apiKeyRef: "WA_GO_SERVER_DEMO_AB",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
}

let servers: IWhatsAppGoServer[] = seed();

/** Test-only: restore the deterministic seed between cases. */
export function __resetMockGoServers(): void {
  servers = seed();
}

export const mockWhatsAppGoServersProvider: IWhatsAppGoServersProvider = {
  async list(): Promise<IWhatsAppGoServer[]> {
    return servers.map((s) => ({ ...s }));
  },
  async create(input: ICreateGoServerInput): Promise<IWhatsAppGoServer> {
    const server: IWhatsAppGoServer = {
      id: crypto.randomUUID(),
      name: input.name,
      baseUrl: input.baseUrl,
      apiKeyRef: input.apiKeyRef,
      createdAt: new Date().toISOString(),
    };
    servers = [...servers, server];
    return { ...server };
  },
  async update(id: ID, patch: IGoServerPatch): Promise<IWhatsAppGoServer> {
    const idx = servers.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`[mock] go server ${id} not found`);
    const next = {
      ...servers[idx],
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.baseUrl !== undefined ? { baseUrl: patch.baseUrl } : {}),
      updatedAt: new Date().toISOString(),
    };
    servers = servers.map((s) => (s.id === id ? next : s));
    return { ...next };
  },
  async remove(id: ID): Promise<void> {
    servers = servers.filter((s) => s.id !== id);
  },
};
