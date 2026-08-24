import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AssignmentPage, AuditPage, CourseDetailPage, CoursesPage, HomePage, NotificationsPage, PeoplePage, ReviewDetailPage } from "./pages/LmsPages";
import { AssignmentBuilderPage, FeedbackPage, LearnerDashboardExtras, OperationsPage, ReviewCenterPage } from "./pages/LmsOperations";
import NotFound from "./pages/NotFound";

function Router() {
  return <DashboardLayout><Switch><Route path="/">{() => <><HomePage /><LearnerDashboardExtras /></>}</Route><Route path="/courses" component={CoursesPage} /><Route path="/courses/:id" component={CourseDetailPage} /><Route path="/operations" component={OperationsPage} /><Route path="/assignments/:id" component={AssignmentPage} /><Route path="/assignment-builder/:id" component={AssignmentBuilderPage} /><Route path="/review-queue" component={ReviewCenterPage} /><Route path="/reviews/:id" component={ReviewDetailPage} /><Route path="/feedback" component={FeedbackPage} /><Route path="/people" component={PeoplePage} /><Route path="/audit" component={AuditPage} /><Route path="/notifications" component={NotificationsPage} /><Route component={NotFound} /></Switch></DashboardLayout>;
}

export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors position="top-right" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
