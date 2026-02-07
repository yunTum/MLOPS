"use client"

import { useMemo, useState } from "react"
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
    ScatterChart, Scatter, Legend
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface ClusterDistributionChartProps {
    data: any[]
    predictionCol?: string
}

export function ClusterDistributionChart({ data, predictionCol = "prediction" }: ClusterDistributionChartProps) {
    // ---- Data Analysis for Defaults ----

    // Get all potential columns (excluding the prediction column itself for X/Y candidates usually, though Y can be it)
    const allColumns = useMemo(() => {
        if (!data || data.length === 0) return []
        return Object.keys(data[0]).filter(k => k !== predictionCol)
    }, [data, predictionCol])

    // Heuristically find numeric columns for better defaults
    const numericColumns = useMemo(() => {
        if (!data || data.length === 0) return []
        return allColumns.filter(key => {
            // Check first 50 rows
            for (let i = 0; i < Math.min(data.length, 50); i++) {
                if (typeof data[i][key] === 'number') return true
            }
            return false
        })
    }, [data, allColumns])

    // ---- State ----
    // Default X to first numeric, or just first column
    const [xAxisCol, setXAxisCol] = useState<string>(numericColumns[0] || allColumns[0] || "")
    // Default Y to Prediction (Cluster ID)
    const [yAxisCol, setYAxisCol] = useState<string>(predictionCol)

    // Detect if current selection is numeric (for Axis Type)
    const isXNumeric = useMemo(() => {
        if (!data || !xAxisCol) return false
        for (let i = 0; i < Math.min(data.length, 50); i++) {
            if (typeof data[i][xAxisCol] === 'number') return true
        }
        return false
    }, [data, xAxisCol])

    const isYNumeric = useMemo(() => {
        if (!data || !yAxisCol) return false
        // predictionCol (Cluster ID) is usually categorical integers, treat as category for better Y-axis separation?
        // Actually Scatter chart works best with Numbers. If Y is Cluster ID, we want distinct levels.
        // If we say it's numeric, it might plot 0, 0.5, 1.0... which is fine.
        // Let's rely on data type check.
        for (let i = 0; i < Math.min(data.length, 50); i++) {
            if (typeof data[i][yAxisCol] === 'number') return true
        }
        return false
    }, [data, yAxisCol])

    // Vibrant colors for clusters
    const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

    // ---- Data Processing ----

    // 1. Distribution Data (Bar Chart)
    const distributionData = useMemo(() => {
        if (!data || data.length === 0) return []
        const counts: { [key: string]: number } = {}
        data.forEach(row => {
            const pred = String(row[predictionCol])
            counts[pred] = (counts[pred] || 0) + 1
        })
        return Object.entries(counts)
            .map(([cluster, count]) => ({ cluster, count }))
            .sort((a, b) => Number(a.cluster) - Number(b.cluster))
    }, [data, predictionCol])

    // 2. Scatter Data (Grouped by Cluster)
    const scatterDataByCluster = useMemo(() => {
        if (!data || !xAxisCol || !yAxisCol) return []

        // Group by cluster
        const grouped: { [key: string]: any[] } = {}
        data.forEach(row => {
            const cluster = String(row[predictionCol])
            if (!grouped[cluster]) grouped[cluster] = []

            grouped[cluster].push({
                x: row[xAxisCol],
                y: row[yAxisCol],
                cluster: cluster,
                payload: row // keep full row for tooltip
            })
        })

        return Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).map(cluster => ({
            cluster,
            data: grouped[cluster]
        }))
    }, [data, xAxisCol, yAxisCol, predictionCol])

    if (!data || data.length === 0) return null

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle>Cluster Analysis</CardTitle>
                <CardDescription>Visualize cluster distribution and relationships.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="scatter">
                    <TabsList className="mb-4">
                        <TabsTrigger value="scatter">Scatter Plot</TabsTrigger>
                        <TabsTrigger value="distribution">Distribution (Bar)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="distribution">
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={distributionData}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="cluster" label={{ value: 'Cluster ID', position: 'insideBottom', offset: -5 }} />
                                    <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                        {distributionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                        <LabelList dataKey="count" position="top" />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </TabsContent>

                    <TabsContent value="scatter">
                        <div className="flex gap-4 mb-4 bg-slate-50 p-3 rounded-md border border-slate-100 items-end">
                            <div className="space-y-1">
                                <Label className="text-xs text-slate-500">X Axis (Feature)</Label>
                                <Select value={xAxisCol} onValueChange={setXAxisCol}>
                                    <SelectTrigger className="w-[180px] h-8 text-xs">
                                        <SelectValue placeholder="Select X Axis" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px] overflow-y-auto">
                                        {allColumns.map(col => (
                                            <SelectItem key={col} value={col}>{col}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs text-slate-500">Y Axis (Feature or ID)</Label>
                                <Select value={yAxisCol} onValueChange={setYAxisCol}>
                                    <SelectTrigger className="w-[180px] h-8 text-xs">
                                        <SelectValue placeholder="Select Y Axis" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px] overflow-y-auto">
                                        <SelectItem value={predictionCol}>Cluster ID ({predictionCol})</SelectItem>
                                        {allColumns.map(col => (
                                            <SelectItem key={col} value={col}>{col}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                    <CartesianGrid />
                                    <XAxis
                                        type={isXNumeric ? "number" : "category"}
                                        dataKey="x"
                                        name={xAxisCol}
                                        label={{ value: xAxisCol, position: 'insideBottom', offset: -10 }}
                                        allowDuplicatedCategory={false}
                                        padding={{ left: 10, right: 10 }}
                                    />
                                    <YAxis
                                        type={isYNumeric ? "number" : "category"}
                                        dataKey="y"
                                        name={yAxisCol}
                                        label={{ value: yAxisCol, angle: -90, position: 'insideLeft' }}
                                        allowDuplicatedCategory={false}
                                        padding={{ top: 10, bottom: 10 }}
                                    />
                                    <Tooltip
                                        cursor={{ strokeDasharray: '3 3' }}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload
                                                return (
                                                    <div className="bg-white p-2 border rounded shadow text-xs">
                                                        <p><strong>Cluster:</strong> {data.cluster}</p>
                                                        <p><strong>X ({xAxisCol}):</strong> {String(data.x)}</p>
                                                        <p><strong>Y ({yAxisCol}):</strong> {String(data.y)}</p>
                                                    </div>
                                                )
                                            }
                                            return null
                                        }}
                                    />
                                    <Legend />
                                    {scatterDataByCluster.map((group, index) => (
                                        <Scatter
                                            key={group.cluster}
                                            name={`Cluster ${group.cluster}`}
                                            data={group.data}
                                            fill={COLORS[index % COLORS.length]}
                                        />
                                    ))}
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
