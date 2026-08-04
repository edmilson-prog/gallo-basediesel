import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/hooks/useTheme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toast host. The visual skin lives in styles.css, deliberately outside every
 * @layer — sonner injects its own unlayered stylesheet at runtime, and in the
 * cascade an unlayered declaration beats a layered one whatever its
 * specificity, so Tailwind utilities are inert here (on the toast surface and
 * on its inner parts alike). Only behaviour is configured in this file.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  // sonner defaults to its light palette, which would render a white toast
  // with near-black text over a dark app. Feeding it the resolved mode keeps
  // its internal grays in step with the theme.
  const { resolvedMode } = useTheme();

  return <Sonner className="toaster group" theme={resolvedMode} {...props} />;
};

export { Toaster };
