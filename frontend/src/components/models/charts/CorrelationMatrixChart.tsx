"use client"

import React, { useEffect, useState } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface CorrelationMatrixChartProps {
    dataUrl: string
}

export function CorrelationMatrixChart({ dataUrl }: CorrelationMatrixChartProps) {
    const [data, setData] = useState<{ features: string[], matrix: (number | null)[][] } | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch(dataUrl)
                if (!response.ok) throw new Error("Failed to load correlation data")
                const json = await response.json()
                setData(json)
            } catch (err) {
                console.error(err)
                setError("Failed to load interactive correlation matrix.")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [dataUrl])

    if (loading) return <div className="h-[300px] flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6 text-slate-300" /></div>
    if (error) return <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">{error}</div>
    if (!data || !data.features || !data.matrix) return <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">No Data Available</div>

    const { features, matrix } = data
    const size = features.length

    // Color scale helper: -1 (Blue) -> 0 (White) -> 1 (Red)
    const getColor = (val: number | null) => {
        if (val === null) return 'bg-slate-100'

        // Clamp value between -1 and 1
        const v = Math.max(-1, Math.min(1, val))

        if (v === 0) return 'rgb(255, 255, 255)'

        if (v > 0) {
            // White to Red (255, 255, 255) -> (255, 0, 0)
            // G and B decrease as v increases
            const lightness = Math.round(255 * (1 - v))
            return `rgb(255, ${lightness}, ${lightness})`
        } else {
            // White to Blue (255, 255, 255) -> (0, 0, 255)
            // R and G decrease as |v| increases
            const lightness = Math.round(255 * (1 - Math.abs(v)))
            return `rgb(${lightness}, ${lightness}, 255)`
        }
    }

    return (
        <div className="w-full overflow-auto p-4">
            <div className="relative inline-block">
                {/* Header Row (Features X) */}
                <div className="flex ml-[120px] mb-2">
                    {features.map((f, i) => (
                        <div key={i} className="w-8 h-32 flex items-end justify-center">
                            <span className="text-[10px] text-slate-600 font-mono rotate-[-90deg] whitespace-nowrap origin-bottom-left translate-x-4 mb-2">
                                {f.length > 15 ? f.substring(0, 15) + '...' : f}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Matrix Rows */}
                {matrix.map((row, i) => (
                    <div key={i} className="flex items-center">
                        {/* Row Header (Feature Y) */}
                        <div className="w-[120px] text-right pr-2 text-xs text-slate-600 truncate" title={features[i]}>
                            {features[i]}
                        </div>

                        {/* Cells */}
                        {row.map((val, j) => (
                            <TooltipProvider key={j} delayDuration={0}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div
                                            className="w-8 h-8 border border-slate-100 text-[9px] flex items-center justify-center cursor-default transition-transform hover:scale-110 hover:z-10 hover:border-slate-800"
                                            style={{ backgroundColor: getColor(val) }}
                                        >
                                            {/* Optional: Show value if cells are big, but for 20x20 it's cluttered. Keep tooltips. */}
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <div className="text-xs">
                                            <p className="font-semibold">{features[i]} vs {features[j]}</p>
                                            <p>Correlation: <span className="font-mono">{val?.toFixed(4)}</span></p>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}
