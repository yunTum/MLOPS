import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Since I didn't install class-variance-authority or radix slot yet, I should add them
// actually I'll stick to simple button for now to avoid dependency hell if possible?
// No, I want premium design. I need to install them.
// I will add them to the install list or just assume standard HTML button with tailwind for simplicity where possible.
// But user asked for "TypeScript" and "usability", so better components are good.
// I will implement a simpler version of the "shadcn-like" button without extra deps for now to reduce friction, unless I add them.
// I'll stick to standard tailwind classes for now to be safe.

const buttonVariants = (variant: string, size: string) => {
    let base = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"

    if (variant === "default") base += " bg-primary text-primary-foreground hover:bg-primary/90"
    if (variant === "destructive") base += " bg-destructive text-destructive-foreground hover:bg-destructive/90"
    if (variant === "outline") base += " border border-input bg-background hover:bg-accent hover:text-accent-foreground"
    if (variant === "secondary") base += " bg-secondary text-secondary-foreground hover:bg-secondary/80"
    if (variant === "ghost") base += " hover:bg-accent hover:text-accent-foreground"
    if (variant === "link") base += " text-primary underline-offset-4 hover:underline"

    if (size === "default") base += " h-10 px-4 py-2"
    if (size === "sm") base += " h-9 rounded-md px-3"
    if (size === "lg") base += " h-11 rounded-md px-8"
    if (size === "icon") base += " h-10 w-10"

    return base
}

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants(variant, size), className)}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
