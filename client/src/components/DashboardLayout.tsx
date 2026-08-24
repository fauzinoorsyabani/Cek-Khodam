import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { Bell, BookOpen, CheckCircle2, ClipboardCheck, GraduationCap, LayoutDashboard, LogOut, ScrollText, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import { Link, useLocation } from "wouter";

type NavItem = { label: string; path: string; icon: typeof LayoutDashboard; roles: Array<"super_admin" | "admin" | "user"> };

const navItems: NavItem[] = [
  { label: "Ringkasan", path: "/", icon: LayoutDashboard, roles: ["super_admin", "admin", "user"] },
  { label: "Kursus", path: "/courses", icon: BookOpen, roles: ["super_admin", "admin", "user"] },
  { label: "Operasi kursus", path: "/operations", icon: UsersRound, roles: ["super_admin", "admin"] },
  { label: "Review queue", path: "/review-queue", icon: ClipboardCheck, roles: ["super_admin", "admin"] },
  { label: "Hasil & feedback", path: "/feedback", icon: CheckCircle2, roles: ["user"] },
  { label: "Pengguna", path: "/people", icon: UsersRound, roles: ["super_admin"] },
  { label: "Audit log", path: "/audit", icon: ScrollText, roles: ["super_admin"] },
];

const roleLabel = { super_admin: "Super Admin", admin: "Admin", user: "Learner" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#f5f7fb]"><div className="h-10 w-10 animate-spin rounded-full border-2 border-[#dbe4f0] border-t-[#3156d3]" /></div>;
  }

  if (!user) {
    return (
      <main className="relative grid min-h-screen overflow-hidden bg-[#101a38] px-6 py-12 text-white place-items-center">
        <div className="absolute inset-0 opacity-80" style={{ backgroundImage: "radial-gradient(circle at 10% 15%, rgba(68, 137, 255, .42), transparent 30%), radial-gradient(circle at 90% 85%, rgba(43, 196, 176, .24), transparent 36%)" }} />
        <section className="relative w-full max-w-lg rounded-[2rem] border border-white/15 bg-white/[.08] p-9 shadow-2xl backdrop-blur-xl sm:p-12">
          <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#101a38] shadow-lg"><GraduationCap className="h-6 w-6" /></div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#a9c9ff]">LMS AI Review</p>
          <h1 className="text-4xl font-semibold tracking-[-.04em]">Pembelajaran yang diperiksa dengan lebih bermakna.</h1>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-200">Kelola pembelajaran, pantau progres, dan gunakan review AI sebagai pendamping yang selalu membutuhkan keputusan manusia.</p>
          <Button onClick={() => startLogin()} size="lg" className="mt-9 w-full bg-white text-[#15204a] hover:bg-[#ecf3ff]">Masuk ke workspace</Button>
        </section>
      </main>
    );
  }

  const visibleItems = navItems.filter(item => item.roles.includes(user.role));
  const initial = user.name?.trim().charAt(0).toUpperCase() || "U";

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r border-[#e7ebf3] bg-[#fbfcfe]">
        <div className="flex h-full flex-col">
          <div className="flex h-20 items-center gap-3 px-5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
            <div className="luma-mark grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#19295b] text-white shadow-[0_10px_24px_rgba(25,41,91,.24)]"><GraduationCap className="h-5 w-5" /></div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="luma-wordmark truncate text-[15px] font-extrabold tracking-tight text-[#17224d]">Luma Learn</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#7c8aad]">AI Review Studio</p></div>
          </div>
          <SidebarContent className="px-3">
            <SidebarGroup>
              <SidebarGroupLabel className="px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#98a3bc]">Workspace</SidebarGroupLabel>
              <SidebarMenu>
                {visibleItems.map(item => {
                  const active = item.path === "/" ? location === "/" : location.startsWith(item.path);
                  return <SidebarMenuItem key={item.path}><SidebarMenuButton asChild isActive={active} tooltip={item.label} className="h-11 rounded-xl px-3 text-[#56637e] data-[active=true]:bg-[#e9edff] data-[active=true]:font-semibold data-[active=true]:text-[#2845b2]"><Link href={item.path}><item.icon className="h-[18px] w-[18px]" /><span>{item.label}</span></Link></SidebarMenuButton></SidebarMenuItem>;
                })}
              </SidebarMenu>
            </SidebarGroup>
            <SidebarGroup className="mt-auto">
              <SidebarGroupLabel className="px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#98a3bc]">Sistem</SidebarGroupLabel>
              <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip="Notifikasi" className="h-11 rounded-xl px-3 text-[#56637e]"><Link href="/notifications"><Bell className="h-[18px] w-[18px]" /><span>Notifikasi</span></Link></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton tooltip="Pengaturan segera hadir" onClick={() => undefined} className="h-11 rounded-xl px-3 text-[#56637e]"><Settings2 className="h-[18px] w-[18px]" /><span>Pengaturan</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-3">
            <Separator className="mb-3 bg-[#e7ebf3]" />
            <div className="flex items-center gap-3 rounded-xl px-2 py-2 group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-9 w-9 border border-white shadow-sm"><AvatarFallback className="bg-[#dce7ff] text-xs font-bold text-[#27419d]">{initial}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-semibold text-[#283653]">{user.name || "Pengguna"}</p><Badge variant="secondary" className="mt-1 h-5 rounded-md bg-[#edf1f8] px-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-[#64718b]">{roleLabel[user.role]}</Badge></div>
              <button aria-label="Keluar" onClick={logout} className="grid h-8 w-8 place-items-center rounded-lg text-[#8994aa] transition hover:bg-[#fff0f0] hover:text-[#ce3a3a] group-data-[collapsible=icon]:hidden"><LogOut className="h-4 w-4" /></button>
            </div>
          </SidebarFooter>
        </div>
      </Sidebar>
      <main className="min-h-screen flex-1 bg-[#f5f7fb] text-[#172142]">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#e8edf5] bg-[#f5f7fb]/90 px-5 backdrop-blur-xl lg:px-9"><div className="flex items-center gap-3"><SidebarTrigger className="rounded-xl border border-[#e0e6f0] bg-white shadow-sm hover:bg-white" /><div className="hidden sm:block"><p className="text-sm font-bold text-[#1d2b54]">Operasi pembelajaran</p><p className="text-xs text-[#8a95aa]">Ruang kerja untuk menjaga kualitas evaluasi</p></div></div><Link href="/notifications" className="grid h-10 w-10 place-items-center rounded-xl border border-[#e0e6f0] bg-white text-[#586580] shadow-sm transition hover:border-[#bac8ee] hover:text-[#3156d3]"><Bell className="h-[18px] w-[18px]" /></Link></header>
        <div className="mx-auto w-full max-w-[1600px] p-5 lg:p-9">{children}</div>
      </main>
    </SidebarProvider>
  );
}
