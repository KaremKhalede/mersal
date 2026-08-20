"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { PERMISSION_RESOURCES, RESOURCE_LABELS, ACTION_LABELS, type Permissions, type PermissionResource } from "@/lib/enums";
import { cn } from "@/lib/utils";

export function PermissionGrid({ defaultPermissions = {}, readOnly = false }: { defaultPermissions?: Permissions; readOnly?: boolean }) {
  return (
    <div className="space-y-3 max-h-80 overflow-y-auto rounded-lg border p-3">
      {(Object.keys(PERMISSION_RESOURCES) as PermissionResource[]).map((resource) => (
        <div key={resource} data-resource={resource} className="flex items-start justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
          <p className="w-32 shrink-0 text-sm font-medium pt-1">{RESOURCE_LABELS[resource]}</p>
          <div className="flex flex-wrap gap-3 flex-1">
            {PERMISSION_RESOURCES[resource].map((action) => (
              <label key={action} className={cn("flex items-center gap-1.5 text-xs", readOnly ? "cursor-default" : "cursor-pointer")}>
                <Checkbox
                  name={`perm_${resource}`}
                  value={action}
                  defaultChecked={defaultPermissions[resource]?.includes(action)}
                  disabled={readOnly}
                />
                {ACTION_LABELS[action] ?? action}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
