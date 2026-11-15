import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UploadModal } from "@/components/planner/upload-modal/upload-modal";
import { BrandModal } from "@/components/planner/brand-modal/brand-modal";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Button } from "@/components/ui/button/button";
import type { Brand } from "@/components/planner/planner-types";
const state = vi.hoisted(() => ({ values: [] as any[], index: 0, lock: { current: false } }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: (initial: unknown) => {
  const index = state.index++;
  if (!(index in state.values)) state.values[index] = initial;
  return [state.values[index], (next: any) => { state.values[index] = typeof next === "function" ? next(state.values[index]) : next; }];
}, useRef: () => state.lock }));
const brand: Brand = { id: "brand", name: "Demo", budget: 1200, paymentDays: 30, currency: "EUR", country: "Italy", contact: "demo@example.test", leadTimeDays: 28, moq: 1 };
const onClose = vi.fn(), onSave = vi.fn(), onDelete = vi.fn(), onSuccess = vi.fn();
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function upload(brands = [brand]) { state.index = 0; return UploadModal({ brands, onClose, onSuccess }); }
function edit(value: Brand | null = brand) { state.index = 0; return BrandModal({ brand: value, onClose, onSave, onDelete }); }
function choose(file: File, brands = [brand]) { nodes(upload(brands)).find(n => n.props.type === "file")!.props.onChange({ currentTarget: { files: [file], value: file.name } }); }
beforeEach(() => {
  state.values = []; state.lock.current = false; vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => Response.json(
    String(url).includes("catalogs/upload") ? { itemCount: 2 } : init?.method === "DELETE" ? { ok: true } : { id: "brand" },
  )));
});
afterEach(() => vi.unstubAllGlobals());
it.each([0, 4 * 1024 * 1024 + 1])("rejects a catalog with size %s without a request", size => {
  const file = new File([], "catalog.csv"); Object.defineProperty(file, "size", { value: size });
  choose(file);
  expect(fetch).not.toHaveBeenCalled();
  expect(nodes(upload()).some(n => n.type === "p" && n.props.children === "Файл має бути не більшим за 4 МБ")).toBe(true);
});
it("requires a brand before uploading", () => {
  choose(new File(["sku"], "catalog.csv"), []);
  expect(fetch).not.toHaveBeenCalled();
  expect(nodes(upload([])).some(n => n.props.children === "Select a brand first")).toBe(true);
});
it("uploads brand, season and file and invokes success", async () => {
  const file = new File(["sku"], "catalog.csv");
  choose(file);
  await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith("✓ Uploaded 2 items"));
  const [url, request] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("/api/planner/catalogs/upload");
  expect(request!.method).toBe("POST");
  const body = request!.body as FormData;
  expect(body.get("brandId")).toBe("brand");
  expect(body.get("season")).toBe("SS26");
  expect((body.get("file") as File).name).toBe("catalog.csv");
});
it.each([null, brand])("saves a new or existing brand with the original payload: %j", async value => {
  if (!value) {
    const field = nodes(edit(null)).find(n => n.props.placeholder === "Prada S.p.A.")!;
    field.props.onChange({ target: { value: "New brand" } });
  }
  await nodes(edit(value)).find(n => n.type === Button && n.props.variant === "accent")!.props.onClick();
  const [url, request] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe(value ? "/api/planner/brands/brand" : "/api/planner/brands");
  expect(request!.method).toBe(value ? "PUT" : "POST");
  expect(JSON.parse(request!.body as string)).toEqual(value
    ? { name: "Demo", budget: 1200, paymentDays: 30, currency: "EUR", country: "Italy", contact: "demo@example.test", leadTimeDays: 28, moq: 1 }
    : { name: "New brand", budget: 0, paymentDays: 30, currency: "EUR", country: null, contact: null, leadTimeDays: 28, moq: 1 });
  expect(onSave).toHaveBeenCalledOnce();
});
it("uses the common dialog close action and forwards successful deletion", async () => {
  const modal = edit();
  expect(modal.type).toBe(Dialog);
  expect(modal.props.closeLabel).toBe("Закрити");
  modal.props.onClose();
  expect(onClose).toHaveBeenCalledOnce();
  await nodes(modal).find(n => n.props["aria-label"] === "Видалити бренд")!.props.onClick();
  expect(onDelete).toHaveBeenCalledWith("brand");
  expect(upload().type).toBe(Dialog);
});

it("retains edited fields on save failure and invokes success only after a successful retry", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ code: "BRAND_ALREADY_EXISTS", error: "Conflict" }, { status: 409 }));
  nodes(edit()).find(n => n.props.placeholder === "Prada S.p.A.")!.props.onChange({ target: { value: "Edited name" } });
  await nodes(edit()).find(n => n.type === Button && n.props.variant === "accent")!.props.onClick();
  expect(onSave).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(nodes(edit()).find(n => n.props.placeholder === "Prada S.p.A.")!.props.value).toBe("Edited name");
  expect(nodes(edit()).find(n => n.props.role === "alert")!.props.children).toContain("вже існує");
  await nodes(edit()).find(n => n.type === Button && n.props.variant === "accent")!.props.onClick();
  expect(onSave).toHaveBeenCalledOnce();
});

it.each(["FORBIDDEN", "BRAND_HAS_ALIASES"])("keeps the modal open when deletion fails with %s", async code => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ code, error: "Failed" }, { status: code === "FORBIDDEN" ? 403 : 409 }));
  await nodes(edit()).find(n => n.props["aria-label"] === "Видалити бренд")!.props.onClick();
  expect(onDelete).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(nodes(edit()).find(n => n.props.role === "alert")!.props.children).toContain(code === "FORBIDDEN" ? "прав" : "псевдоніми");
});

it("blocks concurrent saves and deletion and disables closing while a request is pending", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const modal = edit();
  const save = nodes(modal).find(n => n.type === Button && n.props.variant === "accent")!;
  const pending = save.props.onClick();
  await save.props.onClick();
  await nodes(modal).find(n => n.props["aria-label"] === "Видалити бренд")!.props.onClick();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(edit().props.closeDisabled).toBe(true);
  expect(nodes(edit()).find(n => n.type === "fieldset")!.props.disabled).toBe(true);
  finish(Response.json({ id: "brand" })); await pending;
  expect(onSave).toHaveBeenCalledOnce();
  expect(edit().props.closeDisabled).toBe(false);
});

it("handles network errors without raw details and allows another attempt", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("private database details"));
  await nodes(edit()).find(n => n.type === Button && n.props.variant === "accent")!.props.onClick();
  expect(onSave).not.toHaveBeenCalled();
  expect(nodes(edit()).find(n => n.props.role === "alert")!.props.children).toBe("Не вдалося виконати операцію з брендом. Спробуйте ще раз.");
  await nodes(edit()).find(n => n.type === Button && n.props.variant === "accent")!.props.onClick();
  expect(onSave).toHaveBeenCalledOnce();
});

it("keeps upload errors recoverable and resets the input for selecting the same file again", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "Upload failed" }, { status: 500 }));
  const file = new File(["sku"], "catalog.csv");
  const picker = { files: [file], value: "catalog.csv" };
  nodes(upload()).find(n => n.props.type === "file")!.props.onChange({ currentTarget: picker });
  expect(picker.value).toBe("");
  await vi.waitFor(() => expect(nodes(upload()).some(n => n.props.role === "alert")).toBe(true));
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(nodes(upload()).find(n => n.props.placeholder === "SS26")!.props.value).toBe("SS26");
  choose(file);
  await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith("✓ Uploaded 2 items"));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("blocks duplicate uploads and locks fields and close while uploading", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const file = new File(["sku"], "catalog.csv");
  const modal = upload();
  const chooseFile = nodes(modal).find(n => n.props.type === "file")!.props.onChange;
  chooseFile({ currentTarget: { files: [file], value: file.name } });
  chooseFile({ currentTarget: { files: [file], value: file.name } });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(upload().props.closeDisabled).toBe(true);
  expect(nodes(upload()).find(n => n.type === "fieldset")!.props.disabled).toBe(true);
  expect(nodes(upload()).find(n => n.props.type === "file")!.props.disabled).toBe(true);
  finish(Response.json({ itemCount: 2 }));
  await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  expect(upload().props.closeDisabled).toBe(false);
});

it("does not show upload success for a malformed response", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({}));
  choose(new File(["sku"], "catalog.csv"));
  await vi.waitFor(() => expect(nodes(upload()).some(n => n.props.role === "alert")).toBe(true));
  expect(onSuccess).not.toHaveBeenCalled();
});
