import { createFileRoute } from '@tanstack/react-router';
import { AdminHome } from '@/components/admin-home';

export const Route = createFileRoute('/')({
  component: AdminHome,
});
