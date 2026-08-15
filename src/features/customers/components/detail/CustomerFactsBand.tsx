import type { ICustomer } from "@/shared/types";
import { cn } from "@/lib/utils";
import { CustomerFact } from "./CustomerFact";
import { buildCustomerFactCells } from "./customerFactCells";

export interface ICustomerFactsBandProps {
  customer: ICustomer;
  sellerName: string | null;
  storeName: string | null;
}

/**
 * Band 2 — the contact data a seller needs within three seconds of opening the
 * page. All of it used to live behind the "Visão geral" tab.
 *
 * The address gets the flexible column because it is the longest field by far;
 * the rest keep their natural width so the row stays scannable.
 */
export function CustomerFactsBand({ customer, sellerName, storeName }: ICustomerFactsBandProps) {
  const cells = buildCustomerFactCells(customer, sellerName, storeName);

  return (
    <div className="flex flex-wrap items-start gap-y-3 px-4 py-2.5 sm:px-6">
      {cells.map((cell, index) => {
        const { key, ...fact } = cell;
        const isAddress = key === "address";
        return (
          <div
            key={key}
            className={cn(
              "min-w-0 border-border pr-4",
              index === 0 ? "shrink-0 basis-1/2 sm:basis-auto sm:pr-5" : "sm:border-l sm:pl-5",
              index > 0 && !isAddress && "shrink-0 basis-1/2 sm:basis-auto sm:pr-5",
              isAddress && "flex-1 basis-full sm:basis-[220px] sm:pr-5",
              key === "legalName" && "sm:max-w-[260px]",
              index === cells.length - 1 && "sm:pr-0",
            )}
          >
            <CustomerFact {...fact} />
          </div>
        );
      })}
    </div>
  );
}
