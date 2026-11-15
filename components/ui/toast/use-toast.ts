"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setMessage(null);
    }, 3000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { message, showToast };
}
