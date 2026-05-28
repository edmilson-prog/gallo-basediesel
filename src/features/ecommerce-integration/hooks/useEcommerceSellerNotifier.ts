import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { formatBRL } from "@/shared/utils/format";
import { useAuth } from "@/features/auth/useAuth";
import {
  useEcommerceNotificationStore,
  type IEcommerceNotification,
} from "../store/ecommerceNotificationStore";

/**
 * Surfaces a prominent toast when a new e-commerce order is routed to the
 * signed-in seller (PRD-067 RF-008/009). Managers/Owner additionally receive
 * "pending distribution" alerts. Mounted once in the app shell; returns the
 * unseen counter for the sidebar badge (RF-010).
 */
export function useEcommerceSellerNotifier(): number {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const notifications = useEcommerceNotificationStore((s) => s.notifications);
  const markSeen = useEcommerceNotificationStore((s) => s.markSeen);

  const sellerId = currentUser?.sellerId ?? null;
  const canDistribute = currentUser?.role === "Owner" || currentUser?.role === "Gestor";

  const relevant = notifications.filter((n) => {
    if (n.kind === "pending_distribution") return canDistribute;
    return n.sellerId !== null && n.sellerId === sellerId;
  });

  const unseenCount = relevant.filter((n) => !n.seen).length;

  useEffect(() => {
    if (!currentUser) return;
    const unseen = relevant.filter((n) => !n.seen);
    for (const n of unseen) {
      raiseToast(n, navigate);
      markSeen(n.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications, currentUser?.id]);

  return unseenCount;
}

function raiseToast(
  n: IEcommerceNotification,
  navigate: ReturnType<typeof useNavigate>,
): void {
  const isPending = n.kind === "pending_distribution";
  const title = isPending
    ? `🛒 Pedido e-commerce aguardando distribuição`
    : `🛒 Novo pedido via e-commerce`;
  toast(title, {
    description: `${n.customerName} — ${formatBRL(n.total)} — ${n.orderNumber}`,
    duration: 8000,
    action: {
      label: "Ver pedido",
      onClick: () => void navigate({ to: "/app/pedidos/$id", params: { id: n.orderId } }),
    },
  });
}
