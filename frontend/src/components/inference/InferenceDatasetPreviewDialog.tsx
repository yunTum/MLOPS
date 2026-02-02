import { useEffect, useState } from "react"
import api from "@/lib/api"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Columns } from "lucide-react"

interface InferenceDatasetPreviewDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    dataset: any | null
}

export function InferenceDatasetPreviewDialog({ open, onOpenChange, dataset }: InferenceDatasetPreviewDialogProps) {
    const [data, setData] = useState<any[]>([])
    const [metadata, setMetadata] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [showAllRows, setShowAllRows] = useState(false)
    const [availableColumns, setAvailableColumns] = useState<string[]>([])
    const [selectedColumns, setSelectedColumns] = useState<string[]>([])
    const [showCreatedOnly, setShowCreatedOnly] = useState(false)
    const [colDialogOpen, setColDialogOpen] = useState(false)

    useEffect(() => {
        if (open && dataset) {
            // Reset to defaults on open
            setShowAllRows(false)
            setShowCreatedOnly(false)
            setSelectedColumns([])
            fetchPreview(false, [])
        } else {
            setData([])
            setMetadata(null)
            setAvailableColumns([])
        }
    }, [open, dataset])

    const handleToggleShowAll = (val: boolean) => {
        setShowAllRows(val)
        fetchPreview(val, selectedColumns)
    }

    const handleToggleCreatedOnly = (val: boolean) => {
        setShowCreatedOnly(val)
        if (val) {
            const created = metadata?.created_features || []
            if (created.length > 0) {
                setSelectedColumns(created)
                fetchPreview(showAllRows, created)
            } else {
                alert("No created features found in metadata.")
                // Revert toggle if we want, or just leave it checked but empty? 
                // Better to revert visually or strict check.
                setShowCreatedOnly(false)
            }
        } else {
            // If turning off created only, do we show ALL?
            // Usually yes.
            setSelectedColumns(availableColumns)
            fetchPreview(showAllRows, [])
        }
    }

    const handleColumnChange = (col: string, checked: boolean) => {
        let newCols = []
        if (checked) {
            newCols = [...selectedColumns, col]
        } else {
            newCols = selectedColumns.filter(c => c !== col)
        }
        setSelectedColumns(newCols)
        // If manually changing, we might want to uncheck "Created Only" if it was active?
        if (showCreatedOnly) setShowCreatedOnly(false)

        // Fetch
        fetchPreview(showAllRows, newCols.length === availableColumns.length ? [] : newCols)
    }

    const fetchPreview = async (allRows: boolean, cols: string[]) => {
        if (!dataset) return
        setLoading(true)
        try {
            const limit = allRows ? -1 : 20
            const uniqueCols = Array.from(new Set(cols))

            const params = new URLSearchParams()
            params.append("limit", limit.toString())
            if (uniqueCols.length > 0) {
                params.append("columns", uniqueCols.join(","))
            }

            const res = await api.get(`/inference/datasets/${dataset.id}/preview?${params.toString()}`)

            setData(res.data.data)
            setMetadata(res.data)

            if (availableColumns.length === 0 && res.data.all_columns) {
                setAvailableColumns(res.data.all_columns)
                if (cols.length === 0) {
                    setSelectedColumns(res.data.all_columns)
                }
            } else if (availableColumns.length === 0 && res.data.columns) {
                setAvailableColumns(res.data.columns)
                if (cols.length === 0) setSelectedColumns(res.data.columns)
            }

        } catch (e) {
            console.error("Failed to load preview", e)
        } finally {
            setLoading(false)
        }
    }

    if (!dataset) return null

    const createdSet = new Set(metadata?.created_features || [])
    const sortedAvailable = [...availableColumns].sort((a, b) => {
        const aCreated = createdSet.has(a)
        const bCreated = createdSet.has(b)
        if (aCreated === bCreated) return a.localeCompare(b)
        return aCreated ? -1 : 1 // Created Features Last? Or First?
        // User asked for "Compare / Created Only". Usually new features are interesting.
        // Let's put Created features FIRST for visibility in the list?
        // Or keep alphabetical?
        // Let's keep alphabetical within groups: Raw then Created? 
        // Or Created then Raw?
        // Let's do Created FIRST.
    })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2 border-b shrink-0 bg-white">
                    <DialogTitle>Dataset: {dataset.name}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50">
                    {/* Toolbar */}
                    <div className="flex items-center gap-4 p-4 border-b bg-white shrink-0 flex-wrap z-10">
                        <div className="flex items-center gap-2 text-sm text-slate-600 border-r pr-4">
                            <span className="font-semibold">ID:</span> {dataset.id}
                            <span className="h-4 w-px bg-slate-300 mx-2"></span>
                            <span className="font-semibold">Rows:</span> {data.length}{showAllRows ? " (All)" : " (Preview)"}
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="show-all"
                                checked={showAllRows}
                                onChange={(e) => handleToggleShowAll(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="show-all" className="text-sm font-medium text-gray-700 cursor-pointer">Show All Rows</label>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                            <input
                                type="checkbox"
                                id="show-created-only"
                                checked={showCreatedOnly}
                                onChange={(e) => handleToggleCreatedOnly(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                            <label htmlFor="show-created-only" className="text-sm font-medium text-purple-700 cursor-pointer flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-purple-500 inline-block"></span>
                                Created Features Only
                            </label>
                        </div>

                        <div className="flex-1"></div>

                        <Button
                            variant="outline"
                            onClick={() => setColDialogOpen(true)}
                            className="flex items-center gap-2"
                            size="sm"
                        >
                            <Columns className="h-4 w-4 text-slate-500" />
                            Customize Columns ({selectedColumns.length})
                        </Button>
                    </div>

                    {/* Table Container */}
                    <div className="flex-1 overflow-auto bg-white relative w-full">
                        {loading && (
                            <div className="absolute inset-0 bg-white/50 z-10 flex justify-center items-center backdrop-blur-sm">
                                <Loader2 className="animate-spin text-blue-600 h-8 w-8" />
                            </div>
                        )}
                        <div className="min-w-full inline-block align-middle">
                            {data.length > 0 ? (
                                <table className="min-w-full text-xs text-left whitespace-nowrap border-collapse">
                                    <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            {Object.keys(data[0]).map(k => (
                                                <th key={k} className={`p-2 border-b border-r last:border-r-0 bg-slate-100 ${createdSet.has(k) ? "text-purple-700 bg-purple-50" : ""}`}>
                                                    {k}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.map((row: any, i: number) => (
                                            <tr key={i} className="hover:bg-blue-50 border-b last:border-0 transition-colors">
                                                {Object.values(row).map((val: any, j: number) => (
                                                    <td key={j} className="p-2 font-mono border-r last:border-r-0 border-slate-100 text-slate-600">
                                                        {val === null ?
                                                            <span className="text-gray-300 italic">null</span> :
                                                            String(val).substring(0, 100)
                                                        }
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-12 text-center text-slate-400">
                                    {!loading && "No data available."}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Column Selection Dialog (Nested) */}
                <Dialog open={colDialogOpen} onOpenChange={setColDialogOpen}>
                    <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle>Customize Columns</DialogTitle>
                        </DialogHeader>
                        <div className="flex justify-between items-center py-2 border-b">
                            <div className="space-x-2">
                                <button className="text-xs text-blue-600 hover:underline" onClick={() => {
                                    setSelectedColumns(availableColumns)
                                    fetchPreview(showAllRows, [])
                                }}>Select All</button>
                                <button className="text-xs text-slate-500 hover:underline" onClick={() => {
                                    setSelectedColumns([])
                                }}>Deselect All</button>
                            </div>
                            <div className="text-xs text-slate-500">{selectedColumns.length} selected</div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-1 grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                            {sortedAvailable.map(col => (
                                <div key={col} className={`flex items-start gap-2 p-2 rounded text-sm hover:bg-slate-50 border ${selectedColumns.includes(col) ? "border-blue-200 bg-blue-50" : "border-transparent"}`}>
                                    <Checkbox
                                        id={`dlg-col-${col}`}
                                        checked={selectedColumns.includes(col)}
                                        onCheckedChange={(checked) => handleColumnChange(col, checked as boolean)}
                                        className="mt-0.5"
                                    />
                                    <label htmlFor={`dlg-col-${col}`} className="cursor-pointer break-all leading-tight">
                                        {col}
                                        {createdSet.has(col) && <span className="ml-1 text-[10px] text-purple-600 bg-purple-100 px-1 rounded">New</span>}
                                    </label>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end pt-4 border-t mt-2">
                            <Button onClick={() => setColDialogOpen(false)}>Done</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    )
}
