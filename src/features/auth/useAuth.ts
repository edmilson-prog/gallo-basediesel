import { useContext } from "react";
import { AuthContext, type IAuthContextValue } from "./authContext";

export function useAuth(): IAuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }
  return ctx;
}
