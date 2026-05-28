import { useEffect } from "react";
import { useCustomersProvider } from "@/providers/data";
import { usePortalStore } from "../store/portalStore";

/**
 * Seeds the portal user roster once from the first B2B customers (PRD-071
 * RF-006). Mounted in the portal layout so the directory exists before login.
 */
export function usePortalSeed() {
  const provider = useCustomersProvider();
  const seeded = usePortalStore((s) => s.seeded);
  const seedFromCustomers = usePortalStore((s) => s.seedFromCustomers);

  useEffect(() => {
    if (seeded) return;
    let cancelled = false;
    void (async () => {
      const result = await provider.list({ type: "B2B", pageSize: 50 });
      if (!cancelled) seedFromCustomers(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [seeded, provider, seedFromCustomers]);
}
