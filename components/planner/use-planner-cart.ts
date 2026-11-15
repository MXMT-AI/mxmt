"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { savePlannerCart } from "@/lib/client/planner-cart-request";
import { PlannerCartSaver } from "@/lib/client/planner-cart-saver";
import type { CartItem, CatalogItem } from "./planner-types";
import { addPlannerCartItem, removePlannerCartItem, updatePlannerCartQuantity } from "./planner-cart-operations";

export function usePlannerCart(initialCart: CartItem[]) {
  const [cart, setCart] = useState(initialCart);
  const [saveError, setSaveError] = useState(false);
  const current = useRef(initialCart);
  const mounted = useRef(false);
  const saver = useRef<PlannerCartSaver | null>(null);
  if (!saver.current) {
    saver.current = new PlannerCartSaver(savePlannerCart, error => {
      if (mounted.current) setSaveError(error);
    });
  }

  useEffect(() => {
    mounted.current = true;
    const flush = () => { void saver.current!.flush(true); };
    window.addEventListener("pagehide", flush);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const change = useCallback((transform: (items: CartItem[]) => CartItem[]) => {
    const next = transform(current.current);
    if (next === current.current) return false;
    current.current = next;
    setCart(next);
    saver.current!.schedule(next);
    return true;
  }, []);
  const addItem = useCallback((item: CatalogItem, qty: number) => change(items => addPlannerCartItem(items, item, qty)), [change]);
  const removeFromCart = useCallback((id: string) => { change(items => removePlannerCartItem(items, id)); }, [change]);
  const updateQty = useCallback((id: string, qty: number) => { change(items => updatePlannerCartQuantity(items, id, qty)); }, [change]);
  const retrySave = useCallback(() => { void saver.current!.flush(); }, []);

  return { cart, addItem, removeFromCart, updateQty, saveError, retrySave };
}
