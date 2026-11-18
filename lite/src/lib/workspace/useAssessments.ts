"use client";
import { useEffect, useState } from "react";
import { loadDb, type LocalAssessment } from "../local/store";
/** Assessments saved on this device (read after mount so server and client first render match). */
export function useAssessments(): LocalAssessment[] | null {
  const [list, setList] = useState<LocalAssessment[] | null>(null);
  useEffect(() => { setList(loadDb().assessments); const f = () => setList(loadDb().assessments); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, []);
  return list;
}
