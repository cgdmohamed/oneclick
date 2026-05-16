import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";

import PublicLayout from "./layouts/PublicLayout";
import AppLayout from "./layouts/AppLayout";

import Home from "./pages/public/Home";
import Features from "./pages/public/Features";
import Pricing from "./pages/public/Pricing";
import About from "./pages/public/About";
import Contact from "./pages/public/Contact";
import Login from "./pages/public/Login";
import Register from "./pages/public/Register";
import PublicInvoice from "./pages/public/PublicInvoice";
import ForgotPassword from "./pages/public/ForgotPassword";
import ResetPassword from "./pages/public/ResetPassword";

import Overview from "./pages/app/Overview";
import Clients from "./pages/app/Clients";
import ClientDetail from "./pages/app/ClientDetail";
import Invoices from "./pages/app/Invoices";
import NewInvoice from "./pages/app/NewInvoice";
import InvoiceDetails from "./pages/app/InvoiceDetails";
import Payments from "./pages/app/Payments";
import Accounts from "./pages/app/Accounts";
import Products from "./pages/app/Products";
import Reports from "./pages/app/Reports";
import ReportDetail from "./pages/app/ReportDetail";
import Notifications from "./pages/app/Notifications";
import Users from "./pages/app/Users";
import Settings from "./pages/app/Settings";
import Subscription from "./pages/app/Subscription";
import ActivityLog from "./pages/app/ActivityLog";

import AdminOverview from "./pages/admin/AdminOverview";
import Companies from "./pages/admin/Companies";
import Plans from "./pages/admin/Plans";
import Subscriptions from "./pages/admin/Subscriptions";
import AdminPayments from "./pages/admin/AdminPayments";
import PlatformWallets from "./pages/admin/PlatformWallets";
import FeatureAccess from "./pages/admin/FeatureAccess";
import SystemNotifications from "./pages/admin/SystemNotifications";
import SystemSettings from "./pages/admin/SystemSettings";
import LandingContent from "./pages/admin/LandingContent";
import TrackingSettings from "./pages/admin/TrackingSettings";

import { TrackingScripts } from "./components/common/TrackingScripts";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" dir="rtl" />
      <BrowserRouter>
        <AuthProvider>
          <TrackingScripts />
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/features" element={<Features />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
            </Route>

            <Route path="/invoice/:publicId" element={<PublicInvoice />} />

            <Route path="/app" element={<AppLayout kind="company" />}>
              <Route index element={<Overview />} />
              <Route path="clients" element={<Clients />} />
              <Route path="clients/:id" element={<ClientDetail />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="invoices/new" element={<NewInvoice />} />
              <Route path="invoices/:id" element={<InvoiceDetails />} />
              <Route path="payments" element={<Payments />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="products" element={<Products />} />
              <Route path="reports" element={<Reports />} />
              <Route path="reports/:type" element={<ReportDetail />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="users" element={<Users />} />
              <Route path="subscription" element={<Subscription />} />
              <Route path="settings" element={<Settings />} />
              <Route path="activity" element={<ActivityLog />} />
            </Route>

            <Route path="/admin" element={<AppLayout kind="admin" />}>
              <Route index element={<AdminOverview />} />
              <Route path="companies" element={<Companies />} />
              <Route path="plans" element={<Plans />} />
              <Route path="subscriptions" element={<Subscriptions />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="wallets" element={<PlatformWallets />} />
              <Route path="feature-access" element={<FeatureAccess />} />
              <Route path="notifications" element={<SystemNotifications />} />
              <Route path="landing" element={<LandingContent />} />
              <Route path="settings" element={<SystemSettings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
