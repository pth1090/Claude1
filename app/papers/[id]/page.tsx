import { notFound } from "next/navigation";
import { getPaperById } from "@/db/database";
import { PaperDetail } from "@/components/PaperDetail";

interface Props {
  params: { id: string };
}

export default function PaperPage({ params }: Props) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const paper = getPaperById(id);
  if (!paper) notFound();

  return <PaperDetail paper={paper} />;
}
