import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // Severity is carried by a left border + icon tint so an error never
          // reads as a neutral notice. Semantic tokens only — these follow the
          // active theme and light/dark mode like everything else.
          error: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-severity-critical",
          success: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-severity-success",
          warning: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-severity-warning",
          info: "group-[.toaster]:border-l-4 group-[.toaster]:border-l-severity-info",
          closeButton: "group-[.toast]:bg-background group-[.toast]:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
