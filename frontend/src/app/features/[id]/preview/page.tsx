"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Loader2, Table, LayoutList, RefreshCw, Filter } from "lucide-react"

export default function FeaturePreviewPage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string

    const [featureSet, setFeatureSet] = useState<any>(null)
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [columns, setColumns] = useState<string[]>([]) // All available columns
    const [selectedColumns, setSelectedColumns] = useState<string[]>([]) // User selected columns
    const [limit, setLimit] = useState<string>("20")
    const [showColumnSelector, setShowColumnSelector] = useState(false)

    // Initial Fetch: Feature Set Metadata + Default Preview (to get cols)
    useEffect(() => {
        if (id) {
            fetchFeatureSet()
        }
    }, [id])

    // Fetch Data when params change (limit/cols)
    // We only trigger this manually or via specific effects to avoid double-fetch on init
    // Actually, let's fetch data separately.

    const fetchFeatureSet = async () => {
        try {
            const res = await api.get(`/features/sets/${id}`)
            setFeatureSet(res.data)
            // Initial data fetch (default limit 20, all cols so we learn available cols)
            // Pass active_features to set initial selection
            fetchPreview(20, [], res.data.active_features)
        } catch (e) {
            console.error("Failed to fetch feature set", e)
        }
    }

    const fetchPreview = async (currentLimit: number, currentCols: string[], defaultActiveFeatures?: string[]) => {
        setLoading(true)
        try {
            // Build Query Params
            const params = new URLSearchParams()
            params.append("limit", currentLimit.toString())
            if (currentCols.length > 0) {
                currentCols.forEach(c => params.append("columns", c))
            }

            const res = await api.get(`/features/sets/${id}/preview?${params.toString()}`)
            const rows = res.data.data
            setData(rows)

            // If it's the first load (columns empty), populate available columns
            // Use explicit columns from API if available (handles empty data case)
            if (columns.length === 0) {
                let keys: string[] = []
                if (res.data.columns && res.data.columns.length > 0) {
                    keys = res.data.columns
                } else if (rows.length > 0) {
                    // Fallback infer from data
                    keys = Object.keys(rows[0])
                }

                if (keys.length > 0) {
                    setColumns(keys)

                    // If defaultActiveFeatures provided, use it. Else use all keys (if no default was ever set)
                    // We check defaultActiveFeatures presence to decide.
                    if (defaultActiveFeatures && defaultActiveFeatures.length > 0) {
                        const valid = defaultActiveFeatures.filter(k => keys.includes(k))
                        setSelectedColumns(valid.length > 0 ? valid : keys)
                    } else if (currentCols.length === 0) {
                        // Fallback to all if not specified
                        setSelectedColumns(keys)
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load preview", e)
        } finally {
            setLoading(false)
        }
    }

    const handleApplyFilters = () => {
        // If we want to filter simply on client side (since we initially fetched ALL), we could just setState.
        // BUT user might want to change LIMIT or actually fetch subset to save bandwidth?
        // Current implementation re-fetches. Let's keep it.
        // It relies on API filtering.
        fetchPreview(parseInt(limit), selectedColumns.length === columns.length ? [] : selectedColumns)
    }

    // Toggle Column Selection
    const toggleColumn = (col: string) => {
        if (selectedColumns.includes(col)) {
            setSelectedColumns(selectedColumns.filter(c => c !== col))
        } else {
            setSelectedColumns([...selectedColumns, col])
        }
    }

    const toggleAllColumns = () => {
        if (selectedColumns.length === columns.length) {
            setSelectedColumns([])
        } else {
            setSelectedColumns(columns)
        }
    }

    if (!featureSet && !loading) return <div className="p-8 text-center text-slate-400">Loading...</div>

    // Determine columns to display in table
    // If selectedColumns is empty, we show NOTHING or EVERYTHING?
    // UX: If user manually deselects all, they see nothing.
    // If initial load, selectedColumns is set.
    const displayCols = columns.filter(c => selectedColumns.includes(c))

    return (
        <div className="container mx-auto py-6 space-y-6 h-screen flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        feature_set: {featureSet?.name || `Feature Set #${id}`} {featureSet?.version && <span className="text-slate-500 font-normal">({featureSet.version})</span>}
                    </h1>
                    <p className="text-sm text-slate-500">
                        {featureSet?.dataset_version_id ? `Dataset Version: ${featureSet.dataset_version_id}` : ''} • Path: {featureSet?.path}
                    </p>
                </div>
            </div>

            {/* Controls */}
            <Card className="border-slate-200 shadow-sm shrink-0">
                <CardHeader className="py-3 px-4 bg-slate-50 border-b">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            {/* Limit Selector */}
                            <div className="flex items-center gap-2">
                                <Label htmlFor="limit" className="text-xs font-semibold text-slate-600">Rows:</Label>
                                <Select value={limit} onValueChange={(v: string) => {
                                    setLimit(v)
                                    // Auto-apply limit change
                                    // Check if we have specific col selection
                                    const colsToSend = selectedColumns.length === columns.length ? [] : selectedColumns
                                    fetchPreview(parseInt(v), colsToSend)
                                }}>
                                    <SelectTrigger className="w-[80px] h-8 text-xs">
                                        <SelectValue placeholder="20" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="20">20</SelectItem>
                                        <SelectItem value="50">50</SelectItem>
                                        <SelectItem value="100">100</SelectItem>
                                        <SelectItem value="500">500</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Column Toggle */}
                            <Button
                                variant={showColumnSelector ? "secondary" : "outline"}
                                size="sm"
                                className="h-8 text-xs gap-2"
                                onClick={() => setShowColumnSelector(!showColumnSelector)}
                            >
                                <LayoutList className="h-3 w-3" />
                                {selectedColumns.length === columns.length ? "All Columns" : `${selectedColumns.length} Columns`}
                            </Button>

                            {/* Active Filters Display */}
                            {(() => {
                                const filters = featureSet?.transformations?.filter((t: any) => t.op === "filter") || []
                                if (filters.length === 0) return null
                                return (
                                    <div className="flex items-center gap-2 bg-orange-50 text-orange-700 px-2 py-1 rounded border border-orange-100 text-xs">
                                        <Filter className="h-3 w-3" />
                                        <span className="font-semibold">Filters Applied:</span>
                                        {filters.map((f: any, i: number) => (
                                            <span key={i} className="flex gap-1">
                                                {(f.args?.conditions || []).map((c: any, j: number) => (
                                                    <span key={j} className="bg-white border border-orange-200 px-1 rounded font-mono">
                                                        {c.col} {c.op === 'eq' ? '==' : c.op} {String(c.val)}
                                                    </span>
                                                ))}
                                            </span>
                                        ))}
                                    </div>
                                )
                            })()}
                        </div>

                        <div className="flex items-center gap-2">
                            <Button size="sm" className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={handleApplyFilters}>
                                <RefreshCw className={`h-3 w-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
                                Reload Data
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                {/* Column Selector Panel */}
                {showColumnSelector && (
                    <div className="p-4 border-b bg-slate-50/50 max-h-[200px] overflow-y-auto">
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-xs font-semibold text-slate-500">Select Columns to Display</Label>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-blue-600" onClick={toggleAllColumns}>
                                {selectedColumns.length === columns.length ? "Deselect All" : "Select All"}
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                            {columns.map(col => (
                                <div key={col} className="flex items-center space-x-2 bg-white p-1.5 rounded border">
                                    <Checkbox
                                        id={`col-${col}`}
                                        checked={selectedColumns.includes(col)}
                                        onChange={() => toggleColumn(col)}
                                    />
                                    <Label htmlFor={`col-${col}`} className="text-[11px] truncate cursor-pointer select-none" title={col}>
                                        {col}
                                    </Label>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {/* Data Table */}
            <div className="flex-1 border rounded-md overflow-hidden bg-white relative">
                {loading && (
                    <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center backdrop-blur-[1px]">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                            <span className="text-xs text-purple-600 font-semibold">Loading data...</span>
                        </div>
                    </div>
                )}

                <div className="h-full overflow-auto">
                    {data.length > 0 ? (
                        <table className="w-full text-xs text-left whitespace-nowrap">
                            <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-0">
                                <tr>
                                    {displayCols.map(k => (
                                        <th key={k} className="p-2 border-b bg-slate-100 border-r last:border-r-0 min-w-[100px]">
                                            {k}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {data.map((row: any, i: number) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                        {displayCols.map((k: string, j: number) => (
                                            <td key={j} className="p-2 border-r last:border-r-0 font-mono text-slate-600">
                                                {row[k] === null ? <span className="text-slate-300">null</span> : String(row[k]).substring(0, 100)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        !loading && <div className="p-12 text-center text-slate-400 italic">No data to display.</div>
                    )}
                </div>
            </div>

            <div className="text-xs text-center text-slate-400 shrink-0">
                Showing {data.length} rows • {selectedColumns.length} columns selected
            </div>
        </div>
    )
}
