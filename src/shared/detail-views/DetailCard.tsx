import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export interface IDetailCardProps {
  icon: string;
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function DetailCard({ icon, title, action, className, children }: IDetailCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon={icon} size={16} className="text-muted-foreground" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}
