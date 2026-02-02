"use client"

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Task {
    id: string;
    name: string;
    task_type: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    result?: any;
    updated_at: string;
}

export function TaskProgress() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [minimized, setMinimized] = useState(false);

    const fetchTasks = async () => {
        try {
            const res = await api.get('/tasks/?limit=10');
            const allTasks = res.data;

            const active = allTasks.filter((t: Task) => ['pending', 'running'].includes(t.status));

            const now = new Date();
            const recent = allTasks.filter((t: Task) => {
                if (['pending', 'running'].includes(t.status)) return false;
                const updated = new Date(t.updated_at);
                const diffSeconds = (now.getTime() - updated.getTime()) / 1000;
                return diffSeconds < 60;
            }).slice(0, 3);

            setTasks([...active, ...recent]);
            return active.length > 0;
        } catch (e) {
            console.error("Failed to fetch tasks", e);
            return false;
        }
    };

    useEffect(() => {
        let timeoutId: NodeJS.Timeout;

        const loop = async () => {
            const hasActive = await fetchTasks();
            const delay = hasActive ? 3000 : 20000;
            timeoutId = setTimeout(loop, delay);
        };

        loop();

        return () => clearTimeout(timeoutId);
    }, []);

    if (tasks.filter(t => ['pending', 'running'].includes(t.status)).length === 0 && tasks.length === 0) {
        return null;
    }

    const activeCount = tasks.filter(t => ['pending', 'running'].includes(t.status)).length;

    if (activeCount === 0 && minimized) return null; // Hide if nothing active and minimized

    return (
        <div className="fixed bottom-4 right-4 z-50 w-80 shadow-2xl">
            <Card className="border-slate-200 shadow-lg">
                <CardHeader className="p-3 bg-slate-900 text-white rounded-t-lg cursor-pointer flex flex-row items-center justify-between" onClick={() => setMinimized(!minimized)}>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        {activeCount > 0 ? <Loader2 className="h-4 w-4 animate-spin text-blue-400" /> : <CheckCircle className="h-4 w-4 text-green-400" />}
                        Background Tasks ({activeCount})
                    </CardTitle>
                    <span className="text-xs text-slate-400">{minimized ? 'Show' : 'Hide'}</span>
                </CardHeader>
                {!minimized && (
                    <CardContent className="p-0 max-h-64 overflow-y-auto bg-white">
                        {tasks.map(task => (
                            <div key={task.id} className="p-3 border-b last:border-0 text-sm">
                                <div className="flex justify-between mb-1">
                                    <span className="font-semibold truncate w-3/4">{task.name}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded capitalize 
                                        ${task.status === 'running' ? 'bg-blue-100 text-blue-800' :
                                            task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                task.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-slate-100'}`}>
                                        {task.status}
                                    </span>
                                </div>
                                <Progress value={task.progress} className="h-2 mb-1" />
                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>{task.progress}%</span>
                                    <span>{new Date(task.updated_at).toLocaleTimeString()}</span>
                                </div>
                                {task.status === 'failed' && (
                                    <div className="mt-1 text-xs text-red-600 bg-red-50 p-1 rounded break-all">
                                        Error: {JSON.stringify(task.result)}
                                    </div>
                                )}
                            </div>
                        ))}
                        {tasks.length === 0 && <div className="p-4 text-center text-slate-500 text-xs">No active tasks</div>}
                    </CardContent>
                )}
            </Card>
        </div>
    );
}
