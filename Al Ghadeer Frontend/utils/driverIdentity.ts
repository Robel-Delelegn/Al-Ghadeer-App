type DriverIdentityUser =
  | {
      id?: string | null;
    }
  | null
  | undefined;

type DriverIdentityDriver =
  | {
      id?: string | null;
      driver_number?: string | null;
    }
  | null
  | undefined;

const normalizeId = (value?: string | null): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getDriverRequestId = ({
  user,
  currentDriver,
  fallbackDriverId,
}: {
  user?: DriverIdentityUser;
  currentDriver?: DriverIdentityDriver;
  fallbackDriverId?: string | null;
}): string | null => {
  const authenticatedUserId = normalizeId(user?.id);
  if (authenticatedUserId) {
    return authenticatedUserId;
  }

  const currentDriverId = normalizeId(currentDriver?.id);
  const driverNumber = normalizeId(currentDriver?.driver_number);

  // Never promote a display number into an API identity header.
  if (currentDriverId && driverNumber && currentDriverId !== driverNumber) {
    return currentDriverId;
  }

  return normalizeId(fallbackDriverId);
};

export const appendDriverIdHeader = (
  headers: Record<string, string>,
  sources: {
    user?: DriverIdentityUser;
    currentDriver?: DriverIdentityDriver;
    fallbackDriverId?: string | null;
  },
): Record<string, string> => {
  const driverId = getDriverRequestId(sources);
  if (!driverId) {
    return headers;
  }

  return {
    ...headers,
    "X-Driver-Id": driverId,
  };
};
