import { PendingLine } from "@/app/pending-line";

/** Inside the sheet, because the sheet is this segment's layout. */
export default function InterceptedCatalogueLoading() {
  return (
    <div className="px-6 py-5">
      <PendingLine />
    </div>
  );
}
