import React, { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Search } from "lucide-react"

interface FormulaBuilderProps {
    columns: string[]
    expression: string
    onExpressionChange: (expr: string) => void
    newColumnName: string
    onNewColumnNameChange: (name: string) => void
}

export function FormulaBuilder({ columns, expression, onExpressionChange, newColumnName, onNewColumnNameChange }: FormulaBuilderProps) {
    const [colFilter, setColFilter] = useState("")
    const textAreaRef = useRef<HTMLTextAreaElement>(null)

    const insertText = (text: string) => {
        if (!textAreaRef.current) return
        const start = textAreaRef.current.selectionStart
        const end = textAreaRef.current.selectionEnd
        const current = expression
        const newVal = current.substring(0, start) + text + current.substring(end)
        onExpressionChange(newVal)

        // Restore focus and cursor? Difficult in React controlled input effectively without layout effect
        // We settle for updating value.
    }

    const handleDragStart = (e: React.DragEvent, col: string) => {
        // Enclose in ticks if it contains spaces, or always for safety in pandas eval
        // Actually Pandas eval syntax uses backticks `Name with Space` or just Name
        // Let's safe-guard by checking spaces or just always using backticks?
        // simple names don't need backticks but backticks don't hurt.
        // Let's use backticks if space logic check?
        // Actually, Python pandas eval:
        // "One" + "Two" -> columns
        // Backticks are best for robustness.
        const token = `\`${col}\``
        e.dataTransfer.setData("text/plain", token)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        const text = e.dataTransfer.getData("text/plain")
        if (text) {
            // Insert at drop position?
            // Input/Textarea drop usually handles insertion natively if we don't preventDefault.
            // But we want to ensure custom token format if dragged from our list.
            // If native DnD works, great. Let's try native first, but our chip sets "text/plain".
            // If we use preventDefault, we must manually insert.

            // To insert at specific mouse position in textarea is hard. 
            // Standard approach: allow browser to handle text drop. 
            // So we DO NOT preventDefault on Drop if we want native behavior.
            // BUT we want to Append or Insert?
            // Let's try manual insertion to be safe and controlled.
            insertText(text)
        }
    }

    return (
        <div className="grid grid-cols-3 gap-6 h-[400px]">
            {/* Left: Column List (Draggable) */}
            <div className="col-span-1 border rounded-md flex flex-col bg-slate-50 overflow-hidden h-full">
                <div className="p-3 border-b bg-white rounded-t-md">
                    <Label className="mb-2 block">Available Columns</Label>
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search..."
                            className="pl-8 h-9"
                            value={colFilter}
                            onChange={e => setColFilter(e.target.value)}
                        />
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Drag columns to the formula editor.</p>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {columns.filter(c => c.toLowerCase().includes(colFilter.toLowerCase())).map(c => (
                        <div
                            key={c}
                            className="bg-white border p-2 rounded text-sm cursor-grab hover:bg-purple-50 hover:border-purple-200 active:cursor-grabbing shadow-sm transition-colors flex items-center gap-2"
                            draggable
                            onDragStart={(e) => handleDragStart(e, c)}
                        >
                            <div className="h-2 w-2 rounded-full bg-slate-300" />
                            <span className="truncate" title={c}>{c}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: Workspace */}
            <div className="col-span-2 flex flex-col space-y-4">
                <div className="space-y-2">
                    <Label>New Feature Name</Label>
                    <Input
                        placeholder="e.g. revenue_per_user"
                        value={newColumnName}
                        onChange={e => onNewColumnNameChange(e.target.value)}
                    />
                </div>

                <div className="flex-1 flex flex-col">
                    <Label className="mb-2">Formula Expression</Label>
                    <div className="flex gap-2 mb-2">
                        {/* Quick Operators */}
                        {[
                            { label: "+", val: " + " },
                            { label: "-", val: " - " },
                            { label: "*", val: " * " },
                            { label: "/", val: " / " },
                            { label: "(", val: "(" },
                            { label: ")", val: ")" },
                        ].map(op => (
                            <Button key={op.label} variant="outline" size="sm" className="min-w-[32px]" onClick={() => insertText(op.val)}>{op.label}</Button>
                        ))}
                    </div>

                    {/* Visual Preview */}
                    <div className="min-h-[40px] p-2 border rounded-md bg-slate-50 flex flex-wrap gap-1 items-center mb-2 font-mono text-sm overflow-hidden">
                        {expression ? (
                            expression.split(/(\s+|[+\-*/()])/g).map((token, i) => {
                                const cleanToken = token.replace(/`/g, "").trim();
                                if (!cleanToken) return <span key={i}>{token}</span>; // whitespace
                                const isCol = columns.includes(cleanToken) || columns.includes(token.trim());
                                if (isCol) {
                                    return (
                                        <div key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-semibold select-none flex items-center">
                                            {cleanToken}
                                        </div>
                                    )
                                }
                                return <span key={i} className={token.match(/[+\-*/()]/) ? "font-bold text-slate-600" : ""}>{token}</span>
                            })
                        ) : (
                            <span className="text-slate-400 italic text-xs">Visual preview will appear here...</span>
                        )}
                    </div>

                    <textarea
                        ref={textAreaRef}
                        className="flex-1 w-full p-4 font-mono text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-medium"
                        placeholder="Drag columns here or type formula... (e.g. `Col A` / `Col B`)"
                        value={expression}
                        onChange={e => onExpressionChange(e.target.value)}
                        onDrop={handleDrop}
                        onDragOver={e => e.preventDefault()} // Allow drop
                    />
                    <p className="text-xs text-slate-500 mt-2">
                        Supported: Arithmetic (+, -, *, /), logical (&gt;, &lt;, ==), and numpy functions (log, exp).
                        Column names with spaces must be wrapped in backticks (automatically handled on drag).
                    </p>
                </div>
            </div>
        </div>
    )
}
