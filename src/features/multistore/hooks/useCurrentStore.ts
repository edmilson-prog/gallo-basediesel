import { useContext } from "react";
import { MultistoreContext, type IMultistoreContextValue } from "../MultistoreContext";

/**
 * Read the active store of the session and switch between accessible stores.
 *
 * Must be consumed inside a `<MultistoreProvider>` — the root tree wires it
 * up in `src/routes/__root.tsx`.
 *
 * @see ../MultistoreProvider.tsx
 */
export function useCurrentStore(): IMultistoreContextValue {
  const ctx = useContext(MultistoreContext);
  if (!ctx) {
    throw new Error("useCurrentStore must be used inside a <MultistoreProvider>");
  }
  return ctx;
}
