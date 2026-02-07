"use client"

import { useEffect, useState } from "react"
import api from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input, Label } from "@/components/ui/input"
import { Select } from "@/components/ui/select-native"
import { Plus, Upload, Loader2, Database, Table as TableIcon, Wand2, Trash2, Search, CheckSquare } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

export default function DatasetsPage() {
    const [datasets, setDatasets] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [isUploadOpen, setIsUploadOpen] = useState(false)
    const [isSchemaOpen, setIsSchemaOpen] = useState(false)
    const [selectedDataset, setSelectedDataset] = useState<any>(null)

    // Form states
    const [newName, setNewName] = useState("")
    const [newDesc, setNewDesc] = useState("")
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Schema Editor States
    const [versions, setVersions] = useState<any[]>([])
    const [selectedVersionId, setSelectedVersionId] = useState("")
    const [schema, setSchema] = useState<Record<string, string>>({})
    const [loadingSchema, setLoadingSchema] = useState(false)
    const [previewData, setPreviewData] = useState<Record<string, any[]>>({})

    // Bulk Edit States
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set())
    const [bulkType, setBulkType] = useState("string")

    useEffect(() => {
        fetchDatasets()
    }, [])

    const fetchDatasets = async () => {
        try {
            const res = await api.get('/datasets')
            setDatasets(res.data)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async () => {
        if (!newName) return
        setIsSubmitting(true)
        try {
            await api.post('/datasets', { name: newName, description: newDesc })
            setIsCreateOpen(false)
            setNewName("")
            setNewDesc("")
            fetchDatasets()
        } catch (e) {
            console.error(e)
            alert("Failed to create dataset")
        } finally {
            setIsSubmitting(false)
        }
    }

    const startUpload = (dataset: any) => {
        setSelectedDataset(dataset)
        setIsUploadOpen(true)
    }

    const handleUpload = async () => {
        if (!uploadFile || !selectedDataset) return
        setIsSubmitting(true)
        const formData = new FormData()
        formData.append("file", uploadFile)

        try {
            await api.post(`/datasets/${selectedDataset.id}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            setIsUploadOpen(false)
            setUploadFile(null)
            alert("Upload successful!")
        } catch (e) {
            console.error(e)
            alert("Failed to upload file")
        } finally {
            setIsSubmitting(false)
        }
    }

    const fetchVersions = async (dataset: any) => {
        try {
            const res = await api.get(`/datasets/${dataset.id}/versions`)
            setVersions(res.data)
            return res.data
        } catch (e) {
            console.error(e)
            return []
        }
    }

    const openSchemaEditor = async (dataset: any) => {
        setSelectedDataset(dataset)
        setIsSchemaOpen(true)
        setVersions([])
        setSelectedVersionId("")
        setSchema({})

        const vs = await fetchVersions(dataset)
        if (vs.length > 0) {
            const latest = vs[0]
            setSelectedVersionId(latest.id.toString())
        }
    }

    const fetchPreview = async (vId: string) => {
        if (!selectedDataset) return
        try {
            const res = await api.get(`/datasets/${selectedDataset.id}/versions/${vId}/preview`)
            setPreviewData(res.data)
        } catch (e) { console.error("Preview fetch failed", e) }
    }

    useEffect(() => {
        if (selectedVersionId && versions.length > 0) {
            const v = versions.find(v => v.id.toString() === selectedVersionId)
            if (v && v.schema_info) {
                // Normalize schema info values to simple types if needed
                const mapped: Record<string, string> = {}
                Object.entries(v.schema_info).forEach(([k, val]) => {
                    const typeStr = String(val).toLowerCase()
                    if (typeStr.includes('int')) mapped[k] = 'int'
                    else if (typeStr.includes('float')) mapped[k] = 'float'
                    else if (typeStr.includes('date') || typeStr.includes('time')) mapped[k] = 'datetime'
                    else mapped[k] = 'string'
                })
                setSchema(mapped)
                fetchPreview(selectedVersionId)
            }
        } else {
            setSchema({})
            setPreviewData({})
        }
    }, [selectedVersionId, versions])

    const handleAutoDetect = async () => {
        if (!selectedDataset || !selectedVersionId) return
        setLoadingSchema(true)
        try {
            const res = await api.get(`/datasets/${selectedDataset.id}/versions/${selectedVersionId}/detect_schema`)
            setSchema(res.data)
        } catch (e) {
            alert("Detection failed")
            console.error(e)
        } finally {
            setLoadingSchema(false)
        }
    }

    const handleUpdateSchema = async () => {
        if (!selectedDataset || !selectedVersionId) return
        setIsSubmitting(true)
        try {
            await api.post(`/datasets/${selectedDataset.id}/versions/${selectedVersionId}/schema`, {
                schema_map: schema
            })
            alert("Schema updated! Created new version.")
            // Refresh versions
            const vs = await fetchVersions(selectedDataset)
            if (vs.length > 0) setSelectedVersionId(vs[0].id.toString())
        } catch (e) {
            alert("Update failed")
            console.error(e)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDeleteVersion = async () => {
        if (!selectedVersionId || !selectedDataset) return
        if (!confirm("Are you sure you want to delete this version?")) return
        setIsSubmitting(true)
        try {
            await api.delete(`/datasets/versions/${selectedVersionId}`)
            const vs = await fetchVersions(selectedDataset)
            if (vs.length > 0) setSelectedVersionId(vs[0].id.toString())
            else setSelectedVersionId("")
        } catch (e: any) {
            alert("Failed to delete version. It might be in use by feature sets.")
            console.error(e)
        } finally {
            setIsSubmitting(false)
        }
    }

    const updateColType = (col: string, type: string) => {
        setSchema(prev => ({ ...prev, [col]: type }))
    }

    // --- Bulk Edit Logic ---

    // Filter columns based on search
    const filteredSchema = Object.entries(schema).filter(([col]) =>
        col.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const toggleSelection = (col: string) => {
        const newSet = new Set(selectedColumns)
        if (newSet.has(col)) {
            newSet.delete(col)
        } else {
            newSet.add(col)
        }
        setSelectedColumns(newSet)
    }

    const toggleAll = () => {
        if (selectedColumns.size === filteredSchema.length) {
            setSelectedColumns(new Set())
        } else {
            const newSet = new Set(filteredSchema.map(([col]) => col))
            setSelectedColumns(newSet)
        }
    }

    const handleBulkUpdate = () => {
        if (selectedColumns.size === 0) return
        setSchema(prev => {
            const next = { ...prev }
            selectedColumns.forEach(col => {
                next[col] = bulkType
            })
            return next
        })
        setSelectedColumns(new Set()) // Clear selection after apply
        alert(`Updated ${selectedColumns.size} columns to ${bulkType}`)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Datasets</h1>
                    <p className="text-slate-500">Manage your raw data sources.</p>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="mr-2 h-4 w-4" /> Create Dataset
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {datasets.map((d: any) => (
                        <Card key={d.id} className="hover:border-purple-300 transition-all group">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Database className="h-4 w-4 text-purple-400" /> {d.name}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-slate-500 mb-4 h-10 line-clamp-2">{d.description || "No description"}</p>
                                <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-2">
                                    <span className="text-xs text-slate-400">ID: {d.id}</span>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => openSchemaEditor(d)}>
                                            <TableIcon className="mr-2 h-3 w-3" /> Schema
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => startUpload(d)}>
                                            <Upload className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {datasets.length === 0 && (
                        <div className="col-span-3 text-center py-12 border-2 border-dashed rounded-lg border-slate-200">
                            <Database className="mx-auto h-12 w-12 text-slate-300" />
                            <h3 className="mt-2 text-sm font-semibold text-slate-900">No datasets</h3>
                            <p className="mt-1 text-sm text-slate-500">Get started by creating a new dataset.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Create Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Dataset</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input placeholder="e.g. churn_prediction" value={newName} onChange={e => setNewName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Input placeholder="Dataset purpose..." value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                        </div>
                        <Button className="w-full bg-purple-600" onClick={handleCreate} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Dataset
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Upload Dialog */}
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Upload Version to {selectedDataset?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>CSV or Parquet File</Label>
                            <Input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                        </div>
                        <Button className="w-full bg-purple-600" onClick={handleUpload} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Upload
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Schema Editor Dialog */}
            <Dialog open={isSchemaOpen} onOpenChange={setIsSchemaOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Schema Editor - {selectedDataset?.name}</DialogTitle>
                        <DialogDescription>Review and modify column types. Creates a new version on save.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4 flex-1 flex flex-col overflow-hidden">
                        <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border">
                                <div className="flex items-center gap-2">
                                    <Label>Version:</Label>
                                    <Select value={selectedVersionId} onChange={e => setSelectedVersionId(e.target.value)} className="w-48 h-9 text-sm">
                                        {versions.map(v => <option key={v.id} value={v.id}>{v.version}</option>)}
                                    </Select>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" className="text-red-500 hover:bg-red-50" onClick={handleDeleteVersion} disabled={isSubmitting || !selectedVersionId}>
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete Version
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={handleAutoDetect} disabled={loadingSchema}>
                                        {loadingSchema ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                        Auto Detect Types
                                    </Button>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Search className="h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Filter columns..."
                                    className="max-w-xs h-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {selectedColumns.size > 0 && (
                                    <div className="flex items-center gap-2 ml-auto bg-purple-50 px-3 py-1 rounded-md border border-purple-100 animate-in fade-in slide-in-from-top-1">
                                        <span className="text-xs font-medium text-purple-700">{selectedColumns.size} selected</span>
                                        <div className="h-4 w-[1px] bg-purple-200 mx-2" />
                                        <Select value={bulkType} onChange={e => setBulkType(e.target.value)} className="h-8 w-32 text-xs">
                                            <option value="string">String</option>
                                            <option value="int">Integer</option>
                                            <option value="float">Float</option>
                                            <option value="datetime">Datetime</option>
                                        </Select>
                                        <Button size="sm" className="h-8 bg-purple-600 hover:bg-purple-700" onClick={handleBulkUpdate}>
                                            Apply
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="border rounded-md flex-1 overflow-y-auto mt-2">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-600 font-medium sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 w-10">
                                            <Checkbox
                                                checked={selectedColumns.size > 0 && selectedColumns.size === filteredSchema.length}
                                                onCheckedChange={toggleAll}
                                            />
                                        </th>
                                        <th className="p-3 w-1/3">Column Name</th>
                                        <th className="p-3 w-1/3">Data Type</th>
                                        <th className="p-3 w-1/3">Example Values (Top 5)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredSchema.map(([col, type]) => (
                                        <tr key={col} className={selectedColumns.has(col) ? "bg-purple-50/50 hover:bg-purple-50" : "hover:bg-slate-50"}>
                                            <td className="p-2 px-3">
                                                <Checkbox
                                                    checked={selectedColumns.has(col)}
                                                    onCheckedChange={() => toggleSelection(col)}
                                                />
                                            </td>
                                            <td className="p-2 px-3 font-medium text-slate-700">{col}</td>
                                            <td className="p-2 px-3">
                                                <Select value={type} onChange={e => updateColType(col, e.target.value)} className="h-9 w-full max-w-xs">
                                                    <option value="string">String (Object)</option>
                                                    <option value="int">Integer</option>
                                                    <option value="float">Float (Decimal)</option>
                                                    <option value="datetime">Datetime</option>
                                                </Select>
                                            </td>
                                            <td className="p-2 px-3 text-xs text-slate-500 truncate max-w-[200px]" title={previewData[col]?.join(", ")}>
                                                {previewData[col] ? previewData[col].join(", ") : "-"}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredSchema.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-slate-400">No columns found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <Button className="w-full bg-purple-600" onClick={handleUpdateSchema} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Actions (Create New Version)
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
