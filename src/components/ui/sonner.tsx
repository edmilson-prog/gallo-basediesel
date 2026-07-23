import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/hooks/useTheme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // sonner defaults to its light palette, which would render a white toast
  // with near-black text over a dark app. Feeding it the resolved mode keeps
  // its internal grays (close button, description) in step with the theme.
  const { resolvedMode } = useTheme();

  return (
    <Sonner
      className="toaster group"
      theme={resolvedMode}
      toastOptions={{
        classNames: {
          // Only the inner parts are styled through utilities. The toast
          // surface itself is skinned in styles.css, outside @layer — sonner's
          // unlayered stylesheet beats any layered utility we could put here.
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
