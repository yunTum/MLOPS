"use client"

import { useEffect, useState } from "react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Plus, Loader2, Bot } from "lucide-react"
import { ModelCard } from "@/components/models/ModelCard"
import { TrainModelDialog } from "@/components/models/TrainModelDialog"

export default function ModelsPage() {
    const [models, setModels] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isTrainOpen, setIsTrainOpen] = useState(false)
    const [initialConfig, setInitialConfig] = useState<any>(null)

    useEffect(() => {
        fetchModels()
    }, [])

    const fetchModels = async () => {
        try {
            const res = await api.get('/models/')
            setModels(res.data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handlePredict = (model: any) => {
        // Todo: Navigate to inference page or open predict dialog
        alert(`Predicting with ${model.name} (Not implemented yet check /inference)`)
    }

    const handleRetrain = (model: any) => {
        setInitialConfig(model)
        setIsTrainOpen(true)
    }

    const handleNewTraining = () => {
        setInitialConfig(null)
        setIsTrainOpen(true)
    }

    const handleDelete = async (model: any) => {
        try {
            await api.delete(`/models/${model.id}`)
            fetchModels()
        } catch (e) {
            console.error(e)
            alert("Failed to delete model")
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Model Registry</h1>
                    <p className="text-slate-500">Train and manage machine learning models.</p>
                </div>
                <Button onClick={handleNewTraining} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="mr-2 h-4 w-4" /> Train New Model
                </Button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {models.map((m: any) => (
                        <ModelCard
                            key={m.id}
                            model={m}
                            onPredict={handlePredict}
                            onRetrain={handleRetrain}
                            onDelete={handleDelete}
                        />
                    ))}
                    {models.length === 0 && (
                        <div className="col-span-3 text-center py-12 border-2 border-dashed rounded-lg border-slate-200">
                            <Bot className="mx-auto h-12 w-12 text-slate-300" />
                            <h3 className="mt-2 text-sm font-semibold text-slate-900">No Models</h3>
                            <p className="mt-1 text-sm text-slate-500">Train your first model to see it here.</p>
                        </div>
                    )}
                </div>
            )}

            <TrainModelDialog
                open={isTrainOpen}
                onOpenChange={setIsTrainOpen}
                initialConfig={initialConfig}
                onSuccess={() => {
                    fetchModels()
                    // Optional: Toast success
                }}
            />
        </div>
    )
}
