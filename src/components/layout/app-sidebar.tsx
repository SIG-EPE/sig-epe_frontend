"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  FilePlus,
  DollarSign,
  Users,
  BarChart3,
  Settings,
  ClipboardCheck,
  CheckCircle,
  BookOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { ROLE_MENU_MAP, type MenuItem } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NavUser } from "@/components/layout/nav-user";

// -------------------------------------------------------
// Icon map — maps icon name strings from constants to components
// -------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  FilePlus,
  DollarSign,
  Users,
  BarChart3,
  Settings,
  ClipboardCheck,
  CheckCircle,
  BookOpen,
};

// -------------------------------------------------------
// AppSidebar component
// -------------------------------------------------------

export function AppSidebar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  // Skeleton while user data loads
  if (!user) {
    return (
      <Sidebar collapsible="icon" variant="sidebar">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-2">
            <Skeleton className="h-9 w-8 rounded" />
            <Skeleton className="h-4 w-16 group-data-[collapsible=icon]:hidden" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navegación</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex flex-col gap-2 px-2">
                <Skeleton className="h-8 w-full rounded-md" />
                <Skeleton className="h-8 w-3/4 rounded-md" />
                <Skeleton className="h-8 w-5/6 rounded-md" />
                <Skeleton className="h-8 w-full rounded-md" />
                <Skeleton className="h-8 w-4/5 rounded-md" />
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-2 px-2 py-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-24 group-data-[collapsible=icon]:hidden" />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    );
  }

  const roleCode = user.role?.code;
  const menuItems: MenuItem[] = roleCode
    ? (ROLE_MENU_MAP[roleCode as keyof typeof ROLE_MENU_MAP] ?? [])
    : [];

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      {/* Header — logo + app name */}
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <img
            src="/ensenia-logo.png"
            alt="Enseña Perú"
            width={32}
            height={36}
            className="h-9 w-8 object-contain"
          />
          <span className="text-sm font-bold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            SIG-EPE
          </span>
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
                const isActive = pathname === item.href;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link href={item.href as never}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — user */}
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
