import React from "react";
import {
  createHashRouter,
  RouterProvider,
  Navigate,
  Outlet,
  NavLink,
  useNavigate,
} from "react-router-dom";
import { ConfigProvider, Layout, Menu, Spin, Space, Button, theme } from "antd";
import {
  DashboardOutlined,
  IdcardOutlined,
  UserOutlined,
  KeyOutlined,
  FileSearchOutlined,
  LogoutOutlined,
} from "@ant-design/icons";

import { AuthProvider, useAuth } from "./lib/AuthContext";
import ReaderStatus from "./components/ReaderStatus";

import LoginPage from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import CardListPage from "./pages/CardList";
import CardDetailPage from "./pages/CardDetail";
import PersonalizeWizardPage from "./pages/PersonalizeWizard";
import KeyManagementPage from "./pages/KeyManagement";
import AuditLogPage from "./pages/AuditLog";
import UserListPage from "./pages/UserList";

const { Header, Sider, Content } = Layout;

const NAV = [
  { key: "/dashboard", icon: <DashboardOutlined />, label: "Dashboard" },
  { key: "/cards", icon: <IdcardOutlined />, label: "Cards" },
  { key: "/users", icon: <UserOutlined />, label: "Cardholders" },
  { key: "/keysets", icon: <KeyOutlined />, label: "Key management" },
  { key: "/audit", icon: <FileSearchOutlined />, label: "Audit log" },
];

/** Blocks the app until an operator is signed in. */
const RequireAuth: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Shell />;
};

const Shell: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <Layout style={{ height: "100vh" }}>
      <Sider width={220} theme="dark">
        <div
          style={{
            color: "#fff",
            padding: "18px 20px",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          CMS Terminal
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.hash.replace("#", "") || "/dashboard"]}
          items={NAV.map((item) => ({
            key: item.key,
            icon: item.icon,
            label: <NavLink to={item.key}>{item.label}</NavLink>,
          }))}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingInline: 24,
          }}
        >
          <ReaderStatus />
          <Space size="middle">
            <span style={{ color: "#595959" }}>
              {user?.fullName} · <strong>{user?.role}</strong>
            </span>
            <Button icon={<LogoutOutlined />} onClick={onLogout}>
              Sign out
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, overflowY: "auto" }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

const router = createHashRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "cards", element: <CardListPage /> },
      { path: "cards/:id", element: <CardDetailPage /> },
      { path: "cards/:id/personalize", element: <PersonalizeWizardPage /> },
      { path: "users", element: <UserListPage /> },
      { path: "keysets", element: <KeyManagementPage /> },
      { path: "audit", element: <AuditLogPage /> },
    ],
  },
]);

const App: React.FC = () => (
  <ConfigProvider
    theme={{
      algorithm: theme.defaultAlgorithm,
      token: { colorPrimary: "#1677ff", borderRadius: 6 },
    }}
  >
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </ConfigProvider>
);

export default App;
