import { getEnv } from "@runspend/shared";

export function EnvironmentBanner() {
  const { RAILWAY_ENVIRONMENT_NAME } = getEnv();
  if (!RAILWAY_ENVIRONMENT_NAME || RAILWAY_ENVIRONMENT_NAME === "prod") {
    return null;
  }
  return (
    <div className="w-full bg-amber-500 text-black text-center text-xs font-medium py-1 px-2">
      Non-production environment:{" "}
      <span className="font-bold uppercase">{RAILWAY_ENVIRONMENT_NAME}</span>
    </div>
  );
}
