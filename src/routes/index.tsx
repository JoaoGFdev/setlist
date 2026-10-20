import { createFileRoute } from '@tanstack/react-router';
import { App } from '@/components/workspace/workspace-page';

export const Route = createFileRoute('/')({ validateSearch: (search: Record<string, unknown>): { job?: string } => ({ job: typeof search.job === 'string' ? search.job : undefined }), component: App });
