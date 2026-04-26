export interface AssignmentTruck {
  id: string;
  label: string | null;
  licensePlate: string | null;
  make: string | null;
}

export interface AssignmentRoute {
  id: string;
  label: string;
}

export interface AssignmentDay {
  dayOfWeek: number;
  truck: AssignmentTruck | null;
  routes: AssignmentRoute[];
}

export interface AssignmentsPayload {
  todayDayOfWeek: number;
  days: AssignmentDay[];
}

export type DriverAssignments = AssignmentsPayload;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const getDayName = (dayOfWeek: number): string => {
  return DAY_NAMES[dayOfWeek] || `Day ${dayOfWeek}`;
};

export const getTruckLabel = (truck: AssignmentTruck | null): string => {
  if (!truck) {
    return "No truck assigned";
  }

  return truck.label || truck.licensePlate || truck.make || "Assigned truck";
};

export const getRoutesSummary = (routes: AssignmentRoute[]): string => {
  const count = routes.length;
  if (count === 0) {
    return "No active routes";
  }

  return `${count} active route${count === 1 ? "" : "s"}`;
};
