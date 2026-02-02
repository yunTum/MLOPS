import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BrainCircuit, Play, RefreshCw, Info, List, Settings, Trash } from "lucide-react"

interface ModelCardProps {
    model: any
    onPredict: (model: any) => void
    onRetrain: (model: any) => void
    onDelete: (model: any) => void
}

export function ModelCard({ model, onPredict, onRetrain, onDelete }: ModelCardProps) {
    const router = useRouter()
    const metrics = model.metrics || {}
    const metricKeys = Object.keys(metrics)
    const params = model.parameters || {}
    const features = model.feature_names || []

    return (
        <Card className="hover:border-blue-400 transition-all">
            <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <BrainCircuit className="h-4 w-4 text-blue-500" />
                            {model.name}
                        </CardTitle>
                        <p className="text-xs text-slate-500 mt-1 ml-6">Run ID: {model.mlflow_run_id}</p>
                    </div>
                    <Badge variant={model.stage === 'prod' ? 'default' : 'secondary'}>
                        {model.stage}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-sm text-slate-600 mb-4 ml-6 space-y-2">
                    <p>Feature Set: <span className="font-semibold">{model.feature_set ? `${model.feature_set.name} (${model.feature_set.version})` : `#${model.feature_set_id}`}</span></p>
                    {model.target_column && <p>Target: <span className="font-semibold">{model.target_column}</span></p>}

                    <div className="flex gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><List className="h-3 w-3" /> {features.length} Features</span>
                        <span className="flex items-center gap-1"><Settings className="h-3 w-3" /> {Object.keys(params).length} Params</span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                        {metricKeys.slice(0, 4).map(k => (
                            <div key={k} className="bg-slate-50 p-2 rounded border">
                                <span className="text-xs text-slate-400 block uppercase">{k}</span>
                                <span className="font-mono font-bold text-blue-600">{Number(metrics[k]).toFixed(4)}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" title="View Details" onClick={() => router.push(`/models/${model.id}`)}>
                        <Info className="h-4 w-4 text-slate-500" />
                    </Button>

                    <Button size="sm" variant="destructive" onClick={() => {
                        if (confirm(`Are you sure you want to delete model "${model.name}"? This cannot be undone.`)) {
                            onDelete(model)
                        }
                    }} title="Delete Model">
                        <Trash className="mr-2 h-4 w-4" /> Delete
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onRetrain(model)} title="Edit Config & Retrain">
                        <RefreshCw className="mr-2 h-4 w-4" /> Retrain
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onPredict(model)} title="Predict">
                        <Play className="mr-2 h-4 w-4" /> Predict
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

