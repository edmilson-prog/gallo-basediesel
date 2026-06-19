import { describe, it, expect, beforeEach } from "vitest";
import { storesApi } from "@/mocks";
import { resetMockStore } from "@/mocks/store/mockStore";
import { DEFAULT_SEED } from "@/mocks/config";

describe("storesApi mutations", () => {
  beforeEach(() => resetMockStore(DEFAULT_SEED));

  it("cria uma filial com isActive true e settings padrão", async () => {
    const created = await storesApi.create({
      name: "GALLO Erechim",
      type: "filial",
      cnpj: "00.000.000/0001-00",
      address: "Erechim/RS",
      activeDivisions: ["parts"],
    });
    expect(created.id).toBeTruthy();
    expect(created.isActive).toBe(true);
    expect(created.settings.storeId).toBe(created.id);
    const all = await storesApi.list();
    expect(all.some((s) => s.id === created.id)).toBe(true);
  });

  it("edita uma filial existente", async () => {
    const created = await storesApi.create({
      name: "GALLO Erechim",
      type: "filial",
      cnpj: "00.000.000/0001-00",
      address: "Erechim/RS",
      activeDivisions: ["parts"],
    });
    const updated = await storesApi.update(created.id, { name: "GALLO Erechim Centro" });
    expect(updated.name).toBe("GALLO Erechim Centro");
    expect(updated.cnpj).toBe("00.000.000/0001-00");
  });

  it("rejeita desativar a matriz", async () => {
    const all = await storesApi.list();
    const matriz = all.find((s) => s.type === "matriz");
    expect(matriz).toBeTruthy();
    await expect(storesApi.setActive(matriz!.id, false)).rejects.toThrow();
  });

  it("desativa uma filial quando há outra loja ativa", async () => {
    const created = await storesApi.create({
      name: "GALLO Erechim",
      type: "filial",
      cnpj: "00.000.000/0001-00",
      address: "Erechim/RS",
      activeDivisions: ["parts"],
    });
    const disabled = await storesApi.setActive(created.id, false);
    expect(disabled.isActive).toBe(false);
  });
});
