import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { QuickAddProvider } from "./components/matches/QuickAddProvider";
import { ToastProvider } from "./components/ui/Toast";
import { ThemeProvider } from "./lib/theme";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { SessionProvider } from "./services/session-context";
import { DashboardPage } from "./pages/DashboardPage";
import { MatchesPage } from "./pages/MatchesPage";
import { MatchDetailPage } from "./pages/MatchDetailPage";
import { MatchFormPage } from "./pages/MatchFormPage";
import { ReviewPage } from "./pages/ReviewPage";
import { ReviewDraftsPage } from "./pages/ReviewDraftsPage";
import { StatisticsPage } from "./pages/StatisticsPage";
import { TrainingGoalsPage } from "./pages/TrainingGoalsPage";
import { WeeklyReviewPage } from "./pages/WeeklyReviewPage";
import { DataPage } from "./pages/DataPage";
import { DataCenterPage } from "./pages/DataCenterPage";
import { GuidePage } from "./pages/GuidePage";

export function App() {
  return (
    <HashRouter>
      <ThemeProvider>
        <ToastProvider>
          <SessionProvider>
            <QuickAddProvider>
              <AppShell>
                <ErrorBoundary>
                  <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/matches" element={<MatchesPage />} />
                <Route path="/matches/new" element={<MatchFormPage mode="create" />} />
                <Route path="/matches/:id" element={<MatchDetailPage />} />
                <Route path="/matches/:id/edit" element={<MatchFormPage mode="edit" />} />
                <Route path="/matches/:id/review" element={<ReviewPage />} />
                <Route path="/drafts" element={<ReviewDraftsPage />} />
                <Route path="/statistics" element={<StatisticsPage />} />
                <Route path="/data-center" element={<DataCenterPage />} />
                <Route path="/goals" element={<TrainingGoalsPage />} />
                <Route path="/weekly" element={<WeeklyReviewPage />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/guide" element={<GuidePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </ErrorBoundary>
              </AppShell>
          </QuickAddProvider>
        </SessionProvider>
      </ToastProvider>
    </ThemeProvider>
    </HashRouter>
  );
}
