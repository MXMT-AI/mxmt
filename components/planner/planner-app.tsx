"use client";

import { useState, useCallback } from "react";
import { useLang } from "@/components/language-provider/language-provider";
import type { Brand, CatalogUpload, CatalogItem, CartItem, PlannerSection } from "./planner-types";
import { UploadModal } from "./upload-modal/upload-modal";
import { BrandModal } from "./brand-modal/brand-modal";
import { PlannerDashboard } from "./planner-dashboard/planner-dashboard";
import { PlannerCatalog } from "./planner-catalog/planner-catalog";
import { PlannerDuplicates } from "./planner-duplicates/planner-duplicates";
import { PlannerCart } from "./planner-cart/planner-cart";
import { PlannerAiChat } from "./planner-ai-chat/planner-ai-chat";
import { PlannerBrands } from "./planner-brands/planner-brands";
import { usePlannerAi } from "./use-planner-ai";
import { PlannerToolbar } from "./planner-toolbar/planner-toolbar";
import { usePlannerCart } from "./use-planner-cart";
import { usePlannerData, type PlannerDataResource } from "./use-planner-data";
import { AlertPanel } from "@/components/ui/alert-panel/alert-panel";
import { Button } from "@/components/ui/button/button";
import { plannerDataErrors } from "./planner-data-copy";
import { useXlsxExport } from "@/components/ui/use-xlsx-export/use-xlsx-export";
import { buildPlannerOrderWorkbook } from "./planner-order-workbook";
import { calculatePlannerBudget } from "./calculate-planner-budget";
import { useToast } from "@/components/ui/toast/use-toast";
import { Toast } from "@/components/ui/toast/toast";
import { formatMessage } from "@/i18n/format-message";
import { plannerPlannerAppMessages as englishCopy } from "@/messages/en.json";
import { plannerPlannerAppMessages as ukrainianCopy } from "@/messages/uk.json";

export default function PlannerApp({
  initialBrands,
  initialCatalogs,
  initialCart,
}: {
  initialBrands: Brand[];
  initialCatalogs: CatalogUpload[];
  initialCart: CartItem[];
}) {
  const { lang } = useLang();
  const [section, setSection] = useState<PlannerSection>("dashboard");
  const {
    brands, catalogs, items, duplicates, filterBrand, filterCategory, filterSearch,
    setFilterBrand, setFilterCategory, setFilterSearch, loadItems, reloadBrands,
    scanDuplicates, refreshAfterUpload, errors: dataErrors, retry: retryData,
    itemsLoading, scanning, categories,
  } = usePlannerData(initialBrands, initialCatalogs, section);
  const { cart, addItem, removeFromCart, updateQty: updateCartQty, saveError, retrySave } = usePlannerCart(initialCart);
  const { message: toast, showToast } = useToast();

  const [uploadModal, setUploadModal] = useState(false);
  const [brandModal, setBrandModal] = useState<Brand | null | "new">(null);

  const { budgetStatus, totalBudget, totalSpent, totalCartItems } = calculatePlannerBudget(brands, cart);

  const fmt = (n: number) =>
    Number(n || 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 });

  const { messages: aiMessages, input: aiInput, setInput: setAiInput, loading: aiLoading, send: sendToAI } = usePlannerAi(lang, {
    brandCount: brands.length, itemCount: items.length, cart, budgetStatus,
    totalCartItems, totalSpent, fmt,
  });

  const addToCart = useCallback((item: CatalogItem, qty: number) => {
    if (addItem(item, qty)) showToast(formatMessage(ukrainianCopy.доданоДоЗамовлення, { name: item.name }));
  }, [addItem, showToast]);

  const findDuplicates = async () => {
    const groups = await scanDuplicates();
    if (!groups) return;
    setSection("duplicates");
    const message = groups.length === 1 ? ukrainianCopy.duplicateGroup : ukrainianCopy.duplicateGroups;
    showToast(formatMessage(message, { count: groups.length }));
  };

  const { exporting, error: exportError, exportExcel: exportPO } = useXlsxExport({
    title: () => `PO-${new Date().toISOString().split("T")[0]}`,
    disabled: cart.length === 0,
    buildWorkbook: xlsx => buildPlannerOrderWorkbook(xlsx, cart),
  });

  const completeBrandMutation = async (message: string) => {
    setBrandModal(null);
    await Promise.all([reloadBrands(), refreshAfterUpload()]);
    showToast(message);
  };

  return (
    <div className="flex flex-col h-full bg-(--bg)">
      <PlannerToolbar
        section={section}
        onSectionChange={setSection}
        totalCartItems={totalCartItems}
        totalSpent={totalSpent}
        totalBudget={totalBudget}
        fmt={fmt}
        loading={scanning}
        hasCartItems={cart.length > 0}
        onUpload={() => setUploadModal(true)}
        onScan={findDuplicates}
        onExport={exportPO}
        exporting={exporting}
        onAddBrand={() => setBrandModal("new")}
      />

      {exportError ? (
        <AlertPanel message={lang === "uk" ? ukrainianCopy.messageCouldNotCreateTheOrder : englishCopy.messageCouldNotCreateTheOrder}>
          <Button variant="report" onClick={exportPO} disabled={exporting || cart.length === 0}>{lang === "uk" ? ukrainianCopy.retryExport : englishCopy.retryExport}</Button>
        </AlertPanel>
      ) : null}

      {saveError ? (
        <AlertPanel message={lang === "uk" ? ukrainianCopy.messageCouldNotSaveTheOrder : englishCopy.messageCouldNotSaveTheOrder}>
          <Button variant="report" onClick={retrySave}>{lang === "uk" ? ukrainianCopy.retrySaving : englishCopy.retrySaving}</Button>
        </AlertPanel>
      ) : null}

      {(Object.keys(dataErrors) as PlannerDataResource[]).filter(resource => dataErrors[resource]).map(resource => (
        <AlertPanel key={resource} message={plannerDataErrors[lang][resource]}>
          <Button variant="report" onClick={() => retryData(resource)}>{lang === "uk" ? ukrainianCopy.retryRequest : englishCopy.retryRequest}</Button>
        </AlertPanel>
      ))}

      <div className="flex-1 overflow-auto p-6">
        {section === "dashboard" && (
          <PlannerDashboard brands={brands} catalogs={catalogs} budgetStatus={budgetStatus} cartLineCount={cart.length} totalBudget={totalBudget} totalSpent={totalSpent} totalCartItems={totalCartItems} fmt={fmt} />
        )}
        {section === "catalog" && (
          <PlannerCatalog
            brands={brands}
            items={items}
            categories={categories}
            loading={itemsLoading}
            filterBrand={filterBrand}
            filterCategory={filterCategory}
            filterSearch={filterSearch}
            setFilterBrand={setFilterBrand}
            setFilterCategory={setFilterCategory}
            setFilterSearch={setFilterSearch}
            onSearch={loadItems}
            addToCart={addToCart}
          />
        )}
        {section === "duplicates" && (
          <PlannerDuplicates groups={duplicates} addToCart={addToCart} />
        )}
        {section === "cart" && (
          <PlannerCart
            cart={cart}
            budgetStatus={budgetStatus}
            removeFromCart={removeFromCart}
            updateQty={updateCartQty}
            fmt={fmt}
          />
        )}
        {section === "ai" && (
          <PlannerAiChat messages={aiMessages} input={aiInput} loading={aiLoading} onInputChange={setAiInput} onSend={sendToAI} />
        )}
        {section === "brands" && (
          <PlannerBrands brands={brands} catalogs={catalogs} onEdit={(b) => setBrandModal(b)} fmt={fmt} />
        )}
      </div>

      {uploadModal && (
        <UploadModal
          brands={brands}
          onClose={() => setUploadModal(false)}
          onSuccess={async (msg) => {
            showToast(msg);
            setUploadModal(false);
            await refreshAfterUpload();
          }}
        />
      )}

      {brandModal && (
        <BrandModal
          brand={brandModal === "new" ? null : brandModal}
          onClose={() => setBrandModal(null)}
          onSave={() => completeBrandMutation(ukrainianCopy.брендЗбережено)}
          onDelete={() => completeBrandMutation(ukrainianCopy.брендВидалено)}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
