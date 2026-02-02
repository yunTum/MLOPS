import { useEffect, useState, useRef } from "react"
import api from "@/lib/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/input"
import { Select } from "@/components/ui/select-native"
import { Plus, Loader2, Trash2, Wand2, ArrowRight, ArrowLeft, ChevronsRight, ChevronsLeft } from "lucide-react"
import { FormulaBuilder } from "./FormulaBuilder"

interface FeatureWorkflowDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    editFeatureSet: any | null
    onSuccess: () => void
}

export function FeatureWorkflowDialog({ open, onOpenChange, editFeatureSet, onSuccess }: FeatureWorkflowDialogProps) {
    const [activeTab, setActiveTab] = useState<"builder" | "auto" | "manage">("builder")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const featuresInitializedRef = useRef(false)

    // Common Inputs
    const [datasets, setDatasets] = useState<any[]>([])
    const [versions, setVersions] = useState<any[]>([])
    const [selectedDatasetId, setSelectedDatasetId] = useState("")
    const [selectedVersionId, setSelectedVersionId] = useState("")
    const [columns, setColumns] = useState<string[]>([])
    const [builderVersionTag, setBuilderVersionTag] = useState("")

    // Builder State
    const [pipelineSteps, setPipelineSteps] = useState<any[]>([])
    const [newOp, setNewOp] = useState<{ op: string, args: any }>({ op: "log", args: {} })
    const [selectedCols, setSelectedCols] = useState<string[]>([])
    const [colFilter, setColFilter] = useState("")

    // Auto State
    const [varianceThreshold, setVarianceThreshold] = useState("0.0")
    const [corrThreshold, setCorrThreshold] = useState("0.95")
    const [includeArithmetic, setIncludeArithmetic] = useState(false)
    const [autoSelectedCols, setAutoSelectedCols] = useState<string[]>([])
    const [autoTargetCol, setAutoTargetCol] = useState("")
    const [generationMethod, setGenerationMethod] = useState("arithmetic")
    const [autoColFilter, setAutoColFilter] = useState("")
    const [activeFeatureSelection, setActiveFeatureSelection] = useState<string[]>([])
    const [activeTargetCol, setActiveTargetCol] = useState("")

    // Transfer List Selection State
    const [leftSelection, setLeftSelection] = useState<string[]>([])
    const [rightSelection, setRightSelection] = useState<string[]>([])

    // Transfer List State for Builder
    const [builderLeftSelection, setBuilderLeftSelection] = useState<string[]>([])
    const [builderRightSelection, setBuilderRightSelection] = useState<string[]>([])

    // Transfer List State for Auto Generation
    const [autoLeftSelection, setAutoLeftSelection] = useState<string[]>([])
    const [autoRightSelection, setAutoRightSelection] = useState<string[]>([])

    // Local copy of feature set to track updates (prevent stale overwrite)
    const [currentFeatureSet, setCurrentFeatureSet] = useState<any>(null)


    // -- Effects --
    useEffect(() => {
        if (open) {
            featuresInitializedRef.current = false
            setCurrentFeatureSet(editFeatureSet) // Init from prop
            fetchDatasets()
            if (editFeatureSet) {
                // Edit Mode Initialization
                if (editFeatureSet.dataset_version && editFeatureSet.dataset_version.dataset_id) {
                    setSelectedDatasetId(editFeatureSet.dataset_version.dataset_id.toString())
                }
                setSelectedVersionId(editFeatureSet.dataset_version_id?.toString() || "")

                // Pipeline
                setPipelineSteps(groupTransformations(editFeatureSet.transformations || []))
                setBuilderVersionTag(editFeatureSet.version || "")

                // Initialize active features from prop
                // If the prop has active_features, use them.
                // If not, we wait for columns to load to potentially set to ALL (in the other effect).
                if (editFeatureSet.active_features) {
                    setActiveFeatureSelection(editFeatureSet.active_features)
                    featuresInitializedRef.current = true // Mark as initialized from DB
                } else {
                    setActiveFeatureSelection([])
                    // Keep ref false so column loader knows to set default
                }

                setActiveTargetCol(editFeatureSet.target_column || "")
            } else {
                // Create Mode Reset
                setPipelineSteps([])
                setNewOp({ op: "log", args: {} })
                setSelectedCols([])
                setBuilderVersionTag("")
                setSelectedDatasetId("")
                setSelectedVersionId("")
                setColumns([])
                setActiveFeatureSelection([])
                setActiveTargetCol("")
                featuresInitializedRef.current = false
                setCurrentFeatureSet(null)
            }
        }
    }, [open, editFeatureSet])


    // Load available datasets
    const fetchDatasets = async () => {
        try {
            const res = await api.get('/datasets/')
            setDatasets(res.data)
        } catch (e) { console.error(e) }
    }

    // Load versions when dataset changes
    useEffect(() => {
        if (selectedDatasetId) {
            api.get(`/datasets/${selectedDatasetId}/versions`)
                .then(res => setVersions(res.data))
                .catch(console.error)
        } else {
            setVersions([])
        }
    }, [selectedDatasetId])

    // Load columns when version or feature set changes
    const loadColumns = async () => {
        const targetFS = currentFeatureSet || editFeatureSet
        if (targetFS) {
            // Fetch from Feature Set Preview to get up-to-date columns
            api.get(`/features/sets/${targetFS.id}/preview?limit=1&t=${Date.now()}`)
                .then(res => {
                    console.log("Loaded columns:", Object.keys(res.data.data[0]))
                    if (res.data.data && res.data.data.length > 0) {
                        const cols = Object.keys(res.data.data[0])
                        setColumns(cols)

                        // Default to ALL active features if:
                        // 1. Not initialized yet (no active_features in DB)
                        // 2. We have columns
                        if (!featuresInitializedRef.current) {
                            setActiveFeatureSelection(cols)
                            featuresInitializedRef.current = true
                        }
                    }
                })
                .catch(console.error)
        } else if (selectedVersionId) {
            const v = versions.find((v: any) => v.id.toString() === selectedVersionId)
            if (v && v.schema_info) {
                try { setColumns(Object.keys(v.schema_info || {})) } catch (e) { setColumns([]) }
            }
        }
    }

    useEffect(() => {
        if (open) {
            loadColumns()
        }
    }, [selectedVersionId, versions, open, editFeatureSet, currentFeatureSet])

    // --- Actions ---
    const handleArgChange = (key: string, value: any) => {
        setNewOp({ ...newOp, args: { ...newOp.args, [key]: value } })
    }

    const addStep = () => {
        if (selectedCols.length === 0) return

        if (newOp.op === "lag") {
            const maxLag = parseInt(newOp.args.max_lag || "1")
            const newSteps = []
            for (let i = 1; i <= maxLag; i++) {
                newSteps.push({
                    id: Math.random().toString(36).substr(2, 9),
                    op: "lag",
                    cols: [...selectedCols],
                    args: {
                        group_col: newOp.args.group_col,
                        sort_col: newOp.args.sort_col,
                        periods: i
                    }
                })
            }
            setPipelineSteps([...pipelineSteps, ...newSteps])
        } else if (newOp.op === "groupby_agg") {
            // Handle Multi-Column Grouping
            // Merge primary ID + filters into a single list for backend
            let finalGroupCol: string | string[] = newOp.args.group_col
            if (newOp.args.group_filters && newOp.args.group_filters.length > 0) {
                finalGroupCol = [newOp.args.group_col, ...newOp.args.group_filters]
            }

            setPipelineSteps([...pipelineSteps, {
                id: Math.random().toString(36).substr(2, 9),
                op: newOp.op,
                cols: [...selectedCols],
                args: { ...newOp.args, group_col: finalGroupCol, group_filters: undefined } // cleanup filters from saved args
            }])
        } else {
            setPipelineSteps([...pipelineSteps, {
                id: Math.random().toString(36).substr(2, 9),
                op: newOp.op,
                cols: [...selectedCols],
                args: { ...newOp.args }
            }])
        }
        setSelectedCols([])
    }

    const removeStep = (id: string) => {
        setPipelineSteps(pipelineSteps.filter(s => s.id !== id))
    }

    // --- Submitters ---
    // Transfer List Helpers
    const moveRight = () => {
        setActiveFeatureSelection([...activeFeatureSelection, ...leftSelection])
        setLeftSelection([])
    }

    const moveLeft = () => {
        setActiveFeatureSelection(activeFeatureSelection.filter(f => !rightSelection.includes(f)))
        setRightSelection([])
    }

    const moveAllRight = () => {
        // All available except target
        const allLeft = columns.filter(c => c !== activeTargetCol)
        setActiveFeatureSelection(allLeft)
        setLeftSelection([])
    }

    const moveAllLeft = () => {
        setActiveFeatureSelection([])
        setRightSelection([])
    }

    const toggleSelection = (item: string, listType: 'left' | 'right') => {
        if (listType === 'left') {
            setLeftSelection(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
        } else {
            setRightSelection(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
        }
    }

    // Builder Transfer Helpers
    const moveBuilderRight = () => {
        setSelectedCols([...selectedCols, ...builderLeftSelection])
        setBuilderLeftSelection([])
    }

    const moveBuilderLeft = () => {
        setSelectedCols(selectedCols.filter(c => !builderRightSelection.includes(c)))
        setBuilderRightSelection([])
    }

    const moveBuilderAllRight = () => {
        // Move all currently visible in left list
        const visibleLeft = columns.filter(c => !selectedCols.includes(c) && c.toLowerCase().includes(colFilter.toLowerCase()))
        setSelectedCols([...selectedCols, ...visibleLeft])
        setBuilderLeftSelection([])
    }

    const moveBuilderAllLeft = () => {
        setSelectedCols([])
        setBuilderRightSelection([])
    }

    const toggleBuilderSelection = (item: string, listType: 'left' | 'right') => {
        if (listType === 'left') {
            setBuilderLeftSelection(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
        } else {
            setBuilderRightSelection(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
        }
    }

    // Auto Gen Transfer Helpers
    const moveAutoRight = () => {
        setAutoSelectedCols([...autoSelectedCols, ...autoLeftSelection])
        setAutoLeftSelection([])
    }

    const moveAutoLeft = () => {
        setAutoSelectedCols(autoSelectedCols.filter(c => !autoRightSelection.includes(c)))
        setAutoRightSelection([])
    }

    const moveAutoAllRight = () => {
        // Move all currently visible in left list
        const visibleLeft = columns.filter(c => c !== autoTargetCol && !autoSelectedCols.includes(c) && c.toLowerCase().includes(autoColFilter.toLowerCase()))
        setAutoSelectedCols([...autoSelectedCols, ...visibleLeft])
        setAutoLeftSelection([])
    }

    const moveAutoAllLeft = () => {
        setAutoSelectedCols([])
        setAutoRightSelection([])
    }

    const toggleAutoSelection = (item: string, listType: 'left' | 'right') => {
        if (listType === 'left') {
            setAutoLeftSelection(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
        } else {
            setAutoRightSelection(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
        }
    }

    const handleBuilderSubmit = async () => {
        if (!selectedVersionId) return
        setIsSubmitting(true)
        const flatTransformations = pipelineSteps.flatMap(step =>
            step.cols.map((col: string) => ({
                op: step.op,
                col: col,
                ...step.args
            }))
        )
        try {
            if (currentFeatureSet) {
                await api.put(`/features/sets/${currentFeatureSet.id}`, {
                    name: currentFeatureSet.name,
                    dataset_version_id: parseInt(selectedVersionId),
                    version: builderVersionTag || undefined,
                    transformations: flatTransformations
                })
            } else {
                await api.post('/features/sets', {
                    dataset_version_id: parseInt(selectedVersionId),
                    version: builderVersionTag || undefined,
                    transformations: flatTransformations
                })
            }
            onSuccess()
            onOpenChange(false)
        } catch (e) { alert("Failed"); console.error(e) }
        finally { setIsSubmitting(false) }
    }

    const handleSaveActiveFeatures = async () => {
        if (!currentFeatureSet) return
        setIsSubmitting(true)
        try {
            // Serialize current pipelineSteps to transformations to Capture changes in Manage Tab (e.g. Filters)
            // If pipelineSteps is empty (e.g. newly opened manage tab without builder init), we should rely on currentFeatureSet,
            // BUT we initialize pipelineSteps from editFeatureSet on open.
            // Let's use the same logic as handleBuilderSubmit to get flat transformations.
            const flatTransformations = pipelineSteps.flatMap(step =>
                step.cols.map((col: string) => ({
                    op: step.op,
                    col: col,
                    ...step.args
                }))
            )

            await api.put(`/features/sets/${currentFeatureSet.id}`, {
                name: currentFeatureSet.name,
                dataset_version_id: currentFeatureSet.dataset_version_id,
                version: currentFeatureSet.version,
                transformations: flatTransformations, // Use the updated transformations from state
                active_features: activeFeatureSelection,
                target_column: activeTargetCol || null
            })
            onSuccess()
            onOpenChange(false) // Close dialog
            alert(`Saved ${activeFeatureSelection.length} active features.`)
        } catch (e) { alert("Failed to save active features"); console.error(e) }
        finally { setIsSubmitting(false) }
    }
    const handleAutoSubmit = async () => {
        if (!selectedVersionId) return
        setIsSubmitting(true)
        try {
            const res = await api.post('/features/auto-generate', {
                dataset_version_id: parseInt(selectedVersionId),
                feature_set_id: currentFeatureSet ? currentFeatureSet.id : undefined,
                variance_threshold: parseFloat(varianceThreshold),
                correlation_threshold: parseFloat(corrThreshold),
                include_arithmetic: includeArithmetic,
                source_columns: autoSelectedCols.length > 0 ? autoSelectedCols : undefined,
                target_column: autoTargetCol || undefined,
                generation_method: generationMethod
            })
            // Do not close, refresh columns and switch to manage tab
            // We call onSuccess to trigger parent refresh (background)
            onSuccess()

            // REFRESH FULL FEATURE SET metadata to get new transformations
            const newId = res.data.feature_set_id || (currentFeatureSet && currentFeatureSet.id)
            if (newId) {
                const updatedFs = await api.get(`/features/sets/${newId}`)
                setCurrentFeatureSet(updatedFs.data)
                console.log("Updated local feature set metadata", updatedFs.data)
            }

            // Short delay to ensure state is set before loading columns (though loadColumns uses currentFeatureSet variable if we pass it, but better to rely on state or pass explicitly)
            // Actually simplest is to await a bit or call loadColumns AFTER setCurrentFeatureSet update cycle.
            // But React state updates are async.
            // We can hackishly retry loadColumns or rely on the effect? 
            // The effect depends on 'currentFeatureSet', so setting it above will trigger loadColumns automatically!
            // But we also want to wait for it.

            // Wait for effect? No, let's just manually call loadColumns via effect trigger.
            // But we need to switch tabs.
            setActiveTab("manage")

            const totalCols = res.data.columns ? res.data.columns.length : "unknown"
            alert(`Features generated! Total Columns: ${totalCols}. \nSwitched to Manage Features tab to review.`)
            console.log("Generated columns:", res.data.columns)

        } catch (e: any) {
            console.error(e)
            alert("Failed: " + (e.response?.data?.detail || e.message))
        }
        finally { setIsSubmitting(false) }
    }








    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>{editFeatureSet ? `Edit Feature Set: ${editFeatureSet.version}` : "New Feature Set Workflow"}</DialogTitle>
                    <DialogDescription>
                        Create new features from your dataset versions.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4 flex-1 overflow-y-auto p-1">
                    {/* Common Inputs */}
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-md border">
                        <div className="space-y-2">
                            <Label>Source Dataset</Label>
                            <Select
                                value={selectedDatasetId}
                                onChange={e => setSelectedDatasetId(e.target.value)}
                                disabled={!!editFeatureSet && !!editFeatureSet.dataset_version_id}
                                className={(editFeatureSet && editFeatureSet.dataset_version_id) ? "bg-slate-100" : ""}
                            >
                                <option value="">Select dataset...</option>
                                {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Version</Label>
                            <Select
                                value={selectedVersionId}
                                onChange={e => setSelectedVersionId(e.target.value)}
                                disabled={!selectedDatasetId || (!!editFeatureSet && !!editFeatureSet.dataset_version_id)}
                                className={(editFeatureSet && editFeatureSet.dataset_version_id) ? "bg-slate-100" : ""}
                            >
                                <option value="">Select version...</option>
                                {versions.map(v => <option key={v.id} value={v.id}>{v.version}</option>)}
                            </Select>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-slate-200 mb-4">
                        <div className="flex space-x-4">
                            <button
                                onClick={() => setActiveTab("builder")}
                                className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === "builder" ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                            >Feature Builder</button>
                            <button
                                onClick={() => setActiveTab("auto")}
                                className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === "auto" ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                            >Auto Generation</button>
                            <button
                                onClick={() => setActiveTab("manage")}
                                className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === "manage" ? "border-purple-600 text-purple-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                            >Manage Features</button>
                        </div>
                    </div>

                    {/* Builder Tab */}
                    {activeTab === "builder" && (
                        <div className="space-y-6">
                            {/* Operation Config */}
                            {/* Operation Config */}
                            <div className="bg-slate-50 p-4 rounded-lg border space-y-4">
                                <h3 className="text-sm font-semibold text-slate-700">1. Configure Operation</h3>
                                <div className="space-y-2">
                                    <Label>Operation Type</Label>
                                    <Select value={newOp.op} onChange={e => setNewOp({ ...newOp, op: e.target.value })} className="h-9">
                                        <option value="lag">Lag</option>
                                        <option value="rolling">Rolling Window</option>
                                        <option value="diff">Difference (Diff)</option>
                                        <option value="groupby_agg">Group Aggregation (Group By)</option>
                                        <option value="scale_standard">Standard Scaler</option>
                                        <option value="scale_minmax">MinMax Scaler</option>
                                        <option value="onehot">One Hot Encoding</option>
                                        <option value="target_encode">Target Encoding</option>
                                        <option value="log">Log Transform (log1p)</option>
                                        <option value="fillna">Fill NA</option>
                                        <option value="clip">Clip (Outlier)</option>
                                        <option value="arithmetic">Arithmetic (+ - * /)</option>
                                        <option value="polynomial">Polynomial Features</option>
                                        <option value="custom_formula">Custom Formula</option>
                                    </Select>
                                </div>

                                {/* Custom Formula Builder Mode */}
                                {newOp.op === "custom_formula" ? (
                                    <div className="mt-4">
                                        <FormulaBuilder
                                            columns={columns}
                                            expression={newOp.args.expression || ""}
                                            onExpressionChange={expr => handleArgChange("expression", expr)}
                                            newColumnName={newOp.args.new_col || ""}
                                            onNewColumnNameChange={name => handleArgChange("new_col", name)}
                                        />
                                        <div className="flex justify-end mt-4">
                                            <Button
                                                className="bg-slate-800 hover:bg-slate-900"
                                                onClick={() => {
                                                    // Validations
                                                    if (!newOp.args.expression || !newOp.args.new_col) {
                                                        alert("Please provide both expression and new column name.")
                                                        return
                                                    }
                                                    // Add to pipeline
                                                    // Formula step doesn't "select target columns" in the standard way, 
                                                    // it USES them in the formula. 
                                                    // But our data model expects `cols` list on the step.
                                                    // We can put the created column as the "col" or leave it empty?
                                                    // Actually, `feature_store.py` logic:
                                                    // `col = t.get("col")` -> Used for standard ops.
                                                    // `custom_formula` uses `expression`. It doesn't strictly depend on `col`.
                                                    // So we can pass an empty list for `cols` or a dummy.
                                                    // But `pipelineSteps` structure requires `cols`.
                                                    // Let's modify `addStep` logic or hack it here to push directly to `pipelineSteps`.

                                                    setPipelineSteps([...pipelineSteps, {
                                                        id: Math.random().toString(36).substr(2, 9),
                                                        op: "custom_formula",
                                                        cols: ["(Formula)"], // Dummy display
                                                        args: {
                                                            expression: newOp.args.expression,
                                                            new_col: newOp.args.new_col
                                                        }
                                                    }])
                                                    // Reset
                                                    setNewOp({ ...newOp, args: { expression: "", new_col: "" } })
                                                }}
                                            >
                                                <Plus className="mr-2 h-4 w-4" /> Add Formula
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            {/* Helper for Arithmetic */}
                                            {newOp.op === "arithmetic" && (
                                                <div className="space-y-2">
                                                    <div className="flex gap-2">
                                                        <div className="w-1/3">
                                                            <Label>Operator</Label>
                                                            <Select className="h-9" value={newOp.args.operator || "add"} onChange={e => handleArgChange("operator", e.target.value)}>
                                                                <option value="add">Add (+)</option>
                                                                <option value="sub">Sub (-)</option>
                                                                <option value="mul">Mul (*)</option>
                                                                <option value="div">Div (/)</option>
                                                            </Select>
                                                        </div>
                                                        <div className="flex-1">
                                                            <Label>Type</Label>
                                                            <Select className="h-9" value={newOp.args.operand_type || "scalar"} onChange={e => handleArgChange("operand_type", e.target.value)}>
                                                                <option value="scalar">Scalar Value</option>
                                                                <option value="column">Column</option>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <Label>Right Operand</Label>
                                                        {newOp.args.operand_type === "column" ? (
                                                            <Select className="h-9" value={newOp.args.right_col || ""} onChange={e => handleArgChange("right_col", e.target.value)}>
                                                                <option value="">Select Column...</option>
                                                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                            </Select>
                                                        ) : (
                                                            <Input className="h-9" placeholder="Value" value={newOp.args.value || ""} onChange={e => handleArgChange("value", e.target.value)} />
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Helper for Lag */}
                                            {newOp.op === "lag" && (
                                                <div className="space-y-3 border p-3 rounded-md bg-purple-50 col-span-2">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <Label>ID Column (Group By)</Label>
                                                            <Select className="h-9 bg-white" value={newOp.args.group_col || ""} onChange={e => handleArgChange("group_col", e.target.value)}>
                                                                <option value="">None (Global Lag)</option>
                                                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                            </Select>
                                                        </div>
                                                        <div>
                                                            <Label>Date/Sort Column</Label>
                                                            <Select className="h-9 bg-white" value={newOp.args.sort_col || ""} onChange={e => handleArgChange("sort_col", e.target.value)}>
                                                                <option value="">Index (Default)</option>
                                                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                            </Select>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <Label>Max Lag Count (Create 1 to N)</Label>
                                                        <Input
                                                            className="h-9 bg-white"
                                                            type="number"
                                                            min="1"
                                                            placeholder="Example: 3 (creates lag_1, lag_2, lag_3)"
                                                            value={newOp.args.max_lag || "1"}
                                                            onChange={e => handleArgChange("max_lag", e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Other Ops */}
                                            {newOp.op === "fillna" && (
                                                <div><Label>Fill Value</Label><Input className="h-9" placeholder="0" value={newOp.args.value || ""} onChange={e => handleArgChange("value", e.target.value)} /></div>
                                            )}
                                            {newOp.op === "clip" && (
                                                <div className="flex gap-2">
                                                    <div><Label>Lower</Label><Input className="h-9" placeholder="-3" value={newOp.args.lower || ""} onChange={e => handleArgChange("lower", e.target.value)} /></div>
                                                    <div><Label>Upper</Label><Input className="h-9" placeholder="3" value={newOp.args.upper || ""} onChange={e => handleArgChange("upper", e.target.value)} /></div>
                                                </div>
                                            )}
                                            {/* Helper for Group Agg */}
                                            {newOp.op === "groupby_agg" && (
                                                <div className="space-y-3 border p-3 rounded-md bg-purple-50 col-span-2">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <Label>Group By Column (ID)</Label>
                                                            <Select className="h-9 bg-white" value={newOp.args.group_col || ""} onChange={e => handleArgChange("group_col", e.target.value)}>
                                                                <option value="">Select ID...</option>
                                                                {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                            </Select>
                                                        </div>
                                                        {/* Additional Filters UI */}
                                                        <div className="col-span-2">
                                                            <Label className="text-xs font-semibold text-slate-500">Additional Condition Filters (Optional)</Label>
                                                            <div className="flex gap-2 mb-2">
                                                                <Select
                                                                    className="h-8 bg-white flex-1 text-xs"
                                                                    value=""
                                                                    onChange={e => {
                                                                        if (!e.target.value) return
                                                                        const current = newOp.args.group_filters || []
                                                                        if (!current.includes(e.target.value)) {
                                                                            handleArgChange("group_filters", [...current, e.target.value])
                                                                        }
                                                                    }}
                                                                >
                                                                    <option value="">Add Filter Column...</option>
                                                                    {columns.filter(c => c !== newOp.args.group_col && !(newOp.args.group_filters || []).includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
                                                                </Select>
                                                            </div>
                                                            {newOp.args.group_filters && newOp.args.group_filters.length > 0 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {newOp.args.group_filters.map((f: string) => (
                                                                        <div key={f} className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                                                                            {f}
                                                                            <span
                                                                                className="cursor-pointer font-bold hover:text-red-500"
                                                                                onClick={() => {
                                                                                    const current = newOp.args.group_filters || []
                                                                                    handleArgChange("group_filters", current.filter((c: string) => c !== f))
                                                                                }}
                                                                            >×</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <p className="text-[10px] text-slate-500 mt-1">Aggregates only rows that match ID <b>AND</b> all selected filters.</p>
                                                        </div>
                                                        <div>
                                                            <Label>Function</Label>
                                                            <Select className="h-9 bg-white" value={newOp.args.func || "mean"} onChange={e => handleArgChange("func", e.target.value)}>
                                                                <option value="mean">Mean</option>
                                                                <option value="max">Max</option>
                                                                <option value="min">Min</option>
                                                                <option value="std">Std Dev</option>
                                                                <option value="count">Count</option>
                                                            </Select>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label className="text-xs font-semibold uppercase text-slate-500">Leak Prevention (Time-Aware)</Label>
                                                        <div className="flex items-center gap-2">
                                                            <Select className="h-9 bg-white flex-1" value={newOp.args.date_col || ""} onChange={e => handleArgChange("date_col", e.target.value)}>
                                                                <option value="">No Time Filter (Standard Group Agg)</option>
                                                                {columns.map(c => <option key={c} value={c}>Sort by: {c}</option>)}
                                                            </Select>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500">
                                                            If selected, aggregates only strictly PAST data for each row (Expanding Window).
                                                        </p>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label className="text-xs font-semibold uppercase text-slate-500">Thresholds (Pre-filter)</Label>
                                                        <div className="flex gap-2">
                                                            <div className="flex-1">
                                                                <Input
                                                                    className="h-9 bg-white"
                                                                    placeholder="Min Value"
                                                                    type="number"
                                                                    value={newOp.args.threshold_min || ""}
                                                                    onChange={e => handleArgChange("threshold_min", e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="flex-1">
                                                                <Input
                                                                    className="h-9 bg-white"
                                                                    placeholder="Max Value"
                                                                    type="number"
                                                                    value={newOp.args.threshold_max || ""}
                                                                    onChange={e => handleArgChange("threshold_max", e.target.value)}
                                                                />
                                                            </div>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500">Values outside range are set to NaN before aggregation.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Column Selection (Hide for Custom Formula) */}
                            {newOp.op !== "custom_formula" && (
                                <div className="space-y-3 border rounded-lg p-4 bg-slate-50">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-sm font-semibold text-slate-700">
                                            2. Select Target Columns ({selectedCols.length})
                                            {newOp.op === "groupby_agg" && <span className="ml-2 text-xs font-normal text-slate-500">(Operation applied to each column)</span>}
                                        </h3>
                                    </div>

                                    {(() => {
                                        const leftList = columns.filter(c => !selectedCols.includes(c) && c.toLowerCase().includes(colFilter.toLowerCase()))
                                        const rightList = selectedCols

                                        return (
                                            <div className="space-y-2">
                                                <Input
                                                    placeholder="Filter available columns..."
                                                    className="h-8 text-sm bg-white"
                                                    value={colFilter}
                                                    onChange={e => setColFilter(e.target.value)}
                                                />
                                                <div className="flex items-center gap-4 h-[300px]">
                                                    {/* Left Box */}
                                                    <div className="flex-1 flex flex-col h-full border rounded-md bg-white">
                                                        <div className="p-2 border-b bg-slate-50 text-xs font-semibold text-slate-500">
                                                            Available ({leftList.length})
                                                        </div>
                                                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                                            {leftList.map(feat => (
                                                                <div
                                                                    key={feat}
                                                                    className={`text-sm px-2 py-1 rounded cursor-pointer ${builderLeftSelection.includes(feat) ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-50'}`}
                                                                    onClick={() => toggleBuilderSelection(feat, 'left')}
                                                                >
                                                                    {feat}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Buttons */}
                                                    <div className="flex flex-col gap-2">
                                                        <Button variant="outline" size="sm" onClick={moveBuilderAllRight} title="Add All Visible"><ChevronsRight className="h-4 w-4" /></Button>
                                                        <Button variant="outline" size="sm" onClick={moveBuilderRight} disabled={builderLeftSelection.length === 0} title="Add Selected"><ArrowRight className="h-4 w-4" /></Button>
                                                        <Button variant="outline" size="sm" onClick={moveBuilderLeft} disabled={builderRightSelection.length === 0} title="Remove Selected"><ArrowLeft className="h-4 w-4" /></Button>
                                                        <Button variant="outline" size="sm" onClick={moveBuilderAllLeft} title="Remove All"><ChevronsLeft className="h-4 w-4" /></Button>
                                                    </div>

                                                    {/* Right Box */}
                                                    <div className="flex-1 flex flex-col h-full border rounded-md bg-white">
                                                        <div className="p-2 border-b bg-slate-50 text-xs font-semibold text-indigo-600">
                                                            Selected ({rightList.length})
                                                        </div>
                                                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                                            {rightList.map(feat => (
                                                                <div
                                                                    key={feat}
                                                                    className={`text-sm px-2 py-1 rounded cursor-pointer ${builderRightSelection.includes(feat) ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-50'}`}
                                                                    onClick={() => toggleBuilderSelection(feat, 'right')}
                                                                >
                                                                    {feat}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })()}

                                    <Button className="w-full bg-slate-800 hover:bg-slate-900 mt-4" onClick={addStep} disabled={selectedCols.length === 0}>
                                        <Plus className="mr-2 h-4 w-4" /> Add to Pipeline
                                    </Button>
                                </div>
                            )}

                            {/* Pipeline Steps View */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-slate-700">Pipeline Steps ({pipelineSteps.length})</h3>
                                <div className="border rounded-md bg-white min-h-[100px] divide-y">
                                    {pipelineSteps.map((step) => (
                                        <div key={step.id} className="flex items-center justify-between p-3">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-bold uppercase w-20 text-center">{step.op}</div>
                                                <div className="text-sm"><span className="font-medium">{step.cols.length} columns: </span>{step.cols.join(", ")}</div>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => removeStep(step.id)} className="text-red-500 h-8 w-8 p-0"><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <Button className="w-full bg-purple-600 h-12 text-lg" onClick={handleBuilderSubmit} disabled={isSubmitting || !selectedVersionId || pipelineSteps.length === 0}>
                                {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />} {editFeatureSet ? "Update Feature Set" : "Create Feature Set"}
                            </Button>
                        </div>
                    )}

                    {/* Auto & Analyze Tabs (Omitted for brevity to stay mostly within token limits, but I should include them!) */}
                    {activeTab === "auto" && (
                        <div className="space-y-6 pt-4">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2"><Label>Variance Threshold</Label><Input value={varianceThreshold} onChange={e => setVarianceThreshold(e.target.value)} /></div>
                                <div className="space-y-2"><Label>Correlation Threshold</Label><Input value={corrThreshold} onChange={e => setCorrThreshold(e.target.value)} /></div>
                            </div>

                            <div className="space-y-2">
                                <Label>Generation Method</Label>
                                <Select value={generationMethod} onChange={e => setGenerationMethod(e.target.value)} className="h-10">
                                    <option value="arithmetic">Standard Arithmetic (Original)</option>
                                    <option value="polynomial">Polynomial Features (sklearn)</option>
                                    <option value="featuretools">Deep Feature Synthesis (via Featuretools)</option>
                                </Select>
                                <p className="text-xs text-slate-500">
                                    {generationMethod === "arithmetic"
                                        ? "Generates combinations (+, -, *, /) of all numeric columns."
                                        : generationMethod === "polynomial"
                                            ? "Generates interaction terms (a*b) and squared terms (a^2)."
                                            : "Uses automated feature engineering library to find complex patterns."}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Target Column (Excluded from generation, kept in output)</Label>
                                <Select value={autoTargetCol} onChange={e => setAutoTargetCol(e.target.value)} className="h-10">
                                    <option value="">None</option>
                                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                </Select>
                            </div>

                            {/* Column Selection for Auto Gen */}
                            <div className="space-y-3 border rounded-lg p-4 bg-slate-50">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-sm font-semibold text-slate-700">Select Input Features (Optional)</h3>
                                </div>

                                {(() => {
                                    // Filter out target column and already selected columns
                                    const leftList = columns.filter(c => c !== autoTargetCol && !autoSelectedCols.includes(c) && c.toLowerCase().includes(autoColFilter.toLowerCase()))
                                    const rightList = autoSelectedCols

                                    return (
                                        <div className="space-y-2">
                                            <Input
                                                placeholder="Filter available columns..."
                                                className="h-8 text-sm bg-white"
                                                value={autoColFilter}
                                                onChange={e => setAutoColFilter(e.target.value)}
                                            />
                                            <div className="flex items-center gap-4 h-[300px]">
                                                {/* Left Box */}
                                                <div className="flex-1 flex flex-col h-full border rounded-md bg-white">
                                                    <div className="p-2 border-b bg-slate-50 text-xs font-semibold text-slate-500">
                                                        Available ({leftList.length})
                                                    </div>
                                                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                                        {leftList.map(feat => (
                                                            <div
                                                                key={feat}
                                                                className={`text-sm px-2 py-1 rounded cursor-pointer ${autoLeftSelection.includes(feat) ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-50'}`}
                                                                onClick={() => toggleAutoSelection(feat, 'left')}
                                                            >
                                                                {feat}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Buttons */}
                                                <div className="flex flex-col gap-2">
                                                    <Button variant="outline" size="sm" onClick={moveAutoAllRight} title="Add All Visible"><ChevronsRight className="h-4 w-4" /></Button>
                                                    <Button variant="outline" size="sm" onClick={moveAutoRight} disabled={autoLeftSelection.length === 0} title="Add Selected"><ArrowRight className="h-4 w-4" /></Button>
                                                    <Button variant="outline" size="sm" onClick={moveAutoLeft} disabled={autoRightSelection.length === 0} title="Remove Selected"><ArrowLeft className="h-4 w-4" /></Button>
                                                    <Button variant="outline" size="sm" onClick={moveAutoAllLeft} title="Remove All"><ChevronsLeft className="h-4 w-4" /></Button>
                                                </div>

                                                {/* Right Box */}
                                                <div className="flex-1 flex flex-col h-full border rounded-md bg-white">
                                                    <div className="p-2 border-b bg-slate-50 text-xs font-semibold text-indigo-600">
                                                        Selected ({rightList.length})
                                                    </div>
                                                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                                        {rightList.map(feat => (
                                                            <div
                                                                key={feat}
                                                                className={`text-sm px-2 py-1 rounded cursor-pointer ${autoRightSelection.includes(feat) ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-50'}`}
                                                                onClick={() => toggleAutoSelection(feat, 'right')}
                                                            >
                                                                {feat}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 text-right">
                                                {autoSelectedCols.length === 0 ? "Using ALL (except target)" : `${autoSelectedCols.length} columns selected`}
                                            </p>
                                        </div>
                                    )
                                })()}
                            </div>

                            <div className="flex items-center space-x-2 border p-4 rounded-md">
                                <input type="checkbox" id="arithmetic" checked={includeArithmetic} onChange={e => setIncludeArithmetic(e.target.checked)} className="h-4 w-4" />
                                <label htmlFor="arithmetic" className="text-sm font-medium">Generate Arithmetic Combinations</label>
                            </div>
                            <Button className="w-full bg-indigo-600" onClick={handleAutoSubmit} disabled={isSubmitting || !selectedVersionId}>
                                <Wand2 className="mr-2 h-4 w-4" /> Generate Automatically (Append)
                            </Button>
                        </div>
                    )}

                    {/* Manage Columns Tab */}
                    {activeTab === "manage" && (
                        <div className="space-y-6 pt-4">

                            {/* Row Filtering Section (Using first "filter" op from pipelineSteps) */}
                            <div className="border rounded-lg p-4 space-y-3 bg-orange-50 border-orange-100">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-lg font-semibold text-orange-900">Row Filtering</h3>
                                        <p className="text-xs text-orange-700">Apply global filters to the dataset (e.g. specific Venue or Distance).</p>
                                    </div>
                                    <Button
                                        size="sm" variant="outline" className="bg-white text-orange-700 border-orange-200 hover:bg-orange-100"
                                        onClick={() => {
                                            // Find existing filter step or create new one
                                            const existingFilterIdx = pipelineSteps.findIndex(s => s.op === "filter")
                                            if (existingFilterIdx >= 0) {
                                                const step = pipelineSteps[existingFilterIdx]
                                                const current = step.args.conditions || []
                                                const newConditions = [...current, { col: columns[0], op: "eq", val: "" }]

                                                const newSteps = [...pipelineSteps]
                                                newSteps[existingFilterIdx] = { ...step, args: { ...step.args, conditions: newConditions } }
                                                setPipelineSteps(newSteps)
                                            } else {
                                                // Create new filter step at BEGINNING (usually best for filtering)
                                                const newStep = {
                                                    id: Math.random().toString(36).substr(2, 9),
                                                    op: "filter",
                                                    cols: [],
                                                    args: { conditions: [{ col: columns[0], op: "eq", val: "" }] }
                                                }
                                                setPipelineSteps([newStep, ...pipelineSteps])
                                            }
                                        }}
                                    >
                                        + Add Global Filter
                                    </Button>
                                </div>
                                {(() => {
                                    const filterStep = pipelineSteps.find(s => s.op === "filter")
                                    const conditions = filterStep?.args?.conditions || []

                                    if (!filterStep || conditions.length === 0) {
                                        return <p className="text-sm text-orange-400 italic text-center py-2">No active filters (All rows used)</p>
                                    }

                                    return (
                                        <div className="space-y-2">
                                            {conditions.map((cond: any, idx: number) => (
                                                <div key={idx} className="flex gap-2 items-center bg-white p-2 rounded border border-orange-200">
                                                    <Select
                                                        className="h-8 text-xs w-32"
                                                        value={cond.col}
                                                        onChange={e => {
                                                            const newSteps = [...pipelineSteps]
                                                            const fIdx = newSteps.findIndex(s => s.op === "filter")
                                                            if (fIdx >= 0) {
                                                                const updatedConds = [...newSteps[fIdx].args.conditions]
                                                                updatedConds[idx] = { ...updatedConds[idx], col: e.target.value }
                                                                newSteps[fIdx].args.conditions = updatedConds
                                                                setPipelineSteps(newSteps)
                                                            }
                                                        }}
                                                    >
                                                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </Select>
                                                    <Select
                                                        className="h-8 text-xs w-24"
                                                        value={cond.op}
                                                        onChange={e => {
                                                            const newSteps = [...pipelineSteps]
                                                            const fIdx = newSteps.findIndex(s => s.op === "filter")
                                                            if (fIdx >= 0) {
                                                                const updatedConds = [...newSteps[fIdx].args.conditions]
                                                                updatedConds[idx] = { ...updatedConds[idx], op: e.target.value }
                                                                newSteps[fIdx].args.conditions = updatedConds
                                                                setPipelineSteps(newSteps)
                                                            }
                                                        }}
                                                    >
                                                        <option value="eq">==</option>
                                                        <option value="neq">!=</option>
                                                        <option value="gt">&gt;</option>
                                                        <option value="lt">&lt;</option>
                                                        <option value="gte">&gt;=</option>
                                                        <option value="lte">&lt;=</option>
                                                        <option value="in">IN (csv)</option>
                                                        <option value="not_in">NOT IN (csv)</option>
                                                    </Select>
                                                    <Input
                                                        className="h-8 text-xs flex-1"
                                                        placeholder="Value"
                                                        value={cond.val}
                                                        onChange={e => {
                                                            const newSteps = [...pipelineSteps]
                                                            const fIdx = newSteps.findIndex(s => s.op === "filter")
                                                            if (fIdx >= 0) {
                                                                const updatedConds = [...newSteps[fIdx].args.conditions]
                                                                updatedConds[idx] = { ...updatedConds[idx], val: e.target.value }
                                                                newSteps[fIdx].args.conditions = updatedConds
                                                                setPipelineSteps(newSteps)
                                                            }
                                                        }}
                                                    />
                                                    <Button
                                                        variant="ghost" size="sm" className="h-8 w-8 text-red-500 hover:text-red-700 p-0"
                                                        onClick={() => {
                                                            const newSteps = [...pipelineSteps]
                                                            const fIdx = newSteps.findIndex(s => s.op === "filter")
                                                            if (fIdx >= 0) {
                                                                const updatedConds = newSteps[fIdx].args.conditions.filter((_: any, i: number) => i !== idx)
                                                                newSteps[fIdx].args.conditions = updatedConds
                                                                // If empty, maybe remove step? For now keeping it empty is fine
                                                                if (updatedConds.length === 0) {
                                                                    // Remove step completely to clean up
                                                                    newSteps.splice(fIdx, 1)
                                                                }
                                                                setPipelineSteps(newSteps)
                                                            }
                                                        }}
                                                    ><Trash2 className="h-4 w-4" /></Button>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                })()}
                            </div>

                            {/* Active Features Section */}
                            <div className="border rounded-lg p-4 space-y-3 bg-indigo-50/50 border-indigo-100">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-lg font-semibold text-indigo-900">Active Features</h3>
                                        <p className="text-xs text-indigo-700">Select which features should be used for model training by default.</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {editFeatureSet && (
                                            <Button
                                                size="sm"
                                                className="bg-indigo-600 hover:bg-indigo-700"
                                                onClick={handleSaveActiveFeatures}
                                                disabled={isSubmitting}
                                            >
                                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save Selection
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2 pb-2 border-b border-indigo-200 mb-2">
                                    <Label className="text-indigo-900">Default Target Column</Label>
                                    <Select value={activeTargetCol} onChange={e => setActiveTargetCol(e.target.value)} className="bg-white">
                                        <option value="">Select Target...</option>
                                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </Select>
                                </div>
                                {(() => {
                                    const leftList = columns.filter(c => !activeFeatureSelection.includes(c) && c !== activeTargetCol)
                                    return (
                                        <div className="flex items-center gap-4 h-[300px]">
                                            {/* Left Box */}
                                            <div className="flex-1 flex flex-col h-full border rounded-md bg-white">
                                                <div className="p-2 border-b bg-slate-50 text-xs font-semibold text-slate-500">Available ({leftList.length})</div>
                                                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                                    {leftList.map(feat => (
                                                        <div
                                                            key={feat}
                                                            className={`text-sm px-2 py-1 rounded cursor-pointer ${leftSelection.includes(feat) ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-50'}`}
                                                            onClick={() => toggleSelection(feat, 'left')}
                                                        >
                                                            {feat}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Buttons */}
                                            <div className="flex flex-col gap-2">
                                                <Button variant="outline" size="sm" onClick={moveAllRight} title="Add All"><ChevronsRight className="h-4 w-4" /></Button>
                                                <Button variant="outline" size="sm" onClick={moveRight} disabled={leftSelection.length === 0} title="Add Selected"><ArrowRight className="h-4 w-4" /></Button>
                                                <Button variant="outline" size="sm" onClick={moveLeft} disabled={rightSelection.length === 0} title="Remove Selected"><ArrowLeft className="h-4 w-4" /></Button>
                                                <Button variant="outline" size="sm" onClick={moveAllLeft} title="Remove All"><ChevronsLeft className="h-4 w-4" /></Button>
                                            </div>

                                            {/* Right Box */}
                                            <div className="flex-1 flex flex-col h-full border rounded-md bg-white">
                                                <div className="p-2 border-b bg-slate-50 text-xs font-semibold text-indigo-600">Selected ({activeFeatureSelection.length})</div>
                                                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                                    {activeFeatureSelection.map(feat => (
                                                        <div
                                                            key={feat}
                                                            className={`text-sm px-2 py-1 rounded cursor-pointer ${rightSelection.includes(feat) ? 'bg-indigo-100 text-indigo-800' : 'hover:bg-slate-50'}`}
                                                            onClick={() => toggleSelection(feat, 'right')}
                                                        >
                                                            {feat}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>

                        </div>
                    )}
                </div>

            </DialogContent >
        </Dialog >
    )
}

// Helper to group transformations for UI display
const groupTransformations = (flat: any[]) => {
    const grouped: any[] = []
    if (!flat) return []
    let currentGroup: any = null
    flat.forEach(t => {
        const { op, col, ...args } = t
        const isMatch = currentGroup && currentGroup.op === op && JSON.stringify(currentGroup.args) === JSON.stringify(args)
        if (isMatch) currentGroup.cols.push(col)
        else {
            if (currentGroup) grouped.push(currentGroup)
            currentGroup = { id: Math.random().toString(36).substr(2, 9), op, cols: [col], args }
        }
    })
    if (currentGroup) grouped.push(currentGroup)
    return grouped
}

