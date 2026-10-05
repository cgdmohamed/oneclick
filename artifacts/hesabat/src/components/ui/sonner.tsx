import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      expand
      gap={10}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // Distinct, accessible colors per toast type (reusing the app's own
          // success/destructive/warning/info design tokens for consistency
          // with StatusBadge/StatCard elsewhere) instead of sonner's default
          // near-identical neutral styling for every toast.
          success: "group-[.toaster]:!bg-success/10 group-[.toaster]:!border-success/40 group-[.toaster]:!text-success [&_svg]:!text-success",
          error: "group-[.toaster]:!bg-destructive/10 group-[.toaster]:!border-destructive/40 group-[.toaster]:!text-destructive [&_svg]:!text-destructive",
          warning: "group-[.toaster]:!bg-warning/10 group-[.toaster]:!border-warning/40 group-[.toaster]:!text-warning [&_svg]:!text-warning",
          info: "group-[.toaster]:!bg-info/10 group-[.toaster]:!border-info/40 group-[.toaster]:!text-info [&_svg]:!text-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
