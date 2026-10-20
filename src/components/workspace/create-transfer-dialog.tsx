import { useEffect, useState } from 'react';
import type { Playlist, Provider } from '../../../shared/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { providerNames } from '@/lib/api';

/** Asks for the destination playlist name before a transfer starts matching tracks. */
export function CreateTransferDialog({ playlist, destination, busy, onCancel, onCreate }: {
  playlist: Playlist | null;
  destination: Provider;
  busy: boolean;
  onCancel: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');
  useEffect(() => { if (playlist) setName(playlist.name); }, [playlist]);
  return <Dialog open={Boolean(playlist)} onOpenChange={open => { if (!open && !busy) onCancel(); }}>
    <DialogContent>
      <form className="contents" onSubmit={event => { event.preventDefault(); onCreate(name); }}>
        <DialogHeader>
          <DialogTitle>Copy to {providerNames[destination]}</DialogTitle>
          <DialogDescription>We’ll find matches for review before anything is created.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="transfer-name">New playlist name</FieldLabel>
            <Input id="transfer-name" autoFocus value={name} onChange={event => setName(event.target.value)} required maxLength={150} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : null}{busy ? 'Starting…' : 'Find matches'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
