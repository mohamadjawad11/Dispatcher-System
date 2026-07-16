import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Severity, ShipmentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

const SHIPMENT_STATUS_VARIANT: Record<ShipmentStatus, BadgeVariant> = {
  [ShipmentStatus.HALTED]: "destructive",
  [ShipmentStatus.DELIVERED]: "success",
  [ShipmentStatus.IN_TRANSIT]: "warning",
  [ShipmentStatus.DISPATCHED]: "secondary",
};

const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  [ShipmentStatus.HALTED]: "Halted",
  [ShipmentStatus.DELIVERED]: "Delivered",
  [ShipmentStatus.IN_TRANSIT]: "In transit",
  [ShipmentStatus.DISPATCHED]: "Dispatched",
};

const SEVERITY_VARIANT: Record<Severity, BadgeVariant> = {
  [Severity.CRITICAL]: "destructive",
  [Severity.HIGH]: "warning",
  [Severity.LOW]: "secondary",
};


export function ShipmentStatusBadge({
  status,
  className,
}: {
  status: ShipmentStatus;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={SHIPMENT_STATUS_VARIANT[status]} className={cn(className)}>
          {SHIPMENT_STATUS_LABEL[status]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {status === ShipmentStatus.HALTED
          ? "This shipment is paused until exceptions are resolved or reassigned."
          : status === ShipmentStatus.IN_TRANSIT
            ? "The shipment is moving through the route and can still receive exception updates."
            : status === ShipmentStatus.DISPATCHED
              ? "The shipment has left dispatch and is waiting to be scanned into transit."
              : "The shipment has been delivered and can no longer receive new exceptions."}
      </TooltipContent>
    </Tooltip>
  );
}

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={SEVERITY_VARIANT[severity]} className={cn(className)}>
          {severity}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {severity === Severity.CRITICAL
          ? "Critical issues usually halt the shipment and need immediate action."
          : severity === Severity.HIGH
            ? "High severity issues are important enough to halt the shipment in the workflow."
            : "Low severity issues are useful context but usually do not stop the route."}
      </TooltipContent>
    </Tooltip>
  );
}

export function ResolvedBadge({
  resolved,
  className,
}: {
  resolved: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={resolved ? "success" : "warning"}
          className={cn("font-medium", className)}
        >
          {resolved ? "Resolved" : "Open"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {resolved
          ? "The issue has been closed and can release the shipment if no other open items remain."
          : "Still open — the shipment may be paused on this until it's resolved."}
      </TooltipContent>
    </Tooltip>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  VEHICLE_ISSUE: "🚐 Vehicle Issue",
  CUSTOMER_ABSENT: "🏠 Customer Absent",
  WEATHER: "⛈️ Weather",
};

const CATEGORY_DESCRIPTION: Record<string, string> = {
  VEHICLE_ISSUE: "Vehicle breakdown, mechanical failure, or transport issue",
  CUSTOMER_ABSENT: "Recipient unavailable — reschedule delivery needed",
  WEATHER: "Severe weather — safety risk or road closure",
};

export function CategoryBadge({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn(className)}>
          {CATEGORY_LABEL[category] ?? category}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {CATEGORY_DESCRIPTION[category] ?? "Exception category."}
      </TooltipContent>
    </Tooltip>
  );
}
