"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPlannerItems, fetchPlannerBrands, fetchPlannerCatalogs, fetchPlannerDuplicates } from "@/lib/client/planner-data-request";
import type { Brand, CatalogUpload, CatalogItem, PlannerSection } from "./planner-types";

export type PlannerDataResource = "items" | "duplicates" | "brands" | "catalogs";

export function usePlannerData(initialBrands: Brand[], initialCatalogs: CatalogUpload[], section: PlannerSection) {
  const [brands, setBrands] = useState(initialBrands);
  const [catalogs, setCatalogs] = useState(initialCatalogs);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [duplicates, setDuplicates] = useState<CatalogItem[][]>([]);
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [loading, setLoading] = useState<Partial<Record<PlannerDataResource, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<PlannerDataResource, boolean>>>({});
  const requests = useRef<Partial<Record<PlannerDataResource, AbortController>>>({});

  const run = useCallback(async <T,>(resource: PlannerDataResource, load: (signal: AbortSignal) => Promise<T>, commit: (data: T) => void): Promise<T | undefined> => {
    requests.current[resource]?.abort();
    const controller = new AbortController();
    requests.current[resource] = controller;
    setLoading(previous => ({ ...previous, [resource]: true }));
    setErrors(previous => ({ ...previous, [resource]: false }));
    try {
      const data = await load(controller.signal);
      if (controller.signal.aborted) return;
      commit(data);
      return data;
    } catch {
      if (!controller.signal.aborted) setErrors(previous => ({ ...previous, [resource]: true }));
    } finally {
      if (!controller.signal.aborted) setLoading(previous => ({ ...previous, [resource]: false }));
    }
  }, []);

  const loadItems = useCallback(() => run("items", signal => fetchPlannerItems({ brandId: filterBrand, category: filterCategory, search: filterSearch }, signal), setItems), [run, filterBrand, filterCategory, filterSearch]);
  const reloadBrands = useCallback(() => run("brands", fetchPlannerBrands, setBrands), [run]);
  const reloadCatalogs = useCallback(() => run("catalogs", fetchPlannerCatalogs, setCatalogs), [run]);
  const scanDuplicates = useCallback(() => run("duplicates", fetchPlannerDuplicates, setDuplicates), [run]);

  useEffect(() => {
    if (section === "catalog") void loadItems();
    return () => { requests.current.items?.abort(); };
  }, [section, loadItems]);

  useEffect(() => () => {
    for (const request of Object.values(requests.current)) request?.abort();
  }, []);

  const refreshAfterUpload = useCallback(async () => {
    await Promise.all([reloadCatalogs(), loadItems()]);
  }, [reloadCatalogs, loadItems]);

  function retry(resource: PlannerDataResource) {
    const reload = { items: loadItems, duplicates: scanDuplicates, brands: reloadBrands, catalogs: reloadCatalogs };
    void reload[resource]();
  }

  return {
    brands, catalogs, items, duplicates, filterBrand, filterCategory, filterSearch,
    setFilterBrand, setFilterCategory, setFilterSearch, loadItems, reloadBrands,
    scanDuplicates, refreshAfterUpload, errors, retry,
    itemsLoading: loading.items ?? false,
    scanning: loading.duplicates ?? false,
    categories: [...new Set(items.map(item => item.category))].sort(),
  };
}
