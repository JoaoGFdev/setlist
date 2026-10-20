import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/pages/confirm-dialog';
import { clearHistory } from '@/lib/api';

/** Confirms, then removes every saved transfer from Setlist. Playlists on Spotify and YouTube are never touched. */
export function ClearHistoryDialog({ open, onOpenChange, onCleared }: { open: boolean; onOpenChange: (open: boolean) => void; onCleared: () => void }) {
  return <ConfirmDialog open={open} onOpenChange={onOpenChange} title="Clear transfer history?" confirmLabel="Clear history"
    icon={<Trash2Icon data-icon="inline-start" />}
    description="This removes every saved transfer from Setlist, so none of them can be resumed. Your playlists on Spotify and YouTube are never changed or deleted. Connected accounts and hidden playlists are kept."
    onConfirm={async () => { await clearHistory(); onCleared(); toast.success('Transfer history cleared'); }} />;
}
