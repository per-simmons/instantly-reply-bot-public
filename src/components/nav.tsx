'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Mail, FileText, History, Brain, Settings } from 'lucide-react';

const links = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Mail },
  { href: '/drafts', label: 'Drafts', icon: FileText },
  { href: '/history', label: 'History', icon: History },
  { href: '/memory', label: 'Memory', icon: Brain },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="w-52 border-r border-border bg-background flex flex-col py-4">
      <div className="px-4 pb-4 border-b border-border mb-4">
        <h1 className="font-semibold text-sm tracking-tight">Reply Bot</h1>
      </div>
      <div className="flex flex-col gap-1 px-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
              pathname === href
                ? 'bg-foreground text-background font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
