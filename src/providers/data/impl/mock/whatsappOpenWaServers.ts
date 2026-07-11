import type { ID, IWhatsAppOpenWaServer } from "@/shared/types";
import type {
  ICreateOpenWaServerInput,
  IOpenWaServerPatch,
  IWhatsAppOpenWaServersProvider,
} from "../../contracts/whatsappOpenWaServers";

/** Stable demo seed so the wizard's server selector has one option in mock mode. */
function seed(): IWhatsAppOpenWaServer[] {
  return [
    {
      id: "00000000-0000-0000-0000-00000000owa1",
      name: "Servidor OpenWA (demonstração)",
      baseUrl: "https://openwa.demo.local",
      apiKeyRef: "WA_OPENWA_SERVER_DEMO_AB",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
}

let servers: IWhatsAppOpenWaServer[] = seed();

/** Test-only: restore the deterministic seed between cases. */
export function __resetMockOpenWaServers(): void {
  servers = seed();
}

export const mockWhatsAppOpenWaServersProvider: IWhatsAppOpenWaServersProvider = {
  async list(): Promise<IWhatsAppOpenWaServer[]> {
    return servers.map((s) => ({ ...s }));
  },
  async create(input: ICreateOpenWaServerInput): Promise<IWhatsAppOpenWaServer> {
    const server: IWhatsAppOpenWaServer = {
      id: crypto.randomUUID(),
      name: input.name,
      baseUrl: input.baseUrl,
      apiKeyRef: input.apiKeyRef,
      createdAt: new Date().toISOString(),
    };
    servers = [...servers, server];
    return { ...server };
  },
  async update(id: ID, patch: IOpenWaServerPatch): Promise<IWhatsAppOpenWaServer> {
    const idx = servers.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`[mock] openwa server ${id} not found`);
    const next: IWhatsAppOpenWaServer = {
      ...servers[idx]!,
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
