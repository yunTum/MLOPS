"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Database, Wand2, FlaskConical, Zap, BrainCircuit, Play, BookOpen } from "lucide-react"

const sidebarItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Datasets", href: "/datasets", icon: Database },
    { name: "Features", href: "/features", icon: Wand2 },
    { name: 'Model Registry', href: '/models', icon: BrainCircuit },
    { name: 'Inference', href: '/inference', icon: Play },
    { name: 'Documentation', href: '/docs', icon: BookOpen },
]

export function Sidebar() {
    const pathname = usePathname()

    return (
        <div className="flex h-screen w-64 flex-col border-r bg-slate-900 text-white">
            <div className="p-6">
                <h1 className="text-2xl font-bold tracking-tight text-blue-400">MLOps Platform</h1>
            </div>
            <nav className="flex-1 space-y-1 px-3">
                {sidebarItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-800",
                            pathname === item.href ? "bg-slate-800 text-blue-400" : "text-slate-400"
                        )}
                    >
                        <item.icon className="h-4 w-4" />
                        {item.name}
                    </Link>
                ))}
            </nav>
            <div className="p-4 border-t border-slate-800">
                <p className="text-xs text-slate-500">v0.1.0 (Next.js)</p>
            </div>
        </div>
    )
}
