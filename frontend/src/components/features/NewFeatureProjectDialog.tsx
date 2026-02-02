import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input, Label } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select } from "@/components/ui/select-native"
import api from "@/lib/api"
import { Loader2 } from "lucide-react"

interface NewFeatureProjectDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function NewFeatureProjectDialog({ open, onOpenChange, onSuccess }: NewFeatureProjectDialogProps) {
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Dataset Selection State
    const [datasets, setDatasets] = useState<any[]>([])
    const [versions, setVersions] = useState<any[]>([])
    const [selectedDatasetId, setSelectedDatasetId] = useState("")
    const [selectedVersionId, setSelectedVersionId] = useState("")

    useEffect(() => {
        if (open) {
            fetchDatasets()
        } else {
            // Reset on close
            setName("")
            setDescription("")
            setSelectedDatasetId("")
            setSelectedVersionId("")
            setVersions([])
        }
    }, [open])

    const fetchDatasets = async () => {
        try {
            const res = await api.get('/datasets/')
            setDatasets(res.data)
        } catch (e) { console.error(e) }
    }

    useEffect(() => {
        if (selectedDatasetId) {
            api.get(`/datasets/${selectedDatasetId}/versions`)
                .then(res => setVersions(res.data))
                .catch(console.error)
        } else {
            setVersions([])
        }
    }, [selectedDatasetId])

    const handleSubmit = async () => {
        if (!name || !selectedVersionId) return
        setIsSubmitting(true)
        try {
            await api.post('/features/sets', {
                name,
                description,
                dataset_version_id: parseInt(selectedVersionId)
            })
            onSuccess()
            onOpenChange(false)
        } catch (e) {
            console.error(e)
            alert("Failed to create project")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>New Feature Project</DialogTitle>
                    <DialogDescription>Create a new feature set linked to a source dataset.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Project Name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Customer Churn Features" />
                    </div>
                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the goal of this feature set..." />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Source Dataset</Label>
                            <Select value={selectedDatasetId} onChange={e => setSelectedDatasetId(e.target.value)}>
                                <option value="">Select dataset...</option>
                                {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Version</Label>
                            <Select
                                value={selectedVersionId}
                                onChange={e => setSelectedVersionId(e.target.value)}
                                disabled={!selectedDatasetId}
                            >
                                <option value="">Select version...</option>
                                {versions.map(v => <option key={v.id} value={v.id}>{v.version}</option>)}
                            </Select>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!name || !selectedVersionId || isSubmitting} className="bg-purple-600 hover:bg-purple-700">
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Project
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
