"use client"

import { useState, useEffect } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface FeatureImportanceChartProps {
    dataUrl: string
}

export function FeatureImportanceChart({ dataUrl }: FeatureImportanceChartProps) {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [limit, setLimit] = useState(20)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(dataUrl)
                if (!res.ok) throw new Error("Failed to load data")
                const json = await res.json()
                setData(json)
            } catch (e) {
                console.error(e)
                setError("Failed to load feature importance data")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [dataUrl])

    if (loading) return <div className="h-[400px] flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
    if (error) return <div className="h-[400px] flex items-center justify-center text-red-400">{error}</div>

    // Sort descending just in case
    const sortedData = [...data].sort((a, b) => b.importance - a.importance)
    const displayData = sortedData.slice(0, limit)

    // Calculate height based on number of features to allow scrolling
    // 25px per bar
    const chartHeight = Math.max(400, displayData.length * 30)

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="text-sm text-slate-500">
                    Showing Top {limit} of {data.length} features
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setLimit(prev => Math.max(10, prev - 10))}
                        className="px-2 py-1 text-xs border rounded hover:bg-slate-50"
                        disabled={limit <= 10}
                    >
                        Show Less
                    </button>
                    <button
                        onClick={() => setLimit(prev => Math.min(data.length, prev + 10))}
                        className="px-2 py-1 text-xs border rounded hover:bg-slate-50"
                        disabled={limit >= data.length}
                    >
                        Show More
                    </button>
                    <button
                        onClick={() => setLimit(data.length)}
                        className="px-2 py-1 text-xs border rounded hover:bg-slate-50 font-semibold"
                        disabled={limit >= data.length}
                    >
                        Show All
                    </button>
                </div>
            </div>

            <div className="border rounded bg-white overflow-y-auto max-h-[600px] p-4">
                <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart
                        layout="vertical"
                        data={displayData}
                        margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis
                            dataKey="feature"
                            type="category"
                            width={150}
                            tick={{ fontSize: 11 }}
                            interval={0}
                        />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            cursor={{ fill: '#f1f5f9' }}
                        />
                        <Bar dataKey="importance" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                            {displayData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill="#3b82f6" opacity={0.8 + (0.2 * (1 - index / displayData.length))} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
