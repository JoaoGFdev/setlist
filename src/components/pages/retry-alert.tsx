import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function RetryAlert({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return <Alert variant="destructive">
    <CircleAlertIcon />
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>{message}</AlertDescription>
    <AlertAction><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button></AlertAction>
  </Alert>;
}
