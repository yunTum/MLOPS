import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
    activeTab: string
    setActiveTab: (value: string) => void
} | null>(null)

export function Tabs({ defaultValue, children, className, ...props }: any) {
    const [activeTab, setActiveTab] = React.useState(defaultValue)
    return (
        <TabsContext.Provider value={{ activeTab, setActiveTab }}>
            <div className={cn("", className)} {...props}>
                {children}
            </div>
        </TabsContext.Provider>
    )
}

export function TabsList({ className, children, ...props }: any) {
    return (
        <div className={cn("inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500", className)} {...props}>
            {children}
        </div>
    )
}

export function TabsTrigger({ value, className, children, ...props }: any) {
    const context = React.useContext(TabsContext)
    if (!context) throw new Error("TabsTrigger used outside Tabs")

    const isActive = context.activeTab === value
    return (
        <button
            className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                isActive ? "bg-white text-slate-950 shadow-sm" : "hover:bg-slate-200 hover:text-slate-700",
                className
            )}
            onClick={() => context.setActiveTab(value)}
            {...props}
        >
            {children}
        </button>
    )
}

export function TabsContent({ value, className, children, ...props }: any) {
    const context = React.useContext(TabsContext)
    if (!context) throw new Error("TabsContent used outside Tabs")

    if (context.activeTab !== value) return null

    return (
        <div
            className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}
            {...props}
        >
            {children}
        </div>
    )
}
