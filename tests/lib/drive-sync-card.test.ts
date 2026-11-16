import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import DriveSyncCard from "@/components/settings/drive-sync-card/drive-sync-card";

it.each(["uk", "en"] as const)("keeps access guidance and sync availability specific to the mode in %s", lang => {
  const render = (driveMode: "none" | "service_account" | "public_link") => renderToStaticMarkup(
    createElement(DriveSyncCard, { driveMode, lang, lastSync: null }),
  );
  const privateHtml = render("service_account");
  expect(privateHtml).toContain(lang === "uk" ? "Файл може залишатись закритим" : "File can stay private");
  expect(privateHtml).not.toContain(lang === "uk" ? "Дані доступні будь-кому" : "Data is accessible to anyone");
  expect(privateHtml).toContain(lang === "uk" ? "Синхронізувати" : "Sync now");
  expect(privateHtml).toContain('type="button"');

  const publicHtml = render("public_link");
  expect(publicHtml).toContain(lang === "uk" ? "Дані доступні будь-кому" : "Data is accessible to anyone");
  expect(publicHtml).not.toContain(lang === "uk" ? "Файл може залишатись закритим" : "File can stay private");
  expect(publicHtml).toContain(lang === "uk" ? "Синхронізувати" : "Sync now");

  const unconfiguredHtml = render("none");
  expect(unconfiguredHtml).toContain(lang === "uk" ? "Спочатку збережіть посилання" : "Save the URL");
  expect(unconfiguredHtml).not.toContain("<button");
});
