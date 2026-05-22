import type React from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';

// Đợt 14: redirect giữ params cho luồng forgot-password (legacy VN → EN canonical).
const ForgotOptionsRedirect = () => {
  const { username, randomCode } = useParams<{ username: string; randomCode: string }>();
  return <Navigate to={`/forgot-password/account/${username}/${randomCode}/options`} replace />;
};
const ForgotSendOtpRedirect = () => {
  const { username, randomCode } = useParams<{ username: string; randomCode: string }>();
  return <Navigate to={`/forgot-password/account/${username}/${randomCode}/send-otp`} replace />;
};
const ForgotResetRedirect = () => {
  const { username, randomCode } = useParams<{ username: string; randomCode: string }>();
  return <Navigate to={`/forgot-password/account/${username}/${randomCode}/reset`} replace />;
};
const RulesRedirect = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/app/elections/${id}/rules`} replace />;
};
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';

// Đợt 13 (hiệu năng): route-level code-splitting. Shell/ErrorPage/HOC/provider
// giữ static (cần ngay/độ tin cậy); mọi trang ../pages/* → lazy() ⇒ tách chunk
// theo route, giảm mạnh bundle index ban đầu. Routing/guard/redirect KHÔNG đổi.
import AppBeforeLogin from '../AppBeforeLogin';
import AppAfterLogin from '../AppAfterLogin';
import ErrorPage from '../pages/ErrorPage';
import ThongBaoKhongCoPhien from '../components/ThongBaoKhongCoCuocBauCu';
import ProtectedRoute from '../routes/ProtectedRoute';
import { Web3Provider } from '../context/Web3Context';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../components/ui/Use-toast';
import { ReCaptchaProvider } from '../components/ui/Use-recaptcha';
import { isRecaptchaEnabled } from '../config/runtimeFlags';

const CacPhienBauCuPage = lazy(() => import('../pages/CacCuocBauCuPage'));
const LoginPage = lazy(() => import('../pages/LoginPage'));
const RoleManagementPage = lazy(() => import('../pages/QuanLyVaiTroAdminPage'));
const RoleAssignmentPage = lazy(() => import('../pages/PhanQuyenAdminPage'));
const AccountInfoPage = lazy(() => import('../pages/ThongTinTaiKhoanPage'));
const WelcomePage = lazy(() => import('../pages/ChaoMungPage'));
const ThankYouPage = lazy(() => import('../pages/CamOnPage'));
const FindAccountPage = lazy(() => import('../pages/TimTaiKhoanPage'));
const AccountOptionsPage = lazy(() => import('../pages/TuyChonTaiKhoanPage'));
const RegisterPage = lazy(() => import('../pages/DangKyTaiKhoanPage'));
const SettingsPage = lazy(() => import('../pages/CaiDatPage'));
const UserElectionsPage = lazy(() => import('../pages/CuocBauCuCuaNguoiDungPage'));
const TaoPhienBauCuPage = lazy(() => import('../pages/TaoCuocBauCuPage'));
const UpcomingElectionsPage = lazy(() => import('../pages/ThongBaoCuocBauCuPage'));
const ElectionTienHanh = lazy(() => import('../pages/ThongTinChiTietCuocBauCu'));
const ChinhSachBaoMat = lazy(() => import('../pages/ChinhSachBaoMatPage'));
const DieuKhoanSuDung = lazy(() => import('../pages/DieuKhoanSuDungPage'));
const LienHePage = lazy(() => import('../pages/LienHe'));
const UnauthorizedPage = lazy(() => import('../pages/UnauthoriedPage'));
const GuiOTPPage = lazy(() => import('../pages/GuiOTPPage'));
const DatLaiMatKhauPage = lazy(() => import('../pages/DatLaiMatKhauPage'));
const QuanLyFilePage = lazy(() => import('../pages/QuanLyFilePage'));
const QuetMaQRPage = lazy(() => import('../pages/QuetMaQRPage'));
const QuanLySmartContractPage = lazy(() => import('../pages/QuanLySmartContractPage'));
const FAQ = lazy(() => import('../pages/FaqPage'));
const BlockchainSetupPage = lazy(() => import('../pages/BlockchainSetupPage'));
const DieuLePage = lazy(() => import('../pages/DieuLePage'));
const VoterVerificationPage = lazy(() => import('../pages/VoterVerificationPage'));

const AdminPage = lazy(() => import('../pages/AdminPage'));

// Đợt 13.2: RouteFallback dedupe sang components/RouteFallback (dùng ở 3 nơi).
import { RouteFallback } from '../components/RouteFallback';

// Bọc toàn bộ ứng dụng trong các providers cần thiết
const AppWithProviders = ({
  children,
  useRecaptcha = false,
}: {
  children: React.ReactNode;
  useRecaptcha?: boolean;
}) => {
  const content = (
    <Web3Provider>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </Web3Provider>
  );

  return (
    <ThemeProvider>
      <ToastProvider>
        {useRecaptcha && isRecaptchaEnabled ? (
        <GoogleReCaptchaProvider
          reCaptchaKey={import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? ''}
          scriptProps={{
            async: false,
            defer: true,
            appendTo: 'body',
          }}
          container={{
            parameters: {
              badge: 'bottomright',
              theme: 'dark',
            },
          }}
        >
          <ReCaptchaProvider>
            {content}
          </ReCaptchaProvider>
        </GoogleReCaptchaProvider>
      ) : (
          content
        )}
      </ToastProvider>
    </ThemeProvider>
  );
};

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AppWithProviders>
        <AppBeforeLogin />
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
    children: [
      {
        index: true,
        element: <WelcomePage />,
      },
      {
        path: 'thong-bao-khong-co-phien',
        element: <ThongBaoKhongCoPhien />,
      },

      // {
      //   path: 'blockchain-realtime',
      //   element: <ThongTinBlockchainRealTimePage />,
      // },
      {
        path: 'elections',
        element: <CacPhienBauCuPage />,
      },
      {
        path: 'verify-voter',
        element: <VoterVerificationPage />,
      },
      // === Forgot password flow (canonical EN, Đợt 14) ===
      {
        path: 'forgot-password',
        element: <FindAccountPage />,
      },
      {
        path: 'forgot-password/account/:username/:randomCode/options',
        element: <AccountOptionsPage />,
      },
      {
        path: 'forgot-password/account/:username/:randomCode/send-otp',
        element: <GuiOTPPage />,
      },
      {
        path: 'forgot-password/account/:username/:randomCode/reset',
        element: <DatLaiMatKhauPage />,
      },
      // Legacy VN redirect (backward compat)
      { path: 'tim-tai-khoan', element: <Navigate to="/forgot-password" replace /> },
      {
        path: 'tim-tai-khoan/:username/:randomCode/tuy-chon',
        element: <ForgotOptionsRedirect />,
      },
      {
        path: 'tim-tai-khoan/:username/:randomCode/tuy-chon/gui-otp',
        element: <ForgotSendOtpRedirect />,
      },
      {
        path: 'tim-tai-khoan/:username/:randomCode/tuy-chon/gui-otp/dat-lai-mat-khau',
        element: <ForgotResetRedirect />,
      },
      {
        path: 'unauthorized',
        element: <UnauthorizedPage />,
      },
      { path: 'chua-xac-thuc', element: <Navigate to="/unauthorized" replace /> },
      {
        path: 'register',
        element: (
          <AppWithProviders useRecaptcha={true}>
            <RegisterPage />
          </AppWithProviders>
        ),
      },
    ],
  },
  {
    path: 'login',
    element: (
      <AppWithProviders useRecaptcha={true}>
        <LoginPage />
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
  },
  {
    path: 'privacy',
    element: (
      <AppWithProviders>
        <ChinhSachBaoMat />
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
  },
  { path: 'chinh-sach-bao-mat', element: <Navigate to="/privacy" replace /> },
  {
    path: 'terms',
    element: (
      <AppWithProviders>
        <DieuKhoanSuDung />
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
  },
  { path: 'dieu-khoan-su-dung', element: <Navigate to="/terms" replace /> },
  {
    path: 'faq',
    element: (
      <AppWithProviders>
        <FAQ />
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
  },
  {
    path: 'contact',
    element: (
      <AppWithProviders>
        <LienHePage />
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
  },
  { path: 'lien-he', element: <Navigate to="/contact" replace /> },
  {
    path: 'blockchain-setup',
    element: (
      <AppWithProviders>
        <BlockchainSetupPage />
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
  },
  {
    path: 'main',
    element: (
      <AppWithProviders>
        <Navigate to="/app" replace />
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
  },
  {
    path: 'thanks',
    element: (
      <AppWithProviders>
        <ThankYouPage />
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
  },
  { path: 'thank-you', element: <Navigate to="/thanks" replace /> },
  {
    path: '/invite',
    element: (
      <AppWithProviders>
        <Navigate to="/app/scan" replace />
      </AppWithProviders>
    ),
  },
  {
    path: 'bat-dau-cuoc-bau-cu',
    element: (
      <AppWithProviders>
        <Navigate to="/app/elections/new" replace />
      </AppWithProviders>
    ),
  },
  {
    path: 'cap-phieu-bau',
    element: (
      <AppWithProviders>
        <Navigate to="/app/scan" replace />
      </AppWithProviders>
    ),
  },
  {
    path: '/app',
    element: (
      <AppWithProviders>
        <ProtectedRoute requiredPermissions={['Quan Tri Vien', 'Nguoi Dung']}>
          <AppAfterLogin />
        </ProtectedRoute>
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/app/dashboard" replace />,
      },
      // Đợt 14: 'elections' canonical = UserElectionsPage (định nghĩa bên dưới).
      // 'elections/new' canonical = TaoCuocBauCuPage. Sub-path redirect cũ:
      {
        path: 'elections/:id',
        element: <Navigate to="/app/elections" replace />,
      },
      {
        path: 'elections/:id/session/:idPhien',
        element: <Navigate to="/app/dashboard" replace />,
      },
      {
        path: 'elections/new',
        element: <TaoPhienBauCuPage />,
      },
      { path: 'tao-phien-bau-cu', element: <Navigate to="/app/elections/new" replace /> },
      {
        path: 'elections/:id/elections-tienhanh',
        element: (
          <ProtectedRoute
            requiredPermissions={['Quan Tri Vien', 'Nguoi Dung']}
            requiresElectionAccess={true}
          >
            <ElectionTienHanh />
          </ProtectedRoute>
        ),
      },
      {
        path: 'account',
        element: <AccountInfoPage />,
      },
      { path: 'account-info', element: <Navigate to="/app/account" replace /> },
      {
        path: 'notifications',
        element: <UpcomingElectionsPage />,
      },
      { path: 'upcoming-elections', element: <Navigate to="/app/notifications" replace /> },
      {
        path: 'admin',
        element: (
          <Suspense
            fallback={<div className="text-center p-5 text-xl text-slate-900">Loading...</div>}
          >
            <AdminPage />
          </Suspense>
        ),
      },
      {
        path: 'admin/roles',
        element: (
          <ProtectedRoute requiredPermissions={['Quan Tri Vien', 'Quản Lý Vai Trò']}>
            <RoleManagementPage />
          </ProtectedRoute>
        ),
      },
      { path: 'role-management', element: <Navigate to="/app/admin/roles" replace /> },
      {
        path: 'admin/permissions',
        element: (
          <ProtectedRoute requiredPermissions={['Quan Tri Vien', 'Quản Lý Vai Trò']}>
            <RoleAssignmentPage />
          </ProtectedRoute>
        ),
      },
      { path: 'role-assignment', element: <Navigate to="/app/admin/permissions" replace /> },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: 'files',
        element: <QuanLyFilePage />,
      },
      { path: 'quan-ly-file', element: <Navigate to="/app/files" replace /> },
      {
        path: 'scan',
        element: <QuetMaQRPage />,
      },
      { path: 'quet-ma-qr', element: <Navigate to="/app/scan" replace /> },
      {
        path: 'elections',
        element: <UserElectionsPage />,
      },
      { path: 'user-elections', element: <Navigate to="/app/elections" replace /> },
      // Thêm route trực tiếp cho trang quản lý phiên bầu cử blockchain
      {
        path: 'election-session-manager',
        element: <Navigate to="/app/dashboard" replace />,
      },
      // Thêm route cho trang quản lý phiên bầu cử blockchain với tham số ID
      {
        path: 'election-session-manager/:id',
        element: <Navigate to="/app/dashboard" replace />,
      },
      {
        path: 'user-elections/elections/:id/election-management',
        element: <Navigate to="/app/dashboard" replace />,
      },
      {
        path: 'user-elections/elections/:id/election-management/:idPhien/phien-bau-cu',
        element: <Navigate to="/app/dashboard" replace />,
      },
      // Thêm route mới cho trang triển khai phiên bầu cử lên blockchain
      {
        path: 'user-elections/elections/:id/session/:sessionId/deploy',
        element: <Navigate to="/app/dashboard" replace />,
      },
      {
        path: 'user-elections/elections/:id/edit',
        element: <Navigate to="/app/elections/new" replace />,
      },
      {
        path: 'user-elections/elections/:id/election-management/candidate-management',
        element: <Navigate to="/app/elections/new" replace />,
      },
      {
        path: 'user-elections/elections/:id/election-management/voter-management',
        element: <Navigate to="/app/elections/new" replace />,
      },
      {
        path: 'invite',
        element: <Navigate to="/app/scan" replace />,
      },
      {
        path: 'quan-ly-thanh-tuu',
        element: <Navigate to="/app/elections" replace />,
      },
      {
        path: 'ket-qua-bau-cu',
        element: <Navigate to="/app/elections" replace />,
      },
      {
        path: 'dashboard',
        element: <QuanLySmartContractPage />,
      },
      { path: 'quan-ly-smart-contract', element: <Navigate to="/app/dashboard" replace /> },
      {
        path: 'user-elections/elections/:id/blockchain-deployment',
        element: <Navigate to="/app/dashboard" replace />,
      },
      {
        path: 'elections/:id/rules',
        element: (
          <ProtectedRoute
            requiredPermissions={['Quan Tri Vien', 'Nguoi Dung']}
            requiresElectionAccess={true}
          >
            <DieuLePage />
          </ProtectedRoute>
        ),
      },
      // Legacy redirect (giữ :id qua params).
      {
        path: 'user-elections/elections/:id/rules',
        element: <RulesRedirect />,
      },
      // Thêm route cho trang ThamGiaBauCu
      {
        path: 'elections/:id/session/:idPhien/participate',
        element: (
          <ProtectedRoute requiredPermissions={['Quan Tri Vien', 'Nguoi Dung']}>
            <QuanLySmartContractPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'user-elections/elections/:id/session/:idPhien/edit',
        element: <Navigate to="/app/elections/new" replace />,
      },
    ],
  },
  {
    path: '*',
    element: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
    errorElement: (
      <AppWithProviders>
        <ErrorPage />
      </AppWithProviders>
    ),
  },
]);

export function AppRoutes() {
  return <RouterProvider router={router} />;
}
