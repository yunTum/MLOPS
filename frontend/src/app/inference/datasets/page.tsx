"use client"

import { useState, useEffect } from "react"
import api from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Wand2, Upload, Trash2, ArrowLeft, FileText, Check, Eye } from "lucide-react"
import Link from "next/link"
import { InferenceDatasetPreviewDialog } from "@/components/inference/InferenceDatasetPreviewDialog"

export default function InferenceDatasetsPage() {
    const [inferenceDatasets, setInferenceDatasets] = useState<any[]>([])
    const [featureSets, setFeatureSets] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Prep State
    const [selectedFeatureSetId, setSelectedFeatureSetId] = useState<string>("")
    const [prepFile, setPrepFile] = useState<File | null>(null)
    const [prepLoading, setPrepLoading] = useState(false)
    const [filterLatest, setFilterLatest] = useState(false)
    const [previewDataset, setPreviewDataset] = useState<any>(null)
    const [previewOpen, setPreviewOpen] = useState(false)

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const [dsRes, fsRes] = await Promise.all([
                api.get('/inference/datasets'),
                api.get('/features/sets')
            ])
            setInferenceDatasets(dsRes.data)
            setFeatureSets(fsRes.data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handlePrepFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setPrepFile(e.target.files[0])
        }
    }

    const handlePrepareData = async () => {
        if (!selectedFeatureSetId || !prepFile) return

        setPrepLoading(true)
        try {
            const formData = new FormData()
            formData.append('feature_set_id', selectedFeatureSetId)
            formData.append('filter_latest', String(filterLatest))
            formData.append('file', prepFile)

            const res = await api.post('/inference/prepare_data', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })

            alert(`Data processed and saved as "${res.data.name}"`)
            setPrepFile(null)
            fetchData() // Refresh list

        } catch (e: any) {
            console.error("Prep failed", e)
            alert(e.response?.data?.detail || "Data preparation failed.")
        } finally {
            setPrepLoading(false)
        }
    }

    const handleDeleteDataset = async (id: string) => {
        if (!confirm("Are you sure you want to delete this dataset?")) return
        try {
            await api.delete(`/inference/datasets/${id}`)
            fetchData()
        } catch (e) {
            console.error(e)
            alert("Failed to delete dataset")
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/inference">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Inference Datasets</h1>
                    <p className="text-slate-500">Manage prepared datasets for batch prediction.</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Left Column: Create New */}
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Wand2 className="h-5 w-5 text-purple-500" /> New Dataset
                        </CardTitle>
                        <CardDescription>
                            Upload raw CSV and process it using a Feature Set.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Template Feature Set</Label>
                            <Select onValueChange={setSelectedFeatureSetId} value={selectedFeatureSetId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Feature Set..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {featureSets.map(fs => (
                                        <SelectItem key={fs.id} value={fs.id.toString()}>
                                            {fs.version} {fs.name ? `(${fs.name})` : ""} - {fs.dataset_version?.dataset?.name || ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500">Transforms will match this feature set.</p>

                            {selectedFeatureSetId && (() => {
                                const selectedFS = featureSets.find(fs => fs.id.toString() === selectedFeatureSetId)
                                if (!selectedFS || !selectedFS.transformations || selectedFS.transformations.length === 0) return null

                                return (
                                    <div className="mt-2 text-xs border rounded bg-slate-50 p-2 max-h-[150px] overflow-y-auto">
                                        <div className="font-semibold text-slate-600 mb-1">Transformation Recipe:</div>
                                        <div className="space-y-1">
                                            {selectedFS.transformations.map((t: any, i: number) => (
                                                <div key={i} className="flex gap-2 items-start border-b border-dashed last:border-0 pb-1 last:pb-0">
                                                    <span className="text-slate-400 w-4 text-right shrink-0">{i + 1}.</span>
                                                    {t.op === 'auto_gen' ? (
                                                        <div className="flex flex-col gap-0.5 w-full">
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-purple-600 font-bold uppercase text-[10px]">AUTO GEN</span>
                                                                <span className="text-slate-600 font-semibold text-[10px]">({t.method})</span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 grid grid-cols-2 gap-1">
                                                                <div>Target: {t.target_column || "N/A"}</div>
                                                                <div>Src: {Array.isArray(t.source_columns) ? `${t.source_columns.length} cols` : "All"}</div>
                                                                <div>Var: {t.variance_threshold}</div>
                                                                <div>Corr: {t.correlation_threshold}</div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1 items-center">
                                                            <span className="text-blue-600 font-bold uppercase text-[10px]">{t.op}</span>
                                                            {t.col && <span className="text-slate-700">col={t.col}</span>}
                                                            <span className="text-slate-500">
                                                                {Object.entries(t)
                                                                    .filter(([k]) => !['op', 'col', 'id'].includes(k))
                                                                    .map(([k, v]) => `${k}=${String(v)}`)
                                                                    .join(', ')}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>

                        <div className="space-y-2">
                            <Label>Raw CSV Upload</Label>
                            <div className="flex items-center gap-2">
                                <label htmlFor="prep_upload" className="cursor-pointer flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-slate-50 transition-colors w-full justify-center">
                                    <Upload className="h-4 w-4 text-slate-500" />
                                    <span className="text-sm text-slate-700 truncate max-w-[150px]">{prepFile ? prepFile.name : "Choose CSV..."}</span>
                                    <input id="prep_upload" type="file" accept=".csv" className="hidden" onChange={handlePrepFileChange} />
                                </label>
                                {prepFile && <Check className="h-4 w-4 text-green-500" />}
                            </div>
                        </div>

                        {selectedFeatureSetId && (() => {
                            const selectedFS = featureSets.find(fs => fs.id.toString() === selectedFeatureSetId)
                            if (!selectedFS) return null
                            const hasLag = selectedFS.transformations?.some((t: any) => ['lag', 'diff', 'rolling'].includes(t.op))
                            if (!hasLag) return null

                            return (
                                <div className="flex items-start space-x-2 border border-blue-100 bg-blue-50 p-3 rounded-md">
                                    <Checkbox
                                        id="filterLatest"
                                        checked={filterLatest}
                                        onChange={(e) => setFilterLatest(e.target.checked)}
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label htmlFor="filterLatest" className="text-sm font-medium text-blue-900 cursor-pointer">
                                            Filter by Latest Date
                                        </Label>
                                        <p className="text-xs text-blue-700">
                                            Since this feature set uses time-series lags, checking this will filter the dataset to only include the most recent records (based on the sort column) after feature engineering.
                                        </p>
                                    </div>
                                </div>
                            )
                        })()}


                        <Button
                            className="w-full bg-purple-600 hover:bg-purple-700"
                            onClick={handlePrepareData}
                            disabled={prepLoading || !selectedFeatureSetId || !prepFile}
                        >
                            {prepLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Process & Save"}
                        </Button>
                    </CardContent>
                </Card>

                {/* Right Column: List */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Stored Datasets</CardTitle>
                        <CardDescription>Ready for prediction.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div> : (
                            <div className="rounded-md border overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-100 font-medium text-slate-600">
                                        <tr>
                                            <th className="p-3">Name</th>
                                            <th className="p-3">Feature Set</th>
                                            <th className="p-3">Created</th>
                                            <th className="p-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {inferenceDatasets.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="p-4 text-center text-slate-500">No datasets found.</td>
                                            </tr>
                                        )}
                                        {inferenceDatasets.map((ds) => (
                                            <tr key={ds.id} className="hover:bg-slate-50">
                                                <td className="p-3 font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="h-4 w-4 text-slate-400" />
                                                        <span>{ds.name}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    {ds.feature_set ? (
                                                        <div className="text-sm">
                                                            <div className="font-medium text-slate-700">
                                                                {ds.feature_set.version || "v?"} {ds.feature_set.name ? `(${ds.feature_set.name})` : ""}
                                                            </div>
                                                            <div className="text-xs text-slate-500">
                                                                {ds.feature_set.dataset_version?.dataset?.name || "Unknown Dataset"}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 italic">No linked feature set</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-slate-500 text-xs">
                                                    {ds.created_at ? new Date(ds.created_at).toLocaleString() : "-"}
                                                </td>
                                                <td className="p-3 text-right flex justify-end gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => { setPreviewDataset(ds); setPreviewOpen(true); }} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50">
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteDataset(ds.id.toString())} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <InferenceDatasetPreviewDialog
                open={previewOpen}
                onOpenChange={setPreviewOpen}
                dataset={previewDataset}
            />
        </div>
    )
}
