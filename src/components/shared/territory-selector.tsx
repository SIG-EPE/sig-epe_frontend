"use client";

// -------------------------------------------------------
// TerritorySelector — Selector en cascada Región → Provincia → Distrito
// Componente reutilizable para toda la app SIG-EPE
// Estrategia: carga todos los territorios una vez, filtra en cliente.
// -------------------------------------------------------

import { useState, useEffect, useMemo, useRef } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTerritories } from "@/hooks/use-budget";

// -------------------------------------------------------
// Valor especial para "ninguno" — shadcn Select no acepta value=""
// -------------------------------------------------------

const NONE_VALUE = "__none__";

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface TerritorySelectorProps {
  /** ID del territorio seleccionado (puede ser región, provincia o distrito) */
  value?: string;
  /** Callback cuando cambia la selección — undefined si se deselecciona todo */
  onChange: (value: string | undefined) => void;
  /** Si el campo es obligatorio */
  required?: boolean;
  /** Deshabilitar todos los selects */
  disabled?: boolean;
  /** Mostrar label principal encima del grupo de selects */
  showLabel?: boolean;
  /** Clase CSS adicional para el contenedor */
  className?: string;
}

// -------------------------------------------------------
// TerritorySelector
// -------------------------------------------------------

export function TerritorySelector({
  value,
  onChange,
  required = false,
  disabled = false,
  showLabel = true,
  className,
}: TerritorySelectorProps) {
  // Cargamos todos los territorios de una sola vez para filtrar en cliente
  const { data: allTerritories, isLoading } = useTerritories();

  // Estado interno de los tres niveles
  const [regionId, setRegionId] = useState<string>("");
  const [provinceId, setProvinceId] = useState<string>("");
  const [districtId, setDistrictId] = useState<string>("");

  // Listas derivadas filtradas en cliente
  const regions = useMemo(
    () => allTerritories?.filter((t) => t.level === "REGION") ?? [],
    [allTerritories]
  );

  const provinces = useMemo(
    () =>
      regionId
        ? (allTerritories?.filter(
            (t) => t.level === "PROVINCIA" && t.parent_id === regionId
          ) ?? [])
        : [],
    [allTerritories, regionId]
  );

  const districts = useMemo(
    () =>
      provinceId
        ? (allTerritories?.filter(
            (t) => t.level === "DISTRITO" && t.parent_id === provinceId
          ) ?? [])
        : [],
    [allTerritories, provinceId]
  );

  // -------------------------------------------------------
  // Inicialización: cuando llega un `value` externo y ya cargaron los datos
  // detectamos el nivel y pre-poblamos los selects correctamente
  // -------------------------------------------------------

  // Inicialización: pre-poblar los selects cuando llega un value externo
  // Solo corre una vez cuando los datos están disponibles — no escucha cambios de value
  // para evitar bucle infinito (onChange -> value -> effect -> setState -> onChange)
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !value || !allTerritories || allTerritories.length === 0) return;
    initialized.current = true;

    const territory = allTerritories.find((t) => t.id === value);
    if (!territory) return;

    if (territory.level === "REGION") {
      setRegionId(territory.id);
      setProvinceId("");
      setDistrictId("");
    } else if (territory.level === "PROVINCIA") {
      setRegionId(territory.parent_id ?? "");
      setProvinceId(territory.id);
      setDistrictId("");
    } else if (territory.level === "DISTRITO") {
      const province = allTerritories.find((t) => t.id === territory.parent_id);
      setRegionId(province?.parent_id ?? "");
      setProvinceId(territory.parent_id ?? "");
      setDistrictId(territory.id);
    }
  }, [allTerritories, value]);

  // -------------------------------------------------------
  // Handlers
  // -------------------------------------------------------

  function handleRegionChange(val: string) {
    const newId = val === NONE_VALUE ? "" : val;
    setRegionId(newId);
    setProvinceId("");
    setDistrictId("");
    // Reportar el territorio más específico seleccionado
    onChange(newId || undefined);
  }

  function handleProvinceChange(val: string) {
    const newId = val === NONE_VALUE ? "" : val;
    setProvinceId(newId);
    setDistrictId("");
    // Si deseleccionamos provincia, reportar la región
    onChange(newId || regionId || undefined);
  }

  function handleDistrictChange(val: string) {
    const newId = val === NONE_VALUE ? "" : val;
    setDistrictId(newId);
    // Si deseleccionamos distrito, reportar la provincia (o región)
    onChange(newId || provinceId || regionId || undefined);
  }

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  return (
    <div className={className}>
      {showLabel && (
        <Label className="mb-2 block">
          Región / Provincia / Distrito
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Región */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ts-region" className="text-xs text-muted-foreground">
            Región
          </Label>
          <Select
            value={regionId || NONE_VALUE}
            onValueChange={handleRegionChange}
            disabled={disabled || isLoading}
          >
            <SelectTrigger id="ts-region" className="w-full">
              <SelectValue placeholder="Seleccionar región..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Todas las regiones</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Provincia */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ts-province" className="text-xs text-muted-foreground">
            Provincia
          </Label>
          <Select
            value={provinceId || NONE_VALUE}
            onValueChange={handleProvinceChange}
            disabled={disabled || isLoading || !regionId}
          >
            <SelectTrigger id="ts-province" className="w-full">
              <SelectValue placeholder="Seleccionar provincia..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Todas las provincias</SelectItem>
              {provinces.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Distrito */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ts-district" className="text-xs text-muted-foreground">
            Distrito
          </Label>
          <Select
            value={districtId || NONE_VALUE}
            onValueChange={handleDistrictChange}
            disabled={disabled || isLoading || !provinceId}
          >
            <SelectTrigger id="ts-district" className="w-full">
              <SelectValue placeholder="Seleccionar distrito..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Todos los distritos</SelectItem>
              {districts.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
