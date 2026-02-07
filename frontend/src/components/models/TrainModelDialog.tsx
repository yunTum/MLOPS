import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input, Label } from "@/components/ui/input"
import { Select } from "@/components/ui/select-native"
import { Textarea } from "@/components/ui/textarea"
import api from "@/lib/api"
import { Loader2, ArrowRight, ArrowLeft, ChevronsRight, ChevronsLeft, Eye } from "lucide-react"

interface TrainModelDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
    initialConfig?: any
}

const DRAFT_KEY = "mlops_train_model_draft"

const standardKeys = [
    "objective", "metric", "learning_rate", "num_leaves", "boosting_type",
    "n_estimators", "max_depth", "min_child_samples", "feature_fraction",
    "bagging_fraction", "lambda_l1", "lambda_l2",
    "n_clusters", "init"
]

export function TrainModelDialog({ open, onOpenChange, onSuccess, initialConfig }: TrainModelDialogProps) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [featureSets, setFeatureSets] = useState<any[]>([])
    const [availableColumns, setAvailableColumns] = useState<string[]>([])

    // Form State
    const [selectedFsId, setSelectedFsId] = useState("")
    const [targetCol, setTargetCol] = useState("")
    const [groupCol, setGroupCol] = useState("")
    const [selectedFeatures, setSelectedFeatures] = useState<string[]>([])
    const [experimentName, setExperimentName] = useState("experiment_v1")

    // Transfer List Selection State
    const [leftSelection, setLeftSelection] = useState<string[]>([])
    const [rightSelection, setRightSelection] = useState<string[]>([])

    // Structured Params
    const [objective, setObjective] = useState("regression")
    const [metric, setMetric] = useState("rmse")
    const [learningRate, setLearningRate] = useState("0.05")
    const [numLeaves, setNumLeaves] = useState("31")
    const [boostingType, setBoostingType] = useState("gbdt")

    // Clustering Params
    const [nClusters, setNClusters] = useState("3")
    const [initMethod, setInitMethod] = useState("k-means++")

    // Extended Params
    const [nEstimators, setNEstimators] = useState("100")
    const [maxDepth, setMaxDepth] = useState("-1") // -1 means no limit
    const [minChildSamples, setMinChildSamples] = useState("20")
    const [featureFraction, setFeatureFraction] = useState("1.0")
    const [baggingFraction, setBaggingFraction] = useState("1.0")
    const [baggingFreq, setBaggingFreq] = useState("0")
    const [lambdaL1, setLambdaL1] = useState("0.0")
    const [lambdaL2, setLambdaL2] = useState("0.0")

    // HPO State
    const [autoTune, setAutoTune] = useState(false)
    const [hpoTimeout, setHpoTimeout] = useState("600")
    const [hpoTrials, setHpoTrials] = useState("20")
    const [hpoMetric, setHpoMetric] = useState("rmse")

    const [paramsJson, setParamsJson] = useState('{}')

    // Preview State
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewData, setPreviewData] = useState<any>(null)
    const [previewOpen, setPreviewOpen] = useState(false)



    // Load Draft or Initial Config
    useEffect(() => {
        if (open) {
            fetchFeatureSets()

            // Prioritize Initial Config (Retrain) over Draft
            if (initialConfig) {
                setStep(2)
                if (initialConfig.feature_set_id) setSelectedFsId(String(initialConfig.feature_set_id))
                if (initialConfig.target_column) setTargetCol(initialConfig.target_column)
                if (initialConfig.parameters?.group_column) setGroupCol(initialConfig.parameters.group_column)
                if (initialConfig.feature_names) setSelectedFeatures(initialConfig.feature_names)
                if (initialConfig.name) setExperimentName(`retrain_${initialConfig.name}`)

                // Parse Params
                if (initialConfig.parameters) {
                    const p = initialConfig.parameters
                    if (p.objective) setObjective(p.objective)
                    if (p.metric) setMetric(p.metric)
                    if (p.learning_rate) setLearningRate(String(p.learning_rate))
                    if (p.num_leaves) setNumLeaves(String(p.num_leaves))
                    if (p.boosting_type) setBoostingType(p.boosting_type)

                    if (p.n_clusters) setNClusters(String(p.n_clusters))
                    if (p.init) setInitMethod(p.init)

                    if (p.n_estimators) setNEstimators(String(p.n_estimators))
                    if (p.max_depth) setMaxDepth(String(p.max_depth))
                    if (p.min_child_samples) setMinChildSamples(String(p.min_child_samples))
                    if (p.feature_fraction) setFeatureFraction(String(p.feature_fraction))
                    if (p.bagging_fraction) setBaggingFraction(String(p.bagging_fraction))
                    if (p.bagging_freq) setBaggingFreq(String(p.bagging_freq))
                    if (p.lambda_l1) setLambdaL1(String(p.lambda_l1))
                    if (p.lambda_l2) setLambdaL2(String(p.lambda_l2))

                    // Extract extra params to JSON
                    const extra: any = { ...p }
                    standardKeys.forEach(k => delete extra[k])
                    setParamsJson(JSON.stringify(extra, null, 2))
                }
            } else {
                setStep(1)
                const savedParam = localStorage.getItem(DRAFT_KEY)
                if (savedParam) {
                    try {
                        const draft = JSON.parse(savedParam)
                        if (draft.selectedFsId) setSelectedFsId(draft.selectedFsId)
                        if (draft.targetCol) setTargetCol(draft.targetCol)
                        if (draft.groupCol) setGroupCol(draft.groupCol)
                        if (draft.selectedFeatures) setSelectedFeatures(draft.selectedFeatures)
                        if (draft.experimentName) setExperimentName(draft.experimentName)
                        // Params
                        if (draft.objective) setObjective(draft.objective)
                        if (draft.metric) setMetric(draft.metric)
                        if (draft.learningRate) setLearningRate(draft.learningRate)
                        if (draft.numLeaves) setNumLeaves(draft.numLeaves)
                        if (draft.boostingType) setBoostingType(draft.boostingType)

                        if (draft.nClusters) setNClusters(draft.nClusters)
                        if (draft.initMethod) setInitMethod(draft.initMethod)

                        // Extended Params
                        if (draft.nEstimators) setNEstimators(draft.nEstimators)
                        if (draft.maxDepth) setMaxDepth(draft.maxDepth)
                        if (draft.minChildSamples) setMinChildSamples(draft.minChildSamples)
                        if (draft.featureFraction) setFeatureFraction(draft.featureFraction)
                        if (draft.baggingFraction) setBaggingFraction(draft.baggingFraction)
                        if (draft.baggingFreq) setBaggingFreq(draft.baggingFreq)
                        if (draft.lambdaL1) setLambdaL1(draft.lambdaL1)
                        if (draft.lambdaL2) setLambdaL2(draft.lambdaL2)

                        if (draft.paramsJson) setParamsJson(draft.paramsJson)
                    } catch (e) {
                        console.error("Failed to load draft", e)
                    }
                }
            }
        }
    }, [open, initialConfig])

    // Save Draft
    useEffect(() => {
        if (!open) return

        const draft = {
            selectedFsId,
            targetCol,
            groupCol,
            selectedFeatures,
            experimentName,
            objective,
            metric,
            learningRate,
            numLeaves,
            boostingType,
            nClusters,
            initMethod,
            nEstimators,
            maxDepth,
            minChildSamples,
            featureFraction,
            baggingFraction,
            baggingFreq,
            lambdaL1,
            lambdaL2,
            paramsJson
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    }, [
        selectedFsId, targetCol, groupCol, selectedFeatures, experimentName,
        objective, metric, learningRate, numLeaves, boostingType,
        nClusters, initMethod,
        nEstimators, maxDepth, minChildSamples, featureFraction, baggingFraction, baggingFreq, lambdaL1, lambdaL2,
        paramsJson, open
    ])

    useEffect(() => {
        if (selectedFsId) {
            fetchColumns(selectedFsId)
        } else {
            setAvailableColumns([])
        }
    }, [selectedFsId])

    const fetchFeatureSets = async () => {
        try {
            const res = await api.get('/features/sets')
            setFeatureSets(res.data.filter((fs: any) => fs.path))
        } catch (e) { console.error(e) }
    }

    const fetchColumns = async (fsId: string) => {
        try {
            const res = await api.get(`/features/sets/${fsId}/preview?limit=1`)
            if (res.data.data && res.data.data.length > 0) {
                const cols = Object.keys(res.data.data[0])
                setAvailableColumns(cols)

                // Check for active features in the selected feature set object
                const fs = featureSets.find(f => f.id.toString() === selectedFsId)
                if (fs && fs.active_features && fs.active_features.length > 0) {
                    // Filter to ensure they exist in columns (sanity check)
                    const validActive = fs.active_features.filter((c: string) => cols.includes(c))
                    setSelectedFeatures(validActive)
                } else {
                    // If no active features defined, validate current selection against new columns
                    setSelectedFeatures(prev => prev.filter(c => cols.includes(c)))
                }

                // Auto-select target column if defined in Feature Set
                if (fs && fs.target_column && cols.includes(fs.target_column)) {
                    setTargetCol(fs.target_column)
                } else {
                    // If target not in new columns, clear it
                    setTargetCol(prev => cols.includes(prev) ? prev : "")
                }
            }
        } catch (e) {
            console.error(e)
        }
    }

    // Transfer List Logic
    const leftList = availableColumns.filter(c => {
        if (c === targetCol) return false
        if (c === groupCol) return false
        if (selectedFeatures.includes(c)) return false

        // Check active features restriction
        const fs = featureSets.find(f => f.id.toString() === selectedFsId)
        if (fs && fs.active_features && fs.active_features.length > 0) {
            return fs.active_features.includes(c)
        }
        return true
    })
    const rightList = selectedFeatures

    const moveRight = () => {
        setSelectedFeatures(prev => [...prev, ...leftSelection])
        setLeftSelection([])
    }

    const moveLeft = () => {
        setSelectedFeatures(prev => prev.filter(f => !rightSelection.includes(f)))
        setRightSelection([])
    }

    const moveAllRight = () => {
        const allLeft = availableColumns.filter(c => c !== targetCol && c !== groupCol)
        setSelectedFeatures(allLeft)
        setLeftSelection([])
    }

    const moveAllLeft = () => {
        setSelectedFeatures([])
        setRightSelection([])
    }

    const toggleSelection = (item: string, listType: 'left' | 'right') => {
        if (listType === 'left') {
            setLeftSelection(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
        } else {
            setRightSelection(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
        }
    }

    const handleTargetChange = (newTarget: string) => {
        setTargetCol(newTarget)
        if (newTarget && selectedFeatures.length === 0 && availableColumns.length > 0) {
            const features = availableColumns.filter(c => c !== newTarget)
            setSelectedFeatures(features)
        }
    }

    const handlePreviewData = async () => {
        setPreviewLoading(true)
        setPreviewData(null)
        try {
            let additionalParams = {}
            try {
                additionalParams = JSON.parse(paramsJson)
            } catch (e) {
                alert("Invalid JSON params")
                setPreviewLoading(false)
                return
            }

            const finalParams = {
                objective,
                metric,
                learning_rate: parseFloat(learningRate),
                num_leaves: parseInt(numLeaves),
                boosting_type: boostingType,
                n_estimates: parseInt(nEstimators), // Keep typo if exists in backend, but standard is n_estimators. Check backend again? Backend expects n_estimators. Fix consistent naming.
                n_estimators: parseInt(nEstimators),
                max_depth: parseInt(maxDepth),
                min_child_samples: parseInt(minChildSamples),
                feature_fraction: parseFloat(featureFraction),
                bagging_fraction: parseFloat(baggingFraction),
                bagging_freq: parseInt(baggingFreq),
                lambda_l1: parseFloat(lambdaL1),
                lambda_l2: parseFloat(lambdaL2),

                // Clustering
                n_clusters: parseInt(nClusters),
                init: initMethod,

                // Ranking
                group_column: objective === 'lambdarank' ? groupCol : undefined,

                ...additionalParams
            }

            if (selectedFeatures.length === 0) {
                alert("Please select at least one feature")
                setPreviewLoading(false)
                return
            }

            // Validate Target if not Clustering
            if (objective !== 'clustering' && !targetCol) {
                alert("Please select a target column")
                setPreviewLoading(false)
                return
            }

            if (objective === 'lambdarank' && !groupCol) {
                alert("Please select a group column for Ranking")
                setPreviewLoading(false)
                return
            }

            const res = await api.post('/models/train/preview', {
                feature_set_id: parseInt(selectedFsId),
                target_col: objective === 'clustering' ? null : targetCol,
                experiment_name: experimentName, // Not used in preview but schema might require it? Schema is ModelTrainRequest?
                // Wait, ModelTrainRequest requires params, features, target_col, feature_set_id.
                // Let's check backend schema.
                // It usually mirrors train request.
                params: finalParams,
                features: selectedFeatures,
                // HPO params not needed for preview
            })

            setPreviewData(res.data)
            setPreviewOpen(true)

        } catch (e: any) {
            console.error(e)
            alert(e.response?.data?.detail || "Preview failed")
        } finally {
            setPreviewLoading(false)
        }
    }

    const handleSubmit = async () => {
        setLoading(true)
        try {
            let additionalParams = {}
            try {
                additionalParams = JSON.parse(paramsJson)
            } catch (e) {
                alert("Invalid JSON params")
                setLoading(false)
                return
            }

            const finalParams = {
                objective,
                metric,
                learning_rate: parseFloat(learningRate),
                num_leaves: parseInt(numLeaves),
                boosting_type: boostingType,
                n_estimators: parseInt(nEstimators),
                max_depth: parseInt(maxDepth),
                min_child_samples: parseInt(minChildSamples),
                feature_fraction: parseFloat(featureFraction),
                bagging_fraction: parseFloat(baggingFraction),
                bagging_freq: parseInt(baggingFreq),
                lambda_l1: parseFloat(lambdaL1),
                lambda_l2: parseFloat(lambdaL2),

                // Clustering
                n_clusters: parseInt(nClusters),
                init: initMethod,

                // Ranking
                group_column: objective === 'lambdarank' ? groupCol : undefined,

                ...additionalParams
            }

            const hpoParams = {
                optimize_hyperparameters: autoTune,
                optimization_timeout: parseInt(hpoTimeout),
                n_trials: parseInt(hpoTrials),
                optimization_metric: hpoMetric
            }

            if (selectedFeatures.length === 0) {
                alert("Please select at least one feature")
                setLoading(false)
                return
            }

            // Validate Target if not Clustering
            if (objective !== 'clustering' && !targetCol) {
                alert("Please select a target column")
                setLoading(false)
                return
            }

            if (objective === 'lambdarank' && !groupCol) {
                alert("Please select a group column for Ranking")
                setLoading(false)
                return
            }

            const res = await api.post('/models/train', {
                feature_set_id: parseInt(selectedFsId),
                target_col: objective === 'clustering' ? null : targetCol,
                experiment_name: experimentName,
                params: finalParams,
                features: selectedFeatures,
                ...hpoParams
            })

            localStorage.removeItem(DRAFT_KEY)

            if (res.data.task_type) {
                // Background Task Started
                // The Global TaskProgress component will pick this up.
            }

            onSuccess()
            onOpenChange(false)
        } catch (e) {
            console.error(e)
            alert("Training failed to start")
        } finally {
            setLoading(false)
        }
    }

    // Auto-set RF params
    useEffect(() => {
        if (boostingType === 'rf') {
            if (baggingFraction === "1.0") setBaggingFraction("0.8")
            if (baggingFreq === "0") setBaggingFreq("5")
        }
    }, [boostingType])

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[800px]">
                    <DialogHeader>
                        <DialogTitle>{initialConfig ? 'Edit Configuration & Retrain' : 'Train New Model'}</DialogTitle>
                        <DialogDescription>{initialConfig ? 'Adjust attributes for the new model.' : 'Configure your training job.'}</DialogDescription>
                    </DialogHeader>

                    <div className="py-2 space-y-4">
                        {step === 1 && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Feature Dataset</Label>
                                    <Select value={selectedFsId} onChange={e => setSelectedFsId(e.target.value)}>
                                        <option value="">Select a built feature set...</option>
                                        {featureSets.map(fs => (
                                            <option key={fs.id} value={fs.id}>
                                                {fs.name || `FS-${fs.id}`} ({fs.version})
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                                <Button onClick={() => setStep(2)} disabled={!selectedFsId} className="w-full">
                                    Next: Configuration
                                </Button>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-4 h-[600px] overflow-y-auto pr-2">
                                <div className="space-y-2">
                                    <Label>Experiment Name</Label>
                                    <Input value={experimentName} onChange={e => setExperimentName(e.target.value)} />
                                </div>

                                {(() => {
                                    const fs = featureSets.find(f => f.id.toString() === selectedFsId)
                                    const isPreConfigured = fs && fs.active_features && fs.active_features.length > 0 && fs.target_column

                                    // Note: Clustring doesn't use target, so "PreConfigured" might need adjustment or just allow override.
                                    // For now, if pre-configured, we assume it's valid, but if user switches to clustering, they might want to ignore target.
                                    // But "PreConfigured" view hides controls. Let's keep it simple: if fully configured, show summary only.
                                    // User can edit Feature Set if they want to change "Target" to nothing (unlikely/hard).
                                    // OR: We can just render the form if objective is clustering even if "PreConfigured".

                                    // Let's simplify: Show PreConfigured ONLY if NOT clustering or if objective matches?
                                    // Actually, allow the user to change params (Objective) even if features are pre-selected.
                                    // The "PreConfigured" block in previous code hid Target and Features selection.
                                    // We should keep that behavior but allow Objective change.

                                    if (isPreConfigured && objective !== 'clustering') {
                                        return (
                                            <div className="space-y-4 border rounded-md p-4 bg-slate-50">
                                                <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm">
                                                    <div className="h-2 w-2 rounded-full bg-indigo-500" />
                                                    Fully Configured by Feature Set
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <Label className="text-xs text-slate-500">Target Column</Label>
                                                        <div className="font-medium text-sm">{fs.target_column}</div>
                                                    </div>
                                                    <div>
                                                        <Label className="text-xs text-slate-500">Features</Label>
                                                        <div className="font-medium text-sm">
                                                            {fs.active_features.filter((f: string) => f !== fs.target_column).length} features selected
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    }

                                    return (
                                        <>
                                            {/* Target Column - Hide if Clustering */}
                                            {objective !== 'clustering' && (
                                                <div className="space-y-2">
                                                    <Label>Target Column</Label>
                                                    {availableColumns.length > 0 ? (
                                                        <Select value={targetCol} onChange={e => handleTargetChange(e.target.value)}>
                                                            <option value="">Select Target...</option>
                                                            {availableColumns.map(col => (
                                                                <option key={col} value={col}>{col}</option>
                                                            ))}
                                                        </Select>
                                                    ) : (
                                                        <Input value={targetCol} onChange={e => setTargetCol(e.target.value)} placeholder="Enter target column name..." />
                                                    )}
                                                </div>
                                            )}

                                            {/* Feature Select - If Target (or Clustering) is Ready */}
                                            {(targetCol || objective === 'clustering') && (
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <Label>Feature Selection</Label>
                                                    </div>
                                                    <div className="flex items-center gap-4 h-[200px]">
                                                        <div className="flex-1 flex flex-col h-full border rounded-md">
                                                            <div className="p-2 border-b bg-slate-50 text-xs font-semibold">Available ({leftList.length})</div>
                                                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                                                {leftList.map(feat => (
                                                                    <div
                                                                        key={feat}
                                                                        className={`text-sm px-2 py-1 rounded cursor-pointer ${leftSelection.includes(feat) ? 'bg-blue-100 text-blue-800' : 'hover:bg-slate-50'}`}
                                                                        onClick={() => toggleSelection(feat, 'left')}
                                                                    >
                                                                        {feat}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col gap-2">
                                                            <Button variant="outline" size="sm" onClick={moveAllRight} title="Add All"><ChevronsRight className="h-4 w-4" /></Button>
                                                            <Button variant="outline" size="sm" onClick={moveRight} disabled={leftSelection.length === 0} title="Add Selected"><ArrowRight className="h-4 w-4" /></Button>
                                                            <Button variant="outline" size="sm" onClick={moveLeft} disabled={rightSelection.length === 0} title="Remove Selected"><ArrowLeft className="h-4 w-4" /></Button>
                                                            <Button variant="outline" size="sm" onClick={moveAllLeft} title="Remove All"><ChevronsLeft className="h-4 w-4" /></Button>
                                                        </div>

                                                        <div className="flex-1 flex flex-col h-full border rounded-md">
                                                            <div className="p-2 border-b bg-slate-50 text-xs font-semibold">Selected ({rightList.length})</div>
                                                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                                                {rightList.map(feat => (
                                                                    <div
                                                                        key={feat}
                                                                        className={`text-sm px-2 py-1 rounded cursor-pointer ${rightSelection.includes(feat) ? 'bg-blue-100 text-blue-800' : 'hover:bg-slate-50'}`}
                                                                        onClick={() => toggleSelection(feat, 'right')}
                                                                    >
                                                                        {feat}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )
                                })()}

                                <div className="border-t border-slate-100 pt-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="space-y-0.5">
                                            <Label className="text-base font-semibold">Hyperparameter Optimization</Label>
                                            <p className="text-xs text-slate-500">Automatically find best parameters using Optuna</p>
                                        </div>
                                        <Switch checked={autoTune} onCheckedChange={setAutoTune} />
                                    </div>

                                    {autoTune ? (
                                        <div className="grid grid-cols-2 gap-4 mb-6 bg-blue-50 p-4 rounded-md border border-blue-100">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-blue-900 font-medium">Time Limit (seconds)</Label>
                                                <Input type="number" value={hpoTimeout} onChange={e => setHpoTimeout(e.target.value)} className="bg-white" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-blue-900 font-medium">Number of Trials</Label>
                                                <Input type="number" value={hpoTrials} onChange={e => setHpoTrials(e.target.value)} className="bg-white" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-blue-900 font-medium">Optimization Metric</Label>
                                                <Select value={hpoMetric} onChange={e => setHpoMetric(e.target.value)} className="bg-white">
                                                    <option value="rmse">RMSE (Minimize)</option>
                                                    <option value="mae">MAE (Minimize)</option>
                                                    <option value="auc">AUC (Maximize)</option>
                                                    <option value="binary_logloss">LogLoss (Minimize)</option>
                                                </Select>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <Label className="text-base font-semibold">Manual Hyperparameters</Label>

                                            <div className="grid grid-cols-2 gap-4 mt-2">
                                                <div className="space-y-1">
                                                    <Label className="text-xs text-slate-500">Objective</Label>
                                                    <Select value={objective} onChange={e => setObjective(e.target.value)}>
                                                        <option value="regression">Regression</option>
                                                        <option value="binary">Binary Classification</option>
                                                        <option value="multiclass">Multiclass</option>
                                                        <option value="lambdarank">Ranking (LambdaRank)</option>
                                                        <option value="clustering">Clustering (K-Means)</option>
                                                    </Select>
                                                </div>

                                                {objective === 'lambdarank' && (
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-slate-500">Group Column (Query ID)</Label>
                                                        {availableColumns.length > 0 ? (
                                                            <Select value={groupCol} onChange={e => setGroupCol(e.target.value)}>
                                                                <option value="">Select Group ID...</option>
                                                                {availableColumns.map(col => (
                                                                    <option key={col} value={col}>{col}</option>
                                                                ))}
                                                            </Select>
                                                        ) : (
                                                            <Input value={groupCol} onChange={e => setGroupCol(e.target.value)} placeholder="Enter group column..." />
                                                        )}
                                                    </div>
                                                )}

                                                {objective === 'clustering' ? (
                                                    <>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Number of Clusters (K)</Label>
                                                            <Input type="number" value={nClusters} onChange={e => setNClusters(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Initialization</Label>
                                                            <Select value={initMethod} onChange={e => setInitMethod(e.target.value)}>
                                                                <option value="k-means++">k-means++</option>
                                                                <option value="random">Random</option>
                                                            </Select>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Metric</Label>
                                                            <Select value={metric} onChange={e => setMetric(e.target.value)}>
                                                                <option value="rmse">RMSE</option>
                                                                <option value="mae">MAE</option>
                                                                <option value="auc">AUC</option>
                                                                <option value="binary_logloss">Binary Logloss</option>
                                                                <option value="multi_logloss">Multi Logloss</option>
                                                                <option value="ndcg">NDCG</option>
                                                                <option value="map">MAP</option>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Boosting Type</Label>
                                                            <Select value={boostingType} onChange={e => setBoostingType(e.target.value)}>
                                                                <option value="gbdt">GBDT</option>
                                                                <option value="dart">DART</option>
                                                                <option value="rf">Random Forest</option>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Learning Rate</Label>
                                                            <Input type="number" step="0.01" value={learningRate} onChange={e => setLearningRate(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Num Leaves</Label>
                                                            <Input type="number" value={numLeaves} onChange={e => setNumLeaves(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">N Estimators</Label>
                                                            <Input type="number" value={nEstimators} onChange={e => setNEstimators(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Max Depth (-1 for unlimited)</Label>
                                                            <Input type="number" value={maxDepth} onChange={e => setMaxDepth(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Min Child Samples</Label>
                                                            <Input type="number" value={minChildSamples} onChange={e => setMinChildSamples(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Feature Fraction (0-1)</Label>
                                                            <Input type="number" step="0.1" max="1" min="0" value={featureFraction} onChange={e => setFeatureFraction(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Bagging Fraction (0-1)</Label>
                                                            <Input type="number" step="0.1" max="1" min="0" value={baggingFraction} onChange={e => setBaggingFraction(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">Bagging Freq (0 to disable)</Label>
                                                            <Input type="number" value={baggingFreq} onChange={e => setBaggingFreq(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">L1 Regularization (Lambda L1)</Label>
                                                            <Input type="number" step="0.1" value={lambdaL1} onChange={e => setLambdaL1(e.target.value)} />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-slate-500">L2 Regularization (Lambda L2)</Label>
                                                            <Input type="number" step="0.1" value={lambdaL2} onChange={e => setLambdaL2(e.target.value)} />
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label>Additional Parameters (JSON)</Label>
                                    <Textarea
                                        value={paramsJson}
                                        onChange={e => setParamsJson(e.target.value)}
                                        className="font-mono text-xs h-[80px]"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {step === 2 && (
                        <DialogFooter>
                            {!initialConfig && <Button variant="outline" onClick={() => setStep(1)} className="mr-auto">Back</Button>}

                            <div className="flex gap-2">
                                <Button variant="outline" onClick={handlePreviewData} disabled={previewLoading}>
                                    {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />} Preview Data
                                </Button>
                                <Button onClick={handleSubmit} disabled={loading || (objective !== 'clustering' && !targetCol)} className="bg-blue-600 hover:bg-blue-700">
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Start Training
                                </Button>
                            </div>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Training Data Preview</DialogTitle>
                        <DialogDescription>
                            Preview of data features (X) and target (y) that will be fed into the model.
                            {(previewData?.shape_X || previewData?.shape_y) && (
                                <span className="block mt-1 font-mono text-xs">
                                    X: {previewData?.shape_X ? `(${previewData.shape_X[0]}, ${previewData.shape_X[1]})` : 'N/A'} |
                                    y: {previewData?.shape_y ? `(${previewData.shape_y[0]})` : 'N/A'}
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    {previewData && (
                        <div className="flex-1 overflow-auto border rounded mt-4">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-100 uppercase font-semibold sticky top-0">
                                    <tr>
                                        <th className="px-2 py-1">Row</th>
                                        {previewData.columns.map((col: string) => (
                                            <th key={col} className={`px-2 py-1 whitespace-nowrap border-l ${col === '__target__' ? 'bg-indigo-50 text-indigo-700' : ''}`}>
                                                {col === '__target__' ? 'Target (y)' : col}
                                                <span className="text-[10px] text-slate-400 block font-normal">{previewData.dtypes[col] || 'target'}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.data.map((row: any, i: number) => (
                                        <tr key={i} className="border-t hover:bg-slate-50">
                                            <td className="px-2 py-1 font-mono text-slate-400 border-r">{i}</td>
                                            {previewData.columns.map((col: string) => (
                                                <td key={col} className={`px-2 py-1 whitespace-nowrap border-r font-mono ${col === '__target__' ? 'bg-indigo-50 font-bold' : ''}`}>
                                                    {row[col] === null ? <span className="text-red-300">Null</span> : String(row[col])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
