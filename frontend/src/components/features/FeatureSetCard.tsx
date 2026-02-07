import { useRouter } from "next/navigation"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Edit, Trash2, BarChart3, Eye } from "lucide-react"

interface FeatureSetCardProps {
    featureSet: any
    onEdit: (fs: any) => void
    onAnalyze: (fs: any) => void
    onDelete: (fs: any) => void
}

export function FeatureSetCard({ featureSet, onEdit, onAnalyze, onDelete }: FeatureSetCardProps) {
    const router = useRouter()
    return (
        <Card className="hover:border-purple-300 transition-all group relative">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h3 className="font-semibold text-slate-900 truncate pr-2 max-w-[150px]" title={featureSet.name || `Feature Set #${featureSet.id}`}>
                            {featureSet.name || `Feature Set #${featureSet.id}`}
                        </h3>
                        <p className="text-xs text-slate-500 max-w-[180px] truncate" title={featureSet.description || featureSet.version}>
                            {featureSet.description || featureSet.version}
                        </p>
                    </div>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50" onClick={() => router.push(`/features/${featureSet.id}/preview`)} title="Preview Data">
                            <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50" onClick={() => onAnalyze(featureSet)} title="Analyze Relevance">
                            <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600" onClick={() => onEdit(featureSet)}>
                            <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(featureSet)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div></CardHeader>
            <CardContent>
                <div className="text-xs text-slate-500 mb-4">
                    Base Dataset Version: {featureSet.dataset_version_id}
                </div>
                <div className="flex gap-2">
                    <div className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs font-semibold">
                        {featureSet.transformations?.length || 0} Steps
                    </div>
                    <div className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-semibold">
                        {featureSet.active_features?.length || 0} Active
                    </div>
                </div>
            </CardContent>
        </Card >
    )
}
