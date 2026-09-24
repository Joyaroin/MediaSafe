import { PendingLine } from "@/app/pending-line";
import { UpNextHeading } from "./up-next-heading";

/**
 * Up next while its reads are in flight: the same heading the page and its failure draw,
 * over a pending rail.
 */
export default function UpNextLoading() {
  return (
    <main className="flex w-full flex-1 flex-col">
      <UpNextHeading />

      <div className="px-gutter py-5">
        <PendingLine shape="rail" held />
      </div>
    </main>
  );
}
