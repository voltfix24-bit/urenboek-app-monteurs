import { toast } from "sonner";

export async function query<T>(
  promise: Promise<{ data: T | null; error: any }>
): Promise<T | null> {
  const { data, error } = await promise;
  if (error) {
    toast.error("Er ging iets mis. Probeer opnieuw.");
    console.error(error);
    return null;
  }
  return data;
}

export async function mutate(
  promise: Promise<{ error: any }>
): Promise<boolean> {
  const { error } = await promise;
  if (error) {
    toast.error("Er ging iets mis. Probeer opnieuw.");
    console.error(error);
    return false;
  }
  return true;
}
