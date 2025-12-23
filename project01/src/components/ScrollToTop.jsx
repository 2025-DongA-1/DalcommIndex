import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, search } = useLocation();
  const navType = useNavigationType(); // "PUSH" | "POP" | "REPLACE"

  useEffect(() => {
    // ✅ 뒤로/앞으로(POP)일 땐 스크롤을 건드리지 않음 (Search에서 저장/복원하도록)
    if (navType === "POP") return;

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, search, navType]);

  return null;
}
