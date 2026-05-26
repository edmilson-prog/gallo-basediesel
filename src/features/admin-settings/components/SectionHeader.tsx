interface ISectionHeaderProps {
  title: string;
  description?: string;
  /** Optional action element rendered to the right of the header. */
  action?: React.ReactNode;
}

export function SectionHeader({ title, description, action }: ISectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
