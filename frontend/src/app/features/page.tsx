"use client"

import { useEffect, useState } from "react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Plus, Loader2 } from "lucide-react"
import { FeatureSetCard } from "@/components/features/FeatureSetCard"
import { FeatureWorkflowDialog } from "@/components/features/FeatureWorkflowDialog"
import { FeatureAnalysisDialog } from "@/components/features/FeatureAnalysisDialog"
import { NewFeatureProjectDialog } from "@/components/features/NewFeatureProjectDialog"

export default function FeaturesPage() {
    const [featureSets, setFeatureSets] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isCreateOpen, setIsCreateOpen] = useState(false) // For Workflow Dialog (Edit/Builder)
    const [isNewProjectOpen, setIsNewProjectOpen] = useState(false) // For New Project Dialog

    // Analyze State
    const [analyzeFs, setAnalyzeFs] = useState<any | null>(null)
    const [isAnalyzeOpen, setIsAnalyzeOpen] = useState(false)

    // Edit State (Active Feature Set for Workflow)
    const [editFs, setEditFs] = useState<any | null>(null)

    useEffect(() => {
        fetchFeatureSets()
    }, [])

    const fetchFeatureSets = async () => {
        setLoading(true)
        try {
            const res = await api.get('/features/sets')
            setFeatureSets(res.data)
        } catch (e) { console.error(e) } finally { setLoading(false) }
    }

    const handleAnalyze = (fs: any) => {
        setAnalyzeFs(fs)
        setIsAnalyzeOpen(true)
    }

    // Opens the Workflow Dialog (Builder)
    const handleEdit = (fs: any) => {
        setEditFs(fs)
        setIsCreateOpen(true)
    }

    // Opens the New Project Dialog
    const handleCreateProject = () => {
        setIsNewProjectOpen(true)
    }

    // Customize Delete
    const handleDelete = async (fs: any) => {
        // Use name if available, else standard fallback
        const name = fs.name || fs.version || `#${fs.id}`
        if (!confirm(`Are you sure you want to delete feature set "${name}"?`)) return
        try {
            await api.delete(`/features/sets/${fs.id}`)
            fetchFeatureSets()
        } catch (e) { alert("Failed to delete feature set"); console.error(e) }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Feature Engineering</h1>
                    <p className="text-slate-500">Transform, Generate, and Analyze features.</p>
                </div>
                <Button onClick={handleCreateProject} className="bg-purple-600 hover:bg-purple-700">
                    <Plus className="mr-2 h-4 w-4" /> New Feature Project
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {featureSets.map((fs: any) => (
                        <FeatureSetCard
                            key={fs.id}
                            featureSet={fs}
                            onEdit={handleEdit}
                            onAnalyze={handleAnalyze}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            <FeatureAnalysisDialog
                open={isAnalyzeOpen}
                onOpenChange={setIsAnalyzeOpen}
                featureSet={analyzeFs}
            />



            <FeatureWorkflowDialog
                open={isCreateOpen}
                onOpenChange={(open) => {
                    setIsCreateOpen(open)
                    if (!open) setEditFs(null)
                }}
                editFeatureSet={editFs}
                onSuccess={fetchFeatureSets}
            />

            <NewFeatureProjectDialog
                open={isNewProjectOpen}
                onOpenChange={setIsNewProjectOpen}
                onSuccess={fetchFeatureSets}
            />
        </div>
    )
}
