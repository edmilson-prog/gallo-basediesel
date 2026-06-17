import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useSellersProvider } from "@/providers/data";
import { isWithinWorkSchedule } from "../engine/workSchedule";
import { OPERATIONAL_ROLES } from "../engine/accessGate";

/** Watches whether the signed-in operational user is outside their schedule.
 *  On the inside→outside transition, flips availability to offline once. */
export function useOutsideHoursWatcher(): { outside: boolean } {
  const { currentUser } = useAuth();
  const sellers = useSellersProvider();
  const sellerId = currentUser?.sellerId;
  const operational = currentUser ? OPERATIONAL_ROLES.includes(currentUser.role) : false;

  const sellerQuery = useQuery({
    queryKey: ["seller", sellerId],
    queryFn: () => sellers.get(sellerId!),
    enabled: Boolean(sellerId) && operational,
  });

  const [outside, setOutside] = useState(false);
  const autoOfflineDone = useRef(false);

  useEffect(() => {
    const seller = sellerQuery.data;
    if (!seller || !operational || (seller.workSchedule?.length ?? 0) === 0) {
      setOutside(false);
      return;
    }
    const tick = () => {
      const isOutside = !isWithinWorkSchedule(
        { workSchedule: seller.workSchedule, scheduleOverrides: seller.scheduleOverrides },
        new Date(),
      );
      setOutside(isOutside);
      if (isOutside && !autoOfflineDone.current && seller.availability !== "offline") {
        autoOfflineDone.current = true;
        void sellers.setAvailability(seller.id, "offline");
      }
      if (!isOutside) autoOfflineDone.current = false; // re-arm for the next close
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [sellerQuery.data, operational, sellers]);

  return { outside };
}
