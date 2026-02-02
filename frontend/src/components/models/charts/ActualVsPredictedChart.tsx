"use client"

import { useState, useEffect } from "react"
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { Loader2 } from "lucide-react"

interface ActualVsPredictedChartProps {
    dataUrl: string
    objective: string
}

export function ActualVsPredictedChart({ dataUrl, objective }: ActualVsPredictedChartProps) {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(dataUrl)
                if (!res.ok) throw new Error("Failed to load data")
                const json = await res.json()
                setData(json)
            } catch (e) {
                console.error(e)
                setError("Failed to load chart data")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [dataUrl])

    if (loading) return <div className="h-[400px] flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
    if (error) return <div className="h-[400px] flex items-center justify-center text-red-400">{error}</div>

    if (objective !== 'regression') {
        return (
            <div className="h-[400px] flex items-center justify-center text-slate-500">
                Interactive chart only available for Regression (ROC Curve uses static image for now).
            </div>
        )
    }

    // Determine domain for diagonal line
    const vals = data.flatMap(d => [d.actual, d.predicted])
    let min = Math.min(...vals)
    let max = Math.max(...vals)

    // Add some padding
    const padding = (max - min) * 0.05
    min -= padding
    max += padding

    return (
        <div className="h-[400px] w-full bg-white p-4 rounded border">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="actual" name="Actual" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} label={{ value: 'Actual', position: 'insideBottom', offset: -10 }} domain={[min, max]} />
                    <YAxis type="number" dataKey="predicted" name="Predicted" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} label={{ value: 'Predicted', angle: -90, position: 'insideLeft' }} domain={[min, max]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />

                    {/* Ideal Line (y=x) */}
                    <ReferenceLine segment={[{ x: min, y: min }, { x: max, y: max }]} stroke="#ef4444" strokeWidth={2} strokeDasharray="3 3" label={{ value: "Ideal", position: 'insideTopLeft', fill: '#ef4444', fontSize: 12 }} />

                    <Scatter name="Prediction" data={data} fill="#3b82f6" fillOpacity={0.6} />
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    )
}
