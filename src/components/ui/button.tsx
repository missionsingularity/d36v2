import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonStyles = cva("inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50", {
  variants: {
    variant: { default: "bg-primary text-white hover:bg-[#4338CA]", outline: "border border-border bg-white hover:bg-slate-50", ghost: "hover:bg-slate-100", destructive: "bg-red-600 text-white hover:bg-red-700" },
    size: { default: "h-9", sm: "h-8 rounded px-2.5 text-xs", icon: "size-9 px-0" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => <button ref={ref} className={cn(buttonStyles({ variant, size }), className)} {...props} />);
Button.displayName = "Button";
