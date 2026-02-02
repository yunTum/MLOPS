import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/input"
import { Select } from "@/components/ui/select-native"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, BarChart3, Save, CheckCircle2 } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts'
import api from "@/lib/api"

interface FeatureAnalysisDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    featureSet: any
}

export function FeatureAnalysisDialog({ open, onOpenChange, featureSet }: FeatureAnalysisDialogProps) {
    const [loading, setLoading] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const [targetCol, setTargetCol] = useState("")
    const [availableColumns, setAvailableColumns] = useState<string[]>([])

    // Column Selection for Analysis
    const [selectedCols, setSelectedCols] = useState<string[]>([])
    const [colFilter, setColFilter] = useState("")

    // Results
    const [results, setResults] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState("table")

    // Saving
    const [saving, setSaving] = useState(false)

    // Load available columns when dialog opens or feature set changes
    useEffect(() => {
        if (open && featureSet) {
            setResults([])
            setTargetCol(featureSet.target_column || "")
            setSelectedCols([])
            fetchColumns(featureSet.id)
            setActiveTab("table")
        }
    }, [open, featureSet])

    // Load Columns Preview
    const fetchColumns = async (fsId: number) => {
        setLoading(true)
        try {
            const res = await api.get(`/features/sets/${fsId}/preview?limit=1`)
            if (res.data.data && res.data.data.length > 0) {
                const cols = Object.keys(res.data.data[0])
                setAvailableColumns(cols)

                // Select logic: Active Features > Transformations > All
                let colsToSelect: string[] = []

                if (featureSet && featureSet.active_features && featureSet.active_features.length > 0) {
                    colsToSelect = featureSet.active_features.filter((c: string) => cols.includes(c))
                } else {
                    const createdCols: string[] = []
                    if (featureSet && featureSet.transformations) {
                        featureSet.transformations.forEach((t: any) => {
                            if (t.new_col) createdCols.push(t.new_col)
                            else if (t.args && t.args.new_col) createdCols.push(t.args.new_col)
                        })
                    }
                    const validCreated = createdCols.filter(c => cols.includes(c))
                    colsToSelect = validCreated.length > 0 ? validCreated : cols
                }

                if (featureSet.target_column) {
                    colsToSelect = colsToSelect.filter(c => c !== featureSet.target_column)
                }

                setSelectedCols(colsToSelect)
            }
        } catch (e) {
            console.error(e)
            alert("Failed to load columns")
        } finally {
            setLoading(false)
        }
    }

    const handleAnalyze = async () => {
        if (!targetCol) {
            alert("Please select a target column")
            return
        }
        if (selectedCols.length === 0) {
            alert("Please select at least one feature to analyze")
            return
        }

        setAnalyzing(true)
        try {
            const payload = {
                feature_set_id: featureSet.id,
                target_col: targetCol,
                features: selectedCols, // Backend expects 'features' list to filter
                task_type: "regression" // TODO: Detect from target type?
            }
            const res = await api.post('/features/analyze', payload)
            setResults(res.data)
            setActiveTab("charts") // Switch to charts on success
        } catch (e: any) {
            console.error(e)
            alert(e.response?.data?.detail || "Analysis Failed")
        } finally {
            setAnalyzing(false)
        }
    }

    const handleSaveFeatures = async () => {
        if (!featureSet) return
        if (selectedCols.length === 0) {
            alert("No features selected to save.")
            return
        }
        setSaving(true)
        try {
            // Update the feature set with the current selection as active_features
            // Also update target_column if changed
            await api.put(`/features/sets/${featureSet.id}`, {
                active_features: selectedCols,
                target_column: targetCol
            })
            alert("Feature Set updated with selected features!")
            window.location.reload()
        } catch (e) {
            console.error(e)
            alert("Failed to update feature set")
        } finally {
            setSaving(false)
        }
    }

    const toggleAll = (checked: boolean) => {
        if (checked) {
            const visible = getVisibleColumns()
            setSelectedCols(visible)
        }
        else setSelectedCols([])
    }

    const toggleCol = (col: string) => {
        setSelectedCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
    }

    const selectTopN = (metric: 'mutual_info' | 'pearson' | 'spearman', n: number) => {
        if (results.length === 0) return

        const sorted = [...results].sort((a, b) => Math.abs(b[metric] || 0) - Math.abs(a[metric] || 0))
        const topN = sorted.slice(0, n).map(r => r.feature)

        // Replace selection or merge? Replace is usually intended for "Select Top N"
        setSelectedCols(topN)
    }

    const getVisibleColumns = () => {
        let cols = availableColumns.filter(c => c !== targetCol)

        // Filter by active_features if they exist (User Request: Only show selected/active features)
        // [MODIFIED] Now we show ALL available columns to allow analyzing potential candidates even if not yet active.
        // We do NOT filter by active_features here anymore.
        // if (featureSet && featureSet.active_features && featureSet.active_features.length > 0) {
        //     cols = cols.filter(c => featureSet.active_features.includes(c))
        // }

        if (colFilter) {
            cols = cols.filter(c => c.toLowerCase().includes(colFilter.toLowerCase()))
        }
        return cols
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[95vh] h-[95vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Analyze Feature Relevance: {featureSet?.name || "Feature Set"}</DialogTitle>
                    <DialogDescription>
                        Analyze relationship between features and target, and save the best features.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden p-1">
                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
                    ) : (
                        <div className="flex flex-col md:flex-row gap-4 h-full">
                            {/* Left: Configuration & Selection */}
                            <div className="w-full md:w-1/3 flex flex-col gap-4 border-r pr-4 h-full">
                                <div className="space-y-2">
                                    <Label>Target Column (y)</Label>
                                    <Select value={targetCol} onChange={e => setTargetCol(e.target.value)} className="h-9">
                                        <option value="">Select Target...</option>
                                        {availableColumns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </Select>
                                </div>

                                <div className="flex-1 flex flex-col bg-slate-50 p-3 rounded border min-h-0">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-semibold">Candidates (X)</span>
                                        <div className="space-x-1">
                                            <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => toggleAll(true)}>All</Button>
                                            <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => toggleAll(false)}>None</Button>
                                        </div>
                                    </div>
                                    <Input
                                        placeholder="Filter..."
                                        className="h-7 text-xs mb-2 bg-white"
                                        value={colFilter}
                                        onChange={e => setColFilter(e.target.value)}
                                    />
                                    <div className="flex-1 overflow-y-auto bg-white border rounded p-2 space-y-1">
                                        {getVisibleColumns().map(col => (
                                            <label key={col} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    className="h-3 w-3 rounded border-slate-300"
                                                    checked={selectedCols.includes(col)}
                                                    onChange={() => toggleCol(col)}
                                                />
                                                <span className="truncate" title={col}>{col}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex justify-between items-center text-xs text-slate-500">
                                        <span>{selectedCols.length} selected</span>
                                        {results.length > 0 && (
                                            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={handleSaveFeatures} disabled={saving}>
                                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                                                Save Selection
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                <Button onClick={handleAnalyze} disabled={analyzing || !targetCol || selectedCols.length === 0} className="w-full bg-blue-600">
                                    {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}
                                    Run Analysis
                                </Button>
                            </div>

                            {/* Right: Results Dashboard */}
                            <div className="w-full md:w-2/3 flex flex-col h-full overflow-hidden">
                                {results.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm border rounded bg-slate-50">
                                        Select features and run analysis to see results.
                                    </div>
                                ) : (
                                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                                        <div className="flex justify-between items-center mb-2">
                                            <TabsList>
                                                <TabsTrigger value="charts">Charts</TabsTrigger>
                                                <TabsTrigger value="table">Table</TabsTrigger>
                                            </TabsList>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => selectTopN('mutual_info', 10)}>Select Top 10 (MI)</Button>
                                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => selectTopN('pearson', 10)}>Select Top 10 (Pearson)</Button>
                                            </div>
                                        </div>

                                        <TabsContent value="charts" className="flex-1 min-h-0 flex flex-col">
                                            <div className="grid grid-cols-1 gap-4 h-full overflow-y-auto">
                                                <div className="border rounded p-4 h-[300px]">
                                                    <h4 className="text-sm font-semibold mb-2">Mutual Information (Top 15)</h4>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart
                                                            data={[...results].sort((a, b) => (b.mutual_info || 0) - (a.mutual_info || 0)).slice(0, 15)}
                                                            layout="vertical"
                                                            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                                                        >
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis type="number" />
                                                            <YAxis type="category" dataKey="feature" width={100} tick={{ fontSize: 10 }} />
                                                            <RechartsTooltip />
                                                            <Bar dataKey="mutual_info" fill="#8884d8" name="Mutual Info" />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                <div className="border rounded p-4 h-[300px]">
                                                    <h4 className="text-sm font-semibold mb-2">Pearson Correlation (Top 15)</h4>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <BarChart
                                                            data={[...results].sort((a, b) => Math.abs(b.pearson || 0) - Math.abs(a.pearson || 0)).slice(0, 15)}
                                                            layout="vertical"
                                                            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                                                        >
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis type="number" domain={[-1, 1]} />
                                                            <YAxis type="category" dataKey="feature" width={100} tick={{ fontSize: 10 }} />
                                                            <RechartsTooltip />
                                                            <Bar dataKey="pearson" fill="#82ca9d" name="Pearson" />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="table" className="flex-1 overflow-auto border rounded bg-white">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-100 font-medium sticky top-0 z-10">
                                                    <tr>
                                                        <th className="p-3 border-b w-8">Sel</th>
                                                        <th className="p-3 border-b">Feature</th>
                                                        <th className="p-3 border-b">Mutual Info</th>
                                                        <th className="p-3 border-b">Pearson</th>
                                                        <th className="p-3 border-b">Spearman</th>
                                                        <th className="p-3 border-b">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y text-slate-700">
                                                    {results.sort((a, b) => (b.mutual_info || 0) - (a.mutual_info || 0)).map((r: any, i) => (
                                                        <tr key={i} className="hover:bg-slate-50">
                                                            <td className="p-3">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedCols.includes(r.feature)}
                                                                    onChange={() => toggleCol(r.feature)}
                                                                />
                                                            </td>
                                                            <td className="p-3 font-medium">{r.feature}</td>
                                                            <td className="p-3 font-mono">{r.mutual_info?.toFixed(4) ?? "-"}</td>
                                                            <td className="p-3 font-mono">{r.pearson?.toFixed(4) ?? "-"}</td>
                                                            <td className="p-3 font-mono">{r.spearman?.toFixed(4) ?? "-"}</td>
                                                            <td className="p-3">
                                                                {r.is_leak ? <span className="text-red-600 font-bold text-xs">LEAK</span> : "-"}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </TabsContent>
                                    </Tabs>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
