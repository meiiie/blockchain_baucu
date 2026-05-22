'use client';

import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  User,
  Settings,
  LogOut,
  ChevronDown,
  Shield,
  History,
  Wallet,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { FaEthereum } from 'react-icons/fa';
import { logoutThat } from '../store/slice/dangXuatTaiKhoanSlice';
import { store } from '../store/store';
import { useSepoliaWalletSummary } from '../hooks/useSepoliaWalletSummary';

interface UserMenuProps {
  isCollapsed?: boolean;
  inMobileMenu?: boolean;
  compact?: boolean;
}

type MenuPosition = {
  top: number;
  left: number;
  maxHeight: number;
  side: 'above' | 'below' | 'right' | 'left';
};

const VIEWPORT_MARGIN = 16;
const MENU_GUTTER = 8;
const MENU_WIDTH = 288;

function shortenAddress(value?: string | null) {
  if (!value) {
    return 'n/a';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

const UserMenu: React.FC<UserMenuProps> = ({
  isCollapsed = false,
  inMobileMenu = false,
  compact = false,
}) => {
  const { taiKhoan: user } = useSelector((state: RootState) => state.dangNhapTaiKhoan);
  const { balance, error, isLoading, publicConfig, refresh } = useSepoliaWalletSummary(
    user?.diaChiVi ?? null,
  );
  const navigate = useNavigate();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    top: 0,
    left: 0,
    maxHeight: 520,
    side: 'below',
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const floatingMenuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    if (!isAccountMenuOpen || !buttonRef.current || isMobile) {
      return;
    }

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const menuHeight = floatingMenuRef.current?.getBoundingClientRect().height ?? 420;
    const availableHeight = Math.max(240, window.innerHeight - VIEWPORT_MARGIN * 2);
    const maxHeight = Math.min(availableHeight, 520);
    const measuredHeight = Math.min(menuHeight, maxHeight);

    if (isCollapsed) {
      const preferredRight = buttonRect.right + MENU_GUTTER;
      const canOpenRight = preferredRight + MENU_WIDTH <= window.innerWidth - VIEWPORT_MARGIN;
      const left = canOpenRight
        ? preferredRight
        : Math.max(VIEWPORT_MARGIN, buttonRect.left - MENU_WIDTH - MENU_GUTTER);
      const top = Math.min(
        Math.max(VIEWPORT_MARGIN, buttonRect.top),
        Math.max(VIEWPORT_MARGIN, window.innerHeight - measuredHeight - VIEWPORT_MARGIN),
      );

      setMenuPosition({
        top,
        left,
        maxHeight,
        side: canOpenRight ? 'right' : 'left',
      });
      return;
    }

    const spaceBelow = window.innerHeight - buttonRect.bottom - VIEWPORT_MARGIN;
    const shouldOpenBelow = spaceBelow >= measuredHeight + MENU_GUTTER || buttonRect.top < measuredHeight;
    const top = shouldOpenBelow
      ? Math.min(
          buttonRect.bottom + MENU_GUTTER,
          Math.max(VIEWPORT_MARGIN, window.innerHeight - measuredHeight - VIEWPORT_MARGIN),
        )
      : Math.max(VIEWPORT_MARGIN, buttonRect.top - measuredHeight - MENU_GUTTER);
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, buttonRect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN),
    );

    setMenuPosition({
      top,
      left,
      maxHeight,
      side: shouldOpenBelow ? 'below' : 'above',
    });
  }, [isAccountMenuOpen, isCollapsed, isMobile]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useLayoutEffect(() => {
    updateMenuPosition();
  }, [updateMenuPosition]);

  useEffect(() => {
    if (!isAccountMenuOpen || isMobile) {
      return;
    }

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isAccountMenuOpen, isMobile, updateMenuPosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsAccountMenuOpen(false);
      }
    };

    if (isAccountMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAccountMenuOpen]);

  const displayName = user?.tenHienThi || user?.diaChiVi || user?.email || 'Khách';
  const userRole = Array.isArray(user?.vaiTro)
    ? user?.vaiTro.map((vaiTro) => vaiTro.tenVaiTro).join(', ')
    : user?.vaiTro?.tenVaiTro || 'Cử tri';
  const explorerUrl = user?.diaChiVi && publicConfig?.explorerBaseUrl
    ? `${publicConfig.explorerBaseUrl}/address/${user.diaChiVi}`
    : null;

  const formatName = (name: string) =>
    name
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

  const toggleAccountMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAccountMenuOpen((current) => !current);
  };

  const confirmLogout = async () => {
    try {
      setShowLogoutConfirm(false);
      setIsAccountMenuOpen(false);
      await store.dispatch(logoutThat());
      toast.success('Đăng xuất thành công');
      navigate('/');
    } catch {
      toast.error('Có lỗi xảy ra khi đăng xuất');
    }
  };

  const refreshBalance = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.diaChiVi) {
      return;
    }

    setIsRefreshing(true);
    try {
      refresh();
      toast.success('Đã cập nhật ví Sepolia');
    } catch {
      toast.error('Không thể cập nhật ví Sepolia');
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Đã sao chép địa chỉ ví');
    } catch {
      toast.error('Không thể sao chép địa chỉ ví');
    }
  };

  const mobileMenuClasses = inMobileMenu
    ? 'w-full bg-transparent hover:bg-transparent focus:bg-transparent border-0'
    : '';
  const buttonClasses = compact
    ? 'flex h-10 min-h-0 w-full max-w-[230px] items-center space-x-2 rounded-full border border-[var(--clay-border)] bg-white px-2 py-1 transition-colors hover:bg-[var(--clay-surface-soft)]'
    : `flex min-h-11 w-full items-center space-x-2 rounded-full border border-[var(--clay-border)] bg-white px-3 py-2 transition-colors hover:bg-[var(--clay-surface-soft)] ${mobileMenuClasses}`;
  const avatarClasses = compact
    ? 'flex h-8 w-8 items-center justify-center rounded-full bg-black'
    : 'flex h-10 w-10 items-center justify-center rounded-full bg-black';
  const avatarImageFallback = compact
    ? '/placeholder.svg?height=32&width=32'
    : '/placeholder.svg?height=40&width=40';

  return (
    <div className={`relative user-menu-container ${inMobileMenu ? 'w-full' : ''}`} ref={menuRef}>
      {isCollapsed ? (
        <button
          ref={buttonRef}
          onClick={toggleAccountMenu}
          className="flex w-full items-center justify-center p-2"
          aria-expanded={isAccountMenuOpen}
          aria-haspopup="true"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black">
            {user?.anhDaiDien ? (
              <img
                src={user.anhDaiDien || '/placeholder.svg?height=48&width=48'}
                alt={displayName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5 text-white" />
            )}
          </div>
        </button>
      ) : (
        <button
          ref={buttonRef}
          onClick={toggleAccountMenu}
          className={buttonClasses}
          aria-expanded={isAccountMenuOpen}
          aria-haspopup="true"
        >
          <div className={avatarClasses}>
            {user?.anhDaiDien ? (
              <img
                src={user.anhDaiDien || avatarImageFallback}
                alt={displayName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <User className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-white`} />
            )}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-black">{formatName(displayName)}</p>
            <p className="truncate text-xs text-[var(--clay-muted)]">{userRole}</p>
          </div>
          <ChevronDown
            className={`h-4 w-4 flex-shrink-0 text-[var(--clay-muted)] transition-transform duration-200 ${
              isAccountMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      )}

      <AnimatePresence>
        {isAccountMenuOpen && (
          <motion.div
            ref={floatingMenuRef}
            initial={{
              opacity: 0,
              y: menuPosition.side === 'above' ? -8 : 8,
              scale: 0.98,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: menuPosition.side === 'above' ? -8 : 8,
              scale: 0.98,
            }}
            transition={{ duration: 0.18 }}
            className={`${inMobileMenu ? 'w-full' : isMobile ? 'absolute right-0 z-[1000]' : 'fixed z-[1000] w-72'}`}
            style={{
              transformOrigin: isMobile
                ? 'top right'
                : menuPosition.side === 'above'
                  ? 'bottom left'
                  : menuPosition.side === 'left'
                    ? 'right center'
                    : 'top left',
              ...(isMobile
                ? { top: '100%', right: '0', marginTop: '0.5rem' }
                : {
                    top: `${menuPosition.top}px`,
                    left: `${menuPosition.left}px`,
                    maxHeight: `${menuPosition.maxHeight}px`,
                  }),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="max-h-[inherit] overflow-y-auto overscroll-contain rounded-[18px] border border-[var(--clay-border)] bg-white">
              <div className="border-b border-[var(--clay-border)] p-4">
                <div className="flex items-center space-x-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black">
                    {user?.anhDaiDien ? (
                      <img
                        src={user.anhDaiDien || '/placeholder.svg?height=40&width=40'}
                        alt={displayName}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-lg font-semibold text-white">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-black">{formatName(displayName)}</p>
                    <p className="truncate text-xs text-[var(--clay-muted)]">{userRole}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {user?.diaChiVi && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyToClipboard(user.diaChiVi!);
                      }}
                      className="group flex min-h-8 items-center rounded-full border border-[var(--clay-border)] bg-[var(--clay-surface-soft)] px-2 py-1 transition-colors hover:border-[var(--clay-primary)]"
                      title="Nhấn để sao chép địa chỉ ví"
                    >
                      <FaEthereum className="mr-1 h-3 w-3 text-[var(--clay-primary)]" />
                      <span className="text-xs text-[var(--clay-muted)] group-hover:text-[var(--clay-primary)]">
                        {shortenAddress(user.diaChiVi)}
                      </span>
                    </button>
                  )}

                  <div className="flex min-h-8 items-center rounded-full border border-[var(--clay-border)] bg-[var(--clay-surface-soft)] px-2 py-1">
                    <Shield className="mr-1 h-3 w-3 text-[var(--clay-primary)]" />
                    <span className="text-xs text-[var(--clay-muted)]">Sepolia active</span>
                  </div>
                </div>

                {user?.diaChiVi && (
                  <div className="mt-3 rounded-[18px] border border-[var(--clay-border)] bg-[var(--clay-surface-soft)] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Wallet className="mr-2 h-4 w-4 text-[var(--clay-primary)]" />
                        <div>
                          <span className="text-xs text-[var(--clay-muted)]">Số dư Sepolia ETH</span>
                          <p className="text-sm font-semibold text-black">
                            {isLoading ? (
                              <span className="inline-block h-4 w-12 animate-pulse rounded bg-[var(--clay-border)]" />
                            ) : (
                              `${balance ?? '0.00'} ETH`
                            )}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={refreshBalance}
                        disabled={isRefreshing || isLoading}
                        className="rounded-full border border-[var(--clay-border)] bg-white p-1.5 transition-colors hover:border-[var(--clay-primary)] disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 text-[var(--clay-primary)] ${isRefreshing || isLoading ? 'animate-spin' : ''}`}
                        />
                      </button>
                    </div>

                    {explorerUrl && (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--clay-primary)] hover:underline"
                      >
                        Explorer
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}

                    {error && <p className="mt-2 text-xs text-[var(--clay-pomegranate)]">{error}</p>}
                  </div>
                )}
              </div>

              <div className="py-1">
                <NavLink
                  to="/app/account"
                  className="flex min-h-11 items-center px-4 py-2.5 text-sm text-[var(--clay-text)] transition-colors hover:bg-[var(--clay-surface-soft)]"
                  onClick={() => setIsAccountMenuOpen(false)}
                >
                  <User className="mr-3 h-4 w-4 text-[var(--clay-primary)]" />
                  Thông tin tài khoản
                </NavLink>

                <NavLink
                  to="/app/dashboard"
                  className="flex min-h-11 items-center px-4 py-2.5 text-sm text-[var(--clay-text)] transition-colors hover:bg-[var(--clay-surface-soft)]"
                  onClick={() => setIsAccountMenuOpen(false)}
                >
                  <Wallet className="mr-3 h-4 w-4 text-[var(--clay-primary)]" />
                  Console Sepolia
                </NavLink>

                <NavLink
                  to="/app/notifications"
                  className="flex min-h-11 items-center px-4 py-2.5 text-sm text-[var(--clay-text)] transition-colors hover:bg-[var(--clay-surface-soft)]"
                  onClick={() => setIsAccountMenuOpen(false)}
                >
                  <History className="mr-3 h-4 w-4 text-[var(--clay-primary)]" />
                  Lịch sử hoạt động
                </NavLink>

                <NavLink
                  to="/app/settings"
                  className="flex min-h-11 items-center px-4 py-2.5 text-sm text-[var(--clay-text)] transition-colors hover:bg-[var(--clay-surface-soft)]"
                  onClick={() => setIsAccountMenuOpen(false)}
                >
                  <Settings className="mr-3 h-4 w-4 text-[var(--clay-primary)]" />
                  Cài đặt
                </NavLink>

                <div className="my-1 border-t border-[var(--clay-border)]" />

                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="flex min-h-11 w-full items-center px-4 py-2.5 text-sm text-[var(--clay-pomegranate)] transition-colors hover:bg-[var(--clay-surface-soft)]"
                >
                  <LogOut className="mr-3 h-4 w-4 text-[var(--clay-pomegranate)]" />
                  Đăng xuất
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md rounded-[18px] border border-[var(--clay-border)] bg-white p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-2 text-xl font-semibold text-black">Xác nhận đăng xuất</h3>
              <p className="mb-6 text-[var(--clay-muted)]">Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?</p>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 rounded-full border border-[var(--clay-border)] bg-white px-4 py-2 text-[var(--clay-primary)] transition-colors hover:bg-[var(--clay-surface-soft)]"
                >
                  Hủy
                </button>
                <button
                  onClick={confirmLogout}
                  className="flex-1 rounded-full bg-[var(--clay-pomegranate)] px-4 py-2 text-white transition-transform active:scale-95"
                >
                  Đăng xuất
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserMenu;
