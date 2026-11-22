import { plannerBrandModalCopyMessages as ukrainianCopy } from "@/messages/uk.json";

export const brandMutationErrors: Record<string, string> = {
  BRAND_ALREADY_EXISTS: ukrainianCopy.bRANDALREADYEXISTSБрендІзТакоюНазвоюВже,
  FORBIDDEN: ukrainianCopy.fORBIDDENНедостатньоПравДляЦієїОперації,
  BRAND_HAS_ALIASES: ukrainianCopy.bRANDHASALIASESСпочаткуВидалітьПривЯзаніПсевдонімиБренду,
  VALIDATION_ERROR: ukrainianCopy.vALIDATIONERRORПеревіртеВведеніДаніТаСпробуйте,
  NOT_FOUND: ukrainianCopy.nOTFOUNDБрендНеЗнайденоОновітьСписок,
};

export function brandMutationErrorMessage(code: string) {
  return Object.hasOwn(brandMutationErrors, code)
    ? brandMutationErrors[code]
    : ukrainianCopy.неВдалосяВиконатиОпераціюЗ;
}
