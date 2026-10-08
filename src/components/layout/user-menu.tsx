'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, FolderGit2, LayoutDashboard, LogOut, Shield, Trophy, UserRound } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { initials } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type UserMenuUser = { name: string; email: string; image: string | null; showAdmin: boolean; showJudging: boolean; showManage: boolean }

export function UserMenu({ user }: { user: UserMenuUser }) {
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full" aria-label="Account menu">
        <Avatar className="size-9">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback className="bg-surface-hover text-xs">{initials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-fg-heading">{user.name}</div>
          <div className="truncate text-xs text-fg-muted">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard"><LayoutDashboard aria-hidden /> Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile"><UserRound aria-hidden /> Your profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/projects"><FolderGit2 aria-hidden /> Your projects</Link>
        </DropdownMenuItem>
        {user.showJudging && (
          <DropdownMenuItem asChild>
            <Link href="/judge"><ClipboardCheck aria-hidden /> Judging</Link>
          </DropdownMenuItem>
        )}
        {user.showManage && (
          <DropdownMenuItem asChild>
            <Link href="/manage"><Trophy aria-hidden /> Hackathons you run</Link>
          </DropdownMenuItem>
        )}
        {user.showAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin"><Shield aria-hidden /> Admin</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut()
            router.push('/')
            router.refresh()
          }}
        >
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
