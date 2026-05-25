import { useContext } from "react";
import { AuthContext, type IAuthContextValue } from "./AuthProvider";

export function useAuth(): IAuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }
  return ctx;
}
