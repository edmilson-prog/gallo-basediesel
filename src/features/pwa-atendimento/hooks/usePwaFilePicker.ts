import { useCallback } from "react";

export type PwaPickKind = "photo" | "camera" | "document";

const ACCEPT: Record<PwaPickKind, string> = {
  photo: "image/*",
  camera: "image/*",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf",
};

/**
 * Opens the device picker and resolves with the chosen file.
 *
 * A hidden `<input type="file">` created on demand, rather than one mounted in
 * the tree, so "Câmera" can set `capture` without the photo option inheriting
 * it — on Android, a lingering `capture` attribute turns the gallery picker
 * into the camera.
 */
export function usePwaFilePicker() {
  const pick = useCallback((kind: PwaPickKind): Promise<File | null> => {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ACCEPT[kind];
      if (kind === "camera") input.setAttribute("capture", "environment");
      input.style.display = "none";

      let settled = false;
      const finish = (file: File | null) => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(file);
      };

      input.addEventListener("change", () => finish(input.files?.[0] ?? null));
      // `cancel` is not universal; the picker simply never resolves a file then,
      // and the input is cleaned up when the next pick replaces it.
      input.addEventListener("cancel", () => finish(null));

      document.body.appendChild(input);
      input.click();
    });
  }, []);

  return { pick };
}
