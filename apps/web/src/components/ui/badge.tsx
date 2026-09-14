import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-5 tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15",
        outline: "border-border bg-card text-foreground",
        success: "border-transparent bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15",
        warning: "border-transparent bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
        info: "border-transparent bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/15",
        muted: "border-transparent bg-muted text-muted-foreground",
        brand: "border-transparent bg-primary/10 text-primary ring-1 ring-inset ring-primary/15",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
