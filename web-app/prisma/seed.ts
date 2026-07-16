import { Category, PrismaClient, Severity, ShipmentStatus } from "@prisma/client";

const prisma = new PrismaClient();

const ACTOR = "Dispatcher_System";

interface SeedException {
  severity: Severity;
  category: Category;
  resolved: boolean;
  rawInput: string;
  actionPlan: string;
  notificationText: string;
}

interface SeedShipment {
  trackingNumber: string;
  customerName: string;
  destinationCity: string;
  status: ShipmentStatus;
  exceptions?: SeedException[];
}

// Lean sample set that still covers all dashboard/state-machine use-cases.
const SHIPMENTS: SeedShipment[] = [
  {
    trackingNumber: "LB-240001",
    customerName: "Ahmad Khalil",
    destinationCity: "Beirut",
    status: ShipmentStatus.DISPATCHED,
  },
  {
    trackingNumber: "LB-240002",
    customerName: "Elie Saad",
    destinationCity: "Jounieh",
    status: ShipmentStatus.IN_TRANSIT,
  },
  {
    trackingNumber: "LB-240003",
    customerName: "Rami Haddad",
    destinationCity: "Zahle",
    status: ShipmentStatus.HALTED,
    exceptions: [
      {
        severity: Severity.HIGH,
        category: Category.VEHICLE_ISSUE,
        resolved: false,
        rawInput:
          "el van 3etlit 3a tari2 Zahle, battery mfassakha w ma fini kammel",
        actionPlan:
          "**Recommended Action Plan — Vehicle Issue (HIGH)**\n\n1. Dispatch the nearest backup vehicle to recover the parcels on board.\n2. Move the driver's remaining stops to the relief route.\n3. Log the vehicle fault with the fleet team for inspection.\n\n**ETA impact:** +2–4 hrs (same-day at risk)",
        notificationText:
          "Hi! There's a short delay with your delivery due to a vehicle issue on our side. A backup courier is taking over and we'll update you with a new ETA shortly. Thank you for your patience.",
      },
    ],
  },
  {
    trackingNumber: "LB-240004",
    customerName: "Nour Mansour",
    destinationCity: "Tripoli",
    status: ShipmentStatus.HALTED,
    exceptions: [
      {
        severity: Severity.CRITICAL,
        category: Category.WEATHER,
        resolved: false,
        rawInput:
          "fi 3asfe w shté ktir 3a Tripoli, el tari2 ma2tou3 w khatar 3al driver",
        actionPlan:
          "**Recommended Action Plan — Weather Disruption (CRITICAL)**\n\n1. Pause the affected route until the road/weather advisory clears.\n2. Re-sequence safe stops and shift exposed stops to the next slot.\n3. Notify impacted customers proactively about the delay.\n\n**ETA impact:** Next-day reschedule likely",
        notificationText:
          "[Priority] Hi! Severe weather is affecting deliveries in your area, so your parcel may arrive later than planned. We're prioritising safety and will keep you posted. Thanks for understanding.",
      },
    ],
  },
  {
    trackingNumber: "LB-240005",
    customerName: "Maya Aoun",
    destinationCity: "Saida",
    status: ShipmentStatus.IN_TRANSIT,
    exceptions: [
      {
        severity: Severity.LOW,
        category: Category.CUSTOMER_ABSENT,
        resolved: true,
        rawInput: "zboun ma kén mawjoud awwal marra, rje3na ba3den w sallamna",
        actionPlan:
          "**Recommended Action Plan — Customer Absent (LOW)**\n\n1. Attempt a call-back to the customer on the registered number.\n2. Send the rescheduling SMS with a self-service delivery window link.\n3. Hold the parcel at the local hub for one (1) retry before return.\n\n**ETA impact:** +30–60 min (minor delay)",
        notificationText:
          "Hi! We tried to deliver your parcel but couldn't reach you. Reply with a convenient time and we'll redeliver. We'll hold it safely at your local hub in the meantime.",
      },
    ],
  },
  {
    trackingNumber: "LB-240006",
    customerName: "Hassan Fakih",
    destinationCity: "Tyre",
    status: ShipmentStatus.DELIVERED,
  },
];

async function main() {
  console.log("Resetting existing data…");
  // Order matters because of FK constraints: logs -> exceptions -> shipments.
  await prisma.auditLog.deleteMany();
  await prisma.exception.deleteMany();
  await prisma.shipment.deleteMany();

  console.log(`Seeding ${SHIPMENTS.length} shipments…`);

  let exceptionCount = 0;

  for (const seed of SHIPMENTS) {
    const { exceptions, ...shipmentData } = seed;

    const shipment = await prisma.shipment.create({
      data: shipmentData,
    });

    // Audit the initial shipment creation so the activity feed is populated.
    await prisma.auditLog.create({
      data: {
        entityType: "SHIPMENT",
        entityId: shipment.id,
        action: "SHIPMENT_CREATED",
        oldState: null,
        newState: shipment.status,
        changedBy: ACTOR,
      },
    });

    for (const exceptionSeed of exceptions ?? []) {
      const exception = await prisma.exception.create({
        data: {
          shipmentId: shipment.id,
          severity: exceptionSeed.severity,
          category: exceptionSeed.category,
          resolved: exceptionSeed.resolved,
          rawInput: exceptionSeed.rawInput,
          actionPlan: exceptionSeed.actionPlan,
          notificationText: exceptionSeed.notificationText,
        },
      });
      exceptionCount += 1;

      await prisma.auditLog.create({
        data: {
          exceptionId: exception.id,
          entityType: "EXCEPTION",
          entityId: exception.id,
          action: "EXCEPTION_CREATED",
          oldState: null,
          newState: `${exception.resolved ? "resolved" : "unresolved"} (${exception.severity}/${exception.category})`,
          changedBy: ACTOR,
        },
      });
    }
  }

  console.log(
    `Done. Seeded ${SHIPMENTS.length} shipments and ${exceptionCount} exceptions.`,
  );
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
