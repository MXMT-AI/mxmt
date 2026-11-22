"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Field } from "@/components/ui/field/field";
import { plannerControl, plannerField } from "../planner-form-styles";
import type { Brand } from "../planner-types";
import { uploadPlannerCatalog } from "@/lib/client/planner-upload-request";

import { Upload } from "lucide-react";
import { plannerUploadModalMessages as englishCopy } from "@/messages/en.json";
import { plannerUploadModalMessages as ukrainianCopy } from "@/messages/uk.json";

const MAX_CATALOG_UPLOAD_BYTES = 4 * 1024 * 1024;

export function UploadModal({ brands, onClose, onSuccess }: {
  brands: Brand[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [season, setSeason] = useState("SS26");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function handleFile(file: File) {
    if (inFlight.current) return;
    if (!brandId) { setError(englishCopy.selectABrandFirst); return; }
    if (file.size === 0 || file.size > MAX_CATALOG_UPLOAD_BYTES) {
      setError(ukrainianCopy.файлМаєБутиНеБільшим);
      return;
    }
    inFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const itemCount = await uploadPlannerCatalog(file, brandId, season);
      onSuccess(`✓ Uploaded ${itemCount} items`);
    } catch {
      setError(ukrainianCopy.неВдалосяЗавантажитиКаталогСпробуйте);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <Dialog title={ukrainianCopy.titleЗавантажитиКаталог} closeLabel={ukrainianCopy.closeLabelЗакрити} onClose={onClose} closeDisabled={loading} className="max-w-md">
      <div className="p-7">
        <p className="text-(--muted) text-xs font-mono mb-4">{ukrainianCopy.колонкиSKUNameCategoryColor}</p>

        <fieldset disabled={loading} className="space-y-3 mb-5">
          <Field label={ukrainianCopy.labelБренд} className={plannerField}>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className={plannerControl}
            >
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label={ukrainianCopy.labelСезон} className={plannerField}>
            <input
              type="text"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className={plannerControl}
              placeholder={englishCopy.placeholderSS26}
            />
          </Field>
        </fieldset>

        <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${loading ? "opacity-50 cursor-not-allowed" : "border-white/10 hover:border-accent-cyan/40"}`}>
          <Upload aria-hidden="true" size={24} className="text-(--muted) mb-2" />
          <span className="text-sm text-(--muted)">{loading ? ukrainianCopy.завантажуємо : ukrainianCopy.оберітьФайлXlsxXls}</span>
          <span className="text-[10px] text-(--subtle) mt-1">{ukrainianCopy.до4МБІ5}</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={loading}
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void handleFile(file);
            }} />
        </label>

        {error && <p role="alert" className="text-red-400 text-sm mt-3">{error}</p>}
      </div>
    </Dialog>
  );
}
