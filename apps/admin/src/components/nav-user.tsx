import { useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';

import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import { useAdminAuth } from '@/features/auth/hooks/use-admin-auth';

export function NavUser() {
  const { user, signOut } = useAdminAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    void navigate({ to: '/login' });
  };

  const userInitials = user?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <SidebarMenu className="border-t-2 border-foreground p-2">
      <SidebarMenuItem>
        <div className="flex items-center gap-3 p-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-foreground bg-primary font-display font-bold">
            {userInitials}
          </div>
          <div className="flex flex-1 flex-col overflow-hidden">
            <span className="truncate text-sm font-semibold">{user?.email}</span>
            <div className="mt-1 flex">
              <span className="rounded-full border-2 border-foreground px-2 py-0.5 text-xs font-semibold">
                {user?.role}
              </span>
            </div>
          </div>
        </div>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={handleSignOut} className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive">
          <LogOut className="size-4" />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
