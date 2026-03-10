function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export type DonateResult =
  | "opened_web"
  | "purchased"
  | "cancelled"
  | "unavailable"
  | "failed";

export async function startDonation({
  webUrl,
  appUserId: _appUserId,
}: {
  webUrl: string;
  appUserId: string | null;
}): Promise<DonateResult> {
  openExternal(webUrl);
  return "opened_web";
}
