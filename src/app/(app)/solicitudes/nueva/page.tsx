import { Construction } from "lucide-react";

export default function NuevaSolicitudPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <Construction className="h-12 w-12" />
      <p className="text-lg font-medium">Estamos trabajando en esto</p>
      <p className="text-sm">Esta sección estará disponible próximamente.</p>
    </div>
  );
}
