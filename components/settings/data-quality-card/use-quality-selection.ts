"use client";

import { useEffect, useState } from "react";
import { readQualitySelection, writeQualitySelection } from "@/lib/data-quality-navigation";

export function useQualitySelection() {
  const [selection, setSelection] = useState({ code: "", page: 1, search: "" });
  const [q, setQ] = useState("");

  useEffect(() => {
    const read = () => {
      const next = readQualitySelection(new URLSearchParams(window.location.search));
      setSelection({ code: next.code, page: next.page, search: next.q });
      setQ(next.q);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  function select(code: string, page = 1, search = selection.search) {
    setSelection({ code, page, search });
    const url = new URL(window.location.href);
    url.search = writeQualitySelection(url.searchParams, { code, q: search, page }).toString();
    window.history.replaceState(null, "", url);
  }

  return { ...selection, q, setQ, select };
}
