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
          success: "group-[.toaster]:!bg-success group-[.toaster]:!border-success group-[.toaster]:!text-success-foreground [&_svg]:!text-success-foreground",
          error: "group-[.toaster]:!bg-destructive group-[.toaster]:!border-destructive group-[.toaster]:!text-destructive-foreground [&_svg]:!text-destructive-foreground",
          warning: "group-[.toaster]:!bg-warning group-[.toaster]:!border-warning group-[.toaster]:!text-warning-foreground [&_svg]:!text-warning-foreground",
          info: "group-[.toaster]:!bg-info group-[.toaster]:!border-info group-[.toaster]:!text-info-foreground [&_svg]:!text-info-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
