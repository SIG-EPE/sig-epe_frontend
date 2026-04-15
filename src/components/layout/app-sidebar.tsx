"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  DollarSign,
  Users,
  BarChart3,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { ROLE_MENU_MAP, type MenuItem } from "@/lib/constants";
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
  DollarSign,
  Users,
  BarChart3,
  Settings,
};

// -------------------------------------------------------
// AppSidebar component
// -------------------------------------------------------

export function AppSidebar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  const roleCode = user?.role?.code;
  const menuItems: MenuItem[] = roleCode
    ? (ROLE_MENU_MAP[roleCode as keyof typeof ROLE_MENU_MAP] ?? [])
    : [];

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      {/* Header — logo + app name */}
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <img
            src="/ensenia-logo.webp"
            alt="Enseña Perú"
            width={32}
            height={32}
            className="h-8 w-8 rounded-full"
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
                      <Link href={item.href}>
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
