"use client"

import { useState, useEffect } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Loader2 } from "lucide-react"

interface LearningCurveChartProps {
    dataUrl: string
}

export function LearningCurveChart({ dataUrl }: LearningCurveChartProps) {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [metrics, setMetrics] = useState<string[]>([])

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(dataUrl)
                if (!res.ok) throw new Error("Failed to load data")
                const json = await res.json()

                // Transform data for Recharts: { iteration: 1, train_rmse: 0.5, val_rmse: 0.6 }
                // Input format: { "train": { "rmse": [1, 0.9...] }, "valid": { "rmse": [...] } }

                // Assuming standard LGBM evals_result structure
                const datasets = Object.keys(json)
                if (datasets.length === 0) return

                const firstDs = datasets[0]
                const metricKeys = Object.keys(json[firstDs])
                if (metricKeys.length === 0) return

                const iterations = json[firstDs][metricKeys[0]].length
                const transformed = []
                const foundMetrics = new Set<string>()

                for (let i = 0; i < iterations; i++) {
                    const row: any = { iteration: i + 1 }
                    datasets.forEach(ds => {
                        Object.keys(json[ds]).forEach(m => {
                            const key = `${ds}_${m}`
                            row[key] = json[ds][m][i]
                            foundMetrics.add(key)
                        })
                    })
                    transformed.push(row)
                }

                setData(transformed)
                setMetrics(Array.from(foundMetrics))

            } catch (e) {
                console.error(e)
                setError("Failed to load learning curve data")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [dataUrl])

    if (loading) return <div className="h-[400px] flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
    if (error) return <div className="h-[400px] flex items-center justify-center text-red-400">{error}</div>

    const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"]

    return (
        <div className="h-[400px] w-full bg-white p-4 rounded border">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="iteration" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend />
                    {metrics.map((m, i) => (
                        <Line
                            key={m}
                            type="monotone"
                            dataKey={m}
                            stroke={colors[i % colors.length]}
                            dot={false}
                            strokeWidth={2}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}
