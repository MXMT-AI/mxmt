"use client";

import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import { cn } from "@/lib/utils";
import type { Brand, CatalogItem } from "../planner-types";
import { PlannerCatalogCard } from "../planner-catalog-card/planner-catalog-card";
import { plannerPlannerCatalogMessages as ukrainianCopy } from "@/messages/uk.json";

const filterControl = cn(control, "w-auto min-h-0 focus:border-accent-cyan/40");

export function PlannerCatalog({
  brands, items, categories, loading, filterBrand, filterCategory, filterSearch,
  setFilterBrand, setFilterCategory, setFilterSearch, onSearch, addToCart,
}: {
  brands: Brand[];
  items: CatalogItem[];
  categories: string[];
  loading: boolean;
  filterBrand: string;
  filterCategory: string;
  filterSearch: string;
  setFilterBrand: (value: string) => void;
  setFilterCategory: (value: string) => void;
  setFilterSearch: (value: string) => void;
  onSearch: () => void;
  addToCart: (item: CatalogItem, qty: number) => void;
}) {
  return (
    <div>
      <div className="flex gap-3 mb-6 flex-wrap">
        <select aria-label={ukrainianCopy.ariaLabelБренд} value={filterBrand} onChange={event => setFilterBrand(event.target.value)} className={filterControl}>
          <option value="all">{ukrainianCopy.всіБренди}</option>
          {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
        <select aria-label={ukrainianCopy.ariaLabelКатегорія} value={filterCategory} onChange={event => setFilterCategory(event.target.value)} className={filterControl}>
          <option value="all">{ukrainianCopy.всіКатегорії}</option>
          {categories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
        <input
          type="text"
          aria-label={ukrainianCopy.ariaLabelПошукНазвиАбоАртикулу}
          value={filterSearch}
          onChange={event => setFilterSearch(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") onSearch(); }}
          placeholder={ukrainianCopy.placeholderПошукНазвиАртикулу}
          className={cn(filterControl, "flex-1 min-w-40 placeholder:text-(--subtle)")}
        />
        <Button variant="report" onClick={onSearch} disabled={loading} className="gap-2">
          {loading ? <RefreshCw size={13} aria-hidden="true" className="animate-spin" /> : <Search size={13} aria-hidden="true" />}{ukrainianCopy.шукати}</Button>
      </div>
      {items.length === 0 && !loading ? (
        <div className="text-center py-20 text-(--muted)">
          {brands.length === 0
            ? ukrainianCopy.спочаткуДодайтеБрендПотімЗавантажте
            : ukrainianCopy.товарівНеЗнайденоЗавантажтеКаталог}
        </div>
      ) : null}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {items.map(item => <PlannerCatalogCard key={item.id} item={item} addToCart={addToCart} />)}
      </div>
    </div>
  );
}
