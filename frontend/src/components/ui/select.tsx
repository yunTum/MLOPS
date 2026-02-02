"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const SelectContext = React.createContext<{
    value: string;
    onValueChange: (value: string) => void;
    open: boolean;
    setOpen: (open: boolean) => void;
    placeholder?: string;
} | null>(null)

const Select = ({ children, onValueChange, value: controlledValue, defaultValue }: any) => {
    const [open, setOpen] = React.useState(false)
    const [internalValue, setInternalValue] = React.useState(defaultValue || "")

    // Controlled vs Uncontrolled logic
    const value = controlledValue !== undefined ? controlledValue : internalValue

    const handleValueChange = (newValue: string) => {
        setInternalValue(newValue)
        if (onValueChange) onValueChange(newValue)
        setOpen(false)
    }

    return (
        <SelectContext.Provider value={{ value, onValueChange: handleValueChange, open, setOpen }}>
            <div className="relative w-full">
                {children}
            </div>
            {/* Overlay to close on click outside */}
            {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
        </SelectContext.Provider>
    )
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ className, children, ...props }, ref) => {
        const context = React.useContext(SelectContext)
        if (!context) throw new Error("SelectTrigger must be used within Select")

        return (
            <button
                ref={ref}
                type="button"
                onClick={() => context.setOpen(!context.open)}
                className={cn(
                    "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    className
                )}
                {...props}
            >
                {children}
                <ChevronDown className="h-4 w-4 opacity-50" />
            </button>
        )
    }
)
SelectTrigger.displayName = "SelectTrigger"

interface SelectValueProps extends React.HTMLAttributes<HTMLSpanElement> {
    placeholder?: string;
}

const SelectValue = React.forwardRef<HTMLSpanElement, SelectValueProps>(
    ({ className, placeholder, children, ...props }, ref) => {
        const context = React.useContext(SelectContext)
        if (!context) throw new Error("SelectValue must be used within Select")

        return (
            <span
                ref={ref}
                className={cn("block truncate", className)}
                {...props}
            >
                {children ? children : (context.value || placeholder || context.placeholder || "Select...")}
            </span>
        )
    }
)
SelectValue.displayName = "SelectValue"

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
    position?: "popper" | "item-aligned";
}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
    ({ className, children, position = "popper", ...props }, ref) => {
        const context = React.useContext(SelectContext)
        if (!context) throw new Error("SelectContent must be used within Select")

        if (!context.open) return null

        return (
            <div
                ref={ref}
                className={cn(
                    "absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 top-[38px] min-w-full w-auto max-w-[90vw] bg-white",
                    className
                )}
                {...props}
            >
                <div className="p-1 w-full relative">
                    {children}
                </div>
            </div>
        )
    }
)
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { value: string }>(
    ({ className, children, value, ...props }, ref) => {
        const context = React.useContext(SelectContext)
        if (!context) throw new Error("SelectItem must be used within Select")

        return (
            <div
                ref={ref}
                className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-slate-100 cursor-pointer",
                    context.value === value && "bg-slate-100 font-semibold",
                    className
                )}
                onClick={(e) => {
                    e.stopPropagation()
                    context.onValueChange(value)
                }}
                {...props}
            >
                <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                    {/* Checkmark could go here */}
                </span>
                <span className="whitespace-nowrap">{children}</span>
            </div>
        )
    }
)
SelectItem.displayName = "SelectItem"

export { Select, SelectTrigger, SelectContent, SelectItem, SelectValue }
