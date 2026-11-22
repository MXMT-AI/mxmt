import type { CheckCode } from "./contract";
import { connectorsCheckCopyMessages as englishCopy } from "@/messages/en.json";
import { connectorsCheckCopyMessages as ukrainianCopy } from "@/messages/uk.json";
export function connectorCheckLabels(
  lang: "uk" | "en",
): Record<CheckCode, string> {
  const uk = lang === "uk";
  return {
    OK: uk ? ukrainianCopy.oKAccessConfirmed : englishCopy.oKAccessConfirmed,
    NOT_CONFIGURED: uk ? ukrainianCopy.nOTCONFIGURED : englishCopy.nOTCONFIGURED,
    AUTH_FAILED: uk
      ? ukrainianCopy.aUTHFAILEDCheckTheKeyAndRead
      : englishCopy.aUTHFAILEDCheckTheKeyAndRead,
    RATE_LIMITED: uk
      ? ukrainianCopy.rATELIMITEDRateLimitReachedRetryLater
      : englishCopy.rATELIMITEDRateLimitReachedRetryLater,
    TIMEOUT: uk ? ukrainianCopy.tIMEOUTConnectionTimedOut : englishCopy.tIMEOUTConnectionTimedOut,
    NETWORK_ERROR: uk ? ukrainianCopy.nETWORKERRORCouldNotConnect : englishCopy.nETWORKERRORCouldNotConnect,
    INVALID_RESPONSE: uk
      ? ukrainianCopy.iNVALIDRESPONSESourceResponseNeedsVerification
      : englishCopy.iNVALIDRESPONSESourceResponseNeedsVerification,
    RESPONSE_TOO_LARGE: uk
      ? ukrainianCopy.rESPONSETOOLARGEResponseExceedsTheCheckSize
      : englishCopy.rESPONSETOOLARGEResponseExceedsTheCheckSize,
  };
}
