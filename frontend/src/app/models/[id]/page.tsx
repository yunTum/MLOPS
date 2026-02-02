"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BrainCircuit, ArrowLeft, Trash, RefreshCw, Activity, BarChart as BarChartIcon, ScatterChart as ScatterChartIcon, Info, List, Settings, ScanLine, ImageIcon } from "lucide-react"
import { FeatureImportanceChart } from "@/components/models/charts/FeatureImportanceChart"
import { LearningCurveChart } from "@/components/models/charts/LearningCurveChart"
import { ActualVsPredictedChart } from "@/components/models/charts/ActualVsPredictedChart"
import { CorrelationMatrixChart } from "@/components/models/charts/CorrelationMatrixChart"
import { TrainModelDialog } from "@/components/models/TrainModelDialog"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"

export default function ModelDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string

    const [model, setModel] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [isRetrainOpen, setIsRetrainOpen] = useState(false)
    const [zoomImage, setZoomImage] = useState<string | null>(null)

    useEffect(() => {
        if (id) fetchModel()
    }, [id])

    const fetchModel = async () => {
        try {
            const res = await api.get(`/models/${id}`)
            setModel(res.data)
        } catch (e) {
            console.error(e)
            alert("Failed to load model details")
            router.push('/models')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm(`Are you sure you want to delete model "${model.name}"?`)) return
        try {
            await api.delete(`/models/${id}`)
            router.push('/models')
        } catch (e) {
            console.error(e)
            alert("Failed to delete model")
        }
    }

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-slate-400" /></div>
    if (!model) return null

    const metrics = model.metrics || {}
    const metricKeys = Object.keys(metrics)
    const modelParams = model.parameters || {}
    const features = model.feature_names || []
    const objective = modelParams.objective || 'regression'
    const isRegression = objective.includes('regression') || objective.includes('rmse') || objective.includes('mse')

    const isClustering = objective === 'clustering'

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'
    const getPlotUrl = (type: string) => `${API_URL}/models/${model.id}/plots/${type}`
    const getPlotDataUrl = (type: string) => `${API_URL}/models/${model.id}/plots/${type}.json`

    const PlotImage = ({ type, title, icon: Icon, alt, unavailableMessage }: any) => (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Icon className="h-4 w-4" /> {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div
                    className="border rounded bg-slate-50 min-h-[400px] flex items-center justify-center overflow-hidden relative group cursor-zoom-in transition-colors hover:bg-slate-100"
                    onClick={(e) => {
                        const img = e.currentTarget.querySelector('img');
                        if (img && img.style.display !== 'none') {
                            setZoomImage(img.src);
                        }
                    }}
                    title="Click to zoom"
                >
                    <img
                        src={getPlotUrl(type)}
                        alt={alt}
                        className="w-full h-full object-contain max-h-[400px]"
                        onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = `<div class="text-slate-400 text-sm text-center p-4">${unavailableMessage || 'Not Available'}</div>` }}
                    />
                </div>
            </CardContent>
        </Card>
    )

    return (
        <div className="container mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/models')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <BrainCircuit className="h-6 w-6 text-blue-600" />
                            {model.name}
                        </h1>
                        <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                            <Badge variant={model.stage === 'prod' ? 'default' : 'secondary'}>{model.stage}</Badge>
                            <span>Run ID: {model.mlflow_run_id}</span>
                            <span>•</span>
                            <span>{new Date(model.created_at).toLocaleString()}</span>
                            {isClustering && <Badge variant="outline">Clustering</Badge>}
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsRetrainOpen(true)}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Retrain
                    </Button>
                    <Button variant="destructive" onClick={handleDelete}>
                        <Trash className="mr-2 h-4 w-4" /> Delete
                    </Button>
                </div>
            </div>

            {/* ContentTabs */}
            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList className="bg-white border w-full justify-start h-12 p-1">
                    <TabsTrigger value="overview" className="px-6">Overview</TabsTrigger>
                    <TabsTrigger value="metrics" className="px-6">Metrics</TabsTrigger>
                    <TabsTrigger value="charts" className="px-6">Visualizations</TabsTrigger>
                    <TabsTrigger value="inference" className="px-6">Inference</TabsTrigger>
                </TabsList>

                {/* OVERVIEW */}
                <TabsContent value="overview" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="md:col-span-1">
                            <CardHeader><CardTitle className="text-lg flex gap-2"><Settings className="h-5 w-5" /> Configuration</CardTitle></CardHeader>
                            <CardContent className="space-y-4 text-sm">
                                <div>
                                    <span className="font-semibold block text-slate-500">Feature Set</span>
                                    <span>{model.feature_set ? `${model.feature_set.name} (v${model.feature_set.version})` : `ID: ${model.feature_set_id}`}</span>
                                </div>
                                {!isClustering && (
                                    <div>
                                        <span className="font-semibold block text-slate-500">Target Column</span>
                                        <code>{model.target_column}</code>
                                    </div>
                                )}
                                <div>
                                    <span className="font-semibold block text-slate-500">Parameters</span>
                                    <pre className="bg-slate-100 p-2 rounded mt-1 overflow-x-auto text-xs">
                                        {JSON.stringify(modelParams, null, 2)}
                                    </pre>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="md:col-span-2">
                            <CardHeader><CardTitle className="text-lg flex gap-2"><List className="h-5 w-5" /> Features ({features.length})</CardTitle></CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-1 max-h-[400px] overflow-y-auto content-start">
                                    {features.map((f: string) => (
                                        <Badge key={f} variant="outline" className="font-mono text-xs">{f}</Badge>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* METRICS */}
                <TabsContent value="metrics">
                    <Card>
                        <CardHeader><CardTitle>Evaluation Metrics</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {metricKeys.map(k => (
                                    <div key={k} className="bg-slate-50 p-4 rounded border flex flex-col items-center justify-center text-center">
                                        <span className="text-xs text-slate-500 uppercase font-semibold mb-1">{k.replace(/_/g, " ")}</span>
                                        <span className="font-mono text-2xl font-bold text-blue-600">{Number(metrics[k]).toFixed(6)}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* VISUALIZATIONS */}
                <TabsContent value="charts" className="space-y-6">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                        {isClustering ? (
                            <>
                                <Card className="xl:col-span-2">
                                    <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><ScatterChartIcon className="h-4 w-4" /> Cluster Visualization (PCA)</CardTitle></CardHeader>
                                    <CardContent>
                                        <div className="h-[500px] flex items-center justify-center bg-slate-50 border rounded">
                                            <img src={getPlotUrl('cluster_pca')} alt="Cluster PCA" className="max-h-full max-w-full" />
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="xl:col-span-2">
                                    <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><ScanLine className="h-4 w-4" /> Feature Correlation</CardTitle></CardHeader>
                                    <CardContent className="flex justify-center">
                                        <CorrelationMatrixChart dataUrl={getPlotDataUrl('correlation_matrix')} />
                                    </CardContent>
                                </Card>
                            </>
                        ) : (
                            <>
                                {/* Interactive Learning Curve */}
                                <Card>
                                    <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><Activity className="h-4 w-4" /> Learning Curve</CardTitle></CardHeader>
                                    <CardContent>
                                        <LearningCurveChart dataUrl={getPlotDataUrl('learning_curve')} />
                                    </CardContent>
                                </Card>

                                {/* Interactive Actual vs Predicted */}
                                <Card>
                                    <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><ScatterChartIcon className="h-4 w-4" /> {isRegression ? "Actual vs Predicted" : "ROC Curve"}</CardTitle></CardHeader>
                                    <CardContent>
                                        {isRegression ? (
                                            <ActualVsPredictedChart dataUrl={getPlotDataUrl('actual_vs_predicted')} objective={objective} />
                                        ) : (
                                            <div className="h-[400px] flex items-center justify-center bg-slate-50 border rounded">
                                                <img src={getPlotUrl('actual_vs_predicted')} alt="ROC" className="max-h-full max-w-full" />
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Interactive Feature Importance (Full Width) */}
                                <Card className="xl:col-span-2">
                                    <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><BarChartIcon className="h-4 w-4" /> Feature Importance</CardTitle></CardHeader>
                                    <CardContent>
                                        <FeatureImportanceChart dataUrl={getPlotDataUrl('feature_importance')} />
                                    </CardContent>
                                </Card>

                                {/* Static Plots */}
                                <PlotImage type="shap_summary" title="SHAP Summary" icon={BrainCircuit} alt="SHAP Summary" />
                                {/* Interactive Feature Correlation (Full Width) */}
                                <Card className="xl:col-span-2">
                                    <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><ScanLine className="h-4 w-4" /> Feature Correlation (Top 20)</CardTitle></CardHeader>
                                    <CardContent className="flex justify-center">
                                        <CorrelationMatrixChart dataUrl={getPlotDataUrl('correlation_matrix')} />
                                    </CardContent>
                                </Card>
                                <PlotImage type="confusion_matrix" title="Confusion Matrix" icon={ImageIcon} alt="Confusion Matrix" unavailableMessage={isRegression ? 'Not Applicable' : 'Not Available'} />
                            </>
                        )}

                    </div>
                </TabsContent>

                {/* INFERENCE (Placeholder) */}
                <TabsContent value="inference">
                    <div className="p-12 text-center text-slate-500 bg-slate-50 border rounded-lg border-dashed">
                        <p>To run inference, please use the dedicated <a href="/inference" className="text-blue-600 underline">Inference Page</a>.</p>
                        <p className="text-sm mt-2">(Direct integration coming soon)</p>
                    </div>
                </TabsContent>

            </Tabs>

            <TrainModelDialog
                open={isRetrainOpen}
                onOpenChange={setIsRetrainOpen}
                initialConfig={model}
                onSuccess={() => {
                    fetchModel() // Refresh
                    setIsRetrainOpen(false)
                }}
            />

            {/* Image Zoom Dialog */}
            <Dialog open={!!zoomImage} onOpenChange={() => setZoomImage(null)}>
                <DialogContent className="max-w-[95vw] max-h-[95vh] p-4 bg-white/95 backdrop-blur border-none shadow-2xl flex items-center justify-center outline-none">
                    {zoomImage && <img src={zoomImage} className="max-w-full max-h-[90vh] object-contain rounded shadow-lg" alt="Zoomed Plot" />}
                </DialogContent>
            </Dialog>
        </div>
    )
}
