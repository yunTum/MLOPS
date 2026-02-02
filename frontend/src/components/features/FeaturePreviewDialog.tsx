import { useEffect, useState } from "react"
import api from "@/lib/api"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Table, Workflow } from "lucide-react"

interface FeaturePreviewDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    featureSet: any | null
}

export function FeaturePreviewDialog({ open, onOpenChange, featureSet }: FeaturePreviewDialogProps) {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (open && featureSet) {
            fetchPreview()
        } else {
            setData([])
        }
    }, [open, featureSet])

    const fetchPreview = async () => {
        if (!featureSet) return
        setLoading(true)
        try {
            const res = await api.get(`/features/sets/${featureSet.id}/preview?limit=20`)
            console.log("Preview Data:", res.data)
            setData(res.data.data) // The endpoint returns { data: [...] }
        } catch (e) {
            console.error("Failed to load preview", e)
        } finally {
            setLoading(false)
        }
    }

    if (!featureSet) return null

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Feature Set Details: {featureSet.version}</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto space-y-6 p-1">
                    <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-3 rounded-md border">
                        <div><span className="font-semibold">Dataset Version ID:</span> {featureSet.dataset_version_id}</div>
                        <div><span className="font-semibold">Created At:</span> {featureSet.created_at}</div>
                        <div className="col-span-2 break-all"><span className="font-semibold">Path:</span> {featureSet.path}</div>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-2 flex items-center gap-2"><Workflow className="h-4 w-4" /> Transformations</h4>
                        <div className="bg-white border rounded text-xs font-mono">
                            {featureSet.transformations?.length > 0 ? (
                                <div className="divide-y">
                                    {featureSet.transformations?.map((t: any, i: number) => (
                                        <div key={i} className="p-2 flex gap-2 border-b last:border-0 items-start">
                                            <span className="text-slate-400 w-6 text-right shrink-0 mt-0.5">{i + 1}.</span>

                                            {t.op === 'auto_gen' ? (
                                                <div className="flex flex-col gap-1 w-full">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-purple-600 font-bold uppercase text-xs">AUTO GEN</span>
                                                        <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] border border-purple-200 font-semibold">{t.method}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600 bg-slate-50 p-2 rounded">
                                                        <div><span className="font-semibold">Target:</span> {t.target_column || "N/A"}</div>
                                                        <div title={t.source_columns?.join(", ")} className="cursor-help underline decoration-dotted">
                                                            <span className="font-semibold">Source:</span> {Array.isArray(t.source_columns) ? `${t.source_columns.length} cols` : "All"}
                                                        </div>
                                                        <div><span className="font-semibold">Variance Thresh:</span> {t.variance_threshold}</div>
                                                        <div><span className="font-semibold">Corr Thresh:</span> {t.correlation_threshold}</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2 items-center">
                                                    <span className="text-blue-600 font-bold uppercase text-xs">{t.op}</span>
                                                    {t.col && <span className="text-slate-700 text-xs">col=<span className="font-semibold">{t.col}</span></span>}
                                                    <span className="text-slate-500 text-xs">
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
                            ) : (
                                <div className="p-4 text-slate-400 italic">No explicit transformations recorded.</div>
                            )}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold mb-2 flex items-center gap-2"><Table className="h-4 w-4" /> Data Preview (Top 20 Rows)</h4>
                        <div className="border rounded-md overflow-x-auto">
                            {loading ? (
                                <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-purple-600" /></div>
                            ) : data.length > 0 ? (
                                <table className="w-full text-xs text-left whitespace-nowrap">
                                    <thead className="bg-slate-100 text-slate-700 font-semibold">
                                        <tr>
                                            {Object.keys(data[0]).map(k => (
                                                <th key={k} className="p-2 border-b">{k}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.map((row: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-50 border-b last:border-0">
                                                {Object.values(row).map((val: any, j: number) => (
                                                    <td key={j} className="p-2 font-mono">{String(val).substring(0, 50)}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-8 text-center text-slate-400">No data available or failed to load.</div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
