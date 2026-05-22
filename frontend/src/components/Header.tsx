'use client';

import type React from 'react';
import { useState } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { Home, ListChecks, LogIn, Menu, Search, ShieldCheck, X } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';
import UserMenu from './UserMenu';
import { Button } from './ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/Dropdown-Menu';
import { Input } from './ui/Input';

const navItems = [
  { to: '/', label: 'Trang chủ', icon: <Home className="h-4 w-4" /> },
  { to: '/elections', label: 'Cuộc bầu cử', icon: <ListChecks className="h-4 w-4" /> },
];

export default function Header() {
  const [, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const user = useSelector((state: RootState) => state.dangNhapTaiKhoan.taiKhoan);
  const showElectionSearch = location.pathname === '/elections';

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchTerm(value);
    setSearchParams(value.trim() ? { search: value.trim() } : {});
  };

  return (
    <header className="sticky top-0 z-40 bg-[var(--surface-black)] text-white">
      <div className="mx-auto flex h-11 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to={user ? '/app' : '/'} className="flex min-w-0 items-center gap-2 text-white/90">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate text-xs font-normal tracking-[-0.01em]">HoLiHu BlockVote</span>
        </Link>

        <nav className="hidden items-center gap-5 md:flex" aria-label="Điều hướng chính">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `inline-flex min-h-8 items-center gap-1.5 text-xs font-normal tracking-[-0.01em] transition-colors duration-150 ${
                  isActive ? 'text-white' : 'text-white/70 hover:text-white'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden min-w-0 items-center justify-end gap-3 md:flex">
          {showElectionSearch && (
            <div className="relative w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
              <Input
                type="search"
                name="election-search"
                autoComplete="off"
                placeholder="Tìm cuộc bầu cử..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="h-8 rounded-full border-white/10 bg-white/10 pl-9 text-xs text-white placeholder:text-white/45"
              />
            </div>
          )}

          {user ? (
            <UserMenu compact />
          ) : (
            <NavLink
              to="/login"
              className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full bg-[var(--clay-text)] px-3 text-xs font-normal text-white transition-transform duration-150 hover:bg-[var(--surface-tile-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-primary-focus)] active:scale-95"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              Đăng nhập
            </NavLink>
          )}
        </div>

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--clay-primary-focus)] md:hidden"
              aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-72 rounded-[18px] border-[var(--clay-border)] bg-white p-3 text-black"
          >
            {navItems.map((item) => (
              <DropdownMenuItem key={item.to} asChild onClick={() => setMenuOpen(false)}>
                <NavLink to={item.to} className="flex min-h-11 items-center gap-3 rounded-full px-3 py-3 text-sm font-normal">
                  {item.icon}
                  {item.label}
                </NavLink>
              </DropdownMenuItem>
            ))}

            {showElectionSearch && (
              <div className="px-2 py-3">
                <label htmlFor="mobile-election-search" className="mb-2 block text-xs font-semibold text-[var(--clay-muted)]">
                  Tìm kiếm
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--clay-muted)]" />
                  <Input
                    id="mobile-election-search"
                    type="search"
                    name="mobile-election-search"
                    autoComplete="off"
                    placeholder="Tìm cuộc bầu cử..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="h-11 rounded-full border-[var(--clay-border)] bg-white pl-10 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="mt-2 border-t border-[var(--clay-border)] pt-3">
              {user ? (
                <UserMenu inMobileMenu />
              ) : (
                <DropdownMenuItem asChild onClick={() => setMenuOpen(false)}>
                  <NavLink to="/login" className="flex min-h-11 items-center gap-3 rounded-full px-3 py-3 text-sm font-normal">
                    <LogIn className="h-4 w-4" />
                    Đăng nhập
                  </NavLink>
                </DropdownMenuItem>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
