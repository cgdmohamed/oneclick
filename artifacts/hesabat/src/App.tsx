import { useEffect, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { getCurrencySymbol, setCurrencySymbol, subscribeCurrency } from "@/lib/currency";

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
import AcceptInvite from "./pages/public/AcceptInvite";
import VerifyEmail from "./pages/public/VerifyEmail";
import ConfirmEmailChange from "./pages/public/ConfirmEmailChange";

import Overview from "./pages/app/Overview";
import Clients from "./pages/app/Clients";
import ClientDetail from "./pages/app/ClientDetail";
import Suppliers from "./pages/app/Suppliers";
import SupplierDetail from "./pages/app/SupplierDetail";
import Payouts from "./pages/app/Payouts";
import Invoices from "./pages/app/Invoices";
import InvoiceDetails from "./pages/app/InvoiceDetails";
import Payments from "./pages/app/Payments";
import Accounts from "./pages/app/Accounts";
import Branches from "./pages/app/Branches";
import CostCenters from "./pages/app/CostCenters";
import Projects from "./pages/app/Projects";
import Products from "./pages/app/Products";
import ProductDetails from "./pages/app/ProductDetails";
import Reports from "./pages/app/Reports";
import ReportDetail from "./pages/app/ReportDetail";
import ChartOfAccounts from "./pages/app/accounting/ChartOfAccounts";
import FiscalYears from "./pages/app/accounting/FiscalYears";
import AccountingSettings from "./pages/app/accounting/AccountingSettings";
import JournalEntries from "./pages/app/accounting/JournalEntries";
import JournalEntryDetails from "./pages/app/accounting/JournalEntryDetails";
import NewJournalEntry from "./pages/app/accounting/NewJournalEntry";
import OpeningBalances from "./pages/app/accounting/OpeningBalances";
import BadDebts from "./pages/app/accounting/BadDebts";
import YearEndClosing from "./pages/app/accounting/YearEndClosing";
import AssetCategories from "./pages/app/accounting/AssetCategories";
import FixedAssets from "./pages/app/accounting/FixedAssets";
import NewFixedAsset from "./pages/app/accounting/NewFixedAsset";
import FixedAssetDetails from "./pages/app/accounting/FixedAssetDetails";
import DepreciationRuns from "./pages/app/accounting/DepreciationRuns";
import NewDepreciationRun from "./pages/app/accounting/NewDepreciationRun";
import Employees from "./pages/app/accounting/Employees";
import SalaryComponents from "./pages/app/accounting/SalaryComponents";
import PayrollRuns from "./pages/app/accounting/PayrollRuns";
import NewPayrollRun from "./pages/app/accounting/NewPayrollRun";
import PayrollRunDetails from "./pages/app/accounting/PayrollRunDetails";
import BankReconciliations from "./pages/app/accounting/BankReconciliations";
import NewBankReconciliation from "./pages/app/accounting/NewBankReconciliation";
import BankReconciliationDetails from "./pages/app/accounting/BankReconciliationDetails";
import PurchaseInvoices from "./pages/app/accounting/PurchaseInvoices";
import NewPurchaseInvoice from "./pages/app/accounting/NewPurchaseInvoice";
import PurchaseInvoiceDetails from "./pages/app/accounting/PurchaseInvoiceDetails";
import PurchaseReturns from "./pages/app/accounting/PurchaseReturns";
import NewPurchaseReturn from "./pages/app/accounting/NewPurchaseReturn";
import PurchaseReturnDetails from "./pages/app/accounting/PurchaseReturnDetails";
import InventoryWriteOffs from "./pages/app/accounting/InventoryWriteOffs";
import NewInventoryWriteOff from "./pages/app/accounting/NewInventoryWriteOff";
import InventoryWriteOffDetails from "./pages/app/accounting/InventoryWriteOffDetails";
import CreditNotes from "./pages/app/accounting/CreditNotes";
import NewCreditNote from "./pages/app/accounting/NewCreditNote";
import CreditNoteDetails from "./pages/app/accounting/CreditNoteDetails";
import DebitNotes from "./pages/app/accounting/DebitNotes";
import NewDebitNote from "./pages/app/accounting/NewDebitNote";
import DebitNoteDetails from "./pages/app/accounting/DebitNoteDetails";
import SupplierPayments from "./pages/app/accounting/SupplierPayments";
import FinancialReports from "./pages/app/accounting/FinancialReports";
import FinancialReportDetail from "./pages/app/accounting/FinancialReportDetail";
import Notifications from "./pages/app/Notifications";
import AlertsLog from "./pages/app/AlertsLog";
import Users from "./pages/app/Users";
import Settings from "./pages/app/Settings";
import AccountSettings from "./pages/app/AccountSettings";
import Subscription from "./pages/app/Subscription";
import ActivityLog from "./pages/app/ActivityLog";

import AdminOverview from "./pages/admin/AdminOverview";
import Companies from "./pages/admin/Companies";
import CompaniesAndUsers from "./pages/admin/CompaniesAndUsers";
import Plans from "./pages/admin/Plans";
import Subscriptions from "./pages/admin/Subscriptions";

import PlatformWallets from "./pages/admin/PlatformWallets";
import FeatureAccess from "./pages/admin/FeatureAccess";
import SystemNotifications from "./pages/admin/SystemNotifications";
import SystemSettings from "./pages/admin/SystemSettings";
import AdminAccountSettings from "./pages/admin/AdminAccountSettings";
import LandingContent from "./pages/admin/LandingContent";
import TrackingSettings from "./pages/admin/TrackingSettings";
import Analytics from "./pages/admin/Analytics";
import Users360 from "./pages/admin/Users360";
import UserDetail360 from "./pages/admin/UserDetail360";
import RolesAndPermissions from "./pages/admin/RolesAndPermissions";
import AuditLog from "./pages/admin/AuditLog";
import Approvals from "./pages/admin/Approvals";

import { TrackingScripts } from "./components/common/TrackingScripts";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  // Re-render the whole tree when the global currency symbol changes.
  useSyncExternalStore(subscribeCurrency, getCurrencySymbol, getCurrencySymbol);

  // Seed the currency symbol from platform general settings on startup.
  useEffect(() => {
    fetch('/api/platform/settings/general')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.data?.currency) setCurrencySymbol(json.data.currency);
      })
      .catch(() => {});
  }, []);

  return (
  <DirectionProvider dir="rtl">
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
              <Route path="/verify-email" element={<VerifyEmail />} />
            </Route>

            <Route path="/invoice/:publicId" element={<PublicInvoice />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />

            <Route path="/app" element={<AppLayout kind="company" />}>
              <Route index element={<Overview />} />
              <Route path="clients" element={<Clients />} />
              <Route path="clients/:id" element={<ClientDetail />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="suppliers/:id" element={<SupplierDetail />} />
              <Route path="payouts" element={<Payouts />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="invoices/new" element={<Navigate to="/app/invoices?new=1" replace />} />
              <Route path="invoices/:id" element={<InvoiceDetails />} />
              <Route path="credit-notes" element={<CreditNotes />} />
              <Route path="credit-notes/new" element={<NewCreditNote />} />
              <Route path="credit-notes/:id" element={<CreditNoteDetails />} />
              <Route path="debit-notes" element={<DebitNotes />} />
              <Route path="debit-notes/new" element={<NewDebitNote />} />
              <Route path="debit-notes/:id" element={<DebitNoteDetails />} />
              <Route path="payments" element={<Payments />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="branches" element={<Branches />} />
              <Route path="cost-centers" element={<CostCenters />} />
              <Route path="projects" element={<Projects />} />
              <Route path="products" element={<Products />} />
              <Route path="products/:id" element={<ProductDetails />} />
              <Route path="reports" element={<Reports />} />
              <Route path="reports/:type" element={<ReportDetail />} />
              <Route path="accounting/chart" element={<ChartOfAccounts />} />
              <Route path="accounting/fiscal-years" element={<FiscalYears />} />
              <Route path="accounting/settings" element={<AccountingSettings />} />
              <Route path="accounting/journals" element={<JournalEntries />} />
              <Route path="accounting/journals/new" element={<NewJournalEntry />} />
              <Route path="accounting/journals/:id" element={<JournalEntryDetails />} />
              <Route path="accounting/opening-balances" element={<OpeningBalances />} />
              <Route path="accounting/bad-debts" element={<BadDebts />} />
              <Route path="accounting/year-end-closing" element={<YearEndClosing />} />
              <Route path="accounting/asset-categories" element={<AssetCategories />} />
              <Route path="accounting/assets" element={<FixedAssets />} />
              <Route path="accounting/assets/new" element={<NewFixedAsset />} />
              <Route path="accounting/assets/:id" element={<FixedAssetDetails />} />
              <Route path="accounting/depreciation-runs" element={<DepreciationRuns />} />
              <Route path="accounting/depreciation-runs/new" element={<NewDepreciationRun />} />
              <Route path="accounting/employees" element={<Employees />} />
              <Route path="accounting/salary-components" element={<SalaryComponents />} />
              <Route path="accounting/payroll-runs" element={<PayrollRuns />} />
              <Route path="accounting/payroll-runs/new" element={<NewPayrollRun />} />
              <Route path="accounting/payroll-runs/:id" element={<PayrollRunDetails />} />
              <Route path="accounting/bank-reconciliations" element={<BankReconciliations />} />
              <Route path="accounting/bank-reconciliations/new" element={<NewBankReconciliation />} />
              <Route path="accounting/bank-reconciliations/:id" element={<BankReconciliationDetails />} />
              <Route path="accounting/reports" element={<FinancialReports />} />
              <Route path="accounting/reports/:type" element={<FinancialReportDetail />} />
              <Route path="purchases/invoices" element={<PurchaseInvoices />} />
              <Route path="purchases/invoices/new" element={<NewPurchaseInvoice />} />
              <Route path="purchases/invoices/:id" element={<PurchaseInvoiceDetails />} />
              <Route path="purchases/returns" element={<PurchaseReturns />} />
              <Route path="purchases/returns/new" element={<NewPurchaseReturn />} />
              <Route path="purchases/returns/:id" element={<PurchaseReturnDetails />} />
              <Route path="inventory-write-offs" element={<InventoryWriteOffs />} />
              <Route path="inventory-write-offs/new" element={<NewInventoryWriteOff />} />
              <Route path="inventory-write-offs/:id" element={<InventoryWriteOffDetails />} />
              <Route path="purchases/supplier-payments" element={<SupplierPayments />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="alerts-log" element={<AlertsLog />} />
              <Route path="users" element={<Users />} />
              <Route path="subscription" element={<Subscription />} />
              <Route path="settings" element={<Settings />} />
              <Route path="settings/account" element={<AccountSettings />} />
              <Route path="activity" element={<ActivityLog />} />
            </Route>

            <Route path="/admin" element={<AppLayout kind="admin" />}>
              <Route index element={<AdminOverview />} />
              <Route path="companies" element={<CompaniesAndUsers />} />
              <Route path="plans" element={<Plans />} />
              <Route path="subscriptions" element={<Subscriptions />} />
              
              <Route path="wallets" element={<PlatformWallets />} />
              <Route path="feature-access" element={<FeatureAccess />} />
              <Route path="notifications" element={<SystemNotifications />} />
              <Route path="landing" element={<LandingContent />} />
              <Route path="tracking" element={<TrackingSettings />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="users" element={<Users360 />} />
              <Route path="users/:id" element={<UserDetail360 />} />
              <Route path="roles" element={<RolesAndPermissions />} />
              <Route path="audit-log" element={<AuditLog />} />
              <Route path="approvals" element={<Approvals />} />
              <Route path="settings" element={<SystemSettings />} />
              <Route path="settings/account" element={<AdminAccountSettings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </DirectionProvider>
  );
};

export default App;
