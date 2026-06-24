import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { IMessageVolumeResult } from "@/shared/types";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

export function MessageVolumeChart({ data }: { data?: IMessageVolumeResult }) {
  const empty = !data || data.series.length === 0;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{S.msgVolumeTitle}</h2>
        <Icon icon="mdi:swap-horizontal" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.empty}</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} width={40} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} iconSize={10} />
              <Line type="monotone" dataKey="received" name="Recebidas" stroke="var(--gallo-parts-green, #337648)" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="sent" name="Enviadas" stroke="var(--primary)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
