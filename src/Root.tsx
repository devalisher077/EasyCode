import { t } from "./lib/i18n";
import { lazy, Suspense, useEffect, useState } from "react";
import { LandingPage } from "./components/LandingPage";
import { useAccount } from "./lib/useAccount";
import type { Profile, Role } from "./lib/types";
import { useLanguage } from "./lib/i18n";

const LearningApp = lazy(() => import("./App"));

export default function Root() {
  useLanguage();
  const [location, setLocation] = useState(
    () => window.location.pathname + window.location.search,
  );
  const pathname = location.split("?")[0];
  const inWorkspace =
    pathname === "/learn" || pathname.startsWith("/learn/topic/");
  const account = useAccount(inWorkspace);
  useEffect(() => {
    const onPop = () =>
      setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setLocation(path);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function enter(profile = account.profile) {
    navigate(profile?.role === "teacher" ? "/learn?view=classroom" : "/learn");
  }
  function authenticated(profile: Profile) {
    account.refresh();
    enter(profile);
  }
  function openAuth(mode: "login" | "register", role: Role = "student") {
    navigate(`/${mode}${role === "teacher" ? "?role=teacher" : ""}`);
  }
  if (inWorkspace)
    return (
      <Suspense
        fallback={
          <div className="lp-loading" role="status">
            {t("Открываем твоё пространство…")}
          </div>
        }
      >
        <LearningApp
          account={account}
          route={location}
          onNavigate={navigate}
          onHome={() => navigate("/")}
        />
      </Suspense>
    );
  return (
    <LandingPage
      account={account}
      initialRole={
        new URLSearchParams(location.split("?")[1]).get("role") === "teacher"
          ? "teacher"
          : "student"
      }
      authMode={
        pathname === "/login"
          ? "login"
          : pathname === "/register"
            ? "register"
            : null
      }
      onAuth={openAuth}
      onCloseAuth={() => navigate("/")}
      onEnter={() => enter()}
      onAuthenticated={authenticated}
      onTry={() => navigate("/learn?practice=1")}
    />
  );
}
