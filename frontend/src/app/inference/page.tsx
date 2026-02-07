"use client"

import { useState, useEffect } from "react"
import api from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, BrainCircuit, FileText, Download, Wand2, Trash2, Columns, ArrowUp, ArrowDown, ArrowUpDown, Play } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import Link from "next/link"
import { ClusterDistributionChart } from "@/components/inference/ClusterDistributionChart"

export default function InferencePage() {
    const [models, setModels] = useState<any[]>([])
    const [featureSets, setFeatureSets] = useState<any[]>([])
    const [selectedModel, setSelectedModel] = useState<any>(null)
    const [selectedFeatureSet, setSelectedFeatureSet] = useState<any>(null)

    // Prediction State
    const [inferenceDatasets, setInferenceDatasets] = useState<any[]>([])
    const [selectedInferenceDatasetId, setSelectedInferenceDatasetId] = useState<string>("")
    const [results, setResults] = useState<any[] | null>(null)
    const [predictLoading, setPredictLoading] = useState(false)

    // Preview State
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewData, setPreviewData] = useState<any>(null)
    const [previewDialogOpen, setPreviewDialogOpen] = useState(false)

    const [loadingData, setLoadingData] = useState(true)

    // Result Display State
    const [visibleColumns, setVisibleColumns] = useState<string[]>([])
    const [colDialogOpen, setColDialogOpen] = useState(false)
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [modelsRes, fsRes, dsRes] = await Promise.all([
                    api.get('/models'),
                    api.get('/features/sets'),
                    api.get('/inference/datasets')
                ])
                setModels(modelsRes.data)
                setFeatureSets(fsRes.data)
                setInferenceDatasets(dsRes.data)
                setError(null)
            } catch (err: any) {
                console.error("Failed to fetch data", err)
                setError(err.message || "Failed to load data")
            } finally {
                setLoadingData(false)
            }
        }
        fetchData()
    }, [])

    const handleModelSelect = (modelId: string) => {
        const model = models.find(m => m.id.toString() === modelId)
        setSelectedModel(model)
        setResults(null)
        setSelectedInferenceDatasetId("")
    }

    const handleBatchPredict = async () => {
        if (!selectedModel || !selectedInferenceDatasetId) return

        setPredictLoading(true)
        setResults(null)
        try {
            const formData = new FormData()
            formData.append('model_id', selectedModel.id)
            formData.append('inference_dataset_id', selectedInferenceDatasetId)

            const res = await api.post('/inference/batch_predict', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            setResults(res.data)
            if (res.data && res.data.length > 0) {
                setVisibleColumns(Object.keys(res.data[0]))
            }
        } catch (e: any) {
            console.error(e)
            alert(e.response?.data?.detail || "Batch prediction failed.")
        } finally {
            setPredictLoading(false)
        }
    }

    const handlePreviewInput = async () => {
        if (!selectedModel || !selectedInferenceDatasetId) return

        setPreviewLoading(true)
        setPreviewData(null)
        try {
            const formData = new FormData()
            formData.append('model_id', selectedModel.id)
            formData.append('inference_dataset_id', selectedInferenceDatasetId)

            const res = await api.post('/inference/preview_input', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            setPreviewData(res.data)
            setPreviewDialogOpen(true)
        } catch (e: any) {
            console.error(e)
            alert(e.response?.data?.detail || "Preview failed.")
        } finally {
            setPreviewLoading(false)
        }
    }

    const downloadResults = () => {
        if (!results || results.length === 0) return
        const headers = Object.keys(results[0])
        const csvContent = [
            headers.join(','),
            ...results.map(row => headers.map(header => row[header]).join(','))
        ].join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `predictions_${selectedModel.name}_${new Date().toISOString()}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleDeleteDataset = async () => {
        if (!selectedInferenceDatasetId) return
        if (!confirm("Are you sure you want to delete this dataset?")) return
        try {
            await api.delete(`/inference/datasets/${selectedInferenceDatasetId}`)
            const dsRes = await api.get('/inference/datasets')
            setInferenceDatasets(dsRes.data)
            setSelectedInferenceDatasetId("")
        } catch (e) {
            console.error(e)
            alert("Failed to delete dataset")
        }
    }

    const sortedResults = results ? [...results].sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;
        const valA = a[key] ?? "";
        const valB = b[key] ?? "";
        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
            return direction === 'asc' ? numA - numB : numB - numA;
        }
        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        if (strA < strB) return direction === 'asc' ? -1 : 1;
        if (strA > strB) return direction === 'asc' ? 1 : -1;
        return 0;
    }) : []

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                return current.direction === 'asc' ? { key, direction: 'desc' } : null;
            }
            return { key, direction: 'asc' };
        });
    }

    const compatibleDatasets = selectedModel
        ? inferenceDatasets.filter(d => d.feature_set_id === selectedModel.feature_set_id)
        : []

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Inference</h1>
                    <p className="text-slate-500">Batch prediction dashboard.</p>
                </div>
                <Link href="/inference/datasets">
                    <Button variant="outline">
                        <Wand2 className="mr-2 h-4 w-4" /> Manage Datasets
                    </Button>
                </Link>
            </div>

            {
                error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                    </div>
                )
            }

            {/* Analysis Charts for Clustering */}
            {
                results && selectedModel?.parameters?.objective === 'clustering' && (
                    <ClusterDistributionChart data={results} predictionCol="prediction" />
                )
            }

            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-1 space-y-6">
                    {/* Model Selection Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BrainCircuit className="h-5 w-5 text-blue-500" /> Model
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {loadingData ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <div className="space-y-2">
                                    <Select onValueChange={handleModelSelect}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a model...">
                                                {selectedModel ? selectedModel.name : "Select a model..."}
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {models.map(m => (
                                                <SelectItem key={m.id} value={m.id.toString()}>
                                                    {m.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {selectedModel && (
                                <div className="bg-slate-50 p-4 rounded text-sm text-slate-600 space-y-1">
                                    <p><strong>Target:</strong> {selectedModel.target_column}</p>
                                    <p><strong>Run ID:</strong> {selectedModel.mlflow_run_id}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {selectedModel && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-blue-500" /> Data
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Select onValueChange={setSelectedInferenceDatasetId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select Dataset...">
                                                {selectedInferenceDatasetId
                                                    ? (() => {
                                                        const d = inferenceDatasets.find(ds => ds.id.toString() === selectedInferenceDatasetId)
                                                        if (!d) return "Select Dataset..."
                                                        return (
                                                            <span>
                                                                {d.name} {d.feature_set ? <span className="text-slate-500 ml-2 text-xs">FS: {d.feature_set.version} ({d.feature_set.name})</span> : ""}
                                                            </span>
                                                        )
                                                    })()
                                                    : "Select Dataset..."
                                                }
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {compatibleDatasets.length === 0 && (
                                                <div className="p-2 text-xs text-slate-500 text-center">
                                                    No compatible datasets found.<br />
                                                    (Must match Feature Set: {selectedModel.feature_set?.name || selectedModel.feature_set_id})
                                                </div>
                                            )}
                                            {compatibleDatasets.map(d => (
                                                <SelectItem key={d.id} value={d.id.toString()}>
                                                    {d.name} <span className="text-slate-400 text-xs ml-2">({new Date(d.created_at).toLocaleDateString()})</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {selectedInferenceDatasetId && (
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs text-slate-500">
                                                {inferenceDatasets.find(d => d.id.toString() === selectedInferenceDatasetId)?.created_at}
                                            </p>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={handleDeleteDataset}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                                        onClick={handleBatchPredict}
                                        disabled={predictLoading || !selectedInferenceDatasetId}
                                    >
                                        {predictLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                        Run Prediction
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={handlePreviewInput}
                                        disabled={previewLoading || !selectedInferenceDatasetId}
                                        title="Preview Model Input"
                                    >
                                        {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Columns className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="md:col-span-2">
                    <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                            <DialogHeader>
                                <DialogTitle>Model Input Preview</DialogTitle>
                                <DialogDescription>
                                    Exact data passed to model (after transformations & encoding).
                                    Shape: {previewData?.shape ? `(${previewData.shape[0]} rows, ${previewData.shape[1]} cols)` : 'N/A'}
                                </DialogDescription>
                            </DialogHeader>
                            {previewData && (
                                <div className="flex-1 overflow-auto border rounded mt-4">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-100 uppercase font-semibold sticky top-0">
                                            <tr>
                                                <th className="px-2 py-1">Row</th>
                                                {previewData.columns.map((col: string) => (
                                                    <th key={col} className="px-2 py-1 whitespace-nowrap border-l">{col} <span className="text-[10px] text-slate-400 block font-normal">{previewData.dtypes[col]}</span></th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewData.data.map((row: any, i: number) => (
                                                <tr key={i} className="border-t hover:bg-slate-50">
                                                    <td className="px-2 py-1 font-mono text-slate-400 border-r">{i}</td>
                                                    {previewData.columns.map((col: string) => (
                                                        <td key={col} className="px-2 py-1 whitespace-nowrap border-r font-mono">
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

                    {results && (
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Results</CardTitle>
                                    <CardDescription>Showing {results.length} rows</CardDescription>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => setColDialogOpen(true)}>
                                        <Columns className="mr-2 h-4 w-4" /> Columns
                                    </Button>
                                    <Button variant="outline" onClick={downloadResults}>
                                        <Download className="mr-2 h-4 w-4" /> CSV
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border overflow-x-auto max-h-[600px]">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-100 uppercase text-xs font-semibold text-slate-600 sticky top-0 z-10 shadow-sm">
                                            <tr>
                                                {visibleColumns.map((header) => (
                                                    <th
                                                        key={header}
                                                        className="px-4 py-3 whitespace-nowrap bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                                                        onClick={() => handleSort(header)}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span>{header}</span>
                                                            {sortConfig?.key === header ? (
                                                                sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                                            ) : (
                                                                <ArrowUpDown className="h-3 w-3 opacity-30" />
                                                            )}
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedResults.map((row, i) => (
                                                <tr key={i} className="border-t hover:bg-slate-50">
                                                    {visibleColumns.map((header) => (
                                                        <td key={`${i}-${header}`} className="px-4 py-2 whitespace-nowrap">
                                                            {typeof row[header] === 'number'
                                                                ? (header === 'prediction' ? <span className="font-bold text-blue-600">{row[header].toFixed(4)}</span> : row[header])
                                                                : row[header]}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>

                            <Dialog open={colDialogOpen} onOpenChange={setColDialogOpen}>
                                <DialogContent className="max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>Customize Columns</DialogTitle>
                                        <DialogDescription>Select columns to display.</DialogDescription>
                                    </DialogHeader>
                                    <div className="grid grid-cols-2 gap-2 mt-4 max-h-[300px] overflow-y-auto">
                                        {results.length > 0 && Object.keys(results[0]).map(col => (
                                            <div key={col} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`col-${col}`}
                                                    checked={visibleColumns.includes(col)}
                                                    onChange={(e: any) => {
                                                        const checked = e.target.checked
                                                        if (checked) setVisibleColumns([...visibleColumns, col])
                                                        else setVisibleColumns(visibleColumns.filter(c => c !== col))
                                                    }}
                                                />
                                                <label
                                                    htmlFor={`col-${col}`}
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                                >
                                                    {col}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-end gap-2 mt-4">
                                        <Button variant="outline" size="sm" onClick={() => setVisibleColumns(Object.keys(results[0] || {}))}>All</Button>
                                        <Button variant="outline" size="sm" onClick={() => setVisibleColumns([])}>None</Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </Card>
                    )}

                    {!results && (
                        <div className="flex h-full items-center justify-center border-2 border-dashed rounded-lg p-12 text-slate-300">
                            <div className="text-center">
                                <Play className="mx-auto h-12 w-12 mb-4 opacity-50" />
                                <p className="text-lg">Select a Model and Data to run prediction</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div >
    )
}
